import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before collision-aware locomotion.");

const HAND_RADIUS = 0.095;
const HAND_SKIN = 0.024;
const HAND_EXTENSION = 0.13;
const HAND_ENTER_RESPONSE = 34;
const HAND_RELEASE_RESPONSE = 12;
const ARM_SOLVE_ITERATIONS = 6;
const ARM_RETRY_ITERATIONS = 4;

const State = {
  Scene: null,
  Camera: null,
  CollisionBoxes: null,
  LastTime: performance.now(),
  FrameDelta: 1 / 60,
  SavedPose: new Map(),
  Segment: new THREE.Vector3(),
  ShoulderPosition: new THREE.Vector3(),
  LowerPosition: new THREE.Vector3(),
  WristPosition: new THREE.Vector3(),
  HandDirection: new THREE.Vector3(),
  DesiredTip: new THREE.Vector3(),
  SafeTip: new THREE.Vector3(),
  TargetWrist: new THREE.Vector3(),
  JointPosition: new THREE.Vector3(),
  EffectorPosition: new THREE.Vector3(),
  CurrentDirection: new THREE.Vector3(),
  TargetDirection: new THREE.Vector3(),
  JointWorldQuaternion: new THREE.Quaternion(),
  ParentQuaternion: new THREE.Quaternion(),
  InverseParentQuaternion: new THREE.Quaternion(),
  DeltaQuaternion: new THREE.Quaternion(),
  DesiredWorldQuaternion: new THREE.Quaternion(),
  TempQuaternion: new THREE.Quaternion(),
  LeftArm: { Initialized: false, TipTarget: new THREE.Vector3(), Blend: 0 },
  RightArm: { Initialized: false, TipTarget: new THREE.Vector3(), Blend: 0 }
};

const ArmBones = [
  "Shoulder.L", "UpperArm.L", "LowerArm.L", "Wrist.L",
  "Shoulder.R", "UpperArm.R", "LowerArm.R", "Wrist.R"
];

function ExpAlpha(Delta, Responsiveness) {
  return 1 - Math.exp(-Delta * Responsiveness);
}

function UpdateDelta() {
  const Now = performance.now();
  State.FrameDelta = THREE.MathUtils.clamp((Now - State.LastTime) / 1000, 0.001, 0.05);
  State.LastTime = Now;
}

function FiniteBounds(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite) &&
    Bounds.min.x < Bounds.max.x && Bounds.min.y < Bounds.max.y && Bounds.min.z < Bounds.max.z
  );
}

function EntryBounds(Entry) {
  return Entry?.OriginalStructureBox || Entry?.OriginalBox || Entry?.Box || Entry || null;
}

function PointInsideExpandedBounds(Point, Bounds, Padding) {
  return Point.x >= Bounds.min.x - Padding && Point.x <= Bounds.max.x + Padding &&
    Point.y >= Bounds.min.y - Padding && Point.y <= Bounds.max.y + Padding &&
    Point.z >= Bounds.min.z - Padding && Point.z <= Bounds.max.z + Padding;
}

function SegmentExpandedBoundsFraction(Start, End, Bounds, Padding) {
  if (!FiniteBounds(Bounds)) return null;
  State.Segment.copy(End).sub(Start);
  let TMin = 0;
  let TMax = 1;

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
    TMin = Math.max(TMin, Near);
    TMax = Math.min(TMax, Far);
    if (TMin > TMax) return null;
  }

  if (TMax < 0 || TMin > 1) return null;
  return THREE.MathUtils.clamp(Math.max(0, TMin), 0, 1);
}

