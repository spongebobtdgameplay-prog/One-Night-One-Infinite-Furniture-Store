import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Physics = window.__STORE_PROCEDURAL_PHYSICS__ || null;
if (!Game?.Scene || !Game?.Camera) throw new Error("Game must load before carpet step animation.");

const Rugs = new Map();
const LastPosition = new THREE.Vector3();
const TempVelocity = new THREE.Vector3();
const GroundRaycaster = new THREE.Raycaster();
const GroundRayOrigin = new THREE.Vector3();
const GroundRayDirection = new THREE.Vector3(0, -1, 0);
const GroundHits = [];

let HasLastPosition = false;
let CurrentRugId = "";
let StepStartedAt = -Infinity;
let StepSide = 1;
let StepEntering = true;
let StepRugId = "";
let LastTriggerAt = -Infinity;
let LastFrameAt = performance.now();
let StepSpeed = 0;
const StepDirection = new THREE.Vector3(0, 0, -1);

const STEP_DURATION = 430;
const STEP_COOLDOWN = 120;
const MIN_TRIGGER_SPEED = 0.08;
const EDGE_PADDING = 0.055;

function FiniteBounds(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite)
  );
}

function BoundsOf(Object) {
  Object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Object);
}

function RegisterRug(Object, ChunkId = "") {
  if (!Object?.isObject3D || !Object.parent) return "";
  const Bounds = BoundsOf(Object);
  if (Bounds.isEmpty()) return "";

  const Id = `${ChunkId || Object.userData?.ChunkId || "world"}:${Object.uuid}`;
  Rugs.set(Id, {
    Id,
    Object,
    ChunkId: ChunkId || Object.userData?.ChunkId || "",
    Bounds
  });

  Object.userData.WalkableCarpetR87 = true;
  Object.userData.DecorationNoCollision = true;
  Physics?.RegisterWalkableSurface?.(Object, ChunkId);
  return Id;
}

function UnregisterObject(Object) {
  if (!Object) return;
  for (const [Id, Record] of Rugs) {
    if (Record.Object === Object) Rugs.delete(Id);
  }
  Physics?.UnregisterWalkableSurface?.(Object);
}

function UnregisterChunk(ChunkId) {
  for (const [Id, Record] of Rugs) {
    if (Record.ChunkId === ChunkId) Rugs.delete(Id);
  }
  Physics?.UnregisterChunk?.(ChunkId);
}

function RefreshRegisteredRugs() {
  for (const [Id, Record] of Rugs) {
    if (!Record.Object?.parent || !Record.Object.visible) {
      Rugs.delete(Id);
      continue;
    }

    const Bounds = BoundsOf(Record.Object);
    if (Bounds.isEmpty()) {
      Rugs.delete(Id);
      continue;
    }

    Record.Bounds.copy(Bounds);
    Physics?.RefreshWalkableSurface?.(Record.Object);
  }
}

function RugAt(Position) {
  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (Position.x < Bounds.min.x - EDGE_PADDING || Position.x > Bounds.max.x + EDGE_PADDING) continue;
    if (Position.z < Bounds.min.z - EDGE_PADDING || Position.z > Bounds.max.z + EDGE_PADDING) continue;
    return Record.Id;
  }
  return "";
}

function NearRug(Position, Padding = 0.35) {
  if (!Position?.isVector3) return false;
  const SafePadding = Math.max(0, Number(Padding) || 0);

  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (!FiniteBounds(Bounds)) continue;
    if (Position.x < Bounds.min.x - SafePadding || Position.x > Bounds.max.x + SafePadding) continue;
    if (Position.z < Bounds.min.z - SafePadding || Position.z > Bounds.max.z + SafePadding) continue;
    return true;
  }

  return false;
}

