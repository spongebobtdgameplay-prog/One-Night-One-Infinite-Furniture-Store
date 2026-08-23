import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const BasePlayer = window.__STORE_PLAYER__;
const Canvas = document.getElementById("GameCanvas");
const Crosshair = document.querySelector(".Crosshair");
const CameraMode = document.getElementById("CameraModeValue");
const StaminaFill = document.getElementById("StaminaFill");
const StaminaValue = document.getElementById("StaminaValue");
const StaminaWrap = document.getElementById("StaminaWrap");

if (!BasePlayer || !Canvas) throw new Error("Base player and canvas must load before procedural player system.");

const WALK_SPEED = 3.45;
const SPRINT_SPEED = 5.35;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 22;
const STAMINA_REGEN = 18;
const STAMINA_REGEN_DELAY = 0.75;
const STAMINA_RECOVER_THRESHOLD = 24;
const THIRD_PERSON_DEFAULT = 4.8;
const THIRD_PERSON_MIN = 1.45;
const THIRD_PERSON_MAX = 6.0;
const FIRST_PERSON_SWITCH = 1.08;
const OUT_FROM_FIRST = 2.0;
const ZOOM_PIXELS_TO_DISTANCE = 0.0135;
const CAMERA_TARGET_HEIGHT = 1.26;
const CAMERA_SHOULDER = 0.26;
const CAMERA_FLOOR = 0.34;
const CAMERA_CEILING = 3.48;
const CAMERA_PADDING = 0.10;
const FIRST_PERSON_NEAR = 0.018;
const PLAYER_RADIUS = 0.34;
const TURN_RESPONSIVENESS = 13;