function PushPointOutsideExpandedBounds(Point, Bounds, Padding) {
  if (!FiniteBounds(Bounds) || !PointInsideExpandedBounds(Point, Bounds, Padding)) return false;

  const MinX = Bounds.min.x - Padding;
  const MaxX = Bounds.max.x + Padding;
  const MinY = Bounds.min.y - Padding;
  const MaxY = Bounds.max.y + Padding;
  const MinZ = Bounds.min.z - Padding;
  const MaxZ = Bounds.max.z + Padding;
  const Distances = [
    [Math.abs(Point.x - MinX), "x", MinX],
    [Math.abs(MaxX - Point.x), "x", MaxX],
    [Math.abs(Point.y - MinY), "y", MinY],
    [Math.abs(MaxY - Point.y), "y", MaxY],
    [Math.abs(Point.z - MinZ), "z", MinZ],
    [Math.abs(MaxZ - Point.z), "z", MaxZ]
  ];
  Distances.sort((A, B) => A[0] - B[0]);
  Point[Distances[0][1]] = Distances[0][2];
  return true;
}

function ClampHandTip(Shoulder, DesiredTip, Result) {
  Result.copy(DesiredTip);
  const Collisions = State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];
  const Padding = HAND_RADIUS + HAND_SKIN;
  const SegmentLength = Shoulder.distanceTo(DesiredTip);
  let Earliest = 1;

  if (SegmentLength > 0.0001) {
    for (const Entry of Collisions) {
      const Bounds = EntryBounds(Entry);
      const Hit = SegmentExpandedBoundsFraction(Shoulder, DesiredTip, Bounds, Padding);
      if (Hit !== null) Earliest = Math.min(Earliest, Hit);
    }

    if (Earliest < 1) {
      const SkinFraction = HAND_SKIN / SegmentLength;
      const Allowed = THREE.MathUtils.clamp(Earliest - SkinFraction, 0.015, 1);
      Result.lerpVectors(Shoulder, DesiredTip, Allowed);
    }
  }

  for (let Pass = 0; Pass < 4; Pass += 1) {
    let Changed = false;
    for (const Entry of Collisions) {
      const Bounds = EntryBounds(Entry);
      if (PushPointOutsideExpandedBounds(Result, Bounds, Padding)) Changed = true;
    }
    if (!Changed) break;
  }

  return Earliest < 1 || Result.distanceToSquared(DesiredTip) > 0.0000001;
}

function SaveArmPose(Pivot) {
  State.SavedPose.clear();
  for (const Name of ArmBones) {
    const Bone = Pivot.getObjectByName(Name);
    if (Bone?.isBone) State.SavedPose.set(Bone, Bone.quaternion.clone());
  }
}

function RestoreArmPose(Pivot) {
  for (const [Bone, Quaternion] of State.SavedPose) Bone.quaternion.copy(Quaternion);
  State.SavedPose.clear();
  Pivot.updateMatrixWorld(true);
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

function ArmSegmentBlocked(BoneA, BoneB, Radius) {
  if (!BoneA?.isBone || !BoneB?.isBone) return false;
  BoneA.getWorldPosition(State.ShoulderPosition);
  BoneB.getWorldPosition(State.WristPosition);
  const Collisions = State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];

  for (const Entry of Collisions) {
    const Bounds = EntryBounds(Entry);
    if (SegmentExpandedBoundsFraction(State.ShoulderPosition, State.WristPosition, Bounds, Radius) !== null) return true;
  }
  return false;
}

function SolveArmToWrist(Pivot, UpperArm, LowerArm, Wrist, TargetWrist, Strength, Iterations) {
  for (let Iteration = 0; Iteration < Iterations; Iteration += 1) {
    RotateJointToward(LowerArm, Wrist, TargetWrist, Strength);
    RotateJointToward(UpperArm, Wrist, TargetWrist, Strength * 0.84);
    Pivot.updateMatrixWorld(true);
  }
}

