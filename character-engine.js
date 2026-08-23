import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before character engine.");

const PLAYER_RADIUS_MIN = 0.28;
const PLAYER_RADIUS_MAX = 0.34;
const MOVEMENT_SKIN = 0.018;
const MOVEMENT_SWEEP_STEPS = 22;
const MOVEMENT_BINARY_STEPS = 9;
const JUMP_VELOCITY = 4.8;
const GRAVITY = 16.0;
const MAX_FALL_SPEED = 12;
const CAMERA_TARGET_HEIGHT = 1.26;
const CAMERA_RADIUS = 0.145;
const CAMERA_SKIN = 0.06;
const ARM_RADIUS = 0.105;
const HAND_EXTENSION = 0.13;
const LEG_RADIUS = 0.12;
const FOOT_EXTENSION = 0.16;
const CHAIN_ITERATIONS = 7;
const FIRST_PERSON_EYE_MIN = 0.035;
const FIRST_PERSON_EYE_MAX = 0.072;
const FIRST_PERSON_BOB_Y = 0.0035;
const FIRST_PERSON_BOB_X = 0.0022;
const FIRST_PERSON_LAND_DIP = 0.032;
const FIRST_PERSON_LAND_REBOUND = 0.009;
const FIRST_PERSON_LAND_PITCH = THREE.MathUtils.degToRad(0.68);

const State = {
  Scene: null,
  Camera: null,
  Renderer: null,
  CollisionBoxes: null,
  LastTime: performance.now(),
  JumpOffset: 0,
  VerticalVelocity: 0,
  Grounded: true,
  JumpQueued: false,
  AirTime: 0,
  LandingTime: 99,
  LandingImpact: 0,
  LastXZ: new THREE.Vector2(),
  HasXZ: false,
  MoveBlend: 0,
  WalkPhase: 0,
  SavedBones: new Map(),
  SavedPivotPosition: new THREE.Vector3(),
  SavedRenderPosition: new THREE.Vector3(),
  SavedRenderQuaternion: new THREE.Quaternion(),
  Segment: new THREE.Vector3(),
  Candidate: new THREE.Vector3(),
  Position: new THREE.Vector3(),
  ContactPoint: new THREE.Vector3(),
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  Target: new THREE.Vector3(),
  Desired: new THREE.Vector3(),
  Offset: new THREE.Vector3(),
  JointPosition: new THREE.Vector3(),
  EffectorPosition: new THREE.Vector3(),
  CurrentDirection: new THREE.Vector3(),
  TargetDirection: new THREE.Vector3(),
  JointWorldQuaternion: new THREE.Quaternion(),
  ParentWorldQuaternion: new THREE.Quaternion(),
  InverseParentQuaternion: new THREE.Quaternion(),
  DeltaQuaternion: new THREE.Quaternion(),
  DesiredWorldQuaternion: new THREE.Quaternion(),
  TempQuaternion: new THREE.Quaternion(),
  TempEuler: new THREE.Euler(),
  RootPosition: new THREE.Vector3(),
  JointMidPosition: new THREE.Vector3(),
  EndPosition: new THREE.Vector3(),
  TipDirection: new THREE.Vector3(),
  TipPosition: new THREE.Vector3(),
  TargetEnd: new THREE.Vector3(),
  CollisionNormal: new THREE.Vector3(),
  CollisionNormalB: new THREE.Vector3(),
  HitPoint: new THREE.Vector3(),
  HeadPosition: new THREE.Vector3(),
  NeckPosition: new THREE.Vector3(),
  HeadUp: new THREE.Vector3(),
  EyePosition: new THREE.Vector3(),
  SavedHeadScale: new THREE.Vector3()
};

const PoseBones = [
  "Hips", "Abdomen", "Torso", "Chest", "Neck", "Head",
  "Shoulder.L", "Shoulder.R", "UpperArm.L", "UpperArm.R",
  "LowerArm.L", "LowerArm.R", "Wrist.L", "Wrist.R",
  "UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R",
  "Foot.L", "Foot.R"
];

function Clamp01(Value) {
  return THREE.MathUtils.clamp(Value, 0, 1);
}

function Smooth(Value) {
  const T = Clamp01(Value);
  return T * T * (3 - 2 * T);
}

function ExpAlpha(Delta, Response) {
  return 1 - Math.exp(-Delta * Response);
}

function CollisionList() {
  return State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];
}

