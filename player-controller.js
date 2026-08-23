import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const PLAYER_MODEL_URL = "https://raw.githubusercontent.com/Seyamalam/blood-league-kickoff/aa02a4e6d8337a0604d2da131bcbbeb1f01badf0/public/assets/vendor/quaternius/night-striker.glb";
const PLAYER_HEIGHT = 1.78;
const WALK_SPEED = 3.55;
const SPRINT_SPEED = 5.6;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 24;
const STAMINA_REGEN = 17;
const STAMINA_REGEN_DELAY = 0.72;
const STAMINA_RECOVER_THRESHOLD = 24;
const MAX_CAMERA_DISTANCE = 5.25;

const State = {
  Scene: null,
  Camera: null,
  CharacterPivot: null,
  CharacterModel: null,
  OriginalMeshes: [],
  ArmMeshes: [],
  Bones: new Map(),
  BaseBoneQuaternions: new Map(),
  Input: new Set(),
  Stamina: STAMINA_MAX,
  Exhausted: false,
  LastSprintAt: -Infinity,
  AnimationPhase: 0,
  LastFrameAt: performance.now(),
  ZoomTarget: 0,
  ZoomDistance: 0,
  MouseSwayX: 0,
  MouseSwayY: 0,
  SmoothedSwayX: 0,
  SmoothedSwayY: 0,
  CharacterReady: false,
  LoadingCharacter: false,
  RestoreQueued: false,
  SavedCameraPosition: new THREE.Vector3(),
  Direction: new THREE.Vector3(),
  HorizontalDirection: new THREE.Vector3(),
  TempQuaternion: new THREE.Quaternion(),
  TempEuler: new THREE.Euler()
};

const Loader = new GLTFLoader();

function IsMovementHeld() {
  return State.Input.has("KeyW") || State.Input.has("KeyA") || State.Input.has("KeyS") || State.Input.has("KeyD");
}

function IsSprintHeld() {
  return State.Input.has("ShiftLeft") || State.Input.has("ShiftRight");
}

function IsGameplayActive() {
  return Boolean(document.pointerLockElement) && !document.getElementById("Hud")?.classList.contains("Hidden");
}

function CanSprint() {
  return !State.Exhausted && State.Stamina > 0.01;
}

function IsSprinting() {
  return IsGameplayActive() && IsMovementHeld() && IsSprintHeld() && CanSprint();
}

function MovementScale() {
  if (!IsSprintHeld()) return 1;
  return CanSprint() ? 1 : WALK_SPEED / SPRINT_SPEED;
}

const OriginalMoveForward = PointerLockControls.prototype.moveForward;
const OriginalMoveRight = PointerLockControls.prototype.moveRight;

PointerLockControls.prototype.moveForward = function(Distance) {
  return OriginalMoveForward.call(this, Distance * MovementScale());
};

PointerLockControls.prototype.moveRight = function(Distance) {
  return OriginalMoveRight.call(this, Distance * MovementScale());
};

function UpdateStaminaUi() {
  const Fill = document.getElementById("StaminaFill");
  const Value = document.getElementById("StaminaValue");
  const Wrap = document.getElementById("StaminaWrap");
  if (!Fill || !Value || !Wrap) return;

  const Percent = THREE.MathUtils.clamp(State.Stamina / STAMINA_MAX, 0, 1) * 100;
  Fill.style.width = `${Percent.toFixed(1)}%`;
  Value.textContent = `${Math.round(State.Stamina)}`;
  Wrap.classList.toggle("IsSprinting", IsSprinting());
  Wrap.classList.toggle("IsExhausted", State.Exhausted);
}

function UpdateCameraModeUi() {
  const Label = document.getElementById("CameraModeValue");
  if (!Label) return;
  Label.textContent = State.ZoomTarget < 0.15 ? "FIRST PERSON" : "THIRD PERSON";
}

function AddBone(Name, Model) {
  const Bone = Model.getObjectByName(Name);
  if (!Bone?.isBone) return;
  State.Bones.set(Name, Bone);
  State.BaseBoneQuaternions.set(Name, Bone.quaternion.clone());
}

