import * as THREE from "three";

const Contact = window.__STORE_MOVEMENT_CONTACT__ ||= {};
const Game = window.__STORE_GAME__ || null;
const Physics = window.__STORE_PROCEDURAL_PHYSICS__ || null;
const Collision = window.__STORE_COLLISION_UTILITY__ || null;

function EnsureVector(Key) {
  if (!Contact[Key]?.isVector3) Contact[Key] = new THREE.Vector3();
}

for (const Key of [
  "Normal",
  "Position",
  "DesiredDirection",
  "SlideDirection",
  "CharacterFacing"
]) EnsureVector(Key);

if (!Number.isFinite(Contact.Strength)) Contact.Strength = 0;
if (!Number.isFinite(Contact.SlideAmount)) Contact.SlideAmount = 0;
if (!Number.isFinite(Contact.FacingAngle)) Contact.FacingAngle = 0;
if (!Number.isFinite(Contact.LastHit)) Contact.LastHit = -Infinity;
if (typeof Contact.Sliding !== "boolean") Contact.Sliding = false;
if (typeof Contact.Type !== "string") Contact.Type = "";

const STRICT_SKIN = 0.018;
const STRICT_SAMPLE_SPACING = 0.032;
const STRICT_BINARY_STEPS = 14;
const STRICT_PUSH_PASSES = 8;
const STRICT_MAX_PUSH = 0.11;
const StrictBounds = new THREE.Box3();
const StrictClosest = new THREE.Vector3();
const StrictNormal = new THREE.Vector3();
const StrictCandidate = new THREE.Vector3();
const StrictStart = new THREE.Vector3();
const StrictEnd = new THREE.Vector3();
const StrictCenter = new THREE.Vector3();
const StrictResolved = new THREE.Vector3();

function EyeHeight() {
  const Value = Number(Physics?.GetSettings?.()?.EyeHeight);
  return Number.isFinite(Value) ? Value : 1.68;
}

function IsStrictMesh(Object) {
  if (!Object?.isMesh || !Object.visible || !Object.geometry) return false;
  if (typeof Collision?.IsVisibleRayCollisionMesh === "function") {
    try {
      return Collision.IsVisibleRayCollisionMesh(Object, "movement");
    } catch {}
  }

  let Current = Object;
  while (Current) {
    const Data = Current.userData || {};
    const Name = String(Current.name || "");
    if (
      Data.IgnoreRayCollisionR35 === true ||
      Data.RemotePlayer === true ||
      Data.WalkableCarpetR87 === true ||
      Data.DecorationNoCollision === true ||
      Data.DecorationKind === "Rug" ||
      Data.DecorationKind === "LargeShowroomRug" ||
      Name === "PlayerCharacterPivot" ||
      Name.startsWith("RemotePlayer-") ||
      /Rug|Carpet|Floor|Ceiling|Text|Label|Glow|Highlight|Selection|Outline/i.test(Name)
    ) return false;
    Current = Current.parent;
  }
  return true;
}

function WorldBoundsForMesh(Object, Target) {
  Object.updateWorldMatrix(true, false);
  const Geometry = Object.geometry;
  if (!Geometry?.boundingBox) Geometry?.computeBoundingBox?.();
  if (!Geometry?.boundingBox) return null;
  Target.copy(Geometry.boundingBox).applyMatrix4(Object.matrixWorld);
  if (Target.isEmpty()) return null;
  return Target;
}

function CollectNearbyMeshBounds(Position, Radius, TravelDistance = 0) {
  if (!Game?.Scene?.isScene) return [];
  const Range = Math.max(2.0, Number(TravelDistance) + Number(Radius) + 1.45);
  const Roots = typeof Collision?.RaycastCandidateRoots === "function"
    ? Collision.RaycastCandidateRoots(Game.Scene, Position, Range)
    : Game.Scene.children;
  const Records = [];
  const Seen = new Set();

  for (const Root of Roots || []) {
    Root?.traverse?.(Object => {
      if (!IsStrictMesh(Object) || Seen.has(Object)) return;
      Seen.add(Object);
      const Bounds = WorldBoundsForMesh(Object, new THREE.Box3());
      if (!Bounds) return;
      Records.push({ Object, Bounds });
    });
  }
  return Records;
}

