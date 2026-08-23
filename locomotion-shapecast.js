import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before locomotion shapecast.");

const WALK_PROBE = 1.08;
const SPRINT_PROBE = 1.46;
const ARM_SIDE_PROBE = 0.80;
const PROBE_STEPS = 16;
const MOVE_LANE_OFFSET = 0.18;
const MOVE_LANE_RADIUS = 0.10;
const ARM_PROBE_RADIUS = 0.075;
const LIMB_RADIUS = 0.065;
const ARM_SEGMENT_STEPS = 7;
const LEG_SEGMENT_STEPS = 6;
const IK_ITERATIONS = 5;
const CONTACT_FRESH_MS = 190;
const ENTER_RESPONSE = 22;
const EXIT_RESPONSE = 11;
const ROOT_PUSH_STEP = 0.014;
const ROOT_PUSH_MAX = 0.084;
const CONTACT_FACING_RESPONSE = 9.5;

const State = {
  Scene: null,
  Camera: null,
  CollisionBoxes: null,
  Keys: new Set(),
  LastPivotPosition: new THREE.Vector3(),
  PivotPosition: new THREE.Vector3(),
  HasLastPosition: false,
  LastTime: performance.now(),
  FrameDelta: 1 / 60,
  Velocity: new THREE.Vector3(),
  MoveDirection: new THREE.Vector3(),
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  BodyRight: new THREE.Vector3(),
  Sample: new THREE.Vector3(),
  LeftOrigin: new THREE.Vector3(),
  RightOrigin: new THREE.Vector3(),
  LeftDirection: new THREE.Vector3(),
  RightDirection: new THREE.Vector3(),
  TempWorldQuaternion: new THREE.Quaternion(),
  WallBlend: 0,
  LeftBlend: 0,
  RightBlend: 0,
  HitDistance: Infinity,
  LeftDistance: Infinity,
  RightDistance: Infinity,
  RestPivotUuid: "",
  RestPose: new Map(),
  SavedPose: new Map(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion(),
  SegmentA: new THREE.Vector3(),
  SegmentB: new THREE.Vector3(),
  JointPosition: new THREE.Vector3(),
  EffectorPosition: new THREE.Vector3(),
  TargetPosition: new THREE.Vector3(),
  CurrentDirection: new THREE.Vector3(),
  TargetDirection: new THREE.Vector3(),
  DeltaQuaternion: new THREE.Quaternion(),
  ParentQuaternion: new THREE.Quaternion(),
  JointWorldQuaternion: new THREE.Quaternion(),
  DesiredWorldQuaternion: new THREE.Quaternion(),
  InverseParentQuaternion: new THREE.Quaternion(),
  EscapeNormal: new THREE.Vector3(),
  EscapeSum: new THREE.Vector3(),
  SavedPivotPosition: new THREE.Vector3(),
  VisualYaw: 0,
  HasVisualYaw: false,
  SavedPivotYaw: 0
};

const PoseBones = [
  "Hips", "Abdomen", "Torso", "Chest", "Neck",
  "Shoulder.L", "Shoulder.R", "UpperArm.L", "UpperArm.R",
  "LowerArm.L", "LowerArm.R", "Wrist.L", "Wrist.R",
  "UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R",
  "Foot.L", "Foot.R"
];

const ForwardDampWeights = new Map([
  ["Hips", 0.30], ["Abdomen", 0.34], ["Torso", 0.38], ["Chest", 0.42], ["Neck", 0.24],
  ["Shoulder.L", 0.54], ["Shoulder.R", 0.54],
  ["UpperArm.L", 0.72], ["UpperArm.R", 0.72],
  ["LowerArm.L", 0.70], ["LowerArm.R", 0.70],
  ["Wrist.L", 0.58], ["Wrist.R", 0.58],
  ["UpperLeg.L", 0.94], ["UpperLeg.R", 0.94],
  ["LowerLeg.L", 0.90], ["LowerLeg.R", 0.90],
  ["Foot.L", 0.78], ["Foot.R", 0.78]
]);

const LeftArmBones = ["Shoulder.L", "UpperArm.L", "LowerArm.L", "Wrist.L"];
const RightArmBones = ["Shoulder.R", "UpperArm.R", "LowerArm.R", "Wrist.R"];
const LeftLegBones = ["UpperLeg.L", "LowerLeg.L", "Foot.L"];
const RightLegBones = ["UpperLeg.R", "LowerLeg.R", "Foot.R"];
const BodySamples = [
  ["Chest", 0.13],
  ["Hips", 0.14],
  ["Shoulder.L", 0.115],
  ["Shoulder.R", 0.115]
];

function ExpAlpha(Delta, Responsiveness) {
  return 1 - Math.exp(-Delta * Responsiveness);
}

function NormalizeAngle(Value) {
  return Math.atan2(Math.sin(Value), Math.cos(Value));
}

function FiniteBounds(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite) &&
    Bounds.min.x < Bounds.max.x && Bounds.min.z < Bounds.max.z
  );
}