function SetupBones(Model) {
  for (const Name of [
    "pelvis", "spine_01", "spine_02", "spine_03",
    "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
    "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
    "thigh_l", "calf_l", "foot_l",
    "thigh_r", "calf_r", "foot_r"
  ]) AddBone(Name, Model);
}

function ApplyBoneRotation(Name, X = 0, Y = 0, Z = 0) {
  const Bone = State.Bones.get(Name);
  const Base = State.BaseBoneQuaternions.get(Name);
  if (!Bone || !Base) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.copy(Base).multiply(State.TempQuaternion);
}

function ArmWeightForVertex(SkinIndex, SkinWeight, VertexIndex, ArmBoneIndices) {
  let Total = 0;
  const Offset = VertexIndex * SkinIndex.itemSize;
  for (let Slot = 0; Slot < SkinIndex.itemSize; Slot += 1) {
    const BoneIndex = SkinIndex.array[Offset + Slot];
    if (ArmBoneIndices.has(BoneIndex)) Total += SkinWeight.array[Offset + Slot] || 0;
  }
  return Total;
}

function BuildFirstPersonArms(Model) {
  const NewMeshes = [];

  Model.traverse(Object => {
    if (!Object.isMesh || Object.userData.IsFirstPersonArms) return;
    State.OriginalMeshes.push(Object);

    if (!Object.isSkinnedMesh || !Object.skeleton || !Object.geometry) return;
    const SkinIndex = Object.geometry.getAttribute("skinIndex");
    const SkinWeight = Object.geometry.getAttribute("skinWeight");
    const Position = Object.geometry.getAttribute("position");
    if (!SkinIndex || !SkinWeight || !Position) return;

    const ArmBoneIndices = new Set();
    for (let BoneIndex = 0; BoneIndex < Object.skeleton.bones.length; BoneIndex += 1) {
      const Name = Object.skeleton.bones[BoneIndex]?.name || "";
      if (
        Name.includes("clavicle_l") || Name.includes("upperarm_l") || Name.includes("lowerarm_l") || Name.includes("hand_l") ||
        Name.includes("clavicle_r") || Name.includes("upperarm_r") || Name.includes("lowerarm_r") || Name.includes("hand_r") ||
        Name.includes("thumb_") || Name.includes("index_") || Name.includes("middle_") || Name.includes("ring_") || Name.includes("pinky_")
      ) ArmBoneIndices.add(BoneIndex);
    }
    if (!ArmBoneIndices.size) return;

    const SourceIndex = Object.geometry.index;
    const TriangleCount = SourceIndex ? SourceIndex.count / 3 : Position.count / 3;
    const KeptIndices = [];

    for (let Triangle = 0; Triangle < TriangleCount; Triangle += 1) {
      const A = SourceIndex ? SourceIndex.getX(Triangle * 3) : Triangle * 3;
      const B = SourceIndex ? SourceIndex.getX(Triangle * 3 + 1) : Triangle * 3 + 1;
      const C = SourceIndex ? SourceIndex.getX(Triangle * 3 + 2) : Triangle * 3 + 2;
      const Wa = ArmWeightForVertex(SkinIndex, SkinWeight, A, ArmBoneIndices);
      const Wb = ArmWeightForVertex(SkinIndex, SkinWeight, B, ArmBoneIndices);
      const Wc = ArmWeightForVertex(SkinIndex, SkinWeight, C, ArmBoneIndices);
      const StrongVertices = Number(Wa > 0.42) + Number(Wb > 0.42) + Number(Wc > 0.42);
      if (StrongVertices >= 2 && Wa + Wb + Wc > 1.25) KeptIndices.push(A, B, C);
    }

    if (KeptIndices.length < 12) return;

    const Geometry = Object.geometry.clone();
    Geometry.setIndex(KeptIndices);
    Geometry.clearGroups();
    Geometry.computeBoundingSphere();

    const Material = Array.isArray(Object.material) ? Object.material[0] : Object.material;
    const Arms = new THREE.SkinnedMesh(Geometry, Material);
    Arms.name = `${Object.name || "Player"}_FirstPersonArms`;
    Arms.userData.IsFirstPersonArms = true;
    Arms.bindMode = Object.bindMode;
    Arms.bind(Object.skeleton, Object.bindMatrix);
    Arms.bindMatrixInverse.copy(Object.bindMatrixInverse);
    Arms.position.copy(Object.position);
    Arms.quaternion.copy(Object.quaternion);
    Arms.scale.copy(Object.scale);
    Arms.frustumCulled = false;
    Arms.renderOrder = 3;
    NewMeshes.push([Object.parent, Arms]);
  });

  for (const [Parent, Arms] of NewMeshes) {
    Parent.add(Arms);
    State.ArmMeshes.push(Arms);
  }
}

