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
  Point: new THREE.Vector3()
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

  if (IsStructure(Entry) && FiniteBounds(Bounds)) {
    return CircleTouchesBounds(Position, Radius, Bounds);
  }

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

  if (!BestEntry && Motion?.lengthSq() > 0.000001) {
    Scratch.BestNormal.copy(Motion).normalize().multiplyScalar(-1);
  }

  return { Entry: BestEntry, Normal: Scratch.BestNormal.clone() };
}

function SweepCircleFraction(Start, Motion, Radius, Entries, Options = {}) {
  const MotionLength = Motion.length();
  if (MotionLength <= 0.000001) return 1;

  const MaxSweepSteps = Math.max(4, Number(Options.MaxSweepSteps) || 28);
  const BinarySteps = Math.max(4, Number(Options.BinarySteps) || 10);
  const StepLength = Math.max(0.022, Math.min(Radius * 0.28, 0.085));
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
  const Skin = Math.max(0.001, Number(Options.Skin) || 0.007);
  const MaxIterations = Math.max(1, Number(Options.MaxIterations) || 3);
  const AllowSlide = Options.AllowSlide !== false;
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
    if (Scratch.BestNormal.lengthSq() <= 0.5) {
      Scratch.BestNormal.copy(Scratch.Remaining).normalize().multiplyScalar(-1);
    }

    Scratch.Leftover.copy(Scratch.Remaining).multiplyScalar(1 - SafeFraction);
    const IntoSurface = Scratch.Leftover.dot(Scratch.BestNormal);
    if (IntoSurface < 0) Scratch.Leftover.addScaledVector(Scratch.BestNormal, -IntoSurface);

    if (!AllowSlide || !IsStructure(LastEntry)) {
      Scratch.Leftover.set(0, 0, 0);
    } else {
      Scratch.OriginalTangent.copy(Desired);
      Scratch.OriginalTangent.y = 0;
      const DesiredIntoSurface = Scratch.OriginalTangent.dot(Scratch.BestNormal);
      Scratch.OriginalTangent.addScaledVector(Scratch.BestNormal, -DesiredIntoSurface);
      const TangentRatio = OriginalLength > 0.000001 ? Scratch.OriginalTangent.length() / OriginalLength : 0;

      if (TangentRatio < SlideIntentThreshold || Scratch.Leftover.dot(Scratch.OriginalTangent) <= 0) {
        Scratch.Leftover.set(0, 0, 0);
      } else {
        const MaxTangent = Scratch.OriginalTangent.length() * (1 - SafeFraction);
        if (Scratch.Leftover.length() > MaxTangent && MaxTangent > 0) Scratch.Leftover.setLength(MaxTangent);
      }
    }

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

function SegmentExpandedBoundsFraction(Start, End, Bounds, Padding) {
  if (!FiniteBounds(Bounds)) return null;
  Scratch.Segment.copy(End).sub(Start);
  let Minimum = 0;
  let Maximum = 1;

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
    if (Near > Far) [Near, Far] = [Far, Near];
    Minimum = Math.max(Minimum, Near);
    Maximum = Math.min(Maximum, Far);
    if (Minimum > Maximum) return null;
  }

  return Minimum >= 0 && Minimum <= 1 ? Minimum : null;
}

function ClampSegmentToWorld(Start, End, Radius, Entries, Result = new THREE.Vector3(), Options = {}) {
  const Skin = Math.max(0, Number(Options.Skin) || 0.006);
  const Filter = Options.Filter || null;
  const Padding = Math.max(0, Radius) + Skin;
  const SegmentLength = Start.distanceTo(End);
  let Earliest = 1;
  let HitEntry = null;

  for (const Entry of Entries || []) {
    if (Filter && !Filter(Entry)) continue;
    const Bounds = EntryBounds(Entry);
    if (!FiniteBounds(Bounds)) continue;
    const Fraction = SegmentExpandedBoundsFraction(Start, End, Bounds, Padding);
    if (Fraction === null || Fraction >= Earliest) continue;
    Earliest = Fraction;
    HitEntry = Entry;
  }

  if (!HitEntry || Earliest >= 1 || SegmentLength <= 0.000001) {
    Result.copy(End);
    return { Hit: false, Entry: null, Fraction: 1, Point: Result };
  }

  const SkinFraction = Skin / SegmentLength;
  const SafeFraction = THREE.MathUtils.clamp(Earliest - SkinFraction, 0, 1);
  Result.lerpVectors(Start, End, SafeFraction);
  return { Hit: true, Entry: HitEntry, Fraction: SafeFraction, Point: Result };
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

      const MinX = Bounds.min.x - Padding;
      const MaxX = Bounds.max.x + Padding;
      const MinY = Bounds.min.y - Padding;
      const MaxY = Bounds.max.y + Padding;
      const MinZ = Bounds.min.z - Padding;
      const MaxZ = Bounds.max.z + Padding;
      const Distances = [
        [Math.abs(Result.x - MinX), "x", MinX],
        [Math.abs(MaxX - Result.x), "x", MaxX],
        [Math.abs(Result.y - MinY), "y", MinY],
        [Math.abs(MaxY - Result.y), "y", MaxY],
        [Math.abs(Result.z - MinZ), "z", MinZ],
        [Math.abs(MaxZ - Result.z), "z", MaxZ]
      ];
      Distances.sort((Left, Right) => Left[0] - Right[0]);
      Result[Distances[0][1]] = Distances[0][2];
      Hit = true;
      Changed = true;
    }
    if (!Changed) break;
  }

  return { Hit, Point: Result };
}

function ResolveObjectMove(Object, Delta, Radius, Entries, Options = {}) {
  if (!Object?.position || !Delta) return null;
  const Result = ResolveHorizontalMove(Object.position, Delta, Radius, Entries, Options);
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
  SegmentExpandedBoundsFraction,
  ClampSegmentToWorld,
  PushPointOutOfWorld,
  ResolveObjectMove
};

window.__STORE_COLLISION_UTILITY__ = CollisionUtility;
window.__STORE_COLLISION_UTILITY_BUILD__ = "V0.12.12";

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
  SegmentExpandedBoundsFraction,
  ClampSegmentToWorld,
  PushPointOutOfWorld,
  ResolveObjectMove
};