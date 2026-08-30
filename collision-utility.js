import * as THREE from "three";

const Scratch = {
  Candidate: new THREE.Vector3(),
  Position: new THREE.Vector3(),
  Remaining: new THREE.Vector3(),
  Leftover: new THREE.Vector3(),
  ContactPosition: new THREE.Vector3(),
  Normal: new THREE.Vector3(),
  BestNormal: new THREE.Vector3(),
  OriginalTangent: new THREE.Vector3(),
  Segment: new THREE.Vector3(),
  Direction: new THREE.Vector3(),
  BasisA: new THREE.Vector3(),
  BasisB: new THREE.Vector3(),
  Ring: new THREE.Vector3(),
  CandidateDirection: new THREE.Vector3(),
  PreviousDirection: new THREE.Vector3(),
  PreferredDirection: new THREE.Vector3(),
  CandidateEnd: new THREE.Vector3(),
  BestEnd: new THREE.Vector3(),
  Up: new THREE.Vector3(0, 1, 0),
  Right: new THREE.Vector3(1, 0, 0)
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
  return Boolean(Entry?.PrecisePlayerStructure || /Wall|Partition/i.test(String(Entry?.Type || "")));
}

function CircleTouchesBounds(Position, Radius, Bounds) {
  if (!FiniteBounds(Bounds)) return false;
  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  const DeltaX = Position.x - ClosestX;
  const DeltaZ = Position.z - ClosestZ;
  return DeltaX * DeltaX + DeltaZ * DeltaZ <= Radius * Radius;
}

function EntryTouchesCircle(Entry, Position, Radius) {
  if (!Entry) return false;
  const Bounds = EntryBounds(Entry);

  if (IsStructure(Entry) && FiniteBounds(Bounds)) return CircleTouchesBounds(Position, Radius, Bounds);

  if (typeof Entry.TestCollision === "function") {
    try {
      if (Entry.TestCollision(Position, Radius)) return true;
    } catch {}
  }

  if (typeof Entry.TestPlayerCollision === "function") {
    try {
      if (Entry.TestPlayerCollision(Position, Radius)) return true;
    } catch {}
    if (Entry.PreciseGeometry || Entry.LegacyCollisionDisabled) return false;
  }

  return CircleTouchesBounds(Position, Radius, Bounds);
}

function IsCircleBlocked(Position, Radius, Entries, Options = {}) {
  const Filter = Options.Filter || null;
  for (const Entry of Entries || []) {
    if (Filter && !Filter(Entry)) continue;
    if (EntryTouchesCircle(Entry, Position, Radius)) return true;
  }
  return false;
}

function BoundsNormal(Position, Radius, Bounds, Motion, Target) {
  if (!FiniteBounds(Bounds)) return false;
  const MinX = Bounds.min.x - Radius;
  const MaxX = Bounds.max.x + Radius;
  const MinZ = Bounds.min.z - Radius;
  const MaxZ = Bounds.max.z + Radius;

  if (Position.x >= MinX && Position.x <= MaxX && Position.z >= MinZ && Position.z <= MaxZ) {
    const Left = Position.x - MinX;
    const Right = MaxX - Position.x;
    const Back = Position.z - MinZ;
    const Front = MaxZ - Position.z;
    const Minimum = Math.min(Left, Right, Back, Front);

    if (Minimum === Left) Target.set(-1, 0, 0);
    else if (Minimum === Right) Target.set(1, 0, 0);
    else if (Minimum === Back) Target.set(0, 0, -1);
    else Target.set(0, 0, 1);
  } else {
    const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
    const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
    Target.set(Position.x - ClosestX, 0, Position.z - ClosestZ);
    if (Target.lengthSq() <= 0.000001) return false;
    Target.normalize();
  }

  if (Motion?.lengthSq() > 0.000001 && Motion.dot(Target) > 0) Target.multiplyScalar(-1);
  return true;
}

function FindCircleContact(Position, Radius, Motion, Entries, Options = {}) {
  const Filter = Options.Filter || null;
  let BestEntry = null;
  let BestScore = -Infinity;
  Scratch.BestNormal.set(0, 0, 0);

  for (const Entry of Entries || []) {
    if (Filter && !Filter(Entry)) continue;
    if (!EntryTouchesCircle(Entry, Position, Radius)) continue;
    const Bounds = EntryBounds(Entry);
    if (!BoundsNormal(Position, Radius, Bounds, Motion, Scratch.Normal)) continue;
    const Score = Motion?.lengthSq() > 0.000001 ? -Motion.dot(Scratch.Normal) : 1;
    if (Score <= BestScore) continue;
    BestScore = Score;
    BestEntry = Entry;
    Scratch.BestNormal.copy(Scratch.Normal);
  }

  if (!BestEntry && Motion?.lengthSq() > 0.000001) Scratch.BestNormal.copy(Motion).normalize().multiplyScalar(-1);
  return { Entry: BestEntry, Normal: Scratch.BestNormal.clone() };
}

function SweepCircleFraction(Start, Motion, Radius, Entries, Options = {}) {
  const MotionLength = Motion.length();
  if (MotionLength <= 0.000001) return 1;

  const MaxSweepSteps = Math.max(4, Number(Options.MaxSweepSteps) || 28);
  const BinarySteps = Math.max(4, Number(Options.BinarySteps) || 10);
  const StepLength = Math.max(0.018, Math.min(Math.max(Radius, 0.05) * 0.25, 0.075));
  const StepCount = THREE.MathUtils.clamp(Math.ceil(MotionLength / StepLength), 1, MaxSweepSteps);
  let LastSafe = 0;

  for (let Step = 1; Step <= StepCount; Step += 1) {
    const Fraction = Step / StepCount;
    Scratch.Candidate.copy(Start).addScaledVector(Motion, Fraction);
    if (!IsCircleBlocked(Scratch.Candidate, Radius, Entries, Options)) {
      LastSafe = Fraction;
      continue;
    }

    let Low = LastSafe;
    let High = Fraction;
    for (let Binary = 0; Binary < BinarySteps; Binary += 1) {
      const Mid = (Low + High) * 0.5;
      Scratch.Candidate.copy(Start).addScaledVector(Motion, Mid);
      if (IsCircleBlocked(Scratch.Candidate, Radius, Entries, Options)) High = Mid;
      else Low = Mid;
    }
    return Low;
  }

  return 1;
}

