import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const PLAYER_MODEL_URL = "https://raw.githubusercontent.com/Seyamalam/blood-league-kickoff/aa02a4e6d8337a0604d2da131bcbbeb1f01badf0/public/assets/vendor/quaternius/night-striker.glb";
const ANIMATION_URL = "https://raw.githubusercontent.com/Seyamalam/blood-league-kickoff/aa02a4e6d8337a0604d2da131bcbbeb1f01badf0/public/assets/vendor/quaternius/universal-animation-library.glb";
const PLAYER_HEIGHT = 1.78;
const PLAYER_RADIUS = 0.43;
const WALK_SPEED = 3.55;
const SPRINT_SPEED = 5.6;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 24;
const STAMINA_REGEN = 18;
const STAMINA_REGEN_DELAY = 0.8;
const STAMINA_RECOVER_THRESHOLD = 25;
const MAX_CAMERA_DISTANCE = 5.2;
const THIRD_PERSON_HEIGHT = 0.58;

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
  LastFrameAt: performance.now(),
  ManualPhase: 0,
  ZoomTarget: 0,
  ZoomDistance: 0,
  ThirdPerson: false,
  MouseSwayX: 0,
  MouseSwayY: 0,
  SmoothedSwayX: 0,
  SmoothedSwayY: 0,
  TempDirection: new THREE.Vector3(),
  TempHorizontal: new THREE.Vector3(),
  TempTarget: new THREE.Vector3(),
  TempDesired: new THREE.Vector3(),
  TempOffset: new THREE.Vector3(),
  TempQuaternion: new THREE.Quaternion(),
  TempEuler: new THREE.Euler(),
  SavedPosition: new THREE.Vector3(),
  SavedQuaternion: new THREE.Quaternion()
};

const Loader = new GLTFLoader();

function IsGameplayActive() {
  return Boolean(document.pointerLockElement) && !document.getElementById("Hud")?.classList.contains("Hidden");
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

function UpdateStamina(Delta, Now) {
  if (State.Sprinting) {
    State.Stamina = Math.max(0, State.Stamina - STAMINA_DRAIN * Delta);
    State.LastSprintAt = Now;
    if (State.Stamina <= 0.01) {
      State.Exhausted = true;
      State.Sprinting = false;
    }
  } else if (Now - State.LastSprintAt >= STAMINA_REGEN_DELAY) {
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
  if (Mode) Mode.textContent = State.ZoomTarget < 0.15 ? "FIRST PERSON" : "THIRD PERSON";
}

function FindBone(Model, Name) {
  const Bone = Model.getObjectByName(Name);
  if (!Bone?.isBone) return null;
  State.Bones.set(Name, Bone);
  State.BaseBoneQuaternions.set(Name, Bone.quaternion.clone());
  return Bone;
}

function SetupBones(Model) {
  for (const Name of [
    "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
    "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
    "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
    "thigh_l", "calf_l", "foot_l", "ball_l",
    "thigh_r", "calf_r", "foot_r", "ball_r"
  ]) FindBone(Model, Name);
}

function ApplyRelativeBoneRotation(Name, X = 0, Y = 0, Z = 0) {
  const Bone = State.Bones.get(Name);
  if (!Bone) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion);
}

function ApplyBaseBoneRotation(Name, X = 0, Y = 0, Z = 0) {
  const Bone = State.Bones.get(Name);
  const Base = State.BaseBoneQuaternions.get(Name);
  if (!Bone || !Base) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.copy(Base).multiply(State.TempQuaternion);
}

function ArmWeightForVertex(SkinIndex, SkinWeight, VertexIndex, ArmBoneIndices) {
  let Total = 0;
  for (let Slot = 0; Slot < SkinIndex.itemSize; Slot += 1) {
    const BoneIndex = SkinIndex.getComponent(VertexIndex, Slot);
    if (ArmBoneIndices.has(BoneIndex)) Total += SkinWeight.getComponent(VertexIndex, Slot) || 0;
  }
  return THREE.MathUtils.clamp(Total, 0, 1);
}

function MakeArmOnlyMaterial(Material) {
  const Clone = Material.clone();
  Clone.depthTest = true;
  Clone.depthWrite = true;
  Clone.transparent = false;
  Clone.side = THREE.FrontSide;
  Clone.onBeforeCompile = Shader => {
    Shader.vertexShader = Shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nattribute float fpArmMask;\nvarying float vFpArmMask;"
    );
    Shader.vertexShader = Shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvFpArmMask = fpArmMask;"
    );
    Shader.fragmentShader = Shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying float vFpArmMask;"
    );
    Shader.fragmentShader = Shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      "#include <clipping_planes_fragment>\nif (vFpArmMask < 0.60) discard;"
    );
  };
  Clone.customProgramCacheKey = () => "store-first-person-arm-mask-v2";
  Clone.needsUpdate = true;
  return Clone;
}

