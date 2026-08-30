import * as THREE from "three";

const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Collision) throw new Error("Collision utility must load before procedural physics.");

const EyeHeight = 1.68;
const DefaultRadius = 0.255;
const Skin = 0.006;
const MaxStepHeight = 0.30;
const StepClearance = 0.018;
const SurfaceBlendWidth = 0.115;
const StepUpSpeed = 2.55;
const StepDownSpeed = 3.35;
const MaxSweepSteps = 56;
const BinarySteps = 18;

const WalkableSurfaces = new Map();

let VerticalStateInitialized = false;
let AuthoritativeFloorY = 0;

const Scratch = {
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  Desired: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3(),
  Start: new THREE.Vector3(),
  RaisedStart: new THREE.Vector3(),
  Tangent: new THREE.Vector3(),
  Remaining: new THREE.Vector3(),
  Final: new THREE.Vector3(),
  Candidate: new THREE.Vector3()
};

function FiniteBounds(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite) &&
    Bounds.min.x <= Bounds.max.x &&
    Bounds.min.y <= Bounds.max.y &&
    Bounds.min.z <= Bounds.max.z
  );
}

function EntryBounds(Entry) {
  return Entry?.OriginalStructureBox || Entry?.OriginalBox || Entry?.Box || Entry || null;
}

function IsStructure(Entry) {
  return Boolean(Entry?.PrecisePlayerStructure || /Wall|Partition|Boundary|RearStore|Door/i.test(String(Entry?.Type || "")));
}

function IsExplicitWalkable(Entry) {
  const Type = String(Entry?.Type || "");
  const Object = Entry?.CollisionObject;
  return Boolean(
    /Rug|Carpet|FloorSurface|WalkableSurface/i.test(Type) ||
    Object?.userData?.WalkableCarpetR87 ||
    Object?.userData?.DecorationKind === "Rug" ||
    Object?.userData?.DecorationKind === "LargeShowroomRug"
  );
}

function BoundsAt(Object) {
  if (!Object?.isObject3D || !Object.parent || !Object.visible) return null;
  Object.updateWorldMatrix(true, true);
  const Bounds = new THREE.Box3().setFromObject(Object);
  return Bounds.isEmpty() ? null : Bounds;
}

function SurfaceId(Object, ChunkId = "") {
  return `${ChunkId || Object?.userData?.ChunkId || "world"}:${Object?.uuid || "unknown"}`;
}

function RegisterWalkableSurface(Object, ChunkId = "") {
  const Bounds = BoundsAt(Object);
  if (!Bounds) return "";
  const Id = SurfaceId(Object, ChunkId);
  WalkableSurfaces.set(Id, {
    Id,
    Object,
    ChunkId: ChunkId || Object.userData?.ChunkId || "",
    Bounds
  });
  Object.userData.WalkableCarpetR87 = true;
  Object.userData.DecorationNoCollision = true;
  return Id;
}

function UnregisterWalkableSurface(Object) {
  for (const [Id, Record] of WalkableSurfaces) {
    if (Record.Object === Object) WalkableSurfaces.delete(Id);
  }
}

function UnregisterChunk(ChunkId) {
  for (const [Id, Record] of WalkableSurfaces) {
    if (Record.ChunkId === ChunkId) WalkableSurfaces.delete(Id);
  }
}

function RefreshWalkableSurface(Object) {
  for (const Record of WalkableSurfaces.values()) {
    if (Record.Object !== Object) continue;
    const Bounds = BoundsAt(Object);
    if (!Bounds) {
      WalkableSurfaces.delete(Record.Id);
      return false;
    }
    Record.Bounds.copy(Bounds);
    return true;
  }
  return false;
}

function RefreshWalkableSurfaces() {
  for (const [Id, Record] of WalkableSurfaces) {
    const Bounds = BoundsAt(Record.Object);
    if (!Bounds) {
      WalkableSurfaces.delete(Id);
      continue;
    }
    Record.Bounds.copy(Bounds);
  }
}

function PointOverBounds(Position, Bounds, Inset = 0) {
  return Position.x >= Bounds.min.x + Inset &&
    Position.x <= Bounds.max.x - Inset &&
    Position.z >= Bounds.min.z + Inset &&
    Position.z <= Bounds.max.z - Inset;
}

function SmoothStep01(Value) {
  const T = THREE.MathUtils.clamp(Value, 0, 1);
  return T * T * (3 - 2 * T);
}

function WalkableSupport(Position, Bounds) {
  const Margin = Math.min(
    Position.x - Bounds.min.x,
    Bounds.max.x - Position.x,
    Position.z - Bounds.min.z,
    Bounds.max.z - Position.z
  );
  const Width = Bounds.max.x - Bounds.min.x;
  const Depth = Bounds.max.z - Bounds.min.z;
  const Blend = Math.min(SurfaceBlendWidth, Math.max(0.045, Math.min(Width, Depth) * 0.20));
  return SmoothStep01((Margin + Blend) / (Blend * 2));
}