function ResolveHorizontalMove(Start, Desired, Radius, Entries, Options = {}) {
  const Skin = Math.max(0.001, Number(Options.Skin) || 0.006);
  const MaxIterations = Math.max(1, Number(Options.MaxIterations) || 3);
  const AllowSlide = Options.AllowSlide === true;
  const SlideIntentThreshold = THREE.MathUtils.clamp(Number(Options.SlideIntentThreshold) || 0.12, 0, 1);

  Scratch.Position.copy(Start);
  Scratch.Remaining.copy(Desired);
  Scratch.Remaining.y = 0;
  const OriginalLength = Scratch.Remaining.length();
  let Hit = false;
  let LastEntry = null;
  Scratch.BestNormal.set(0, 0, 0);

  for (let Iteration = 0; Iteration < MaxIterations; Iteration += 1) {
    if (Scratch.Remaining.lengthSq() <= 0.00000001) break;

    const RemainingLength = Scratch.Remaining.length();
    const Fraction = SweepCircleFraction(Scratch.Position, Scratch.Remaining, Radius, Entries, Options);
    if (Fraction >= 0.9995) {
      Scratch.Position.add(Scratch.Remaining);
      Scratch.Remaining.set(0, 0, 0);
      break;
    }

    Hit = true;
    const SkinFraction = Skin / Math.max(RemainingLength, 0.000001);
    const SafeFraction = Math.max(0, Fraction - SkinFraction);
    Scratch.ContactPosition.copy(Scratch.Position).addScaledVector(Scratch.Remaining, Math.min(1, Fraction + 0.003));
    Scratch.Position.addScaledVector(Scratch.Remaining, SafeFraction);

    const Contact = FindCircleContact(Scratch.ContactPosition, Radius, Scratch.Remaining, Entries, Options);
    LastEntry = Contact.Entry;
    Scratch.BestNormal.copy(Contact.Normal);
    if (Scratch.BestNormal.lengthSq() <= 0.5) Scratch.BestNormal.copy(Scratch.Remaining).normalize().multiplyScalar(-1);

    if (!AllowSlide || !IsStructure(LastEntry)) {
      Scratch.Remaining.set(0, 0, 0);
      break;
    }

    Scratch.Leftover.copy(Scratch.Remaining).multiplyScalar(1 - SafeFraction);
    const IntoSurface = Scratch.Leftover.dot(Scratch.BestNormal);
    if (IntoSurface < 0) Scratch.Leftover.addScaledVector(Scratch.BestNormal, -IntoSurface);

    Scratch.OriginalTangent.copy(Desired);
    Scratch.OriginalTangent.y = 0;
    const DesiredIntoSurface = Scratch.OriginalTangent.dot(Scratch.BestNormal);
    Scratch.OriginalTangent.addScaledVector(Scratch.BestNormal, -DesiredIntoSurface);
    const TangentRatio = OriginalLength > 0.000001 ? Scratch.OriginalTangent.length() / OriginalLength : 0;

    if (TangentRatio < SlideIntentThreshold || Scratch.Leftover.dot(Scratch.OriginalTangent) <= 0) {
      Scratch.Remaining.set(0, 0, 0);
      break;
    }

    const MaxTangent = Scratch.OriginalTangent.length() * (1 - SafeFraction);
    if (Scratch.Leftover.length() > MaxTangent && MaxTangent > 0) Scratch.Leftover.setLength(MaxTangent);
    Scratch.Remaining.copy(Scratch.Leftover);
  }

  const Resolved = Scratch.Position.clone().sub(Start);
  Resolved.y = 0;
  return {
    Position: Scratch.Position.clone(),
    Resolved,
    Hit,
    Entry: LastEntry,
    Normal: Scratch.BestNormal.clone()
  };
}

function PointInsideExpandedBounds(Point, Bounds, Padding) {
  return Point.x >= Bounds.min.x - Padding && Point.x <= Bounds.max.x + Padding &&
    Point.y >= Bounds.min.y - Padding && Point.y <= Bounds.max.y + Padding &&
    Point.z >= Bounds.min.z - Padding && Point.z <= Bounds.max.z + Padding;
}

function ExpandedBoundsExitNormal(Point, Bounds, Padding, Target) {
  const MinX = Bounds.min.x - Padding;
  const MaxX = Bounds.max.x + Padding;
  const MinY = Bounds.min.y - Padding;
  const MaxY = Bounds.max.y + Padding;
  const MinZ = Bounds.min.z - Padding;
  const MaxZ = Bounds.max.z + Padding;
  const Distances = [
    [Math.abs(Point.x - MinX), -1, 0, 0],
    [Math.abs(MaxX - Point.x), 1, 0, 0],
    [Math.abs(Point.y - MinY), 0, -1, 0],
    [Math.abs(MaxY - Point.y), 0, 1, 0],
    [Math.abs(Point.z - MinZ), 0, 0, -1],
    [Math.abs(MaxZ - Point.z), 0, 0, 1]
  ];
  Distances.sort((Left, Right) => Left[0] - Right[0]);
  Target.set(Distances[0][1], Distances[0][2], Distances[0][3]);
  return Target;
}

