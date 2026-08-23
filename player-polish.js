import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;

if (!BasePlayer) throw new Error("Player controller must load before player polish.");

const THIRD_PERSON_DEFAULT = 3.2;
const THIRD_PERSON_MIN = 0.9;
const THIRD_PERSON_MAX = 4.25;
const ZOOM_STEP = 0.4;
const ZOOM_RESPONSIVENESS = 18;
const CAMERA_TARGET_HEIGHT = 1.22;
const CAMERA_HEIGHT = 0.18;
const CAMERA_SHOULDER = 0.22;
const CAMERA_PITCH_LIMIT = 0.62;

const State = {
  Scene: null,
  Camera: null,
  Renderer: null,
  CollisionBoxes: null,
  Pivot: null,
  Moving: false,
  Sprinting: false,
  Zoom: 0,
  ZoomTarget: 0,
  Phase: 0,
  LastFrameAt: performance.now(),
  BodyMeshes: [],
  ArmMeshes: [],
  MeshCount: -1,
  TempDirection: new THREE.Vector3(),
  TempHorizontal: new THREE.Vector3(),
  TempRight: new THREE.Vector3(),
  TempTarget: new THREE.Vector3(),
  TempDesired: new THREE.Vector3(),
  TempOffset: new THREE.Vector3(),
  SavedCameraPosition: new THREE.Vector3(),
  SavedCameraQuaternion: new THREE.Quaternion(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion()
};

function IsGameplayActive() {
  return Boolean(document.pointerLockElement) && !document.getElementById("Hud")?.classList.contains("Hidden");
}

function IsThirdPerson() {
  return State.ZoomTarget >= THIRD_PERSON_MIN;
}

function SyncBaseMode() {
  const WantsThirdPerson = IsThirdPerson();
  for (let Attempt = 0; Attempt < 16 && Boolean(BasePlayer.IsThirdPerson?.()) !== WantsThirdPerson; Attempt += 1) {
    window.dispatchEvent(new WheelEvent("wheel", {
      deltaY: WantsThirdPerson ? 1 : -1,
      bubbles: false,
      cancelable: true
    }));
  }
}

function UpdateZoom(Delta) {
  if (!IsThirdPerson()) {
    State.Zoom = 0;
    return;
  }
  if (State.Zoom < THIRD_PERSON_MIN) State.Zoom = THIRD_PERSON_MIN;
  const Alpha = 1 - Math.exp(-Delta * ZOOM_RESPONSIVENESS);
  State.Zoom = THREE.MathUtils.lerp(State.Zoom, State.ZoomTarget, Alpha);
  if (Math.abs(State.Zoom - State.ZoomTarget) < 0.002) State.Zoom = State.ZoomTarget;
}

function RefreshCharacterReferences() {
  if (!State.Scene) return;
  const Pivot = State.Scene.getObjectByName("PlayerCharacterPivot");
  if (!Pivot) return;
  State.Pivot = Pivot;
  let Count = 0;
  Pivot.traverse(Object => {
    if (Object.isMesh) Count += 1;
  });
  if (Count === State.MeshCount) return;
  State.MeshCount = Count;
  State.BodyMeshes.length = 0;
  State.ArmMeshes.length = 0;
  Pivot.traverse(Object => {
    if (!Object.isMesh) return;
    if ((Object.name || "").endsWith("_FirstPersonArms")) State.ArmMeshes.push(Object);
    else State.BodyMeshes.push(Object);
  });
}

function SetThirdPersonVisibility() {
  for (const Mesh of State.BodyMeshes) Mesh.visible = true;
  for (const Mesh of State.ArmMeshes) Mesh.visible = false;
}

function FindBone(Name) {
  const Bone = State.Pivot?.getObjectByName(Name);
  return Bone?.isBone ? Bone : null;
}

function RotateSavedBone(SavedBones, Name, X = 0, Y = 0, Z = 0) {
  const Bone = FindBone(Name);
  if (!Bone) return;
  if (!SavedBones.has(Bone)) SavedBones.set(Bone, Bone.quaternion.clone());
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion);
}

