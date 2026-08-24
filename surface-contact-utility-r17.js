import * as THREE from "three";

const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Collision) throw new Error("Base collision utility must load before surface contact utility.");

const Scratch = {
  DesiredDirection: new THREE.Vector3(),
  CandidateDirection: new THREE.Vector3(),
  CandidateEnd: new THREE.Vector3(),
  PreviousDirection: new THREE.Vector3(),
  Normal: new THREE.Vector3()
};

function BuildPushedEnd(Start, DesiredDirection, Length, Normal, Push, Result) {
  Scratch.CandidateDirection.copy(DesiredDirection).addScaledVector(Normal, Push);
  if (Scratch.CandidateDirection.lengthSq() <= 0.0000001) Scratch.CandidateDirection.copy(Normal);
  Scratch.CandidateDirection.normalize();
  Result.copy(Start).addScaledVector(Scratch.CandidateDirection, Length);
  return Result;
}

function DirectionIsClear(Start, Direction, Length, Radius, Entries, Options = {}) {
  Scratch.CandidateEnd.copy(Start).addScaledVector(Direction, Length);
  return !Collision.CapsuleBlocked(Start, Scratch.CandidateEnd, Radius, Entries, Options);
}

function ResolveSurfaceCapsule(Start, DesiredEnd, Radius, Entries, Result = new THREE.Vector3(), Options = {}) {
  const Length = Start.distanceTo(DesiredEnd);
  if (Length <= 0.000001) {
    Result.copy(DesiredEnd);
    return {
      Hit: false,
      Solved: true,
      Entry: null,
      Normal: new THREE.Vector3(),
      Point: Result,
      Direction: new THREE.Vector3()
    };
  }

  Scratch.DesiredDirection.copy(DesiredEnd).sub(Start).normalize();
  const Contact = Collision.FindCapsuleContact(Start, DesiredEnd, Radius, Entries, Options);
  if (!Contact.Hit) {
    Result.copy(DesiredEnd);
    return {
      Hit: false,
      Solved: true,
      Entry: null,
      Normal: new THREE.Vector3(),
      Fraction: 1,
      Point: Result,
      Direction: Scratch.DesiredDirection.clone()
    };
  }

  Scratch.Normal.copy(Contact.Normal);
  if (Scratch.Normal.lengthSq() <= 0.000001) {
    Result.copy(DesiredEnd);
    return {
      Hit: true,
      Solved: false,
      Entry: Contact.Entry,
      Normal: Contact.Normal.clone(),
      Fraction: Contact.Fraction,
      Point: Result,
      Direction: Scratch.DesiredDirection.clone()
    };
  }
  Scratch.Normal.normalize();

  const BinarySteps = Math.max(8, Math.floor(Number(Options.BinarySteps) || 15));
  const MaxPush = Math.max(1, Number(Options.MaxNormalPush) || 32);
  let Low = 0;
  let High = Math.max(0.015, Number(Options.InitialNormalPush) || 0.04);
  let Found = false;

  while (High <= MaxPush) {
    BuildPushedEnd(Start, Scratch.DesiredDirection, Length, Scratch.Normal, High, Scratch.CandidateEnd);
    if (!Collision.CapsuleBlocked(Start, Scratch.CandidateEnd, Radius, Entries, Options)) {
      Found = true;
      break;
    }
    Low = High;
    High *= 2;
  }

  if (Found) {
    for (let Step = 0; Step < BinarySteps; Step += 1) {
      const Mid = (Low + High) * 0.5;
      BuildPushedEnd(Start, Scratch.DesiredDirection, Length, Scratch.Normal, Mid, Scratch.CandidateEnd);
      if (Collision.CapsuleBlocked(Start, Scratch.CandidateEnd, Radius, Entries, Options)) Low = Mid;
      else High = Mid;
    }

    const Bias = Math.max(0.0005, Number(Options.ContactBias) || 0.002);
    BuildPushedEnd(Start, Scratch.DesiredDirection, Length, Scratch.Normal, High + Bias, Result);
    Scratch.CandidateDirection.copy(Result).sub(Start).normalize();
    return {
      Hit: true,
      Solved: true,
      Entry: Contact.Entry,
      Normal: Scratch.Normal.clone(),
      Fraction: Contact.Fraction,
      Point: Result,
      Direction: Scratch.CandidateDirection.clone(),
      NormalPush: High + Bias
    };
  }

  const PreviousDirection = Options.PreviousDirection;
  if (PreviousDirection?.lengthSq?.() > 0.000001) {
    Scratch.PreviousDirection.copy(PreviousDirection).normalize();
    if (DirectionIsClear(Start, Scratch.PreviousDirection, Length, Radius, Entries, Options)) {
      Result.copy(Start).addScaledVector(Scratch.PreviousDirection, Length);
      return {
        Hit: true,
        Solved: true,
        Entry: Contact.Entry,
        Normal: Scratch.Normal.clone(),
        Fraction: Contact.Fraction,
        Point: Result,
        Direction: Scratch.PreviousDirection.clone(),
        NormalPush: null
      };
    }
  }

  Result.copy(DesiredEnd);
  return {
    Hit: true,
    Solved: false,
    Entry: Contact.Entry,
    Normal: Scratch.Normal.clone(),
    Fraction: Contact.Fraction,
    Point: Result,
    Direction: Scratch.DesiredDirection.clone(),
    NormalPush: null
  };
}

const SurfaceContactUtility = {
  ResolveSurfaceCapsule
};

window.__STORE_SURFACE_CONTACT_UTILITY__ = SurfaceContactUtility;
window.__STORE_SURFACE_CONTACT_UTILITY_BUILD__ = "V0.12.16";

export default SurfaceContactUtility;
export { ResolveSurfaceCapsule };