function SetFirstPersonVisibility(IsFirstPerson) {
  for (const Mesh of State.OriginalMeshes) Mesh.visible = !IsFirstPerson;
  for (const Arms of State.ArmMeshes) Arms.visible = IsFirstPerson;
}

async function LoadPlayerCharacter() {
  if (State.LoadingCharacter || State.CharacterReady || !State.Scene) return;
  State.LoadingCharacter = true;

  const Status = document.getElementById("BootStatus");
  const PreviousStatus = Status?.textContent || "";
  if (Status) Status.textContent = "Loading player body...";

  try {
    const Gltf = await Loader.loadAsync(PLAYER_MODEL_URL);
    const Model = Gltf.scene;
    Model.updateMatrixWorld(true);

    const RawBounds = new THREE.Box3().setFromObject(Model);
    const RawSize = RawBounds.getSize(new THREE.Vector3());
    const Scale = PLAYER_HEIGHT / Math.max(RawSize.y, 0.001);
    Model.scale.setScalar(Scale);
    Model.updateMatrixWorld(true);

    const Bounds = new THREE.Box3().setFromObject(Model);
    const Center = Bounds.getCenter(new THREE.Vector3());
    Model.position.x -= Center.x;
    Model.position.z -= Center.z;
    Model.updateMatrixWorld(true);
    const Grounded = new THREE.Box3().setFromObject(Model);
    Model.position.y -= Grounded.min.y;

    Model.traverse(Object => {
      if (!Object.isMesh) return;
      Object.castShadow = false;
      Object.receiveShadow = false;
      const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
      for (const Material of Materials) {
        if (!Material) continue;
        Material.side = THREE.FrontSide;
        Material.needsUpdate = true;
      }
    });

    SetupBones(Model);
    BuildFirstPersonArms(Model);

    const Pivot = new THREE.Group();
    Pivot.name = "PlayerCharacterPivot";
    Pivot.add(Model);
    State.Scene.add(Pivot);

    State.CharacterPivot = Pivot;
    State.CharacterModel = Model;
    State.CharacterReady = true;
    SetFirstPersonVisibility(true);

    if (Status && Status.textContent === "Loading player body...") Status.textContent = PreviousStatus || "Player ready.";
  } catch (Error) {
    console.error("Player model failed to load", Error);
    if (Status) Status.textContent = "Store ready — player model failed to load.";
  } finally {
    State.LoadingCharacter = false;
  }
}

function UpdateCharacterTransform(Camera) {
  if (!State.CharacterReady || !State.CharacterPivot) return;
  State.CharacterPivot.position.set(Camera.position.x, 0, Camera.position.z);
  Camera.getWorldDirection(State.Direction);
  State.Direction.y = 0;
  if (State.Direction.lengthSq() > 0.0001) {
    State.Direction.normalize();
    State.CharacterPivot.rotation.y = Math.atan2(State.Direction.x, State.Direction.z);
  }
}