function EntryBounds(Entry) {
  return Entry?.OriginalStructureBox || Entry?.OriginalBox || Entry?.Box || Entry || null;
}

function FiniteBounds(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite) &&
    Bounds.min.x < Bounds.max.x && Bounds.min.y < Bounds.max.y && Bounds.min.z < Bounds.max.z
  );
}

function PointInsideExpandedBounds(Point, Bounds, Padding) {
  return Point.x >= Bounds.min.x - Padding && Point.x <= Bounds.max.x + Padding &&
    Point.y >= Bounds.min.y - Padding && Point.y <= Bounds.max.y + Padding &&
    Point.z >= Bounds.min.z - Padding && Point.z <= Bounds.max.z + Padding;
}

function SegmentBoundsFraction(Start, End, Bounds, Padding) {
  if (!FiniteBounds(Bounds)) return null;
  State.Segment.copy(End).sub(Start);
  let MinT = 0;
  let MaxT = 1;

  for (const Axis of ["x", "y", "z"]) {
    const Origin = Start[Axis];
    const Direction = State.Segment[Axis];
    const Min = Bounds.min[Axis] - Padding;
    const Max = Bounds.max[Axis] + Padding;

    if (Math.abs(Direction) < 0.0000001) {
      if (Origin < Min || Origin > Max) return null;
      continue;
    }

    let Near = (Min - Origin) / Direction;
    let Far = (Max - Origin) / Direction;
    if (Near > Far) [Near, Far] = [Far, Near];
    MinT = Math.max(MinT, Near);
    MaxT = Math.min(MaxT, Far);
    if (MinT > MaxT) return null;
  }

  if (MaxT < 0 || MinT > 1) return null;
  return THREE.MathUtils.clamp(Math.max(0, MinT), 0, 1);
}

function CircleTouchesBounds(Position, Radius, Bounds) {
  if (!FiniteBounds(Bounds)) return false;
  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  const DX = Position.x - ClosestX;
  const DZ = Position.z - ClosestZ;
  return DX * DX + DZ * DZ <= Radius * Radius;
}

function EntryTouchesPlayer(Entry, Position, Radius) {
  if (!Entry || Entry.PlayerCollision === false) return false;
  const Bounds = EntryBounds(Entry);
  const Type = String(Entry.Type || "");
  const IsStructure = Entry.PrecisePlayerStructure || /Wall|Partition/i.test(Type);
  const ForceSolid = /Bathroom_Toilet/i.test(Type);

  if (!IsStructure && !ForceSolid && typeof Entry.TestPlayerCollision === "function") {
    try {
      if (Entry.TestPlayerCollision(Position, Radius)) return true;
      if (Entry.PreciseGeometry || Entry.LegacyCollisionDisabled) return false;
    } catch {}
  }

  return CircleTouchesBounds(Position, Radius, Bounds);
}

function MovementBlocked(Position, Radius) {
  for (const Entry of CollisionList()) {
    if (EntryTouchesPlayer(Entry, Position, Radius)) return true;
  }
  return false;
}

function MovementRadius() {
  const Radius = Number(BasePlayer.GetPlayerRadius?.()) || 0.34;
  return THREE.MathUtils.clamp(Radius, PLAYER_RADIUS_MIN, PLAYER_RADIUS_MAX);
}

function SweepMovement(Start, Motion, Radius) {
  const Length = Motion.length();
  if (Length <= 0.000001) return 1;
  const Steps = THREE.MathUtils.clamp(Math.ceil(Length / 0.026), 1, MOVEMENT_SWEEP_STEPS);
  let LastSafe = 0;

  for (let Step = 1; Step <= Steps; Step += 1) {
    const Fraction = Step / Steps;
    State.Candidate.copy(Start).addScaledVector(Motion, Fraction);
    if (!MovementBlocked(State.Candidate, Radius)) {
      LastSafe = Fraction;
      continue;
    }

    let Low = LastSafe;
    let High = Fraction;
    for (let Binary = 0; Binary < MOVEMENT_BINARY_STEPS; Binary += 1) {
      const Mid = (Low + High) * 0.5;
      State.Candidate.copy(Start).addScaledVector(Motion, Mid);
      if (MovementBlocked(State.Candidate, Radius)) High = Mid;
      else Low = Mid;
    }
    return Low;
  }

  return 1;
}