function SegmentExpandedBoundsHit(Start, End, Bounds, Padding) {
  if (!FiniteBounds(Bounds)) return null;
  if (PointInsideExpandedBounds(Start, Bounds, Padding)) {
    return { Fraction: 0, Normal: ExpandedBoundsExitNormal(Start, Bounds, Padding, new THREE.Vector3()) };
  }

  Scratch.Segment.copy(End).sub(Start);
  let Minimum = 0;
  let Maximum = 1;
  let HitAxis = "";
  let HitSign = 0;

  for (const Axis of ["x", "y", "z"]) {
    const Origin = Start[Axis];
    const Direction = Scratch.Segment[Axis];
    const Min = Bounds.min[Axis] - Padding;
    const Max = Bounds.max[Axis] + Padding;

    if (Math.abs(Direction) <= 0.0000001) {
      if (Origin < Min || Origin > Max) return null;
      continue;
    }

    let Near = (Min - Origin) / Direction;
    let Far = (Max - Origin) / Direction;
    let NearSign = -1;
    if (Near > Far) {
      [Near, Far] = [Far, Near];
      NearSign = 1;
    }

    if (Near > Minimum) {
      Minimum = Near;
      HitAxis = Axis;
      HitSign = NearSign;
    }
    Maximum = Math.min(Maximum, Far);
    if (Minimum > Maximum) return null;
  }

  if (Minimum < 0 || Minimum > 1) return null;
  const Normal = new THREE.Vector3();
  if (HitAxis) Normal[HitAxis] = HitSign;
  else ExpandedBoundsExitNormal(Start, Bounds, Padding, Normal);
  return { Fraction: Minimum, Normal };
}

function SegmentExpandedBoundsFraction(Start, End, Bounds, Padding) {
  return SegmentExpandedBoundsHit(Start, End, Bounds, Padding)?.Fraction ?? null;
}

function FindCapsuleContact(Start, End, Radius, Entries, Options = {}) {
  const Filter = Options.Filter || null;
  const Skin = Math.max(0, Number(Options.Skin) || 0);
  const Padding = Math.max(0, Radius) + Skin;
  let Best = null;

  for (const Entry of Entries || []) {
    if (Filter && !Filter(Entry)) continue;
    const Bounds = EntryBounds(Entry);
    if (!FiniteBounds(Bounds)) continue;
    const Hit = SegmentExpandedBoundsHit(Start, End, Bounds, Padding);
    if (!Hit) continue;
    if (!Best || Hit.Fraction < Best.Fraction) {
      Best = {
        Hit: true,
        Entry,
        Fraction: Hit.Fraction,
        Normal: Hit.Normal.clone()
      };
    }
  }

  return Best || { Hit: false, Entry: null, Fraction: 1, Normal: new THREE.Vector3() };
}

function CapsuleBlocked(Start, End, Radius, Entries, Options = {}) {
  return FindCapsuleContact(Start, End, Radius, Entries, Options).Hit;
}

function BuildDirectionBasis(Direction) {
  const Reference = Math.abs(Direction.dot(Scratch.Up)) < 0.88 ? Scratch.Up : Scratch.Right;
  Scratch.BasisA.crossVectors(Direction, Reference);
  if (Scratch.BasisA.lengthSq() <= 0.000001) Scratch.BasisA.set(1, 0, 0);
  else Scratch.BasisA.normalize();
  Scratch.BasisB.crossVectors(Direction, Scratch.BasisA).normalize();
}

function DirectionPreferenceScore(Direction, PreviousDirection, PreferredDirection) {
  let Score = 0;
  if (PreviousDirection?.lengthSq?.() > 0.000001) {
    Scratch.PreviousDirection.copy(PreviousDirection).normalize();
    Score += (1 - THREE.MathUtils.clamp(Direction.dot(Scratch.PreviousDirection), -1, 1)) * 0.34;
  }
  if (PreferredDirection?.lengthSq?.() > 0.000001) {
    Scratch.PreferredDirection.copy(PreferredDirection).normalize();
    Score += (1 - THREE.MathUtils.clamp(Direction.dot(Scratch.PreferredDirection), -1, 1)) * 0.08;
  }
  return Score;
}

