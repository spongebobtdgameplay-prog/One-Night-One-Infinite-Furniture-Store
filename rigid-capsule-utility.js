import * as THREE from "three";

const BaseCollision = window.__STORE_COLLISION_UTILITY__;
if (!BaseCollision) throw new Error("Base collision utility must load before rigid capsule utility.");

const Scratch = {
  Start: new THREE.Vector3(),
  End: new THREE.Vector3(),
  CandidateStart: new THREE.Vector3(),
  CandidateEnd: new THREE.Vector3(),
  CandidatePosition: new THREE.Vector3(),
  ContactPosition: new THREE.Vector3(),
  Normal: new THREE.Vector3(),
  BestNormal: new THREE.Vector3(),
  Temp: new THREE.Vector3()
};

function CapsuleTouchesEntry(Capsule, Entry, Options = {}) {
  if (!Capsule || !Entry) return false;
  const Filter = Options.Filter || null;
  if (Filter && !Filter(Entry)) return false;
  const Bounds = BaseCollision.EntryBounds(Entry);
  if (!BaseCollision.FiniteBounds(Bounds)) return false;
  const ContactEpsilon = Math.max(0, Number(Options.ContactEpsilon) || 0.0015);
  const Radius = Math.max(0, Number(Capsule.Radius) || 0) - ContactEpsilon;
  return BaseCollision.SegmentExpandedBoundsHit(Capsule.Start, Capsule.End, Math.max(0, Radius), Bounds) !== null;
}

function CapsuleSetBlocked(Capsules, Entries, Options = {}) {
  for (const Capsule of Capsules || []) {
    for (const Entry of Entries || []) {
      if (CapsuleTouchesEntry(Capsule, Entry, Options)) return true;
    }
  }
  return false;
}

function TranslatedCapsuleSetBlocked(Capsules, Translation, Entries, Options = {}) {
  for (const Capsule of Capsules || []) {
    Scratch.CandidateStart.copy(Capsule.Start).add(Translation);
    Scratch.CandidateEnd.copy(Capsule.End).add(Translation);
    const Candidate = { Start: Scratch.CandidateStart, End: Scratch.CandidateEnd, Radius: Capsule.Radius };
    for (const Entry of Entries || []) {
      if (CapsuleTouchesEntry(Candidate, Entry, Options)) return true;
    }
  }
  return false;
}

function FindTranslatedCapsuleSetContact(Capsules, Translation, Entries, Options = {}) {
  const Filter = Options.Filter || null;
  const ContactEpsilon = Math.max(0, Number(Options.ContactEpsilon) || 0.0015);
  let Best = null;

  for (const Capsule of Capsules || []) {
    Scratch.CandidateStart.copy(Capsule.Start).add(Translation);
    Scratch.CandidateEnd.copy(Capsule.End).add(Translation);
    const Radius = Math.max(0, Number(Capsule.Radius) || 0) - ContactEpsilon;
    for (const Entry of Entries || []) {
      if (Filter && !Filter(Entry)) continue;
      const Bounds = BaseCollision.EntryBounds(Entry);
      if (!BaseCollision.FiniteBounds(Bounds)) continue;
      const Hit = BaseCollision.SegmentExpandedBoundsHit(
        Scratch.CandidateStart,
        Scratch.CandidateEnd,
        Bounds,
        Math.max(0, Radius)
      );
      if (!Hit) continue;
      if (!Best || Hit.Fraction < Best.Fraction) {
        Best = {
          Hit: true,
          Entry,
          Capsule,
          Fraction: Hit.Fraction,
          Normal: Hit.Normal.clone()
        };
      }
    }
  }

  return Best || { Hit: false, Entry: null, Capsule: null, Fraction: 1, Normal: new THREE.Vector3() };
}

function SweepCapsuleSetFraction(Capsules, Motion, Entries, Options = {}) {
  const Length = Motion.length();
  if (Length <= 0.000001) return 1;
  const MaxSweepSteps = Math.max(4, Number(Options.MaxSweepSteps) || 36);
  const BinarySteps = Math.max(5, Number(Options.BinarySteps) || 12);
  const StepLength = Math.max(0.012, Number(Options.StepLength) || 0.035);
  const StepCount = THREE.MathUtils.clamp(Math.ceil(Length / StepLength), 1, MaxSweepSteps);
  let LastSafe = 0;

  for (let Step = 1; Step <= StepCount; Step += 1) {
    const Fraction = Step / StepCount;
    Scratch.Temp.copy(Motion).multiplyScalar(Fraction);
    if (!TranslatedCapsuleSetBlocked(Capsules, Scratch.Temp, Entries, Options)) {
      LastSafe = Fraction;
      continue;
    }

    let Low = LastSafe;
    let High = Fraction;
    for (let Binary = 0; Binary < BinarySteps; Binary += 1) {
      const Mid = (Low + High) * 0.5;
      Scratch.Temp.copy(Motion).multiplyScalar(Mid);
      if (TranslatedCapsuleSetBlocked(Capsules, Scratch.Temp, Entries, Options)) High = Mid;
      else Low = Mid;
    }
    return Low;
  }

  return 1;
}