function ResolveAxisMovement(Camera, Motion) {
  if (!Camera || Motion.lengthSq() <= 0.00000001) return;
  const Radius = MovementRadius();
  State.Position.copy(Camera.position);
  const Fraction = SweepMovement(State.Position, Motion, Radius);

  if (Fraction >= 0.9999) {
    Camera.position.add(Motion);
    return;
  }

  const Length = Motion.length();
  const SkinFraction = MOVEMENT_SKIN / Math.max(Length, 0.0001);
  const SafeFraction = Math.max(0, Fraction - SkinFraction);
  Camera.position.addScaledVector(Motion, SafeFraction);
}

const OriginalMoveForward = PointerLockControls.prototype.moveForward;
const OriginalMoveRight = PointerLockControls.prototype.moveRight;

function ControlCamera(Control) {
  return Control?.object || Control?.camera || State.Camera;
}

PointerLockControls.prototype.moveForward = function CharacterEngineMoveForward(Distance) {
  const Camera = ControlCamera(this);
  if (!Camera || Camera !== State.Camera || !Number.isFinite(Distance)) return OriginalMoveForward.call(this, Distance);
  State.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  State.Forward.y = 0;
  if (State.Forward.lengthSq() <= 0.000001) return;
  State.Forward.normalize().multiplyScalar(Distance);
  ResolveAxisMovement(Camera, State.Forward);
};

PointerLockControls.prototype.moveRight = function CharacterEngineMoveRight(Distance) {
  const Camera = ControlCamera(this);
  if (!Camera || Camera !== State.Camera || !Number.isFinite(Distance)) return OriginalMoveRight.call(this, Distance);
  State.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  State.Right.y = 0;
  if (State.Right.lengthSq() <= 0.000001) return;
  State.Right.normalize().multiplyScalar(Distance);
  ResolveAxisMovement(Camera, State.Right);
};

function UpdateFrameMotion(Camera, Delta) {
  const XZ = new THREE.Vector2(Camera.position.x, Camera.position.z);
  if (!State.HasXZ) {
    State.LastXZ.copy(XZ);
    State.HasXZ = true;
    return;
  }

  const Distance = XZ.distanceTo(State.LastXZ);
  State.LastXZ.copy(XZ);
  const Speed = Distance / Math.max(Delta, 0.001);
  const Target = THREE.MathUtils.clamp(Speed / 3.45, 0, 1);
  State.MoveBlend = THREE.MathUtils.lerp(State.MoveBlend, Target, ExpAlpha(Delta, 13));
  if (State.MoveBlend > 0.004 && State.Grounded) State.WalkPhase += Delta * THREE.MathUtils.lerp(6.4, 8.2, State.MoveBlend);
}

function UpdateJump(Delta) {
  if (State.JumpQueued && State.Grounded) {
    State.Grounded = false;
    State.VerticalVelocity = JUMP_VELOCITY;
    State.AirTime = 0;
    State.LandingTime = 99;
    State.LandingImpact = 0;
  }
  State.JumpQueued = false;

  if (!State.Grounded) {
    State.AirTime += Delta;
    State.VerticalVelocity = Math.max(-MAX_FALL_SPEED, State.VerticalVelocity - GRAVITY * Delta);
    State.JumpOffset += State.VerticalVelocity * Delta;

    if (State.JumpOffset <= 0 && State.VerticalVelocity <= 0) {
      const Impact = Math.abs(State.VerticalVelocity);
      State.JumpOffset = 0;
      State.VerticalVelocity = 0;
      State.Grounded = true;
      State.LandingTime = 0;
      State.LandingImpact = THREE.MathUtils.clamp((Impact - 2.0) / 5.5, 0.22, 1);
    }
  } else if (State.LandingTime < 99) {
    State.LandingTime += Delta;
    if (State.LandingTime > 0.55) {
      State.LandingTime = 99;
      State.LandingImpact = 0;
    }
  }

  window.__STORE_PLAYER_VERTICAL_OFFSET__ = State.JumpOffset;
}

function SavePose(Pivot) {
  State.SavedBones.clear();
  for (const Name of PoseBones) {
    const Bone = Pivot.getObjectByName(Name);
    if (Bone?.isBone) State.SavedBones.set(Bone, Bone.quaternion.clone());
  }
}

function RestorePose(Pivot) {
  for (const [Bone, Quaternion] of State.SavedBones) Bone.quaternion.copy(Quaternion);
  State.SavedBones.clear();
  Pivot.updateMatrixWorld(true);
}

