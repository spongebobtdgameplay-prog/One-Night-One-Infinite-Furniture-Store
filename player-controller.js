import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const PLAYER_MODEL_URL = "https://raw.githubusercontent.com/euuuuuuan/fatal-funnel-public/main/packages/renderer/assets/models/quaternius-men/worker.glb";
const PLAYER_HEIGHT = 1.76;
const PLAYER_RADIUS = 0.48;
const WALK_SPEED = 3.45;
const SPRINT_SPEED = 5.35;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 22;
const STAMINA_REGEN = 18;
const STAMINA_REGEN_DELAY = 0.75;
const STAMINA_RECOVER_THRESHOLD = 24;
const THIRD_PERSON_DEFAULT = 3.2;
const THIRD_PERSON_MAX = 4.25;
const THIRD_PERSON_MIN = 1.35;
const CAMERA_SHOULDER = 0.22;
const CAMERA_HEIGHT = 0.18;
const CAMERA_TARGET_HEIGHT = 1.22;
const CAMERA_PITCH_LIMIT = 0.62;
const TURN_RESPONSIVENESS = 15;
const ZOOM_RESPONSIVENESS = 18;
const ARM_WEIGHT_THRESHOLD = 0.78;

const State = {
  Scene: null,
  Camera: null,
  Renderer: null,
  CollisionBoxes: null,
  Pivot: null,
  Model: null,
  BodyMeshes: [],
  ArmMeshes: [],
  Bones: new Map(),
  BaseBoneQuaternions: new Map(),
  Mixer: null,
  Actions: new Map(),
  ActiveAction: null,
  AnimationState: "",
  CharacterReady: false,
  Loading: false,
  Moving: false,
  WantsSprint: false,
  Sprinting: false,
  Stamina: STAMINA_MAX,
  Exhausted: false,
  LastSprintAt: -Infinity,
  Zoom: 0,
  ZoomTarget: 0,
  ManualPhase: 0,
  MouseSwayX: 0,
  MouseSwayY: 0,
  SmoothedSwayX: 0,
  SmoothedSwayY: 0,
  HasPlayerPosition: false,
  LastPlayerPosition: new THREE.Vector3(),
  LastFrameAt: performance.now(),
  TempDirection: new THREE.Vector3(),
  TempHorizontal: new THREE.Vector3(),
  TempRight: new THREE.Vector3(),
  TempTarget: new THREE.Vector3(),
  TempDesired: new THREE.Vector3(),
  TempOffset: new THREE.Vector3(),
  SavedPosition: new THREE.Vector3(),
  SavedQuaternion: new THREE.Quaternion(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion()
};

const Loader = new GLTFLoader();

function IsGameplayActive() {
  return Boolean(document.pointerLockElement) && !document.getElementById("Hud")?.classList.contains("Hidden");
}

function IsThirdPerson() {
  return State.ZoomTarget >= THIRD_PERSON_MIN;
}

function CanSprint() {
  return !State.Exhausted && State.Stamina > 0.01;
}

function GetMovementSpeed(WantsSprint, Moving) {
  State.WantsSprint = Boolean(WantsSprint);
  State.Moving = Boolean(Moving);
  State.Sprinting = State.WantsSprint && State.Moving && CanSprint() && IsGameplayActive();
  return State.Sprinting ? SPRINT_SPEED : WALK_SPEED;
}

function GetPlayerRadius() {
  return PLAYER_RADIUS;
}

function UpdateStamina(Delta, Time) {
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
}

function UpdateZoom(Delta) {
  if (State.ZoomTarget < THIRD_PERSON_MIN) {
    State.Zoom = 0;
    return;
  }
  if (State.Zoom < THIRD_PERSON_MIN) State.Zoom = THIRD_PERSON_MIN;
  const Alpha = 1 - Math.exp(-Delta * ZOOM_RESPONSIVENESS);
  State.Zoom = THREE.MathUtils.lerp(State.Zoom, State.ZoomTarget, Alpha);
  if (Math.abs(State.Zoom - State.ZoomTarget) < 0.002) State.Zoom = State.ZoomTarget;
}

function UpdateHud() {
  const Fill = document.getElementById("StaminaFill");
  const Value = document.getElementById("StaminaValue");
  const Wrap = document.getElementById("StaminaWrap");
  const Mode = document.getElementById("CameraModeValue");
  if (Fill) Fill.style.width = `${THREE.MathUtils.clamp(State.Stamina, 0, STAMINA_MAX).toFixed(1)}%`;
  if (Value) Value.textContent = `${Math.round(State.Stamina)}`;
  if (Wrap) {
    Wrap.classList.toggle("IsSprinting", State.Sprinting);
    Wrap.classList.toggle("IsExhausted", State.Exhausted);
  }
  if (Mode) Mode.textContent = IsThirdPerson() ? "THIRD" : "FIRST";
}

function FindBone(Model, Name) {
  const Bone = Model.getObjectByName(Name);
  if (!Bone?.isBone) return null;
  State.Bones.set(Name, Bone);
  State.BaseBoneQuaternions.set(Name, Bone.quaternion.clone());
  return Bone;
}

function SetupBones(Model) {
  const BoneMap = {
    pelvis: "Hips",
    spine_01: "Abdomen",
    spine_02: "Torso",
    spine_03: "Chest",
    neck_01: "Neck",
    Head: "Head",
    clavicle_l: "Shoulder.L",
    upperarm_l: "UpperArm.L",
    lowerarm_l: "LowerArm.L",
    hand_l: "Wrist.L",
    clavicle_r: "Shoulder.R",
    upperarm_r: "UpperArm.R",
    lowerarm_r: "LowerArm.R",
    hand_r: "Wrist.R",
    thigh_l: "UpperLeg.L",
    calf_l: "LowerLeg.L",
    foot_l: "Foot.L",
    thigh_r: "UpperLeg.R",
    calf_r: "LowerLeg.R",
    foot_r: "Foot.R"
  };
  for (const [CanonicalName, ActualName] of Object.entries(BoneMap)) {
    const Bone = Model.getObjectByName(ActualName);
    if (!Bone?.isBone) continue;
    State.Bones.set(CanonicalName, Bone);
    State.BaseBoneQuaternions.set(CanonicalName, Bone.quaternion.clone());
  }
}

function ApplyBaseBoneRotation(Name, X = 0, Y = 0, Z = 0) {
  const Bone = State.Bones.get(Name);
  const Base = State.BaseBoneQuaternions.get(Name);
  if (!Bone || !Base) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.copy(Base).multiply(State.TempQuaternion);
}

function ApplyRelativeBoneRotation(Name, X = 0, Y = 0, Z = 0) {
  const Bone = State.Bones.get(Name);
  if (!Bone) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion);
}

