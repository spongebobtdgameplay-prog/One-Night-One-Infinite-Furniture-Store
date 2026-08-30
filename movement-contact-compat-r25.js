import * as THREE from "three";

const Contact = window.__STORE_MOVEMENT_CONTACT__ ||= {};
const ResolvedMovementFrame = window.__STORE_RESOLVED_MOVEMENT_FRAME__ ||= {};
const Game = window.__STORE_GAME__ || null;
const Physics = window.__STORE_PROCEDURAL_PHYSICS__ || null;
const Collision = window.__STORE_COLLISION_UTILITY__ || null;

function EnsureVector(Key) {
  if (!Contact[Key]?.isVector3) Contact[Key] = new THREE.Vector3();
}

function EnsureMovementFrameVector(Key) {
  if (!ResolvedMovementFrame[Key]?.isVector3) {
    ResolvedMovementFrame[Key] = new THREE.Vector3();
  }
}

for (const Key of [
  "Normal",
  "Position",
  "DesiredDirection",
  "SlideDirection",
  "CharacterFacing"
]) EnsureVector(Key);

for (const Key of [
  "Start",
  "End",
  "Requested",
  "Resolved",
  "Direction"
]) EnsureMovementFrameVector(Key);

if (!Number.isFinite(ResolvedMovementFrame.Serial)) ResolvedMovementFrame.Serial = 0;
if (!Number.isFinite(ResolvedMovementFrame.UpdatedAt)) ResolvedMovementFrame.UpdatedAt = -Infinity;

if (!Number.isFinite(Contact.Strength)) Contact.Strength = 0;
if (!Number.isFinite(Contact.SlideAmount)) Contact.SlideAmount = 0;
if (!Number.isFinite(Contact.FacingAngle)) Contact.FacingAngle = 0;
if (!Number.isFinite(Contact.LastHit)) Contact.LastHit = -Infinity;
if (!Number.isFinite(Contact.IntentInward)) Contact.IntentInward = 0;
if (!Number.isFinite(Contact.PenetrationDepth)) Contact.PenetrationDepth = 0;
if (typeof Contact.Sliding !== "boolean") Contact.Sliding = false;
if (typeof Contact.Type !== "string") Contact.Type = "";

const TRIANGLE_SKIN = 0.010;
const TRIANGLE_SAMPLE_SPACING = 0.024;
const TRIANGLE_BINARY_STEPS = 14;
const TRIANGLE_PUSH_PASSES = 10;
const TRIANGLE_MAX_PUSH = 0.12;

const FORCE_SKIN = 0.016;
const FORCE_SUBSTEP = 0.026;
const FORCE_PASSES = 8;
const FORCE_MAX_SINGLE_PUSH = 0.072;
const FORCE_MAX_TOTAL_PUSH = 0.18;
const FORCE_INTENT_PROBE = 0.045;

const CoreBodyProxyDefinitions = Object.freeze([
  { Bone: "Hips",       RadiusScale: 0.92, MinimumRadius: 0.220, Part: "hips" },
  { Bone: "Abdomen",    RadiusScale: 0.96, MinimumRadius: 0.228, Part: "abdomen" },
  { Bone: "Torso",      RadiusScale: 1.00, MinimumRadius: 0.238, Part: "torso" },
  { Bone: "Chest",      RadiusScale: 1.04, MinimumRadius: 0.248, Part: "chest" },
  { Bone: "Neck",       RadiusScale: 0.60, MinimumRadius: 0.145, Part: "neck" },
  { Bone: "Shoulder.L", RadiusScale: 0.62, MinimumRadius: 0.150, Part: "shoulder-left" },
  { Bone: "Shoulder.R", RadiusScale: 0.62, MinimumRadius: 0.150, Part: "shoulder-right" },
  { Bone: "UpperLeg.L", RadiusScale: 0.72, MinimumRadius: 0.174, Part: "upper-leg-left" },
  { Bone: "UpperLeg.R", RadiusScale: 0.72, MinimumRadius: 0.174, Part: "upper-leg-right" },
  { Bone: "LowerLeg.L", RadiusScale: 0.60, MinimumRadius: 0.152, Part: "lower-leg-left" },
  { Bone: "LowerLeg.R", RadiusScale: 0.60, MinimumRadius: 0.152, Part: "lower-leg-right" }
]);

const CoreBodyProxySamples = CoreBodyProxyDefinitions.map(Definition => ({
  ...Definition,
  Point: new THREE.Vector3(),
  Radius: Definition.MinimumRadius
}));

const BodyProfile = Object.freeze([
  { Height: 0.12, RadiusScale: 0.88 },
  { Height: 0.29, RadiusScale: 1.00 },
  { Height: 0.47, RadiusScale: 1.08 },
  { Height: 0.65, RadiusScale: 1.10 },
  { Height: 0.81, RadiusScale: 1.04 },
  { Height: 0.93, RadiusScale: 0.78 }
]);

const MeshCache = new WeakMap();
const ChunkMeshCache = new WeakMap();
let LastVerifiedPosition = new THREE.Vector3();
let HasLastVerifiedPosition = false;

