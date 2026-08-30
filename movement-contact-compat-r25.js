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
if (!Number.isFinite(Contact.IntentInward)) Contact.IntentInward = 0;
if (!Number.isFinite(Contact.PenetrationDepth)) Contact.PenetrationDepth = 0;
if (typeof Contact.Sliding !== "boolean") Contact.Sliding = false;
if (typeof Contact.Type !== "string") Contact.Type = "";

const TRIANGLE_SKIN = 0.010;
const TRIANGLE_SAMPLE_SPACING = 0.024;
const TRIANGLE_BINARY_STEPS = 14;
const TRIANGLE_PUSH_PASSES = 10;
const TRIANGLE_MAX_PUSH = 0.12;

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
  Correction: new THREE.Vector3()
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
  Scratch.Start.copy(Start);
  Scratch.End.copy(End);
  Scratch.Start.y = End.y;

  const Distance = Math.hypot(
    Scratch.End.x - Scratch.Start.x,
    Scratch.End.z - Scratch.Start.z
  );

  const StartHit = PositionBlocked(Scratch.Start, Radius, Records);
  if (StartHit) {
    if (
      HasLastVerifiedPosition &&
      Math.hypot(
        LastVerifiedPosition.x - Scratch.Start.x,
        LastVerifiedPosition.z - Scratch.Start.z
      ) < 1.5
    ) {
      Scratch.Safe.copy(LastVerifiedPosition);
      Scratch.Safe.y = End.y;
      if (!PositionBlocked(Scratch.Safe, Radius, Records)) {
        return {
          Position: Scratch.Safe.clone(),
          Hit: true,
          Contact: StartHit,
          Recovered: true,
          UsedLastSafe: true
        };
      }
    }

    const Recovery = PushOutIfEmbedded(Scratch.Start, Radius, Records);
    return {
      Position: Recovery.Position,
      Hit: Recovery.Hit,
      Contact: Recovery.Contact || StartHit,
      Recovered: Recovery.Hit
    };
  }

  if (Distance <= 0.00001) {
    LastVerifiedPosition.copy(End);
    HasLastVerifiedPosition = true;
    return { Position: End.clone(), Hit: false, Contact: null };
  }

  const Steps = THREE.MathUtils.clamp(
    Math.ceil(Distance / TRIANGLE_SAMPLE_SPACING),
    2,
    28
  );

  let LastSafeFraction = 0;
  let FirstBlockedFraction = -1;
  let BlockingContact = null;

  for (let Step = 1; Step <= Steps; Step += 1) {
    const Fraction = Step / Steps;
    Scratch.Candidate.lerpVectors(Scratch.Start, Scratch.End, Fraction);
    Scratch.Candidate.y = End.y;

    const Hit = PositionBlocked(Scratch.Candidate, Radius, Records);
    if (!Hit) {
      LastSafeFraction = Fraction;
      continue;
    }

    FirstBlockedFraction = Fraction;
    BlockingContact = Hit;
    break;
  }

  if (FirstBlockedFraction < 0) {
    LastVerifiedPosition.copy(End);
    HasLastVerifiedPosition = true;
    return { Position: End.clone(), Hit: false, Contact: null };
  }

  let Low = LastSafeFraction;
  let High = FirstBlockedFraction;

  for (let Binary = 0; Binary < TRIANGLE_BINARY_STEPS; Binary += 1) {
    const Mid = (Low + High) * 0.5;
    Scratch.Candidate.lerpVectors(Scratch.Start, Scratch.End, Mid);
    Scratch.Candidate.y = End.y;

    if (PositionBlocked(Scratch.Candidate, Radius, Records)) High = Mid;
    else Low = Mid;
  }

  const Backoff = Distance > 0.00001
    ? Math.min(0.014 / Distance, 0.10)
    : 0;
  const SafeFraction = Math.max(0, Low - Backoff);

  Scratch.Safe.lerpVectors(
    Scratch.Start,
    Scratch.End,
    SafeFraction
  );
  Scratch.Safe.y = End.y;

  const Recovery = PushOutIfEmbedded(Scratch.Safe, Radius, Records);
  const FinalPosition = Recovery.Position;

  LastVerifiedPosition.copy(FinalPosition);
  HasLastVerifiedPosition = true;

  return {
    Position: FinalPosition,
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

  Contact.Normal.copy(Hit.Normal || Scratch.Normal.set(0, 0, 0));
  Contact.Normal.y = 0;
  if (Contact.Normal.lengthSq() > 0.00001) Contact.Normal.normalize();

  Contact.Position.copy(Verified.Position);
  Contact.DesiredDirection.copy(End).sub(Start);
  Contact.DesiredDirection.y = 0;
  if (Contact.DesiredDirection.lengthSq() > 0.00001) {
    Contact.DesiredDirection.normalize();
  }

  Contact.SlideDirection.set(0, 0, 0);
  Contact.IntentInward = Math.max(
    0,
    -Contact.DesiredDirection.dot(Contact.Normal)
  );
  Contact.Strength = THREE.MathUtils.clamp(
    0.55 + Contact.IntentInward * 0.45,
    0,
    1
  );
  Contact.PenetrationDepth = Number(Hit.Depth) || 0;
  Contact.SlideAmount = 0;
  Contact.Sliding = false;
  Contact.Type = "TriangleMesh:" + String(Hit.Object?.name || "VisibleGeometry");
  Contact.Object = Hit.Object || null;
  Contact.TriangleVerified = true;
  Contact.LastHit = performance.now();
}

