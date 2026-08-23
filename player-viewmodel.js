import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const BasePlayer = window.__STORE_PLAYER__;

if (!BasePlayer) throw new Error("Player controller must load before first-person viewmodel.");

const PLAYER_MODEL_URL = "https://raw.githubusercontent.com/euuuuuuan/fatal-funnel-public/main/packages/renderer/assets/models/quaternius-men/worker.glb";
const PLAYER_HEIGHT = 1.76;
const ARM_WEIGHT_THRESHOLD = 0.58;
const TRANSITION_DURATION = 0.38;
const VIEWMODEL_FOV = 76;
const VIEWMODEL_OFFSET = new THREE.Vector3(0, 0.11, -0.08);
const EYE_OFFSET = new THREE.Vector3(0, 0.045, 0.055);

const ViewScene = new THREE.Scene();
const ViewCamera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 1, 0.01, 8);
ViewCamera.position.set(0, 0, 0);
ViewCamera.lookAt(0, 0, -1);
ViewScene.add(new THREE.HemisphereLight(0xfff0d8, 0x2a241f, 1.65));
const ViewLight = new THREE.DirectionalLight(0xffe3bc, 1.15);
ViewLight.position.set(-2.4, 3.4, 2.2);
ViewScene.add(ViewLight);

const State = {
  Scene: null,
  Camera: null,
  Renderer: null,
  Pivot: null,
  WorldBodyMeshes: [],
  WorldArmMeshes: [],
  WorldMeshCount: -1,
  LastModeThirdPerson: null,
  TransitionActive: false,
  TransitionStartedAt: 0,
  BodyOpacity: 0,
  ViewOpacity: 1,
  FromBodyOpacity: 0,
  FromViewOpacity: 1,
  FromCameraPosition: new THREE.Vector3(),
  FromCameraQuaternion: new THREE.Quaternion(),
  LastRenderedPosition: new THREE.Vector3(),
  LastRenderedQuaternion: new THREE.Quaternion(),
  HasRenderedCamera: false,
  TempQuaternion: new THREE.Quaternion(),
  LastRenderAt: performance.now(),
  LastLogicalPosition: new THREE.Vector3(),
  HasLogicalPosition: false,
  Moving: false,
  MotionPhase: 0,
  MouseX: 0,
  MouseY: 0,
  SmoothedMouseX: 0,
  SmoothedMouseY: 0,
  ViewRoot: null,
  ViewModel: null,
  ViewHead: null,
  ViewArmMeshes: [],
  ViewBones: new Map(),
  ViewBaseBoneQuaternions: new Map(),
  ViewMixer: null,
  ViewActions: new Map(),
  ViewActiveAction: null,
  ViewAnimationState: "",
  ViewReady: false,
  ViewLoading: false,
  BaseViewPosition: new THREE.Vector3(),
  TempEuler: new THREE.Euler(),
  TempBoneQuaternion: new THREE.Quaternion(),
  TempEye: new THREE.Vector3(),
  TempPosition: new THREE.Vector3()
};

const Loader = new GLTFLoader();

function Ease(Value) {
  const Clamped = THREE.MathUtils.clamp(Value, 0, 1);
  return Clamped * Clamped * (3 - 2 * Clamped);
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

function BuildArmMesh(Object) {
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
      Name.includes("shoulder.") || Name.includes("upperarm.") || Name.includes("lowerarm.") ||
      Name.includes("wrist.") || Name.includes("thumb") || Name.includes("index") ||
      Name.includes("middle") || Name.includes("ring") || Name.includes("pinky")
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
    const WA = BoneWeight(SkinIndex, SkinWeight, A, ArmBones);
    const WB = BoneWeight(SkinIndex, SkinWeight, B, ArmBones);
    const WC = BoneWeight(SkinIndex, SkinWeight, C, ArmBones);
    if (Math.min(WA, WB, WC) < ARM_WEIGHT_THRESHOLD) continue;
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
    Clone.transparent = true;
    Clone.opacity = 1;
    Clone.depthTest = true;
    Clone.depthWrite = true;
    Clone.side = THREE.FrontSide;
    Clone.needsUpdate = true;
    return Clone;
  });

  const Arms = new THREE.SkinnedMesh(ArmGeometry, Array.isArray(Object.material) ? Materials : Materials[0]);
  Arms.name = `${Object.name || "Worker"}_ViewModelArms`;
  Arms.bindMode = Object.bindMode;
  Arms.bind(Object.skeleton, Object.bindMatrix);
  Arms.bindMatrixInverse.copy(Object.bindMatrixInverse);
  Arms.position.copy(Object.position);
  Arms.quaternion.copy(Object.quaternion);
  Arms.scale.copy(Object.scale);
  Arms.frustumCulled = false;
  Arms.renderOrder = 20;
  return Arms;
}