function GetNearestLedgeState(Position, Direction = null, Range = 0.34) {
  if (!Position?.isVector3) return null;

  const SafeRange = THREE.MathUtils.clamp(Number(Range) || 0.40, 0.16, 0.70);
  let Best = null;

  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (!FiniteBounds(Bounds)) continue;

    const Edges = [
      {
        Axis: "x",
        Boundary: Bounds.min.x,
        NormalX: -1,
        NormalZ: 0,
        AlongMin: Bounds.min.z,
        AlongMax: Bounds.max.z,
        AlongValue: Position.z
      },
      {
        Axis: "x",
        Boundary: Bounds.max.x,
        NormalX: 1,
        NormalZ: 0,
        AlongMin: Bounds.min.z,
        AlongMax: Bounds.max.z,
        AlongValue: Position.z
      },
      {
        Axis: "z",
        Boundary: Bounds.min.z,
        NormalX: 0,
        NormalZ: -1,
        AlongMin: Bounds.min.x,
        AlongMax: Bounds.max.x,
        AlongValue: Position.x
      },
      {
        Axis: "z",
        Boundary: Bounds.max.z,
        NormalX: 0,
        NormalZ: 1,
        AlongMin: Bounds.min.x,
        AlongMax: Bounds.max.x,
        AlongValue: Position.x
      }
    ];

    for (const Edge of Edges) {
      if (
        Edge.AlongValue < Edge.AlongMin - 0.30 ||
        Edge.AlongValue > Edge.AlongMax + 0.30
      ) continue;

      const SignedDistance = Edge.Axis === "x"
        ? (Position.x - Edge.Boundary) * Edge.NormalX
        : (Position.z - Edge.Boundary) * Edge.NormalZ;
      const Distance = Math.abs(SignedDistance);
      if (Distance > SafeRange) continue;

      let MotionDot = 0;
      if (Direction?.isVector3 && Direction.lengthSq() > 0.000001) {
        MotionDot = Direction.x * Edge.NormalX + Direction.z * Edge.NormalZ;
      }

      const MotionAlignment = Math.abs(MotionDot);
      const DirectionPenalty =
        Direction?.isVector3 && Direction.lengthSq() > 0.000001
          ? (1 - THREE.MathUtils.clamp(MotionAlignment, 0, 1)) * 0.18
          : 0;
      const Score = Distance + DirectionPenalty;

      const Candidate = {
        RugId: Record.Id,
        Object: Record.Object,
        Bounds,
        Height: Bounds.max.y,
        Distance,
        Score,
        SignedDistance,
        Inside: SignedDistance <= 0,
        Entering: MotionDot < -0.05,
        Exiting: MotionDot > 0.05,
        MotionDot,
        NormalX: Edge.NormalX,
        NormalZ: Edge.NormalZ,
        TangentX: -Edge.NormalZ,
        TangentZ: Edge.NormalX,
        EdgeX: Edge.Axis === "x"
          ? Edge.Boundary
          : THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x),
        EdgeZ: Edge.Axis === "z"
          ? Edge.Boundary
          : THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z)
      };

      if (!Best || Candidate.Score < Best.Score) Best = Candidate;
    }
  }

  return Best;
}

function RaycastGroundHeight(Position, StartY = null) {
  if (!Position?.isVector3) return 0;

  const OriginY = Number.isFinite(StartY)
    ? Number(StartY)
    : Math.max(Game.Camera?.position?.y || 1.68, Position.y + 0.55, 1.0);

  GroundRayOrigin.set(Position.x, OriginY, Position.z);
  GroundRaycaster.set(GroundRayOrigin, GroundRayDirection);
  GroundRaycaster.near = 0;
  GroundRaycaster.far = Math.max(1.2, OriginY + 0.35);

  let Height = 0;

  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (!FiniteBounds(Bounds)) continue;
    if (Position.x < Bounds.min.x - 0.025 || Position.x > Bounds.max.x + 0.025) continue;
    if (Position.z < Bounds.min.z - 0.025 || Position.z > Bounds.max.z + 0.025) continue;

    GroundHits.length = 0;
    GroundRaycaster.intersectObject(Record.Object, true, GroundHits);
    for (const Hit of GroundHits) {
      if (!Hit?.point || Hit.point.y > OriginY + 0.001) continue;
      Height = Math.max(Height, Hit.point.y);
      break;
    }
  }

  return Height;
}

function ResolveRaisedFootLedge(Position, Radius = 0.105, GroundHeight = 0) {
  if (!Position?.isVector3) return Position;

  const SafeRadius = THREE.MathUtils.clamp(Number(Radius) || 0.125, 0.080, 0.16);
  const SafeGround = Math.max(0, Number(GroundHeight) || 0);
  const Skin = 0.012;

  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (!FiniteBounds(Bounds)) continue;

    const Top = Bounds.max.y;
    if (SafeGround < Top - 0.018) continue;

    const NearX = Position.x >= Bounds.min.x - SafeRadius &&
      Position.x <= Bounds.max.x + SafeRadius;
    const NearZ = Position.z >= Bounds.min.z - SafeRadius &&
      Position.z <= Bounds.max.z + SafeRadius;
    if (!NearX || !NearZ) continue;

    const MinX = Bounds.min.x + SafeRadius + Skin;
    const MaxX = Bounds.max.x - SafeRadius - Skin;
    const MinZ = Bounds.min.z + SafeRadius + Skin;
    const MaxZ = Bounds.max.z - SafeRadius - Skin;

    if (MinX <= MaxX) Position.x = THREE.MathUtils.clamp(Position.x, MinX, MaxX);
    if (MinZ <= MaxZ) Position.z = THREE.MathUtils.clamp(Position.z, MinZ, MaxZ);
  }

  return Position;
}