const Scratch = {
  Start: new THREE.Vector3(),
  End: new THREE.Vector3(),
  Candidate: new THREE.Vector3(),
  Center: new THREE.Vector3(),
  Sample: new THREE.Vector3(),
  LocalPoint: new THREE.Vector3(),
  LocalClosest: new THREE.Vector3(),
  WorldClosest: new THREE.Vector3(),
  Delta: new THREE.Vector3(),
  Normal: new THREE.Vector3(),
  LocalNormal: new THREE.Vector3(),
  Scale: new THREE.Vector3(),
  TriA: new THREE.Vector3(),
  TriB: new THREE.Vector3(),
  TriC: new THREE.Vector3(),
  Triangle: new THREE.Triangle(),
  MatrixWorld: new THREE.Matrix4(),
  InverseMatrix: new THREE.Matrix4(),
  Safe: new THREE.Vector3(),
  SegmentEnd: new THREE.Vector3(),
  Correction: new THREE.Vector3(),
  Requested: new THREE.Vector3(),
  RequestedDirection: new THREE.Vector3(),
  RequestedEnd: new THREE.Vector3(),
  ConstraintTarget: new THREE.Vector3(),
  ConstraintNormal: new THREE.Vector3(),
  IntentProbe: new THREE.Vector3(),
  PivotWorld: new THREE.Vector3(),
  ForceStart: new THREE.Vector3(),
  ForceLastSafe: new THREE.Vector3()
};

function EyeHeight() {
  const Value = Number(Physics?.GetSettings?.()?.EyeHeight);
  return Number.isFinite(Value) ? Value : 1.68;
}

function IsWalkableDecoration(Object) {
  const Data = Object?.userData || {};
  const Name = String(Object?.name || "");
  return Boolean(
    Data.WalkableCarpetR87 === true ||
    Data.DecorationKind === "Rug" ||
    Data.DecorationKind === "LargeShowroomRug" ||
    /Rug|Carpet/i.test(Name)
  );
}

function IsStrictTriangleMesh(Object) {
  if (!Object?.isMesh || !Object.visible || !Object.geometry || !Object.parent) return false;

  const Name = String(Object.name || "");
  if (/^(Floor|Ceiling)$/i.test(Name)) return false;
  if (/Text|Label|Glow|Highlight|Selection|Outline|Crosshair/i.test(Name)) return false;

  let Current = Object;
  while (Current) {
    const Data = Current.userData || {};
    const CurrentName = String(Current.name || "");

    if (
      Data.IgnoreRayCollisionR35 === true ||
      Data.RemotePlayer === true ||
      CurrentName === "PlayerCharacterPivot" ||
      CurrentName.startsWith("RemotePlayer-") ||
      /FirstPersonViewModel|FirstPersonArms|CameraArms/i.test(CurrentName)
    ) return false;

    if (IsWalkableDecoration(Current)) return false;
    Current = Current.parent;
  }

  const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
  if (Materials.length && Materials.every(Material => {
    if (!Material || Material.visible === false) return true;
    return Boolean(Material.transparent && Number(Material.opacity) <= 0.08);
  })) return false;

  return true;
}

function MatrixSignature(Object) {
  const E = Object.matrixWorld.elements;
  return [
    E[0], E[1], E[2], E[4], E[5], E[6],
    E[8], E[9], E[10], E[12], E[13], E[14],
    Object.geometry?.id || 0,
    Object.geometry?.version || 0
  ].map(Value => Number(Value).toFixed(4)).join(":");
}

function RecordForMesh(Object) {
  if (!IsStrictTriangleMesh(Object)) return null;
  Object.updateWorldMatrix(true, false);

  const Signature = MatrixSignature(Object);
  const Existing = MeshCache.get(Object);
  if (Existing?.Signature === Signature) return Existing;

  const Geometry = Object.geometry;
  if (!Geometry?.attributes?.position) return null;
  if (!Geometry.boundingBox) Geometry.computeBoundingBox();
  if (!Geometry.boundingBox) return null;

  const MatrixWorld = Object.matrixWorld.clone();
  const InverseMatrix = MatrixWorld.clone().invert();
  const Bounds = Geometry.boundingBox.clone().applyMatrix4(MatrixWorld);
  if (Bounds.isEmpty()) return null;

  Object.getWorldScale(Scratch.Scale);
  const MinScale = Math.max(
    0.0001,
    Math.min(
      Math.abs(Scratch.Scale.x),
      Math.abs(Scratch.Scale.y),
      Math.abs(Scratch.Scale.z)
    )
  );

  const Position = Geometry.attributes.position;
  const Index = Geometry.index || null;
  const TriangleCount = Index
    ? Math.floor(Index.count / 3)
    : Math.floor(Position.count / 3);

  const Record = {
    Object,
    Geometry,
    Position,
    Index,
    TriangleCount,
    LocalBounds: Geometry.boundingBox.clone(),
    Bounds,
    MatrixWorld,
    InverseMatrix,
    MinScale,
    Signature
  };

  MeshCache.set(Object, Record);
  return Record;
}

function ChunkMeshSignature(Chunk) {
  const Group = Chunk?.Group;
  if (!Group) return "";
  return [
    Group.children?.length || 0,
    Group.userData?.PresentationReadyR83 ? 1 : 0,
    Group.userData?.RetailSaleDisplaysR84 ? 1 : 0,
    Group.userData?.RetailZonesR82 ? 1 : 0,
    Group.userData?.ShelfStockR83 ? 1 : 0,
    Chunk.ExternalObjects?.length || 0
  ].join(":");
}

function MeshesForChunk(Chunk) {
  if (!Chunk?.Group?.parent) return [];
  const Signature = ChunkMeshSignature(Chunk);
  const Existing = ChunkMeshCache.get(Chunk);
  if (Existing?.Signature === Signature) {
    return Existing.Meshes.filter(Object => Object?.parent && Object.visible);
  }

  const Meshes = [];
  const Seen = new Set();
  const AddTree = Root => {
    Root?.traverse?.(Object => {
      if (!IsStrictTriangleMesh(Object) || Seen.has(Object)) return;
      Seen.add(Object);
      Meshes.push(Object);
    });
  };

  AddTree(Chunk.Group);
  for (const Object of Chunk.ExternalObjects || []) AddTree(Object);

  ChunkMeshCache.set(Chunk, { Signature, Meshes });
  return Meshes;
}