function CircleHitsBox(Position, Radius, Bounds) {
  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  const DX = Position.x - ClosestX;
  const DZ = Position.z - ClosestZ;
  return DX * DX + DZ * DZ <= Radius * Radius;
}

function SphereHitsBox(Position, Radius, Bounds) {
  if (!FiniteBounds(Bounds)) return false;
  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestY = THREE.MathUtils.clamp(Position.y, Bounds.min.y, Bounds.max.y);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  const DX = Position.x - ClosestX;
  const DY = Position.y - ClosestY;
  const DZ = Position.z - ClosestZ;
  return DX * DX + DY * DY + DZ * DZ <= Radius * Radius;
}

function EntryBounds(Entry) {
  return Entry?.OriginalStructureBox || Entry?.OriginalBox || Entry?.Box || Entry || null;
}

function HitsCollision(Position, Radius) {
  const Collisions = State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];
  for (const Entry of Collisions) {
    if (!Entry) continue;
    const Bounds = EntryBounds(Entry);
    const IsStructure = Entry.PrecisePlayerStructure || /Wall|Partition/i.test(String(Entry.Type || ""));

    if (IsStructure && Bounds?.min && Bounds?.max) {
      if (CircleHitsBox(Position, Radius, Bounds)) return true;
      continue;
    }

    if (typeof Entry.TestPlayerCollision === "function") {
      try {
        if (Entry.TestPlayerCollision(Position, Radius)) return true;
      } catch {}
      if (Entry.PreciseGeometry || Entry.LegacyCollisionDisabled) continue;
    }

    if (Bounds?.min && Bounds?.max && CircleHitsBox(Position, Radius, Bounds)) return true;
  }
  return false;
}

function LimbHitsCollision(Position, Radius) {
  const Collisions = State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];
  for (const Entry of Collisions) {
    if (!Entry) continue;
    const Bounds = EntryBounds(Entry);
    if (!FiniteBounds(Bounds)) continue;
    if (SphereHitsBox(Position, Radius, Bounds)) return true;
  }
  return false;
}

function EscapeNormalFromBounds(Position, Radius, Bounds, Target) {
  if (!FiniteBounds(Bounds)) return false;
  if (Position.y + Radius < Bounds.min.y || Position.y - Radius > Bounds.max.y) return false;

  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  const DX = Position.x - ClosestX;
  const DZ = Position.z - ClosestZ;
  const DistanceSq = DX * DX + DZ * DZ;
  if (DistanceSq > Radius * Radius) return false;

  if (DistanceSq > 0.000001) {
    Target.set(DX, 0, DZ).normalize();
    return true;
  }

  const Left = Math.abs(Position.x - Bounds.min.x);
  const Right = Math.abs(Bounds.max.x - Position.x);
  const Back = Math.abs(Position.z - Bounds.min.z);
  const Front = Math.abs(Bounds.max.z - Position.z);
  const Min = Math.min(Left, Right, Back, Front);
  if (Min === Left) Target.set(-1, 0, 0);
  else if (Min === Right) Target.set(1, 0, 0);
  else if (Min === Back) Target.set(0, 0, -1);
  else Target.set(0, 0, 1);
  return true;
}

function SweepCircle(Origin, Direction, Radius, Length) {
  if (Direction.lengthSq() < 0.000001 || Length <= 0) return Infinity;
  for (let Step = 1; Step <= PROBE_STEPS; Step += 1) {
    const Distance = Length * Step / PROBE_STEPS;
    State.Sample.copy(Origin).addScaledVector(Direction, Distance);
    if (HitsCollision(State.Sample, Radius)) return Distance;
  }
  return Infinity;
}

