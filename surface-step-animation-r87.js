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
const FOOT_CURB_SOLE_OFFSET = 0.050;
const FOOT_CURB_VERTICAL_SKIN = 0.008;
const FOOT_CURB_SWEEP_SPACING = 0.010;
const FootCurbProbe = new THREE.Vector3();

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


function FootClearsCurbVertically(Position, Bounds, Clearance) {
  return Position.y - FOOT_CURB_SOLE_OFFSET >=
    Bounds.max.y + Math.max(FOOT_CURB_VERTICAL_SKIN, Clearance);
}

function FootFullyOutside(Position, Bounds, Radius, Clearance) {
  const Gap = Radius + Clearance;
  return (
    Position.x <= Bounds.min.x - Gap ||
    Position.x >= Bounds.max.x + Gap ||
    Position.z <= Bounds.min.z - Gap ||
    Position.z >= Bounds.max.z + Gap
  );
}

function FootFullyOnTop(Position, Bounds, Radius, Clearance) {
  const Gap = Radius + Clearance;
  const MinX = Bounds.min.x + Gap;
  const MaxX = Bounds.max.x - Gap;
  const MinZ = Bounds.min.z + Gap;
  const MaxZ = Bounds.max.z - Gap;

  if (MinX > MaxX || MinZ > MaxZ) return false;

  const Horizontal =
    Position.x >= MinX &&
    Position.x <= MaxX &&
    Position.z >= MinZ &&
    Position.z <= MaxZ;

  if (!Horizontal) return false;

  return Position.y - FOOT_CURB_SOLE_OFFSET >=
    Bounds.max.y - 0.003;
}

function FootSafeForBounds(Position, Bounds, Radius, Clearance) {
  if (!FiniteBounds(Bounds)) return true;

  const Reach = Radius + Clearance;
  if (
    Position.x < Bounds.min.x - Reach ||
    Position.x > Bounds.max.x + Reach ||
    Position.z < Bounds.min.z - Reach ||
    Position.z > Bounds.max.z + Reach
  ) return true;

  if (FootClearsCurbVertically(Position, Bounds, Clearance)) return true;
  if (FootFullyOutside(Position, Bounds, Radius, Clearance)) return true;
  if (FootFullyOnTop(Position, Bounds, Radius, Clearance)) return true;

  return false;
}

function IsFootCurbSafe(Position, Radius = 0.145, Clearance = 0.010) {
  if (!Position?.isVector3) return true;

  const SafeRadius = THREE.MathUtils.clamp(Number(Radius) || 0.145, 0.08, 0.19);
  const SafeClearance = THREE.MathUtils.clamp(Number(Clearance) || 0.010, 0.006, 0.030);

  for (const Record of Rugs.values()) {
    if (!FootSafeForBounds(
      Position,
      Record.Bounds,
      SafeRadius,
      SafeClearance
    )) return false;
  }

  return true;
}