function SetupViewBones(Model) {
  const BoneMap = {
    Head: "Head",
    clavicle_l: "Shoulder.L",
    upperarm_l: "UpperArm.L",
    lowerarm_l: "LowerArm.L",
    hand_l: "Wrist.L",
    clavicle_r: "Shoulder.R",
    upperarm_r: "UpperArm.R",
    lowerarm_r: "LowerArm.R",
    hand_r: "Wrist.R"
  };
  for (const [CanonicalName, ActualName] of Object.entries(BoneMap)) {
    const Bone = Model.getObjectByName(ActualName);
    if (!Bone?.isBone) continue;
    State.ViewBones.set(CanonicalName, Bone);
    State.ViewBaseBoneQuaternions.set(CanonicalName, Bone.quaternion.clone());
  }
  State.ViewHead = State.ViewBones.get("Head") || null;
}

function PickClip(Clips, Patterns) {
  for (const Pattern of Patterns) {
    const Match = Clips.find(Clip => Pattern.test(Clip.name));
    if (Match) return Match;
  }
  return null;
}

function BuildViewActions(Clips) {
  if (!State.ViewMixer || !Clips?.length) return;
  const Definitions = {
    idle: [/idle/i],
    walk: [/walk/i, /jog/i],
    sprint: [/run/i, /sprint/i]
  };
  for (const [Name, Patterns] of Object.entries(Definitions)) {
    const Clip = PickClip(Clips, Patterns);
    if (!Clip) continue;
    const Action = State.ViewMixer.clipAction(Clip);
    Action.enabled = true;
    Action.setLoop(THREE.LoopRepeat, Infinity);
    State.ViewActions.set(Name, Action);
  }
}

function SetViewAnimation(Name) {
  if (State.ViewAnimationState === Name) return;
  State.ViewAnimationState = Name;
  const Next = State.ViewActions.get(Name);
  if (!Next) return;
  Next.reset().fadeIn(0.12).play();
  if (State.ViewActiveAction && State.ViewActiveAction !== Next) State.ViewActiveAction.fadeOut(0.12);
  State.ViewActiveAction = Next;
}

function ApplyRelativeViewBone(Name, X = 0, Y = 0, Z = 0) {
  const Bone = State.ViewBones.get(Name);
  if (!Bone) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempBoneQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempBoneQuaternion);
}

function ResetViewBones() {
  for (const [Name, Bone] of State.ViewBones) {
    const Base = State.ViewBaseBoneQuaternions.get(Name);
    if (Base) Bone.quaternion.copy(Base);
  }
}

function SetViewOpacity(Opacity) {
  const Value = THREE.MathUtils.clamp(Opacity, 0, 1);
  for (const Mesh of State.ViewArmMeshes) {
    Mesh.visible = Value > 0.01;
    const Materials = Array.isArray(Mesh.material) ? Mesh.material : [Mesh.material];
    for (const Material of Materials) {
      if (!Material) continue;
      Material.opacity = Value;
      Material.transparent = Value < 0.995;
      Material.depthWrite = Value > 0.92;
      Material.needsUpdate = true;
    }
  }
}

