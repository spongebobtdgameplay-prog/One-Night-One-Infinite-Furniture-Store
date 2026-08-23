import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;

if (!BasePlayer) throw new Error("Player controller must load before player polish.");

const THIRD_PERSON_DEFAULT = 3.2;
const THIRD_PERSON_MIN = 0.9;
const THIRD_PERSON_MAX = 4.25;
const ZOOM_STEP = 0.4;
const ZOOM_RESPONSIVENESS = 17;
const CAMERA_TARGET_HEIGHT = 1.28;
const CAMERA_HEIGHT = 0.16;
const CAMERA_SHOULDER = 0.22;
const CAMERA_PITCH_LIMIT = 0.68;

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
  PendingThirdPersonAnchor: false,
  BodyMeshes: [],
  ArmMeshes: [],
  MeshCount: -1,
  SavedBones: new Map(),
  TempDirection: new THREE.Vector3(),
  TempHorizontal: new THREE.Vector3(),
  TempRight: new THREE.Vector3(),
  TempTarget: new THREE.Vector3(),
  TempDesired: new THREE.Vector3(),
  TempOffset: new THREE.Vector3(),
  SavedCameraPosition: new THREE.Vector3(),
  SavedCameraQuaternion: new THREE.Quaternion(),
  SavedPivotPosition: new THREE.Vector3(),
  SavedPivotQuaternion: new THREE.Quaternion(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion()
};

function IsGameplayActive() {
  return Boolean(document.pointerLockElement) && !document.getElementById("Hud")?.classList.contains("Hidden");
}

function IsThirdPerson() {
  return State.ZoomTarget >= THIRD_PERSON_MIN;
}

function StartThirdPerson() {
  State.PendingThirdPersonAnchor = true;
  if (State.Zoom < THIRD_PERSON_MIN) State.Zoom = THIRD_PERSON_MIN;
}

function RestoreBaseThirdPersonIfNeeded() {
  if (!IsThirdPerson() || BasePlayer.IsThirdPerson?.()) return;
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: 1, bubbles: false, cancelable: true }));
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

function SetViewVisibility(ThirdPerson) {
  for (const Mesh of State.BodyMeshes) Mesh.visible = ThirdPerson;
  for (const Mesh of State.ArmMeshes) Mesh.visible = !ThirdPerson;
}

function SaveBone(Name) {
  if (!State.Pivot) return null;
  const Bone = State.Pivot.getObjectByName(Name);
  if (!Bone?.isBone) return null;
  if (!State.SavedBones.has(Bone)) State.SavedBones.set(Bone, Bone.quaternion.clone());
  return Bone;
}

function RotateBone(Name, X = 0, Y = 0, Z = 0) {
  const Bone = SaveBone(Name);
  if (!Bone) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion);
}

function RestoreBones() {
  for (const [Bone, Quaternion] of State.SavedBones) Bone.quaternion.copy(Quaternion);
  State.SavedBones.clear();
}