function BuildFirstPersonArms(Model) {
  const NewMeshes = [];
  Model.traverse(Object => {
    if (!Object.isMesh || Object.userData.IsFirstPersonArms) return;
    State.BodyMeshes.push(Object);
    if (!Object.isSkinnedMesh || !Object.skeleton || !Object.geometry) return;

    const SkinIndex = Object.geometry.getAttribute("skinIndex");
    const SkinWeight = Object.geometry.getAttribute("skinWeight");
    const Position = Object.geometry.getAttribute("position");
    if (!SkinIndex || !SkinWeight || !Position) return;

    const ArmBoneIndices = new Set();
    for (let BoneIndex = 0; BoneIndex < Object.skeleton.bones.length; BoneIndex += 1) {
      const Name = (Object.skeleton.bones[BoneIndex]?.name || "").toLowerCase();
      if (
        Name.includes("upperarm_") || Name.includes("lowerarm_") || Name.includes("hand_") ||
        Name.includes("thumb_") || Name.includes("index_") || Name.includes("middle_") ||
        Name.includes("ring_") || Name.includes("pinky_")
      ) ArmBoneIndices.add(BoneIndex);
    }
    if (!ArmBoneIndices.size) return;

    const Geometry = Object.geometry.clone();
    const Mask = new Float32Array(Position.count);
    let MaxMask = 0;
    for (let VertexIndex = 0; VertexIndex < Position.count; VertexIndex += 1) {
      const Weight = ArmWeightForVertex(SkinIndex, SkinWeight, VertexIndex, ArmBoneIndices);
      Mask[VertexIndex] = Weight;
      MaxMask = Math.max(MaxMask, Weight);
    }
    if (MaxMask < 0.5) return;
    Geometry.setAttribute("fpArmMask", new THREE.Float32BufferAttribute(Mask, 1));

    const SourceMaterials = Array.isArray(Object.material) ? Object.material : [Object.material];
    const Materials = SourceMaterials.map(MakeArmOnlyMaterial);
    const Arms = new THREE.SkinnedMesh(Geometry, Array.isArray(Object.material) ? Materials : Materials[0]);
    Arms.name = `${Object.name || "Player"}_FirstPersonArms`;
    Arms.userData.IsFirstPersonArms = true;
    Arms.bindMode = Object.bindMode;
    Arms.bind(Object.skeleton, Object.bindMatrix);
    Arms.bindMatrixInverse.copy(Object.bindMatrixInverse);
    Arms.position.copy(Object.position);
    Arms.quaternion.copy(Object.quaternion);
    Arms.scale.copy(Object.scale);
    Arms.frustumCulled = false;
    Arms.renderOrder = 5;
    NewMeshes.push([Object.parent, Arms]);
  });

  for (const [Parent, Arms] of NewMeshes) {
    Parent.add(Arms);
    State.ArmMeshes.push(Arms);
  }
}