function UpdateViewModel(Delta, Camera) {
  if (!State.ViewReady || !State.ViewRoot) return;

  if (!State.HasLogicalPosition) {
    State.LastLogicalPosition.copy(Camera.position);
    State.HasLogicalPosition = true;
  }
  const DX = Camera.position.x - State.LastLogicalPosition.x;
  const DZ = Camera.position.z - State.LastLogicalPosition.z;
  State.LastLogicalPosition.copy(Camera.position);
  State.Moving = DX * DX + DZ * DZ > 0.0000008;

  const Sprinting = Boolean(BasePlayer.IsSprinting?.());
  State.MotionPhase += Delta * (State.Moving ? (Sprinting ? 10.5 : 6.8) : 1.2);
  const DesiredAnimation = Sprinting && State.Moving ? "sprint" : State.Moving ? "walk" : "idle";

  if (State.ViewMixer && State.ViewActions.size) {
    SetViewAnimation(DesiredAnimation);
    State.ViewMixer.update(Delta);
  } else {
    ResetViewBones();
  }

  State.SmoothedMouseX = THREE.MathUtils.lerp(State.SmoothedMouseX, State.MouseX, 1 - Math.exp(-Delta * 18));
  State.SmoothedMouseY = THREE.MathUtils.lerp(State.SmoothedMouseY, State.MouseY, 1 - Math.exp(-Delta * 18));
  State.MouseX *= Math.exp(-Delta * 11);
  State.MouseY *= Math.exp(-Delta * 11);

  const Swing = State.Moving ? Math.sin(State.MotionPhase) : 0;
  const Step = State.Moving ? Math.sin(State.MotionPhase * 2) : 0;
  const SprintLift = Sprinting ? 0.10 : 0;
  const SwingAmount = Sprinting ? 0.13 : 0.085;

  ApplyRelativeViewBone("clavicle_l", 0.025 + Step * 0.01, State.SmoothedMouseX * 0.07, 0.12);
  ApplyRelativeViewBone("clavicle_r", 0.025 - Step * 0.01, State.SmoothedMouseX * 0.07, -0.12);
  ApplyRelativeViewBone("upperarm_l", -0.60 - SprintLift + Swing * SwingAmount, 0.07, 0.27);
  ApplyRelativeViewBone("upperarm_r", -0.60 - SprintLift - Swing * SwingAmount, -0.07, -0.27);
  ApplyRelativeViewBone("lowerarm_l", -0.26 + Math.max(0, -Swing) * 0.055 + State.SmoothedMouseY * 0.09, 0, 0.035);
  ApplyRelativeViewBone("lowerarm_r", -0.26 + Math.max(0, Swing) * 0.055 + State.SmoothedMouseY * 0.09, 0, -0.035);
  ApplyRelativeViewBone("hand_l", Step * 0.018, 0, 0);
  ApplyRelativeViewBone("hand_r", -Step * 0.018, 0, 0);

  State.TempPosition.copy(State.BaseViewPosition);
  State.TempPosition.x -= State.SmoothedMouseX * 0.11;
  State.TempPosition.y += State.SmoothedMouseY * 0.07 + (State.Moving ? Math.abs(Step) * 0.012 : 0);
  State.ViewRoot.position.copy(State.TempPosition);
  State.ViewRoot.updateMatrixWorld(true);
}

async function LoadViewModel() {
  if (State.ViewLoading || State.ViewReady) return;
  State.ViewLoading = true;
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

    SetupViewBones(Model);

    const Additions = [];
    Model.traverse(Object => {
      if (!Object.isMesh) return;
      Object.visible = false;
      const Arms = BuildArmMesh(Object);
      if (Arms) Additions.push([Object.parent, Arms]);
    });
    for (const [Parent, Arms] of Additions) {
      Parent.add(Arms);
      State.ViewArmMeshes.push(Arms);
    }

    const Root = new THREE.Group();
    Root.name = "FirstPersonViewModelRoot";
    Root.rotation.y = Math.PI;
    Root.add(Model);
    ViewScene.add(Root);
    State.ViewRoot = Root;
    State.ViewModel = Model;
    State.ViewMixer = new THREE.AnimationMixer(Model);
    BuildViewActions(Gltf.animations || []);
    if (State.ViewActions.has("idle")) {
      State.ViewActiveAction = State.ViewActions.get("idle");
      State.ViewActiveAction.play();
      State.ViewAnimationState = "idle";
    }

    Root.updateMatrixWorld(true);
    if (State.ViewHead?.isBone) {
      State.TempEye.copy(EYE_OFFSET);
      State.ViewHead.localToWorld(State.TempEye);
      Root.position.sub(State.TempEye);
    }
    Root.position.add(VIEWMODEL_OFFSET);
    State.BaseViewPosition.copy(Root.position);
    Root.updateMatrixWorld(true);
    State.ViewReady = State.ViewArmMeshes.length > 0;
  } catch (Error) {
    console.error("First-person viewmodel failed to load", Error);
  } finally {
    State.ViewLoading = false;
  }
}