function ResolveFixedLengthCapsule(Start, DesiredEnd, Radius, Entries, Result = new THREE.Vector3(), Options = {}) {
  const Length = Start.distanceTo(DesiredEnd);
  if (Length <= 0.000001) {
    Result.copy(DesiredEnd);
    return { Hit: false, Solved: true, Entry: null, Normal: new THREE.Vector3(), Point: Result, Direction: new THREE.Vector3() };
  }

  Scratch.Direction.copy(DesiredEnd).sub(Start).normalize();
  const Initial = FindCapsuleContact(Start, DesiredEnd, Radius, Entries, Options);
  if (!Initial.Hit) {
    Result.copy(DesiredEnd);
    return { Hit: false, Solved: true, Entry: null, Normal: new THREE.Vector3(), Point: Result, Direction: Scratch.Direction.clone() };
  }

  const PreviousDirection = Options.PreviousDirection || null;
  const PreferredDirection = Options.PreferredDirection || null;
  let BestScore = Infinity;
  let Solved = false;
  Scratch.BestEnd.copy(DesiredEnd);

  if (PreviousDirection?.lengthSq?.() > 0.000001) {
    Scratch.CandidateDirection.copy(PreviousDirection).normalize();
    Scratch.CandidateEnd.copy(Start).addScaledVector(Scratch.CandidateDirection, Length);
    if (!CapsuleBlocked(Start, Scratch.CandidateEnd, Radius, Entries, Options)) {
      const Dot = THREE.MathUtils.clamp(Scratch.Direction.dot(Scratch.CandidateDirection), -1, 1);
      BestScore = Math.acos(Dot) + DirectionPreferenceScore(Scratch.CandidateDirection, PreviousDirection, PreferredDirection);
      Scratch.BestEnd.copy(Scratch.CandidateEnd);
      Solved = true;
    }
  }

  BuildDirectionBasis(Scratch.Direction);
  const AngleStep = THREE.MathUtils.degToRad(Math.max(4, Number(Options.AngleStepDegrees) || 7));
  const MaxAngle = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(Number(Options.MaxAngleDegrees) || 112, 30, 160));
  const AzimuthSteps = THREE.MathUtils.clamp(Math.floor(Number(Options.AzimuthSteps) || 16), 8, 32);

  for (let Angle = AngleStep; Angle <= MaxAngle + 0.0001; Angle += AngleStep) {
    const CosAngle = Math.cos(Angle);
    const SinAngle = Math.sin(Angle);
    let FoundAtAngle = false;

    for (let Index = 0; Index < AzimuthSteps; Index += 1) {
      const Azimuth = Math.PI * 2 * Index / AzimuthSteps;
      Scratch.Ring.copy(Scratch.BasisA).multiplyScalar(Math.cos(Azimuth));
      Scratch.Ring.addScaledVector(Scratch.BasisB, Math.sin(Azimuth));
      Scratch.CandidateDirection.copy(Scratch.Direction).multiplyScalar(CosAngle).addScaledVector(Scratch.Ring, SinAngle).normalize();
      Scratch.CandidateEnd.copy(Start).addScaledVector(Scratch.CandidateDirection, Length);
      if (CapsuleBlocked(Start, Scratch.CandidateEnd, Radius, Entries, Options)) continue;

      const OutwardPenalty = Math.max(0, -Scratch.CandidateDirection.dot(Initial.Normal)) * 0.18;
      const Score = Angle + OutwardPenalty + DirectionPreferenceScore(Scratch.CandidateDirection, PreviousDirection, PreferredDirection);
      if (Score < BestScore) {
        BestScore = Score;
        Scratch.BestEnd.copy(Scratch.CandidateEnd);
        Solved = true;
      }
      FoundAtAngle = true;
    }

    if (FoundAtAngle && BestScore <= Angle + 0.16) break;
  }

  if (!Solved) {
    Scratch.CandidateDirection.copy(Initial.Normal).normalize();
    if (PreferredDirection?.lengthSq?.() > 0.000001) {
      Scratch.PreferredDirection.copy(PreferredDirection);
      Scratch.PreferredDirection.addScaledVector(Initial.Normal, -Scratch.PreferredDirection.dot(Initial.Normal));
      if (Scratch.PreferredDirection.lengthSq() > 0.000001) {
        Scratch.PreferredDirection.normalize();
        Scratch.CandidateDirection.addScaledVector(Scratch.PreferredDirection, 1.35).normalize();
      }
    }
    Scratch.CandidateEnd.copy(Start).addScaledVector(Scratch.CandidateDirection, Length);
    if (!CapsuleBlocked(Start, Scratch.CandidateEnd, Radius, Entries, Options)) {
      Scratch.BestEnd.copy(Scratch.CandidateEnd);
      Solved = true;
    }
  }

  Result.copy(Solved ? Scratch.BestEnd : DesiredEnd);
  Scratch.CandidateDirection.copy(Result).sub(Start);
  if (Scratch.CandidateDirection.lengthSq() > 0.000001) Scratch.CandidateDirection.normalize();
  return {
    Hit: true,
    Solved,
    Entry: Initial.Entry,
    Normal: Initial.Normal.clone(),
    Fraction: Initial.Fraction,
    Point: Result,
    Direction: Scratch.CandidateDirection.clone()
  };
}

function ClampSegmentToWorld(Start, End, Radius, Entries, Result = new THREE.Vector3(), Options = {}) {
  const Contact = FindCapsuleContact(Start, End, Radius, Entries, Options);
  if (!Contact.Hit) {
    Result.copy(End);
    return { Hit: false, Entry: null, Fraction: 1, Point: Result, Normal: new THREE.Vector3() };
  }

  const SegmentLength = Start.distanceTo(End);
  const Skin = Math.max(0, Number(Options.Skin) || 0.006);
  const SafeFraction = SegmentLength > 0.000001
    ? THREE.MathUtils.clamp(Contact.Fraction - Skin / SegmentLength, 0, 1)
    : 0;
  Result.lerpVectors(Start, End, SafeFraction);
  return { Hit: true, Entry: Contact.Entry, Fraction: SafeFraction, Point: Result, Normal: Contact.Normal };
}

function PushPointOutOfWorld(Point, Radius, Entries, Result = new THREE.Vector3(), Options = {}) {
  const Filter = Options.Filter || null;
  const Skin = Math.max(0, Number(Options.Skin) || 0.006);
  const Padding = Math.max(0, Radius) + Skin;
  Result.copy(Point);
  let Hit = false;

  for (let Pass = 0; Pass < 4; Pass += 1) {
    let Changed = false;
    for (const Entry of Entries || []) {
      if (Filter && !Filter(Entry)) continue;
      const Bounds = EntryBounds(Entry);
      if (!FiniteBounds(Bounds) || !PointInsideExpandedBounds(Result, Bounds, Padding)) continue;
      const Normal = ExpandedBoundsExitNormal(Result, Bounds, Padding, Scratch.Normal);
      if (Math.abs(Normal.x) > 0.5) Result.x = Normal.x < 0 ? Bounds.min.x - Padding : Bounds.max.x + Padding;
      else if (Math.abs(Normal.y) > 0.5) Result.y = Normal.y < 0 ? Bounds.min.y - Padding : Bounds.max.y + Padding;
      else Result.z = Normal.z < 0 ? Bounds.min.z - Padding : Bounds.max.z + Padding;
      Hit = true;
      Changed = true;
    }
    if (!Changed) break;
  }

  return { Hit, Point: Result };
}

function ResolveObjectMove(Object, Delta, Radius, Entries, Options = {}) {
  if (!Object?.position || !Delta) return null;
  const MoveOptions = { ...Options, AllowSlide: Options.AllowSlide === true };
  const Result = ResolveHorizontalMove(Object.position, Delta, Radius, Entries, MoveOptions);
  Object.position.x = Result.Position.x;
  Object.position.z = Result.Position.z;
  return Result;
}


const RayWorld = {
  Raycaster: new THREE.Raycaster(),
  Bounds: new THREE.Box3(),
  Direction: new THREE.Vector3(),
  Side: new THREE.Vector3(),
  Origin: new THREE.Vector3(),
  Normal: new THREE.Vector3(),
  BasisA: new THREE.Vector3(),
  BasisB: new THREE.Vector3(),
  CandidateDirection: new THREE.Vector3(),
  CornerPoint: new THREE.Vector3(),
  CornerSeparation: new THREE.Vector3(),
  CornerBest: new THREE.Vector3(),
  RootCaches: new Map(),
  RootBounds: new WeakMap()
};