function InputDirection(Camera) {
  State.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  State.Forward.y = 0;
  if (State.Forward.lengthSq() < 0.000001) State.Forward.set(0, 0, -1);
  State.Forward.normalize();

  State.Right.set(-State.Forward.z, 0, State.Forward.x).normalize();
  State.MoveDirection.set(0, 0, 0);

  if (State.Keys.has("KeyW")) State.MoveDirection.add(State.Forward);
  if (State.Keys.has("KeyS")) State.MoveDirection.sub(State.Forward);
  if (State.Keys.has("KeyD")) State.MoveDirection.add(State.Right);
  if (State.Keys.has("KeyA")) State.MoveDirection.sub(State.Right);

  if (State.MoveDirection.lengthSq() > 0.000001) return State.MoveDirection.normalize();
  if (State.Velocity.lengthSq() > 0.01) return State.MoveDirection.copy(State.Velocity).normalize();
  return State.MoveDirection.set(0, 0, 0);
}

function BlendFromHit(Distance, Length, NearDistance = 0.04) {
  if (!Number.isFinite(Distance)) return 0;
  return 1 - THREE.MathUtils.clamp((Distance - NearDistance) / Math.max(Length - NearDistance, 0.01), 0, 1);
}

function BodyRightDirection(Pivot) {
  Pivot.getWorldQuaternion(State.TempWorldQuaternion);
  State.BodyRight.set(1, 0, 0).applyQuaternion(State.TempWorldQuaternion);
  State.BodyRight.y = 0;
  if (State.BodyRight.lengthSq() < 0.000001) State.BodyRight.set(1, 0, 0);
  return State.BodyRight.normalize();
}

function DecayBlend(Delta) {
  const Alpha = ExpAlpha(Delta, EXIT_RESPONSE);
  State.WallBlend = THREE.MathUtils.lerp(State.WallBlend, 0, Alpha);
  State.LeftBlend = THREE.MathUtils.lerp(State.LeftBlend, 0, Alpha);
  State.RightBlend = THREE.MathUtils.lerp(State.RightBlend, 0, Alpha);
  State.HitDistance = Infinity;
  State.LeftDistance = Infinity;
  State.RightDistance = Infinity;
}

function ContactTargets(Pivot) {
  const Contact = window.__STORE_MOVEMENT_CONTACT__;
  if (!Contact || Contact.Strength <= 0.001 || performance.now() - Contact.LastHit > CONTACT_FRESH_MS) {
    return { Wall: 0, Left: 0, Right: 0, Contact: null };
  }

  const BodyRight = BodyRightDirection(Pivot);
  const SideDot = Contact.Normal.dot(BodyRight);
  const Strength = THREE.MathUtils.clamp(Contact.Strength, 0, 1);
  return {
    Wall: Strength * 0.70,
    Left: Math.max(0, SideDot) * Strength,
    Right: Math.max(0, -SideDot) * Strength,
    Contact
  };
}

