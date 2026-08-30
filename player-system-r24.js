import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const BasePlayer = window.__STORE_PLAYER__;
const Physics = window.__STORE_PROCEDURAL_PHYSICS__ || null;
const Collision = window.__STORE_COLLISION_UTILITY__ || null;
const Canvas = document.getElementById("GameCanvas");
const Crosshair = document.querySelector(".Crosshair");
const CameraMode = document.getElementById("CameraModeValue");
const StaminaFill = document.getElementById("StaminaFill");
const StaminaValue = document.getElementById("StaminaValue");
const StaminaWrap = document.getElementById("StaminaWrap");

if (!BasePlayer || !Canvas) throw new Error("Base player and canvas must load before procedural player system.");

window.__STORE_PLAYER_TRANSFORM_AUTHORITY__ = "R24";

const WALK_SPEED = 3.45;
const SPRINT_SPEED = 5.35;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 22;
const STAMINA_REGEN = 18;
const STAMINA_REGEN_DELAY = 0.75;
const STAMINA_RECOVER_THRESHOLD = 24;
const THIRD_PERSON_DEFAULT = 4.8;
const THIRD_PERSON_MIN = 0.48;
const THIRD_PERSON_MAX = 6.0;
const FIRST_PERSON_SWITCH = 0.32;
const OUT_FROM_FIRST = 1.35;
const ZOOM_PIXELS_TO_DISTANCE = 0.0135;
const CAMERA_TARGET_HEIGHT = 1.26;
const CAMERA_SHOULDER = 0.26;
const CAMERA_FLOOR = 0.34;
const CAMERA_CEILING = 3.48;
const CAMERA_PADDING = 0.10;
const FIRST_PERSON_NEAR = 0.012;
const FIRST_PERSON_FACE_OFFSET = 0.085;
const FIRST_PERSON_EYE_LIFT = 0.022;
const ARM_WALL_PADDING = 0.015;
const ARM_WALL_GAP = 0.035;
const PLAYER_RADIUS = 0.255;
const PLAYER_EYE_HEIGHT = 1.68;
const TURN_RESPONSIVENESS = 13;
const FIRST_PERSON_HEAD_YAW_MAX = THREE.MathUtils.degToRad(50);
const FIRST_PERSON_BODY_FOLLOW_IDLE = THREE.MathUtils.degToRad(34);
const FIRST_PERSON_BODY_FOLLOW_MOVING = THREE.MathUtils.degToRad(28);
const FIRST_PERSON_BODY_FOLLOW_IDLE_RATE = 10.0;
const FIRST_PERSON_BODY_FOLLOW_MOVING_RATE = 14.0;
const FOOT_SOLE_SKIN = 0.006;
const LEDGE_FOOT_RADIUS = 0.105;
const LEDGE_LOCK_MAX_AGE = 360;
const LEDGE_LOCK_MAX_DRIFT = 0.20;
const LEDGE_PELVIS_MAX = 0.045;
const LEDGE_PELVIS_XZ_MAX = 0.032;
const EDGE_TRANSITION_RANGE = 0.31;
const EDGE_TRANSITION_HOLD_MS = 900;
const EDGE_RELEASE_DISTANCE = 0.235;
const EDGE_RELEASE_FRAMES = 4;
const EDGE_LEAD_SWITCH_DISTANCE = -0.060;
const EDGE_TRAIL_SWITCH_DISTANCE = 0.090;
const EDGE_TANGENT_RELEASE_PADDING = 0.38;
const EDGE_FOOT_NORMAL_OFFSET = 0.122;
const EDGE_FOOT_TANGENT_OFFSET = 0.095;
const FOOT_PROBE_TOE = 0.115;
const FOOT_PROBE_HEEL = 0.075;
const FOOT_PROBE_SIDE = 0.058;

const State = {
  Scene: null,
  Camera: null,
  Renderer: null,
  Controls: null,
  ThirdPerson: true,
  Distance: THIRD_PERSON_DEFAULT,
  OrbitHeld: false,
  OrbitReady: false,
  OrbitTargetYaw: 0,
  OrbitTargetPitch: 0,
  OrbitCurrentYaw: 0,
  OrbitCurrentPitch: 0,
  OrbitEuler: new THREE.Euler(0, 0, 0, "YXZ"),
  Pivot: null,
  Head: null,
  Bones: new Map(),
  SavedPose: new Map(),
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
  ResolvedMoving: false,
  ResolvedSpeed: 0,
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
  FootGroundLeft: 0,
  FootGroundRight: 0,
  LedgePelvisOffset: 0,
  LedgePelvisOffsetX: 0,
  LedgePelvisOffsetZ: 0,
  LedgeSplitActive: false,
  LocomotionSurfaceState: "FlatGround",
  EdgeTransition: {
    Active: false,
    RugId: "",
    Entering: false,
    LeadSide: 1,
    NormalX: 0,
    NormalZ: 0,
    TangentX: 1,
    TangentZ: 0,
    EdgeX: 0,
    EdgeZ: 0,
    Height: 0,
    SignedDistance: 0,
    TravelProgress: 0,
    ResolvedFrames: 0,
    HasCrossedLead: false,
    Phase: "Source",
    BoundsMinX: 0,
    BoundsMaxX: 0,
    BoundsMinZ: 0,
    BoundsMaxZ: 0,
    StartedAt: -Infinity,
    LastSeenAt: -Infinity
  },
  LedgeLockLeft: {
    Active: false,
    StartedAt: -Infinity,
    Position: new THREE.Vector3()
  },
  LedgeLockRight: {
    Active: false,
    StartedAt: -Infinity,
    Position: new THREE.Vector3()
  },
  LedgeTargetLeft: new THREE.Vector3(),
  LedgeTargetRight: new THREE.Vector3(),
  SavedRenderPivotPosition: new THREE.Vector3(),
  ContactReaction: 0,
  ContactFront: 0,
  ContactBack: 0,
  ContactSide: 0,
  ContactIntent: 0,
  FirstPersonHeadYaw: 0,
  FirstPersonHeadPitch: 0,
  TempForward: new THREE.Vector3(),
  TempRight: new THREE.Vector3(),
  TempUp: new THREE.Vector3(),
  TempViewForward: new THREE.Vector3(),
  TempViewRight: new THREE.Vector3(),
  TempViewUp: new THREE.Vector3(),
  TempTarget: new THREE.Vector3(),
  TempDesired: new THREE.Vector3(),
  TempOffset: new THREE.Vector3(),
  TempStart: new THREE.Vector3(),
  TempEnd: new THREE.Vector3(),
  TempCurrentDirection: new THREE.Vector3(),
  TempDesiredDirection: new THREE.Vector3(),
  TempElbowTarget: new THREE.Vector3(),
  TempWristTarget: new THREE.Vector3(),
  TempHip: new THREE.Vector3(),
  TempKnee: new THREE.Vector3(),
  TempFoot: new THREE.Vector3(),
  TempLegTarget: new THREE.Vector3(),
  TempKneeTarget: new THREE.Vector3(),
  TempLegAxis: new THREE.Vector3(),
  TempPole: new THREE.Vector3(),
  TempTravel: new THREE.Vector3(),
  TempFootProbe: new THREE.Vector3(),
  TempFootSide: new THREE.Vector3(),
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

function UserSettings() {
  return window.__STORE_USER_SETTINGS__ || {
    Sensitivity: 0.92,
    TrackpadSmoothing: 58
  };
}

function CameraSensitivity() {
  return THREE.MathUtils.clamp(Number(UserSettings().Sensitivity) || 0.92, 0.35, 2);
}

function ReadThirdPersonOrbit() {
  if (!State.Camera) return false;
  State.OrbitEuler.setFromQuaternion(State.Camera.quaternion, "YXZ");
  State.OrbitCurrentPitch = State.OrbitEuler.x;
  State.OrbitCurrentYaw = State.OrbitEuler.y;
  State.OrbitTargetPitch = State.OrbitCurrentPitch;
  State.OrbitTargetYaw = State.OrbitCurrentYaw;
  State.OrbitReady = true;
  return true;
}

function UpdateThirdPersonOrbit(Delta) {
  if (!State.ThirdPerson || !State.OrbitHeld || !State.Camera) return;
  if (!State.OrbitReady && !ReadThirdPersonOrbit()) return;

  const Smooth = THREE.MathUtils.clamp(
    Number(UserSettings().TrackpadSmoothing) || 0,
    0,
    100
  ) / 100;
  const Responsiveness = THREE.MathUtils.lerp(30, 10.5, Smooth);
  const Alpha = 1 - Math.exp(-Math.max(0.001, Delta) * Responsiveness);

  State.OrbitCurrentYaw += NormalizeAngle(State.OrbitTargetYaw - State.OrbitCurrentYaw) * Alpha;
  State.OrbitCurrentPitch = THREE.MathUtils.lerp(
    State.OrbitCurrentPitch,
    State.OrbitTargetPitch,
    Alpha
  );

  State.OrbitEuler.set(
    State.OrbitCurrentPitch,
    State.OrbitCurrentYaw,
    0,
    "YXZ"
  );
  State.Camera.quaternion.setFromEuler(State.OrbitEuler);
  State.Camera.updateMatrixWorld(true);
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

function UpdateCameraBasis() {
  if (!State.Camera) return;
  State.TempViewForward.set(0, 0, -1).applyQuaternion(State.Camera.quaternion).normalize();
  State.TempViewRight.set(1, 0, 0).applyQuaternion(State.Camera.quaternion).normalize();
  State.TempViewUp.set(0, 1, 0).applyQuaternion(State.Camera.quaternion).normalize();
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
    Controls.enabled = true;
    Controls.isLocked = State.ThirdPerson ? HudActive() : Boolean(document.pointerLockElement);
    Controls.pointerSpeed = State.ThirdPerson ? 0 : CameraSensitivity();
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
    this.enabled = true;
    this.isLocked = HudActive();
    this.pointerSpeed = 0;
    ApplyInputMode();
    return true;
  }

  this.enabled = true;
  this.pointerSpeed = CameraSensitivity();
  ApplyInputMode();

  if (document.pointerLockElement) {
    this.isLocked = true;
    return true;
  }

  if (!document.hasFocus()) return false;
  if (navigator.userActivation && !navigator.userActivation.isActive) return false;

  const RuntimeRequest = window.__STORE_POINTER_LOCK_RUNTIME__?.RequestFirstPersonLock;
  if (typeof RuntimeRequest === "function") return RuntimeRequest();

  try {
    const Target = this.domElement || document.body;
    const Result = Target?.requestPointerLock?.();
    Result?.catch?.(() => {});
    return true;
  } catch {
    return false;
  }
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
    State.OrbitReady = false;
    State.FirstPersonHeadYaw = 0;
    State.FirstPersonHeadPitch = 0;
    if (!WasThirdPerson && State.Pivot) State.Pivot.rotation.y = CameraFacingYaw();
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch {}
    }
  } else {
    State.Distance = 0;
    State.OrbitHeld = false;
    State.OrbitReady = false;
    State.FirstPersonHeadYaw = 0;
    State.FirstPersonHeadPitch = 0;
    if (State.Pivot) State.Pivot.rotation.y = CameraFacingYaw();
    const Controls = State.Controls || window.__STORE_POINTER_CONTROLS__ || null;
    if (RequestPointerLock && Controls && !document.pointerLockElement && document.hasFocus()) {
      Controls.lock?.();
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
    State.SavedPose.clear();
    State.BodyMeshes.length = 0;
    return false;
  }

  const Stamp = `${Pivot.uuid}:${Pivot.children.length}`;
  if (Pivot === State.Pivot && State.RigStamp === Stamp) return true;

  State.Pivot = Pivot;
  State.Pivot.userData.IgnoreRayCollisionR35 = true;
  State.RigStamp = Stamp;
  State.Head = null;
  State.Bones.clear();
  State.SavedPose.clear();
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
    State.SavedPose.set(Key, new THREE.Quaternion());
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

function SaveAnimatedPose() {
  for (const [Name, Bone] of State.Bones) {
    let Saved = State.SavedPose.get(Name);
    if (!Saved) {
      Saved = new THREE.Quaternion();
      State.SavedPose.set(Name, Saved);
    }
    Saved.copy(Bone.quaternion);
  }
}

function RestoreAnimatedPose() {
  for (const [Name, Bone] of State.Bones) {
    const Saved = State.SavedPose.get(Name);
    if (Saved) Bone.quaternion.copy(Saved);
  }
  State.Pivot?.updateMatrixWorld(true);
}

function AddBoneRotation(Name, X = 0, Y = 0, Z = 0) {
  const Bone = State.Bones.get(Name);
  if (!Bone) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion).normalize();
}