function HasRayIgnoreAncestor(Object, Mode = "movement") {
  let Current = Object;
  while (Current) {
    const Data = Current.userData || {};
    const Name = String(Current.name || "");

    if (
      Data.IgnoreRayCollisionR35 === true ||
      Data.RemotePlayer === true ||
      Name === "PlayerCharacterPivot" ||
      Name.startsWith("RemotePlayer-") ||
      /FirstPersonViewModel|FirstPersonArms|CameraArms/i.test(Name)
    ) return true;

    if (
      Mode !== "support" &&
      (
        Data.WalkableCarpetR87 === true ||
        Data.DecorationKind === "Rug" ||
        Data.DecorationKind === "LargeShowroomRug" ||
        Data.DecorationNoCollision === true ||
        /Rug|Carpet/i.test(Name)
      )
    ) return true;

    Current = Current.parent;
  }
  return false;
}

function MeshHasVisibleMaterial(Object) {
  if (!Object?.material) return true;
  const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
  return Materials.some(Material => {
    if (!Material || Material.visible === false) return false;
    if (Material.transparent && Number(Material.opacity) <= 0.08) return false;
    return true;
  });
}

function IsVisibleRayCollisionMesh(Object, Mode = "movement") {
  const BatchedSource = Object?.userData?.RenderBatchedSourceR104 === true;
  if (
    !Object?.isMesh ||
    (!Object.visible && !BatchedSource) ||
    !Object.geometry ||
    HasRayIgnoreAncestor(Object, Mode)
  ) return false;
  if (!MeshHasVisibleMaterial(Object)) return false;

  const Name = String(Object.name || "");
  if (/Text|Label|Glow|Highlight|Selection|Outline/i.test(Name)) return false;
  if (Mode !== "support" && /^(Floor|Ceiling)$/i.test(Name)) return false;

  return true;
}

function DistanceSquaredToBoundsXZ(Bounds, Center) {
  const X = THREE.MathUtils.clamp(Center.x, Bounds.min.x, Bounds.max.x);
  const Z = THREE.MathUtils.clamp(Center.z, Bounds.min.z, Bounds.max.z);
  const DX = Center.x - X;
  const DZ = Center.z - Z;
  return DX * DX + DZ * DZ;
}

function RayRootBounds(Object) {
  Object.updateWorldMatrix(true, true);
  const E = Object.matrixWorld.elements;
  const Signature = `${E[0].toFixed(3)}:${E[2].toFixed(3)}:${E[5].toFixed(3)}:${E[8].toFixed(3)}:${E[10].toFixed(3)}:${E[12].toFixed(3)}:${E[13].toFixed(3)}:${E[14].toFixed(3)}:${Object.children?.length || 0}:${Object.visible ? 1 : 0}`;
  const Existing = RayWorld.RootBounds.get(Object);
  if (Existing?.Signature === Signature) return Existing.Bounds;

  const Bounds = new THREE.Box3().setFromObject(Object);
  RayWorld.RootBounds.set(Object, { Signature, Bounds });
  return Bounds;
}

function RaycastCandidateRoots(Scene, Center, Range = 4) {
  if (!Scene?.isScene || !Center?.isVector3) return [];
  const Game = window.__STORE_GAME__ || null;
  const SafeRange = Math.max(1.2, Number(Range) || 4);
  const Bucket = Math.ceil(SafeRange);
  const ChunkIndex = typeof Game?.ChunkIndexForZ === "function"
    ? Game.ChunkIndexForZ(Center.z)
    : 0;
  const ActiveKey = Game?.ActiveChunks
    ? [...Game.ActiveChunks.entries()]
      .filter(([Index]) => Math.abs(Index - ChunkIndex) <= 1)
      .sort((A, B) => A[0] - B[0])
      .map(([Index, Chunk]) => `${Index}:${Chunk?.Group?.children?.length || 0}`)
      .join(",")
    : "scene";
  const Key = `${ChunkIndex}:${Bucket}:${ActiveKey}`;
  const Now = performance.now();
  const Cached = RayWorld.RootCaches.get(Key);

  if (
    Cached &&
    Now - Cached.At < 120 &&
    Cached.Center.distanceToSquared(Center) < 0.30
  ) return Cached.Roots;

  const Roots = [];
  const RangeSquared = (SafeRange + 1.15) ** 2;

  const ConsiderRoot = Object => {
    if (!Object?.isObject3D || !Object.visible) return;
    if (HasRayIgnoreAncestor(Object, "movement")) return;

    const Bounds = RayRootBounds(Object);
    if (!Bounds || Bounds.isEmpty()) return;
    if (DistanceSquaredToBoundsXZ(Bounds, Center) > RangeSquared) return;
    Roots.push(Object);
  };

  if (Game?.ActiveChunks && typeof Game.ChunkIndexForZ === "function") {
    for (let Index = ChunkIndex - 1; Index <= ChunkIndex + 1; Index += 1) {
      const Chunk = Game.ActiveChunks.get(Index);
      if (!Chunk?.Group?.parent) continue;
      for (const Child of Chunk.Group.children || []) ConsiderRoot(Child);
      for (const Object of Chunk.ExternalObjects || []) ConsiderRoot(Object);
    }
  } else {
    for (const Child of Scene.children || []) ConsiderRoot(Child);
  }

  RayWorld.RootCaches.set(Key, {
    At: Now,
    Center: Center.clone(),
    Roots
  });

  if (RayWorld.RootCaches.size > 16) {
    const Oldest = [...RayWorld.RootCaches.entries()]
      .sort((A, B) => A[1].At - B[1].At)
      .slice(0, RayWorld.RootCaches.size - 12);
    for (const [OldKey] of Oldest) RayWorld.RootCaches.delete(OldKey);
  }

  return Roots;
}