function ResolveLowerFootLedge(Position, Radius = 0.075, GroundHeight = 0) {
  if (!Position?.isVector3) return Position;

  const SafeRadius = THREE.MathUtils.clamp(Number(Radius) || 0.125, 0.060, 0.16);
  const SafeGround = Math.max(0, Number(GroundHeight) || 0);
  const Skin = 0.012;

  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (!FiniteBounds(Bounds)) continue;

    const Top = Bounds.max.y;
    if (SafeGround >= Top - 0.012) continue;

    const WithinZ = Position.z >= Bounds.min.z - SafeRadius &&
      Position.z <= Bounds.max.z + SafeRadius;
    const WithinX = Position.x >= Bounds.min.x - SafeRadius &&
      Position.x <= Bounds.max.x + SafeRadius;
    if (!WithinX || !WithinZ) continue;

    const Candidates = [
      { Axis: "x", Value: Bounds.min.x - SafeRadius - Skin, Distance: Math.abs(Position.x - Bounds.min.x) },
      { Axis: "x", Value: Bounds.max.x + SafeRadius + Skin, Distance: Math.abs(Position.x - Bounds.max.x) },
      { Axis: "z", Value: Bounds.min.z - SafeRadius - Skin, Distance: Math.abs(Position.z - Bounds.min.z) },
      { Axis: "z", Value: Bounds.max.z + SafeRadius + Skin, Distance: Math.abs(Position.z - Bounds.max.z) }
    ].sort((A, B) => A.Distance - B.Distance);

    const Best = Candidates[0];
    if (!Best || Best.Distance > SafeRadius + 0.055) continue;

    Position[Best.Axis] = Best.Value;
  }

  return Position;
}


function IsFootCurbSafe(Position, Radius = 0.125, Clearance = 0.055) {
  if (!Position?.isVector3) return true;

  const SafeRadius = THREE.MathUtils.clamp(Number(Radius) || 0.125, 0.06, 0.18);
  const SafeClearance = THREE.MathUtils.clamp(Number(Clearance) || 0.055, 0.025, 0.12);

  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (!FiniteBounds(Bounds)) continue;

    void SafeClearance;

    const ExpandedMinX = Bounds.min.x - SafeRadius;
    const ExpandedMaxX = Bounds.max.x + SafeRadius;
    const ExpandedMinZ = Bounds.min.z - SafeRadius;
    const ExpandedMaxZ = Bounds.max.z + SafeRadius;

    if (
      Position.x < ExpandedMinX ||
      Position.x > ExpandedMaxX ||
      Position.z < ExpandedMinZ ||
      Position.z > ExpandedMaxZ
    ) continue;

    const ContractedMinX = Bounds.min.x + SafeRadius;
    const ContractedMaxX = Bounds.max.x - SafeRadius;
    const ContractedMinZ = Bounds.min.z + SafeRadius;
    const ContractedMaxZ = Bounds.max.z - SafeRadius;

    const FullyOnTop =
      ContractedMinX <= ContractedMaxX &&
      ContractedMinZ <= ContractedMaxZ &&
      Position.x >= ContractedMinX &&
      Position.x <= ContractedMaxX &&
      Position.z >= ContractedMinZ &&
      Position.z <= ContractedMaxZ;

    const FullyOutside =
      Position.x <= Bounds.min.x - SafeRadius ||
      Position.x >= Bounds.max.x + SafeRadius ||
      Position.z <= Bounds.min.z - SafeRadius ||
      Position.z >= Bounds.max.z + SafeRadius;

    if (!FullyOnTop && !FullyOutside) return false;
  }

  return true;
}