function ResolveFootCurbConstraint(Target, Reference = null, Radius = 0.145, Clearance = 0.010) {
  if (!Target?.isVector3) return Target;

  const SafeRadius = THREE.MathUtils.clamp(Number(Radius) || 0.145, 0.08, 0.19);
  const SafeClearance = THREE.MathUtils.clamp(Number(Clearance) || 0.010, 0.006, 0.030);
  const Gap = SafeRadius + SafeClearance;

  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (!FiniteBounds(Bounds)) continue;
    if (FootSafeForBounds(
      Target,
      Bounds,
      SafeRadius,
      SafeClearance
    )) continue;

    const MinX = Bounds.min.x + Gap;
    const MaxX = Bounds.max.x - Gap;
    const MinZ = Bounds.min.z + Gap;
    const MaxZ = Bounds.max.z - Gap;
    const CanStandOnTop =
      MinX <= MaxX &&
      MinZ <= MaxZ &&
      Target.y - FOOT_CURB_SOLE_OFFSET >= Bounds.max.y - 0.003;
    const TargetInsideRug =
      Target.x >= Bounds.min.x &&
      Target.x <= Bounds.max.x &&
      Target.z >= Bounds.min.z &&
      Target.z <= Bounds.max.z;

    if (CanStandOnTop && TargetInsideRug) {
      Target.x = THREE.MathUtils.clamp(Target.x, MinX, MaxX);
      Target.z = THREE.MathUtils.clamp(Target.z, MinZ, MaxZ);
      Target.y = Math.max(
        Target.y,
        Bounds.max.y + FOOT_CURB_SOLE_OFFSET
      );
      continue;
    }

    const Outside = [
      { Axis: "x", Value: Bounds.min.x - Gap, Distance: Math.abs(Target.x - (Bounds.min.x - Gap)), Side: "minX" },
      { Axis: "x", Value: Bounds.max.x + Gap, Distance: Math.abs(Target.x - (Bounds.max.x + Gap)), Side: "maxX" },
      { Axis: "z", Value: Bounds.min.z - Gap, Distance: Math.abs(Target.z - (Bounds.min.z - Gap)), Side: "minZ" },
      { Axis: "z", Value: Bounds.max.z + Gap, Distance: Math.abs(Target.z - (Bounds.max.z + Gap)), Side: "maxZ" }
    ];

    let PreferredSide = "";

    if (Reference?.isVector3) {
      if (Reference.x <= Bounds.min.x - Gap) PreferredSide = "minX";
      else if (Reference.x >= Bounds.max.x + Gap) PreferredSide = "maxX";
      else if (Reference.z <= Bounds.min.z - Gap) PreferredSide = "minZ";
      else if (Reference.z >= Bounds.max.z + Gap) PreferredSide = "maxZ";
    }

    let Candidate = PreferredSide
      ? Outside.find(Item => Item.Side === PreferredSide)
      : null;

    if (!Candidate) {
      Outside.sort((A, B) => A.Distance - B.Distance);
      Candidate = Outside[0];
    }

    if (Candidate) Target[Candidate.Axis] = Candidate.Value;

    if (!FootSafeForBounds(
      Target,
      Bounds,
      SafeRadius,
      SafeClearance
    )) {
      if (CanStandOnTop) {
        Target.x = THREE.MathUtils.clamp(Target.x, MinX, MaxX);
        Target.z = THREE.MathUtils.clamp(Target.z, MinZ, MaxZ);
        Target.y = Math.max(
          Target.y,
          Bounds.max.y + FOOT_CURB_SOLE_OFFSET
        );
      }
    }
  }

  return Target;
}

function ResolveFootRollback(Target, PreviousSafe, Radius = 0.145, Clearance = 0.010) {
  if (!Target?.isVector3) return { Safe: true, RolledBack: false };

  const SafeRadius = THREE.MathUtils.clamp(Number(Radius) || 0.145, 0.08, 0.19);
  const SafeClearance = THREE.MathUtils.clamp(Number(Clearance) || 0.010, 0.006, 0.030);

  if (!PreviousSafe?.isVector3) {
    ResolveFootCurbConstraint(Target, null, SafeRadius, SafeClearance);
    return {
      Safe: IsFootCurbSafe(Target, SafeRadius, SafeClearance),
      RolledBack: true
    };
  }

  if (!IsFootCurbSafe(PreviousSafe, SafeRadius, SafeClearance)) {
    ResolveFootCurbConstraint(
      PreviousSafe,
      Target,
      SafeRadius,
      SafeClearance
    );
  }

  const Distance = PreviousSafe.distanceTo(Target);
  if (Distance > 1.10) {
    ResolveFootCurbConstraint(
      Target,
      PreviousSafe,
      SafeRadius,
      SafeClearance
    );
    return {
      Safe: IsFootCurbSafe(Target, SafeRadius, SafeClearance),
      RolledBack: true
    };
  }

  const Steps = THREE.MathUtils.clamp(
    Math.ceil(Distance / FOOT_CURB_SWEEP_SPACING),
    4,
    96
  );

  let LastSafeT = 0;

  for (let Index = 1; Index <= Steps; Index += 1) {
    const T = Index / Steps;
    FootCurbProbe.lerpVectors(PreviousSafe, Target, T);

    if (IsFootCurbSafe(FootCurbProbe, SafeRadius, SafeClearance)) {
      LastSafeT = T;
      continue;
    }

    let Low = LastSafeT;
    let High = T;

    for (let Iteration = 0; Iteration < 14; Iteration += 1) {
      const Mid = (Low + High) * 0.5;
      FootCurbProbe.lerpVectors(PreviousSafe, Target, Mid);

      if (IsFootCurbSafe(FootCurbProbe, SafeRadius, SafeClearance)) {
        Low = Mid;
      } else {
        High = Mid;
      }
    }

    const OriginalTarget = FootCurbProbe.copy(Target);
    Target.lerpVectors(
      PreviousSafe,
      OriginalTarget,
      Math.max(0, Low - 0.0005)
    );

    ResolveFootCurbConstraint(
      Target,
      PreviousSafe,
      SafeRadius,
      SafeClearance
    );

    return {
      Safe: IsFootCurbSafe(Target, SafeRadius, SafeClearance),
      RolledBack: true
    };
  }

  if (!IsFootCurbSafe(Target, SafeRadius, SafeClearance)) {
    ResolveFootCurbConstraint(
      Target,
      PreviousSafe,
      SafeRadius,
      SafeClearance
    );

    return {
      Safe: IsFootCurbSafe(Target, SafeRadius, SafeClearance),
      RolledBack: true
    };
  }

  return {
    Safe: true,
    RolledBack: false
  };
}