function HitWorldNormal(Hit, Target = new THREE.Vector3()) {
  if (!Hit?.face?.normal || !Hit?.object?.matrixWorld) return Target.set(0, 0, 0);
  Target.copy(Hit.face.normal).transformDirection(Hit.object.matrixWorld);
  if (Target.lengthSq() > 0.000001) Target.normalize();
  return Target;
}

function RaycastVisibleGeometry(Start, Direction, Distance, Options = {}) {
  const Scene = Options.Scene || window.__STORE_GAME__?.Scene || null;
  if (!Scene?.isScene || !Start?.isVector3 || !Direction?.isVector3) return null;

  const SafeDistance = Math.max(0, Number(Distance) || 0);
  if (SafeDistance <= 0.00001 || Direction.lengthSq() <= 0.000001) return null;

  RayWorld.Direction.copy(Direction).normalize();
  const Roots = Options.Roots || RaycastCandidateRoots(
    Scene,
    Options.Center?.isVector3 ? Options.Center : Start,
    Number(Options.Range) || SafeDistance + 1.4
  );
  if (!Roots.length) return null;

  RayWorld.Raycaster.near = Math.max(0, Number(Options.Near) || 0.0005);
  RayWorld.Raycaster.far = SafeDistance;
  RayWorld.Raycaster.set(Start, RayWorld.Direction);

  const Mode = String(Options.Mode || "movement");
  const Hits = RayWorld.Raycaster.intersectObjects(Roots, true);
  for (const Hit of Hits) {
    if (!IsVisibleRayCollisionMesh(Hit.object, Mode)) continue;
    const Normal = HitWorldNormal(Hit, new THREE.Vector3());
    return {
      Hit: true,
      Distance: Hit.distance,
      Point: Hit.point.clone(),
      Normal,
      Object: Hit.object
    };
  }

  return null;
}

function RaycastVisibleSegment(Start, End, Options = {}) {
  if (!Start?.isVector3 || !End?.isVector3) return null;
  RayWorld.Direction.copy(End).sub(Start);
  const Length = RayWorld.Direction.length();
  if (Length <= 0.00001) return null;
  RayWorld.Direction.divideScalar(Length);
  return RaycastVisibleGeometry(Start, RayWorld.Direction, Length, {
    ...Options,
    Center: Options.Center?.isVector3 ? Options.Center : Start,
    Range: Number(Options.Range) || Length + 1.4
  });
}

function HorizontalRayHitNormal(Hit, Motion, Target = new THREE.Vector3()) {
  Target.copy(Hit?.Normal || RayWorld.Normal.set(0, 0, 0));
  Target.y = 0;
  if (Target.lengthSq() <= 0.000001) Target.copy(Motion).multiplyScalar(-1);
  else Target.normalize();
  if (Target.dot(Motion) > 0) Target.negate();
  return Target;
}

function SweepVisibleCapsuleHorizontal(Start, Delta, Radius, Options = {}) {
  const Scene = Options.Scene || window.__STORE_GAME__?.Scene || null;
  const ResultPosition = Start.clone();
  const Resolved = new THREE.Vector3();
  if (!Scene?.isScene || !Start?.isVector3 || !Delta?.isVector3) {
    return { Position: ResultPosition, Resolved, Hit: false, Normal: new THREE.Vector3(), Entry: null };
  }

  RayWorld.Direction.copy(Delta);
  RayWorld.Direction.y = 0;
  const Distance = RayWorld.Direction.length();
  if (Distance <= 0.000001) {
    return { Position: ResultPosition, Resolved, Hit: false, Normal: new THREE.Vector3(), Entry: null };
  }
  RayWorld.Direction.divideScalar(Distance);
  RayWorld.Side.set(RayWorld.Direction.z, 0, -RayWorld.Direction.x).normalize();

  const SafeRadius = THREE.MathUtils.clamp(Number(Radius) || 0.255, 0.16, 0.38);
  const Skin = Math.max(0.002, Number(Options.Skin) || 0.008);
  const EyeHeight = Math.max(1.2, Number(Options.EyeHeight) || 1.68);
  const FeetY = Start.y - EyeHeight;
  const HeightFractions = Options.HeightFractions || [0.09, 0.27, 0.53, 0.84];
  const LateralRatios = Options.LateralRatios || [-0.92, -0.46, 0, 0.46, 0.92];
  const Roots = RaycastCandidateRoots(
    Scene,
    Start,
    Distance + SafeRadius + (Number(Options.RangePadding) || 1.7)
  );

  let Allowed = Distance;
  let BestHit = null;

  for (const HeightFraction of HeightFractions) {
    const Y = FeetY + THREE.MathUtils.clamp(HeightFraction, 0.04, 0.96) * EyeHeight;

    for (const Ratio of LateralRatios) {
      const Lateral = THREE.MathUtils.clamp(Ratio, -0.98, 0.98) * SafeRadius;
      const Forward = Math.sqrt(Math.max(0, SafeRadius * SafeRadius - Lateral * Lateral));

      RayWorld.Origin.copy(Start)
        .addScaledVector(RayWorld.Side, Lateral)
        .addScaledVector(RayWorld.Direction, Forward);
      RayWorld.Origin.y = Y;

      const Hit = RaycastVisibleGeometry(
        RayWorld.Origin,
        RayWorld.Direction,
        Distance + Skin,
        {
          Scene,
          Roots,
          Center: Start,
          Range: Distance + SafeRadius + 1.7,
          Mode: "movement"
        }
      );
      if (!Hit) continue;

      const Candidate = THREE.MathUtils.clamp(Hit.Distance - Skin, 0, Distance);
      if (Candidate >= Allowed) continue;
      Allowed = Candidate;
      BestHit = Hit;
    }
  }

  ResultPosition.copy(Start).addScaledVector(RayWorld.Direction, Allowed);
  Resolved.copy(ResultPosition).sub(Start);
  Resolved.y = 0;

  if (!BestHit) {
    return { Position: ResultPosition, Resolved, Hit: false, Normal: new THREE.Vector3(), Entry: null };
  }

  const Normal = HorizontalRayHitNormal(BestHit, RayWorld.Direction, new THREE.Vector3());
  const Entry = {
    Type: `RayMesh:${String(BestHit.Object?.name || "VisibleGeometry")}`,
    CollisionObject: BestHit.Object,
    RaycastGeometryR35: true
  };

  return {
    Position: ResultPosition,
    Resolved,
    Hit: true,
    Normal,
    Entry,
    Object: BestHit.Object,
    HitPoint: BestHit.Point,
    AllowedDistance: Allowed,
    DesiredDistance: Distance
  };
}

