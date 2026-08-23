import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before character engine.");

const PLAYER_RADIUS_MIN = 0.28;
const PLAYER_RADIUS_MAX = 0.34;
const MOVEMENT_SKIN = 0.012;
const MOVEMENT_SWEEP_STEPS = 18;
const MOVEMENT_BINARY_STEPS = 8;
const MOVEMENT_ITERATIONS = 3;
const HEAD_ON_DOT = 0.78;
const JUMP_VELOCITY = 4.85;
const GRAVITY = 16.2;
const MAX_FALL_SPEED = 12;
const CAMERA_TARGET_HEIGHT = 1.26;
const CAMERA_RADIUS = 0.14;
const CAMERA_SKIN = 0.055;
const ARM_RADIUS = 0.105;
const HAND_EXTENSION = 0.13;
const LEG_RADIUS = 0.115;
const FOOT_EXTENSION = 0.15;
const CHAIN_ITERATIONS = 6;
const FIRST_PERSON_BOB_Y = 0.006;
const FIRST_PERSON_BOB_X = 0.003;
const FIRST_PERSON_LAND_DIP = 0.034;
const FIRST_PERSON_LAND_REBOUND = 0.010;
const FIRST_PERSON_LAND_PITCH = THREE.MathUtils.degToRad(0.72);

const State = {
  Scene: null,
  Camera: null,
  Renderer: null,
  CollisionBoxes: null,
  LastTime: performance.now(),
  GroundCameraY: null,
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
  Remaining: new THREE.Vector3(),
  Leftover: new THREE.Vector3(),
  ContactPoint: new THREE.Vector3(),
  Normal: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3(),
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
  DesiredTip: new THREE.Vector3(),
  SafeTip: new THREE.Vector3(),
  TargetEnd: new THREE.Vector3()
};

const PoseBones = [
  "Hips", "Abdomen", "Torso", "Chest", "Neck",
  "Shoulder.L", "Shoulder.R", "UpperArm.L", "UpperArm.R",
  "LowerArm.L", "LowerArm.R", "Wrist.L", "Wrist.R",
  "UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R",
  "Foot.L", "Foot.R"
];

function ExpAlpha(Delta, Response) {
  return 1 - Math.exp(-Delta * Response);
}

function Clamp01(Value) {
  return THREE.MathUtils.clamp(Value, 0, 1);
}