function DistanceSquaredXZToBox(Position, Bounds) {
  const X = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const Z = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  const DX = Position.x - X;
  const DZ = Position.z - Z;
  return DX * DX + DZ * DZ;
}

function CollectNearbyMeshRecords(Position, Radius = 0.3, TravelDistance = 0) {
  if (!Game?.Scene?.isScene || !Position?.isVector3) return [];

  const Range = Math.max(1.7, Number(TravelDistance) + Number(Radius) + 1.25);
  const RangeSquared = Range * Range;
  const Records = [];
  const Seen = new Set();

  const AddMesh = Object => {
    if (!Object || Seen.has(Object)) return;
    Seen.add(Object);
    const Record = RecordForMesh(Object);
    if (!Record) return;
    if (DistanceSquaredXZToBox(Position, Record.Bounds) > RangeSquared) return;
    Records.push(Record);
  };

  if (Game.ActiveChunks instanceof Map && typeof Game.ChunkIndexForZ === "function") {
    const CurrentIndex = Game.ChunkIndexForZ(Position.z);
    for (let Index = CurrentIndex - 1; Index <= CurrentIndex + 1; Index += 1) {
      const Chunk = Game.ActiveChunks.get(Index);
      if (!Chunk) continue;
      for (const Object of MeshesForChunk(Chunk)) AddMesh(Object);
    }
  } else if (Game.ActiveChunks instanceof Map) {
    for (const Chunk of Game.ActiveChunks.values()) {
      for (const Object of MeshesForChunk(Chunk)) AddMesh(Object);
    }
  } else {
    Game.Scene.traverse(Object => AddMesh(Object));
  }

  // Some streaming barriers and runtime solids live outside normal chunk trees.
  for (const Object of Game.Scene.children || []) {
    const Name = String(Object?.name || "");
    if (
      Object?.userData?.RayCollisionSolidR35 === true ||
      /StreamLoading|StoreBoundary|RearStore|Wall/i.test(Name)
    ) {
      Object.traverse?.(Child => AddMesh(Child));
    }
  }

  return Records;
}

function PointNearBounds(Point, Radius, Bounds) {
  return Point.x >= Bounds.min.x - Radius && Point.x <= Bounds.max.x + Radius &&
    Point.y >= Bounds.min.y - Radius && Point.y <= Bounds.max.y + Radius &&
    Point.z >= Bounds.min.z - Radius && Point.z <= Bounds.max.z + Radius;
}

function LocalPointNearBounds(Point, Radius, Bounds) {
  return Point.x >= Bounds.min.x - Radius && Point.x <= Bounds.max.x + Radius &&
    Point.y >= Bounds.min.y - Radius && Point.y <= Bounds.max.y + Radius &&
    Point.z >= Bounds.min.z - Radius && Point.z <= Bounds.max.z + Radius;
}

function ReadTriangle(Record, TriangleIndex) {
  const Base = TriangleIndex * 3;
  let A = Base;
  let B = Base + 1;
  let C = Base + 2;

  if (Record.Index) {
    A = Record.Index.getX(Base);
    B = Record.Index.getX(Base + 1);
    C = Record.Index.getX(Base + 2);
  }

  Scratch.TriA.fromBufferAttribute(Record.Position, A);
  Scratch.TriB.fromBufferAttribute(Record.Position, B);
  Scratch.TriC.fromBufferAttribute(Record.Position, C);
  Scratch.Triangle.set(Scratch.TriA, Scratch.TriB, Scratch.TriC);
}

function FindSphereTriangleContact(Point, Radius, Records, Options = {}) {
  if (!Point?.isVector3) return null;
  const Skin = Math.max(0, Number(Options.Skin) || 0);
  const EffectiveRadius = Math.max(0.01, Number(Radius) || 0.10) + Skin;
  const HorizontalOnly = Options.HorizontalOnly === true;
  let Best = null;

  for (const Record of Records || []) {
    if (!Record?.Object?.parent || !Record.Object.visible) continue;
    if (!PointNearBounds(Point, EffectiveRadius, Record.Bounds)) continue;

    Scratch.LocalPoint.copy(Point).applyMatrix4(Record.InverseMatrix);
    const LocalRadius = EffectiveRadius / Record.MinScale;
    if (!LocalPointNearBounds(Scratch.LocalPoint, LocalRadius, Record.LocalBounds)) continue;

    for (let TriangleIndex = 0; TriangleIndex < Record.TriangleCount; TriangleIndex += 1) {
      ReadTriangle(Record, TriangleIndex);
      Scratch.Triangle.closestPointToPoint(Scratch.LocalPoint, Scratch.LocalClosest);
      Scratch.WorldClosest.copy(Scratch.LocalClosest).applyMatrix4(Record.MatrixWorld);

      Scratch.Delta.copy(Point).sub(Scratch.WorldClosest);
      const DistanceSquared = Scratch.Delta.lengthSq();
      if (DistanceSquared >= EffectiveRadius * EffectiveRadius) continue;

      const Distance = Math.sqrt(Math.max(0, DistanceSquared));
      if (Distance > 0.00001) {
        Scratch.Normal.copy(Scratch.Delta).divideScalar(Distance);
      } else {
        Scratch.Triangle.getNormal(Scratch.LocalNormal);
        Scratch.Normal.copy(Scratch.LocalNormal).transformDirection(Record.MatrixWorld);
      }

      if (HorizontalOnly) {
        Scratch.Normal.y = 0;
        if (Scratch.Normal.lengthSq() <= 0.00001) continue;
        Scratch.Normal.normalize();
      } else if (Scratch.Normal.lengthSq() > 0.00001) {
        Scratch.Normal.normalize();
      }

      const Depth = EffectiveRadius - Distance;
      if (Depth <= 0.0001) continue;
      if (Best && Depth <= Best.Depth) continue;

      Best = {
        Hit: true,
        Depth,
        Normal: Scratch.Normal.clone(),
        Point: Scratch.WorldClosest.clone(),
        Object: Record.Object,
        Record,
        TriangleIndex
      };
    }
  }

  return Best;
}

