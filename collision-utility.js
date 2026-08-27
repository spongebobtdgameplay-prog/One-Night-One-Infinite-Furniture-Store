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
    let HasNormal = false;

    if (typeof Entry.GetCollisionNormal === "function") {
      try {
        Scratch.Normal.set(0, 0, 0);
        const CustomNormal = Entry.GetCollisionNormal(Position, Radius, Motion, Scratch.Normal);
        if (CustomNormal?.isVector3) Scratch.Normal.copy(CustomNormal);
        HasNormal = Scratch.Normal.lengthSq() > 0.000001;
      } catch {}
    }

    if (!HasNormal && !BoundsNormal(Position, Radius, Bounds, Motion, Scratch.Normal)) continue;
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
  ResolveObjectMove
};

window.__STORE_COLLISION_UTILITY__ = CollisionUtility;
window.__STORE_COLLISION_UTILITY_BUILD__ = "V0.27.8";

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
  ResolveObjectMove
};