const FootHullMetricScratch = {
  ExtentX: 0.145,
  ExtentZ: 0.078,
  SoleOffset: 0.055
};

function ReadFootHullMetrics(Hull, Out = FootHullMetricScratch) {
  const ForwardX = Number(Hull?.ForwardX) || 0;
  const ForwardZ = Number(Hull?.ForwardZ) || 1;
  const RightX = Number(Hull?.RightX) || 1;
  const RightZ = Number(Hull?.RightZ) || 0;
  const HalfLength = THREE.MathUtils.clamp(Number(Hull?.HalfLength) || 0.145, 0.10, 0.24);
  const HalfWidth = THREE.MathUtils.clamp(Number(Hull?.HalfWidth) || 0.078, 0.05, 0.15);

  Out.ExtentX =
    Math.abs(ForwardX) * HalfLength +
    Math.abs(RightX) * HalfWidth;
  Out.ExtentZ =
    Math.abs(ForwardZ) * HalfLength +
    Math.abs(RightZ) * HalfWidth;
  Out.SoleOffset = THREE.MathUtils.clamp(
    Number(Hull?.SoleOffset) || 0.055,
    0.025,
    0.14
  );

  return Out;
}

function FootHullSafeForBounds(Position, Bounds, Metrics, Clearance) {
  if (!FiniteBounds(Bounds)) return true;
  const MinX = Position.x - Metrics.ExtentX;
  const MaxX = Position.x + Metrics.ExtentX;
  const MinZ = Position.z - Metrics.ExtentZ;
  const MaxZ = Position.z + Metrics.ExtentZ;
  const SoleBottom = Position.y - Metrics.SoleOffset;

  if (SoleBottom >= Bounds.max.y + Clearance) return true;

  const FullyOutside =
    MaxX <= Bounds.min.x - Clearance ||
    MinX >= Bounds.max.x + Clearance ||
    MaxZ <= Bounds.min.z - Clearance ||
    MinZ >= Bounds.max.z + Clearance;

  if (FullyOutside) return true;

  const FullySupportedOnTop =
    SoleBottom >= Bounds.max.y - 0.003 &&
    MinX >= Bounds.min.x + Clearance &&
    MaxX <= Bounds.max.x - Clearance &&
    MinZ >= Bounds.min.z + Clearance &&
    MaxZ <= Bounds.max.z - Clearance;

  return FullySupportedOnTop;
}