function BoneWeight(SkinIndex, SkinWeight, VertexIndex, BoneIndices) {
  let Total = 0;
  for (let Slot = 0; Slot < SkinIndex.itemSize; Slot += 1) {
    const BoneIndex = SkinIndex.getComponent(VertexIndex, Slot);
    if (BoneIndices.has(BoneIndex)) Total += SkinWeight.getComponent(VertexIndex, Slot) || 0;
  }
  return THREE.MathUtils.clamp(Total, 0, 1);
}

function MaterialIndexAt(Geometry, Offset) {
  if (!Geometry.groups?.length) return 0;
  for (const Group of Geometry.groups) {
    if (Offset >= Group.start && Offset < Group.start + Group.count) return Group.materialIndex || 0;
  }
  return 0;
}

function BuildFirstPersonArmMesh(Object) {
  if (!Object.isSkinnedMesh || !Object.skeleton || !Object.geometry) return null;
  const Geometry = Object.geometry;
  const SkinIndex = Geometry.getAttribute("skinIndex");
  const SkinWeight = Geometry.getAttribute("skinWeight");
  const Position = Geometry.getAttribute("position");
  if (!SkinIndex || !SkinWeight || !Position) return null;

  const ArmBones = new Set();
  for (let BoneIndex = 0; BoneIndex < Object.skeleton.bones.length; BoneIndex += 1) {
    const Name = (Object.skeleton.bones[BoneIndex]?.name || "").toLowerCase();
    if (
      Name.includes("lowerarm.") || Name.includes("wrist.") || Name.includes("thumb") ||
      Name.includes("index") || Name.includes("middle") || Name.includes("ring") || Name.includes("pinky")
    ) ArmBones.add(BoneIndex);
  }
  if (!ArmBones.size) return null;

  const SourceIndex = Geometry.index;
  const TriangleCount = SourceIndex ? SourceIndex.count / 3 : Position.count / 3;
  const Buckets = new Map();
  let KeptTriangles = 0;

  for (let Triangle = 0; Triangle < TriangleCount; Triangle += 1) {
    const Offset = Triangle * 3;
    const A = SourceIndex ? SourceIndex.getX(Offset) : Offset;
    const B = SourceIndex ? SourceIndex.getX(Offset + 1) : Offset + 1;
    const C = SourceIndex ? SourceIndex.getX(Offset + 2) : Offset + 2;
    const WA = BoneWeight(SkinIndex, SkinWeight, A, ArmBones);
    const WB = BoneWeight(SkinIndex, SkinWeight, B, ArmBones);
    const WC = BoneWeight(SkinIndex, SkinWeight, C, ArmBones);
    if (WA < ARM_WEIGHT_THRESHOLD || WB < ARM_WEIGHT_THRESHOLD || WC < ARM_WEIGHT_THRESHOLD) continue;
    const MaterialIndex = MaterialIndexAt(Geometry, Offset);
    if (!Buckets.has(MaterialIndex)) Buckets.set(MaterialIndex, []);
    Buckets.get(MaterialIndex).push(A, B, C);
    KeptTriangles += 1;
  }

  if (KeptTriangles < 6) return null;
  const ArmGeometry = Geometry.clone();
  ArmGeometry.clearGroups();
  const Indices = [];
  for (const [MaterialIndex, Bucket] of [...Buckets.entries()].sort((Left, Right) => Left[0] - Right[0])) {
    const Start = Indices.length;
    Indices.push(...Bucket);
    ArmGeometry.addGroup(Start, Bucket.length, MaterialIndex);
  }
  ArmGeometry.setIndex(Indices);
  ArmGeometry.computeBoundingSphere();

  const SourceMaterials = Array.isArray(Object.material) ? Object.material : [Object.material];
  const Materials = SourceMaterials.map(Material => {
    const Clone = Material.clone();
    Clone.depthTest = true;
    Clone.depthWrite = true;
    Clone.side = THREE.FrontSide;
    Clone.needsUpdate = true;
    return Clone;
  });

  const Arms = new THREE.SkinnedMesh(ArmGeometry, Array.isArray(Object.material) ? Materials : Materials[0]);
  Arms.name = `${Object.name || "Player"}_FirstPersonArms`;
  Arms.bindMode = Object.bindMode;
  Arms.bind(Object.skeleton, Object.bindMatrix);
  Arms.bindMatrixInverse.copy(Object.bindMatrixInverse);
  Arms.position.copy(Object.position);
  Arms.quaternion.copy(Object.quaternion);
  Arms.scale.copy(Object.scale);
  Arms.frustumCulled = false;
  Arms.renderOrder = 4;
  return Arms;
}

