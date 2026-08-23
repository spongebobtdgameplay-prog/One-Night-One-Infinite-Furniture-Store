import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;

if (!BasePlayer) throw new Error("Player controller must load before procedural locomotion.");

const State = {
  Scene: null,
  Camera: null,
  Pivot: null,
  Bones: new Map(),
  Saved: new Map(),
  LastPosition: new THREE.Vector3(),
  HasPosition: false,
  LastYaw: 0,
  HasYaw: false,
  SmoothedSpeed: 0,
  SmoothedTurn: 0,
  SmoothedStrafe: 0,
  Phase: 0,
  LastRenderAt: performance.now(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion(),
  TempMovement: new THREE.Vector3(),
  UpAxis: new THREE.Vector3(0, 1, 0)
};

const BoneNames = {
  Hips: "Hips",
  Abdomen: "Abdomen",
  Torso: "Torso",
  Chest: "Chest",
  Neck: "Neck",
  Head: "Head",
  ShoulderL: "Shoulder.L",
  ShoulderR: "Shoulder.R",
  UpperArmL: "UpperArm.L",
  UpperArmR: "UpperArm.R",
  LowerArmL: "LowerArm.L",
  LowerArmR: "LowerArm.R",
  WristL: "Wrist.L",
  WristR: "Wrist.R",
  UpperLegL: "UpperLeg.L",
  UpperLegR: "UpperLeg.R",
  LowerLegL: "LowerLeg.L",
  LowerLegR: "LowerLeg.R",
  FootL: "Foot.L",
  FootR: "Foot.R"
};

function NormalizeAngle(Angle) {
  return Math.atan2(Math.sin(Angle), Math.cos(Angle));
}

function RefreshRig() {
  if (!State.Scene) return false;
  const Pivot = State.Scene.getObjectByName("PlayerCharacterPivot") || null;
  if (!Pivot) return false;
  if (Pivot !== State.Pivot) {
    State.Pivot = Pivot;
    State.Bones.clear();
    for (const [Key, Name] of Object.entries(BoneNames)) {
      const Bone = Pivot.getObjectByName(Name);
      if (Bone?.isBone) State.Bones.set(Key, Bone);
    }
    State.HasPosition = false;
    State.HasYaw = false;
  }
  return State.Bones.size > 0;
}

function SaveBones() {
  State.Saved.clear();
  for (const [Name, Bone] of State.Bones) State.Saved.set(Name, Bone.quaternion.clone());
}

function RestoreBones() {
  for (const [Name, Quaternion] of State.Saved) {
    const Bone = State.Bones.get(Name);
    if (Bone) Bone.quaternion.copy(Quaternion);
  }
}

function Apply(Name, X = 0, Y = 0, Z = 0) {
  const Bone = State.Bones.get(Name);
  if (!Bone) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion);
}