function ApplyFirstPersonArmMotion(Delta, Time) {
  if (!State.Pivot) return new Map();
  State.Phase += Delta * (State.Moving ? (State.Sprinting ? 10.8 : 7.0) : 1.2);
  const Swing = State.Moving ? Math.sin(State.Phase) : 0;
  const Opposite = -Swing;
  const Step = State.Moving ? Math.sin(State.Phase * 2) : 0;
  const Breath = Math.sin(Time * 1.7);
  const SavedBones = new Map();
  const SwingAmount = State.Sprinting ? 0.09 : 0.055;
  const SprintLift = State.Sprinting ? 0.04 : 0;

  RotateSavedBone(SavedBones, "Shoulder.L", Breath * 0.004, 0, Step * 0.008);
  RotateSavedBone(SavedBones, "Shoulder.R", Breath * 0.004, 0, -Step * 0.008);
  RotateSavedBone(SavedBones, "UpperArm.L", -SprintLift + Swing * SwingAmount, 0, 0);
  RotateSavedBone(SavedBones, "UpperArm.R", -SprintLift + Opposite * SwingAmount, 0, 0);
  RotateSavedBone(SavedBones, "LowerArm.L", Math.max(0, -Swing) * 0.035, 0, 0);
  RotateSavedBone(SavedBones, "LowerArm.R", Math.max(0, -Opposite) * 0.035, 0, 0);
  RotateSavedBone(SavedBones, "Wrist.L", Step * 0.012, 0, 0);
  RotateSavedBone(SavedBones, "Wrist.R", -Step * 0.012, 0, 0);
  return SavedBones;
}

function RestoreBones(SavedBones) {
  for (const [Bone, Quaternion] of SavedBones) Bone.quaternion.copy(Quaternion);
}

function SegmentAabbDistance(Start, End, Bounds, Padding = 0.1) {
  State.TempOffset.copy(End).sub(Start);
  let TMin = 0;
  let TMax = 1;
  for (const Axis of ["x", "y", "z"]) {
    const Origin = Start[Axis];
    const Direction = State.TempOffset[Axis];
    const Min = Bounds.min[Axis] - Padding;
    const Max = Bounds.max[Axis] + Padding;
    if (Math.abs(Direction) < 1e-8) {
      if (Origin < Min || Origin > Max) return null;
      continue;
    }
    let A = (Min - Origin) / Direction;
    let B = (Max - Origin) / Direction;
    if (A > B) [A, B] = [B, A];
    TMin = Math.max(TMin, A);
    TMax = Math.min(TMax, B);
    if (TMin > TMax) return null;
  }
  return TMin;
}

function CameraDistance(Target, Desired) {
  const Collisions = State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];
  let Allowed = Target.distanceTo(Desired);
  const SegmentLength = Math.max(Allowed, 0.001);
  const MinX = Math.min(Target.x, Desired.x) - 0.3;
  const MaxX = Math.max(Target.x, Desired.x) + 0.3;
  const MinZ = Math.min(Target.z, Desired.z) - 0.3;
  const MaxZ = Math.max(Target.z, Desired.z) + 0.3;
  for (const Entry of Collisions) {
    if (Entry?.Type && !/Wall|Partition/i.test(Entry.Type)) continue;
    const Bounds = Entry?.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    if (Bounds.max.x < MinX || Bounds.min.x > MaxX || Bounds.max.z < MinZ || Bounds.min.z > MaxZ) continue;
    const T = SegmentAabbDistance(Target, Desired, Bounds);
    if (T === null) continue;
    Allowed = Math.min(Allowed, Math.max(0.48, T * SegmentLength - 0.14));
  }
  return Allowed;
}