function AddBoneRotation(Pivot, Name, X, Y, Z, Weight) {
  if (Weight <= 0.0001) return;
  const Bone = Pivot.getObjectByName(Name);
  if (!Bone?.isBone) return;
  State.TempEuler.set(X * Weight, Y * Weight, Z * Weight, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion).normalize();
}

function ApplyJumpPose(Pivot) {
  let Takeoff = 0;
  let Rise = 0;
  let Apex = 0;
  let Fall = 0;
  let Land = 0;

  if (!State.Grounded) {
    Takeoff = Smooth(1 - State.AirTime / 0.11);
    Rise = Clamp01(State.VerticalVelocity / JUMP_VELOCITY);
    Apex = Smooth(1 - Math.abs(State.VerticalVelocity) / 2.0);
    Fall = Clamp01(-State.VerticalVelocity / 6.0);
  } else if (State.LandingTime < 0.27) {
    Land = Smooth(1 - State.LandingTime / 0.27) * State.LandingImpact;
  }

  AddBoneRotation(Pivot, "Hips", 0.085, 0, 0, Takeoff);
  AddBoneRotation(Pivot, "Abdomen", 0.045, 0, 0, Takeoff);
  AddBoneRotation(Pivot, "Torso", 0.028, 0, 0, Takeoff);
  AddBoneRotation(Pivot, "UpperLeg.L", 0.21, 0, 0.016, Takeoff);
  AddBoneRotation(Pivot, "UpperLeg.R", 0.21, 0, -0.016, Takeoff);
  AddBoneRotation(Pivot, "LowerLeg.L", -0.39, 0, 0, Takeoff);
  AddBoneRotation(Pivot, "LowerLeg.R", -0.39, 0, 0, Takeoff);
  AddBoneRotation(Pivot, "UpperArm.L", 0.085, 0, 0.025, Takeoff);
  AddBoneRotation(Pivot, "UpperArm.R", 0.085, 0, -0.025, Takeoff);

  AddBoneRotation(Pivot, "Abdomen", -0.025, 0, 0, Rise);
  AddBoneRotation(Pivot, "UpperArm.L", -0.11, 0, 0.04, Rise);
  AddBoneRotation(Pivot, "UpperArm.R", -0.11, 0, -0.04, Rise);
  AddBoneRotation(Pivot, "LowerArm.L", -0.055, 0, 0, Rise);
  AddBoneRotation(Pivot, "LowerArm.R", -0.055, 0, 0, Rise);

  AddBoneRotation(Pivot, "UpperLeg.L", 0.075, 0, 0.012, Apex);
  AddBoneRotation(Pivot, "UpperLeg.R", 0.11, 0, -0.012, Apex);
  AddBoneRotation(Pivot, "LowerLeg.L", -0.14, 0, 0, Apex);
  AddBoneRotation(Pivot, "LowerLeg.R", -0.18, 0, 0, Apex);
  AddBoneRotation(Pivot, "Foot.L", 0.055, 0, 0, Apex);
  AddBoneRotation(Pivot, "Foot.R", 0.055, 0, 0, Apex);

  AddBoneRotation(Pivot, "Hips", 0.035, 0, 0, Fall);
  AddBoneRotation(Pivot, "UpperLeg.L", 0.095, 0, 0, Fall);
  AddBoneRotation(Pivot, "UpperLeg.R", 0.095, 0, 0, Fall);
  AddBoneRotation(Pivot, "LowerLeg.L", -0.17, 0, 0, Fall);
  AddBoneRotation(Pivot, "LowerLeg.R", -0.17, 0, 0, Fall);
  AddBoneRotation(Pivot, "Foot.L", 0.11, 0, 0, Fall);
  AddBoneRotation(Pivot, "Foot.R", 0.11, 0, 0, Fall);
  AddBoneRotation(Pivot, "UpperArm.L", -0.045, 0, 0.018, Fall);
  AddBoneRotation(Pivot, "UpperArm.R", -0.045, 0, -0.018, Fall);

  AddBoneRotation(Pivot, "Hips", 0.11, 0, 0, Land);
  AddBoneRotation(Pivot, "Abdomen", 0.052, 0, 0, Land);
  AddBoneRotation(Pivot, "Torso", 0.032, 0, 0, Land);
  AddBoneRotation(Pivot, "UpperLeg.L", 0.24, 0, 0.016, Land);
  AddBoneRotation(Pivot, "UpperLeg.R", 0.24, 0, -0.016, Land);
  AddBoneRotation(Pivot, "LowerLeg.L", -0.46, 0, 0, Land);
  AddBoneRotation(Pivot, "LowerLeg.R", -0.46, 0, 0, Land);
  AddBoneRotation(Pivot, "Foot.L", 0.10, 0, 0, Land);
  AddBoneRotation(Pivot, "Foot.R", 0.10, 0, 0, Land);
  AddBoneRotation(Pivot, "UpperArm.L", 0.055, 0, -0.018, Land);
  AddBoneRotation(Pivot, "UpperArm.R", 0.055, 0, 0.018, Land);

  Pivot.updateMatrixWorld(true);
}