function ApplyProceduralMotion(Delta) {
  if (!State.Pivot || !State.Camera) return;

  const Position = State.Camera.position;
  if (!State.HasPosition) {
    State.LastPosition.copy(Position);
    State.HasPosition = true;
  }

  State.TempMovement.set(Position.x - State.LastPosition.x, 0, Position.z - State.LastPosition.z);
  State.LastPosition.copy(Position);
  const Distance = State.TempMovement.length();
  const InstantSpeed = Distance / Math.max(Delta, 0.001);
  State.SmoothedSpeed = THREE.MathUtils.lerp(State.SmoothedSpeed, InstantSpeed, 1 - Math.exp(-Delta * 9));

  const Yaw = State.Pivot.rotation.y;
  if (!State.HasYaw) {
    State.LastYaw = Yaw;
    State.HasYaw = true;
  }
  const TurnVelocity = NormalizeAngle(Yaw - State.LastYaw) / Math.max(Delta, 0.001);
  State.LastYaw = Yaw;
  State.SmoothedTurn = THREE.MathUtils.lerp(State.SmoothedTurn, THREE.MathUtils.clamp(TurnVelocity, -3.5, 3.5), 1 - Math.exp(-Delta * 7));

  let Strafe = 0;
  if (Distance > 0.000001) {
    State.TempMovement.normalize().applyAxisAngle(State.UpAxis, -Yaw);
    Strafe = THREE.MathUtils.clamp(State.TempMovement.x, -1, 1);
  }
  State.SmoothedStrafe = THREE.MathUtils.lerp(State.SmoothedStrafe, Strafe, 1 - Math.exp(-Delta * 8));

  const Sprinting = Boolean(BasePlayer.IsSprinting?.());
  const Moving = State.SmoothedSpeed > 0.10;
  const SpeedScale = THREE.MathUtils.clamp(State.SmoothedSpeed / (Sprinting ? 5.3 : 3.45), 0, 1.2);
  const Cadence = Sprinting ? 9.4 : 6.3;
  State.Phase += Delta * (Moving ? THREE.MathUtils.lerp(4.5, Cadence, Math.min(1, SpeedScale)) : 1.15);

  const Stride = Moving ? Math.sin(State.Phase) : 0;
  const Step = Moving ? Math.sin(State.Phase * 2) : 0;
  const Heel = Moving ? Math.max(0, -Stride) : 0;
  const Toe = Moving ? Math.max(0, Stride) : 0;
  const Breath = Math.sin(performance.now() * 0.00175) * 0.012;
  const Micro = Math.sin(performance.now() * 0.0029 + 1.3) * 0.006;
  const TurnLean = THREE.MathUtils.clamp(State.SmoothedTurn * 0.055, -0.12, 0.12);
  const StrafeLean = State.SmoothedStrafe * 0.055 * SpeedScale;
  const RunLean = Sprinting ? 0.10 * SpeedScale : 0.035 * SpeedScale;
  const LegSwing = (Sprinting ? 0.58 : 0.40) * SpeedScale;
  const ArmSwing = (Sprinting ? 0.42 : 0.28) * SpeedScale;

  Apply("Hips", -RunLean * 0.35 + Breath, -Stride * 0.018 * SpeedScale, -TurnLean * 0.30 - StrafeLean * 0.45);
  Apply("Abdomen", RunLean * 0.42 + Breath * 0.45, -Stride * 0.022 * SpeedScale, TurnLean * 0.28 + StrafeLean * 0.55);
  Apply("Torso", RunLean * 0.34, Stride * 0.028 * SpeedScale, TurnLean * 0.34 + StrafeLean * 0.35);
  Apply("Chest", RunLean * 0.24 + Micro, -Stride * 0.038 * SpeedScale, TurnLean * 0.25);
  Apply("Neck", -RunLean * 0.34 - Breath * 0.35, 0, -TurnLean * 0.18);
  Apply("Head", -RunLean * 0.22 - Math.abs(Step) * 0.008 * SpeedScale, 0, -TurnLean * 0.12);
  Apply("ShoulderL", 0.01 + Breath, 0, 0.035 + TurnLean * 0.18);
  Apply("ShoulderR", 0.01 + Breath, 0, -0.035 + TurnLean * 0.18);
  Apply("UpperArmL", -Stride * ArmSwing - RunLean * 0.18, 0.015, 0.035);
  Apply("UpperArmR", Stride * ArmSwing - RunLean * 0.18, -0.015, -0.035);
  Apply("LowerArmL", -0.07 - Math.max(0, Stride) * 0.15 * SpeedScale, 0, 0.018);
  Apply("LowerArmR", -0.07 - Math.max(0, -Stride) * 0.15 * SpeedScale, 0, -0.018);
  Apply("WristL", Step * 0.02 * SpeedScale, 0, 0);
  Apply("WristR", -Step * 0.02 * SpeedScale, 0, 0);
  Apply("UpperLegL", Stride * LegSwing, 0, StrafeLean * 0.12);
  Apply("UpperLegR", -Stride * LegSwing, 0, StrafeLean * 0.12);
  Apply("LowerLegL", Heel * LegSwing * 0.62, 0, 0);
  Apply("LowerLegR", Toe * LegSwing * 0.62, 0, 0);
  Apply("FootL", -Heel * 0.18 * SpeedScale + Toe * 0.08 * SpeedScale, 0, 0);
  Apply("FootR", -Toe * 0.18 * SpeedScale + Heel * 0.08 * SpeedScale, 0, 0);
}

function Attach(Context) {
  State.Scene = Context.Scene;
  State.Camera = Context.Camera;
  BasePlayer.Attach(Context);
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene;
  State.Camera = Camera;
  const Now = performance.now();
  const Delta = Math.min((Now - State.LastRenderAt) / 1000, 0.05);
  State.LastRenderAt = Now;

  if (!BasePlayer.IsThirdPerson?.() || !RefreshRig()) {
    BasePlayer.Render(Renderer, Scene, Camera);
    return;
  }

  SaveBones();
  ApplyProceduralMotion(Delta);
  try {
    BasePlayer.Render(Renderer, Scene, Camera);
  } finally {
    RestoreBones();
  }
}

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render
};

window.__STORE_PROCEDURAL_LOCOMOTION_BUILD__ = "V0.11-R8";
