import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const BasePlayer = window.__STORE_PLAYER__;
const Canvas = document.getElementById("GameCanvas");
const Crosshair = document.querySelector(".Crosshair");
const CameraMode = document.getElementById("CameraModeValue");
const StaminaFill = document.getElementById("StaminaFill");
const StaminaValue = document.getElementById("StaminaValue");
const StaminaWrap = document.getElementById("StaminaWrap");

if (!BasePlayer || !Canvas) throw new Error("Base player and canvas must load before player system.");

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
const EYE_OFFSET = new THREE.Vector3(0, 0.035, 0.065);
const PLAYER_RADIUS = 0.34;

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
  BodyMeshes: [],
  RigStamp: "",
  LastRenderAt: performance.now(),
  LastPosition: new THREE.Vector3(),
  HasPosition: false,
  SmoothedSpeed: 0,
  Phase: 0,
  Stamina: STAMINA_MAX,
  Sprinting: false,
  WantsSprint: false,
  Moving: false,
  Exhausted: false,
  LastSprintAt: -Infinity,
  TempForward: new THREE.Vector3(),
  TempRight: new THREE.Vector3(),
  TempTarget: new THREE.Vector3(),
  TempDesired: new THREE.Vector3(),
  TempOffset: new THREE.Vector3(),
  TempEye: new THREE.Vector3(),
  TempCorrection: new THREE.Vector3(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion(),
  SavedCameraPosition: new THREE.Vector3(),
  SavedCameraQuaternion: new THREE.Quaternion(),
  SavedHeadScale: new THREE.Vector3(),
  SavedBones: new Map()
};

const BoneNames = {
  Chest: "Chest",
  Torso: "Torso",
  Neck: "Neck",
  Head: "Head",
  ShoulderL: "Shoulder.L",
  ShoulderR: "Shoulder.R",
  UpperArmL: "UpperArm.L",
  UpperArmR: "UpperArm.R",
  LowerArmL: "LowerArm.L",
  LowerArmR: "LowerArm.R",
  WristL: "Wrist.L",
  WristR: "Wrist.R"
};

const OriginalLock = PointerLockControls.prototype.lock;
const OriginalUnlock = PointerLockControls.prototype.unlock;