function FindBodyTriangleContact(Position, Radius, Records) {
  const Height = EyeHeight();
  const FeetY = Position.y - Height;
  let Best = null;

  for (let Index = 0; Index < BodyProfile.length; Index += 1) {
    const Profile = BodyProfile[Index];
    Scratch.Sample.set(
      Position.x,
      FeetY + Height * Profile.Height,
      Position.z
    );

    const Hit = FindSphereTriangleContact(
      Scratch.Sample,
      Radius * Profile.RadiusScale,
      Records,
      {
        Skin: TRIANGLE_SKIN,
        HorizontalOnly: true
      }
    );

    if (!Hit || (Best && Hit.Depth <= Best.Depth)) continue;
    Hit.BodySample = Index;
    Best = Hit;
  }

  return Best;
}

function FindSegmentTriangleContact(Start, End, Radius, Records, Options = {}) {
  const Length = Start.distanceTo(End);
  if (Length <= 0.00001) {
    return FindSphereTriangleContact(Start, Radius, Records, Options);
  }

  const Spacing = Math.max(0.028, Math.min(0.060, Number(Radius) * 0.44));
  const Samples = THREE.MathUtils.clamp(Math.ceil(Length / Spacing), 4, 16);
  let Best = null;

  for (let Index = 0; Index <= Samples; Index += 1) {
    const T = Index / Samples;
    Scratch.Sample.lerpVectors(Start, End, T);
    const Hit = FindSphereTriangleContact(Scratch.Sample, Radius, Records, Options);
    if (!Hit || (Best && Hit.Depth <= Best.Depth)) continue;
    Hit.SegmentT = T;
    Best = Hit;
  }

  return Best;
}

function ResolveSegmentAgainstTriangles(Start, End, Radius, Records, Result = new THREE.Vector3(), Options = {}) {
  if (!Start?.isVector3 || !End?.isVector3) {
    Result.copy(End || Start || new THREE.Vector3());
    return { Hit: false, Solved: false, Point: Result, Contact: null };
  }

  const Length = Start.distanceTo(End);
  if (Length <= 0.00001) {
    Result.copy(End);
    return { Hit: false, Solved: true, Point: Result, Contact: null };
  }

  Scratch.SegmentEnd.copy(End);
  let EverHit = false;
  let LastContact = null;

  for (let Pass = 0; Pass < 6; Pass += 1) {
    const Hit = FindSegmentTriangleContact(
      Start,
      Scratch.SegmentEnd,
      Radius,
      Records,
      {
        Skin: Math.max(0.006, Number(Options.Skin) || 0.010),
        HorizontalOnly: false
      }
    );

    if (!Hit) {
      Result.copy(Scratch.SegmentEnd);
      return {
        Hit: EverHit,
        Solved: true,
        Point: Result,
        Contact: LastContact
      };
    }

    EverHit = true;
    LastContact = Hit;
    Scratch.Correction.copy(Hit.Normal).multiplyScalar(Math.min(0.14, Hit.Depth + 0.008));
    Scratch.SegmentEnd.add(Scratch.Correction);

    Scratch.Delta.copy(Scratch.SegmentEnd).sub(Start);
    if (Scratch.Delta.lengthSq() <= 0.00001) break;
    Scratch.Delta.setLength(Length);
    Scratch.SegmentEnd.copy(Start).add(Scratch.Delta);
  }

  Result.copy(Scratch.SegmentEnd);
  return {
    Hit: EverHit,
    Solved: false,
    Point: Result,
    Contact: LastContact
  };
}


function ComputeRequestedMotion(Camera, ForwardAmount, RightAmount, Distance, Target = Scratch.Requested) {
  Target.set(0, 0, 0);
  if (!Camera?.quaternion || !Number.isFinite(Distance) || Distance <= 0) return Target;

  Scratch.TriA.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  Scratch.TriA.y = 0;
  if (Scratch.TriA.lengthSq() <= 0.000001) Scratch.TriA.set(0, 0, -1);
  else Scratch.TriA.normalize();

  Scratch.TriB.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  Scratch.TriB.y = 0;
  if (Scratch.TriB.lengthSq() <= 0.000001) Scratch.TriB.set(1, 0, 0);
  else Scratch.TriB.normalize();

  Target
    .addScaledVector(Scratch.TriA, Number(ForwardAmount) || 0)
    .addScaledVector(Scratch.TriB, Number(RightAmount) || 0);

  if (Target.lengthSq() <= 0.000001) return Target.set(0, 0, 0);
  return Target.normalize().multiplyScalar(Distance);
}