function RotateJointToward(Pivot, Joint, Effector, Target, Strength) {
  if (!Joint?.isBone || !Effector?.isBone || !Joint.parent) return;
  Joint.getWorldPosition(State.JointPosition);
  Effector.getWorldPosition(State.EffectorPosition);
  State.CurrentDirection.copy(State.EffectorPosition).sub(State.JointPosition);
  State.TargetDirection.copy(Target).sub(State.JointPosition);
  if (State.CurrentDirection.lengthSq() <= 0.000001 || State.TargetDirection.lengthSq() <= 0.000001) return;

  State.CurrentDirection.normalize();
  State.TargetDirection.normalize();
  State.DeltaQuaternion.setFromUnitVectors(State.CurrentDirection, State.TargetDirection);
  Joint.getWorldQuaternion(State.JointWorldQuaternion);
  State.DesiredWorldQuaternion.copy(State.DeltaQuaternion).multiply(State.JointWorldQuaternion);
  Joint.parent.getWorldQuaternion(State.ParentWorldQuaternion);
  State.InverseParentQuaternion.copy(State.ParentWorldQuaternion).invert();
  State.TempQuaternion.copy(State.InverseParentQuaternion).multiply(State.DesiredWorldQuaternion).normalize();
  Joint.quaternion.slerp(State.TempQuaternion, THREE.MathUtils.clamp(Strength, 0, 1));
  Pivot.updateMatrixWorld(true);
}

function SurfaceNormalAtPoint(Point, Bounds, Padding, Target) {
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
  Distances.sort((A, B) => A[0] - B[0]);
  Target.set(Distances[0][1], Distances[0][2], Distances[0][3]);
  return Target;
}

function FindSegmentCollision(Start, End, Radius, NormalTarget) {
  let Earliest = Infinity;
  NormalTarget.set(0, 0, 0);

  for (const Entry of CollisionList()) {
    if (!Entry || Entry.PlayerCollision === false) continue;
    const Bounds = EntryBounds(Entry);
    const Hit = SegmentBoundsFraction(Start, End, Bounds, Radius);
    if (Hit === null || Hit >= Earliest) continue;
    Earliest = Hit;
    State.HitPoint.lerpVectors(Start, End, Hit);
    SurfaceNormalAtPoint(State.HitPoint, Bounds, Radius, NormalTarget);
  }

  return Number.isFinite(Earliest) ? Earliest : null;
}

function ChainCollision(Upper, Lower, End, Extension, Radius, NormalTarget) {
  Upper.getWorldPosition(State.RootPosition);
  Lower.getWorldPosition(State.JointMidPosition);
  End.getWorldPosition(State.EndPosition);
  State.TipDirection.copy(State.EndPosition).sub(State.JointMidPosition);
  if (State.TipDirection.lengthSq() <= 0.000001) State.TipDirection.set(0, -1, 0);
  else State.TipDirection.normalize();
  State.TipPosition.copy(State.EndPosition).addScaledVector(State.TipDirection, Extension);

  let Hit = false;
  NormalTarget.set(0, 0, 0);

  if (FindSegmentCollision(State.RootPosition, State.JointMidPosition, Radius * 0.92, State.CollisionNormalB) !== null) {
    NormalTarget.add(State.CollisionNormalB);
    Hit = true;
  }
  if (FindSegmentCollision(State.JointMidPosition, State.EndPosition, Radius, State.CollisionNormalB) !== null) {
    NormalTarget.add(State.CollisionNormalB);
    Hit = true;
  }
  if (FindSegmentCollision(State.EndPosition, State.TipPosition, Radius, State.CollisionNormalB) !== null) {
    NormalTarget.add(State.CollisionNormalB);
    Hit = true;
  }

  if (Hit) {
    if (NormalTarget.lengthSq() <= 0.000001) NormalTarget.set(0, 1, 0);
    else NormalTarget.normalize();
  }
  return Hit;
}