function IsFootHullSafe(Position, Hull, Clearance = 0.010) {
  if (!Position?.isVector3) return true;

  const SafeClearance = THREE.MathUtils.clamp(
    Number(Clearance) || 0.010,
    0.006,
    0.030
  );

  const Metrics = ReadFootHullMetrics(Hull);

  for (const Record of Rugs.values()) {
    if (!FootHullSafeForBounds(
      Position,
      Record.Bounds,
      Metrics,
      SafeClearance
    )) return false;
  }

  return true;
}

function ResolveFootHullConstraint(Target, Reference = null, Hull = null, Clearance = 0.010) {
  if (!Target?.isVector3) return Target;

  const SafeClearance = THREE.MathUtils.clamp(
    Number(Clearance) || 0.010,
    0.006,
    0.030
  );
  const Metrics = ReadFootHullMetrics(Hull);

  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (!FiniteBounds(Bounds)) continue;
    if (FootHullSafeForBounds(Target, Bounds, Metrics, SafeClearance)) continue;

    const SoleBottom = Target.y - Metrics.SoleOffset;
    const CenterInside =
      Target.x >= Bounds.min.x &&
      Target.x <= Bounds.max.x &&
      Target.z >= Bounds.min.z &&
      Target.z <= Bounds.max.z;

    const MinTopX = Bounds.min.x + Metrics.ExtentX + SafeClearance;
    const MaxTopX = Bounds.max.x - Metrics.ExtentX - SafeClearance;
    const MinTopZ = Bounds.min.z + Metrics.ExtentZ + SafeClearance;
    const MaxTopZ = Bounds.max.z - Metrics.ExtentZ - SafeClearance;
    const CanFitOnTop =
      MinTopX <= MaxTopX &&
      MinTopZ <= MaxTopZ;

    if (
      CenterInside &&
      CanFitOnTop &&
      SoleBottom >= Bounds.max.y - 0.003
    ) {
      Target.x = THREE.MathUtils.clamp(Target.x, MinTopX, MaxTopX);
      Target.z = THREE.MathUtils.clamp(Target.z, MinTopZ, MaxTopZ);
      Target.y = Math.max(
        Target.y,
        Bounds.max.y + Metrics.SoleOffset
      );
      continue;
    }

    const Outside = [
      {
        Axis: "x",
        Value: Bounds.min.x - Metrics.ExtentX - SafeClearance,
        Distance: Math.abs(Target.x - (Bounds.min.x - Metrics.ExtentX - SafeClearance)),
        Side: "minX"
      },
      {
        Axis: "x",
        Value: Bounds.max.x + Metrics.ExtentX + SafeClearance,
        Distance: Math.abs(Target.x - (Bounds.max.x + Metrics.ExtentX + SafeClearance)),
        Side: "maxX"
      },
      {
        Axis: "z",
        Value: Bounds.min.z - Metrics.ExtentZ - SafeClearance,
        Distance: Math.abs(Target.z - (Bounds.min.z - Metrics.ExtentZ - SafeClearance)),
        Side: "minZ"
      },
      {
        Axis: "z",
        Value: Bounds.max.z + Metrics.ExtentZ + SafeClearance,
        Distance: Math.abs(Target.z - (Bounds.max.z + Metrics.ExtentZ + SafeClearance)),
        Side: "maxZ"
      }
    ];

    let PreferredSide = "";

    if (Reference?.isVector3) {
      const ReferenceMetrics = Metrics;
      if (Reference.x + ReferenceMetrics.ExtentX <= Bounds.min.x - SafeClearance) {
        PreferredSide = "minX";
      } else if (Reference.x - ReferenceMetrics.ExtentX >= Bounds.max.x + SafeClearance) {
        PreferredSide = "maxX";
      } else if (Reference.z + ReferenceMetrics.ExtentZ <= Bounds.min.z - SafeClearance) {
        PreferredSide = "minZ";
      } else if (Reference.z - ReferenceMetrics.ExtentZ >= Bounds.max.z + SafeClearance) {
        PreferredSide = "maxZ";
      }
    }

    let Candidate = PreferredSide
      ? Outside.find(Item => Item.Side === PreferredSide)
      : null;

    if (!Candidate) {
      Outside.sort((A, B) => A.Distance - B.Distance);
      Candidate = Outside[0];
    }

    if (Candidate) Target[Candidate.Axis] = Candidate.Value;
  }

  return Target;
}