function UpdatePose(Delta, Time) {
  if (!State.CharacterReady) return;

  const Moving = IsGameplayActive() && IsMovementHeld();
  const Sprinting = IsSprinting();
  const FirstPerson = State.ZoomDistance < 0.18;
  const SpeedFactor = Sprinting ? 1.42 : 1;
  const TargetPhaseSpeed = Moving ? (Sprinting ? 11.5 : 7.4) : 1.6;
  State.AnimationPhase += Delta * TargetPhaseSpeed;

  const Swing = Moving ? Math.sin(State.AnimationPhase) : 0;
  const Bob = Moving ? Math.abs(Math.sin(State.AnimationPhase * 2)) : Math.sin(Time * 1.8) * 0.12;
  const LegAmount = Moving ? (Sprinting ? 0.78 : 0.48) : 0;
  const ArmAmount = Moving ? (Sprinting ? 0.72 : 0.42) : 0.05;

  State.SmoothedSwayX = THREE.MathUtils.lerp(State.SmoothedSwayX, State.MouseSwayX, 1 - Math.exp(-Delta * 12));
  State.SmoothedSwayY = THREE.MathUtils.lerp(State.SmoothedSwayY, State.MouseSwayY, 1 - Math.exp(-Delta * 12));
  State.MouseSwayX *= Math.exp(-Delta * 8);
  State.MouseSwayY *= Math.exp(-Delta * 8);

  ApplyBoneRotation("pelvis", Moving ? Bob * 0.012 : 0, Moving ? Swing * 0.018 : 0, Moving ? Swing * 0.012 : 0);
  ApplyBoneRotation("spine_01", Sprinting ? 0.07 : 0.015, 0, State.SmoothedSwayX * 0.13);
  ApplyBoneRotation("spine_02", Sprinting ? 0.08 : 0.02, State.SmoothedSwayX * 0.08, 0);
  ApplyBoneRotation("spine_03", Sprinting ? 0.05 : 0.01, State.SmoothedSwayX * 0.06, 0);

  ApplyBoneRotation("thigh_l", Swing * LegAmount, 0, 0);
  ApplyBoneRotation("thigh_r", -Swing * LegAmount, 0, 0);
  ApplyBoneRotation("calf_l", Math.max(0, -Swing) * LegAmount * 0.62, 0, 0);
  ApplyBoneRotation("calf_r", Math.max(0, Swing) * LegAmount * 0.62, 0, 0);
  ApplyBoneRotation("foot_l", -Math.max(0, -Swing) * LegAmount * 0.18, 0, 0);
  ApplyBoneRotation("foot_r", -Math.max(0, Swing) * LegAmount * 0.18, 0, 0);

  const FirstPersonLift = FirstPerson ? -0.34 : 0;
  const FirstPersonSpread = FirstPerson ? 0.07 : 0;
  const MousePitch = FirstPerson ? State.SmoothedSwayY * 0.32 : 0;
  const MouseYaw = FirstPerson ? State.SmoothedSwayX * 0.22 : 0;

  ApplyBoneRotation("clavicle_l", FirstPerson ? 0.03 : 0, MouseYaw, FirstPersonSpread);
  ApplyBoneRotation("clavicle_r", FirstPerson ? 0.03 : 0, MouseYaw, -FirstPersonSpread);
  ApplyBoneRotation("upperarm_l", FirstPersonLift - Swing * ArmAmount, MouseYaw, FirstPerson ? -0.06 : 0);
  ApplyBoneRotation("upperarm_r", FirstPersonLift + Swing * ArmAmount, MouseYaw, FirstPerson ? 0.06 : 0);
  ApplyBoneRotation("lowerarm_l", FirstPerson ? -0.18 + Math.abs(Swing) * 0.08 * SpeedFactor + MousePitch : Math.max(0, Swing) * 0.16, 0, 0);
  ApplyBoneRotation("lowerarm_r", FirstPerson ? -0.18 + Math.abs(Swing) * 0.08 * SpeedFactor + MousePitch : Math.max(0, -Swing) * 0.16, 0, 0);
  ApplyBoneRotation("hand_l", FirstPerson ? MouseYaw * 0.35 : 0, 0, Moving ? -Swing * 0.04 : 0);
  ApplyBoneRotation("hand_r", FirstPerson ? MouseYaw * 0.35 : 0, 0, Moving ? Swing * 0.04 : 0);

  SetFirstPersonVisibility(FirstPerson);
}

function UpdateStamina(Delta, Time) {
  const Sprinting = IsSprinting();
  if (Sprinting) {
    State.Stamina = Math.max(0, State.Stamina - STAMINA_DRAIN * Delta);
    State.LastSprintAt = Time;
    if (State.Stamina <= 0.01) State.Exhausted = true;
  } else if (Time - State.LastSprintAt >= STAMINA_REGEN_DELAY) {
    State.Stamina = Math.min(STAMINA_MAX, State.Stamina + STAMINA_REGEN * Delta);
  }

  if (State.Exhausted && State.Stamina >= STAMINA_RECOVER_THRESHOLD) State.Exhausted = false;
  UpdateStaminaUi();
}