function RenderThirdPerson(Renderer, Scene, Camera) {
  SetThirdPersonVisibility();
  State.SavedCameraPosition.copy(Camera.position);
  State.SavedCameraQuaternion.copy(Camera.quaternion);

  State.TempHorizontal.set(0, 0, -1).applyQuaternion(State.SavedCameraQuaternion);
  const Vertical = THREE.MathUtils.clamp(State.TempHorizontal.y, -CAMERA_PITCH_LIMIT, CAMERA_PITCH_LIMIT);
  State.TempHorizontal.y = 0;
  if (State.TempHorizontal.lengthSq() < 0.0001) State.TempHorizontal.set(0, 0, -1);
  State.TempHorizontal.normalize();
  const HorizontalScale = Math.sqrt(Math.max(0.0001, 1 - Vertical * Vertical));
  State.TempDirection.copy(State.TempHorizontal).multiplyScalar(HorizontalScale);
  State.TempDirection.y = Vertical;
  State.TempDirection.normalize();

  State.TempRight.set(1, 0, 0).applyQuaternion(State.SavedCameraQuaternion);
  State.TempRight.y = 0;
  if (State.TempRight.lengthSq() < 0.0001) State.TempRight.set(1, 0, 0);
  State.TempRight.normalize();

  State.TempTarget.set(State.SavedCameraPosition.x, CAMERA_TARGET_HEIGHT, State.SavedCameraPosition.z);
  State.TempDesired.copy(State.TempTarget)
    .addScaledVector(State.TempDirection, -Math.max(THIRD_PERSON_MIN, State.Zoom))
    .addScaledVector(State.TempRight, CAMERA_SHOULDER);
  State.TempDesired.y += CAMERA_HEIGHT;
  State.TempDesired.x = THREE.MathUtils.clamp(State.TempDesired.x, -16.55, 16.55);
  State.TempDesired.y = THREE.MathUtils.clamp(State.TempDesired.y, 0.36, 3.46);

  const Allowed = CameraDistance(State.TempTarget, State.TempDesired);
  State.TempOffset.copy(State.TempDesired).sub(State.TempTarget);
  if (State.TempOffset.lengthSq() > 0.0001) State.TempOffset.normalize().multiplyScalar(Allowed);
  Camera.position.copy(State.TempTarget).add(State.TempOffset);
  Camera.position.x = THREE.MathUtils.clamp(Camera.position.x, -16.55, 16.55);
  Camera.position.y = THREE.MathUtils.clamp(Camera.position.y, 0.36, 3.46);
  Camera.lookAt(State.TempTarget);
  Camera.updateMatrixWorld(true);
  Renderer.render(Scene, Camera);
  Camera.position.copy(State.SavedCameraPosition);
  Camera.quaternion.copy(State.SavedCameraQuaternion);
  Camera.updateMatrixWorld(true);
}

function Attach(Context) {
  State.Scene = Context.Scene;
  State.Camera = Context.Camera;
  State.Renderer = Context.Renderer;
  State.CollisionBoxes = Context.CollisionBoxes;
  BasePlayer.Attach(Context);
}

function Render(Renderer, Scene, Camera) {
  const Now = performance.now();
  const Delta = Math.min((Now - State.LastFrameAt) / 1000, 0.05);
  State.LastFrameAt = Now;
  UpdateZoom(Delta);
  RefreshCharacterReferences();

  if (!IsThirdPerson()) {
    const SavedBones = ApplyFirstPersonArmMotion(Delta, Now / 1000);
    BasePlayer.Render(Renderer, Scene, Camera);
    RestoreBones(SavedBones);
    return;
  }

  if (!State.Pivot) {
    BasePlayer.Render(Renderer, Scene, Camera);
    return;
  }

  RenderThirdPerson(Renderer, Scene, Camera);
}

function GetMovementSpeed(WantsSprint, Moving) {
  State.Moving = Boolean(Moving);
  const Speed = BasePlayer.GetMovementSpeed(WantsSprint, Moving);
  State.Sprinting = Boolean(BasePlayer.IsSprinting?.());
  return Speed;
}

function GetPlayerRadius() {
  return BasePlayer.GetPlayerRadius?.() ?? 0.48;
}

addEventListener("wheel", Event => {
  if (!Event.isTrusted || !IsGameplayActive()) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();
  const Direction = Math.sign(Event.deltaY);
  if (!Direction) return;
  if (Direction > 0) {
    if (!IsThirdPerson()) State.ZoomTarget = THIRD_PERSON_MIN;
    else State.ZoomTarget = Math.min(THIRD_PERSON_MAX, State.ZoomTarget + ZOOM_STEP);
  } else if (!IsThirdPerson() || State.ZoomTarget <= THIRD_PERSON_MIN + 0.001) {
    State.ZoomTarget = 0;
  } else {
    State.ZoomTarget = Math.max(THIRD_PERSON_MIN, State.ZoomTarget - ZOOM_STEP);
  }
  SyncBaseMode();
}, { capture: true, passive: false });

addEventListener("keydown", Event => {
  if (!Event.isTrusted || Event.code !== "KeyV" || Event.repeat) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();
  State.ZoomTarget = IsThirdPerson() ? 0 : THIRD_PERSON_DEFAULT;
  SyncBaseMode();
}, true);

window.__STORE_PLAYER__ = {
  Attach,
  Render,
  GetMovementSpeed,
  GetPlayerRadius,
  IsSprinting: () => State.Sprinting,
  GetStamina: () => BasePlayer.GetStamina?.() ?? 100,
  IsThirdPerson
};

window.__STORE_PLAYER_POLISH_BUILD__ = "V0.13";