function ResolveFootHullSweep(Target, PreviousSafe, Hull = null, Clearance = 0.010) {
  if (!Target?.isVector3) return { Safe: true, RolledBack: false };

  const SafeClearance = THREE.MathUtils.clamp(
    Number(Clearance) || 0.010,
    0.006,
    0.030
  );

  if (!PreviousSafe?.isVector3) {
    ResolveFootHullConstraint(Target, null, Hull, SafeClearance);
    return {
      Safe: IsFootHullSafe(Target, Hull, SafeClearance),
      RolledBack: true
    };
  }

  if (!IsFootHullSafe(PreviousSafe, Hull, SafeClearance)) {
    ResolveFootHullConstraint(
      PreviousSafe,
      Target,
      Hull,
      SafeClearance
    );
  }

  const Distance = PreviousSafe.distanceTo(Target);

  if (Distance > 1.10) {
    ResolveFootHullConstraint(
      Target,
      PreviousSafe,
      Hull,
      SafeClearance
    );
    return {
      Safe: IsFootHullSafe(Target, Hull, SafeClearance),
      RolledBack: true
    };
  }

  const Steps = THREE.MathUtils.clamp(
    Math.ceil(Distance / 0.008),
    4,
    128
  );

  let LastSafeT = 0;

  for (let Index = 1; Index <= Steps; Index += 1) {
    const T = Index / Steps;
    FootCurbProbe.lerpVectors(PreviousSafe, Target, T);

    if (IsFootHullSafe(FootCurbProbe, Hull, SafeClearance)) {
      LastSafeT = T;
      continue;
    }

    let Low = LastSafeT;
    let High = T;

    for (let Iteration = 0; Iteration < 16; Iteration += 1) {
      const Mid = (Low + High) * 0.5;
      FootCurbProbe.lerpVectors(PreviousSafe, Target, Mid);

      if (IsFootHullSafe(FootCurbProbe, Hull, SafeClearance)) {
        Low = Mid;
      } else {
        High = Mid;
      }
    }

    const OriginalTarget = FootCurbProbe.copy(Target);
    Target.lerpVectors(
      PreviousSafe,
      OriginalTarget,
      Math.max(0, Low - 0.00025)
    );

    ResolveFootHullConstraint(
      Target,
      PreviousSafe,
      Hull,
      SafeClearance
    );

    return {
      Safe: IsFootHullSafe(Target, Hull, SafeClearance),
      RolledBack: true
    };
  }

  if (!IsFootHullSafe(Target, Hull, SafeClearance)) {
    ResolveFootHullConstraint(
      Target,
      PreviousSafe,
      Hull,
      SafeClearance
    );

    return {
      Safe: IsFootHullSafe(Target, Hull, SafeClearance),
      RolledBack: true
    };
  }

  return {
    Safe: true,
    RolledBack: false
  };
}

