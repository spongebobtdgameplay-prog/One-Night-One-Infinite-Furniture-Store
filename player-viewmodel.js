import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const BasePlayer = window.__STORE_PLAYER__;

if (!BasePlayer) throw new Error("Player controller must load before first-person viewmodel.");

const PLAYER_MODEL_URL = "https://raw.githubusercontent.com/euuuuuuan/fatal-funnel-public/main/packages/renderer/assets/models/quaternius-men/worker.glb";
const PLAYER_HEIGHT = 1.76;
const ARM_WEIGHT_THRESHOLD = 0.16;
const TRANSITION_DURATION = 0.30;
const VIEWMODEL_FOV = 70;
const VIEWMODEL_CENTER = new THREE.Vector3(0, -0.54, -0.82);

const ViewScene = new THREE.Scene();
const ViewCamera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 1, 0.01, 6);
ViewCamera.position.set(0, 0, 0);
ViewCamera.lookAt(0, 0, -1);
ViewScene.add(new THREE.HemisphereLight(0xfff0d8, 0x2b251f, 1.62));
const ViewLight = new THREE.DirectionalLight(0xffe4bd, 1.18);
ViewLight.position.set(-2.2, 3.0, 1.8);
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
  ViewRoot: null,
  ViewArmMeshes: [],
  ViewBones: new Map(),
  ViewBaseBoneQuaternions: new Map(),
  ViewReady: false,
  ViewLoading: false,
  LastRenderAt: performance.now(),
  LastLogicalPosition: new THREE.Vector3(),
  HasLogicalPosition: false,
  SmoothedSpeed: 0,
  Moving: false,
  MotionPhase: 0,
  MouseX: 0,
  MouseY: 0,
  SmoothedMouseX: 0,
  SmoothedMouseY: 0,
  BaseViewPosition: new THREE.Vector3(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion(),
  TempVector: new THREE.Vector3(),
  TempCenter: new THREE.Vector3(),
  TempSize: new THREE.Vector3(),
  TempBounds: new THREE.Box3()
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
    if (Math.max(WA, WB, WC) < ARM_WEIGHT_THRESHOLD) continue;
    if ((WA + WB + WC) / 3 < 0.08) continue;
    const MaterialIndex = MaterialIndexAt(Geometry, Offset);
    if (!Buckets.has(MaterialIndex)) Buckets.set(MaterialIndex, []);
    Buckets.get(MaterialIndex).push(A, B, C);
    KeptTriangles += 1;
  }

  if (KeptTriangles < 4) return null;

  const ArmGeometry = Geometry.clone();
  ArmGeometry.clearGroups();
  const Indices = [];
  for (const [MaterialIndex, Bucket] of [...Buckets.entries()].sort((Left, Right) => Left[0] - Right[0])) {
    const Start = Indices.length;
    Indices.push(...Bucket);
    ArmGeometry.addGroup(Start, Bucket.length, MaterialIndex);
  }
  ArmGeometry.setIndex(Indices);

  const SourceMaterials = Array.isArray(Object.material) ? Object.material : [Object.material];
  const Materials = SourceMaterials.map(Material => {
    const Clone = Material.clone();
    Clone.transparent = true;
    Clone.opacity = 1;
    Clone.depthTest = false;
    Clone.depthWrite = false;
    Clone.side = THREE.DoubleSide;
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
  Arms.renderOrder = 100;
  Arms.userData.ViewIndices = Indices;
  return Arms;
}

function SetupViewBones(Model) {
  const BoneMap = {
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
}

function ResetViewBones() {
  for (const [Name, Bone] of State.ViewBones) {
    const Base = State.ViewBaseBoneQuaternions.get(Name);
    if (Base) Bone.quaternion.copy(Base);
  }
}

function ApplyBone(Name, X = 0, Y = 0, Z = 0) {
  const Bone = State.ViewBones.get(Name);
  if (!Bone) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion);
}

function ComputeArmBounds() {
  State.TempBounds.makeEmpty();

  for (const Arms of State.ViewArmMeshes) {
    Arms.updateMatrixWorld(true);
    const Position = Arms.geometry.getAttribute("position");
    const Index = Arms.geometry.index;
    if (!Position || !Index) continue;

    const Seen = new Set();
    for (let Offset = 0; Offset < Index.count; Offset += 1) {
      const VertexIndex = Index.getX(Offset);
      if (Seen.has(VertexIndex)) continue;
      Seen.add(VertexIndex);
      State.TempVector.fromBufferAttribute(Position, VertexIndex).applyMatrix4(Arms.matrixWorld);
      State.TempBounds.expandByPoint(State.TempVector);
    }
  }

  return State.TempBounds;
}

function FitViewModelToCamera() {
  if (!State.ViewRoot || !State.ViewArmMeshes.length) return;
  State.ViewRoot.position.set(0, 0, 0);
  State.ViewRoot.rotation.set(0, Math.PI, 0);
  State.ViewRoot.scale.setScalar(1);
  State.ViewRoot.updateMatrixWorld(true);

  const Bounds = ComputeArmBounds();
  if (Bounds.isEmpty()) return;

  Bounds.getCenter(State.TempCenter);
  Bounds.getSize(State.TempSize);

  const WidthScale = State.TempSize.x > 1.55 ? 1.55 / State.TempSize.x : State.TempSize.x < 0.72 ? 0.72 / Math.max(State.TempSize.x, 0.01) : 1;
  const Scale = THREE.MathUtils.clamp(WidthScale, 0.82, 1.18);
  State.ViewRoot.scale.setScalar(Scale);
  State.ViewRoot.updateMatrixWorld(true);

  const ScaledBounds = ComputeArmBounds();
  ScaledBounds.getCenter(State.TempCenter);
  State.ViewRoot.position.set(
    VIEWMODEL_CENTER.x - State.TempCenter.x,
    VIEWMODEL_CENTER.y - State.TempCenter.y,
    VIEWMODEL_CENTER.z - State.TempCenter.z
  );
  State.BaseViewPosition.copy(State.ViewRoot.position);
  State.ViewRoot.updateMatrixWorld(true);
}

function SetViewOpacity(Opacity) {
  const Value = THREE.MathUtils.clamp(Opacity, 0, 1);
  for (const Mesh of State.ViewArmMeshes) {
    Mesh.visible = Value > 0.01;
    const Materials = Array.isArray(Mesh.material) ? Mesh.material : [Mesh.material];
    for (const Material of Materials) {
      if (!Material) continue;
      Material.opacity = Value;
      Material.transparent = true;
      Material.depthTest = false;
      Material.depthWrite = false;
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
  const InstantSpeed = Math.hypot(DX, DZ) / Math.max(Delta, 0.001);
  State.SmoothedSpeed = THREE.MathUtils.lerp(State.SmoothedSpeed, InstantSpeed, 1 - Math.exp(-Delta * 11));
  State.Moving = State.SmoothedSpeed > 0.10;

  const Sprinting = Boolean(BasePlayer.IsSprinting?.());
  const SpeedRatio = THREE.MathUtils.clamp(State.SmoothedSpeed / (Sprinting ? 5.3 : 3.45), 0, 1.15);
  State.MotionPhase += Delta * (State.Moving ? THREE.MathUtils.lerp(5.2, Sprinting ? 9.6 : 7.0, SpeedRatio) : 1.15);

  State.SmoothedMouseX = THREE.MathUtils.lerp(State.SmoothedMouseX, State.MouseX, 1 - Math.exp(-Delta * 18));
  State.SmoothedMouseY = THREE.MathUtils.lerp(State.SmoothedMouseY, State.MouseY, 1 - Math.exp(-Delta * 18));
  State.MouseX *= Math.exp(-Delta * 11);
  State.MouseY *= Math.exp(-Delta * 11);

  ResetViewBones();

  const Swing = State.Moving ? Math.sin(State.MotionPhase) : 0;
  const Step = State.Moving ? Math.sin(State.MotionPhase * 2 + 0.55) : Math.sin(performance.now() * 0.0018) * 0.14;
  const Breath = Math.sin(performance.now() * 0.00165) * 0.014;
  const SwingAmount = (Sprinting ? 0.26 : 0.17) * SpeedRatio;
  const SprintDrop = Sprinting ? 0.11 * SpeedRatio : 0;

  ApplyBone("clavicle_l", 0.055 + Breath + Step * 0.012, State.SmoothedMouseX * 0.10, 0.18);
  ApplyBone("clavicle_r", 0.055 + Breath - Step * 0.012, State.SmoothedMouseX * 0.10, -0.18);
  ApplyBone("upperarm_l", -0.88 - SprintDrop + Swing * SwingAmount, 0.10, 0.38);
  ApplyBone("upperarm_r", -0.88 - SprintDrop - Swing * SwingAmount, -0.10, -0.38);
  ApplyBone("lowerarm_l", -0.46 + Math.max(0, -Swing) * 0.14 + State.SmoothedMouseY * 0.12, 0.02, 0.06);
  ApplyBone("lowerarm_r", -0.46 + Math.max(0, Swing) * 0.14 + State.SmoothedMouseY * 0.12, -0.02, -0.06);
  ApplyBone("hand_l", Step * 0.045, State.SmoothedMouseX * 0.03, 0.018);
  ApplyBone("hand_r", -Step * 0.045, State.SmoothedMouseX * 0.03, -0.018);

  State.ViewRoot.position.copy(State.BaseViewPosition);
  State.ViewRoot.position.x -= State.SmoothedMouseX * 0.16 + Swing * 0.018 * SpeedRatio;
  State.ViewRoot.position.y += State.SmoothedMouseY * 0.10 + Math.abs(Step) * 0.014 * SpeedRatio;
  State.ViewRoot.position.z += Sprinting ? -0.05 : 0;
  State.ViewRoot.rotation.set(
    State.SmoothedMouseY * 0.04,
    Math.PI,
    -State.SmoothedMouseX * 0.06 + Swing * 0.008 * SpeedRatio
  );
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
    Model.scale.setScalar(PLAYER_HEIGHT / Math.max(RawSize.y, 0.001));
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
    Root.updateMatrixWorld(true);

    FitViewModelToCamera();
    State.ViewReady = State.ViewArmMeshes.length > 0 && !ComputeArmBounds().isEmpty();

    if (!State.ViewReady) console.error("First-person arm extraction failed.");
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

function UpdateTransition(ThirdPerson, Now) {
  if (State.LastModeThirdPerson === null) {
    State.LastModeThirdPerson = ThirdPerson;
    State.BodyOpacity = ThirdPerson ? 1 : 0;
    State.ViewOpacity = ThirdPerson ? 0 : 1;
    return;
  }

  if (ThirdPerson !== State.LastModeThirdPerson) {
    State.LastModeThirdPerson = ThirdPerson;
    State.TransitionActive = true;
    State.TransitionStartedAt = Now;
    State.FromBodyOpacity = State.BodyOpacity;
    State.FromViewOpacity = State.ViewOpacity;
  }

  if (!State.TransitionActive) {
    State.BodyOpacity = ThirdPerson ? 1 : 0;
    State.ViewOpacity = ThirdPerson ? 0 : 1;
    return;
  }

  const Raw = (Now - State.TransitionStartedAt) / (TRANSITION_DURATION * 1000);
  const Blend = Ease(Raw);
  State.BodyOpacity = THREE.MathUtils.lerp(State.FromBodyOpacity, ThirdPerson ? 1 : 0, Blend);
  State.ViewOpacity = THREE.MathUtils.lerp(State.FromViewOpacity, ThirdPerson ? 0 : 1, Blend);

  if (Raw >= 1) {
    State.TransitionActive = false;
    State.BodyOpacity = ThirdPerson ? 1 : 0;
    State.ViewOpacity = ThirdPerson ? 0 : 1;
  }
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
  UpdateTransition(ThirdPerson, Now);

  const OriginalRender = Renderer.render;
  Renderer.render = function(RenderScene, RenderCamera) {
    if (RenderCamera === Camera) ApplyWorldVisibility();
    return OriginalRender.call(Renderer, RenderScene, RenderCamera);
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
  State.MouseX = THREE.MathUtils.clamp(State.MouseX + Event.movementX * 0.00135, -0.22, 0.22);
  State.MouseY = THREE.MathUtils.clamp(State.MouseY + Event.movementY * 0.00115, -0.18, 0.18);
});

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render
};

window.__STORE_VIEWMODEL_BUILD__ = "V0.11-R9";
LoadViewModel();