function Smooth(Value) {
  const T = Clamp01(Value);
  return T * T * (3 - 2 * T);
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

function SegmentBoundsFraction(Start, End, Bounds, Padding, IgnoreStartInside = false) {
  if (!FiniteBounds(Bounds)) return null;
  if (IgnoreStartInside && PointInsideExpandedBounds(Start, Bounds, Padding)) return null;

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
  const IsStructure = Entry.PrecisePlayerStructure || /Wall|Partition/i.test(String(Entry.Type || ""));

  if (!IsStructure && typeof Entry.TestPlayerCollision === "function") {
    try {
      return Boolean(Entry.TestPlayerCollision(Position, Radius));
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
  const Steps = THREE.MathUtils.clamp(Math.ceil(Length / 0.03), 1, MOVEMENT_SWEEP_STEPS);
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

function ContactNormal(Position, Motion, Radius) {
  let BestScore = -Infinity;
  State.Normal.set(0, 0, 0);

  for (const Entry of CollisionList()) {
    if (!EntryTouchesPlayer(Entry, Position, Radius)) continue;
    const Bounds = EntryBounds(Entry);
    if (!FiniteBounds(Bounds)) continue;

    const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
    const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
    State.DesiredDirection.set(Position.x - ClosestX, 0, Position.z - ClosestZ);

    if (State.DesiredDirection.lengthSq() < 0.000001) {
      const Left = Math.abs(Position.x - (Bounds.min.x - Radius));
      const Right = Math.abs((Bounds.max.x + Radius) - Position.x);
      const Back = Math.abs(Position.z - (Bounds.min.z - Radius));
      const Front = Math.abs((Bounds.max.z + Radius) - Position.z);
      const Min = Math.min(Left, Right, Back, Front);
      if (Min === Left) State.DesiredDirection.set(-1, 0, 0);
      else if (Min === Right) State.DesiredDirection.set(1, 0, 0);
      else if (Min === Back) State.DesiredDirection.set(0, 0, -1);
      else State.DesiredDirection.set(0, 0, 1);
    } else {
      State.DesiredDirection.normalize();
    }

    if (Motion.dot(State.DesiredDirection) > 0) State.DesiredDirection.multiplyScalar(-1);
    const Score = -Motion.dot(State.DesiredDirection);
    if (Score > BestScore) {
      BestScore = Score;
      State.Normal.copy(State.DesiredDirection);
    }
  }

  if (State.Normal.lengthSq() < 0.5) {
    State.Normal.copy(Motion).normalize().multiplyScalar(-1);
  }
  return State.Normal;
}

function ResolveMovement(Camera, Delta) {
  if (!Camera || Delta.lengthSq() <= 0.00000001) return;
  const Radius = MovementRadius();
  State.Position.copy(Camera.position);
  State.Remaining.copy(Delta);

  for (let Iteration = 0; Iteration < MOVEMENT_ITERATIONS; Iteration += 1) {
    if (State.Remaining.lengthSq() <= 0.00000001) break;

    const Fraction = SweepMovement(State.Position, State.Remaining, Radius);
    if (Fraction >= 0.9999) {
      State.Position.add(State.Remaining);
      State.Remaining.set(0, 0, 0);
      break;
    }

    const Length = State.Remaining.length();
    const SafeFraction = Math.max(0, Fraction - MOVEMENT_SKIN / Math.max(Length, 0.0001));
    State.Position.addScaledVector(State.Remaining, SafeFraction);
    State.ContactPoint.copy(State.Position).addScaledVector(State.Remaining, Math.min(0.02 / Math.max(Length, 0.0001), 1));
    const Normal = ContactNormal(State.ContactPoint, State.Remaining, Radius);

    State.DesiredDirection.copy(State.Remaining).normalize();
    const Inward = Math.max(0, -State.DesiredDirection.dot(Normal));
    State.Leftover.copy(State.Remaining).multiplyScalar(1 - SafeFraction);

    if (Inward >= HEAD_ON_DOT) {
      State.Leftover.set(0, 0, 0);
    } else {
      const IntoSurface = State.Leftover.dot(Normal);
      if (IntoSurface < 0) State.Leftover.addScaledVector(Normal, -IntoSurface);
    }

    State.Position.addScaledVector(Normal, MOVEMENT_SKIN);
    State.Remaining.copy(State.Leftover);
  }

  Camera.position.x = State.Position.x;
  Camera.position.z = State.Position.z;
}

const OriginalMoveForward = PointerLockControls.prototype.moveForward;
const OriginalMoveRight = PointerLockControls.prototype.moveRight;

function ControlCamera(Control) {
  return Control?.object || Control?.camera || State.Camera;
}

PointerLockControls.prototype.moveForward = function CharacterEngineMoveForward(Distance) {
  const Camera = ControlCamera(this);
  if (!Camera || !Number.isFinite(Distance)) return OriginalMoveForward.call(this, Distance);
  State.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  State.Forward.y = 0;
  if (State.Forward.lengthSq() <= 0.000001) return;
  State.Forward.normalize().multiplyScalar(Distance);
  ResolveMovement(Camera, State.Forward);
};

PointerLockControls.prototype.moveRight = function CharacterEngineMoveRight(Distance) {
  const Camera = ControlCamera(this);
  if (!Camera || !Number.isFinite(Distance)) return OriginalMoveRight.call(this, Distance);
  State.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  State.Right.y = 0;
  if (State.Right.lengthSq() <= 0.000001) return;
  State.Right.normalize().multiplyScalar(Distance);
  ResolveMovement(Camera, State.Right);
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
  State.MoveBlend = THREE.MathUtils.lerp(State.MoveBlend, Target, ExpAlpha(Delta, 12));
  if (State.MoveBlend > 0.005 && State.Grounded) {
    State.WalkPhase += Delta * THREE.MathUtils.lerp(6.5, 8.4, State.MoveBlend);
  }
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
      State.LandingImpact = THREE.MathUtils.clamp((Impact - 2) / 5.5, 0.25, 1);
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
    Takeoff = Smooth(1 - State.AirTime / 0.13);
    Rise = Clamp01(State.VerticalVelocity / JUMP_VELOCITY);
    Fall = Clamp01(-State.VerticalVelocity / 6.2);
    Apex = Clamp01(1 - Math.abs(State.VerticalVelocity) / 2.0);
  } else if (State.LandingTime < 0.26) {
    Land = Smooth(1 - State.LandingTime / 0.26) * State.LandingImpact;
  }

  const Air = Clamp01(Rise * 0.55 + Apex * 0.75 + Fall * 0.55);
  const Bend = Clamp01(Takeoff * 0.9 + Apex * 0.24 + Fall * 0.18 + Land);

  AddBoneRotation(Pivot, "Hips", 0.07, 0, 0, Bend);
  AddBoneRotation(Pivot, "Abdomen", -0.035, 0, 0, Air);
  AddBoneRotation(Pivot, "Torso", -0.025, 0, 0, Rise + Fall * 0.3);
  AddBoneRotation(Pivot, "UpperLeg.L", 0.16, 0, 0.018, Bend);
  AddBoneRotation(Pivot, "UpperLeg.R", 0.13, 0, -0.018, Bend);
  AddBoneRotation(Pivot, "LowerLeg.L", -0.28, 0, 0, Bend);
  AddBoneRotation(Pivot, "LowerLeg.R", -0.24, 0, 0, Bend);
  AddBoneRotation(Pivot, "UpperLeg.L", 0.07, 0, 0, Apex);
  AddBoneRotation(Pivot, "UpperLeg.R", -0.045, 0, 0, Apex);
  AddBoneRotation(Pivot, "UpperArm.L", -0.10, 0, 0.045, Rise + Apex * 0.45);
  AddBoneRotation(Pivot, "UpperArm.R", -0.08, 0, -0.045, Rise + Apex * 0.45);
  AddBoneRotation(Pivot, "LowerArm.L", -0.07, 0, 0, Air);
  AddBoneRotation(Pivot, "LowerArm.R", -0.06, 0, 0, Air);
  AddBoneRotation(Pivot, "Foot.L", 0.09, 0, 0, Fall + Land * 0.4);
  AddBoneRotation(Pivot, "Foot.R", 0.09, 0, 0, Fall + Land * 0.4);
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

function ClampLimbTip(Root, DesiredTip, Radius, Result) {
  Result.copy(DesiredTip);
  const Length = Root.distanceTo(DesiredTip);
  if (Length <= 0.0001) return false;
  let Earliest = 1;

  for (const Entry of CollisionList()) {
    if (!Entry || Entry.PlayerCollision === false) continue;
    const Bounds = EntryBounds(Entry);
    const Hit = SegmentBoundsFraction(Root, DesiredTip, Bounds, Radius, true);
    if (Hit !== null) Earliest = Math.min(Earliest, Hit);
  }

  if (Earliest >= 1) return false;
  const Skin = 0.025 / Length;
  const Allowed = THREE.MathUtils.clamp(Earliest - Skin, 0.03, 1);
  Result.lerpVectors(Root, DesiredTip, Allowed);
  return true;
}

function SegmentBlocked(Start, End, Radius) {
  for (const Entry of CollisionList()) {
    if (!Entry || Entry.PlayerCollision === false) continue;
    const Hit = SegmentBoundsFraction(Start, End, EntryBounds(Entry), Radius, true);
    if (Hit !== null) return true;
  }
  return false;
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

  Upper.getWorldPosition(State.RootPosition);
  Lower.getWorldPosition(State.JointMidPosition);
  End.getWorldPosition(State.EndPosition);
  State.TipDirection.copy(State.EndPosition).sub(State.JointMidPosition);
  if (State.TipDirection.lengthSq() <= 0.000001) return;
  State.TipDirection.normalize();
  State.DesiredTip.copy(State.EndPosition).addScaledVector(State.TipDirection, Extension);

  if (!ClampLimbTip(State.RootPosition, State.DesiredTip, Radius, State.SafeTip)) {
    const UpperBlocked = SegmentBlocked(State.RootPosition, State.JointMidPosition, Radius * 0.82);
    const LowerBlocked = SegmentBlocked(State.JointMidPosition, State.EndPosition, Radius * 0.82);
    if (!UpperBlocked && !LowerBlocked) return;
    State.SafeTip.copy(State.DesiredTip).lerp(State.RootPosition, 0.18);
  }

  State.TargetEnd.copy(State.SafeTip).addScaledVector(State.TipDirection, -Extension);
  SolveChain(Pivot, Upper, Lower, End, State.TargetEnd);

  for (let Retry = 0; Retry < 3; Retry += 1) {
    Upper.getWorldPosition(State.RootPosition);
    Lower.getWorldPosition(State.JointMidPosition);
    End.getWorldPosition(State.EndPosition);
    if (!SegmentBlocked(State.RootPosition, State.JointMidPosition, Radius * 0.82) &&
        !SegmentBlocked(State.JointMidPosition, State.EndPosition, Radius * 0.82)) break;
    State.TargetEnd.lerp(State.RootPosition, 0.16);
    SolveChain(Pivot, Upper, Lower, End, State.TargetEnd);
  }
}

function ConstrainLimbs(Pivot) {
  ConstrainChain(Pivot, "UpperArm.L", "LowerArm.L", "Wrist.L", ARM_RADIUS, HAND_EXTENSION);
  ConstrainChain(Pivot, "UpperArm.R", "LowerArm.R", "Wrist.R", ARM_RADIUS, HAND_EXTENSION);
  ConstrainChain(Pivot, "UpperLeg.L", "LowerLeg.L", "Foot.L", LEG_RADIUS, FOOT_EXTENSION);
  ConstrainChain(Pivot, "UpperLeg.R", "LowerLeg.R", "Foot.R", LEG_RADIUS, FOOT_EXTENSION);
  Pivot.updateMatrixWorld(true);
}

function ClampCamera(Pivot, Camera) {
  Pivot.getWorldPosition(State.Target);
  State.Target.y += CAMERA_TARGET_HEIGHT;
  State.Desired.copy(Camera.position);
  const Distance = State.Target.distanceTo(State.Desired);
  if (Distance <= 0.001) return;

  let Earliest = 1;
  for (const Entry of CollisionList()) {
    if (!Entry || Entry.CameraCollision === false) continue;
    const Bounds = EntryBounds(Entry);
    const Hit = SegmentBoundsFraction(State.Target, State.Desired, Bounds, CAMERA_RADIUS, true);
    if (Hit !== null) Earliest = Math.min(Earliest, Hit);
  }

  if (Earliest >= 0.9999) return;
  const Safe = THREE.MathUtils.clamp(Earliest - CAMERA_SKIN / Distance, 0.03, 1);
  State.Offset.copy(State.Desired).sub(State.Target).multiplyScalar(Safe);
  Camera.position.copy(State.Target).add(State.Offset);
  Camera.lookAt(State.Target);
  Camera.updateMatrixWorld(true);
}

function ApplyFirstPersonCameraMotion(Camera) {
  if (BasePlayer.IsThirdPerson?.()) return;

  if (State.Grounded && State.MoveBlend > 0.01) {
    const Amount = Smooth(State.MoveBlend);
    State.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion).normalize();
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
  if (State.Camera && State.GroundCameraY === null) State.GroundCameraY = State.Camera.position.y;
  BasePlayer.Attach?.(Context);
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene || State.Scene;
  State.Camera = Camera || State.Camera;
  State.Renderer = Renderer || State.Renderer;

  const Now = performance.now();
  const Delta = THREE.MathUtils.clamp((Now - State.LastTime) / 1000, 0.001, 0.05);
  State.LastTime = Now;

  if (State.GroundCameraY === null || State.Grounded && State.JumpOffset <= 0.0001) State.GroundCameraY = Camera.position.y;
  UpdateFrameMotion(Camera, Delta);
  UpdateJump(Delta);
  Camera.position.y = State.GroundCameraY + State.JumpOffset;
  Camera.updateMatrixWorld(true);

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

      const ThirdPerson = BasePlayer.IsThirdPerson?.() !== false;
      Pivot.position.y = State.SavedPivotPosition.y + State.JumpOffset;
      Pivot.updateMatrixWorld(true);

      ApplyJumpPose(Pivot);
      ConstrainLimbs(Pivot);

      if (ThirdPerson && State.JumpOffset > 0) {
        RenderCamera.position.y += State.JumpOffset;
        RenderCamera.updateMatrixWorld(true);
      }

      if (ThirdPerson) ClampCamera(Pivot, RenderCamera);
      else ApplyFirstPersonCameraMotion(RenderCamera);

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
window.__STORE_CHARACTER_ENGINE_BUILD__ = "V0.13.0";