function UpdateShapecast(Camera, Pivot) {
  const Now = performance.now();
  const Delta = THREE.MathUtils.clamp((Now - State.LastTime) / 1000, 0.001, 0.05);
  State.LastTime = Now;
  State.FrameDelta = Delta;

  Pivot.getWorldPosition(State.PivotPosition);
  State.PivotPosition.y = 0;

  if (!State.HasLastPosition) {
    State.LastPivotPosition.copy(State.PivotPosition);
    State.HasLastPosition = true;
  }

  State.Velocity.copy(State.PivotPosition).sub(State.LastPivotPosition).divideScalar(Delta);
  State.Velocity.y = 0;
  State.LastPivotPosition.copy(State.PivotPosition);

  if (!BasePlayer.IsThirdPerson?.()) {
    DecayBlend(Delta);
    return;
  }

  const ReportedRadius = Number(BasePlayer.GetPlayerRadius?.()) || 0.30;
  const BodyRadius = THREE.MathUtils.clamp(ReportedRadius, 0.24, 0.36);
  const Direction = InputDirection(Camera);
  const Moving = Direction.lengthSq() > 0.000001;
  const Length = BasePlayer.IsSprinting?.() ? SPRINT_PROBE : WALK_PROBE;

  let CenterHit = Infinity;
  let LeftMoveHit = Infinity;
  let RightMoveHit = Infinity;

  if (Moving) {
    State.Right.set(-Direction.z, 0, Direction.x).normalize();
    CenterHit = SweepCircle(State.PivotPosition, Direction, BodyRadius, Length);
    State.LeftOrigin.copy(State.PivotPosition).addScaledVector(State.Right, -MOVE_LANE_OFFSET);
    State.RightOrigin.copy(State.PivotPosition).addScaledVector(State.Right, MOVE_LANE_OFFSET);
    LeftMoveHit = SweepCircle(State.LeftOrigin, Direction, MOVE_LANE_RADIUS, Length);
    RightMoveHit = SweepCircle(State.RightOrigin, Direction, MOVE_LANE_RADIUS, Length);
  }

  const BodyRight = BodyRightDirection(Pivot);
  State.LeftDirection.copy(BodyRight).multiplyScalar(-1);
  State.RightDirection.copy(BodyRight);
  const LeftSideHit = SweepCircle(State.PivotPosition, State.LeftDirection, ARM_PROBE_RADIUS, ARM_SIDE_PROBE);
  const RightSideHit = SweepCircle(State.PivotPosition, State.RightDirection, ARM_PROBE_RADIUS, ARM_SIDE_PROBE);

  const ClosestMoveHit = Math.min(CenterHit, LeftMoveHit, RightMoveHit);
  const ForwardBlend = Moving ? BlendFromHit(ClosestMoveHit, Length, 0.08) : 0;
  const LeftMoveBlend = Moving ? BlendFromHit(LeftMoveHit, Length, 0.08) : 0;
  const RightMoveBlend = Moving ? BlendFromHit(RightMoveHit, Length, 0.08) : 0;
  const LeftSideBlend = BlendFromHit(LeftSideHit, ARM_SIDE_PROBE, 0.12);
  const RightSideBlend = BlendFromHit(RightSideHit, ARM_SIDE_PROBE, 0.12);
  const Contact = ContactTargets(Pivot);

  const TargetLeft = Math.max(LeftMoveBlend, LeftSideBlend, Contact.Left);
  const TargetRight = Math.max(RightMoveBlend, RightSideBlend, Contact.Right);
  const TargetWall = Math.max(ForwardBlend, Contact.Wall, Math.max(TargetLeft, TargetRight) * 0.18);

  State.WallBlend = THREE.MathUtils.lerp(State.WallBlend, TargetWall, ExpAlpha(Delta, TargetWall > State.WallBlend ? ENTER_RESPONSE : EXIT_RESPONSE));
  State.LeftBlend = THREE.MathUtils.lerp(State.LeftBlend, TargetLeft, ExpAlpha(Delta, TargetLeft > State.LeftBlend ? ENTER_RESPONSE : EXIT_RESPONSE));
  State.RightBlend = THREE.MathUtils.lerp(State.RightBlend, TargetRight, ExpAlpha(Delta, TargetRight > State.RightBlend ? ENTER_RESPONSE : EXIT_RESPONSE));
  State.HitDistance = ClosestMoveHit;
  State.LeftDistance = Math.min(LeftMoveHit, LeftSideHit);
  State.RightDistance = Math.min(RightMoveHit, RightSideHit);
}

function CaptureRestPose(Pivot) {
  if (!Pivot || State.RestPivotUuid === Pivot.uuid) return;
  State.RestPivotUuid = Pivot.uuid;
  State.RestPose.clear();
  for (const Name of PoseBones) {
    const Bone = Pivot.getObjectByName(Name);
    if (Bone?.isBone) State.RestPose.set(Name, Bone.quaternion.clone());
  }
}

function SaveCurrentPose(Pivot) {
  State.SavedPose.clear();
  for (const Name of PoseBones) {
    const Bone = Pivot.getObjectByName(Name);
    if (Bone?.isBone) State.SavedPose.set(Name, Bone.quaternion.clone());
  }
}

function AddBoneRotation(Pivot, Name, X, Y, Z) {
  const Bone = Pivot.getObjectByName(Name);
  if (!Bone?.isBone) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion).normalize();
}