function InstallStrictMovementVerifier() {
  if (
    !Physics?.MoveCharacter ||
    !Game?.Scene ||
    Physics.__StrictTriangleVerifierR35
  ) return false;

  const PreviousMoveCharacter = Physics.MoveCharacter.bind(Physics);

  Physics.MoveCharacter = function MoveCharacterWithTriangleVerifier(
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
      0.32
    );

    Scratch.Center.copy(Scratch.Start)
      .add(Scratch.End)
      .multiplyScalar(0.5);
    Scratch.Center.y = Scratch.End.y;

    const TravelDistance = Math.hypot(
      Scratch.End.x - Scratch.Start.x,
      Scratch.End.z - Scratch.Start.z
    );

    const Records = CollectNearbyMeshRecords(
      Scratch.Center,
      SafeRadius,
      TravelDistance
    );

    const Verified = StrictTriangleSweep(
      Scratch.Start,
      Scratch.End,
      SafeRadius,
      Records
    );

    if (!Verified.Hit) return Result;

    Camera.position.x = Verified.Position.x;
    Camera.position.z = Verified.Position.z;
    RecordStrictContact(Scratch.Start, Scratch.End, Verified);

    if (Result && typeof Result === "object") {
      Result.Position = Camera.position.clone();
      Result.Resolved = Camera.position.clone().sub(Scratch.Start);
      Result.Resolved.y = 0;
      Result.Hit = true;
      Result.StrictVerified = true;
      Result.TriangleVerified = true;
      Result.StrictRolledBack = Boolean(Verified.RolledBack);
      Result.StrictRecovered = Boolean(Verified.Recovered);

      if (Verified.Contact?.Object) {
        Result.Object = Verified.Contact.Object;
        Result.Entry = {
          Type: "TriangleMesh:" + String(
            Verified.Contact.Object.name || "VisibleGeometry"
          ),
          CollisionObject: Verified.Contact.Object,
          StrictTriangleVerifierR35: true
        };
      }

      if (Verified.Contact?.Normal) {
        Result.Normal = Verified.Contact.Normal.clone();
      }
    }

    return Result;
  };

  Physics.__StrictTriangleVerifierR35 = true;
  return true;
}

InstallStrictMovementVerifier();

window.__STORE_MOVEMENT_CONTACT__ = Contact;
window.__STORE_STRICT_MOVEMENT_VERIFIER__ = {
  Install: InstallStrictMovementVerifier,
  CollectNearbyMeshRecords,
  FindSphereTriangleContact,
  FindBodyTriangleContact,
  FindSegmentTriangleContact,
  ResolveSegmentAgainstTriangles,
  PositionBlocked,
  ResetLastSafe() {
    HasLastVerifiedPosition = false;
    LastVerifiedPosition.set(0, 0, 0);
  }
};

window.__STORE_MOVEMENT_CONTACT_COMPAT_BUILD__ = "V0.35.6-TRIANGLE";