function UpdateCoreBodyProxySamples(StartPosition, CandidatePosition, Radius) {
  const Pivot = Game?.Scene?.getObjectByName?.("PlayerCharacterPivot") || null;
  const OffsetX = CandidatePosition.x - StartPosition.x;
  const OffsetZ = CandidatePosition.z - StartPosition.z;

  if (Pivot) Pivot.updateMatrixWorld(true);

  let ValidBones = 0;
  for (const Sample of CoreBodyProxySamples) {
    const Bone = Pivot?.getObjectByName?.(Sample.Bone) || null;
    Sample.Radius = Math.max(
      Sample.MinimumRadius,
      Math.max(0.20, Number(Radius) || 0.255) * Sample.RadiusScale
    );

    if (!Bone?.isBone) {
      Sample.Point.set(Number.NaN, Number.NaN, Number.NaN);
      continue;
    }

    Bone.getWorldPosition(Sample.Point);
    Sample.Point.x += OffsetX;
    Sample.Point.z += OffsetZ;
    ValidBones += 1;
  }

  return ValidBones;
}

function FindCoreBodyManifold(Position, StartPosition, Radius, Records) {
  const Contacts = [];
  let Primary = null;
  let MaxDepth = 0;

  const ValidBones = UpdateCoreBodyProxySamples(StartPosition, Position, Radius);

  if (ValidBones > 0) {
    for (const Sample of CoreBodyProxySamples) {
      if (!Number.isFinite(Sample.Point.x)) continue;

      const Hit = FindSphereTriangleContact(
        Sample.Point,
        Sample.Radius,
        Records,
        {
          Skin: FORCE_SKIN,
          HorizontalOnly: true
        }
      );

      if (!Hit) continue;
      Hit.BodyPart = Sample.Part;
      Hit.ProxyBone = Sample.Bone;
      Contacts.push(Hit);

      if (Hit.Depth > MaxDepth) {
        MaxDepth = Hit.Depth;
        Primary = Hit;
      }
    }
  } else {
    const Height = EyeHeight();
    const FeetY = Position.y - Height;

    for (let Index = 0; Index < BodyProfile.length; Index += 1) {
      const Profile = BodyProfile[Index];
      Scratch.Sample.set(
        Position.x,
        FeetY + Height * Profile.Height,
        Position.z
      );

      const Hit = FindSphereTriangleContact(
        Scratch.Sample,
        Radius * Profile.RadiusScale,
        Records,
        {
          Skin: FORCE_SKIN,
          HorizontalOnly: true
        }
      );

      if (!Hit) continue;
      Hit.BodyPart = "fallback-body-" + Index;
      Contacts.push(Hit);

      if (Hit.Depth > MaxDepth) {
        MaxDepth = Hit.Depth;
        Primary = Hit;
      }
    }
  }

  Contacts.sort((A, B) => Number(B.Depth || 0) - Number(A.Depth || 0));

  return {
    Hit: Contacts.length > 0,
    Contacts,
    Primary,
    MaxDepth
  };
}

function ClampUnrequestedTangentialDrift(Start, RequestedEnd, Position, ContactHit, Radius, Records) {
  if (!ContactHit?.Normal?.isVector3) return false;

  Scratch.ConstraintNormal.copy(ContactHit.Normal);
  Scratch.ConstraintNormal.y = 0;
  if (Scratch.ConstraintNormal.lengthSq() <= 0.000001) return false;
  Scratch.ConstraintNormal.normalize();

  Scratch.Delta.copy(RequestedEnd).sub(Start);
  Scratch.Delta.y = 0;
  const RequestedLength = Scratch.Delta.length();
  if (RequestedLength <= 0.000001) return false;

  Scratch.RequestedDirection.copy(Scratch.Delta).divideScalar(RequestedLength);
  const InwardIntent = Math.max(
    0,
    -Scratch.RequestedDirection.dot(Scratch.ConstraintNormal)
  );

  Scratch.TriA.set(
    -Scratch.ConstraintNormal.z,
    0,
    Scratch.ConstraintNormal.x
  );
  const RequestedTangent = Scratch.Delta.dot(Scratch.TriA);
  const RequestedTangentRatio = Math.abs(RequestedTangent) / RequestedLength;

  Scratch.TriB.copy(Position).sub(Start);
  Scratch.TriB.y = 0;
  const ActualTangent = Scratch.TriB.dot(Scratch.TriA);

  let MinimumTangent = Math.min(0, RequestedTangent) - 0.0035;
  let MaximumTangent = Math.max(0, RequestedTangent) + 0.0035;

  // When input is almost straight into the object, collision is not allowed
  // to turn that into skating along an edge/rail.
  if (InwardIntent > 0.78 && RequestedTangentRatio < 0.22) {
    MinimumTangent = -0.0025;
    MaximumTangent = 0.0025;
  }

  const ClampedTangent = THREE.MathUtils.clamp(
    ActualTangent,
    MinimumTangent,
    MaximumTangent
  );
  if (Math.abs(ClampedTangent - ActualTangent) <= 0.00025) return false;

  Scratch.Candidate.copy(Position).addScaledVector(
    Scratch.TriA,
    ClampedTangent - ActualTangent
  );
  Scratch.Candidate.y = Position.y;

  const Remaining = FindCoreBodyManifold(
    Scratch.Candidate,
    Start,
    Radius,
    Records
  );

  if (Remaining.Hit) return false;
  Position.copy(Scratch.Candidate);
  return true;
}

