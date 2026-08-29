import * as THREE from "three";

const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Collision) throw new Error("Collision utility must load before procedural physics.");

const EyeHeight = 1.68;
const DefaultRadius = 0.255;
const Skin = 0.0025;
const MaxStepHeight = 0.30;
const StepClearance = 0.018;
const StepProbeInset = 0.055;
const StepUpSpeed = 4.6;
const StepDownSpeed = 5.4;
const MaxSweepSteps = 56;
const BinarySteps = 18;

const WalkableSurfaces = new Map();
const SolidContacts = new Map();

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

function ContactSignature(Object) {
  Object.updateWorldMatrix(true, true);
  const E = Object.matrixWorld.elements;
  return `${E[0].toFixed(3)}:${E[2].toFixed(3)}:${E[5].toFixed(3)}:${E[8].toFixed(3)}:${E[10].toFixed(3)}:${E[12].toFixed(3)}:${E[13].toFixed(3)}:${E[14].toFixed(3)}:${Object.children.length}:${Object.visible ? 1 : 0}`;
}

function RegisterSolidContactObject(Object, ChunkId = "") {
  if (!Object?.isObject3D || !Object.parent || !Object.visible) return 0;
  const Signature = ContactSignature(Object);
  const Existing = SolidContacts.get(Object);
  if (Existing?.Signature === Signature) return Existing.Entries.length;

  const Entries = [];
  Object.traverse(Item => {
    if (Entries.length >= 30 || !Item?.isMesh || !Item.visible || !Item.geometry) return;
    if (/Text|Label|Glow|Rug|Carpet/i.test(String(Item.name || ""))) return;
    const Box = new THREE.Box3().setFromObject(Item);
    if (Box.isEmpty()) return;
    const Size = Box.getSize(new THREE.Vector3());
    if (Size.x < 0.018 || Size.y < 0.018 || Size.z < 0.018) return;
    Entries.push({
      Box,
      OriginalBox: Box.clone(),
      Type: "ProceduralBodyContact",
      ProceduralBodyContact: true,
      SourceObject: Object,
      SourceMesh: Item,
      ChunkId
    });
  });

  SolidContacts.set(Object, { Object, ChunkId, Signature, Entries });
  return Entries.length;
}

function UnregisterSolidContactObject(Object) {
  SolidContacts.delete(Object);
}

function BoundsNear(Bounds, Center, Range) {
  if (!Center || !FiniteBounds(Bounds)) return true;
  const X = THREE.MathUtils.clamp(Center.x, Bounds.min.x, Bounds.max.x);
  const Z = THREE.MathUtils.clamp(Center.z, Bounds.min.z, Bounds.max.z);
  const DX = Center.x - X;
  const DZ = Center.z - Z;
  return DX * DX + DZ * DZ <= Range * Range;
}

function GetBodyContactEntries(WorldEntries, Center = null, Range = 2.6) {
  const Result = [];
  const SafeRange = Math.max(0.8, Number(Range) || 2.6);

  for (const Entry of WorldEntries || []) {
    if (!Entry || !IsStructure(Entry)) continue;
    const Bounds = EntryBounds(Entry);
    if (!FiniteBounds(Bounds) || !BoundsNear(Bounds, Center, SafeRange)) continue;
    Result.push(Entry);
  }

  for (const [Object, Record] of SolidContacts) {
    if (!Object?.parent || !Object.visible) {
      SolidContacts.delete(Object);
      continue;
    }
    for (const Entry of Record.Entries) {
      if (!BoundsNear(Entry.Box, Center, SafeRange)) continue;
      Result.push(Entry);
    }
  }

  return Result;
}

function PointOverBounds(Position, Bounds, Inset = 0) {
  return Position.x >= Bounds.min.x + Inset &&
    Position.x <= Bounds.max.x - Inset &&
    Position.z >= Bounds.min.z + Inset &&
    Position.z <= Bounds.max.z - Inset;
}

function WalkableSurfaceHeight(Position, CurrentFeetY = 0) {
  let Height = 0;

  for (const Record of WalkableSurfaces.values()) {
    const Bounds = Record.Bounds;
    if (!FiniteBounds(Bounds)) continue;
    const Width = Bounds.max.x - Bounds.min.x;
    const Depth = Bounds.max.z - Bounds.min.z;
    const Inset = Math.min(StepProbeInset, Math.max(0, Math.min(Width, Depth) * 0.18));
    if (!PointOverBounds(Position, Bounds, Inset)) continue;
    const Rise = Bounds.max.y - CurrentFeetY;
    if (Rise > MaxStepHeight + StepClearance) continue;
    Height = Math.max(Height, Bounds.max.y);
  }

  return Height;
}

function WalkableEntryHeight(Position, Entries, CurrentFeetY = 0) {
  let Height = 0;

  for (const Entry of Entries || []) {
    if (!Entry || IsStructure(Entry)) continue;
    const Bounds = EntryBounds(Entry);
    if (!FiniteBounds(Bounds)) continue;
    if (!PointOverBounds(Position, Bounds, 0)) continue;
    const Rise = Bounds.max.y - CurrentFeetY;
    const HeightSize = Bounds.max.y - Bounds.min.y;
    if (Rise < -0.035 || Rise > MaxStepHeight + StepClearance) continue;
    if (!IsExplicitWalkable(Entry) && HeightSize > MaxStepHeight + 0.16) continue;
    Height = Math.max(Height, Bounds.max.y);
  }

  return Height;
}