function ResolveFootRollback(Target, PreviousSafe, Radius = 0.125, Clearance = 0.055) {
  if (!Target?.isVector3) return { Safe: true, RolledBack: false };

  const SafeRadius = THREE.MathUtils.clamp(Number(Radius) || 0.125, 0.06, 0.18);
  const SafeClearance = THREE.MathUtils.clamp(Number(Clearance) || 0.055, 0.025, 0.12);

  if (!PreviousSafe?.isVector3) {
    return {
      Safe: IsFootCurbSafe(Target, SafeRadius, SafeClearance),
      RolledBack: false
    };
  }

  const Distance = PreviousSafe.distanceTo(Target);
  if (Distance > 0.85 || !IsFootCurbSafe(PreviousSafe, SafeRadius, SafeClearance)) {
    PreviousSafe.copy(Target);
    return {
      Safe: IsFootCurbSafe(Target, SafeRadius, SafeClearance),
      RolledBack: false
    };
  }

  const Steps = THREE.MathUtils.clamp(
    Math.ceil(Distance / Math.max(0.018, SafeRadius * 0.22)),
    4,
    28
  );

  let LastSafeT = 0;
  const Probe = new THREE.Vector3();

  for (let Index = 1; Index <= Steps; Index += 1) {
    const T = Index / Steps;
    Probe.lerpVectors(PreviousSafe, Target, T);

    if (IsFootCurbSafe(Probe, SafeRadius, SafeClearance)) {
      LastSafeT = T;
      continue;
    }

    let Low = LastSafeT;
    let High = T;

    for (let Iteration = 0; Iteration < 10; Iteration += 1) {
      const Mid = (Low + High) * 0.5;
      Probe.lerpVectors(PreviousSafe, Target, Mid);
      if (IsFootCurbSafe(Probe, SafeRadius, SafeClearance)) Low = Mid;
      else High = Mid;
    }

    Target.lerpVectors(PreviousSafe, Target, Math.max(0, Low - 0.002));
    return {
      Safe: true,
      RolledBack: true
    };
  }

  return {
    Safe: true,
    RolledBack: false
  };
}

function TriggerStep(Side = null, Entering = true, RugId = "", Speed = 0, Direction = null) {
  const Now = performance.now();
  if (Now - LastTriggerAt < STEP_COOLDOWN) return false;

  LastTriggerAt = Now;
  StepStartedAt = Now;
  StepSide = Side === -1 || Side === 1 ? Side : -StepSide;
  StepEntering = Boolean(Entering);
  StepRugId = String(RugId || "");
  StepSpeed = Math.max(0, Number(Speed) || 0);

  if (Direction?.isVector3 && Direction.lengthSq() > 0.000001) {
    StepDirection.copy(Direction);
    StepDirection.y = 0;
    StepDirection.normalize();
  }

  return true;
}

function UpdateCrossingState() {
  const Now = performance.now();
  const Delta = Math.max(0.001, Math.min((Now - LastFrameAt) / 1000, 0.08));
  LastFrameAt = Now;

  const Position = Game.Camera.position;
  if (!HasLastPosition) {
    LastPosition.copy(Position);
    CurrentRugId = RugAt(Position);
    HasLastPosition = true;
    return;
  }

  TempVelocity.copy(Position).sub(LastPosition);
  TempVelocity.y = 0;
  const Speed = TempVelocity.length() / Delta;
  const NextRugId = RugAt(Position);

  if (NextRugId !== CurrentRugId && Speed >= MIN_TRIGGER_SPEED) {
    const Entering = Boolean(NextRugId);
    TriggerStep(null, Entering, Entering ? NextRugId : CurrentRugId, Speed, TempVelocity);
  }

  CurrentRugId = NextRugId;
  LastPosition.copy(Position);
}

function GetStepState() {
  const Elapsed = performance.now() - StepStartedAt;
  const Progress = THREE.MathUtils.clamp(Elapsed / STEP_DURATION, 0, 1);
  const Record = Rugs.get(StepRugId) || null;
  const Height = Record?.Bounds?.max?.y ?? 0;
  return {
    Active: Elapsed >= 0 && Elapsed < STEP_DURATION,
    Progress,
    Side: StepSide,
    Entering: StepEntering,
    RugId: StepRugId,
    Duration: STEP_DURATION,
    Height,
    Speed: StepSpeed,
    DirectionX: StepDirection.x,
    DirectionZ: StepDirection.z
  };
}

const RefreshInterval = setInterval(RefreshRegisteredRugs, 900);
addEventListener("pagehide", () => clearInterval(RefreshInterval), { once: true });

window.__STORE_SURFACE_STEP_ANIMATION_R87__ = {
  RegisterRug,
  UnregisterObject,
  UnregisterChunk,
  RefreshRegisteredRugs,
  TriggerStep,
  UpdateCrossingState,
  GetStepState,
  GetNearestLedgeState,
  NearRug,
  RaycastGroundHeight,
  ResolveRaisedFootLedge,
  ResolveLowerFootLedge,
  IsFootCurbSafe,
  ResolveFootRollback,
  GetRegisteredCount: () => Rugs.size
};

window.__STORE_SURFACE_STEP_ANIMATION_BUILD__ = "V0.35.19-DYNAMIC-FOOT-ROLLBACK";