function SolveForceConstraint(Start, ProposedEnd, RequestedEnd, Radius, Records) {
  Scratch.ForceStart.copy(Start);
  Scratch.ConstraintTarget.copy(ProposedEnd);
  Scratch.ForceLastSafe.copy(Start);

  const Travel = Math.hypot(
    ProposedEnd.x - Start.x,
    ProposedEnd.z - Start.z
  );
  const Steps = THREE.MathUtils.clamp(
    Math.ceil(Math.max(Travel, 0.0001) / FORCE_SUBSTEP),
    1,
    24
  );

  let AnyHit = false;
  let Primary = null;
  let MaxDepth = 0;
  let TotalCorrection = 0;
  let ManifoldCount = 0;
  let Failed = false;

  for (let Step = 1; Step <= Steps; Step += 1) {
    const Fraction = Step / Steps;
    Scratch.ConstraintTarget.lerpVectors(Start, ProposedEnd, Fraction);
    Scratch.ConstraintTarget.y = ProposedEnd.y;

    let StepSolved = false;

    for (let Pass = 0; Pass < FORCE_PASSES; Pass += 1) {
      const Manifold = FindCoreBodyManifold(
        Scratch.ConstraintTarget,
        Start,
        Radius,
        Records
      );

      if (!Manifold.Hit) {
        StepSolved = true;
        Scratch.ForceLastSafe.copy(Scratch.ConstraintTarget);
        break;
      }

      AnyHit = true;
      ManifoldCount = Math.max(ManifoldCount, Manifold.Contacts.length);

      if (Manifold.MaxDepth > MaxDepth) {
        MaxDepth = Manifold.MaxDepth;
        Primary = Manifold.Primary;
      }

      // Build one manifold correction instead of applying contacts in
      // sequence. Sequential pushes created order-dependent sideways drag.
      Scratch.Correction.set(0, 0, 0);
      let WeightSum = 0;
      let NeededPush = 0;

      for (const Hit of Manifold.Contacts.slice(0, 6)) {
        Scratch.ConstraintNormal.copy(Hit.Normal);
        Scratch.ConstraintNormal.y = 0;
        if (Scratch.ConstraintNormal.lengthSq() <= 0.000001) continue;
        Scratch.ConstraintNormal.normalize();

        const Depth = Math.max(0.0001, Number(Hit.Depth) || 0);
        const Weight = Depth + 0.002;
        Scratch.Correction.addScaledVector(Scratch.ConstraintNormal, Weight);
        WeightSum += Weight;
        NeededPush = Math.max(
          NeededPush,
          Depth + FORCE_SKIN * 0.30
        );
      }

      if (WeightSum <= 0.0001 || Scratch.Correction.lengthSq() <= 0.000001) {
        const PrimaryNormal = Manifold.Primary?.Normal;
        if (!PrimaryNormal?.isVector3) break;
        Scratch.Correction.copy(PrimaryNormal).setY(0);
      }

      if (Scratch.Correction.lengthSq() <= 0.000001) break;
      Scratch.Correction.normalize();

      const PassPush = Math.min(
        FORCE_MAX_SINGLE_PUSH,
        Math.max(0.0015, NeededPush)
      );

      Scratch.ConstraintTarget.addScaledVector(
        Scratch.Correction,
        PassPush
      );
      TotalCorrection += PassPush;

      if (TotalCorrection >= FORCE_MAX_TOTAL_PUSH) break;
    }

    if (!StepSolved) {
      const Remaining = FindCoreBodyManifold(
        Scratch.ConstraintTarget,
        Start,
        Radius,
        Records
      );

      if (Remaining.Hit) {
        Failed = true;
        Scratch.ConstraintTarget.copy(Scratch.ForceLastSafe);
        break;
      }

      Scratch.ForceLastSafe.copy(Scratch.ConstraintTarget);
    }
  }

  // Even if the actual position is now safe, probe a few centimeters into the
  // player's requested input. This keeps contact pressure alive while the wall
  // is resisting the requested motion instead of treating the input as "stopped".
  Scratch.RequestedDirection.copy(RequestedEnd).sub(Start);
  Scratch.RequestedDirection.y = 0;
  const RequestedLength = Scratch.RequestedDirection.length();

  let IntentContact = null;
  if (RequestedLength > 0.000001) {
    Scratch.RequestedDirection.divideScalar(RequestedLength);
    Scratch.IntentProbe.copy(Scratch.ConstraintTarget)
      .addScaledVector(
        Scratch.RequestedDirection,
        Math.min(FORCE_INTENT_PROBE, RequestedLength)
      );

    const IntentManifold = FindCoreBodyManifold(
      Scratch.IntentProbe,
      Start,
      Radius,
      Records
    );

    if (IntentManifold.Hit) {
      IntentContact = IntentManifold.Primary;
      ManifoldCount = Math.max(ManifoldCount, IntentManifold.Contacts.length);
      if (!Primary || Number(IntentContact?.Depth) > MaxDepth) {
        Primary = IntentContact;
        MaxDepth = Number(IntentContact?.Depth) || MaxDepth;
      }
    }
  }

  const ContactHit = AnyHit || Boolean(IntentContact);

  if (ContactHit && Primary) {
    ClampUnrequestedTangentialDrift(
      Start,
      RequestedEnd,
      Scratch.ConstraintTarget,
      Primary,
      Radius,
      Records
    );
  }

  if (!Failed) {
    LastVerifiedPosition.copy(Scratch.ConstraintTarget);
    HasLastVerifiedPosition = true;
  } else if (
    HasLastVerifiedPosition &&
    Math.hypot(
      LastVerifiedPosition.x - Start.x,
      LastVerifiedPosition.z - Start.z
    ) < 1.25
  ) {
    const LastSafeManifold = FindCoreBodyManifold(
      LastVerifiedPosition,
      Start,
      Radius,
      Records
    );
    if (!LastSafeManifold.Hit) Scratch.ConstraintTarget.copy(LastVerifiedPosition);
  }

  const RequestedDistance = Math.max(0.000001, RequestedLength);
  const ActualDistance = Math.hypot(
    Scratch.ConstraintTarget.x - Start.x,
    Scratch.ConstraintTarget.z - Start.z
  );
  const MotionResistance = THREE.MathUtils.clamp(
    1 - ActualDistance / RequestedDistance,
    0,
    1
  );
  const CorrectionPressure = THREE.MathUtils.clamp(
    TotalCorrection / 0.12,
    0,
    1
  );

  return {
    Position: Scratch.ConstraintTarget.clone(),
    Hit: ContactHit,
    Contact: Primary,
    ManifoldCount,
    MaxDepth,
    ConstraintPressure: Math.max(MotionResistance, CorrectionPressure),
    CorrectionDistance: TotalCorrection,
    Failed,
    ForceConstrained: AnyHit
  };
}