function ConstrainArm(Pivot, Side) {
  const Shoulder = Pivot.getObjectByName(`Shoulder.${Side}`);
  const UpperArm = Pivot.getObjectByName(`UpperArm.${Side}`);
  const LowerArm = Pivot.getObjectByName(`LowerArm.${Side}`);
  const Wrist = Pivot.getObjectByName(`Wrist.${Side}`);
  if (!Shoulder?.isBone || !UpperArm?.isBone || !LowerArm?.isBone || !Wrist?.isBone) return;

  const ArmState = Side === "L" ? State.LeftArm : State.RightArm;
  Shoulder.getWorldPosition(State.ShoulderPosition);
  LowerArm.getWorldPosition(State.LowerPosition);
  Wrist.getWorldPosition(State.WristPosition);

  State.HandDirection.copy(State.WristPosition).sub(State.LowerPosition);
  if (State.HandDirection.lengthSq() <= 0.000001) State.HandDirection.set(Side === "L" ? -1 : 1, 0, 0);
  else State.HandDirection.normalize();

  State.DesiredTip.copy(State.WristPosition).addScaledVector(State.HandDirection, HAND_EXTENSION);
  const Blocked = ClampHandTip(State.ShoulderPosition, State.DesiredTip, State.SafeTip);
  const Separation = State.DesiredTip.distanceTo(State.SafeTip);
  const TargetBlend = Blocked ? THREE.MathUtils.clamp(0.28 + Separation / 0.20, 0, 1) : 0;

  ArmState.Blend = THREE.MathUtils.lerp(
    ArmState.Blend,
    TargetBlend,
    ExpAlpha(State.FrameDelta, TargetBlend > ArmState.Blend ? HAND_ENTER_RESPONSE : HAND_RELEASE_RESPONSE)
  );

  if (!ArmState.Initialized) {
    ArmState.TipTarget.copy(Blocked ? State.SafeTip : State.DesiredTip);
    ArmState.Initialized = true;
  } else {
    const Target = Blocked ? State.SafeTip : State.DesiredTip;
    const Response = Blocked ? HAND_ENTER_RESPONSE : HAND_RELEASE_RESPONSE;
    ArmState.TipTarget.lerp(Target, ExpAlpha(State.FrameDelta, Response));
  }

  if (ArmState.Blend <= 0.002 && !Blocked) return;

  ClampHandTip(State.ShoulderPosition, ArmState.TipTarget, ArmState.TipTarget);
  State.TargetWrist.copy(ArmState.TipTarget).addScaledVector(State.HandDirection, -HAND_EXTENSION);
  SolveArmToWrist(Pivot, UpperArm, LowerArm, Wrist, State.TargetWrist, 0.82, ARM_SOLVE_ITERATIONS);

  for (let Retry = 0; Retry < ARM_RETRY_ITERATIONS; Retry += 1) {
    const UpperBlocked = ArmSegmentBlocked(UpperArm, LowerArm, HAND_RADIUS * 0.90);
    const LowerBlocked = ArmSegmentBlocked(LowerArm, Wrist, HAND_RADIUS * 0.90);
    LowerArm.getWorldPosition(State.LowerPosition);
    Wrist.getWorldPosition(State.WristPosition);
    State.HandDirection.copy(State.WristPosition).sub(State.LowerPosition);
    if (State.HandDirection.lengthSq() > 0.000001) State.HandDirection.normalize();
    State.DesiredTip.copy(State.WristPosition).addScaledVector(State.HandDirection, HAND_EXTENSION);
    const TipBlocked = ClampHandTip(State.ShoulderPosition, State.DesiredTip, State.SafeTip);
    if (!UpperBlocked && !LowerBlocked && !TipBlocked) break;

    ArmState.TipTarget.lerp(State.ShoulderPosition, 0.14);
    ClampHandTip(State.ShoulderPosition, ArmState.TipTarget, ArmState.TipTarget);
    State.TargetWrist.copy(ArmState.TipTarget).addScaledVector(State.HandDirection, -HAND_EXTENSION);
    SolveArmToWrist(Pivot, UpperArm, LowerArm, Wrist, State.TargetWrist, 0.76, 2);
  }
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
  UpdateDelta();

  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
      if (!Pivot || !BasePlayer.IsThirdPerson?.()) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      SaveArmPose(Pivot);
      try {
        ConstrainArm(Pivot, "L");
        ConstrainArm(Pivot, "R");
        Pivot.updateMatrixWorld(true);
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RestoreArmPose(Pivot);
      }
    }
  };

  BasePlayer.Render(ProxyRenderer, Scene, Camera);
}

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render
};

window.__STORE_LOCOMOTION_SHAPECAST__ = State;
window.__STORE_LOCOMOTION_SHAPECAST_BUILD__ = "V0.12.7";