const State = {
  Scene: null,
  Camera: null,
  Renderer: null,
  CollisionBoxes: null,
  Controls: null,
  ThirdPerson: true,
  Distance: THIRD_PERSON_DEFAULT,
  OrbitHeld: false,
  Pivot: null,
  Head: null,
  Bones: new Map(),
  BaseQuaternions: new Map(),
  BasePositions: new Map(),
  BodyMeshes: [],
  RigStamp: "",
  LastRenderAt: performance.now(),
  LastPosition: new THREE.Vector3(),
  HasPosition: false,
  Velocity: new THREE.Vector3(),
  SmoothedVelocity: new THREE.Vector3(),
  PreviousSpeed: 0,
  Acceleration: 0,
  SmoothedAcceleration: 0,
  MoveAmount: 0,
  LocalForward: 0,
  LocalStrafe: 0,
  TurnRate: 0,
  PreviousYaw: 0,
  HasYaw: false,
  Phase: 0,
  Stamina: STAMINA_MAX,
  Sprinting: false,
  WantsSprint: false,
  Moving: false,
  Exhausted: false,
  LastSprintAt: -Infinity,
  TempForward: new THREE.Vector3(),
  TempRight: new THREE.Vector3(),
  TempUp: new THREE.Vector3(0, 1, 0),
  TempTarget: new THREE.Vector3(),
  TempDesired: new THREE.Vector3(),
  TempOffset: new THREE.Vector3(),
  TempStart: new THREE.Vector3(),
  TempEnd: new THREE.Vector3(),
  TempCurrentDirection: new THREE.Vector3(),
  TempDesiredDirection: new THREE.Vector3(),
  TempElbowTarget: new THREE.Vector3(),
  TempWristTarget: new THREE.Vector3(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion(),
  TempQuaternionB: new THREE.Quaternion(),
  TempQuaternionC: new THREE.Quaternion(),
  TempQuaternionD: new THREE.Quaternion(),
  SavedCameraPosition: new THREE.Vector3(),
  SavedCameraQuaternion: new THREE.Quaternion(),
  SavedHeadScale: new THREE.Vector3()
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

const OriginalLock = PointerLockControls.prototype.lock;
const OriginalUnlock = PointerLockControls.prototype.unlock;

if (!BasePlayer.IsThirdPerson?.()) {
  window.dispatchEvent(new KeyboardEvent("keydown", {
    code: "KeyV",
    key: "v",
    bubbles: false,
    cancelable: true
  }));
}

function HudActive() {
  const Hud = document.getElementById("Hud");
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function ExpAlpha(Delta, Responsiveness) {
  return 1 - Math.exp(-Delta * Responsiveness);
}

function NormalizeAngle(Angle) {
  return Math.atan2(Math.sin(Angle), Math.cos(Angle));
}

function CameraHorizontalForward(Target = State.TempForward) {
  if (!State.Camera) return Target.set(0, 0, -1);
  Target.set(0, 0, -1).applyQuaternion(State.Camera.quaternion);
  Target.y = 0;
  if (Target.lengthSq() < 0.000001) Target.set(0, 0, -1);
  return Target.normalize();
}

function CameraFacingYaw() {
  CameraHorizontalForward(State.TempForward);
  return Math.atan2(State.TempForward.x, State.TempForward.z);
}

function CaptureControls(Controls) {
  if (!Controls) return;
  State.Controls = Controls;
  window.__STORE_POINTER_CONTROLS__ = Controls;
}

function ApplyInputMode() {
  const Controls = State.Controls || window.__STORE_POINTER_CONTROLS__ || null;
  if (Controls) {
    CaptureControls(Controls);
    Controls.isLocked = HudActive();
    Controls.pointerSpeed = State.ThirdPerson ? (State.OrbitHeld ? 1 : 0) : 1;
  }

  const Cursor = State.ThirdPerson ? "default" : "none";
  Canvas.style.cursor = Cursor;
  document.body.style.cursor = Cursor;
  if (Crosshair) Crosshair.style.display = State.ThirdPerson ? "none" : "block";
  if (CameraMode) CameraMode.textContent = State.ThirdPerson ? "THIRD" : "FIRST";
}

PointerLockControls.prototype.lock = function(...Args) {
  CaptureControls(this);
  if (State.ThirdPerson) {
    this.isLocked = true;
    this.pointerSpeed = State.OrbitHeld ? 1 : 0;
    ApplyInputMode();
    return;
  }

  this.isLocked = true;
  this.pointerSpeed = 1;
  ApplyInputMode();
  if (!document.hasFocus()) return;
  try {
    return OriginalLock.apply(this, Args);
  } catch {}
};

PointerLockControls.prototype.unlock = function(...Args) {
  CaptureControls(this);
  const Result = OriginalUnlock.apply(this, Args);
  queueMicrotask(ApplyInputMode);
  return Result;
};

function SetMode(ThirdPerson, RequestPointerLock = false) {
  const WasThirdPerson = State.ThirdPerson;
  State.ThirdPerson = Boolean(ThirdPerson);

  if (State.ThirdPerson) {
    if (State.Distance < THIRD_PERSON_MIN) State.Distance = THIRD_PERSON_DEFAULT;
    if (!WasThirdPerson && State.Pivot) State.Pivot.rotation.y = CameraFacingYaw();
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch {}
    }
  } else {
    State.Distance = 0;
    if (State.Pivot) State.Pivot.rotation.y = CameraFacingYaw();
    const Controls = State.Controls || window.__STORE_POINTER_CONTROLS__ || null;
    if (RequestPointerLock && Controls && !document.pointerLockElement && document.hasFocus()) {
      try { OriginalLock.call(Controls); } catch {}
    }
  }

  ApplyInputMode();
}

function NormalizeWheelDelta(Event) {
  let Delta = Event.deltaY;
  if (Event.deltaMode === WheelEvent.DOM_DELTA_LINE) Delta *= 16;
  else if (Event.deltaMode === WheelEvent.DOM_DELTA_PAGE) Delta *= Math.max(innerHeight, 600);
  return THREE.MathUtils.clamp(Delta, -120, 120);
}

function RefreshRig() {
  if (!State.Scene) return false;
  const Pivot = State.Scene.getObjectByName("PlayerCharacterPivot") || null;
  if (!Pivot) {
    State.Pivot = null;
    State.Head = null;
    State.Bones.clear();
    State.BaseQuaternions.clear();
    State.BasePositions.clear();
    State.BodyMeshes.length = 0;
    return false;
  }

  const Stamp = `${Pivot.uuid}:${Pivot.children.length}`;
  if (Pivot === State.Pivot && State.RigStamp === Stamp) return true;

  State.Pivot = Pivot;
  State.RigStamp = Stamp;
  State.Head = null;
  State.Bones.clear();
  State.BaseQuaternions.clear();
  State.BasePositions.clear();
  State.BodyMeshes.length = 0;

  const Remove = [];
  Pivot.traverse(Object => {
    const Name = Object.name || "";
    if (
      Name.endsWith("_FirstPersonArms") ||
      Name.endsWith("_CameraArms") ||
      Name.endsWith("_CleanFirstPersonArms") ||
      Name === "GuaranteedFirstPersonArms" ||
      Name === "RealFirstPersonWorkerArms" ||
      Name === "FirstPersonViewModelRoot"
    ) {
      Remove.push(Object);
      return;
    }
    if (Object.isMesh) State.BodyMeshes.push(Object);
  });

  for (const Object of Remove) {
    if (Object.parent) Object.parent.remove(Object);
  }

  for (const [Key, Name] of Object.entries(BoneNames)) {
    const Bone = Pivot.getObjectByName(Name);
    if (!Bone?.isBone) continue;
    State.Bones.set(Key, Bone);
    State.BaseQuaternions.set(Key, Bone.quaternion.clone());
    State.BasePositions.set(Key, Bone.position.clone());
  }

  State.Head = State.Bones.get("Head") || null;
  return true;
}

function ForceBodyVisible() {
  RefreshRig();
  for (const Mesh of State.BodyMeshes) {
    if (!Mesh.parent) continue;
    Mesh.visible = true;
    Mesh.frustumCulled = false;
  }
}

function ResetPose() {
  for (const [Name, Bone] of State.Bones) {
    const BaseQuaternion = State.BaseQuaternions.get(Name);
    const BasePosition = State.BasePositions.get(Name);
    if (BaseQuaternion) Bone.quaternion.copy(BaseQuaternion);
    if (BasePosition) Bone.position.copy(BasePosition);
  }
  State.Pivot?.updateMatrixWorld(true);
}

function ApplyBoneRotation(Name, X = 0, Y = 0, Z = 0) {
  const Bone = State.Bones.get(Name);
  const Base = State.BaseQuaternions.get(Name);
  if (!Bone || !Base) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.copy(Base).multiply(State.TempQuaternion);
}

function AddBoneRotation(Name, X = 0, Y = 0, Z = 0) {
  const Bone = State.Bones.get(Name);
  if (!Bone) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion);
}

function UpdateMotion(Delta) {
  if (!State.Camera) return;

  if (!State.HasPosition) {
    State.LastPosition.copy(State.Camera.position);
    State.HasPosition = true;
    State.PreviousYaw = State.Pivot?.rotation.y || CameraFacingYaw();
    State.HasYaw = true;
  }

  State.Velocity.copy(State.Camera.position).sub(State.LastPosition).divideScalar(Math.max(Delta, 0.001));
  State.Velocity.y = 0;
  State.LastPosition.copy(State.Camera.position);
  State.SmoothedVelocity.lerp(State.Velocity, ExpAlpha(Delta, 10));

  const Speed = State.SmoothedVelocity.length();
  const TargetMove = THREE.MathUtils.clamp(Speed / (State.Sprinting ? SPRINT_SPEED : WALK_SPEED), 0, 1);
  State.MoveAmount = THREE.MathUtils.lerp(State.MoveAmount, TargetMove, ExpAlpha(Delta, 9));

  State.Acceleration = (Speed - State.PreviousSpeed) / Math.max(Delta, 0.001);
  State.PreviousSpeed = Speed;
  State.SmoothedAcceleration = THREE.MathUtils.lerp(State.SmoothedAcceleration, State.Acceleration, ExpAlpha(Delta, 7));

  const Cadence = THREE.MathUtils.lerp(4.6, State.Sprinting ? 10.4 : 7.2, State.MoveAmount);
  State.Phase += Delta * Cadence;
}

function UpdateCharacterFacing(Delta) {
  if (!State.Pivot || !State.Camera) return;
  State.Pivot.position.set(State.Camera.position.x, 0, State.Camera.position.z);

  let TargetYaw = State.Pivot.rotation.y;
  if (!State.ThirdPerson) {
    TargetYaw = CameraFacingYaw();
  } else if (State.SmoothedVelocity.lengthSq() > 0.015) {
    State.TempForward.copy(State.SmoothedVelocity).normalize();
    TargetYaw = Math.atan2(State.TempForward.x, State.TempForward.z);
  }

  const Difference = NormalizeAngle(TargetYaw - State.Pivot.rotation.y);
  const Responsiveness = State.ThirdPerson ? TURN_RESPONSIVENESS : 28;
  State.Pivot.rotation.y += Difference * ExpAlpha(Delta, Responsiveness);

  const CurrentYaw = State.Pivot.rotation.y;
  if (!State.HasYaw) {
    State.PreviousYaw = CurrentYaw;
    State.HasYaw = true;
  }
  const YawDelta = NormalizeAngle(CurrentYaw - State.PreviousYaw);
  const RawTurnRate = YawDelta / Math.max(Delta, 0.001);
  State.TurnRate = THREE.MathUtils.lerp(State.TurnRate, RawTurnRate, ExpAlpha(Delta, 8));
  State.PreviousYaw = CurrentYaw;

  const Forward = State.TempForward.set(Math.sin(CurrentYaw), 0, Math.cos(CurrentYaw));
  const Right = State.TempRight.set(Math.cos(CurrentYaw), 0, -Math.sin(CurrentYaw));
  if (State.SmoothedVelocity.lengthSq() > 0.0001) {
    State.TempDesiredDirection.copy(State.SmoothedVelocity).normalize();
    State.LocalForward = THREE.MathUtils.lerp(State.LocalForward, State.TempDesiredDirection.dot(Forward), ExpAlpha(Delta, 9));
    State.LocalStrafe = THREE.MathUtils.lerp(State.LocalStrafe, State.TempDesiredDirection.dot(Right), ExpAlpha(Delta, 9));
  } else {
    State.LocalForward = THREE.MathUtils.lerp(State.LocalForward, 0, ExpAlpha(Delta, 9));
    State.LocalStrafe = THREE.MathUtils.lerp(State.LocalStrafe, 0, ExpAlpha(Delta, 9));
  }

  State.Pivot.updateMatrixWorld(true);
}

function UpdateStamina(Delta) {
  const Time = performance.now() / 1000;
  State.Sprinting = State.WantsSprint && State.Moving && !State.Exhausted && State.Stamina > 0.01;

  if (State.Sprinting) {
    State.Stamina = Math.max(0, State.Stamina - STAMINA_DRAIN * Delta);
    State.LastSprintAt = Time;
    if (State.Stamina <= 0.01) {
      State.Stamina = 0;
      State.Exhausted = true;
      State.Sprinting = false;
    }
  } else if (Time - State.LastSprintAt >= STAMINA_REGEN_DELAY) {
    State.Stamina = Math.min(STAMINA_MAX, State.Stamina + STAMINA_REGEN * Delta);
    if (State.Exhausted && State.Stamina >= STAMINA_RECOVER_THRESHOLD) State.Exhausted = false;
  }

  if (StaminaFill) StaminaFill.style.width = `${State.Stamina.toFixed(1)}%`;
  if (StaminaValue) StaminaValue.textContent = `${Math.round(State.Stamina)}`;
  if (StaminaWrap) {
    StaminaWrap.classList.toggle("IsSprinting", State.Sprinting);
    StaminaWrap.classList.toggle("IsExhausted", State.Exhausted);
  }
}

function ApplyProceduralLocomotion() {
  ResetPose();
  if (!State.Pivot) return;

  const Move = State.MoveAmount;
  const Sprint = State.Sprinting ? 1 : 0;
  const Swing = Math.sin(State.Phase);
  const Opposite = -Swing;
  const DoubleStep = Math.sin(State.Phase * 2);
  const StepLiftL = Math.max(0, -Swing);
  const StepLiftR = Math.max(0, Swing);
  const AccelLean = THREE.MathUtils.clamp(State.SmoothedAcceleration * 0.018, -0.12, 0.12);
  const TurnLean = THREE.MathUtils.clamp(State.TurnRate * 0.055, -0.16, 0.16) * Move;
  const StrafeLean = State.LocalStrafe * 0.10 * Move;
  const ForwardLean = (0.025 + Sprint * 0.09) * Move + AccelLean;
  const LegSwing = (0.42 + Sprint * 0.32) * Move;
  const ArmSwing = (0.34 + Sprint * 0.30) * Move;
  const KneeBend = 0.58 + Sprint * 0.24;
  const PelvisBob = Math.abs(Math.sin(State.Phase)) * 0.014 * Move + Math.abs(DoubleStep) * 0.004 * Move;

  const Hips = State.Bones.get("Hips");
  const HipsBasePosition = State.BasePositions.get("Hips");
  if (Hips && HipsBasePosition) {
    Hips.position.copy(HipsBasePosition);
    Hips.position.y += PelvisBob;
  }

  ApplyBoneRotation("Hips", ForwardLean * 0.25, -Swing * 0.045 * Move, -StrafeLean * 0.55 - TurnLean * 0.35);
  ApplyBoneRotation("Abdomen", ForwardLean * 0.55, Swing * 0.025 * Move, StrafeLean * 0.35 + TurnLean * 0.28);
  ApplyBoneRotation("Torso", ForwardLean * 0.38, -Swing * 0.035 * Move, StrafeLean * 0.42 + TurnLean * 0.40);
  ApplyBoneRotation("Chest", ForwardLean * 0.20, Swing * 0.055 * Move, -StrafeLean * 0.20 - TurnLean * 0.34);
  ApplyBoneRotation("Neck", -ForwardLean * 0.18, -TurnLean * 0.22, 0);

  ApplyBoneRotation("ShoulderL", -Opposite * ArmSwing * 0.12, 0, 0.055 + StrafeLean * 0.14);
  ApplyBoneRotation("ShoulderR", -Swing * ArmSwing * 0.12, 0, -0.055 + StrafeLean * 0.14);
  ApplyBoneRotation("UpperArmL", Opposite * ArmSwing - Sprint * 0.10, 0.04, 0.13 + StrafeLean * 0.18);
  ApplyBoneRotation("UpperArmR", Swing * ArmSwing - Sprint * 0.10, -0.04, -0.13 + StrafeLean * 0.18);
  ApplyBoneRotation("LowerArmL", -0.18 - Math.max(0, Opposite) * 0.20 * Move - Sprint * 0.16, 0, 0.025);
  ApplyBoneRotation("LowerArmR", -0.18 - Math.max(0, Swing) * 0.20 * Move - Sprint * 0.16, 0, -0.025);

  ApplyBoneRotation("UpperLegL", Swing * LegSwing - ForwardLean * 0.28, State.LocalStrafe * 0.055 * Move, -State.LocalStrafe * 0.10 * Move);
  ApplyBoneRotation("UpperLegR", Opposite * LegSwing - ForwardLean * 0.28, State.LocalStrafe * 0.055 * Move, -State.LocalStrafe * 0.10 * Move);
  ApplyBoneRotation("LowerLegL", StepLiftL * KneeBend * Move, 0, 0);
  ApplyBoneRotation("LowerLegR", StepLiftR * KneeBend * Move, 0, 0);
  ApplyBoneRotation("FootL", -StepLiftL * 0.22 * Move + Math.max(0, Swing) * 0.08 * Move, 0, State.LocalStrafe * 0.035 * Move);
  ApplyBoneRotation("FootR", -StepLiftR * 0.22 * Move + Math.max(0, Opposite) * 0.08 * Move, 0, State.LocalStrafe * 0.035 * Move);

  State.Pivot.updateMatrixWorld(true);
}

function RotateBoneToward(BoneName, ChildName, Target) {
  const Bone = State.Bones.get(BoneName);
  const Child = State.Bones.get(ChildName);
  if (!Bone || !Child || !Bone.parent) return;

  State.Pivot?.updateMatrixWorld(true);
  Bone.getWorldPosition(State.TempStart);
  Child.getWorldPosition(State.TempEnd);
  State.TempCurrentDirection.copy(State.TempEnd).sub(State.TempStart);
  State.TempDesiredDirection.copy(Target).sub(State.TempStart);
  if (State.TempCurrentDirection.lengthSq() < 0.000001 || State.TempDesiredDirection.lengthSq() < 0.000001) return;
  State.TempCurrentDirection.normalize();
  State.TempDesiredDirection.normalize();

  Bone.getWorldQuaternion(State.TempQuaternion);
  Bone.parent.getWorldQuaternion(State.TempQuaternionB);
  State.TempQuaternionC.setFromUnitVectors(State.TempCurrentDirection, State.TempDesiredDirection);
  State.TempQuaternionD.copy(State.TempQuaternionC).multiply(State.TempQuaternion);
  State.TempQuaternionB.invert();
  Bone.quaternion.copy(State.TempQuaternionB.multiply(State.TempQuaternionD)).normalize();
  State.Pivot?.updateMatrixWorld(true);
}

function PoseFirstPersonArm(Side, Swing) {
  if (!State.Camera) return;
  const IsLeft = Side < 0;
  const Upper = IsLeft ? "UpperArmL" : "UpperArmR";
  const Lower = IsLeft ? "LowerArmL" : "LowerArmR";
  const Wrist = IsLeft ? "WristL" : "WristR";
  const Shoulder = IsLeft ? "ShoulderL" : "ShoulderR";

  CameraHorizontalForward(State.TempForward);
  State.TempRight.set(1, 0, 0).applyQuaternion(State.Camera.quaternion);
  State.TempRight.y = 0;
  if (State.TempRight.lengthSq() < 0.000001) State.TempRight.set(1, 0, 0);
  State.TempRight.normalize();

  const Move = State.MoveAmount;
  const Sprint = State.Sprinting ? 1 : 0;
  const ArmSwing = (IsLeft ? Swing : -Swing) * Move;
  const SideIdle = 0.34;
  const SideMoving = 0.19;
  const WristSide = Side * THREE.MathUtils.lerp(SideIdle, SideMoving, Move);
  const ElbowSide = Side * THREE.MathUtils.lerp(0.30, 0.24, Move);
  const WristForward = THREE.MathUtils.lerp(0.40, 0.62 + Sprint * 0.05, Move) + ArmSwing * 0.13;
  const ElbowForward = THREE.MathUtils.lerp(0.24, 0.36 + Sprint * 0.04, Move) + ArmSwing * 0.045;
  const WristDown = THREE.MathUtils.lerp(0.43, 0.23 - Sprint * 0.02, Move) + Math.abs(ArmSwing) * 0.035;
  const ElbowDown = THREE.MathUtils.lerp(0.30, 0.19, Move);

  AddBoneRotation(Shoulder, -0.03 * Move, Side * -0.04 * Move, Side * -0.08 * Move);
  State.Pivot?.updateMatrixWorld(true);

  State.TempElbowTarget.copy(State.Camera.position)
    .addScaledVector(State.TempForward, ElbowForward)
    .addScaledVector(State.TempRight, ElbowSide)
    .addScaledVector(State.TempUp, -ElbowDown);

  State.TempWristTarget.copy(State.Camera.position)
    .addScaledVector(State.TempForward, WristForward)
    .addScaledVector(State.TempRight, WristSide)
    .addScaledVector(State.TempUp, -WristDown);

  RotateBoneToward(Upper, Lower, State.TempElbowTarget);
  RotateBoneToward(Lower, Wrist, State.TempWristTarget);
}

function ApplyFirstPersonArms() {
  const Swing = Math.sin(State.Phase);
  PoseFirstPersonArm(-1, Swing);
  PoseFirstPersonArm(1, Swing);
}

function SegmentAabbDistance(Start, End, Bounds) {
  State.TempOffset.copy(End).sub(Start);
  let TMin = 0;
  let TMax = 1;

  for (const Axis of ["x", "y", "z"]) {
    const Origin = Start[Axis];
    const Direction = State.TempOffset[Axis];
    const Min = Bounds.min[Axis] - CAMERA_PADDING;
    const Max = Bounds.max[Axis] + CAMERA_PADDING;

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

  return TMin;
}

function CameraDistance(Target, Desired) {
  const Collisions = State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];
  const SegmentLength = Math.max(Target.distanceTo(Desired), 0.001);
  let Allowed = SegmentLength;

  for (const Entry of Collisions) {
    if (!Entry?.Type || !/Wall|Partition/i.test(Entry.Type)) continue;
    const Bounds = Entry.OriginalStructureBox || Entry.OriginalBox || Entry.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    if (![Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite)) continue;
    const Hit = SegmentAabbDistance(Target, Desired, Bounds);
    if (Hit === null) continue;
    Allowed = Math.min(Allowed, Math.max(0.55, Hit * SegmentLength - 0.12));
  }

  return Allowed;
}

function RenderThirdPerson(Renderer, Scene, Camera) {
  ForceBodyVisible();
  State.SavedCameraPosition.copy(Camera.position);
  State.SavedCameraQuaternion.copy(Camera.quaternion);

  State.TempForward.set(0, 0, -1).applyQuaternion(State.SavedCameraQuaternion);
  State.TempForward.y = THREE.MathUtils.clamp(State.TempForward.y, -0.72, 0.72);
  if (State.TempForward.lengthSq() < 0.0001) State.TempForward.set(0, 0, -1);
  State.TempForward.normalize();

  State.TempRight.set(1, 0, 0).applyQuaternion(State.SavedCameraQuaternion);
  State.TempRight.y = 0;
  if (State.TempRight.lengthSq() < 0.0001) State.TempRight.set(1, 0, 0);
  State.TempRight.normalize();

  State.TempTarget.set(State.SavedCameraPosition.x, CAMERA_TARGET_HEIGHT, State.SavedCameraPosition.z);
  State.TempDesired.copy(State.TempTarget)
    .addScaledVector(State.TempForward, -State.Distance)
    .addScaledVector(State.TempRight, CAMERA_SHOULDER);
  State.TempDesired.y = THREE.MathUtils.clamp(State.TempDesired.y, CAMERA_FLOOR, CAMERA_CEILING);

  const Allowed = CameraDistance(State.TempTarget, State.TempDesired);
  State.TempOffset.copy(State.TempDesired).sub(State.TempTarget);
  if (State.TempOffset.lengthSq() > 0.0001) State.TempOffset.normalize().multiplyScalar(Allowed);

  Camera.position.copy(State.TempTarget).add(State.TempOffset);
  Camera.position.y = THREE.MathUtils.clamp(Camera.position.y, CAMERA_FLOOR, CAMERA_CEILING);
  Camera.lookAt(State.TempTarget);
  Camera.updateMatrixWorld(true);
  Renderer.render(Scene, Camera);

  Camera.position.copy(State.SavedCameraPosition);
  Camera.quaternion.copy(State.SavedCameraQuaternion);
  Camera.updateMatrixWorld(true);
}

function RenderFirstPerson(Renderer, Scene, Camera) {
  ForceBodyVisible();
  ApplyFirstPersonArms();

  const SavedNear = Camera.near;
  if (Camera.near > FIRST_PERSON_NEAR) {
    Camera.near = FIRST_PERSON_NEAR;
    Camera.updateProjectionMatrix();
  }

  if (State.Head) {
    State.SavedHeadScale.copy(State.Head.scale);
    State.Head.scale.setScalar(0.001);
    State.Head.updateMatrixWorld(true);
  }

  try {
    Renderer.render(Scene, Camera);
  } finally {
    if (State.Head) {
      State.Head.scale.copy(State.SavedHeadScale);
      State.Head.updateMatrixWorld(true);
    }
    if (Camera.near !== SavedNear) {
      Camera.near = SavedNear;
      Camera.updateProjectionMatrix();
    }
  }
}

function Attach(Context) {
  State.Scene = Context.Scene;
  State.Camera = Context.Camera;
  State.Renderer = Context.Renderer;
  State.CollisionBoxes = Context.CollisionBoxes;
  BasePlayer.Attach(Context);
  ApplyInputMode();
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene;
  State.Camera = Camera;
  State.Renderer = Renderer;

  const Now = performance.now();
  const Delta = Math.min((Now - State.LastRenderAt) / 1000, 0.05);
  State.LastRenderAt = Now;

  ForceBodyVisible();
  UpdateMotion(Delta);
  UpdateStamina(Delta);
  UpdateCharacterFacing(Delta);
  ApplyProceduralLocomotion();
  ApplyInputMode();

  if (State.ThirdPerson) RenderThirdPerson(Renderer, Scene, Camera);
  else RenderFirstPerson(Renderer, Scene, Camera);
}

function GetMovementSpeed(WantsSprint, Moving) {
  State.WantsSprint = Boolean(WantsSprint);
  State.Moving = Boolean(Moving);
  State.Sprinting = State.WantsSprint && State.Moving && !State.Exhausted && State.Stamina > 0.01;
  return State.Sprinting ? SPRINT_SPEED : WALK_SPEED;
}

addEventListener("wheel", Event => {
  if (!HudActive()) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();

  const Delta = NormalizeWheelDelta(Event);
  if (Math.abs(Delta) < 0.01) return;

  if (!State.ThirdPerson) {
    if (Delta <= 0) return;
    State.Distance = OUT_FROM_FIRST;
    SetMode(true);
    return;
  }

  const NextDistance = State.Distance + Delta * ZOOM_PIXELS_TO_DISTANCE;
  if (Delta < 0 && NextDistance <= FIRST_PERSON_SWITCH) {
    SetMode(false, false);
    return;
  }

  State.Distance = THREE.MathUtils.clamp(NextDistance, THIRD_PERSON_MIN, THIRD_PERSON_MAX);
}, { capture: true, passive: false });

addEventListener("keydown", Event => {
  if (Event.code !== "KeyV" || Event.repeat || !HudActive()) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();
  if (State.ThirdPerson) SetMode(false, true);
  else {
    State.Distance = THIRD_PERSON_DEFAULT;
    SetMode(true);
  }
}, true);

addEventListener("mousedown", Event => {
  const Controls = State.Controls || window.__STORE_POINTER_CONTROLS__ || null;
  if (State.ThirdPerson) {
    if (Event.button !== 2) return;
    State.OrbitHeld = true;
    if (Controls) {
      CaptureControls(Controls);
      Controls.isLocked = true;
      Controls.pointerSpeed = 1;
    }
    Event.preventDefault();
    return;
  }

  if (Event.button === 0 && Controls && !document.pointerLockElement && document.hasFocus()) {
    try { OriginalLock.call(Controls); } catch {}
  }
});

addEventListener("mouseup", Event => {
  if (Event.button !== 2) return;
  State.OrbitHeld = false;
  ApplyInputMode();
});

Canvas.addEventListener("contextmenu", Event => {
  if (State.ThirdPerson) Event.preventDefault();
});

addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && !State.ThirdPerson && HudActive()) {
    State.Distance = THIRD_PERSON_DEFAULT;
    SetMode(true);
    return;
  }
  queueMicrotask(ApplyInputMode);
});

addEventListener("pointerlockerror", () => queueMicrotask(ApplyInputMode));

function InputTick() {
  ApplyInputMode();
  requestAnimationFrame(InputTick);
}

requestAnimationFrame(InputTick);
ApplyInputMode();

window.__STORE_PLAYER__ = {
  Attach,
  Render,
  GetMovementSpeed,
  GetPlayerRadius: () => PLAYER_RADIUS,
  IsSprinting: () => State.Sprinting,
  GetStamina: () => State.Stamina,
  IsThirdPerson: () => State.ThirdPerson,
  GetThirdPersonDistance: () => State.Distance
};

window.__STORE_PLAYER_SYSTEM_BUILD__ = "V0.11-R22";