function HudActive() {
  const Hud = document.getElementById("Hud");
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
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

  if (State.ThirdPerson) {
    Canvas.style.cursor = "default";
    document.body.style.cursor = "default";
  } else {
    Canvas.style.cursor = "none";
    document.body.style.cursor = "none";
  }

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

function SetMode(ThirdPerson) {
  State.ThirdPerson = Boolean(ThirdPerson);
  if (State.ThirdPerson && State.Distance < THIRD_PERSON_MIN) State.Distance = THIRD_PERSON_DEFAULT;
  if (!State.ThirdPerson) State.Distance = 0;

  if (State.ThirdPerson && document.pointerLockElement) {
    try { document.exitPointerLock(); } catch {}
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
    State.BodyMeshes.length = 0;
    return false;
  }

  const Stamp = `${Pivot.uuid}:${Pivot.children.length}`;
  if (Pivot === State.Pivot && State.RigStamp === Stamp) return true;

  State.Pivot = Pivot;
  State.RigStamp = Stamp;
  State.Bones.clear();
  State.BodyMeshes.length = 0;

  const Remove = [];
  Pivot.traverse(Object => {
    const Name = Object.name || "";
    if (
      Name.endsWith("_FirstPersonArms") ||
      Name.endsWith("_CameraArms") ||
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
    if (Bone?.isBone) State.Bones.set(Key, Bone);
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

function SavePose() {
  State.SavedBones.clear();
  for (const [Name, Bone] of State.Bones) State.SavedBones.set(Name, Bone.quaternion.clone());
}

function RestorePose() {
  for (const [Name, Quaternion] of State.SavedBones) {
    const Bone = State.Bones.get(Name);
    if (Bone) Bone.quaternion.copy(Quaternion);
  }
}

function ApplyBone(Name, X = 0, Y = 0, Z = 0) {
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
  }

  const DX = State.Camera.position.x - State.LastPosition.x;
  const DZ = State.Camera.position.z - State.LastPosition.z;
  State.LastPosition.copy(State.Camera.position);

  const Speed = Math.hypot(DX, DZ) / Math.max(Delta, 0.001);
  State.SmoothedSpeed = THREE.MathUtils.lerp(State.SmoothedSpeed, Speed, 1 - Math.exp(-Delta * 12));
  const Moving = State.SmoothedSpeed > 0.08;
  const Ratio = THREE.MathUtils.clamp(State.SmoothedSpeed / (State.Sprinting ? SPRINT_SPEED : WALK_SPEED), 0, 1.2);
  State.Phase += Delta * (Moving ? THREE.MathUtils.lerp(5.8, State.Sprinting ? 9.6 : 7.2, Ratio) : 1.2);
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

function AlignFirstPersonBody() {
  if (!RefreshRig() || !State.Pivot || !State.Camera) return;

  State.TempEuler.setFromQuaternion(State.Camera.quaternion, "YXZ");
  State.Pivot.rotation.y = State.TempEuler.y;
  State.Pivot.position.set(State.Camera.position.x, 0, State.Camera.position.z);
  State.Pivot.updateMatrixWorld(true);

  if (!State.Head) return;
  State.TempEye.copy(EYE_OFFSET);
  State.Head.localToWorld(State.TempEye);
  State.TempCorrection.copy(State.Camera.position).sub(State.TempEye);
  State.Pivot.position.add(State.TempCorrection);
  State.Pivot.updateMatrixWorld(true);
}

function ApplyFirstPersonPose() {
  if (!State.Camera) return;
  State.TempEuler.setFromQuaternion(State.Camera.quaternion, "YXZ");
  const Pitch = THREE.MathUtils.clamp(State.TempEuler.x, -1.15, 1.15);
  const Swing = State.Moving ? Math.sin(State.Phase) : 0;
  const Step = State.Moving ? Math.sin(State.Phase * 2 + 0.4) : 0;
  const SpeedRatio = THREE.MathUtils.clamp(State.SmoothedSpeed / (State.Sprinting ? SPRINT_SPEED : WALK_SPEED), 0, 1.1);
  const SprintLift = State.Sprinting ? 0.12 : 0;

  ApplyBone("Torso", Pitch * 0.08, 0, 0);
  ApplyBone("Chest", Pitch * 0.22, 0, Step * 0.008 * SpeedRatio);
  ApplyBone("Neck", -Pitch * 0.16, 0, 0);
  ApplyBone("ShoulderL", 0.04, 0.02, 0.11);
  ApplyBone("ShoulderR", 0.04, -0.02, -0.11);
  ApplyBone("UpperArmL", -0.86 - SprintLift + Swing * 0.10 * SpeedRatio - Pitch * 0.10, 0.10, 0.36);
  ApplyBone("UpperArmR", -0.86 - SprintLift - Swing * 0.10 * SpeedRatio - Pitch * 0.10, -0.10, -0.36);
  ApplyBone("LowerArmL", -0.40 + Math.max(0, -Swing) * 0.08 * SpeedRatio, 0, 0.05);
  ApplyBone("LowerArmR", -0.40 + Math.max(0, Swing) * 0.08 * SpeedRatio, 0, -0.05);
  ApplyBone("WristL", Step * 0.025 * SpeedRatio, 0, 0);
  ApplyBone("WristR", -Step * 0.025 * SpeedRatio, 0, 0);
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
  if (State.Pivot) {
    State.Pivot.position.set(Camera.position.x, 0, Camera.position.z);
    State.Pivot.updateMatrixWorld(true);
  }

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
  SavePose();
  AlignFirstPersonBody();
  ApplyFirstPersonPose();
  AlignFirstPersonBody();

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
    RestorePose();
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

  UpdateMotion(Delta);
  UpdateStamina(Delta);
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
    SetMode(false);
    return;
  }

  State.Distance = THREE.MathUtils.clamp(NextDistance, THIRD_PERSON_MIN, THIRD_PERSON_MAX);
}, { capture: true, passive: false });

addEventListener("keydown", Event => {
  if (Event.code !== "KeyV" || Event.repeat || !HudActive()) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();
  if (State.ThirdPerson) SetMode(false);
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

addEventListener("pointerlockchange", () => queueMicrotask(ApplyInputMode));
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

window.__STORE_PLAYER_SYSTEM_BUILD__ = "V0.11-R15";