function BuildFirstPersonArms(Model) {
  const Additions = [];
  Model.traverse(Object => {
    if (!Object.isMesh) return;
    State.BodyMeshes.push(Object);
    const Arms = BuildFirstPersonArmMesh(Object);
    if (Arms) Additions.push([Object.parent, Arms]);
  });
  for (const [Parent, Arms] of Additions) {
    Parent.add(Arms);
    State.ArmMeshes.push(Arms);
  }
}

function SetViewVisibility(FirstPerson) {
  for (const Mesh of State.BodyMeshes) Mesh.visible = !FirstPerson;
  for (const Mesh of State.ArmMeshes) Mesh.visible = FirstPerson;
}

function PickClip(Clips, Patterns) {
  for (const Pattern of Patterns) {
    const Match = Clips.find(Clip => Pattern.test(Clip.name));
    if (Match) return Match;
  }
  return null;
}

function BuildAnimationActions(Clips) {
  if (!State.Mixer || !Clips?.length) return;
  const Definitions = {
    idle: [/idle/i],
    walk: [/walk/i, /jog/i],
    sprint: [/run/i, /sprint/i]
  };
  for (const [Name, Patterns] of Object.entries(Definitions)) {
    const Clip = PickClip(Clips, Patterns);
    if (!Clip) continue;
    const Action = State.Mixer.clipAction(Clip);
    Action.enabled = true;
    Action.setLoop(THREE.LoopRepeat, Infinity);
    State.Actions.set(Name, Action);
  }
}

