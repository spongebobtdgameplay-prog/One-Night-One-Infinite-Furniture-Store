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
const THIRD_PERSON_DEFAULT = 2.15;
const THIRD_PERSON_MIN = 0.88;
const THIRD_PERSON_MAX = 3.35;
const ZOOM_STEP = 0.38;
const ZOOM_RESPONSIVENESS = 18;
const TURN_RESPONSIVENESS = 14;
const CAMERA_POSITION_RESPONSIVENESS = 30;
const CAMERA_SHOULDER = 0.18;
const CAMERA_HEIGHT = 0.08;
const CAMERA_PITCH_LIMIT = 0.68;
const ARM_WEIGHT_THRESHOLD = 0.78;
const EYE_LOCAL_OFFSET = new THREE.Vector3(0, 0.055, 0.075);

const State = {
  Scene: null,
  Camera: null,
  Renderer: null,
  CollisionBoxes: null,
  Pivot: null,
  Model: null,
  Head: null,
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
  MotionPhase: 0,
  MouseSwayX: 0,
  MouseSwayY: 0,
  SmoothedSwayX: 0,
  SmoothedSwayY: 0,
  LastPlayerPosition: new THREE.Vector3(),
  HasLastPlayerPosition: false,
  EyeRestLocal: new THREE.Vector3(),
  EyeRestReady: false,
  WasThirdPerson: false,
  ThirdPersonRenderPosition: new THREE.Vector3(),
  LastRenderAt: performance.now(),
  SavedCameraPosition: new THREE.Vector3(),
  SavedCameraQuaternion: new THREE.Quaternion(),
  TempDirection: new THREE.Vector3(),
  TempHorizontal: new THREE.Vector3(),
  TempRight: new THREE.Vector3(),
  TempTarget: new THREE.Vector3(),
  TempDesired: new THREE.Vector3(),
  TempOffset: new THREE.Vector3(),
  TempEye: new THREE.Vector3(),
  TempEyeCorrection: new THREE.Vector3(),
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
  State.Head = Model.getObjectByName("Head") || State.Bones.get("Head") || null;
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
  const TriangleCount = SourceIndex ? Math.floor(SourceIndex.count / 3) : Math.floor(Position.count / 3);
  const Buckets = new Map();
  let KeptTriangles = 0;

  for (let Triangle = 0; Triangle < TriangleCount; Triangle += 1) {
    const Offset = Triangle * 3;
    const A = SourceIndex ? SourceIndex.getX(Offset) : Offset;
    const B = SourceIndex ? SourceIndex.getX(Offset + 1) : Offset + 1;
    const C = SourceIndex ? SourceIndex.getX(Offset + 2) : Offset + 2;
    if (
      BoneWeight(SkinIndex, SkinWeight, A, ArmBones) < ARM_WEIGHT_THRESHOLD ||
      BoneWeight(SkinIndex, SkinWeight, B, ArmBones) < ARM_WEIGHT_THRESHOLD ||
      BoneWeight(SkinIndex, SkinWeight, C, ArmBones) < ARM_WEIGHT_THRESHOLD
    ) continue;
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
  const SourceMeshes = [];
  Model.traverse(Object => {
    if (Object.isMesh) SourceMeshes.push(Object);
  });
  for (const Object of SourceMeshes) {
    State.BodyMeshes.push(Object);
    const Arms = BuildFirstPersonArmMesh(Object);
    if (!Arms) continue;
    Object.parent.add(Arms);
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

function ManualPose(Time) {
  const Swing = State.Moving ? Math.sin(State.MotionPhase) : 0;
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

function SaveArmBones() {
  const Saved = new Map();
  for (const Name of ["clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r"]) {
    const Bone = State.Bones.get(Name);
    if (Bone) Saved.set(Bone, Bone.quaternion.clone());
  }
  return Saved;
}

function RestoreArmBones(Saved) {
  for (const [Bone, Quaternion] of Saved) Bone.quaternion.copy(Quaternion);
}

function ApplyFirstPersonPose(Delta) {
  State.SmoothedSwayX = THREE.MathUtils.lerp(State.SmoothedSwayX, State.MouseSwayX, 1 - Math.exp(-Delta * 16));
  State.SmoothedSwayY = THREE.MathUtils.lerp(State.SmoothedSwayY, State.MouseSwayY, 1 - Math.exp(-Delta * 16));
  State.MouseSwayX *= Math.exp(-Delta * 10);
  State.MouseSwayY *= Math.exp(-Delta * 10);
  const Swing = State.Moving ? Math.sin(State.MotionPhase) : 0;
  const Step = State.Moving ? Math.sin(State.MotionPhase * 2) : 0;
  const SprintLift = State.Sprinting ? 0.08 : 0;
  const SwingAmount = State.Sprinting ? 0.12 : 0.075;
  ApplyRelativeBoneRotation("clavicle_l", 0.02 + Step * 0.008, State.SmoothedSwayX * 0.06, 0.12);
  ApplyRelativeBoneRotation("clavicle_r", 0.02 - Step * 0.008, State.SmoothedSwayX * 0.06, -0.12);
  ApplyRelativeBoneRotation("upperarm_l", -0.64 - SprintLift + Swing * SwingAmount, 0.08, 0.30);
  ApplyRelativeBoneRotation("upperarm_r", -0.64 - SprintLift - Swing * SwingAmount, -0.08, -0.30);
  ApplyRelativeBoneRotation("lowerarm_l", -0.28 + Math.max(0, -Swing) * 0.06 + State.SmoothedSwayY * 0.10, 0, 0.04);
  ApplyRelativeBoneRotation("lowerarm_r", -0.28 + Math.max(0, Swing) * 0.06 + State.SmoothedSwayY * 0.10, 0, -0.04);
  ApplyRelativeBoneRotation("hand_l", Step * 0.018, 0, 0);
  ApplyRelativeBoneRotation("hand_r", -Step * 0.018, 0, 0);
}

function NormalizeAngle(Angle) {
  return Math.atan2(Math.sin(Angle), Math.cos(Angle));
}

function GetCameraHorizontalDirection() {
  State.Camera.getWorldDirection(State.TempDirection);
  State.TempDirection.y = 0;
  if (State.TempDirection.lengthSq() < 0.000001) State.TempDirection.set(0, 0, 1);
  return State.TempDirection.normalize();
}

function UpdateCharacterFacing(Delta, LogicalEye, FirstPerson) {
  if (!State.Pivot) return;
  if (FirstPerson) {
    GetCameraHorizontalDirection();
    State.Pivot.rotation.y = Math.atan2(State.TempDirection.x, State.TempDirection.z);
    State.LastPlayerPosition.set(LogicalEye.x, 0, LogicalEye.z);
    State.HasLastPlayerPosition = true;
    return;
  }

  if (!State.HasLastPlayerPosition) {
    State.LastPlayerPosition.set(LogicalEye.x, 0, LogicalEye.z);
    State.HasLastPlayerPosition = true;
    return;
  }

  State.TempDirection.set(LogicalEye.x - State.LastPlayerPosition.x, 0, LogicalEye.z - State.LastPlayerPosition.z);
  State.LastPlayerPosition.set(LogicalEye.x, 0, LogicalEye.z);
  if (!State.Moving || State.TempDirection.lengthSq() < 0.000001) return;
  State.TempDirection.normalize();
  const TargetYaw = Math.atan2(State.TempDirection.x, State.TempDirection.z);
  const Difference = NormalizeAngle(TargetYaw - State.Pivot.rotation.y);
  State.Pivot.rotation.y += Difference * (1 - Math.exp(-Delta * TURN_RESPONSIVENESS));
}

function CaptureEyeRestAnchor() {
  if (!State.Pivot || !State.Head?.isBone || State.EyeRestReady) return;
  State.Pivot.updateMatrixWorld(true);
  State.TempEye.copy(EYE_LOCAL_OFFSET);
  State.Head.localToWorld(State.TempEye);
  State.EyeRestLocal.copy(State.TempEye);
  State.Pivot.worldToLocal(State.EyeRestLocal);
  State.EyeRestReady = true;
}

function AlignRigEyesToLogicalEye(LogicalEye) {
  if (!State.Pivot) return;
  if (!State.EyeRestReady || !State.Head?.isBone) {
    State.Pivot.position.set(LogicalEye.x, 0, LogicalEye.z);
    State.Pivot.updateMatrixWorld(true);
    return;
  }

  State.TempEye.copy(State.EyeRestLocal).applyQuaternion(State.Pivot.quaternion);
  State.Pivot.position.copy(LogicalEye).sub(State.TempEye);
  State.Pivot.updateMatrixWorld(true);

  State.TempEye.copy(EYE_LOCAL_OFFSET);
  State.Head.localToWorld(State.TempEye);
  State.TempEyeCorrection.copy(LogicalEye).sub(State.TempEye);
  State.Pivot.position.add(State.TempEyeCorrection);
  State.Pivot.updateMatrixWorld(true);
}

function SegmentAabbDistance(Start, End, Bounds, Padding = 0.10) {
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
    Allowed = Math.min(Allowed, Math.max(0.46, T * SegmentLength - 0.12));
  }
  return Allowed;
}

function SaveArmTransforms() {
  const Saved = [];
  for (const Mesh of State.ArmMeshes) {
    Saved.push({ Mesh, Position: Mesh.position.clone() });
    Mesh.position.y += 0.025;
    Mesh.position.z += 0.075;
  }
  return Saved;
}

function RestoreArmTransforms(Saved) {
  for (const Entry of Saved) Entry.Mesh.position.copy(Entry.Position);
}

function RenderFirstPerson(Renderer, Scene, Camera, Delta, LogicalEye) {
  SetViewVisibility(true);
  UpdateCharacterFacing(Delta, LogicalEye, true);
  const SavedArmBones = SaveArmBones();
  ApplyFirstPersonPose(Delta);
  AlignRigEyesToLogicalEye(LogicalEye);
  const SavedArmTransforms = SaveArmTransforms();
  Renderer.render(Scene, Camera);
  RestoreArmTransforms(SavedArmTransforms);
  RestoreArmBones(SavedArmBones);
}

function RenderThirdPerson(Renderer, Scene, Camera, Delta, LogicalEye) {
  SetViewVisibility(false);
  UpdateCharacterFacing(Delta, LogicalEye, false);
  AlignRigEyesToLogicalEye(LogicalEye);
  State.SavedCameraPosition.copy(Camera.position);
  State.SavedCameraQuaternion.copy(Camera.quaternion);

  if (State.Head?.isBone) {
    State.TempTarget.copy(EYE_LOCAL_OFFSET);
    State.Head.localToWorld(State.TempTarget);
  } else {
    State.TempTarget.copy(LogicalEye);
  }

  State.TempDirection.set(0, 0, -1).applyQuaternion(State.SavedCameraQuaternion).normalize();
  const Vertical = THREE.MathUtils.clamp(State.TempDirection.y, -CAMERA_PITCH_LIMIT, CAMERA_PITCH_LIMIT);
  State.TempHorizontal.set(State.TempDirection.x, 0, State.TempDirection.z);
  if (State.TempHorizontal.lengthSq() < 0.000001) State.TempHorizontal.set(0, 0, -1);
  State.TempHorizontal.normalize();

  State.TempRight.set(1, 0, 0).applyQuaternion(State.SavedCameraQuaternion);
  State.TempRight.y = 0;
  if (State.TempRight.lengthSq() < 0.000001) State.TempRight.set(1, 0, 0);
  State.TempRight.normalize();

  const Distance = Math.max(THIRD_PERSON_MIN, State.Zoom);
  const HorizontalDistance = Math.sqrt(Math.max(0.001, 1 - Vertical * Vertical)) * Distance;
  State.TempDesired.copy(State.TempTarget)
    .addScaledVector(State.TempHorizontal, -HorizontalDistance)
    .addScaledVector(State.TempRight, CAMERA_SHOULDER);
  State.TempDesired.y += CAMERA_HEIGHT + Vertical * Distance;
  State.TempDesired.x = THREE.MathUtils.clamp(State.TempDesired.x, -16.55, 16.55);
  State.TempDesired.y = THREE.MathUtils.clamp(State.TempDesired.y, 0.34, 3.48);

  const Allowed = CameraDistance(State.TempTarget, State.TempDesired);
  State.TempOffset.copy(State.TempDesired).sub(State.TempTarget);
  if (State.TempOffset.lengthSq() > 0.000001) State.TempOffset.normalize().multiplyScalar(Allowed);
  State.TempDesired.copy(State.TempTarget).add(State.TempOffset);

  if (!State.WasThirdPerson || State.ThirdPersonRenderPosition.distanceToSquared(State.TempDesired) > 64) {
    State.ThirdPersonRenderPosition.copy(State.TempDesired);
  } else {
    const Alpha = 1 - Math.exp(-Delta * CAMERA_POSITION_RESPONSIVENESS);
    State.ThirdPersonRenderPosition.lerp(State.TempDesired, Alpha);
  }

  Camera.position.copy(State.ThirdPersonRenderPosition);
  Camera.lookAt(State.TempTarget);
  Camera.updateMatrixWorld(true);
  Renderer.render(Scene, Camera);
  Camera.position.copy(State.SavedCameraPosition);
  Camera.quaternion.copy(State.SavedCameraQuaternion);
  Camera.updateMatrixWorld(true);
}

function UpdateAnimation(Delta, Time) {
  State.MotionPhase += Delta * (State.Moving ? (State.Sprinting ? 10.8 : 7.0) : 1.25);
  const DesiredState = State.Sprinting ? "sprint" : State.Moving ? "walk" : "idle";
  if (State.Mixer && State.Actions.size) {
    SetAnimationState(DesiredState);
    State.Mixer.update(Delta);
  } else {
    ManualPose(Time);
  }
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

    let Bounds = new THREE.Box3().setFromObject(Model);
    const Center = Bounds.getCenter(new THREE.Vector3());
    Model.position.x -= Center.x;
    Model.position.z -= Center.z;
    Model.updateMatrixWorld(true);
    Bounds = new THREE.Box3().setFromObject(Model);
    Model.position.y -= Bounds.min.y;

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
    CaptureEyeRestAnchor();
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

function Render(Renderer, Scene, Camera) {
  const NowMs = performance.now();
  const Delta = Math.min((NowMs - State.LastRenderAt) / 1000, 0.05);
  State.LastRenderAt = NowMs;
  const Time = NowMs / 1000;
  UpdateZoom(Delta);
  UpdateStamina(Delta, Time);
  UpdateHud();

  if (!State.CharacterReady || !State.Pivot) {
    Renderer.render(Scene, Camera);
    return;
  }

  CaptureEyeRestAnchor();
  UpdateAnimation(Delta, Time);
  const LogicalEye = State.SavedCameraPosition.copy(Camera.position);
  const ThirdPerson = IsThirdPerson();
  if (ThirdPerson) RenderThirdPerson(Renderer, Scene, Camera, Delta, LogicalEye);
  else RenderFirstPerson(Renderer, Scene, Camera, Delta, LogicalEye);
  State.WasThirdPerson = ThirdPerson;
}

addEventListener("wheel", Event => {
  if (!IsGameplayActive()) return;
  Event.preventDefault();
  const Direction = Math.sign(Event.deltaY);
  if (!Direction) return;
  if (Direction > 0) {
    if (!IsThirdPerson()) {
      State.Zoom = THIRD_PERSON_MIN;
      State.ZoomTarget = THIRD_PERSON_MIN;
    } else {
      State.ZoomTarget = Math.min(THIRD_PERSON_MAX, State.ZoomTarget + ZOOM_STEP);
    }
  } else if (!IsThirdPerson() || State.ZoomTarget <= THIRD_PERSON_MIN + 0.001) {
    State.ZoomTarget = 0;
  } else {
    State.ZoomTarget = Math.max(THIRD_PERSON_MIN, State.ZoomTarget - ZOOM_STEP);
  }
}, { passive: false });

addEventListener("keydown", Event => {
  if (Event.code !== "KeyV" || Event.repeat) return;
  if (IsThirdPerson()) {
    State.ZoomTarget = 0;
  } else {
    State.Zoom = THIRD_PERSON_MIN;
    State.ZoomTarget = THIRD_PERSON_DEFAULT;
  }
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

window.__STORE_PLAYER_BUILD__ = "V0.15";