import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before collision-aware locomotion.");

const WALK_PROBE = 0.72;
const SPRINT_PROBE = 0.96;
const PROBE_STEPS = 12;
const HAND_RADIUS = 0.085;
const HAND_SKIN = 0.018;
const HAND_EXTENSION = 0.115;
const HAND_ENTER_RESPONSE = 30;
const HAND_RELEASE_RESPONSE = 9;
const ARM_SOLVE_ITERATIONS = 5;
const ARM_RETRY_ITERATIONS = 3;
const CONTACT_FRESH_MS = 180;
const GAIT_ENTER_RESPONSE = 18;
const GAIT_EXIT_RESPONSE = 9;

const State = {
  Scene: null,
  Camera: null,
  CollisionBoxes: null,
  Keys: new Set(),
  LastTime: performance.now(),
  FrameDelta: 1 / 60,
  PivotPosition: new THREE.Vector3(),
  MoveDirection: new THREE.Vector3(),
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  Sample: new THREE.Vector3(),
  RestPivotUuid: "",
  RestPose: new Map(),
  SavedPose: new Map(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion(),
  TempQuaternionB: new THREE.Quaternion(),
  JointPosition: new THREE.Vector3(),
  EffectorPosition: new THREE.Vector3(),
  CurrentDirection: new THREE.Vector3(),
  TargetDirection: new THREE.Vector3(),
  ParentQuaternion: new THREE.Quaternion(),
  JointWorldQuaternion: new THREE.Quaternion(),
  DesiredWorldQuaternion: new THREE.Quaternion(),
  InverseParentQuaternion: new THREE.Quaternion(),
  ShoulderPosition: new THREE.Vector3(),
  LowerPosition: new THREE.Vector3(),
  WristPosition: new THREE.Vector3(),
  HandDirection: new THREE.Vector3(),
  DesiredTip: new THREE.Vector3(),
  SafeTip: new THREE.Vector3(),
  TargetWrist: new THREE.Vector3(),
  Segment: new THREE.Vector3(),
  GaitBlend: 0,
  LeftArm: {
    Initialized: false,
    TipTarget: new THREE.Vector3(),
    Blend: 0
  },
  RightArm: {
    Initialized: false,
    TipTarget: new THREE.Vector3(),
    Blend: 0
  }
};

const PoseBones = [
  "Hips", "Abdomen", "Torso", "Chest", "Neck",
  "Shoulder.L", "Shoulder.R", "UpperArm.L", "UpperArm.R",
  "LowerArm.L", "LowerArm.R", "Wrist.L", "Wrist.R",
  "UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R",
  "Foot.L", "Foot.R"
];

const GaitWeights = new Map([
  ["Hips", 0.12],
  ["Abdomen", 0.10],
  ["Torso", 0.08],
  ["UpperLeg.L", 0.76],
  ["UpperLeg.R", 0.76],
  ["LowerLeg.L", 0.68],
  ["LowerLeg.R", 0.68],
  ["Foot.L", 0.54],
  ["Foot.R", 0.54]
]);

function ExpAlpha(Delta, Responsiveness) {
  return 1 - Math.exp(-Delta * Responsiveness);
}

function FiniteBounds(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite) &&
    Bounds.min.x < Bounds.max.x &&
    Bounds.min.y < Bounds.max.y &&
    Bounds.min.z < Bounds.max.z
  );
}

function EntryBounds(Entry) {
  return Entry?.OriginalStructureBox || Entry?.OriginalBox || Entry?.Box || Entry || null;
}

function CircleHitsBounds(Position, Radius, Bounds) {
  if (!FiniteBounds(Bounds)) return false;
  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  const DX = Position.x - ClosestX;
  const DZ = Position.z - ClosestZ;
  return DX * DX + DZ * DZ <= Radius * Radius;
}