function HorizontalPenetration(Position, Radius, Record, TargetNormal = StrictNormal) {
  const Bounds = Record?.Bounds;
  if (!Bounds?.min || !Bounds?.max) return null;

  const Height = EyeHeight();
  const FeetY = Position.y - Height;
  const BodyMinY = FeetY + 0.055;
  const BodyMaxY = FeetY + Height * 0.965;
  if (Bounds.max.y <= BodyMinY || Bounds.min.y >= BodyMaxY) return null;

  const Padding = Math.max(0.20, Number(Radius) || 0.255) + STRICT_SKIN;
  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  const DX = Position.x - ClosestX;
  const DZ = Position.z - ClosestZ;
  const DistanceSquared = DX * DX + DZ * DZ;

  if (DistanceSquared > 0.00000001) {
    const Distance = Math.sqrt(DistanceSquared);
    if (Distance >= Padding) return null;
    TargetNormal.set(DX / Distance, 0, DZ / Distance);
    return {
      Hit: true,
      Depth: Padding - Distance,
      Normal: TargetNormal.clone(),
      Object: Record.Object,
      Bounds
    };
  }

  const ExpandedMinX = Bounds.min.x - Padding;
  const ExpandedMaxX = Bounds.max.x + Padding;
  const ExpandedMinZ = Bounds.min.z - Padding;
  const ExpandedMaxZ = Bounds.max.z + Padding;
  const Left = Position.x - ExpandedMinX;
  const Right = ExpandedMaxX - Position.x;
  const Back = Position.z - ExpandedMinZ;
  const Front = ExpandedMaxZ - Position.z;
  const Minimum = Math.min(Left, Right, Back, Front);

  if (Minimum === Left) TargetNormal.set(-1, 0, 0);
  else if (Minimum === Right) TargetNormal.set(1, 0, 0);
  else if (Minimum === Back) TargetNormal.set(0, 0, -1);
  else TargetNormal.set(0, 0, 1);

  return {
    Hit: true,
    Depth: Math.max(STRICT_SKIN, Minimum),
    Normal: TargetNormal.clone(),
    Object: Record.Object,
    Bounds
  };
}

function FindDeepestPenetration(Position, Radius, Records) {
  let Best = null;
  for (const Record of Records || []) {
    const Hit = HorizontalPenetration(Position, Radius, Record, StrictNormal);
    if (!Hit) continue;
    if (!Best || Hit.Depth > Best.Depth) Best = Hit;
  }
  return Best;
}

function IsBlocked(Position, Radius, Records) {
  return Boolean(FindDeepestPenetration(Position, Radius, Records));
}

function PushOutIfEmbedded(Position, Radius, Records) {
  const Result = Position.clone();
  let LastHit = null;
  let Shifted = false;

  for (let Pass = 0; Pass < STRICT_PUSH_PASSES; Pass += 1) {
    const Hit = FindDeepestPenetration(Result, Radius, Records);
    if (!Hit) break;
    LastHit = Hit;
    const Push = Math.min(STRICT_MAX_PUSH, Math.max(STRICT_SKIN, Hit.Depth + 0.004));
    Result.addScaledVector(Hit.Normal, Push);
    Shifted = true;
  }

  return { Position: Result, Hit: Shifted, Contact: LastHit };
}

function StrictSweep(Start, End, Radius, Records) {
  StrictStart.copy(Start);
  StrictEnd.copy(End);
  StrictStart.y = End.y;

  const Distance = Math.hypot(StrictEnd.x - StrictStart.x, StrictEnd.z - StrictStart.z);
  const StartBlocked = IsBlocked(StrictStart, Radius, Records);

  if (StartBlocked) {
    const Recovery = PushOutIfEmbedded(StrictStart, Radius, Records);
    if (!Recovery.Hit) return { Position: End.clone(), Hit: false, Contact: null };
    return { Position: Recovery.Position, Hit: true, Contact: Recovery.Contact, Recovered: true };
  }

  if (Distance <= 0.000001) {
    const FinalHit = FindDeepestPenetration(StrictEnd, Radius, Records);
    if (!FinalHit) return { Position: End.clone(), Hit: false, Contact: null };
    const Recovery = PushOutIfEmbedded(StrictEnd, Radius, Records);
    return { Position: Recovery.Position, Hit: true, Contact: Recovery.Contact || FinalHit, Recovered: true };
  }

  const Steps = THREE.MathUtils.clamp(Math.ceil(Distance / STRICT_SAMPLE_SPACING), 2, 20);
  let LastSafe = 0;
  let FirstBlocked = -1;
  let BlockingContact = null;

  for (let Step = 1; Step <= Steps; Step += 1) {
    const Fraction = Step / Steps;
    StrictCandidate.lerpVectors(StrictStart, StrictEnd, Fraction);
    StrictCandidate.y = End.y;
    const Hit = FindDeepestPenetration(StrictCandidate, Radius, Records);
    if (!Hit) {
      LastSafe = Fraction;
      continue;
    }
    FirstBlocked = Fraction;
    BlockingContact = Hit;
    break;
  }

  if (FirstBlocked < 0) return { Position: End.clone(), Hit: false, Contact: null };

  let Low = LastSafe;
  let High = FirstBlocked;
  for (let Binary = 0; Binary < STRICT_BINARY_STEPS; Binary += 1) {
    const Mid = (Low + High) * 0.5;
    StrictCandidate.lerpVectors(StrictStart, StrictEnd, Mid);
    StrictCandidate.y = End.y;
    if (IsBlocked(StrictCandidate, Radius, Records)) High = Mid;
    else Low = Mid;
  }

  const Backoff = Distance > 0.000001 ? Math.min(0.020 / Distance, 0.08) : 0;
  const SafeFraction = Math.max(0, Low - Backoff);
  StrictResolved.lerpVectors(StrictStart, StrictEnd, SafeFraction);
  StrictResolved.y = End.y;

  const Recovery = PushOutIfEmbedded(StrictResolved, Radius, Records);
  return {
    Position: Recovery.Position,
    Hit: true,
    Contact: BlockingContact || Recovery.Contact,
    RolledBack: true
  };
}