function PrepareWorldMaterial(Mesh) {
  if (Mesh.userData.RealViewFadeReady) return;
  const Source = Array.isArray(Mesh.material) ? Mesh.material : [Mesh.material];
  const Materials = Source.map(Material => {
    const Clone = Material.clone();
    Clone.opacity = 1;
    Clone.transparent = false;
    Clone.depthWrite = true;
    Clone.needsUpdate = true;
    return Clone;
  });
  Mesh.material = Array.isArray(Mesh.material) ? Materials : Materials[0];
  Mesh.userData.RealViewFadeReady = true;
}

function SetWorldMeshOpacity(Mesh, Opacity) {
  const Value = THREE.MathUtils.clamp(Opacity, 0, 1);
  Mesh.visible = Value > 0.01;
  if (!Mesh.visible) return;
  PrepareWorldMaterial(Mesh);
  const Materials = Array.isArray(Mesh.material) ? Mesh.material : [Mesh.material];
  for (const Material of Materials) {
    if (!Material) continue;
    Material.opacity = Value;
    Material.transparent = Value < 0.995;
    Material.depthWrite = Value > 0.92;
    Material.needsUpdate = true;
  }
}

function RefreshWorldRig() {
  if (!State.Scene) return;
  const Pivot = State.Scene.getObjectByName("PlayerCharacterPivot") || null;
  if (!Pivot) {
    State.Pivot = null;
    State.WorldBodyMeshes.length = 0;
    State.WorldArmMeshes.length = 0;
    State.WorldMeshCount = -1;
    return;
  }

  let Count = 0;
  Pivot.traverse(Object => {
    if (Object.isMesh) Count += 1;
  });
  if (Pivot === State.Pivot && Count === State.WorldMeshCount) return;

  State.Pivot = Pivot;
  State.WorldMeshCount = Count;
  State.WorldBodyMeshes.length = 0;
  State.WorldArmMeshes.length = 0;
  Pivot.traverse(Object => {
    if (!Object.isMesh) return;
    if ((Object.name || "").endsWith("_FirstPersonArms")) State.WorldArmMeshes.push(Object);
    else State.WorldBodyMeshes.push(Object);
  });
}

function ApplyWorldVisibility() {
  RefreshWorldRig();
  for (const Mesh of State.WorldArmMeshes) Mesh.visible = false;
  for (const Mesh of State.WorldBodyMeshes) SetWorldMeshOpacity(Mesh, State.BodyOpacity);
}

function BeginTransition(ThirdPerson, Now) {
  State.TransitionActive = true;
  State.TransitionStartedAt = Now;
  State.FromBodyOpacity = State.BodyOpacity;
  State.FromViewOpacity = State.ViewOpacity;
  if (State.HasRenderedCamera) {
    State.FromCameraPosition.copy(State.LastRenderedPosition);
    State.FromCameraQuaternion.copy(State.LastRenderedQuaternion);
  } else if (State.Camera) {
    State.FromCameraPosition.copy(State.Camera.position);
    State.FromCameraQuaternion.copy(State.Camera.quaternion);
  }
  State.LastModeThirdPerson = ThirdPerson;
}