function DampBoneToRest(Pivot, Name, Blend) {
  const Bone = Pivot.getObjectByName(Name);
  const Rest = State.RestPose.get(Name);
  if (!Bone?.isBone || !Rest || Blend <= 0) return;
  Bone.quaternion.slerp(Rest, THREE.MathUtils.clamp(Blend, 0, 0.985));
}

function ApplyStableContactFacing(Pivot) {
  const Contact = window.__STORE_MOVEMENT_CONTACT__;
  const Fresh = Contact && Contact.Sliding && Contact.Strength > 0.04 && performance.now() - Contact.LastHit <= CONTACT_FRESH_MS;
  if (!Fresh || Contact.DesiredDirection?.lengthSq?.() <= 0.001) {
    State.VisualYaw = Pivot.rotation.y;
    State.HasVisualYaw = true;
    return;
  }

  if (!State.HasVisualYaw) {
    State.VisualYaw = Pivot.rotation.y;
    State.HasVisualYaw = true;
  }

  const DesiredYaw = Math.atan2(Contact.DesiredDirection.x, Contact.DesiredDirection.z);
  const Difference = NormalizeAngle(DesiredYaw - State.VisualYaw);
  State.VisualYaw += Difference * ExpAlpha(State.FrameDelta, CONTACT_FACING_RESPONSE);
  Pivot.rotation.y = State.VisualYaw;
  Pivot.updateMatrixWorld(true);
}

function SegmentHitsCollision(BoneA, BoneB, Radius, Steps) {
  if (!BoneA?.isBone || !BoneB?.isBone) return false;
  BoneA.getWorldPosition(State.SegmentA);
  BoneB.getWorldPosition(State.SegmentB);
  for (let Step = 1; Step <= Steps; Step += 1) {
    const Alpha = Step / Steps;
    State.Sample.lerpVectors(State.SegmentA, State.SegmentB, Alpha);
    if (LimbHitsCollision(State.Sample, Radius)) return true;
  }
  return false;
}

function ArmChainHits(Pivot, Side) {
  const Shoulder = Pivot.getObjectByName(`Shoulder.${Side}`);
  const UpperArm = Pivot.getObjectByName(`UpperArm.${Side}`);
  const LowerArm = Pivot.getObjectByName(`LowerArm.${Side}`);
  const Wrist = Pivot.getObjectByName(`Wrist.${Side}`);
  return SegmentHitsCollision(Shoulder, UpperArm, LIMB_RADIUS, ARM_SEGMENT_STEPS) ||
    SegmentHitsCollision(UpperArm, LowerArm, LIMB_RADIUS, ARM_SEGMENT_STEPS) ||
    SegmentHitsCollision(LowerArm, Wrist, LIMB_RADIUS, ARM_SEGMENT_STEPS);
}

function LegChainHits(Pivot, Side) {
  const Upper = Pivot.getObjectByName(`UpperLeg.${Side}`);
  const Lower = Pivot.getObjectByName(`LowerLeg.${Side}`);
  const Foot = Pivot.getObjectByName(`Foot.${Side}`);
  return SegmentHitsCollision(Upper, Lower, LIMB_RADIUS, LEG_SEGMENT_STEPS) ||
    SegmentHitsCollision(Lower, Foot, LIMB_RADIUS, LEG_SEGMENT_STEPS);
}

function RotateJointToward(Joint, Effector, Target, Strength) {
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
  Joint.parent.getWorldQuaternion(State.ParentQuaternion);
  State.InverseParentQuaternion.copy(State.ParentQuaternion).invert();
  State.TempQuaternion.copy(State.InverseParentQuaternion).multiply(State.DesiredWorldQuaternion).normalize();
  Joint.quaternion.slerp(State.TempQuaternion, THREE.MathUtils.clamp(Strength, 0, 1));
  Joint.updateMatrixWorld(true);
}