function UpdateZoom(Delta) {
  State.ZoomDistance = THREE.MathUtils.damp(State.ZoomDistance, State.ZoomTarget, 10, Delta);
  if (Math.abs(State.ZoomDistance - State.ZoomTarget) < 0.004) State.ZoomDistance = State.ZoomTarget;
  UpdateCameraModeUi();
}

function InstallSceneRenderHook(Scene) {
  const Existing = Scene.onBeforeRender;
  Scene.onBeforeRender = function(Renderer, CurrentScene, Camera, Geometry, Material, Group) {
    if (typeof Existing === "function") Existing.call(this, Renderer, CurrentScene, Camera, Geometry, Material, Group);

    State.Camera = Camera;
    UpdateCharacterTransform(Camera);

    if (State.ZoomDistance <= 0.04) return;

    State.SavedCameraPosition.copy(Camera.position);
    Camera.getWorldDirection(State.HorizontalDirection);
    State.HorizontalDirection.y = 0;
    if (State.HorizontalDirection.lengthSq() < 0.0001) State.HorizontalDirection.set(0, 0, -1);
    State.HorizontalDirection.normalize();

    Camera.position.addScaledVector(State.HorizontalDirection, -State.ZoomDistance);
    Camera.position.y += 0.30 + State.ZoomDistance * 0.035;
    Camera.updateMatrixWorld(true);

    if (!State.RestoreQueued) {
      State.RestoreQueued = true;
      queueMicrotask(() => {
        if (State.Camera) {
          State.Camera.position.copy(State.SavedCameraPosition);
          State.Camera.updateMatrixWorld(true);
        }
        State.RestoreQueued = false;
      });
    }
  };
}

function InitializeForScene(Scene) {
  if (State.Scene) return;
  State.Scene = Scene;
  InstallSceneRenderHook(Scene);
  LoadPlayerCharacter();
}

const PreviousSceneAdd = THREE.Scene.prototype.add;
THREE.Scene.prototype.add = function(...Objects) {
  const Result = PreviousSceneAdd.apply(this, Objects);
  if (!State.Scene && this.isScene) queueMicrotask(() => InitializeForScene(this));
  return Result;
};

document.addEventListener("keydown", Event => {
  State.Input.add(Event.code);
  if (Event.code === "KeyV" && !Event.repeat) {
    State.ZoomTarget = State.ZoomTarget < 0.15 ? 3.6 : 0;
    UpdateCameraModeUi();
  }
});

document.addEventListener("keyup", Event => State.Input.delete(Event.code));
window.addEventListener("blur", () => State.Input.clear());

document.addEventListener("mousemove", Event => {
  if (!document.pointerLockElement) return;
  State.MouseSwayX = THREE.MathUtils.clamp(State.MouseSwayX + Event.movementX * 0.00055, -0.18, 0.18);
  State.MouseSwayY = THREE.MathUtils.clamp(State.MouseSwayY + Event.movementY * 0.00045, -0.14, 0.14);
});

document.addEventListener("wheel", Event => {
  if (!document.pointerLockElement) return;
  const Step = Math.sign(Event.deltaY) * 0.72;
  State.ZoomTarget = THREE.MathUtils.clamp(State.ZoomTarget + Step, 0, MAX_CAMERA_DISTANCE);
  if (State.ZoomTarget < 0.28) State.ZoomTarget = 0;
  UpdateCameraModeUi();
}, { passive: true });

function ControllerFrame(Now) {
  const Delta = Math.min((Now - State.LastFrameAt) / 1000, 0.05);
  State.LastFrameAt = Now;
  const Time = Now / 1000;
  UpdateStamina(Delta, Time);
  UpdateZoom(Delta);
  UpdatePose(Delta, Time);
  requestAnimationFrame(ControllerFrame);
}

requestAnimationFrame(ControllerFrame);
window.__STORE_PLAYER_CONTROLLER_BUILD__ = "V0.07";