function SolveChain(Pivot, Upper, Lower, End, TargetEnd) {
  for (let Iteration = 0; Iteration < CHAIN_ITERATIONS; Iteration += 1) {
    RotateJointToward(Pivot, Lower, End, TargetEnd, 0.82);
    RotateJointToward(Pivot, Upper, End, TargetEnd, 0.72);
  }
}

function ConstrainChain(Pivot, UpperName, LowerName, EndName, Radius, Extension) {
  const Upper = Pivot.getObjectByName(UpperName);
  const Lower = Pivot.getObjectByName(LowerName);
  const End = Pivot.getObjectByName(EndName);
  if (!Upper?.isBone || !Lower?.isBone || !End?.isBone) return;

  if (!ChainCollision(Upper, Lower, End, Extension, Radius, State.CollisionNormal)) return;

  End.getWorldPosition(State.TargetEnd);
  Upper.getWorldPosition(State.RootPosition);
  State.TargetEnd.addScaledVector(State.CollisionNormal, Radius * 1.15 + 0.025);
  State.TargetEnd.lerp(State.RootPosition, 0.08);

  for (let Attempt = 0; Attempt < 9; Attempt += 1) {
    SolveChain(Pivot, Upper, Lower, End, State.TargetEnd);
    if (!ChainCollision(Upper, Lower, End, Extension, Radius, State.CollisionNormalB)) break;
    if (State.CollisionNormalB.lengthSq() > 0.001) State.TargetEnd.addScaledVector(State.CollisionNormalB, 0.045 + Attempt * 0.006);
    State.TargetEnd.lerp(State.RootPosition, 0.10 + Attempt * 0.012);
  }
}

function ConstrainLimbs(Pivot) {
  ConstrainChain(Pivot, "UpperArm.L", "LowerArm.L", "Wrist.L", ARM_RADIUS, HAND_EXTENSION);
  ConstrainChain(Pivot, "UpperArm.R", "LowerArm.R", "Wrist.R", ARM_RADIUS, HAND_EXTENSION);
  ConstrainChain(Pivot, "UpperLeg.L", "LowerLeg.L", "Foot.L", LEG_RADIUS, FOOT_EXTENSION);
  ConstrainChain(Pivot, "UpperLeg.R", "LowerLeg.R", "Foot.R", LEG_RADIUS, FOOT_EXTENSION);
  Pivot.updateMatrixWorld(true);
}

function ClampThirdPersonCamera(Pivot, Camera) {
  Pivot.getWorldPosition(State.Target);
  State.Target.y += CAMERA_TARGET_HEIGHT;
  State.Desired.copy(Camera.position);
  const Distance = State.Target.distanceTo(State.Desired);
  if (Distance <= 0.001) return;

  let Earliest = 1;
  for (const Entry of CollisionList()) {
    if (!Entry || Entry.CameraCollision === false) continue;
    const Bounds = EntryBounds(Entry);
    const Hit = SegmentBoundsFraction(State.Target, State.Desired, Bounds, CAMERA_RADIUS);
    if (Hit !== null) Earliest = Math.min(Earliest, Hit);
  }

  if (Earliest >= 0.9999) return;
  const Safe = THREE.MathUtils.clamp(Earliest - CAMERA_SKIN / Distance, 0.025, 1);
  State.Offset.copy(State.Desired).sub(State.Target).multiplyScalar(Safe);
  Camera.position.copy(State.Target).add(State.Offset);
  Camera.lookAt(State.Target);
  Camera.updateMatrixWorld(true);
}