function SurfaceHeight(Position, Entries, CurrentFeetY = 0) {
  return Math.max(
    0,
    WalkableSurfaceHeight(Position, CurrentFeetY),
    WalkableEntryHeight(Position, Entries, CurrentFeetY)
  );
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

function MovementFilter(Entry) {
  return Boolean(Entry && !IsExplicitWalkable(Entry));
}

function StepFilter(FeetY) {
  return Entry => {
    if (!Entry || IsExplicitWalkable(Entry)) return false;
    if (IsStructure(Entry)) return true;
    const Bounds = EntryBounds(Entry);
    if (!FiniteBounds(Bounds)) return true;
    if (Bounds.max.y > FeetY + StepClearance) return true;
    const Height = Bounds.max.y - Bounds.min.y;
    if (Height > MaxStepHeight + 0.16 && !IsExplicitWalkable(Entry)) return true;
    return false;
  };
}

function TryStep(Start, Desired, Radius, Entries, FirstResult) {
  const Entry = FirstResult?.Entry;
  const Bounds = EntryBounds(Entry);
  if (!Entry || IsStructure(Entry) || !FiniteBounds(Bounds)) return null;

  const CurrentFeetY = Start.y - EyeHeight;
  const StepTop = Bounds.max.y;
  const Rise = StepTop - CurrentFeetY;
  if (Rise <= 0.003 || Rise > MaxStepHeight) return null;

  Scratch.RaisedStart.copy(Start);
  Scratch.RaisedStart.y = EyeHeight + StepTop + StepClearance;

  const Result = Collision.ResolveHorizontalMove(
    Scratch.RaisedStart,
    Desired,
    Radius,
    Entries,
    {
      Skin,
      MaxIterations: 2,
      MaxSweepSteps,
      BinarySteps,
      AllowSlide: false,
      Filter: StepFilter(StepTop + StepClearance)
    }
  );

  const FirstDistance = FirstResult.Resolved.lengthSq();
  const StepDistance = Result.Resolved.lengthSq();
  if (StepDistance <= FirstDistance + 0.000025) return null;

  Result.Stepped = true;
  Result.StepHeight = StepTop;
  return Result;
}

function ResolveWithSlide(Start, Desired, Radius, Entries) {
  const First = Collision.ResolveHorizontalMove(
    Start,
    Desired,
    Radius,
    Entries,
    {
      Skin,
      MaxIterations: 1,
      MaxSweepSteps,
      BinarySteps,
      AllowSlide: false,
      Filter: MovementFilter
    }
  );

  if (!First.Hit) return First;

  const StepResult = TryStep(Start, Desired, Radius, Entries, First);
  if (StepResult) return StepResult;

  const Normal = First.Normal?.clone?.() || new THREE.Vector3();
  if (Normal.lengthSq() <= 0.000001) Normal.copy(Desired).normalize().multiplyScalar(-1);
  else Normal.normalize();

  if (!IsStructure(First.Entry)) return First;

  const DesiredLength = Desired.length();
  Scratch.Candidate.copy(Desired);
  const DesiredIntoSurface = Scratch.Candidate.dot(Normal);
  if (DesiredIntoSurface < 0) Scratch.Candidate.addScaledVector(Normal, -DesiredIntoSurface);
  const IntentTangentRatio = DesiredLength > 0.000001 ? Scratch.Candidate.length() / DesiredLength : 0;
  if (IntentTangentRatio < 0.28) return First;

  Scratch.Remaining.copy(Desired).sub(First.Resolved);
  Scratch.Tangent.copy(Scratch.Remaining);
  const IntoSurface = Scratch.Tangent.dot(Normal);
  if (IntoSurface < 0) Scratch.Tangent.addScaledVector(Normal, -IntoSurface);

  const TangentRatio = DesiredLength > 0.000001 ? Scratch.Tangent.length() / DesiredLength : 0;
  if (TangentRatio < 0.12 || Scratch.Tangent.lengthSq() <= 0.000001) return First;

  const TangentResult = Collision.ResolveHorizontalMove(
    First.Position,
    Scratch.Tangent,
    Radius,
    Entries,
    {
      Skin,
      MaxIterations: 1,
      MaxSweepSteps,
      BinarySteps,
      AllowSlide: false,
      Filter: MovementFilter
    }
  );

  const FinalPosition = TangentResult.Position.clone();
  const Resolved = FinalPosition.clone().sub(Start);
  Resolved.y = 0;

  return {
    Position: FinalPosition,
    Resolved,
    Hit: true,
    Entry: TangentResult.Entry || First.Entry,
    Normal,
    Sliding: TangentResult.Resolved.lengthSq() > 0.000001,
    SlideVector: TangentResult.Resolved.clone()
  };
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
  const CurrentFeetY = Camera.position.y - EyeHeight;
  const TargetFloor = SurfaceHeight(Camera.position, Entries, CurrentFeetY);
  const TargetEyeY = EyeHeight + TargetFloor;
  const Speed = TargetEyeY > Camera.position.y ? StepUpSpeed : StepDownSpeed;
  const MaxDelta = Math.max(0.0001, Math.min(Number(Delta) || 0.016, 0.05) * Speed);
  Camera.position.y = MoveToward(Camera.position.y, TargetEyeY, MaxDelta);
  return TargetFloor;
}

function MoveCharacter(Camera, ForwardAmount, RightAmount, Distance, Delta, Entries, Radius = DefaultRadius) {
  if (!Camera?.position || !Number.isFinite(Distance) || Distance < 0) return null;

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
  RegisterSolidContactObject,
  UnregisterSolidContactObject,
  GetBodyContactEntries,
  GetRegisteredSurfaceCount: () => WalkableSurfaces.size,
  GetRegisteredSolidContactCount: () => SolidContacts.size,
  GetSettings
};

window.__STORE_PROCEDURAL_PHYSICS__ = ProceduralPhysics;
window.__STORE_PROCEDURAL_PHYSICS_BUILD__ = "V0.27.5-PHYSICS";