function PlayerProbeHits(Position, Radius) {
  const Collisions = State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];
  for (const Entry of Collisions) {
    if (!Entry) continue;
    const Bounds = EntryBounds(Entry);
    const IsStructure = Entry.PrecisePlayerStructure || /Wall|Partition/i.test(String(Entry.Type || ""));

    if (IsStructure && FiniteBounds(Bounds)) {
      if (CircleHitsBounds(Position, Radius, Bounds)) return true;
      continue;
    }

    if (typeof Entry.TestPlayerCollision === "function") {
      try {
        if (Entry.TestPlayerCollision(Position, Radius)) return true;
      } catch {}
      if (Entry.PreciseGeometry || Entry.LegacyCollisionDisabled || Entry.WalkableSurfaceR88) continue;
    }

    if (Entry.WalkableSurfaceR88) continue;
    if (FiniteBounds(Bounds) && CircleHitsBounds(Position, Radius, Bounds)) return true;
  }
  return false;
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

  if (State.MoveDirection.lengthSq() > 0.000001) State.MoveDirection.normalize();
  return State.MoveDirection;
}

function SweepCircle(Origin, Direction, Radius, Length) {
  if (Direction.lengthSq() < 0.000001 || Length <= 0) return Infinity;
  for (let Step = 1; Step <= PROBE_STEPS; Step += 1) {
    const Distance = Length * Step / PROBE_STEPS;
    State.Sample.copy(Origin).addScaledVector(Direction, Distance);
    if (PlayerProbeHits(State.Sample, Radius)) return Distance;
  }
  return Infinity;
}

function UpdateWallGait(Camera, Pivot) {
  const Now = performance.now();
  const Delta = THREE.MathUtils.clamp((Now - State.LastTime) / 1000, 0.001, 0.05);
  State.LastTime = Now;
  State.FrameDelta = Delta;

  if (!BasePlayer.IsThirdPerson?.()) {
    State.GaitBlend = THREE.MathUtils.lerp(State.GaitBlend, 0, ExpAlpha(Delta, GAIT_EXIT_RESPONSE));
    return;
  }

  Pivot.getWorldPosition(State.PivotPosition);
  State.PivotPosition.y = 0;
  const Direction = InputDirection(Camera);
  const Moving = Direction.lengthSq() > 0.000001;
  let Target = 0;

  if (Moving) {
    const Radius = THREE.MathUtils.clamp(Number(BasePlayer.GetPlayerRadius?.()) || 0.34, 0.28, 0.38);
    const Length = BasePlayer.IsSprinting?.() ? SPRINT_PROBE : WALK_PROBE;
    const Distance = SweepCircle(State.PivotPosition, Direction, Radius, Length);
    if (Number.isFinite(Distance)) {
      Target = 1 - THREE.MathUtils.clamp((Distance - 0.08) / Math.max(Length - 0.08, 0.01), 0, 1);
    }
  }

  const Contact = window.__STORE_MOVEMENT_CONTACT__;
  if (Contact?.Strength > 0.01 && performance.now() - Contact.LastHit <= CONTACT_FRESH_MS) {
    Target = Math.max(Target, THREE.MathUtils.clamp(Contact.Strength * 0.78, 0, 1));
  }

  State.GaitBlend = THREE.MathUtils.lerp(
    State.GaitBlend,
    Target,
    ExpAlpha(Delta, Target > State.GaitBlend ? GAIT_ENTER_RESPONSE : GAIT_EXIT_RESPONSE)
  );
}