function PlaceFirstPersonEye(Pivot, Camera) {
  const Head = Pivot.getObjectByName("Head");
  const Neck = Pivot.getObjectByName("Neck");
  if (!Head?.isBone) {
    Pivot.getWorldPosition(State.EyePosition);
    State.EyePosition.y += 1.68;
  } else {
    Head.getWorldPosition(State.HeadPosition);
    State.EyePosition.copy(State.HeadPosition);
    if (Neck?.isBone) {
      Neck.getWorldPosition(State.NeckPosition);
      State.HeadUp.copy(State.HeadPosition).sub(State.NeckPosition);
      const HeadLength = State.HeadUp.length();
      if (HeadLength > 0.0001) {
        State.HeadUp.divideScalar(HeadLength);
        const EyeLift = THREE.MathUtils.clamp(HeadLength * 0.36, FIRST_PERSON_EYE_MIN, FIRST_PERSON_EYE_MAX);
        State.EyePosition.addScaledVector(State.HeadUp, EyeLift);
      }
    } else {
      State.EyePosition.y += 0.055;
    }
  }

  Camera.position.copy(State.EyePosition);

  if (State.Grounded && State.MoveBlend > 0.01) {
    const Amount = Smooth(State.MoveBlend);
    State.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion);
    State.Right.y = 0;
    if (State.Right.lengthSq() > 0.0001) State.Right.normalize();
    Camera.position.y += Math.sin(State.WalkPhase * 2) * FIRST_PERSON_BOB_Y * Amount;
    Camera.position.addScaledVector(State.Right, Math.sin(State.WalkPhase) * FIRST_PERSON_BOB_X * Amount);
  }

  if (State.Grounded && State.LandingTime < 0.42 && State.LandingImpact > 0.001) {
    const Envelope = Math.exp(-State.LandingTime * 10.5) * State.LandingImpact;
    const Rebound = Math.sin(State.LandingTime * 27) * Math.exp(-State.LandingTime * 13) * State.LandingImpact;
    Camera.position.y += -FIRST_PERSON_LAND_DIP * Envelope + FIRST_PERSON_LAND_REBOUND * Rebound;
    Camera.rotateX(FIRST_PERSON_LAND_PITCH * (Envelope * 0.65 - Rebound * 0.4));
  }

  Camera.updateMatrixWorld(true);
}

function Attach(Context) {
  State.Scene = Context?.Scene || State.Scene;
  State.Camera = Context?.Camera || State.Camera;
  State.Renderer = Context?.Renderer || State.Renderer;
  State.CollisionBoxes = Context?.CollisionBoxes || State.CollisionBoxes;
  BasePlayer.Attach?.(Context);
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene || State.Scene;
  State.Camera = Camera || State.Camera;
  State.Renderer = Renderer || State.Renderer;

  const Now = performance.now();
  const Delta = THREE.MathUtils.clamp((Now - State.LastTime) / 1000, 0.001, 0.05);
  State.LastTime = Now;
  UpdateFrameMotion(Camera, Delta);
  UpdateJump(Delta);

  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
      if (!Pivot) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      State.SavedPivotPosition.copy(Pivot.position);
      State.SavedRenderPosition.copy(RenderCamera.position);
      State.SavedRenderQuaternion.copy(RenderCamera.quaternion);
      SavePose(Pivot);

      Pivot.position.y = State.SavedPivotPosition.y + State.JumpOffset;
      Pivot.updateMatrixWorld(true);
      ApplyJumpPose(Pivot);
      ConstrainLimbs(Pivot);

      const ThirdPerson = BasePlayer.IsThirdPerson?.() !== false;
      if (ThirdPerson) {
        if (State.JumpOffset > 0) {
          RenderCamera.position.y += State.JumpOffset;
          RenderCamera.updateMatrixWorld(true);
        }
        ClampThirdPersonCamera(Pivot, RenderCamera);
      } else {
        PlaceFirstPersonEye(Pivot, RenderCamera);
      }

      try {
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RestorePose(Pivot);
        Pivot.position.copy(State.SavedPivotPosition);
        Pivot.updateMatrixWorld(true);
        RenderCamera.position.copy(State.SavedRenderPosition);
        RenderCamera.quaternion.copy(State.SavedRenderQuaternion);
        RenderCamera.updateMatrixWorld(true);
      }
    }
  };

  BasePlayer.Render(ProxyRenderer, Scene, Camera);
}

addEventListener("keydown", Event => {
  if (Event.code !== "Space" || Event.repeat) return;
  const Hud = document.getElementById("Hud");
  if (!Hud || Hud.classList.contains("Hidden")) return;
  Event.preventDefault();
  State.JumpQueued = true;
});

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render,
  IsJumping: () => !State.Grounded,
  IsGrounded: () => State.Grounded,
  GetJumpOffset: () => State.JumpOffset,
  GetVerticalVelocity: () => State.VerticalVelocity,
  GetLandingImpact: () => State.LandingImpact
};

window.__STORE_CHARACTER_ENGINE__ = State;
window.__STORE_CHARACTER_ENGINE_BUILD__ = "V0.13.1";