function UpdateMotion(Delta) {
  if (!State.Camera) return;

  if (!State.HasPosition) {
    State.LastPosition.copy(State.Camera.position);
    State.HasPosition = true;
    State.PreviousYaw = State.Pivot?.rotation.y || CameraFacingYaw();
    State.HasYaw = true;
  }

  const MotionFrame = window.__STORE_RESOLVED_MOVEMENT_FRAME__ || null;
  const MotionAge = performance.now() - Number(MotionFrame?.UpdatedAt ?? -Infinity);
  const FreshResolvedMotion = Boolean(
    MotionFrame?.Resolved?.isVector3 &&
    MotionAge >= 0 &&
    MotionAge < 90
  );

  if (FreshResolvedMotion) {
    const FrameDelta = Math.max(
      0.001,
      Number(MotionFrame.Delta) || Delta || 0.016
    );
    State.Velocity.copy(MotionFrame.Resolved).divideScalar(FrameDelta);
    State.Velocity.y = 0;
    State.ResolvedMoving = Boolean(MotionFrame.HasMovement);
    State.ResolvedSpeed = Math.max(0, Number(MotionFrame.Speed) || State.Velocity.length());
  } else {
    State.Velocity
      .copy(State.Camera.position)
      .sub(State.LastPosition)
      .divideScalar(Math.max(Delta, 0.001));
    State.Velocity.y = 0;
    State.ResolvedMoving = State.Velocity.lengthSq() > 0.0004;
    State.ResolvedSpeed = State.Velocity.length();
  }

  State.LastPosition.copy(State.Camera.position);

  const VelocityResponse = State.ResolvedMoving ? 22 : 12;
  State.SmoothedVelocity.lerp(
    State.Velocity,
    ExpAlpha(Delta, VelocityResponse)
  );

  const Speed = FreshResolvedMotion
    ? State.ResolvedSpeed
    : State.SmoothedVelocity.length();

  const SpeedScale = State.Sprinting ? SPRINT_SPEED : WALK_SPEED;
  let TargetMove = THREE.MathUtils.clamp(Speed / SpeedScale, 0, 1);

  // If physics produced visible lateral displacement, locomotion must visibly
  // engage on this frame. Never let smoothing turn real movement into skating.
  if (State.ResolvedMoving) {
    TargetMove = Math.max(TargetMove, 0.24);
  }

  const MoveResponse = State.ResolvedMoving ? 28 : 11;
  State.MoveAmount = THREE.MathUtils.lerp(
    State.MoveAmount,
    TargetMove,
    ExpAlpha(Delta, MoveResponse)
  );

  State.Acceleration = (Speed - State.PreviousSpeed) / Math.max(Delta, 0.001);
  State.PreviousSpeed = Speed;
  State.SmoothedAcceleration = THREE.MathUtils.lerp(
    State.SmoothedAcceleration,
    State.Acceleration,
    ExpAlpha(Delta, 7)
  );

  const CadenceFloor = State.ResolvedMoving ? 5.2 : 4.8;
  const Cadence = THREE.MathUtils.lerp(
    CadenceFloor,
    State.Sprinting ? 10.0 : 7.0,
    State.MoveAmount
  );
  const EdgeCadenceScale = State.LocomotionSurfaceState === "EdgeTransition"
    ? 0.34
    : 1;

  if (State.ResolvedMoving || State.Moving) {
    State.Phase += Delta * Cadence * EdgeCadenceScale;
  }
}