function StabilizeRaycastCapsuleCorner(Position, Radius, Options = {}) {
  const EyeHeight = Math.max(1.2, Number(Options.EyeHeight) || 1.68);
  const SafeRadius = THREE.MathUtils.clamp(Number(Radius) || 0.255, 0.16, 0.38);
  const Result = Position.clone();
  const Fractions = [0.12, 0.34, 0.58, 0.82];
  let Shifted = false;

  for (let Pass = 0; Pass < 3; Pass += 1) {
    let BestDepth = 0;
    RayWorld.CornerBest.set(0, 0, 0);

    for (const Fraction of Fractions) {
      RayWorld.CornerPoint.set(
        Result.x,
        Result.y - EyeHeight + EyeHeight * Fraction,
        Result.z
      );

      const Probe = ProbeVisibleGeometrySeparation(
        RayWorld.CornerPoint,
        SafeRadius,
        RayWorld.CornerSeparation,
        {
          Scene: Options.Scene,
          Skin: Math.max(0.010, Number(Options.Skin) || 0.010)
        }
      );

      const Depth = Number(Probe?.Depth) || 0;
      if (!Probe?.Hit || Depth <= BestDepth) continue;
      BestDepth = Depth;
      RayWorld.CornerBest.copy(Probe.Separation);
    }

    if (BestDepth <= 0.0005 || RayWorld.CornerBest.lengthSq() <= 0.000001) break;

    const Push = Math.min(RayWorld.CornerBest.length(), 0.070);
    RayWorld.CornerBest.setLength(Push);
    Result.add(RayWorld.CornerBest);
    Shifted = true;
  }

  return { Position: Result, Shifted };
}

function ResolveRaycastHorizontalMove(Start, Delta, Radius, Options = {}) {
  const First = SweepVisibleCapsuleHorizontal(Start, Delta, Radius, Options);
  if (!First.Hit) return First;

  const Finish = Result => {
    const Stabilized = StabilizeRaycastCapsuleCorner(Result.Position, Radius, Options);
    if (!Stabilized.Shifted) return Result;

    const Position = Stabilized.Position;
    const Resolved = Position.clone().sub(Start);
    Resolved.y = 0;

    return {
      ...Result,
      Position,
      Resolved,
      CornerStabilized: true
    };
  };

  if (Options.AllowSlide === false) return Finish(First);

  const Desired = RayWorld.CandidateDirection.copy(Delta);
  Desired.y = 0;
  const Remaining = Desired.clone().sub(First.Resolved);
  const IntoSurface = Remaining.dot(First.Normal);
  if (IntoSurface < 0) Remaining.addScaledVector(First.Normal, -IntoSurface);

  const DesiredLength = Desired.length();
  const TangentRatio = DesiredLength > 0.000001 ? Remaining.length() / DesiredLength : 0;
  if (TangentRatio < 0.08 || Remaining.lengthSq() <= 0.000001) return Finish(First);

  // Contact removes only inward motion. Preserve tangent speed so walls
  // constrain the player without producing the old sticky/dragging feel.
  Remaining.multiplyScalar(0.995);

  const Slide = SweepVisibleCapsuleHorizontal(First.Position, Remaining, Radius, Options);
  const Position = Slide.Position.clone();
  const Resolved = Position.clone().sub(Start);
  Resolved.y = 0;

  return Finish({
    Position,
    Resolved,
    Hit: true,
    Normal: First.Normal.clone(),
    Entry: Slide.Entry || First.Entry,
    Object: Slide.Object || First.Object,
    HitPoint: First.HitPoint,
    Sliding: Slide.Resolved.lengthSq() > 0.000001,
    SlideVector: Slide.Resolved.clone()
  });
}

function ResolveRaycastCapsuleSegment(Start, End, Radius, Result = new THREE.Vector3(), Options = {}) {
  if (!Start?.isVector3 || !End?.isVector3) {
    Result.copy(End || Start || new THREE.Vector3());
    return { Hit: false, Solved: false, Point: Result, Normal: new THREE.Vector3() };
  }

  const Scene = Options.Scene || window.__STORE_GAME__?.Scene || null;
  const Length = Start.distanceTo(End);
  if (!Scene?.isScene || Length <= 0.00001) {
    Result.copy(End);
    return { Hit: false, Solved: true, Point: Result, Normal: new THREE.Vector3() };
  }

  const SafeRadius = Math.max(0, Number(Radius) || 0);
  const Skin = Math.max(0.001, Number(Options.Skin) || 0.008);
  const Roots = Array.isArray(Options.Roots)
    ? Options.Roots
    : RaycastCandidateRoots(Scene, Start, Length + SafeRadius + 1.2);

  RayWorld.CandidateDirection.copy(End).sub(Start).normalize();
  let EverHit = false;
  let LastNormal = new THREE.Vector3();

  for (let Pass = 0; Pass < 4; Pass += 1) {
    RayWorld.Direction.copy(RayWorld.CandidateDirection);
    RayWorld.BasisA.crossVectors(RayWorld.Direction, Scratch.Up);
    if (RayWorld.BasisA.lengthSq() <= 0.000001) RayWorld.BasisA.crossVectors(RayWorld.Direction, Scratch.Right);
    RayWorld.BasisA.normalize();
    RayWorld.BasisB.crossVectors(RayWorld.Direction, RayWorld.BasisA).normalize();

    const Offsets = [
      [0, 0],
      [SafeRadius * 0.92, 0],
      [-SafeRadius * 0.92, 0],
      [0, SafeRadius * 0.92],
      [0, -SafeRadius * 0.92]
    ];

    let BestHit = null;
    for (const [A, B] of Offsets) {
      RayWorld.Origin.copy(Start)
        .addScaledVector(RayWorld.BasisA, A)
        .addScaledVector(RayWorld.BasisB, B);

      const Hit = RaycastVisibleGeometry(
        RayWorld.Origin,
        RayWorld.Direction,
        Length + Skin,
        {
          Scene,
          Roots,
          Center: Start,
          Range: Length + SafeRadius + 1.2,
          Mode: "body"
        }
      );
      if (!Hit) continue;
      if (!BestHit || Hit.Distance < BestHit.Distance) BestHit = Hit;
    }

    if (!BestHit || BestHit.Distance >= Length + Skin) {
      Result.copy(Start).addScaledVector(RayWorld.CandidateDirection, Length);
      return {
        Hit: EverHit,
        Solved: true,
        Point: Result,
        Normal: LastNormal,
        Object: BestHit?.Object || null
      };
    }

    EverHit = true;
    LastNormal = HorizontalRayHitNormal(BestHit, RayWorld.CandidateDirection, new THREE.Vector3());
    if (LastNormal.lengthSq() <= 0.000001) break;

    const Into = RayWorld.CandidateDirection.dot(LastNormal);
    if (Into < 0) RayWorld.CandidateDirection.addScaledVector(LastNormal, -Into);
    RayWorld.CandidateDirection.addScaledVector(LastNormal, Math.min(0.18, (Skin + 0.010) / Length));
    if (RayWorld.CandidateDirection.lengthSq() <= 0.000001) break;
    RayWorld.CandidateDirection.normalize();
  }

  Result.copy(Start).addScaledVector(RayWorld.CandidateDirection, Length);
  return { Hit: EverHit, Solved: EverHit, Point: Result, Normal: LastNormal };
}