function WalkableSurfaceHeight(Position, CurrentFeetY = 0) {
  let Height = 0;

  for (const Record of WalkableSurfaces.values()) {
    const Bounds = Record.Bounds;
    if (!FiniteBounds(Bounds)) continue;
    const Support = WalkableSupport(Position, Bounds);
    if (Support <= 0.001) continue;
    const Rise = Bounds.max.y - CurrentFeetY;
    if (Rise > MaxStepHeight + StepClearance) continue;
    Height = Math.max(Height, Bounds.max.y * Support);
  }

  return Height;
}

function WalkableEntryHeight(Position, Entries, CurrentFeetY = 0) {
  let Height = 0;

  for (const Entry of Entries || []) {
    if (!Entry || IsStructure(Entry)) continue;
    const Bounds = EntryBounds(Entry);
    if (!FiniteBounds(Bounds)) continue;
    const ExplicitWalkable = IsExplicitWalkable(Entry);
    if (!ExplicitWalkable && !PointOverBounds(Position, Bounds, 0)) continue;
    const Support = ExplicitWalkable ? WalkableSupport(Position, Bounds) : 1;
    if (Support <= 0.001) continue;
    const Rise = Bounds.max.y - CurrentFeetY;
    const HeightSize = Bounds.max.y - Bounds.min.y;
    if (Rise < -0.035 || Rise > MaxStepHeight + StepClearance) continue;
    if (!ExplicitWalkable && HeightSize > MaxStepHeight + 0.16) continue;
    Height = Math.max(Height, Bounds.max.y * Support);
  }

  return Height;
}

function SurfaceHeight(Position, Entries, CurrentFeetY = 0) {
  void Entries;
  return Math.max(0, WalkableSurfaceHeight(Position, CurrentFeetY));
}

function CameraBasis(Camera) {
  Scratch.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  Scratch.Forward.y = 0;
  if (Scratch.Forward.lengthSq() <= 0.000001) Scratch.Forward.set(0, 0, -1);
  else Scratch.Forward.normalize();

  Scratch.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  Scratch.Right.y = 0;
  if (Scratch.Right.lengthSq() <= 0.000001) Scratch.Right.set(1, 0, 0);
  else Scratch.Right.normalize();
}

function MoveToward(Current, Target, MaximumDelta) {
  if (!Number.isFinite(Current)) return Target;
  if (!Number.isFinite(Target)) return Current;
  if (Current < Target) return Math.min(Target, Current + MaximumDelta);
  if (Current > Target) return Math.max(Target, Current - MaximumDelta);
  return Current;
}

function ResolveWithSlide(Start, Desired, Radius, Entries) {
  void Entries;
  const Scene = window.__STORE_GAME__?.Scene || null;
  if (!Scene?.isScene || typeof Collision.ResolveRaycastHorizontalMove !== "function") {
    return {
      Position: Start.clone().add(Desired),
      Resolved: Desired.clone(),
      Hit: false,
      Normal: new THREE.Vector3(),
      Entry: null
    };
  }

  return Collision.ResolveRaycastHorizontalMove(
    Start,
    Desired,
    Radius,
    {
      Scene,
      Skin: 0.010,
      EyeHeight,
      AllowSlide: true,
      RangePadding: 1.8,
      HeightFractions: [0.07, 0.17, 0.28, 0.40, 0.52, 0.68, 0.86]
    }
  );
}

function ContactState() {
  const Contact = window.__STORE_MOVEMENT_CONTACT__ ||= {};
  for (const Key of ["Normal", "Position", "DesiredDirection", "SlideDirection"]) {
    if (!Contact[Key]?.isVector3) Contact[Key] = new THREE.Vector3();
  }
  return Contact;
}

function RecordContact(Result, Desired) {
  if (!Result?.Hit) return;
  const Contact = ContactState();
  Contact.Normal.copy(Result.Normal || Scratch.DesiredDirection.clone().multiplyScalar(-1));
  if (Contact.Normal.lengthSq() > 0.000001) Contact.Normal.normalize();

  Contact.Position.copy(Result.Position);
  Contact.DesiredDirection.copy(Desired);
  if (Contact.DesiredDirection.lengthSq() > 0.000001) Contact.DesiredDirection.normalize();

  Contact.SlideDirection.copy(Result.SlideVector || new THREE.Vector3());
  if (Contact.SlideDirection.lengthSq() > 0.000001) Contact.SlideDirection.normalize();

  Contact.IntentInward = Math.max(0, -Contact.DesiredDirection.dot(Contact.Normal));
  Contact.SlideAmount = Result.Sliding ? 1 : 0;
  Contact.Strength = THREE.MathUtils.clamp(0.35 + Contact.IntentInward * 0.65, 0, 1);
  Contact.Sliding = Boolean(Result.Sliding);
  Contact.Stepped = Boolean(Result.Stepped);
  Contact.StepHeight = Number(Result.StepHeight) || 0;
  Contact.Type = Result.Entry?.Type || "Collision";
  Contact.LastHit = performance.now();
}