function SetAnimationState(Name) {
  if (State.AnimationState === Name) return;
  State.AnimationState = Name;
  const Next = State.Actions.get(Name);
  if (!Next) return;
  Next.reset().fadeIn(0.12).play();
  if (State.ActiveAction && State.ActiveAction !== Next) State.ActiveAction.fadeOut(0.12);
  State.ActiveAction = Next;
}

function ManualPose(Delta, Time) {
  State.ManualPhase += Delta * (State.Moving ? (State.Sprinting ? 10.6 : 6.8) : 1.15);
  const Swing = State.Moving ? Math.sin(State.ManualPhase) : 0;
  const Breath = Math.sin(Time * 1.7) * 0.012;
  const LegAmount = State.Sprinting ? 0.78 : 0.46;
  const ArmAmount = State.Sprinting ? 0.62 : 0.38;
  ApplyBaseBoneRotation("pelvis", Breath, Swing * 0.018, 0);
  ApplyBaseBoneRotation("spine_01", State.Sprinting ? 0.08 : 0.02, 0, Swing * 0.015);
  ApplyBaseBoneRotation("spine_02", State.Sprinting ? 0.055 : 0.012, -Swing * 0.012, 0);
  ApplyBaseBoneRotation("upperarm_l", -Swing * ArmAmount, 0, 1.10);
  ApplyBaseBoneRotation("upperarm_r", Swing * ArmAmount, 0, -1.10);
  ApplyBaseBoneRotation("lowerarm_l", -0.17 + Math.max(0, Swing) * 0.12, 0, 0);
  ApplyBaseBoneRotation("lowerarm_r", -0.17 + Math.max(0, -Swing) * 0.12, 0, 0);
  ApplyBaseBoneRotation("thigh_l", Swing * LegAmount, 0, 0);
  ApplyBaseBoneRotation("thigh_r", -Swing * LegAmount, 0, 0);
  ApplyBaseBoneRotation("calf_l", Math.max(0, -Swing) * LegAmount * 0.62, 0, 0);
  ApplyBaseBoneRotation("calf_r", Math.max(0, Swing) * LegAmount * 0.62, 0, 0);
}

function ApplyFirstPersonPose(Delta) {
  State.SmoothedSwayX = THREE.MathUtils.lerp(State.SmoothedSwayX, State.MouseSwayX, 1 - Math.exp(-Delta * 16));
  State.SmoothedSwayY = THREE.MathUtils.lerp(State.SmoothedSwayY, State.MouseSwayY, 1 - Math.exp(-Delta * 16));
  State.MouseSwayX *= Math.exp(-Delta * 10);
  State.MouseSwayY *= Math.exp(-Delta * 10);
  const Step = State.Moving ? Math.sin(State.ManualPhase * 1.05) : 0;
  const SprintLift = State.Sprinting ? 0.10 : 0;
  ApplyRelativeBoneRotation("clavicle_l", 0.02, State.SmoothedSwayX * 0.08, 0.12);
  ApplyRelativeBoneRotation("clavicle_r", 0.02, State.SmoothedSwayX * 0.08, -0.12);
  ApplyRelativeBoneRotation("upperarm_l", -0.64 - SprintLift + Step * 0.06, 0.08, 0.30);
  ApplyRelativeBoneRotation("upperarm_r", -0.64 - SprintLift - Step * 0.06, -0.08, -0.30);
  ApplyRelativeBoneRotation("lowerarm_l", -0.28 + State.SmoothedSwayY * 0.12, 0, 0.04);
  ApplyRelativeBoneRotation("lowerarm_r", -0.28 + State.SmoothedSwayY * 0.12, 0, -0.04);
}

function NormalizeAngle(Angle) {
  return Math.atan2(Math.sin(Angle), Math.cos(Angle));
}