function ApplySecondaryAnimation(Delta, Time, ThirdPerson) {
  State.Phase += Delta * (State.Moving ? (State.Sprinting ? 11.2 : 7.4) : 1.35);
  const Swing = State.Moving ? Math.sin(State.Phase) : 0;
  const Opposite = State.Moving ? Math.sin(State.Phase + Math.PI) : 0;
  const StepBob = State.Moving ? Math.sin(State.Phase * 2) : 0;
  const Breath = Math.sin(Time * 1.75);

  if (ThirdPerson) {
    const ArmAmount = State.Sprinting ? 0.15 : 0.095;
    const TorsoAmount = State.Sprinting ? 0.045 : 0.025;
    RotateBone("Hips", Breath * 0.004 + StepBob * 0.008, Swing * 0.018, StepBob * 0.018);
    RotateBone("Abdomen", State.Sprinting ? 0.025 : 0.008, -Swing * TorsoAmount, -StepBob * 0.012);
    RotateBone("Torso", Breath * 0.009, Swing * TorsoAmount * 0.72, StepBob * 0.009);
    RotateBone("Chest", Breath * 0.006, -Swing * TorsoAmount * 0.45, -StepBob * 0.007);
    RotateBone("Neck", -Breath * 0.004, Swing * 0.008, -StepBob * 0.004);
    RotateBone("Shoulder.L", 0, Swing * 0.012, StepBob * 0.012);
    RotateBone("Shoulder.R", 0, Opposite * 0.012, -StepBob * 0.012);
    RotateBone("UpperArm.L", -Swing * ArmAmount, 0, 0);
    RotateBone("UpperArm.R", -Opposite * ArmAmount, 0, 0);
    RotateBone("LowerArm.L", Math.max(0, -Swing) * 0.045, 0, 0);
    RotateBone("LowerArm.R", Math.max(0, -Opposite) * 0.045, 0, 0);
    return;
  }

  const FirstPersonSwing = State.Moving ? 0.12 : 0.018;
  const SprintLift = State.Sprinting ? 0.065 : 0;
  RotateBone("Shoulder.L", Breath * 0.006 + StepBob * 0.008, Swing * 0.018, 0.025 + StepBob * 0.018);
  RotateBone("Shoulder.R", Breath * 0.006 - StepBob * 0.008, Opposite * 0.018, -0.025 - StepBob * 0.018);
  RotateBone("UpperArm.L", -SprintLift - Swing * FirstPersonSwing, 0.018, 0.022);
  RotateBone("UpperArm.R", -SprintLift - Opposite * FirstPersonSwing, -0.018, -0.022);
  RotateBone("LowerArm.L", -0.035 + Math.max(0, -Swing) * 0.075, 0, StepBob * 0.012);
  RotateBone("LowerArm.R", -0.035 + Math.max(0, -Opposite) * 0.075, 0, -StepBob * 0.012);
  RotateBone("Wrist.L", StepBob * 0.025, Swing * 0.018, 0);
  RotateBone("Wrist.R", -StepBob * 0.025, Opposite * 0.018, 0);
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

function SaveArmTransforms() {
  const Saved = [];
  for (const Mesh of State.ArmMeshes) {
    Saved.push({ Mesh, Position: Mesh.position.clone(), Scale: Mesh.scale.clone() });
    Mesh.position.y += 0.055;
    Mesh.position.z += 0.16;
    Mesh.scale.multiplyScalar(1.045);
  }
  return Saved;
}

function RestoreArmTransforms(Saved) {
  for (const Entry of Saved) {
    Entry.Mesh.position.copy(Entry.Position);
    Entry.Mesh.scale.copy(Entry.Scale);
  }
}

function RenderFirstPerson(Renderer, Scene, Camera, Delta, Time) {
  SetViewVisibility(false);
  const SavedArmTransforms = SaveArmTransforms();
  if (State.Pivot) {
    State.SavedPivotPosition.copy(State.Pivot.position);
    State.SavedPivotQuaternion.copy(State.Pivot.quaternion);
    Camera.getWorldDirection(State.TempDirection);
    State.TempDirection.y = 0;
    if (State.TempDirection.lengthSq() > 0.0001) {
      State.TempDirection.normalize();
      State.Pivot.rotation.y = Math.atan2(State.TempDirection.x, State.TempDirection.z);
    }
  }
  ApplySecondaryAnimation(Delta, Time, false);
  Renderer.render(Scene, Camera);
  RestoreBones();
  RestoreArmTransforms(SavedArmTransforms);
  if (State.Pivot) {
    State.Pivot.position.copy(State.SavedPivotPosition);
    State.Pivot.quaternion.copy(State.SavedPivotQuaternion);
  }
}

function RenderThirdPerson(Renderer, Scene, Camera, Delta, Time) {
  SetViewVisibility(true);
  if (State.Pivot && State.PendingThirdPersonAnchor) {
    State.Pivot.position.set(Camera.position.x, 0, Camera.position.z);
    State.PendingThirdPersonAnchor = false;
  }

  ApplySecondaryAnimation(Delta, Time, true);
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
  RestoreBones();
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
  const Time = Now / 1000;
  UpdateZoom(Delta);
  RefreshCharacterReferences();
  if (!State.Pivot) {
    BasePlayer.Render(Renderer, Scene, Camera);
    return;
  }
  if (IsThirdPerson()) RenderThirdPerson(Renderer, Scene, Camera, Delta, Time);
  else RenderFirstPerson(Renderer, Scene, Camera, Delta, Time);
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
  const WasThirdPerson = IsThirdPerson();
  const Direction = Math.sign(Event.deltaY);
  if (!Direction) return;
  if (Direction > 0) {
    if (!WasThirdPerson) State.ZoomTarget = THIRD_PERSON_MIN;
    else State.ZoomTarget = Math.min(THIRD_PERSON_MAX, State.ZoomTarget + ZOOM_STEP);
  } else if (!WasThirdPerson) {
    State.ZoomTarget = 0;
  } else if (State.ZoomTarget <= THIRD_PERSON_MIN + 0.001) {
    State.ZoomTarget = 0;
  } else {
    State.ZoomTarget = Math.max(THIRD_PERSON_MIN, State.ZoomTarget - ZOOM_STEP);
  }
  if (!WasThirdPerson && IsThirdPerson()) StartThirdPerson();
  RestoreBaseThirdPersonIfNeeded();
}, { passive: false });

addEventListener("keydown", Event => {
  if (!Event.isTrusted || Event.code !== "KeyV" || Event.repeat) return;
  const WasThirdPerson = IsThirdPerson();
  State.ZoomTarget = WasThirdPerson ? 0 : THIRD_PERSON_DEFAULT;
  if (!WasThirdPerson) StartThirdPerson();
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

window.__STORE_PLAYER_POLISH_BUILD__ = "V0.12";