function SettleHeight(Camera, Delta, Entries) {
  void Entries;

  if (!VerticalStateInitialized) {
    AuthoritativeFloorY = THREE.MathUtils.clamp(
      Number(Camera.position.y) - EyeHeight,
      0,
      MaxStepHeight
    );
    VerticalStateInitialized = true;
  }

  const CurrentFeetY = AuthoritativeFloorY;
  let TargetFloor = SurfaceHeight(Camera.position, null, CurrentFeetY);

  const FootSupport = window.__STORE_FOOT_SUPPORT__ || null;
  const SupportAge = performance.now() - Number(FootSupport?.UpdatedAt ?? -Infinity);
  if (
    FootSupport?.Active === true &&
    SupportAge >= 0 &&
    SupportAge < 140 &&
    Number.isFinite(FootSupport.Height)
  ) {
    const LeftHeight = Number(FootSupport.LeftHeight);
    const RightHeight = Number(FootSupport.RightHeight);
    const SplitStance = Number.isFinite(LeftHeight) &&
      Number.isFinite(RightHeight) &&
      Math.abs(LeftHeight - RightHeight) > 0.022;

    // A split stance at an edge must not lift/drop the physical root by
    // averaging one raised foot with one floor foot. Body-center support owns Y;
    // each leg IK handles its own level independently.
    if (!SplitStance) {
      TargetFloor = THREE.MathUtils.clamp(Number(FootSupport.Height), 0, MaxStepHeight);
    }
  }

  const Speed = TargetFloor > AuthoritativeFloorY ? StepUpSpeed : StepDownSpeed;
  const MaxDelta = Math.max(0.0001, Math.min(Number(Delta) || 0.016, 0.05) * Speed);
  AuthoritativeFloorY = MoveToward(AuthoritativeFloorY, TargetFloor, MaxDelta);

  Camera.position.y = EyeHeight + AuthoritativeFloorY;
  return AuthoritativeFloorY;
}

function MoveCharacter(Camera, ForwardAmount, RightAmount, Distance, Delta, Entries, Radius = DefaultRadius) {
  if (!Camera?.position || !Number.isFinite(Distance) || Distance < 0) return null;

  if (VerticalStateInitialized) Camera.position.y = EyeHeight + AuthoritativeFloorY;
  CameraBasis(Camera);
  Scratch.Desired.set(0, 0, 0)
    .addScaledVector(Scratch.Forward, Number(ForwardAmount) || 0)
    .addScaledVector(Scratch.Right, Number(RightAmount) || 0);

  if (Scratch.Desired.lengthSq() <= 0.000001 || Distance <= 0.000001) {
    const FloorHeight = SettleHeight(Camera, Delta, Entries);
    return {
      Position: Camera.position.clone(),
      Resolved: new THREE.Vector3(),
      Hit: false,
      FloorHeight
    };
  }

  Scratch.Desired.normalize().multiplyScalar(Distance);
  Scratch.DesiredDirection.copy(Scratch.Desired).normalize();
  Scratch.Start.copy(Camera.position);

  const SafeRadius = THREE.MathUtils.clamp(Number(Radius) || DefaultRadius, 0.20, 0.32);
  const Result = ResolveWithSlide(Scratch.Start, Scratch.Desired, SafeRadius, Entries);

  Camera.position.x = Result.Position.x;
  Camera.position.z = Result.Position.z;

  if (Result.Stepped && Number.isFinite(Result.StepHeight)) {
    const TargetEyeY = EyeHeight + Result.StepHeight;
    const MaxDelta = Math.max(0.0001, Math.min(Number(Delta) || 0.016, 0.05) * StepUpSpeed);
    Camera.position.y = MoveToward(Camera.position.y, TargetEyeY, MaxDelta);
  }

  Result.FloorHeight = SettleHeight(Camera, Delta, Entries);
  RecordContact(Result, Scratch.Desired);
  return Result;
}

function GetSettings() {
  return {
    EyeHeight,
    DefaultRadius,
    Skin,
    MaxStepHeight,
    StepClearance,
    StepUpSpeed,
    StepDownSpeed
  };
}

const ProceduralPhysics = {
  MoveCharacter,
  SettleHeight,
  SurfaceHeight,
  RegisterWalkableSurface,
  UnregisterWalkableSurface,
  UnregisterChunk,
  RefreshWalkableSurface,
  RefreshWalkableSurfaces,
  GetRegisteredSurfaceCount: () => WalkableSurfaces.size,
  ResetVerticalState() {
    VerticalStateInitialized = false;
    AuthoritativeFloorY = 0;
  },
  GetPhysicalFloorY: () => AuthoritativeFloorY,
  GetSettings
};

window.__STORE_PROCEDURAL_PHYSICS__ = ProceduralPhysics;
window.__STORE_PROCEDURAL_PHYSICS_BUILD__ = "V0.35.10-SPLIT-STANCE";