function UpdateCharacterFacing(Delta) {
  if (!State.Pivot || !State.Camera) return;

  // Physical position follows the controller only. Mouse look must never move
  // the player root.
  State.Pivot.position.set(
    State.Camera.position.x,
    Math.max(0, State.Camera.position.y - PLAYER_EYE_HEIGHT),
    State.Camera.position.z
  );

  let TargetYaw = State.Pivot.rotation.y;
  let Responsiveness = TURN_RESPONSIVENESS;

  if (!State.ThirdPerson) {
    const CameraYaw = CameraFacingYaw();
    let RelativeYaw = NormalizeAngle(CameraYaw - State.Pivot.rotation.y);
    const FollowLimit = State.Moving
      ? FIRST_PERSON_BODY_FOLLOW_MOVING
      : FIRST_PERSON_BODY_FOLLOW_IDLE;

    if (Math.abs(RelativeYaw) > FollowLimit) {
      TargetYaw = CameraYaw - Math.sign(RelativeYaw) * FollowLimit;
      Responsiveness = State.Moving
        ? FIRST_PERSON_BODY_FOLLOW_MOVING_RATE
        : FIRST_PERSON_BODY_FOLLOW_IDLE_RATE;
    } else {
      TargetYaw = State.Pivot.rotation.y;
      Responsiveness = 0;
    }

    if (Responsiveness > 0) {
      const Difference = NormalizeAngle(TargetYaw - State.Pivot.rotation.y);
      State.Pivot.rotation.y += Difference * ExpAlpha(Delta, Responsiveness);
    }

    RelativeYaw = NormalizeAngle(CameraYaw - State.Pivot.rotation.y);

    // Hard safety cone: the camera may free-look, but it may never get far
    // enough behind the body to expose the inside of the neck/shoulders.
    if (Math.abs(RelativeYaw) > FIRST_PERSON_HEAD_YAW_MAX) {
      State.Pivot.rotation.y = CameraYaw -
        Math.sign(RelativeYaw) * FIRST_PERSON_HEAD_YAW_MAX;
      RelativeYaw = NormalizeAngle(CameraYaw - State.Pivot.rotation.y);
    }

    State.FirstPersonHeadYaw = THREE.MathUtils.clamp(
      RelativeYaw,
      -FIRST_PERSON_HEAD_YAW_MAX,
      FIRST_PERSON_HEAD_YAW_MAX
    );

    State.TempViewForward.set(0, 0, -1).applyQuaternion(State.Camera.quaternion).normalize();
    const CameraPitch = Math.asin(THREE.MathUtils.clamp(State.TempViewForward.y, -1, 1));
    State.FirstPersonHeadPitch = THREE.MathUtils.clamp(
      CameraPitch,
      THREE.MathUtils.degToRad(-72),
      THREE.MathUtils.degToRad(72)
    );
  } else {
    State.FirstPersonHeadYaw = THREE.MathUtils.lerp(
      State.FirstPersonHeadYaw,
      0,
      ExpAlpha(Delta, 12)
    );
    State.FirstPersonHeadPitch = THREE.MathUtils.lerp(
      State.FirstPersonHeadPitch,
      0,
      ExpAlpha(Delta, 12)
    );

    if (State.SmoothedVelocity.lengthSq() > 0.015) {
      State.TempForward.copy(State.SmoothedVelocity).normalize();
      TargetYaw = Math.atan2(State.TempForward.x, State.TempForward.z);
    }

    const Difference = NormalizeAngle(TargetYaw - State.Pivot.rotation.y);
    State.Pivot.rotation.y += Difference * ExpAlpha(Delta, TURN_RESPONSIVENESS);
  }

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

function SmoothStep01(Value) {
  const T = THREE.MathUtils.clamp(Value, 0, 1);
  return T * T * (3 - 2 * T);
}

function StepPulse(Start, End, T) {
  if (T <= Start || T >= End) return 0;
  const Local = SmoothStep01((T - Start) / (End - Start));
  return Math.sin(Local * Math.PI);
}

function SolveTwoBoneLeg(UpperName, LowerName, FootName, Target, PoleSide = 1) {
  const Upper = State.Bones.get(UpperName);
  const Lower = State.Bones.get(LowerName);
  const Foot = State.Bones.get(FootName);
  if (!Upper || !Lower || !Foot || !State.Pivot) return false;

  State.Pivot.updateMatrixWorld(true);
  Upper.getWorldPosition(State.TempHip);
  Lower.getWorldPosition(State.TempKnee);
  Foot.getWorldPosition(State.TempFoot);

  const UpperLength = State.TempHip.distanceTo(State.TempKnee);
  const LowerLength = State.TempKnee.distanceTo(State.TempFoot);
  if (UpperLength <= 0.0001 || LowerLength <= 0.0001) return false;

  State.TempLegTarget.copy(Target);
  State.TempLegAxis.copy(State.TempLegTarget).sub(State.TempHip);
  let Distance = State.TempLegAxis.length();
  if (Distance <= 0.0001) return false;
  State.TempLegAxis.divideScalar(Distance);

  const MinimumReach = Math.abs(UpperLength - LowerLength) + 0.004;
  const MaximumReach = Math.max(MinimumReach, UpperLength + LowerLength - 0.006);
  Distance = THREE.MathUtils.clamp(Distance, MinimumReach, MaximumReach);
  State.TempLegTarget.copy(State.TempHip).addScaledVector(State.TempLegAxis, Distance);

  State.TempPole.copy(State.TempKnee).sub(State.TempHip);
  State.TempPole.addScaledVector(State.TempLegAxis, -State.TempPole.dot(State.TempLegAxis));
  if (State.TempPole.lengthSq() <= 0.000001) {
    const Yaw = State.Pivot.rotation.y;
    State.TempPole.set(Math.cos(Yaw) * PoleSide, 0, -Math.sin(Yaw) * PoleSide);
    State.TempPole.addScaledVector(State.TempLegAxis, -State.TempPole.dot(State.TempLegAxis));
  }
  if (State.TempPole.lengthSq() <= 0.000001) State.TempPole.set(0, 0, PoleSide);
  State.TempPole.normalize();

  const KneeAlong = (UpperLength * UpperLength - LowerLength * LowerLength + Distance * Distance) / (2 * Distance);
  const KneeOut = Math.sqrt(Math.max(0, UpperLength * UpperLength - KneeAlong * KneeAlong));
  State.TempKneeTarget.copy(State.TempHip)
    .addScaledVector(State.TempLegAxis, KneeAlong)
    .addScaledVector(State.TempPole, KneeOut);

  RotateBoneToward(UpperName, LowerName, State.TempKneeTarget);
  State.Pivot.updateMatrixWorld(true);
  RotateBoneToward(LowerName, FootName, State.TempLegTarget);
  State.Pivot.updateMatrixWorld(true);
  return true;
}

function FootprintGroundProfile(SurfaceStep, Position, Travel, StartY) {
  const Raycast = SurfaceStep?.RaycastGroundHeight;
  if (typeof Raycast !== "function") {
    return {
      Height: 0,
      CenterHeight: 0,
      SupportFraction: 0,
      RaisedSamples: 0,
      SampleCount: 1
    };
  }

  State.TempFootSide.set(Travel.z, 0, -Travel.x);
  if (State.TempFootSide.lengthSq() <= 0.000001) State.TempFootSide.set(1, 0, 0);
  else State.TempFootSide.normalize();

  const CenterHeight = Math.max(0, Raycast(Position, StartY) ?? 0);
  const Samples = [
    [FOOT_PROBE_TOE, 0],
    [-FOOT_PROBE_HEEL, 0],
    [0, FOOT_PROBE_SIDE],
    [0, -FOOT_PROBE_SIDE],
    [FOOT_PROBE_TOE * 0.82, FOOT_PROBE_SIDE * 0.82],
    [FOOT_PROBE_TOE * 0.82, -FOOT_PROBE_SIDE * 0.82]
  ];

  let RaisedSamples = CenterHeight > 0.008 ? 1 : 0;
  let HeightSum = CenterHeight * 2.8;
  let WeightSum = 2.8;

  for (const [Forward, Side] of Samples) {
    State.TempFootProbe.copy(Position)
      .addScaledVector(Travel, Forward)
      .addScaledVector(State.TempFootSide, Side);

    const SampleHeight = Math.max(
      0,
      Raycast(State.TempFootProbe, StartY) ?? 0
    );

    if (SampleHeight > 0.008) RaisedSamples += 1;
    HeightSum += SampleHeight;
    WeightSum += 1;
  }

  const SampleCount = Samples.length + 1;
  const SupportFraction = THREE.MathUtils.clamp(
    RaisedSamples / SampleCount,
    0,
    1
  );

  // The center of the sole decides which level the foot belongs to. Surrounding
  // probes only soften the transition; a single heel/toe left on the rug can no
  // longer hold the entire foot up.
  const WeightedHeight = WeightSum > 0 ? HeightSum / WeightSum : CenterHeight;
  const Height = CenterHeight > 0.008
    ? THREE.MathUtils.lerp(WeightedHeight, CenterHeight, 0.72)
    : WeightedHeight * SupportFraction * 0.22;

  return {
    Height,
    CenterHeight,
    SupportFraction,
    RaisedSamples,
    SampleCount
  };
}

function ResetEdgeTransition() {
  State.EdgeTransition.Active = false;
  State.EdgeTransition.RugId = "";
  State.EdgeTransition.LastSeenAt = -Infinity;
  State.EdgeTransition.ResolvedFrames = 0;
  State.EdgeTransition.HasCrossedLead = false;
  State.EdgeTransition.Phase = "Source";
  State.EdgeTransition.NormalX = 0;
  State.EdgeTransition.NormalZ = 0;
  State.EdgeTransition.TangentX = 1;
  State.EdgeTransition.TangentZ = 0;
  State.EdgeTransition.EdgeX = 0;
  State.EdgeTransition.EdgeZ = 0;
  State.EdgeTransition.Height = 0;
  State.EdgeTransition.SignedDistance = 0;
  State.EdgeTransition.TravelProgress = 0;
  State.EdgeTransition.BoundsMinX = 0;
  State.EdgeTransition.BoundsMaxX = 0;
  State.EdgeTransition.BoundsMinZ = 0;
  State.EdgeTransition.BoundsMaxZ = 0;
  State.LocomotionSurfaceState = "FlatGround";
  State.LedgePelvisOffsetX = 0;
  State.LedgePelvisOffsetZ = 0;

  window.__STORE_EDGE_TRANSITION__ = {
    Active: false,
    State: "FlatGround",
    UpdatedAt: performance.now()
  };
}

function StoredEdgeSignedDistance(Transition, Position) {
  return (
    (Position.x - Transition.EdgeX) * Transition.NormalX +
    (Position.z - Transition.EdgeZ) * Transition.NormalZ
  );
}

function StoredEdgeTangentOutsideDistance(Transition, Position) {
  if (Math.abs(Transition.NormalX) > 0.5) {
    if (Position.z < Transition.BoundsMinZ) {
      return Transition.BoundsMinZ - Position.z;
    }
    if (Position.z > Transition.BoundsMaxZ) {
      return Position.z - Transition.BoundsMaxZ;
    }
    return 0;
  }

  if (Position.x < Transition.BoundsMinX) {
    return Transition.BoundsMinX - Position.x;
  }
  if (Position.x > Transition.BoundsMaxX) {
    return Position.x - Transition.BoundsMaxX;
  }
  return 0;
}

function EdgeTravelProgress(Transition, SignedDistance) {
  return Transition.Entering
    ? -SignedDistance
    : SignedDistance;
}

function EdgePhaseForProgress(Progress) {
  if (Progress < EDGE_LEAD_SWITCH_DISTANCE) return "Source";
  if (Progress < EDGE_TRAIL_SWITCH_DISTANCE) return "LeadCrossed";
  return "Destination";
}

function UpdateGeometryEdgeTransition(SurfaceStep, Step, Travel) {
  const Query = SurfaceStep?.GetNearestLedgeState;
  if (typeof Query !== "function" || !State.Pivot) {
    ResetEdgeTransition();
    return null;
  }

  const Existing = State.EdgeTransition;
  const Now = performance.now();

  let Ledge = Query(
    State.Pivot.position,
    Travel,
    Existing.Active
      ? Math.max(EDGE_TRANSITION_RANGE, EDGE_RELEASE_DISTANCE + 0.10)
      : EDGE_TRANSITION_RANGE
  );

  if (!Existing.Active) {
    const CrossingIntent = Boolean(
      Ledge &&
      (
        Math.abs(Number(Ledge.MotionDot) || 0) > 0.10 ||
        Step?.Active === true
      )
    );

    if (!Ledge || !CrossingIntent) {
      ResetEdgeTransition();
      return null;
    }

    Existing.Active = true;
    Existing.RugId = Ledge.RugId;
    Existing.StartedAt = Now;
    Existing.LastSeenAt = Now;
    Existing.ResolvedFrames = 0;
    Existing.HasCrossedLead = false;
    Existing.LeadSide = Step?.Side === -1
      ? -1
      : Step?.Side === 1
        ? 1
        : (Math.sin(State.Phase) >= 0 ? -1 : 1);

    if (Ledge.Entering) Existing.Entering = true;
    else if (Ledge.Exiting) Existing.Entering = false;
    else Existing.Entering = Step?.Entering !== false;
  }

  // Once latched, do not jump to a different edge just because the nearest
  // query changes. Refresh only from the same rug and same edge direction.
  if (
    Ledge &&
    Ledge.RugId === Existing.RugId &&
    (
      !Existing.Active ||
      Existing.NormalX === 0 && Existing.NormalZ === 0 ||
      Ledge.NormalX * Existing.NormalX +
        Ledge.NormalZ * Existing.NormalZ > 0.92
    )
  ) {
    Existing.LastSeenAt = Now;
    Existing.NormalX = Number(Ledge.NormalX) || 0;
    Existing.NormalZ = Number(Ledge.NormalZ) || 0;
    Existing.TangentX = Number(Ledge.TangentX) || 0;
    Existing.TangentZ = Number(Ledge.TangentZ) || 0;
    Existing.EdgeX = Number(Ledge.EdgeX) || 0;
    Existing.EdgeZ = Number(Ledge.EdgeZ) || 0;
    Existing.Height = Math.max(0, Number(Ledge.Height) || 0);

    const Bounds = Ledge.Bounds;
    if (Bounds) {
      Existing.BoundsMinX = Number(Bounds.min?.x) || Existing.BoundsMinX;
      Existing.BoundsMaxX = Number(Bounds.max?.x) || Existing.BoundsMaxX;
      Existing.BoundsMinZ = Number(Bounds.min?.z) || Existing.BoundsMinZ;
      Existing.BoundsMaxZ = Number(Bounds.max?.z) || Existing.BoundsMaxZ;
    }
  }

  // If the first latched frame did not refresh the geometry yet, seed it now.
  if (
    Ledge &&
    Existing.RugId === Ledge.RugId &&
    Math.abs(Existing.NormalX) + Math.abs(Existing.NormalZ) < 0.5
  ) {
    Existing.NormalX = Number(Ledge.NormalX) || 0;
    Existing.NormalZ = Number(Ledge.NormalZ) || 0;
    Existing.TangentX = Number(Ledge.TangentX) || 0;
    Existing.TangentZ = Number(Ledge.TangentZ) || 0;
    Existing.EdgeX = Number(Ledge.EdgeX) || 0;
    Existing.EdgeZ = Number(Ledge.EdgeZ) || 0;
    Existing.Height = Math.max(0, Number(Ledge.Height) || 0);
    const Bounds = Ledge.Bounds;
    if (Bounds) {
      Existing.BoundsMinX = Number(Bounds.min?.x) || 0;
      Existing.BoundsMaxX = Number(Bounds.max?.x) || 0;
      Existing.BoundsMinZ = Number(Bounds.min?.z) || 0;
      Existing.BoundsMaxZ = Number(Bounds.max?.z) || 0;
    }
  }

  const SignedDistance = StoredEdgeSignedDistance(
    Existing,
    State.Pivot.position
  );
  const Progress = EdgeTravelProgress(
    Existing,
    SignedDistance
  );

  Existing.SignedDistance = SignedDistance;
  Existing.TravelProgress = Progress;
  Existing.Phase = EdgePhaseForProgress(Progress);

  if (Progress >= EDGE_LEAD_SWITCH_DISTANCE) {
    Existing.HasCrossedLead = true;
  }

  const TangentOutside = StoredEdgeTangentOutsideDistance(
    Existing,
    State.Pivot.position
  );

  // Release only after the body has clearly reached either stable side for
  // several consecutive frames. One bad query/frame cannot end the state.
  const FarDestination = Progress >= EDGE_RELEASE_DISTANCE;
  const FarSourceAfterReversal =
    Existing.HasCrossedLead &&
    Progress <= -EDGE_RELEASE_DISTANCE;
  const SameLevelResolved =
    FarDestination ||
    FarSourceAfterReversal;
  const TangentStillRelevant =
    TangentOutside <= EDGE_TANGENT_RELEASE_PADDING;

  if (SameLevelResolved || !TangentStillRelevant) {
    Existing.ResolvedFrames += 1;
  } else {
    Existing.ResolvedFrames = 0;
  }

  if (
    Existing.ResolvedFrames >= EDGE_RELEASE_FRAMES &&
    Now - Existing.StartedAt > 90
  ) {
    ResetEdgeTransition();
    return null;
  }

  // Emergency stale cleanup only when the player has actually left the entire
  // edge segment. Never use a missing nearest-edge query alone as an exit.
  if (
    Now - Existing.LastSeenAt > EDGE_TRANSITION_HOLD_MS &&
    TangentOutside > EDGE_TANGENT_RELEASE_PADDING
  ) {
    ResetEdgeTransition();
    return null;
  }

  State.LocomotionSurfaceState = "EdgeTransition";
  return Existing;
}


function BuildGeometryEdgeSupport(Side, SurfaceStep, Transition) {
  if (!Transition?.Active || !State.Pivot) return null;

  const IsLeft = Side < 0;
  const Upper = IsLeft ? "UpperLegL" : "UpperLegR";
  const Lower = IsLeft ? "LowerLegL" : "LowerLegR";
  const Foot = IsLeft ? "FootL" : "FootR";
  const FootBone = State.Bones.get(Foot);
  if (!FootBone) return null;

  State.Pivot.updateMatrixWorld(true);
  FootBone.getWorldPosition(State.TempLegTarget);

  const Lead = Side === Transition.LeadSide;
  const DestinationTop = Transition.Entering;
  const SourceTop = !Transition.Entering;

  let UsesDestination = false;
  if (Transition.Phase === "LeadCrossed") {
    UsesDestination = Lead;
  } else if (Transition.Phase === "Destination") {
    UsesDestination = true;
  }

  const WantsTop = UsesDestination
    ? DestinationTop
    : SourceTop;
  const SupportHeight = WantsTop ? Transition.Height : 0;

  // Map character left/right onto the ledge tangent so the generated stance
  // remains anatomically left/right even when the rug edge is rotated 90°.
  const BodyYaw = State.Pivot.rotation.y;
  State.TempRight.set(
    Math.cos(BodyYaw),
    0,
    -Math.sin(BodyYaw)
  );
  State.TempFootSide.set(
    Transition.TangentX,
    0,
    Transition.TangentZ
  );
  if (State.TempFootSide.lengthSq() <= 0.000001) {
    State.TempFootSide.set(1, 0, 0);
  } else {
    State.TempFootSide.normalize();
  }

  const TangentSign = State.TempRight.dot(State.TempFootSide) >= 0 ? 1 : -1;
  const TangentOffset =
    Side * EDGE_FOOT_TANGENT_OFFSET * TangentSign;
  const NormalOffset = WantsTop
    ? -EDGE_FOOT_NORMAL_OFFSET
    : EDGE_FOOT_NORMAL_OFFSET;

  State.TempLegTarget.set(
    Transition.EdgeX +
      Transition.NormalX * NormalOffset +
      Transition.TangentX * TangentOffset,
    State.TempLegTarget.y,
    Transition.EdgeZ +
      Transition.NormalZ * NormalOffset +
      Transition.TangentZ * TangentOffset
  );

  // Remove walk-cycle vertical bob from the stance target. Only the rig's
  // natural ankle height above the root is retained.
  const NaturalFootHeight = THREE.MathUtils.clamp(
    State.TempLegTarget.y - State.Pivot.position.y,
    0.045,
    0.105
  );
  State.TempLegTarget.y =
    SupportHeight +
    NaturalFootHeight +
    (WantsTop ? FOOT_SOLE_SKIN : 0);

  if (WantsTop) {
    SurfaceStep.ResolveRaisedFootLedge?.(
      State.TempLegTarget,
      LEDGE_FOOT_RADIUS,
      SupportHeight
    );
  } else {
    SurfaceStep.ResolveLowerFootLedge?.(
      State.TempLegTarget,
      LEDGE_FOOT_RADIUS,
      0
    );
  }

  const StoredTarget = IsLeft
    ? State.LedgeTargetLeft
    : State.LedgeTargetRight;
  StoredTarget.copy(State.TempLegTarget);

  return {
    Side,
    Upper,
    Lower,
    Foot,
    Target: StoredTarget,
    GroundHeight: SupportHeight,
    CenterGroundHeight: SupportHeight,
    SupportFraction: 1,
    SupportWeight: 1,
    Arc: 0,
    GeometryDriven: true,
    WantsTop,
    UsesDestination,
    TransitionPhase: Transition.Phase
  };
}

function ApplyGeometryEdgePelvis(LeftSupport, RightSupport, Transition, Delta) {
  if (!State.Pivot || !LeftSupport || !RightSupport) return;

  const RootFloor = Number(State.Pivot.position.y) || 0;
  const BalancedHeight =
    (Number(LeftSupport.CenterGroundHeight) +
      Number(RightSupport.CenterGroundHeight)) * 0.5;

  const TargetY = THREE.MathUtils.clamp(
    BalancedHeight - RootFloor,
    -LEDGE_PELVIS_MAX,
    LEDGE_PELVIS_MAX
  );

  const MidX = (LeftSupport.Target.x + RightSupport.Target.x) * 0.5;
  const MidZ = (LeftSupport.Target.z + RightSupport.Target.z) * 0.5;

  const TargetX = THREE.MathUtils.clamp(
    (MidX - State.Pivot.position.x) * 0.18,
    -LEDGE_PELVIS_XZ_MAX,
    LEDGE_PELVIS_XZ_MAX
  );
  const TargetZ = THREE.MathUtils.clamp(
    (MidZ - State.Pivot.position.z) * 0.18,
    -LEDGE_PELVIS_XZ_MAX,
    LEDGE_PELVIS_XZ_MAX
  );

  State.LedgePelvisOffset = THREE.MathUtils.lerp(
    State.LedgePelvisOffset,
    TargetY,
    ExpAlpha(Delta, 20)
  );
  State.LedgePelvisOffsetX = THREE.MathUtils.lerp(
    State.LedgePelvisOffsetX,
    TargetX,
    ExpAlpha(Delta, 16)
  );
  State.LedgePelvisOffsetZ = THREE.MathUtils.lerp(
    State.LedgePelvisOffsetZ,
    TargetZ,
    ExpAlpha(Delta, 16)
  );

  State.Pivot.position.x += State.LedgePelvisOffsetX;
  State.Pivot.position.y += State.LedgePelvisOffset;
  State.Pivot.position.z += State.LedgePelvisOffsetZ;
  State.Pivot.updateMatrixWorld(true);

  State.LedgeSplitActive = true;
}

function ApplyGeometryEdgeTransition(SurfaceStep, Step, Delta, Travel) {
  const Transition = UpdateGeometryEdgeTransition(
    SurfaceStep,
    Step,
    Travel
  );
  if (!Transition?.Active) return false;

  const LeftSupport = BuildGeometryEdgeSupport(
    -1,
    SurfaceStep,
    Transition
  );
  const RightSupport = BuildGeometryEdgeSupport(
    1,
    SurfaceStep,
    Transition
  );
  if (!LeftSupport || !RightSupport) return false;

  ApplyGeometryEdgePelvis(
    LeftSupport,
    RightSupport,
    Transition,
    Delta
  );

  // Lower body is now geometry-driven. The walk clip has already been sampled,
  // but these IK solves replace its leg result before render.
  SolveTwoBoneLeg(
    LeftSupport.Upper,
    LeftSupport.Lower,
    LeftSupport.Foot,
    LeftSupport.Target,
    LeftSupport.Side
  );
  SolveTwoBoneLeg(
    RightSupport.Upper,
    RightSupport.Lower,
    RightSupport.Foot,
    RightSupport.Target,
    RightSupport.Side
  );

  // Feet stay level with their actual support planes.
  AddBoneRotation("FootL", LeftSupport.WantsTop ? -0.012 : 0.010, 0, 0);
  AddBoneRotation("FootR", RightSupport.WantsTop ? -0.012 : 0.010, 0, 0);

  window.__STORE_FOOT_SUPPORT__ = {
    Active: true,
    EdgeTransition: true,
    Height: THREE.MathUtils.clamp(
      (LeftSupport.GroundHeight + RightSupport.GroundHeight) * 0.5,
      0,
      0.30
    ),
    LeftHeight: LeftSupport.CenterGroundHeight,
    RightHeight: RightSupport.CenterGroundHeight,
    LeftVisualHeight: LeftSupport.GroundHeight,
    RightVisualHeight: RightSupport.GroundHeight,
    LeftWeight: 1,
    RightWeight: 1,
    UpdatedAt: performance.now()
  };

  window.__STORE_EDGE_TRANSITION__ = {
    Active: true,
    State: "EdgeTransition",
    RugId: Transition.RugId,
    Entering: Transition.Entering,
    LeadSide: Transition.LeadSide,
    Phase: Transition.Phase,
    TravelProgress: Transition.TravelProgress,
    SignedDistance: Transition.SignedDistance,
    ResolvedFrames: Transition.ResolvedFrames,
    HasCrossedLead: Transition.HasCrossedLead,
    UpdatedAt: performance.now()
  };

  return true;
}

function ResetLedgeFootLocks() {
  State.LedgeLockLeft.Active = false;
  State.LedgeLockRight.Active = false;
  State.LedgeSplitActive = false;
  if (!State.EdgeTransition.Active) {
    State.LocomotionSurfaceState = "FlatGround";
  }
}

function LedgeLockForSide(Side) {
  return Side < 0 ? State.LedgeLockLeft : State.LedgeLockRight;
}

function ApplyLedgeFootLock(Support, SurfaceStep, SplitStance, Delta) {
  if (!Support?.Target?.isVector3) return;

  const Lock = LedgeLockForSide(Support.Side);
  const Now = performance.now();
  const InStance = Number(Support.Arc) < 0.38;

  if (!SplitStance || !InStance) {
    Lock.Active = false;
    return;
  }

  if (!Lock.Active) {
    Lock.Active = true;
    Lock.StartedAt = Now;
    Lock.Position.copy(Support.Target);
  }

  const Age = Now - Lock.StartedAt;
  const Drift = Math.hypot(
    Lock.Position.x - Support.Target.x,
    Lock.Position.z - Support.Target.z
  );

  if (Age > LEDGE_LOCK_MAX_AGE || Drift > LEDGE_LOCK_MAX_DRIFT) {
    Lock.StartedAt = Now;
    Lock.Position.copy(Support.Target);
  }

  // Keep vertical support live while X/Z stay planted in world space.
  Lock.Position.y = Support.Target.y;

  if (Support.CenterGroundHeight > 0.008) {
    SurfaceStep.ResolveRaisedFootLedge?.(
      Lock.Position,
      LEDGE_FOOT_RADIUS,
      Support.CenterGroundHeight
    );
  } else {
    SurfaceStep.ResolveLowerFootLedge?.(
      Lock.Position,
      LEDGE_FOOT_RADIUS,
      Support.CenterGroundHeight
    );
  }

  // A planted stance foot is a hard world-space constraint. Easing here
  // allowed one-frame visual penetration at sharp ledges.
  Support.Target.x = Lock.Position.x;
  Support.Target.z = Lock.Position.z;
}

function ApplySplitStancePelvis(LeftSupport, RightSupport, Delta) {
  const LeftHeight = Number(LeftSupport?.CenterGroundHeight);
  const RightHeight = Number(RightSupport?.CenterGroundHeight);

  const SplitStance = Number.isFinite(LeftHeight) &&
    Number.isFinite(RightHeight) &&
    Math.abs(LeftHeight - RightHeight) > 0.022;

  State.LedgeSplitActive = SplitStance;

  let TargetOffset = 0;
  if (SplitStance && State.Pivot) {
    const RootFloor = Math.max(0, Number(State.Pivot.position.y) || 0);
    const BalancedSupport = (LeftHeight + RightHeight) * 0.5;
    TargetOffset = THREE.MathUtils.clamp(
      BalancedSupport - RootFloor,
      -LEDGE_PELVIS_MAX,
      LEDGE_PELVIS_MAX
    );
  }

  State.LedgePelvisOffset = THREE.MathUtils.lerp(
    State.LedgePelvisOffset,
    TargetOffset,
    ExpAlpha(Delta, SplitStance ? 18 : 11)
  );

  if (State.Pivot && Math.abs(State.LedgePelvisOffset) > 0.0002) {
    State.Pivot.position.y += State.LedgePelvisOffset;
    State.Pivot.updateMatrixWorld(true);
  }

  if (!SplitStance) ResetLedgeFootLocks();
  return SplitStance;
}

function GroundAndPlaceFoot(Side, SurfaceStep, Step, Delta, Travel, LeadSide) {
  const IsLeft = Side < 0;
  const Upper = IsLeft ? "UpperLegL" : "UpperLegR";
  const Lower = IsLeft ? "LowerLegL" : "LowerLegR";
  const Foot = IsLeft ? "FootL" : "FootR";
  const FootBone = State.Bones.get(Foot);
  if (!FootBone || !State.Pivot) return;

  const Active = Boolean(Step?.Active);
  const T = Active ? THREE.MathUtils.clamp(Number(Step.Progress) || 0, 0, 1) : 0;
  const IsLead = Active && Side === LeadSide;
  const IsTrail = Active && Side === -LeadSide;

  const Height = THREE.MathUtils.clamp(Number(Step?.Height) || 0.065, 0.02, 0.14);
  const Speed = THREE.MathUtils.clamp(Number(Step?.Speed) || 1.8, 0.35, 5.5);
  const SpeedFactor = THREE.MathUtils.lerp(0.90, 1.08, (Speed - 0.35) / 5.15);

  const LeadArc = IsLead ? StepPulse(0.00, 0.84, T) : 0;
  const TrailArc = IsTrail ? StepPulse(0.44, 1.00, T) : 0;
  const Arc = Math.max(LeadArc, TrailArc);

  State.Pivot.updateMatrixWorld(true);
  FootBone.getWorldPosition(State.TempLegTarget);

  let Reach = 0;
  let Lift = 0;

  if (IsLead) {
    Reach = (0.055 + Height * 0.62) * LeadArc * SpeedFactor;
    Lift = (0.035 + Height * 0.88) * LeadArc * SpeedFactor * (Step.Entering !== false ? 1 : 0.82);
  } else if (IsTrail) {
    Reach = (0.018 + Height * 0.18) * TrailArc;
    Lift = (0.010 + Height * 0.26) * TrailArc * (Step.Entering !== false ? 1 : 0.72);
  }

  State.TempLegTarget.addScaledVector(Travel, Reach);

  const RootFloor = Math.max(0, State.Pivot.position.y);
  const GroundRayStartY = Math.max(
    State.TempLegTarget.y + 0.55,
    (State.Camera?.position?.y || 1.68) + 0.18
  );
  const GroundProfile = FootprintGroundProfile(
    SurfaceStep,
    State.TempLegTarget,
    Travel,
    GroundRayStartY
  );
  const GroundHeight = GroundProfile.Height;
  const CenterGroundHeight = GroundProfile.CenterHeight;

  const RaisedSurfaceSkin = GroundHeight > RootFloor + 0.008 ? FOOT_SOLE_SKIN : 0;
  const DesiredGroundOffset = THREE.MathUtils.clamp(
    GroundHeight - RootFloor + RaisedSurfaceSkin,
    -0.18,
    0.18
  );

  const EffectiveLift = CenterGroundHeight < 0.008 && Step?.Entering === false
    ? Lift * 0.18
    : Lift;

  const PreviousOffset = IsLeft ? State.FootGroundLeft : State.FootGroundRight;
  const DroppingOffLedge = DesiredGroundOffset < PreviousOffset - 0.012;
  const GroundAlpha = ExpAlpha(
    Delta,
    DroppingOffLedge ? 38 : (Active ? 25 : 18)
  );

  if (IsLeft) {
    State.FootGroundLeft = THREE.MathUtils.lerp(
      State.FootGroundLeft,
      DesiredGroundOffset,
      GroundAlpha
    );
    State.TempLegTarget.y += State.FootGroundLeft + EffectiveLift;
  } else {
    State.FootGroundRight = THREE.MathUtils.lerp(
      State.FootGroundRight,
      DesiredGroundOffset,
      GroundAlpha
    );
    State.TempLegTarget.y += State.FootGroundRight + EffectiveLift;
  }

  // A planted shoe may not straddle the vertical face of the rug.
  if (CenterGroundHeight > 0.008) {
    SurfaceStep.ResolveRaisedFootLedge?.(
      State.TempLegTarget,
      LEDGE_FOOT_RADIUS,
      CenterGroundHeight
    );
  } else {
    SurfaceStep.ResolveLowerFootLedge?.(
      State.TempLegTarget,
      LEDGE_FOOT_RADIUS,
      CenterGroundHeight
    );
  }

  const StoredTarget = IsLeft ? State.LedgeTargetLeft : State.LedgeTargetRight;
  StoredTarget.copy(State.TempLegTarget);

  SolveTwoBoneLeg(Upper, Lower, Foot, State.TempLegTarget, Side);

  if (Arc > 0.001) {
    const Pitch = IsLead ? -0.085 * Arc * SpeedFactor : -0.028 * Arc;
    AddBoneRotation(Foot, Pitch, 0, Side * -0.004 * Arc);
  }

  return {
    Side,
    Upper,
    Lower,
    Foot,
    Target: StoredTarget,
    GroundHeight,
    CenterGroundHeight,
    SupportFraction: GroundProfile.SupportFraction,
    SupportWeight: Arc > 0.001
      ? THREE.MathUtils.lerp(1, 0.10, THREE.MathUtils.clamp(Arc, 0, 1))
      : Math.max(0.18, GroundProfile.SupportFraction),
    Arc
  };
}

function ApplyCarpetStepOverlay(Delta) {
  const SurfaceStep = window.__STORE_SURFACE_STEP_ANIMATION_R87__ || null;
  if (!SurfaceStep || !State.Pivot) return;

  SurfaceStep.UpdateCrossingState?.();
  const Step = SurfaceStep.GetStepState?.() || null;

  const DirectionX = Number(Step?.DirectionX) || 0;
  const DirectionZ = Number(Step?.DirectionZ) || 0;
  State.TempTravel.set(DirectionX, 0, DirectionZ);

  if (State.TempTravel.lengthSq() <= 0.000001) {
    if (State.SmoothedVelocity.lengthSq() > 0.001) State.TempTravel.copy(State.SmoothedVelocity).setY(0).normalize();
    else State.TempTravel.set(Math.sin(State.Pivot.rotation.y), 0, Math.cos(State.Pivot.rotation.y));
  } else {
    State.TempTravel.normalize();
  }

  const LeadSide = Step?.Side === -1 ? -1 : 1;

  if (
    ApplyGeometryEdgeTransition(
      SurfaceStep,
      Step,
      Delta,
      State.TempTravel
    )
  ) {
    return;
  }

  if (State.EdgeTransition.Active) ResetEdgeTransition();

  const LeftSupport = GroundAndPlaceFoot(-1, SurfaceStep, Step, Delta, State.TempTravel, LeadSide);
  const RightSupport = GroundAndPlaceFoot(1, SurfaceStep, Step, Delta, State.TempTravel, LeadSide);

  if (LeftSupport && RightSupport) {
    const SplitStance = ApplySplitStancePelvis(
      LeftSupport,
      RightSupport,
      Delta
    );

    ApplyLedgeFootLock(
      LeftSupport,
      SurfaceStep,
      SplitStance,
      Delta
    );
    ApplyLedgeFootLock(
      RightSupport,
      SurfaceStep,
      SplitStance,
      Delta
    );

    // Re-solve after pelvis compensation and world-space stance locking.
    SolveTwoBoneLeg(
      LeftSupport.Upper,
      LeftSupport.Lower,
      LeftSupport.Foot,
      LeftSupport.Target,
      LeftSupport.Side
    );
    SolveTwoBoneLeg(
      RightSupport.Upper,
      RightSupport.Lower,
      RightSupport.Foot,
      RightSupport.Target,
      RightSupport.Side
    );

    const LeftWeight = Math.max(0.05, Number(LeftSupport.SupportWeight) || 0);
    const RightWeight = Math.max(0.05, Number(RightSupport.SupportWeight) || 0);
    const TotalWeight = LeftWeight + RightWeight;
    const SupportHeight = TotalWeight > 0.0001
      ? (LeftSupport.GroundHeight * LeftWeight + RightSupport.GroundHeight * RightWeight) / TotalWeight
      : 0;

    window.__STORE_FOOT_SUPPORT__ = {
      Active: Boolean(SurfaceStep.NearRug?.(State.Pivot.position, 0.42)),
      Height: THREE.MathUtils.clamp(SupportHeight, 0, 0.30),
      LeftHeight: Number(LeftSupport.CenterGroundHeight) || 0,
      RightHeight: Number(RightSupport.CenterGroundHeight) || 0,
      LeftVisualHeight: LeftSupport.GroundHeight,
      RightVisualHeight: RightSupport.GroundHeight,
      LeftWeight,
      RightWeight,
      UpdatedAt: performance.now()
    };
  }

  if (!Step?.Active) return;

  const T = THREE.MathUtils.clamp(Number(Step.Progress) || 0, 0, 1);
  const Side = LeadSide;
  const Height = THREE.MathUtils.clamp(Number(Step.Height) || 0.065, 0.02, 0.14);
  const BodyArc = Math.sin(SmoothStep01(T) * Math.PI);
  const BodyLean = BodyArc * THREE.MathUtils.clamp(Height * 4.0, 0.10, 0.36);

  AddBoneRotation("Hips", -0.014 * BodyLean, 0, Side * 0.014 * BodyArc);
  AddBoneRotation("Abdomen", 0.009 * BodyLean, Side * -0.006 * BodyArc, 0);
  AddBoneRotation("Torso", 0.007 * BodyLean, Side * 0.005 * BodyArc, 0);
  AddBoneRotation("Chest", -0.004 * BodyLean, 0, 0);
}

function UpdatePhysicalContactReaction(Delta) {
  const Contact = window.__STORE_MOVEMENT_CONTACT__ || null;
  const Age = performance.now() - Number(Contact?.LastHit ?? -Infinity);
  const Valid = Boolean(
    Contact?.Normal?.isVector3 &&
    Age >= 0 &&
    Age < 260 &&
    !Contact?.Stepped
  );

  const Fade = Valid
    ? 1 - THREE.MathUtils.clamp(Age / 260, 0, 1)
    : 0;
  const TargetReaction = Valid
    ? THREE.MathUtils.clamp(Number(Contact.Strength) || 0, 0, 1) * Fade
    : 0;

  const ReactionAlpha = ExpAlpha(
    Delta,
    TargetReaction > State.ContactReaction ? 24 : 8.5
  );
  State.ContactReaction = THREE.MathUtils.lerp(
    State.ContactReaction,
    TargetReaction,
    ReactionAlpha
  );

  let TargetFront = 0;
  let TargetBack = 0;
  let TargetSide = 0;
  let TargetIntent = 0;

  if (Valid && State.Pivot) {
    const Yaw = State.Pivot.rotation.y;
    const ForwardX = Math.sin(Yaw);
    const ForwardZ = Math.cos(Yaw);
    const RightX = Math.cos(Yaw);
    const RightZ = -Math.sin(Yaw);

    const ForwardDot =
      Contact.Normal.x * ForwardX +
      Contact.Normal.z * ForwardZ;

    TargetFront = THREE.MathUtils.clamp(-ForwardDot, 0, 1);
    TargetBack = THREE.MathUtils.clamp(ForwardDot, 0, 1);
    TargetSide = THREE.MathUtils.clamp(
      Contact.Normal.x * RightX +
      Contact.Normal.z * RightZ,
      -1,
      1
    );
    TargetIntent = THREE.MathUtils.clamp(
      Number(Contact.IntentInward) || 0,
      0,
      1
    );
  }

  const DirectionAlpha = ExpAlpha(Delta, Valid ? 18 : 7);
  State.ContactFront = THREE.MathUtils.lerp(
    State.ContactFront,
    TargetFront,
    DirectionAlpha
  );
  State.ContactBack = THREE.MathUtils.lerp(
    State.ContactBack,
    TargetBack,
    DirectionAlpha
  );
  State.ContactSide = THREE.MathUtils.lerp(
    State.ContactSide,
    TargetSide,
    DirectionAlpha
  );
  State.ContactIntent = THREE.MathUtils.lerp(
    State.ContactIntent,
    TargetIntent,
    DirectionAlpha
  );

  return State.ContactReaction;
}

function ApplyPhysicalContactReaction(Reaction) {
  if (Reaction <= 0.001) return;

  const Front = State.ContactFront;
  const Back = State.ContactBack;
  const Side = State.ContactSide;
  const Intent = State.ContactIntent;
  const Contact = window.__STORE_MOVEMENT_CONTACT__ || null;
  const BodyPart = String(Contact?.BodyPart || "");
  const LowerOnlyContact = /leg|foot|hips/i.test(BodyPart) &&
    !/abdomen|torso|chest|shoulder|neck/i.test(BodyPart);
  const UpperContact = /abdomen|torso|chest|shoulder|neck/i.test(BodyPart);
  const LowerResponse = UpperContact ? 0.42 : 1.0;
  const UpperResponse = LowerOnlyContact ? 0.10 : 1.0;
  const ArmResponse = LowerOnlyContact ? 0.0 : 1.0;

  const Pressure = THREE.MathUtils.clamp(
    Number(Contact?.ConstraintPressure) || 0,
    0,
    1
  );
  const Compression = Reaction * (
    0.34 +
    Intent * 0.34 +
    Pressure * 0.32
  );
  const FrontBrace = Compression * Front;
  const BackBrace = Compression * Back;
  const SideBrace = Compression * Side;
  const DepthBoost = THREE.MathUtils.clamp(
    Number(Contact?.PenetrationDepth) / 0.055 || 0,
    0,
    1
  );
  const Recoil = Compression * (0.78 + DepthBoost * 0.12 + Pressure * 0.10);
  const Effort = Math.sin(State.Phase * 0.78) * Compression * Intent;
  const EffortAbs = Math.abs(Effort);

  // Lower body absorbs the contact first so the feet stay visually planted.
  AddBoneRotation("Hips",
    (0.050 * FrontBrace - 0.030 * BackBrace) * LowerResponse,
    SideBrace * -0.030 * LowerResponse,
    SideBrace * -0.070 * LowerResponse
  );
  AddBoneRotation("UpperLegL",
    (0.095 * FrontBrace + 0.035 * Recoil) * LowerResponse,
    SideBrace * 0.018 * LowerResponse,
    SideBrace * -0.026 * LowerResponse
  );
  AddBoneRotation("UpperLegR",
    (0.095 * FrontBrace + 0.035 * Recoil) * LowerResponse,
    SideBrace * 0.018 * LowerResponse,
    SideBrace * -0.026 * LowerResponse
  );
  AddBoneRotation("LowerLegL", -0.090 * FrontBrace * LowerResponse, 0, SideBrace * 0.010 * LowerResponse);
  AddBoneRotation("LowerLegR", -0.090 * FrontBrace * LowerResponse, 0, SideBrace * 0.010 * LowerResponse);
  AddBoneRotation("FootL", 0.024 * FrontBrace * LowerResponse, 0, SideBrace * -0.008 * LowerResponse);
  AddBoneRotation("FootR", 0.024 * FrontBrace * LowerResponse, 0, SideBrace * -0.008 * LowerResponse);

  // Keep showing effort while input is held: weight shifts and knees load,
  // but the feet do not stride through the obstacle.
  AddBoneRotation("Hips", 0, Effort * 0.020 * LowerResponse, Effort * 0.040 * LowerResponse);
  AddBoneRotation("UpperLegL", (EffortAbs * 0.035 + Math.max(0, Effort) * 0.020) * LowerResponse, 0, -Effort * 0.020 * LowerResponse);
  AddBoneRotation("UpperLegR", (EffortAbs * 0.035 + Math.max(0, -Effort) * 0.020) * LowerResponse, 0, -Effort * 0.020 * LowerResponse);
  AddBoneRotation("LowerLegL", -EffortAbs * 0.028 * LowerResponse, 0, 0);
  AddBoneRotation("LowerLegR", -EffortAbs * 0.028 * LowerResponse, 0, 0);

  // Spine flexes in a chain instead of the whole model snapping as one rigid part.
  AddBoneRotation("Abdomen",
    (-0.060 * FrontBrace + 0.035 * BackBrace) * UpperResponse,
    SideBrace * -0.028 * UpperResponse,
    SideBrace * -0.055 * UpperResponse
  );
  AddBoneRotation("Torso",
    (-0.090 * FrontBrace + 0.050 * BackBrace) * UpperResponse,
    SideBrace * -0.040 * UpperResponse,
    SideBrace * -0.080 * UpperResponse
  );
  AddBoneRotation("Chest",
    (0.052 * FrontBrace - 0.032 * BackBrace) * UpperResponse,
    SideBrace * 0.032 * UpperResponse,
    SideBrace * 0.060 * UpperResponse
  );
  AddBoneRotation("Neck",
    (0.025 * FrontBrace - 0.018 * BackBrace) * UpperResponse,
    SideBrace * 0.018 * UpperResponse,
    SideBrace * 0.025 * UpperResponse
  );

  // Near-side shoulder gives first; both arms brace on a frontal impact.
  const LeftWeight = THREE.MathUtils.clamp(0.72 - Side * 0.38, 0.34, 1.10);
  const RightWeight = THREE.MathUtils.clamp(0.72 + Side * 0.38, 0.34, 1.10);

  AddBoneRotation("ShoulderL",
    -0.070 * FrontBrace * LeftWeight * ArmResponse,
    SideBrace * -0.025 * ArmResponse,
    0.045 * Recoil * LeftWeight * ArmResponse
  );
  AddBoneRotation("ShoulderR",
    -0.070 * FrontBrace * RightWeight * ArmResponse,
    SideBrace * -0.025 * ArmResponse,
    -0.045 * Recoil * RightWeight * ArmResponse
  );
  AddBoneRotation("UpperArmL",
    -0.105 * FrontBrace * LeftWeight * ArmResponse,
    SideBrace * -0.030 * ArmResponse,
    0.060 * Recoil * LeftWeight * ArmResponse
  );
  AddBoneRotation("UpperArmR",
    -0.105 * FrontBrace * RightWeight * ArmResponse,
    SideBrace * -0.030 * ArmResponse,
    -0.060 * Recoil * RightWeight * ArmResponse
  );
  AddBoneRotation("LowerArmL", -0.090 * FrontBrace * LeftWeight * ArmResponse, 0, 0);
  AddBoneRotation("LowerArmR", -0.090 * FrontBrace * RightWeight * ArmResponse, 0, 0);

  AddBoneRotation("Chest", EffortAbs * -0.018 * UpperResponse, Effort * 0.018 * UpperResponse, Effort * 0.025 * UpperResponse);
  AddBoneRotation("ShoulderL", Math.max(0, Effort) * -0.035 * ArmResponse, 0, Effort * 0.020 * ArmResponse);
  AddBoneRotation("ShoulderR", Math.max(0, -Effort) * -0.035 * ArmResponse, 0, Effort * 0.020 * ArmResponse);
}

function ApplyFirstPersonLookOverlay() {
  if (State.ThirdPerson) return;

  const Yaw = State.FirstPersonHeadYaw;
  const Pitch = State.FirstPersonHeadPitch;

  // Distribute free-look through the upper chain. The root stays physically
  // still until the head-turn cone is exceeded.
  AddBoneRotation("Torso", 0, Yaw * 0.08, 0);
  AddBoneRotation("Chest", -Pitch * 0.07, Yaw * 0.16, 0);
  AddBoneRotation("Neck", -Pitch * 0.34, Yaw * 0.46, 0);
  AddBoneRotation("Head", -Pitch * 0.30, Yaw * 0.30, 0);
}

function ApplyProceduralOverlay(Delta) {
  if (!State.Pivot) return;

  const Reaction = UpdatePhysicalContactReaction(Delta);
  const Move = State.MoveAmount * (1 - Reaction * 0.74);
  const Sprint = State.Sprinting ? 1 : 0;
  const Swing = Math.sin(State.Phase);
  const AccelLean = THREE.MathUtils.clamp(State.SmoothedAcceleration * 0.008, -0.045, 0.045);
  const TurnLean = THREE.MathUtils.clamp(State.TurnRate * 0.025, -0.075, 0.075) * Move;
  const StrafeLean = State.LocalStrafe * 0.052 * Move;
  const ForwardLean = (0.012 + Sprint * 0.038) * Move + AccelLean;
  const CounterSwing = Swing * 0.018 * Move;

  AddBoneRotation("Hips", ForwardLean * 0.15, -CounterSwing * 0.35, -StrafeLean * 0.40 - TurnLean * 0.25);
  AddBoneRotation("Abdomen", ForwardLean * 0.42, CounterSwing * 0.35, StrafeLean * 0.24 + TurnLean * 0.22);
  AddBoneRotation("Torso", ForwardLean * 0.34, -CounterSwing * 0.55, StrafeLean * 0.32 + TurnLean * 0.30);
  AddBoneRotation("Chest", ForwardLean * 0.18, CounterSwing * 0.75, -StrafeLean * 0.18 - TurnLean * 0.28);
  AddBoneRotation("Neck", -ForwardLean * 0.14, -TurnLean * 0.20, 0);

  AddBoneRotation("ShoulderL", -Swing * 0.025 * Move, 0, 0.012 + StrafeLean * 0.08);
  AddBoneRotation("ShoulderR", Swing * 0.025 * Move, 0, -0.012 + StrafeLean * 0.08);
  AddBoneRotation("UpperArmL", -Swing * 0.050 * Move - Sprint * 0.025, 0, 0.018);
  AddBoneRotation("UpperArmR", Swing * 0.050 * Move - Sprint * 0.025, 0, -0.018);

  AddBoneRotation("UpperLegL", 0, State.LocalStrafe * 0.020 * Move, -State.LocalStrafe * 0.030 * Move);
  AddBoneRotation("UpperLegR", 0, State.LocalStrafe * 0.020 * Move, -State.LocalStrafe * 0.030 * Move);
  AddBoneRotation("FootL", 0, 0, State.LocalStrafe * 0.014 * Move);
  AddBoneRotation("FootR", 0, 0, State.LocalStrafe * 0.014 * Move);

  ApplyPhysicalContactReaction(Reaction);
  ApplyFirstPersonLookOverlay();

  ApplyCarpetStepOverlay(Delta);
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


function ClampFirstPersonTargetToContacts(Target, Start) {
  if (!State.Scene || !Start?.isVector3 || !Target?.isVector3) return Target;
  if (typeof Collision?.ResolveRaycastCapsuleSegment !== "function") return Target;

  const Result = Collision.ResolveRaycastCapsuleSegment(
    Start,
    Target,
    0.075,
    State.TempEnd,
    {
      Scene: State.Scene,
      Skin: ARM_WALL_GAP
    }
  );

  if (Result?.Hit && Result?.Solved) Target.copy(Result.Point);
  return Target;
}

function PoseFirstPersonArm(Side, Swing) {
  if (!State.Camera) return;
  const IsLeft = Side < 0;
  const Upper = IsLeft ? "UpperArmL" : "UpperArmR";
  const Lower = IsLeft ? "LowerArmL" : "LowerArmR";
  const Wrist = IsLeft ? "WristL" : "WristR";
  const Shoulder = IsLeft ? "ShoulderL" : "ShoulderR";

  UpdateCameraBasis();

  const Move = State.MoveAmount;
  const Sprint = State.Sprinting ? 1 : 0;
  const ArmSwing = (IsLeft ? Swing : -Swing) * Move;

  const WristSide = Side * THREE.MathUtils.lerp(0.27, Sprint ? 0.09 : 0.11, Move);
  const ElbowSide = Side * THREE.MathUtils.lerp(0.24, Sprint ? 0.14 : 0.16, Move);
  const WristForward = THREE.MathUtils.lerp(0.41, Sprint ? 0.54 : 0.50, Move) + ArmSwing * 0.095;
  const ElbowForward = THREE.MathUtils.lerp(0.26, Sprint ? 0.34 : 0.31, Move) + ArmSwing * 0.036;
  const WristDown = THREE.MathUtils.lerp(0.28, Sprint ? 0.09 : 0.11, Move) + Math.abs(ArmSwing) * 0.018;
  const ElbowDown = THREE.MathUtils.lerp(0.23, Sprint ? 0.12 : 0.14, Move);

  AddBoneRotation(Shoulder, -0.025 * Move, Side * -0.025 * Move, Side * -0.045 * Move);
  State.Pivot?.updateMatrixWorld(true);

  State.TempElbowTarget.copy(State.Camera.position)
    .addScaledVector(State.TempViewForward, ElbowForward)
    .addScaledVector(State.TempViewRight, ElbowSide)
    .addScaledVector(State.TempViewUp, -ElbowDown);

  State.TempWristTarget.copy(State.Camera.position)
    .addScaledVector(State.TempViewForward, WristForward)
    .addScaledVector(State.TempViewRight, WristSide)
    .addScaledVector(State.TempViewUp, -WristDown);

  const UpperBone = State.Bones.get(Upper);
  const LowerBone = State.Bones.get(Lower);

  if (UpperBone) {
    UpperBone.getWorldPosition(State.TempStart);
    ClampFirstPersonTargetToContacts(State.TempElbowTarget, State.TempStart);
  }
  RotateBoneToward(Upper, Lower, State.TempElbowTarget);

  State.Pivot?.updateMatrixWorld(true);
  if (LowerBone) {
    LowerBone.getWorldPosition(State.TempStart);
    ClampFirstPersonTargetToContacts(State.TempWristTarget, State.TempStart);
  }
  RotateBoneToward(Lower, Wrist, State.TempWristTarget);
}

function ApplyFirstPersonArms() {
  const Swing = Math.sin(State.Phase);
  PoseFirstPersonArm(-1, Swing);
  PoseFirstPersonArm(1, Swing);
}

function CameraDistance(Target, Desired) {
  const SegmentLength = Math.max(Target.distanceTo(Desired), 0.001);
  if (!State.Scene || typeof Collision?.RaycastVisibleSegment !== "function") return SegmentLength;

  const Hit = Collision.RaycastVisibleSegment(Target, Desired, {
    Scene: State.Scene,
    Center: Target,
    Range: SegmentLength + 1.2,
    Mode: "camera"
  });
  if (!Hit) return SegmentLength;

  return Math.max(0.36, Hit.Distance - CAMERA_PADDING);
}

function RenderThirdPerson(Renderer, Scene, Camera) {
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
  State.SavedCameraPosition.copy(Camera.position);

  // Render from the approximate face/eye position instead of the body
  // centerline. Physical movement/collision still uses the original position.
  State.TempForward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  State.TempForward.y = 0;
  if (State.TempForward.lengthSq() <= 0.000001) {
    State.TempForward.set(
      Math.sin(State.Pivot?.rotation.y || 0),
      0,
      Math.cos(State.Pivot?.rotation.y || 0)
    );
  } else {
    State.TempForward.normalize();
  }

  Camera.position.addScaledVector(State.TempForward, FIRST_PERSON_FACE_OFFSET);
  Camera.position.y += FIRST_PERSON_EYE_LIFT;
  Camera.updateMatrixWorld(true);

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
    Camera.position.copy(State.SavedCameraPosition);
    Camera.updateMatrixWorld(true);

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
  UpdateThirdPersonOrbit(Delta);
  UpdateMotion(Delta);
  UpdateStamina(Delta);
  UpdateCharacterFacing(Delta);
  ApplyInputMode();

  SaveAnimatedPose();
  if (State.Pivot) State.SavedRenderPivotPosition.copy(State.Pivot.position);

  try {
    ApplyProceduralOverlay(Delta);
    if (State.ThirdPerson) RenderThirdPerson(Renderer, Scene, Camera);
    else RenderFirstPerson(Renderer, Scene, Camera);
  } finally {
    RestoreAnimatedPose();
    if (State.Pivot) {
      State.Pivot.position.copy(State.SavedRenderPivotPosition);
      State.Pivot.updateMatrixWorld(true);
    }
  }
}

function GetMovementSpeed(WantsSprint, Moving) {
  State.WantsSprint = Boolean(WantsSprint);
  State.Moving = Boolean(Moving);
  State.Sprinting = State.WantsSprint && State.Moving && !State.Exhausted && State.Stamina > 0.01;

  // Input stays alive while a contact constraint resists the body.
  // The force manifold removes only illegal inward displacement.
  BasePlayer.GetMovementSpeed?.(false, State.Moving);
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
    ReadThirdPersonOrbit();

    if (Controls) {
      CaptureControls(Controls);
      Controls.enabled = true;
      Controls.isLocked = true;
      Controls.pointerSpeed = 0;
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
  State.OrbitReady = false;
  ApplyInputMode();
});

addEventListener("blur", () => {
  State.OrbitHeld = false;
  State.OrbitReady = false;
});

document.addEventListener("mousemove", Event => {
  if (!State.ThirdPerson || !State.OrbitHeld) return;
  if (!State.OrbitReady && !ReadThirdPersonOrbit()) return;

  const Scale = 0.00185 * CameraSensitivity();
  State.OrbitTargetYaw -= Event.movementX * Scale;
  State.OrbitTargetPitch -= Event.movementY * Scale;
  State.OrbitTargetPitch = THREE.MathUtils.clamp(State.OrbitTargetPitch, -1.12, 1.08);

  Event.preventDefault();
  Event.stopImmediatePropagation();
}, true);

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

window.__STORE_PLAYER_SYSTEM_BUILD__ = "V0.35.14-LATCHED-EDGE";