function CreateAnatomyBumpTexture() {
  const Canvas = document.createElement("canvas");
  Canvas.width = 256;
  Canvas.height = 256;
  const Context = Canvas.getContext("2d");
  Context.fillStyle = "#808080";
  Context.fillRect(0, 0, 256, 256);
  Context.globalAlpha = 0.14;
  for (let Band = 0; Band < 12; Band += 1) {
    const Y = 15 + Band * 20;
    const Gradient = Context.createLinearGradient(0, Y - 8, 0, Y + 8);
    Gradient.addColorStop(0, "#747474");
    Gradient.addColorStop(0.5, "#929292");
    Gradient.addColorStop(1, "#747474");
    Context.fillStyle = Gradient;
    Context.beginPath();
    Context.ellipse(128 + Math.sin(Band) * 22, Y, 72, 8, Math.sin(Band * 0.7) * 0.16, 0, Math.PI * 2);
    Context.fill();
  }
  Context.globalAlpha = 0.11;
  Context.strokeStyle = "#a7a7a7";
  Context.lineWidth = 1.2;
  for (let Line = 0; Line < 18; Line += 1) {
    Context.beginPath();
    Context.moveTo((Line * 37) % 256, 0);
    Context.bezierCurveTo((Line * 53) % 256, 75, (Line * 71) % 256, 165, (Line * 97) % 256, 256);
    Context.stroke();
  }
  Context.globalAlpha = 1;
  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.wrapS = THREE.RepeatWrapping;
  Texture.wrapT = THREE.RepeatWrapping;
  Texture.repeat.set(3, 4);
  return Texture;
}