function ResolveCapsuleSetTranslation(StartPosition, Desired, Capsules, Entries, Options = {}) {
  const Motion = Scratch.Temp.copy(Desired);
  Motion.y = 0;
  const Length = Motion.length();
  if (Length <= 0.000001) {
    return {
      Position: StartPosition.clone(),
      Resolved: new THREE.Vector3(),
      Fraction: 1,
      Hit: false,
      Entry: null,
      Capsule: null,
      Normal: new THREE.Vector3()
    };
  }

  const Fraction = SweepCapsuleSetFraction(Capsules, Motion, Entries, Options);
  const Skin = Math.max(0, Number(Options.Skin) || 0.004);
  const SkinFraction = Skin / Length;
  const SafeFraction = Fraction < 0.999999 ? Math.max(0, Fraction - SkinFraction) : 1;
  const Resolved = Desired.clone().multiplyScalar(SafeFraction);
  Resolved.y = 0;
  const Position = StartPosition.clone().add(Resolved);

  if (Fraction >= 0.999999) {
    return {
      Position,
      Resolved,
      Fraction: 1,
      Hit: false,
      Entry: null,
      Capsule: null,
      Normal: new THREE.Vector3()
    };
  }

  Scratch.Temp.copy(Motion).multiplyScalar(Math.min(1, Fraction + 0.002));
  const Contact = FindTranslatedCapsuleSetContact(Capsules, Scratch.Temp, Entries, Options);
  return {
    Position,
    Resolved,
    Fraction: SafeFraction,
    Hit: true,
    Entry: Contact.Entry,
    Capsule: Contact.Capsule,
    Normal: Contact.Normal
  };
}

function ResolveHybridTranslation(StartPosition, Desired, Capsules, CoreRadius, Entries, Options = {}) {
  const StructureFilter = Options.StructureFilter || BaseCollision.IsStructure;
  const NonStructureFilter = Entry => !StructureFilter(Entry);
  const StructureResult = ResolveCapsuleSetTranslation(
    StartPosition,
    Desired,
    Capsules,
    Entries,
    {
      ...Options,
      Filter: StructureFilter
    }
  );

  const FurnitureResult = BaseCollision.ResolveHorizontalMove(
    StartPosition,
    Desired,
    Math.max(0.01, Number(CoreRadius) || 0.20),
    Entries,
    {
      Skin: Math.max(0.002, Number(Options.CoreSkin) || 0.005),
      MaxIterations: 1,
      MaxSweepSteps: Math.max(20, Number(Options.MaxSweepSteps) || 36),
      BinarySteps: Math.max(8, Number(Options.BinarySteps) || 12),
      AllowSlide: false,
      Filter: NonStructureFilter
    }
  );

  const DesiredLengthSq = Desired.lengthSq();
  const StructureDistanceSq = StructureResult.Resolved.lengthSq();
  const FurnitureDistanceSq = FurnitureResult.Resolved.lengthSq();
  let Result = StructureResult;

  if (FurnitureResult.Hit && (!StructureResult.Hit || FurnitureDistanceSq < StructureDistanceSq)) {
    Result = {
      Position: FurnitureResult.Position,
      Resolved: FurnitureResult.Resolved,
      Fraction: DesiredLengthSq > 0.000001 ? Math.sqrt(FurnitureDistanceSq / DesiredLengthSq) : 0,
      Hit: true,
      Entry: FurnitureResult.Entry,
      Capsule: null,
      Normal: FurnitureResult.Normal
    };
  }

  return Result;
}

const RigidCapsuleUtility = {
  CapsuleTouchesEntry,
  CapsuleSetBlocked,
  TranslatedCapsuleSetBlocked,
  FindTranslatedCapsuleSetContact,
  SweepCapsuleSetFraction,
  ResolveCapsuleSetTranslation,
  ResolveHybridTranslation
};

window.__STORE_RIGID_CAPSULE_UTILITY__ = RigidCapsuleUtility;
window.__STORE_RIGID_CAPSULE_UTILITY_BUILD__ = "V0.12.14";

export default RigidCapsuleUtility;
export {
  CapsuleTouchesEntry,
  CapsuleSetBlocked,
  TranslatedCapsuleSetBlocked,
  FindTranslatedCapsuleSetContact,
  SweepCapsuleSetFraction,
  ResolveCapsuleSetTranslation,
  ResolveHybridTranslation
};