function CaptureRestPose(Pivot) {
  if (!Pivot || State.RestPivotUuid === Pivot.uuid) return;
  State.RestPivotUuid = Pivot.uuid;
  State.RestPose.clear();
  State.LeftArm.Initialized = false;
  State.RightArm.Initialized = false;
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

function RestoreCurrentPose(Pivot) {
  for (const [Name, Quaternion] of State.SavedPose) {
    const Bone = Pivot.getObjectByName(Name);
    if (Bone?.isBone) Bone.quaternion.copy(Quaternion);
  }
  Pivot.updateMatrixWorld(true);
}

function DampBoneToRest(Pivot, Name, Blend) {
  const Bone = Pivot.getObjectByName(Name);
  const Rest = State.RestPose.get(Name);
  if (!Bone?.isBone || !Rest || Blend <= 0) return;
  Bone.quaternion.slerp(Rest, THREE.MathUtils.clamp(Blend, 0, 0.92));
}

function ApplyGaitCompression(Pivot) {
  const Blend = THREE.MathUtils.smoothstep(State.GaitBlend, 0.06, 0.96);
  if (Blend <= 0.001) return;
  for (const [Name, Weight] of GaitWeights) DampBoneToRest(Pivot, Name, Blend * Weight);
  Pivot.updateMatrixWorld(true);
}

function PointInsideExpandedBounds(Point, Bounds, Padding) {
  return Point.x >= Bounds.min.x - Padding && Point.x <= Bounds.max.x + Padding &&
    Point.y >= Bounds.min.y - Padding && Point.y <= Bounds.max.y + Padding &&
    Point.z >= Bounds.min.z - Padding && Point.z <= Bounds.max.z + Padding;
}

function SegmentExpandedBoundsFraction(Start, End, Bounds, Padding) {
  if (!FiniteBounds(Bounds)) return null;
  if (PointInsideExpandedBounds(Start, Bounds, Padding)) return null;

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

  if (TMin < 0 || TMin > 1) return null;
  return TMin;
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
      const Allowed = THREE.MathUtils.clamp(Earliest - SkinFraction, 0.02, 1);
      Result.lerpVectors(Shoulder, DesiredTip, Allowed);
    }
  }

  for (let Pass = 0; Pass < 3; Pass += 1) {
    let Changed = false;
    for (const Entry of Collisions) {
      const Bounds = EntryBounds(Entry);
      if (PushPointOutsideExpandedBounds(Result, Bounds, Padding)) Changed = true;
    }
    if (!Changed) break;
  }

  return Earliest < 1 || !Result.equals(DesiredTip);
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
  State.TempQuaternion.setFromUnitVectors(State.CurrentDirection, State.TargetDirection);
  Joint.getWorldQuaternion(State.JointWorldQuaternion);
  State.DesiredWorldQuaternion.copy(State.TempQuaternion).multiply(State.JointWorldQuaternion);
  Joint.parent.getWorldQuaternion(State.ParentQuaternion);
  State.InverseParentQuaternion.copy(State.ParentQuaternion).invert();
  State.TempQuaternionB.copy(State.InverseParentQuaternion).multiply(State.DesiredWorldQuaternion).normalize();
  Joint.quaternion.slerp(State.TempQuaternionB, THREE.MathUtils.clamp(Strength, 0, 1));
  Joint.updateMatrixWorld(true);
}

function ArmSegmentBlocked(BoneA, BoneB, Radius) {
  if (!BoneA?.isBone || !BoneB?.isBone) return false;
  BoneA.getWorldPosition(State.ShoulderPosition);
  BoneB.getWorldPosition(State.WristPosition);
  const Collisions = State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];
  for (const Entry of Collisions) {
    const Bounds = EntryBounds(Entry);
    const Hit = SegmentExpandedBoundsFraction(State.ShoulderPosition, State.WristPosition, Bounds, Radius);
    if (Hit !== null) return true;
  }
  return false;
}