function SolveArmTowardTorso(Pivot, Side, Strength) {
  const UpperArm = Pivot.getObjectByName(`UpperArm.${Side}`);
  const LowerArm = Pivot.getObjectByName(`LowerArm.${Side}`);
  const Wrist = Pivot.getObjectByName(`Wrist.${Side}`);
  if (!UpperArm?.isBone || !LowerArm?.isBone || !Wrist?.isBone) return;

  UpperArm.getWorldPosition(State.TargetPosition);
  State.TargetPosition.y -= 0.40;
  const BodyRight = BodyRightDirection(Pivot);
  State.TargetPosition.addScaledVector(BodyRight, Side === "L" ? 0.145 : -0.145);

  const SolveStrength = THREE.MathUtils.lerp(0.42, 0.86, THREE.MathUtils.clamp(Strength, 0, 1));
  for (let Iteration = 0; Iteration < IK_ITERATIONS; Iteration += 1) {
    RotateJointToward(LowerArm, Wrist, State.TargetPosition, SolveStrength);
    RotateJointToward(UpperArm, Wrist, State.TargetPosition, SolveStrength * 0.84);
    Pivot.updateMatrixWorld(true);
  }
}

function EnforceArmClearance(Pivot, Side, RequestedBlend) {
  const ArmBones = Side === "L" ? LeftArmBones : RightArmBones;
  let Colliding = ArmChainHits(Pivot, Side);
  if (!Colliding && RequestedBlend < 0.06) return;

  const Strength = Math.max(RequestedBlend, Colliding ? 1 : 0);
  for (const Name of ArmBones) DampBoneToRest(Pivot, Name, Strength * 0.62);
  Pivot.updateMatrixWorld(true);
  SolveArmTowardTorso(Pivot, Side, Strength);
  Colliding = ArmChainHits(Pivot, Side);

  if (Colliding) {
    for (const Name of ArmBones) DampBoneToRest(Pivot, Name, 0.95);
    Pivot.updateMatrixWorld(true);
    SolveArmTowardTorso(Pivot, Side, 1);
  }
}

function EnforceLegClearance(Pivot, Side) {
  if (!LegChainHits(Pivot, Side)) return;
  const Bones = Side === "L" ? LeftLegBones : RightLegBones;
  for (const Name of Bones) DampBoneToRest(Pivot, Name, 0.88);
  Pivot.updateMatrixWorld(true);
  if (LegChainHits(Pivot, Side)) {
    for (const Name of Bones) DampBoneToRest(Pivot, Name, 0.98);
    AddBoneRotation(Pivot, `UpperLeg.${Side}`, -0.06, 0, Side === "L" ? 0.035 : -0.035);
    Pivot.updateMatrixWorld(true);
  }
}

function ApplyBodyClearance(Pivot) {
  let TotalPush = 0;
  const Contact = window.__STORE_MOVEMENT_CONTACT__;

  for (let Iteration = 0; Iteration < 6 && TotalPush < ROOT_PUSH_MAX; Iteration += 1) {
    State.EscapeSum.set(0, 0, 0);
    let HitCount = 0;

    for (const [Name, Radius] of BodySamples) {
      const Bone = Pivot.getObjectByName(Name);
      if (!Bone?.isBone) continue;
      Bone.getWorldPosition(State.Sample);

      const Collisions = State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];
      for (const Entry of Collisions) {
        const Bounds = EntryBounds(Entry);
        if (!EscapeNormalFromBounds(State.Sample, Radius, Bounds, State.EscapeNormal)) continue;
        State.EscapeSum.add(State.EscapeNormal);
        HitCount += 1;
      }
    }

    if (!HitCount) break;
    if (State.EscapeSum.lengthSq() <= 0.0001 && Contact?.Normal?.lengthSq?.() > 0.5) State.EscapeSum.copy(Contact.Normal);
    if (State.EscapeSum.lengthSq() <= 0.0001) break;

    State.EscapeSum.y = 0;
    State.EscapeSum.normalize();
    const Step = Math.min(ROOT_PUSH_STEP, ROOT_PUSH_MAX - TotalPush);
    Pivot.position.addScaledVector(State.EscapeSum, Step);
    TotalPush += Step;
    Pivot.updateMatrixWorld(true);
  }
}