function ApplyAnatomyDetail(Model) {
  const BumpTexture = CreateAnatomyBumpTexture();
  Model.traverse(Object => {
    if (!Object.isMesh) return;
    const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
    for (const Material of Materials) {
      if (!Material?.isMeshStandardMaterial) continue;
      const Label = `${Object.name || ""} ${Material.name || ""}`.toLowerCase();
      if (!/(skin|body|head|face|arm|leg)/.test(Label)) continue;
      Material.bumpMap = BumpTexture;
      Material.bumpScale = 0.014;
      Material.roughness = Math.max(Material.roughness ?? 0.65, 0.62);
      Material.needsUpdate = true;
    }
  });
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
  if (!State.Mixer) return;
  const Definitions = {
    idle: [/^idle_loop$/i, /idle/i],
    walk: [/walk.*fwd/i, /walk/i, /jog.*fwd/i, /jog/i],
    sprint: [/sprint.*loop/i, /sprint/i, /run.*fwd/i, /run/i]
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
  Next.reset().fadeIn(0.18).play();
  if (State.ActiveAction && State.ActiveAction !== Next) State.ActiveAction.fadeOut(0.18);
  State.ActiveAction = Next;
}

function ManualPose(Delta, Time) {
  const Moving = State.Moving && IsGameplayActive();
  const Sprinting = State.Sprinting;
  State.ManualPhase += Delta * (Moving ? (Sprinting ? 10.2 : 6.6) : 1.25);
  const Swing = Moving ? Math.sin(State.ManualPhase) : 0;
  const LegAmount = Sprinting ? 0.74 : 0.44;
  const ArmAmount = Sprinting ? 0.58 : 0.34;
  const Breath = Math.sin(Time * 1.8) * 0.018;
  ApplyBaseBoneRotation("pelvis", Breath, Swing * 0.018, 0);
  ApplyBaseBoneRotation("spine_01", Sprinting ? 0.08 : 0.02, 0, Swing * 0.018);
  ApplyBaseBoneRotation("spine_02", Sprinting ? 0.07 : 0.018, -Swing * 0.012, 0);
  ApplyBaseBoneRotation("spine_03", Sprinting ? 0.05 : 0.012, 0, 0);
  ApplyBaseBoneRotation("upperarm_l", -Swing * ArmAmount, 0, 1.18);
  ApplyBaseBoneRotation("upperarm_r", Swing * ArmAmount, 0, -1.18);
  ApplyBaseBoneRotation("lowerarm_l", -0.18 + Math.max(0, Swing) * 0.14, 0, 0);
  ApplyBaseBoneRotation("lowerarm_r", -0.18 + Math.max(0, -Swing) * 0.14, 0, 0);
  ApplyBaseBoneRotation("thigh_l", Swing * LegAmount, 0, 0);
  ApplyBaseBoneRotation("thigh_r", -Swing * LegAmount, 0, 0);
  ApplyBaseBoneRotation("calf_l", Math.max(0, -Swing) * LegAmount * 0.62, 0, 0);
  ApplyBaseBoneRotation("calf_r", Math.max(0, Swing) * LegAmount * 0.62, 0, 0);
}

function ApplyFirstPersonPoseOffsets(Delta) {
  State.SmoothedSwayX = THREE.MathUtils.lerp(State.SmoothedSwayX, State.MouseSwayX, 1 - Math.exp(-Delta * 14));
  State.SmoothedSwayY = THREE.MathUtils.lerp(State.SmoothedSwayY, State.MouseSwayY, 1 - Math.exp(-Delta * 14));
  State.MouseSwayX *= Math.exp(-Delta * 9);
  State.MouseSwayY *= Math.exp(-Delta * 9);
  ApplyRelativeBoneRotation("clavicle_l", 0.08, State.SmoothedSwayX * 0.10, 0.16);
  ApplyRelativeBoneRotation("clavicle_r", 0.08, State.SmoothedSwayX * 0.10, -0.16);
  ApplyRelativeBoneRotation("upperarm_l", -0.72 + State.SmoothedSwayY * 0.18, 0.10, 0.32);
  ApplyRelativeBoneRotation("upperarm_r", -0.72 + State.SmoothedSwayY * 0.18, -0.10, -0.32);
  ApplyRelativeBoneRotation("lowerarm_l", -0.28, 0, 0.06);
  ApplyRelativeBoneRotation("lowerarm_r", -0.28, 0, -0.06);
}

function UpdateCharacterTransform() {
  if (!State.CharacterReady || !State.Pivot || !State.Camera) return;
  State.Pivot.position.set(State.Camera.position.x, 0, State.Camera.position.z);
  State.Camera.getWorldDirection(State.TempDirection);
  State.TempDirection.y = 0;
  if (State.TempDirection.lengthSq() > 0.0001) {
    State.TempDirection.normalize();
    State.Pivot.rotation.y = Math.atan2(State.TempDirection.x, State.TempDirection.z) + Math.PI;
  }
}

function UpdateCharacter(Delta, Time) {
  if (!State.CharacterReady) return;
  UpdateCharacterTransform();
  const DesiredState = State.Sprinting ? "sprint" : State.Moving ? "walk" : "idle";
  if (State.Mixer && State.Actions.size) {
    SetAnimationState(DesiredState);
    State.Mixer.update(Delta);
  } else {
    ManualPose(Delta, Time);
  }
  const FirstPerson = State.ZoomDistance < 0.15;
  if (FirstPerson) ApplyFirstPersonPoseOffsets(Delta);
  SetViewVisibility(FirstPerson);
}

function SegmentAabbDistance(Start, End, Bounds) {
  const Direction = State.TempOffset.copy(End).sub(Start);
  let TMin = 0;
  let TMax = 1;
  for (const Axis of ["x", "y", "z"]) {
    const Origin = Start[Axis];
    const Delta = Direction[Axis];
    if (Math.abs(Delta) < 1e-8) {
      if (Origin < Bounds.min[Axis] || Origin > Bounds.max[Axis]) return null;
      continue;
    }
    let T1 = (Bounds.min[Axis] - Origin) / Delta;
    let T2 = (Bounds.max[Axis] - Origin) / Delta;
    if (T1 > T2) [T1, T2] = [T2, T1];
    TMin = Math.max(TMin, T1);
    TMax = Math.min(TMax, T2);
    if (TMin > TMax) return null;
  }
  return TMin;
}

function ResolveThirdPersonDistance(Target, Desired) {
  const Collisions = State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];
  let Allowed = Target.distanceTo(Desired);
  const SegmentLength = Math.max(Allowed, 0.001);
  for (const Entry of Collisions) {
    const Bounds = Entry?.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    const Expanded = Bounds.clone().expandByScalar(0.08);
    const T = SegmentAabbDistance(Target, Desired, Expanded);
    if (T === null) continue;
    Allowed = Math.min(Allowed, Math.max(0.38, T * SegmentLength - 0.12));
  }
  return Allowed;
}