function SolveArmToWrist(Pivot, UpperArm, LowerArm, Wrist, TargetWrist, Strength, Iterations) {
  for (let Iteration = 0; Iteration < Iterations; Iteration += 1) {
    RotateJointToward(LowerArm, Wrist, TargetWrist, Strength);
    RotateJointToward(UpperArm, Wrist, TargetWrist, Strength * 0.82);
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
  if (State.HandDirection.lengthSq() <= 0.000001) {
    State.HandDirection.set(Side === "L" ? -1 : 1, 0, 0);
  } else {
    State.HandDirection.normalize();
  }

  State.DesiredTip.copy(State.WristPosition).addScaledVector(State.HandDirection, HAND_EXTENSION);
  const Blocked = ClampHandTip(State.ShoulderPosition, State.DesiredTip, State.SafeTip);
  const Separation = State.DesiredTip.distanceTo(State.SafeTip);
  const TargetBlend = THREE.MathUtils.clamp(Separation / 0.24, 0, 1);
  ArmState.Blend = THREE.MathUtils.lerp(
    ArmState.Blend,
    TargetBlend,
    ExpAlpha(State.FrameDelta, TargetBlend > ArmState.Blend ? HAND_ENTER_RESPONSE : HAND_RELEASE_RESPONSE)
  );

  if (!ArmState.Initialized) {
    ArmState.TipTarget.copy(Blocked ? State.SafeTip : State.DesiredTip);
    ArmState.Initialized = true;
  } else if (Blocked) {
    ArmState.TipTarget.lerp(State.SafeTip, ExpAlpha(State.FrameDelta, HAND_ENTER_RESPONSE));
  } else {
    ArmState.TipTarget.lerp(State.DesiredTip, ExpAlpha(State.FrameDelta, HAND_RELEASE_RESPONSE));
  }

  ClampHandTip(State.ShoulderPosition, ArmState.TipTarget, ArmState.TipTarget);
  State.TargetWrist.copy(ArmState.TipTarget).addScaledVector(State.HandDirection, -HAND_EXTENSION);

  if (ArmState.Blend > 0.001) {
    DampBoneToRest(Pivot, `Shoulder.${Side}`, ArmState.Blend * 0.14);
    DampBoneToRest(Pivot, `UpperArm.${Side}`, ArmState.Blend * 0.18);
    DampBoneToRest(Pivot, `LowerArm.${Side}`, ArmState.Blend * 0.10);
    Pivot.updateMatrixWorld(true);
  }

  SolveArmToWrist(Pivot, UpperArm, LowerArm, Wrist, State.TargetWrist, 0.78, ARM_SOLVE_ITERATIONS);

  for (let Retry = 0; Retry < ARM_RETRY_ITERATIONS; Retry += 1) {
    const UpperBlocked = ArmSegmentBlocked(UpperArm, LowerArm, HAND_RADIUS * 0.82);
    const LowerBlocked = ArmSegmentBlocked(LowerArm, Wrist, HAND_RADIUS * 0.82);
    LowerArm.getWorldPosition(State.LowerPosition);
    Wrist.getWorldPosition(State.WristPosition);
    State.HandDirection.copy(State.WristPosition).sub(State.LowerPosition).normalize();
    State.DesiredTip.copy(State.WristPosition).addScaledVector(State.HandDirection, HAND_EXTENSION);
    const TipBlocked = ClampHandTip(State.ShoulderPosition, State.DesiredTip, State.SafeTip);
    if (!UpperBlocked && !LowerBlocked && !TipBlocked) break;

    ArmState.TipTarget.lerp(State.ShoulderPosition, 0.11);
    ClampHandTip(State.ShoulderPosition, ArmState.TipTarget, ArmState.TipTarget);
    State.TargetWrist.copy(ArmState.TipTarget).addScaledVector(State.HandDirection, -HAND_EXTENSION);
    SolveArmToWrist(Pivot, UpperArm, LowerArm, Wrist, State.TargetWrist, 0.70, 2);
  }
}

function ApplyCollisionAwarePose(Pivot) {
  ApplyGaitCompression(Pivot);
  ConstrainArm(Pivot, "L");
  ConstrainArm(Pivot, "R");
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

      UpdateWallGait(RenderCamera, Pivot);
      CaptureRestPose(Pivot);
      SaveCurrentPose(Pivot);

      try {
        ApplyCollisionAwarePose(Pivot);
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RestoreCurrentPose(Pivot);
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
window.__STORE_LOCOMOTION_SHAPECAST_BUILD__ = "V0.12.5";