function RecordStrictContact(Start, End, Verified) {
  const Hit = Verified?.Contact;
  if (!Verified?.Hit || !Hit) return;

  EnsureVector("Normal");
  EnsureVector("Position");
  EnsureVector("DesiredDirection");
  EnsureVector("SlideDirection");

  Contact.Normal.copy(Hit.Normal || StrictNormal.set(0, 0, 0));
  if (Contact.Normal.lengthSq() > 0.000001) Contact.Normal.normalize();
  Contact.Position.copy(Verified.Position);
  Contact.DesiredDirection.copy(End).sub(Start);
  Contact.DesiredDirection.y = 0;
  if (Contact.DesiredDirection.lengthSq() > 0.000001) Contact.DesiredDirection.normalize();
  Contact.SlideDirection.set(0, 0, 0);
  Contact.Strength = 1;
  Contact.SlideAmount = 0;
  Contact.Sliding = false;
  Contact.Type = `StrictMesh:${String(Hit.Object?.name || "VisibleGeometry")}`;
  Contact.LastHit = performance.now();
}

function InstallStrictMovementVerifier() {
  if (!Physics?.MoveCharacter || !Game?.Scene || Physics.__StrictMeshVerifierR35) return false;

  const PreviousMoveCharacter = Physics.MoveCharacter.bind(Physics);
  Physics.MoveCharacter = function MoveCharacterWithStrictPenetrationVerifier(
    Camera,
    ForwardAmount,
    RightAmount,
    Distance,
    Delta,
    Entries,
    Radius
  ) {
    if (!Camera?.position) {
      return PreviousMoveCharacter(Camera, ForwardAmount, RightAmount, Distance, Delta, Entries, Radius);
    }

    StrictStart.copy(Camera.position);
    const Result = PreviousMoveCharacter(Camera, ForwardAmount, RightAmount, Distance, Delta, Entries, Radius);
    StrictEnd.copy(Camera.position);

    const SafeRadius = THREE.MathUtils.clamp(Number(Radius) || Number(Physics.GetSettings?.()?.DefaultRadius) || 0.255, 0.20, 0.32);
    StrictCenter.copy(StrictStart).add(StrictEnd).multiplyScalar(0.5);
    StrictCenter.y = StrictEnd.y;
    const TravelDistance = Math.hypot(StrictEnd.x - StrictStart.x, StrictEnd.z - StrictStart.z);
    const Records = CollectNearbyMeshBounds(StrictCenter, SafeRadius, TravelDistance);
    const Verified = StrictSweep(StrictStart, StrictEnd, SafeRadius, Records);

    if (!Verified.Hit) return Result;

    Camera.position.x = Verified.Position.x;
    Camera.position.z = Verified.Position.z;
    RecordStrictContact(StrictStart, StrictEnd, Verified);

    if (Result && typeof Result === "object") {
      Result.Position = Camera.position.clone();
      Result.Resolved = Camera.position.clone().sub(StrictStart);
      Result.Resolved.y = 0;
      Result.Hit = true;
      Result.StrictVerified = true;
      Result.StrictRolledBack = Boolean(Verified.RolledBack);
      Result.StrictRecovered = Boolean(Verified.Recovered);
      if (Verified.Contact?.Object) {
        Result.Object = Verified.Contact.Object;
        Result.Entry = {
          Type: `StrictMesh:${String(Verified.Contact.Object.name || "VisibleGeometry")}`,
          CollisionObject: Verified.Contact.Object,
          StrictMeshVerifierR35: true
        };
      }
      if (Verified.Contact?.Normal) Result.Normal = Verified.Contact.Normal.clone();
    }

    return Result;
  };

  Physics.__StrictMeshVerifierR35 = true;
  return true;
}

InstallStrictMovementVerifier();

window.__STORE_MOVEMENT_CONTACT__ = Contact;
window.__STORE_STRICT_MOVEMENT_VERIFIER__ = {
  Install: InstallStrictMovementVerifier,
  IsBlocked,
  FindDeepestPenetration,
  CollectNearbyMeshBounds
};
window.__STORE_MOVEMENT_CONTACT_COMPAT_BUILD__ = "V0.35.5-STRICT-MESH";