function PushOutIfEmbedded(Position, Radius, Records) {
  const Result = Position.clone();
  let LastHit = null;
  let Shifted = false;

  for (let Pass = 0; Pass < TRIANGLE_PUSH_PASSES; Pass += 1) {
    const Hit = FindBodyTriangleContact(Result, Radius, Records);
    if (!Hit) break;

    Scratch.Normal.copy(Hit.Normal);
    Scratch.Normal.y = 0;
    if (Scratch.Normal.lengthSq() <= 0.00001) break;
    Scratch.Normal.normalize();

    LastHit = Hit;
    const Push = Math.min(
      TRIANGLE_MAX_PUSH,
      Math.max(TRIANGLE_SKIN, Hit.Depth + 0.006)
    );
    Result.addScaledVector(Scratch.Normal, Push);
    Shifted = true;
  }

  return { Position: Result, Hit: Shifted, Contact: LastHit };
}

function PositionBlocked(Position, Radius, Records) {
  return FindBodyTriangleContact(Position, Radius, Records);
}

function StrictTriangleSweep(Start, End, Radius, Records) {
  return SolveForceConstraint(Start, End, End, Radius, Records);
}


function PublishResolvedMovementFrame(Start, RequestedEnd, FinalPosition, Delta, Verified) {
  const SafeDelta = Math.max(0.001, Number(Delta) || 0.016);

  ResolvedMovementFrame.Start.copy(Start);
  ResolvedMovementFrame.End.copy(FinalPosition);
  ResolvedMovementFrame.Requested.copy(RequestedEnd).sub(Start);
  ResolvedMovementFrame.Requested.y = 0;
  ResolvedMovementFrame.Resolved.copy(FinalPosition).sub(Start);
  ResolvedMovementFrame.Resolved.y = 0;

  const RequestedDistance = ResolvedMovementFrame.Requested.length();
  const ResolvedDistance = ResolvedMovementFrame.Resolved.length();

  if (ResolvedDistance > 0.000001) {
    ResolvedMovementFrame.Direction
      .copy(ResolvedMovementFrame.Resolved)
      .divideScalar(ResolvedDistance);
  } else {
    ResolvedMovementFrame.Direction.set(0, 0, 0);
  }

  ResolvedMovementFrame.RequestedDistance = RequestedDistance;
  ResolvedMovementFrame.Distance = ResolvedDistance;
  ResolvedMovementFrame.Speed = ResolvedDistance / SafeDelta;
  ResolvedMovementFrame.Delta = SafeDelta;

  // Any visible lateral displacement must be represented by locomotion.
  // The epsilon only rejects floating-point jitter.
  ResolvedMovementFrame.HasMovement = ResolvedDistance > 0.00025;
  ResolvedMovementFrame.InputMoving = RequestedDistance > 0.00025;
  ResolvedMovementFrame.CorrectionOnly =
    ResolvedMovementFrame.HasMovement && !ResolvedMovementFrame.InputMoving;
  ResolvedMovementFrame.CollisionAdjusted =
    Boolean(Verified?.Hit) ||
    Math.abs(RequestedDistance - ResolvedDistance) > 0.0004;
  ResolvedMovementFrame.ForceConstrained = Boolean(Verified?.ForceConstrained);
  ResolvedMovementFrame.ConstraintPressure = THREE.MathUtils.clamp(
    Number(Verified?.ConstraintPressure) || 0,
    0,
    1
  );
  ResolvedMovementFrame.UpdatedAt = performance.now();
  ResolvedMovementFrame.Serial += 1;
  return ResolvedMovementFrame;
}