function ResolveMeshPointCurbForce(Position, Target = null, Clearance = 0.004) {
  const Out = Target?.isVector3 ? Target : new THREE.Vector3();
  Out.set(0, 0, 0);

  if (!Position?.isVector3) {
    return {
      Hit: false,
      Depth: 0,
      Separation: Out
    };
  }

  const SafeClearance = THREE.MathUtils.clamp(
    Number(Clearance) || 0.004,
    0.001,
    0.020
  );

  let BestDepth = 0;

  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (!FiniteBounds(Bounds)) continue;

    const MinX = Bounds.min.x - SafeClearance;
    const MaxX = Bounds.max.x + SafeClearance;
    const MinZ = Bounds.min.z - SafeClearance;
    const MaxZ = Bounds.max.z + SafeClearance;
    const TopY = Bounds.max.y + SafeClearance;

    if (
      Position.x <= MinX ||
      Position.x >= MaxX ||
      Position.z <= MinZ ||
      Position.z >= MaxZ ||
      Position.y >= TopY
    ) continue;

    const Left = Position.x - MinX;
    const Right = MaxX - Position.x;
    const Back = Position.z - MinZ;
    const Front = MaxZ - Position.z;
    const Up = TopY - Position.y;

    let Depth = Left;
    let Axis = "left";

    if (Right < Depth) {
      Depth = Right;
      Axis = "right";
    }
    if (Back < Depth) {
      Depth = Back;
      Axis = "back";
    }
    if (Front < Depth) {
      Depth = Front;
      Axis = "front";
    }
    if (Up < Depth) {
      Depth = Up;
      Axis = "up";
    }

    if (Depth <= BestDepth) continue;
    BestDepth = Depth;

    if (Axis === "left") Out.set(-Depth, 0, 0);
    else if (Axis === "right") Out.set(Depth, 0, 0);
    else if (Axis === "back") Out.set(0, 0, -Depth);
    else if (Axis === "front") Out.set(0, 0, Depth);
    else Out.set(0, Depth, 0);
  }

  return {
    Hit: BestDepth > 0,
    Depth: BestDepth,
    Separation: Out
  };
}

function ResolveBodyPartCurbForce(Position, Radius = 0.10, Target = null, Clearance = 0.010) {
  const Out = Target?.isVector3 ? Target : new THREE.Vector3();
  Out.set(0, 0, 0);

  if (!Position?.isVector3) {
    return {
      Hit: false,
      Depth: 0,
      Separation: Out
    };
  }

  const SafeRadius = THREE.MathUtils.clamp(
    Number(Radius) || 0.10,
    0.035,
    0.30
  );
  const SafeClearance = THREE.MathUtils.clamp(
    Number(Clearance) || 0.010,
    0.006,
    0.035
  );

  let BestDepth = 0;

  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (!FiniteBounds(Bounds)) continue;

    if (
      Position.y - SafeRadius >=
      Bounds.max.y + SafeClearance
    ) continue;

    const MinX = Bounds.min.x - SafeRadius - SafeClearance;
    const MaxX = Bounds.max.x + SafeRadius + SafeClearance;
    const MinZ = Bounds.min.z - SafeRadius - SafeClearance;
    const MaxZ = Bounds.max.z + SafeRadius + SafeClearance;

    if (
      Position.x <= MinX ||
      Position.x >= MaxX ||
      Position.z <= MinZ ||
      Position.z >= MaxZ
    ) continue;

    const TopSupported =
      Position.y - SafeRadius >= Bounds.max.y - 0.003 &&
      Position.x >= Bounds.min.x + SafeRadius + SafeClearance &&
      Position.x <= Bounds.max.x - SafeRadius - SafeClearance &&
      Position.z >= Bounds.min.z + SafeRadius + SafeClearance &&
      Position.z <= Bounds.max.z - SafeRadius - SafeClearance;

    if (TopSupported) continue;

    const Left = Position.x - MinX;
    const Right = MaxX - Position.x;
    const Back = Position.z - MinZ;
    const Front = MaxZ - Position.z;
    const Depth = Math.min(Left, Right, Back, Front);

    if (Depth <= BestDepth) continue;
    BestDepth = Depth;

    if (Depth === Left) Out.set(-Depth, 0, 0);
    else if (Depth === Right) Out.set(Depth, 0, 0);
    else if (Depth === Back) Out.set(0, 0, -Depth);
    else Out.set(0, 0, Depth);
  }

  return {
    Hit: BestDepth > 0,
    Depth: BestDepth,
    Separation: Out
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
  ResolveFootCurbConstraint,
  ResolveFootRollback,
  IsFootHullSafe,
  ResolveFootHullConstraint,
  ResolveFootHullSweep,
  ResolveMeshPointCurbForce,
  ResolveBodyPartCurbForce,
  GetRegisteredCount: () => Rugs.size
};

window.__STORE_SURFACE_STEP_ANIMATION_BUILD__ = "V0.35.33-EXACT-MESH-CURB";