function UpdateCharacterTransform(Delta) {
  if (!State.CharacterReady || !State.Pivot || !State.Camera) return;
  const CurrentX = State.Camera.position.x;
  const CurrentZ = State.Camera.position.z;
  const SurfaceOffset = Number(window.__STORE_SURFACE_STEP_ANIMATION_R87__?.GetSurfaceOffset?.()) || 0;
  State.Pivot.position.set(CurrentX, SurfaceOffset, CurrentZ);

  if (!State.HasPlayerPosition) {
    State.LastPlayerPosition.set(CurrentX, 0, CurrentZ);
    State.HasPlayerPosition = true;
    State.Camera.getWorldDirection(State.TempDirection);
    State.TempDirection.y = 0;
    if (State.TempDirection.lengthSq() > 0.0001) {
      State.TempDirection.normalize();
      State.Pivot.rotation.y = Math.atan2(State.TempDirection.x, State.TempDirection.z);
    }
    return;
  }

  State.TempDirection.set(CurrentX - State.LastPlayerPosition.x, 0, CurrentZ - State.LastPlayerPosition.z);
  State.LastPlayerPosition.set(CurrentX, 0, CurrentZ);
  if (!State.Moving || State.TempDirection.lengthSq() < 0.000001) return;
  State.TempDirection.normalize();
  const TargetYaw = Math.atan2(State.TempDirection.x, State.TempDirection.z);
  const Difference = NormalizeAngle(TargetYaw - State.Pivot.rotation.y);
  State.Pivot.rotation.y += Difference * (1 - Math.exp(-Delta * TURN_RESPONSIVENESS));
}

function UpdateCharacter(Delta, Time) {
  if (!State.CharacterReady) return;
  UpdateCharacterTransform(Delta);
  const DesiredState = State.Sprinting ? "sprint" : State.Moving ? "walk" : "idle";
  if (State.Mixer && State.Actions.size) {
    SetAnimationState(DesiredState);
    State.Mixer.update(Delta);
  } else ManualPose(Delta, Time);
  if (!IsThirdPerson()) ApplyFirstPersonPose(Delta);
  SetViewVisibility(!IsThirdPerson());
}

function SegmentAabbDistance(Start, End, Bounds, Padding = 0.10) {
  const Direction = State.TempOffset.copy(End).sub(Start);
  let TMin = 0;
  let TMax = 1;
  for (const Axis of ["x", "y", "z"]) {
    const Origin = Start[Axis];
    const Delta = Direction[Axis];
    const Min = Bounds.min[Axis] - Padding;
    const Max = Bounds.max[Axis] + Padding;
    if (Math.abs(Delta) < 1e-8) {
      if (Origin < Min || Origin > Max) return null;
      continue;
    }
    let A = (Min - Origin) / Delta;
    let B = (Max - Origin) / Delta;
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

function Render(Renderer, Scene, Camera) {
  if (!Renderer || !Camera) return;
  if (!IsThirdPerson() || !State.CharacterReady) {
    SetViewVisibility(true);
    Renderer.render(Scene, Camera);
    return;
  }

  SetViewVisibility(false);
  State.SavedPosition.copy(Camera.position);
  State.SavedQuaternion.copy(Camera.quaternion);

  State.TempHorizontal.set(0, 0, -1).applyQuaternion(State.SavedQuaternion);
  const Vertical = THREE.MathUtils.clamp(State.TempHorizontal.y, -CAMERA_PITCH_LIMIT, CAMERA_PITCH_LIMIT);
  State.TempHorizontal.y = 0;
  if (State.TempHorizontal.lengthSq() < 0.0001) State.TempHorizontal.set(0, 0, -1);
  State.TempHorizontal.normalize();
  const HorizontalScale = Math.sqrt(Math.max(0.0001, 1 - Vertical * Vertical));
  State.TempDirection.copy(State.TempHorizontal).multiplyScalar(HorizontalScale);
  State.TempDirection.y = Vertical;
  State.TempDirection.normalize();

  State.TempRight.set(1, 0, 0).applyQuaternion(State.SavedQuaternion);
  State.TempRight.y = 0;
  if (State.TempRight.lengthSq() < 0.0001) State.TempRight.set(1, 0, 0);
  State.TempRight.normalize();

  State.TempTarget.set(State.SavedPosition.x, CAMERA_TARGET_HEIGHT, State.SavedPosition.z);
  const CameraZoom = Math.max(THIRD_PERSON_MIN, State.Zoom);
  State.TempDesired.copy(State.TempTarget)
    .addScaledVector(State.TempDirection, -CameraZoom)
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
  Camera.position.copy(State.SavedPosition);
  Camera.quaternion.copy(State.SavedQuaternion);
  Camera.updateMatrixWorld(true);
}

async function LoadCharacter() {
  if (State.Loading || State.CharacterReady || !State.Scene) return;
  State.Loading = true;
  const Status = document.getElementById("BootStatus");
  const PreviousStatus = Status?.textContent || "";
  if (Status) Status.textContent = "Loading store worker...";
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
        if ("roughness" in Material) Material.roughness = Math.max(Material.roughness ?? 0.55, 0.58);
        Material.needsUpdate = true;
      }
    });
    SetupBones(Model);
    BuildFirstPersonArms(Model);
    const Pivot = new THREE.Group();
    Pivot.name = "PlayerCharacterPivot";
    Pivot.add(Model);
    State.Scene.add(Pivot);
    State.Pivot = Pivot;
    State.Model = Model;
    State.Mixer = new THREE.AnimationMixer(Model);
    BuildAnimationActions(Gltf.animations || []);
    if (State.Actions.has("idle")) {
      State.ActiveAction = State.Actions.get("idle");
      State.ActiveAction.play();
      State.AnimationState = "idle";
    }
    State.CharacterReady = true;
    State.HasPlayerPosition = false;
    SetViewVisibility(true);
    if (Status && Status.textContent === "Loading store worker...") Status.textContent = PreviousStatus || "Player ready.";
  } catch (Error) {
    console.error("Player model failed to load", Error);
    if (Status) Status.textContent = "Store ready — player model failed to load.";
  } finally {
    State.Loading = false;
  }
}