function RecordStrictContact(Start, RequestedEnd, Verified) {
  const Hit = Verified?.Contact;
  if (!Verified?.Hit || !Hit) return;

  EnsureVector("Normal");
  EnsureVector("Position");
  EnsureVector("DesiredDirection");
  EnsureVector("SlideDirection");

  Contact.Normal.copy(Hit.Normal || Scratch.Normal.set(0, 0, 0));
  Contact.Normal.y = 0;
  if (Contact.Normal.lengthSq() > 0.00001) Contact.Normal.normalize();

  Contact.Position.copy(Verified.Position);
  Contact.DesiredDirection.copy(RequestedEnd).sub(Start);
  Contact.DesiredDirection.y = 0;
  if (Contact.DesiredDirection.lengthSq() > 0.00001) {
    Contact.DesiredDirection.normalize();
  }

  Contact.SlideDirection.set(
    -Contact.Normal.z,
    0,
    Contact.Normal.x
  );

  Contact.IntentInward = Math.max(
    0,
    -Contact.DesiredDirection.dot(Contact.Normal)
  );
  Contact.ConstraintPressure = THREE.MathUtils.clamp(
    Number(Verified.ConstraintPressure) || 0,
    0,
    1
  );
  Contact.Strength = THREE.MathUtils.clamp(
    0.35 +
      Contact.IntentInward * 0.38 +
      Contact.ConstraintPressure * 0.42,
    0,
    1
  );
  Contact.PenetrationDepth = Number(Verified.MaxDepth || Hit.Depth) || 0;
  Contact.ManifoldCount = Number(Verified.ManifoldCount) || 1;
  Contact.BodyPart = String(Hit.BodyPart || "");
  Contact.SlideAmount = THREE.MathUtils.clamp(
    1 - Contact.IntentInward,
    0,
    1
  );
  Contact.Sliding = Contact.SlideAmount > 0.18;
  Contact.Type = "ForceTriangle:" + String(Hit.Object?.name || "VisibleGeometry");
  Contact.Object = Hit.Object || null;
  Contact.TriangleVerified = true;
  Contact.ForceConstraint = true;
  Contact.LastHit = performance.now();
}


function InstallStrictMovementVerifier() {
  if (
    !Physics?.MoveCharacter ||
    !Game?.Scene ||
    Physics.__ForceTriangleConstraintR35
  ) return false;

  const PreviousMoveCharacter = Physics.MoveCharacter.bind(Physics);

  Physics.MoveCharacter = function MoveCharacterWithForceTriangleConstraint(
    Camera,
    ForwardAmount,
    RightAmount,
    Distance,
    Delta,
    Entries,
    Radius
  ) {
    if (!Camera?.position) {
      return PreviousMoveCharacter(
        Camera,
        ForwardAmount,
        RightAmount,
        Distance,
        Delta,
        Entries,
        Radius
      );
    }

    Scratch.Start.copy(Camera.position);
    ComputeRequestedMotion(
      Camera,
      ForwardAmount,
      RightAmount,
      Distance,
      Scratch.Requested
    );
    Scratch.RequestedEnd.copy(Scratch.Start).add(Scratch.Requested);

    const Result = PreviousMoveCharacter(
      Camera,
      ForwardAmount,
      RightAmount,
      Distance,
      Delta,
      Entries,
      Radius
    );

    Scratch.End.copy(Camera.position);

    const SafeRadius = THREE.MathUtils.clamp(
      Number(Radius) ||
        Number(Physics.GetSettings?.()?.DefaultRadius) ||
        0.255,
      0.20,
      0.34
    );

    Scratch.Center.copy(Scratch.Start)
      .add(Scratch.RequestedEnd)
      .multiplyScalar(0.5);
    Scratch.Center.y = Scratch.End.y;

    const RequestedTravel = Scratch.Requested.length();
    const Records = CollectNearbyMeshRecords(
      Scratch.Center,
      SafeRadius,
      RequestedTravel
    );

    const Verified = SolveForceConstraint(
      Scratch.Start,
      Scratch.End,
      Scratch.RequestedEnd,
      SafeRadius,
      Records
    );

    Camera.position.x = Verified.Position.x;
    Camera.position.z = Verified.Position.z;

    PublishResolvedMovementFrame(
      Scratch.Start,
      Scratch.RequestedEnd,
      Camera.position,
      Delta,
      Verified
    );

    if (Verified.Hit) {
      RecordStrictContact(
        Scratch.Start,
        Scratch.RequestedEnd,
        Verified
      );
    }

    if (Result && typeof Result === "object") {
      Result.Position = Camera.position.clone();
      Result.Resolved = Camera.position.clone().sub(Scratch.Start);
      Result.Resolved.y = 0;
      Result.ForceConstrained = Boolean(Verified.ForceConstrained);
      Result.ConstraintPressure = Number(Verified.ConstraintPressure) || 0;
      Result.ManifoldCount = Number(Verified.ManifoldCount) || 0;

      if (Verified.Hit) {
        Result.Hit = true;
        Result.StrictVerified = true;
        Result.TriangleVerified = true;
        Result.ForceConstraint = true;

        if (Verified.Contact?.Object) {
          Result.Object = Verified.Contact.Object;
          Result.Entry = {
            Type: "ForceTriangle:" + String(
              Verified.Contact.Object.name || "VisibleGeometry"
            ),
            CollisionObject: Verified.Contact.Object,
            ForceTriangleConstraintR35: true
          };
        }

        if (Verified.Contact?.Normal) {
          Result.Normal = Verified.Contact.Normal.clone();
        }
      }
    }

    return Result;
  };

  Physics.__ForceTriangleConstraintR35 = true;
  return true;
}


InstallStrictMovementVerifier();

window.__STORE_MOVEMENT_CONTACT__ = Contact;
window.__STORE_STRICT_MOVEMENT_VERIFIER__ = {
  Install: InstallStrictMovementVerifier,
  CollectNearbyMeshRecords,
  FindSphereTriangleContact,
  FindBodyTriangleContact,
  FindCoreBodyManifold,
  FindSegmentTriangleContact,
  ResolveSegmentAgainstTriangles,
  SolveForceConstraint,
  PositionBlocked,
  ResetLastSafe() {
    HasLastVerifiedPosition = false;
    LastVerifiedPosition.set(0, 0, 0);
  }
};

window.__STORE_MOVEMENT_CONTACT_COMPAT_BUILD__ = "V0.35.11-RESOLVED-MOTION";