function ProbeVisibleGeometrySeparation(Point, Radius, Target = new THREE.Vector3(), Options = {}) {
  Target.set(0, 0, 0);
  const Scene = Options.Scene || window.__STORE_GAME__?.Scene || null;
  if (!Scene?.isScene || !Point?.isVector3) return { Hit: false, Separation: Target };

  const SafeRadius = Math.max(0.02, Number(Radius) || 0.20);
  const Skin = Math.max(0.002, Number(Options.Skin) || 0.012);
  const ProbeDistance = SafeRadius + Skin;
  const Roots = Array.isArray(Options.Roots)
    ? Options.Roots
    : RaycastCandidateRoots(Scene, Point, ProbeDistance + 1.2);
  const Directions = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [0.70710678, 0.70710678], [-0.70710678, 0.70710678],
    [0.70710678, -0.70710678], [-0.70710678, -0.70710678]
  ];

  let BestDepth = 0;
  let BestHit = null;

  for (const [X, Z] of Directions) {
    RayWorld.Direction.set(X, 0, Z);
    const Hit = RaycastVisibleGeometry(Point, RayWorld.Direction, ProbeDistance, {
      Scene,
      Roots,
      Center: Point,
      Range: ProbeDistance + 1.2,
      Mode: "body"
    });
    if (!Hit) continue;

    const Depth = ProbeDistance - Hit.Distance;
    if (Depth <= BestDepth) continue;
    const Normal = HorizontalRayHitNormal(Hit, RayWorld.Direction, RayWorld.Normal);
    if (Normal.lengthSq() <= 0.000001) continue;

    BestDepth = Depth;
    Target.copy(Normal).multiplyScalar(Depth);
    BestHit = Hit;
  }

  return {
    Hit: BestDepth > 0.0005,
    Separation: Target,
    Depth: BestDepth,
    Object: BestHit?.Object || null
  };
}

const CollisionUtility = {
  FiniteBounds,
  EntryBounds,
  IsStructure,
  CircleTouchesBounds,
  EntryTouchesCircle,
  IsCircleBlocked,
  FindCircleContact,
  SweepCircleFraction,
  ResolveHorizontalMove,
  PointInsideExpandedBounds,
  SegmentExpandedBoundsHit,
  SegmentExpandedBoundsFraction,
  FindCapsuleContact,
  CapsuleBlocked,
  ResolveFixedLengthCapsule,
  ClampSegmentToWorld,
  PushPointOutOfWorld,
  ResolveObjectMove,
  IsVisibleRayCollisionMesh,
  RaycastCandidateRoots,
  RaycastVisibleGeometry,
  RaycastVisibleSegment,
  SweepVisibleCapsuleHorizontal,
  ResolveRaycastHorizontalMove,
  StabilizeRaycastCapsuleCorner,
  ResolveRaycastCapsuleSegment,
  ProbeVisibleGeometrySeparation
};

window.__STORE_COLLISION_UTILITY__ = CollisionUtility;
window.__STORE_COLLISION_UTILITY_BUILD__ = "V0.35.8-LOW-DRAG";

export default CollisionUtility;
export {
  FiniteBounds,
  EntryBounds,
  IsStructure,
  CircleTouchesBounds,
  EntryTouchesCircle,
  IsCircleBlocked,
  FindCircleContact,
  SweepCircleFraction,
  ResolveHorizontalMove,
  PointInsideExpandedBounds,
  SegmentExpandedBoundsHit,
  SegmentExpandedBoundsFraction,
  FindCapsuleContact,
  CapsuleBlocked,
  ResolveFixedLengthCapsule,
  ClampSegmentToWorld,
  PushPointOutOfWorld,
  ResolveObjectMove,
  IsVisibleRayCollisionMesh,
  RaycastCandidateRoots,
  RaycastVisibleGeometry,
  RaycastVisibleSegment,
  SweepVisibleCapsuleHorizontal,
  ResolveRaycastHorizontalMove,
  StabilizeRaycastCapsuleCorner,
  ResolveRaycastCapsuleSegment,
  ProbeVisibleGeometrySeparation
};
window.__STORE_COLLISION_UTILITY_BUILD__ = "V0.35.27-SHARED-RAY-ROOTS";