function Render(Renderer, Scene, Camera) {
  if (!Camera || !Renderer) return;
  const ThirdPerson = State.ZoomDistance >= 0.15 && State.CharacterReady;
  State.ThirdPerson = ThirdPerson;
  SetViewVisibility(!ThirdPerson);
  if (!ThirdPerson) {
    Renderer.render(Scene, Camera);
    return;
  }
  State.SavedPosition.copy(Camera.position);
  State.SavedQuaternion.copy(Camera.quaternion);
  Camera.getWorldDirection(State.TempDirection);
  State.TempHorizontal.copy(State.TempDirection);
  State.TempHorizontal.y = 0;
  if (State.TempHorizontal.lengthSq() < 0.0001) State.TempHorizontal.set(0, 0, -1);
  State.TempHorizontal.normalize();
  State.TempTarget.copy(State.SavedPosition).addScaledVector(new THREE.Vector3(0, 1, 0), -0.42);
  State.TempDesired.copy(State.TempTarget)
    .addScaledVector(State.TempHorizontal, -State.ZoomDistance)
    .add(new THREE.Vector3(0, THIRD_PERSON_HEIGHT + State.ZoomDistance * 0.055, 0));
  const Allowed = ResolveThirdPersonDistance(State.TempTarget, State.TempDesired);
  State.TempOffset.copy(State.TempDesired).sub(State.TempTarget).normalize().multiplyScalar(Allowed);
  Camera.position.copy(State.TempTarget).add(State.TempOffset);
  Camera.lookAt(State.TempTarget.x, State.TempTarget.y + 0.12, State.TempTarget.z);
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
  if (Status) Status.textContent = "Loading rigged player...";
  try {
    const [CharacterGltf, AnimationGltf] = await Promise.all([
      Loader.loadAsync(PLAYER_MODEL_URL),
      Loader.loadAsync(ANIMATION_URL).catch(Error => {
        console.warn("Animation library unavailable; using procedural fallback pose.", Error);
        return null;
      })
    ]);
    const Model = CharacterGltf.scene;
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
    ApplyAnatomyDetail(Model);
    BuildFirstPersonArms(Model);
    const Pivot = new THREE.Group();
    Pivot.name = "PlayerCharacterPivot";
    Pivot.userData.SkipCameraCollision = true;
    Pivot.add(Model);
    State.Scene.add(Pivot);
    State.Pivot = Pivot;
    State.Model = Model;
    State.Mixer = new THREE.AnimationMixer(Model);
    if (AnimationGltf?.animations?.length) BuildAnimationActions(AnimationGltf.animations);
    if (State.Actions.has("idle")) {
      State.ActiveAction = State.Actions.get("idle");
      State.ActiveAction.play();
      State.AnimationState = "idle";
    }
    State.CharacterReady = true;
    SetViewVisibility(true);
    if (Status && Status.textContent === "Loading rigged player...") Status.textContent = PreviousStatus || "Player ready.";
  } catch (Error) {
    console.error("Player model failed to load", Error);
    if (Status) Status.textContent = "Store ready — player body failed to load.";
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
  const Now = NowMs / 1000;
  State.ZoomDistance = THREE.MathUtils.lerp(State.ZoomDistance, State.ZoomTarget, 1 - Math.exp(-Delta * 10));
  UpdateStamina(Delta, Now);
  UpdateCharacter(Delta, Now);
  UpdateHud();
  requestAnimationFrame(Frame);
}

addEventListener("wheel", Event => {
  if (!IsGameplayActive()) return;
  const Direction = Math.sign(Event.deltaY);
  State.ZoomTarget = THREE.MathUtils.clamp(State.ZoomTarget + Direction * 0.65, 0, MAX_CAMERA_DISTANCE);
}, { passive: true });

addEventListener("keydown", Event => {
  if (Event.code === "KeyV" && !Event.repeat) {
    State.ZoomTarget = State.ZoomTarget < 0.15 ? 4.2 : 0;
    Event.preventDefault();
  }
});

addEventListener("mousemove", Event => {
  if (!document.pointerLockElement) return;
  State.MouseSwayX = THREE.MathUtils.clamp(State.MouseSwayX + Event.movementX * 0.0014, -0.18, 0.18);
  State.MouseSwayY = THREE.MathUtils.clamp(State.MouseSwayY + Event.movementY * 0.0012, -0.14, 0.14);
});

window.__STORE_PLAYER__ = {
  Attach,
  Render,
  GetMovementSpeed,
  GetPlayerRadius,
  IsSprinting: () => State.Sprinting,
  GetStamina: () => State.Stamina,
  IsThirdPerson: () => State.ZoomTarget >= 0.15
};

window.__STORE_PLAYER_BUILD__ = "V0.08";
requestAnimationFrame(Frame);