function Attach({ Scene, Camera, Renderer, CollisionBoxes }) {
  State.Scene = Scene;
  State.Camera = Camera;
  State.Renderer = Renderer;
  State.CollisionBoxes = CollisionBoxes;
  LoadCharacter();
}

function Frame() {
  const NowMs = performance.now();
  const Delta = Math.min((NowMs - State.LastFrameAt) / 1000, 0.05);
  State.LastFrameAt = NowMs;
  const Time = NowMs / 1000;
  UpdateZoom(Delta);
  UpdateStamina(Delta, Time);
  UpdateCharacter(Delta, Time);
  UpdateHud();
  requestAnimationFrame(Frame);
}

addEventListener("wheel", Event => {
  if (!IsGameplayActive()) return;
  Event.preventDefault();
  const Direction = Math.sign(Event.deltaY);
  if (!Direction) return;
  if (Direction > 0) {
    if (State.ZoomTarget < THIRD_PERSON_MIN) State.ZoomTarget = THIRD_PERSON_MIN;
    else State.ZoomTarget = Math.min(THIRD_PERSON_MAX, State.ZoomTarget + 0.45);
  } else if (State.ZoomTarget <= THIRD_PERSON_MIN + 0.001) {
    State.ZoomTarget = 0;
  } else {
    State.ZoomTarget = Math.max(THIRD_PERSON_MIN, State.ZoomTarget - 0.45);
  }
}, { passive: false });

addEventListener("keydown", Event => {
  if (Event.code !== "KeyV" || Event.repeat) return;
  State.ZoomTarget = IsThirdPerson() ? 0 : THIRD_PERSON_DEFAULT;
  Event.preventDefault();
});

addEventListener("mousemove", Event => {
  if (!document.pointerLockElement) return;
  State.MouseSwayX = THREE.MathUtils.clamp(State.MouseSwayX + Event.movementX * 0.0012, -0.16, 0.16);
  State.MouseSwayY = THREE.MathUtils.clamp(State.MouseSwayY + Event.movementY * 0.0010, -0.12, 0.12);
});

window.__STORE_PLAYER__ = {
  Attach,
  Render,
  GetMovementSpeed,
  GetPlayerRadius,
  IsSprinting: () => State.Sprinting,
  GetStamina: () => State.Stamina,
  IsThirdPerson
};

window.__STORE_PLAYER_BUILD__ = "V0.11";
requestAnimationFrame(Frame);