function UpdateTransition(ThirdPerson, Now) {
  if (State.LastModeThirdPerson === null) {
    State.LastModeThirdPerson = ThirdPerson;
    State.BodyOpacity = ThirdPerson ? 1 : 0;
    State.ViewOpacity = ThirdPerson ? 0 : 1;
    return 1;
  }

  if (ThirdPerson !== State.LastModeThirdPerson) BeginTransition(ThirdPerson, Now);
  if (!State.TransitionActive) {
    State.BodyOpacity = ThirdPerson ? 1 : 0;
    State.ViewOpacity = ThirdPerson ? 0 : 1;
    return 1;
  }

  const Raw = (Now - State.TransitionStartedAt) / (TRANSITION_DURATION * 1000);
  const Blend = Ease(Raw);
  State.BodyOpacity = THREE.MathUtils.lerp(State.FromBodyOpacity, ThirdPerson ? 1 : 0, Blend);
  State.ViewOpacity = THREE.MathUtils.lerp(State.FromViewOpacity, ThirdPerson ? 0 : 1, Blend);
  if (Raw >= 1) {
    State.TransitionActive = false;
    State.BodyOpacity = ThirdPerson ? 1 : 0;
    State.ViewOpacity = ThirdPerson ? 0 : 1;
    return 1;
  }
  return Blend;
}

function RenderViewModel(Renderer, Camera, Delta) {
  if (!State.ViewReady || State.ViewOpacity <= 0.01) return;
  UpdateViewModel(Delta, Camera);
  SetViewOpacity(State.ViewOpacity);
  ViewCamera.aspect = Camera.aspect;
  ViewCamera.fov = VIEWMODEL_FOV;
  ViewCamera.updateProjectionMatrix();
  const PreviousAutoClear = Renderer.autoClear;
  Renderer.autoClear = false;
  Renderer.clearDepth();
  Renderer.render(ViewScene, ViewCamera);
  Renderer.autoClear = PreviousAutoClear;
}

function Attach(Context) {
  State.Scene = Context.Scene;
  State.Camera = Context.Camera;
  State.Renderer = Context.Renderer;
  BasePlayer.Attach(Context);
  LoadViewModel();
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene;
  State.Camera = Camera;
  State.Renderer = Renderer;

  const Now = performance.now();
  const Delta = Math.min((Now - State.LastRenderAt) / 1000, 0.05);
  State.LastRenderAt = Now;
  const ThirdPerson = Boolean(BasePlayer.IsThirdPerson?.());
  const Blend = UpdateTransition(ThirdPerson, Now);
  const OriginalRender = Renderer.render;

  Renderer.render = function(RenderScene, RenderCamera) {
    if (RenderCamera !== Camera) return OriginalRender.call(Renderer, RenderScene, RenderCamera);

    const DesiredPosition = RenderCamera.position.clone();
    const DesiredQuaternion = RenderCamera.quaternion.clone();
    if (State.TransitionActive) {
      RenderCamera.position.lerpVectors(State.FromCameraPosition, DesiredPosition, Blend);
      State.TempQuaternion.copy(State.FromCameraQuaternion).slerp(DesiredQuaternion, Blend);
      RenderCamera.quaternion.copy(State.TempQuaternion);
      RenderCamera.updateMatrixWorld(true);
    }

    ApplyWorldVisibility();
    State.LastRenderedPosition.copy(RenderCamera.position);
    State.LastRenderedQuaternion.copy(RenderCamera.quaternion);
    State.HasRenderedCamera = true;

    const Result = OriginalRender.call(Renderer, RenderScene, RenderCamera);
    RenderCamera.position.copy(DesiredPosition);
    RenderCamera.quaternion.copy(DesiredQuaternion);
    RenderCamera.updateMatrixWorld(true);
    return Result;
  };

  try {
    BasePlayer.Render(Renderer, Scene, Camera);
  } finally {
    Renderer.render = OriginalRender;
  }

  RenderViewModel(Renderer, Camera, Delta);
}

addEventListener("mousemove", Event => {
  if (!document.pointerLockElement) return;
  State.MouseX = THREE.MathUtils.clamp(State.MouseX + Event.movementX * 0.00125, -0.18, 0.18);
  State.MouseY = THREE.MathUtils.clamp(State.MouseY + Event.movementY * 0.00105, -0.14, 0.14);
});

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render
};

window.__STORE_VIEWMODEL_BUILD__ = "V0.11-R5";

LoadViewModel();