function ApplyCollisionPose(Pivot) {
  const ForwardBlend = THREE.MathUtils.smoothstep(State.WallBlend, 0.02, 0.96);
  const LeftBlend = THREE.MathUtils.smoothstep(State.LeftBlend, 0.02, 0.92);
  const RightBlend = THREE.MathUtils.smoothstep(State.RightBlend, 0.02, 0.92);

  if (ForwardBlend > 0.001) {
    for (const [Name, Rest] of State.RestPose) {
      const Bone = Pivot.getObjectByName(Name);
      if (!Bone?.isBone) continue;
      const Weight = ForwardDampWeights.get(Name) || 0;
      Bone.quaternion.slerp(Rest, THREE.MathUtils.clamp(ForwardBlend * Weight, 0, 0.96));
    }
  }

  for (const Name of LeftArmBones) DampBoneToRest(Pivot, Name, LeftBlend * 0.97);
  for (const Name of RightArmBones) DampBoneToRest(Pivot, Name, RightBlend * 0.97);

  AddBoneRotation(Pivot, "Shoulder.L", -0.035 * LeftBlend, 0.02 * LeftBlend, 0.18 * LeftBlend);
  AddBoneRotation(Pivot, "UpperArm.L", -0.20 * LeftBlend, 0.05 * LeftBlend, 0.30 * LeftBlend);
  AddBoneRotation(Pivot, "LowerArm.L", -0.20 * LeftBlend, 0.02 * LeftBlend, 0.08 * LeftBlend);
  AddBoneRotation(Pivot, "Wrist.L", -0.06 * LeftBlend, 0, 0.05 * LeftBlend);

  AddBoneRotation(Pivot, "Shoulder.R", -0.035 * RightBlend, -0.02 * RightBlend, -0.18 * RightBlend);
  AddBoneRotation(Pivot, "UpperArm.R", -0.20 * RightBlend, -0.05 * RightBlend, -0.30 * RightBlend);
  AddBoneRotation(Pivot, "LowerArm.R", -0.20 * RightBlend, -0.02 * RightBlend, -0.08 * RightBlend);
  AddBoneRotation(Pivot, "Wrist.R", -0.06 * RightBlend, 0, -0.05 * RightBlend);

  const SideBalance = RightBlend - LeftBlend;
  AddBoneRotation(Pivot, "Chest", -0.045 * ForwardBlend, 0, SideBalance * 0.035);
  AddBoneRotation(Pivot, "Hips", 0.03 * ForwardBlend, 0, SideBalance * 0.012);
  Pivot.updateMatrixWorld(true);

  ApplyBodyClearance(Pivot);
  EnforceArmClearance(Pivot, "L", LeftBlend);
  EnforceArmClearance(Pivot, "R", RightBlend);
  EnforceLegClearance(Pivot, "L");
  EnforceLegClearance(Pivot, "R");
  Pivot.updateMatrixWorld(true);
}

function RestoreCurrentPose(Pivot) {
  for (const [Name, Quaternion] of State.SavedPose) {
    const Bone = Pivot.getObjectByName(Name);
    if (Bone?.isBone) Bone.quaternion.copy(Quaternion);
  }
  Pivot.updateMatrixWorld(true);
}

function Attach(Context) {
  State.Scene = Context.Scene || State.Scene;
  State.Camera = Context.Camera || State.Camera;
  State.CollisionBoxes = Context.CollisionBoxes || State.CollisionBoxes;
  BasePlayer.Attach?.(Context);
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene || State.Scene;
  State.Camera = Camera || State.Camera;

  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
      if (!Pivot || !BasePlayer.IsThirdPerson?.()) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      UpdateShapecast(RenderCamera, Pivot);
      CaptureRestPose(Pivot);
      SaveCurrentPose(Pivot);
      State.SavedPivotPosition.copy(Pivot.position);
      State.SavedPivotYaw = Pivot.rotation.y;

      try {
        ApplyStableContactFacing(Pivot);
        ApplyCollisionPose(Pivot);
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RestoreCurrentPose(Pivot);
        Pivot.position.copy(State.SavedPivotPosition);
        Pivot.rotation.y = State.SavedPivotYaw;
        Pivot.updateMatrixWorld(true);
      }
    }
  };

  BasePlayer.Render(ProxyRenderer, Scene, Camera);
}

addEventListener("keydown", Event => State.Keys.add(Event.code));
addEventListener("keyup", Event => State.Keys.delete(Event.code));
addEventListener("blur", () => State.Keys.clear());

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render
};

window.__STORE_LOCOMOTION_SHAPECAST__ = State;
window.__STORE_LOCOMOTION_SHAPECAST_BUILD__ = "V0.12.4";