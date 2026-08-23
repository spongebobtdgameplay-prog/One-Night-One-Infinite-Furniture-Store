import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player controller must load before first-person viewmodel.");

const PLAYER_MODEL_URL = "https://raw.githubusercontent.com/euuuuuuan/fatal-funnel-public/main/packages/renderer/assets/models/quaternius-men/worker.glb";
const PLAYER_HEIGHT = 1.76;
const ARM_WEIGHT_THRESHOLD = 0.12;
const TRANSITION_DURATION = 0.26;
const VIEWMODEL_FOV = 78;
const VIEWMODEL_CENTER = new THREE.Vector3(0, -0.10, -1.35);
const MAX_VIEW_WIDTH = 1.25;
const MAX_VIEW_HEIGHT = 1.12;

const ViewScene = new THREE.Scene();
const ViewCamera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 1, 0.01, 8);
ViewCamera.position.set(0, 0, 0);
ViewCamera.lookAt(0, 0, -1);
ViewScene.add(new THREE.HemisphereLight(0xfff0d8, 0x2b251f, 1.55));
const ViewLight = new THREE.DirectionalLight(0xffe3bd, 1.1);
ViewLight.position.set(-2.2, 3.0, 1.7);
ViewScene.add(ViewLight);

const State = {
  Scene: null,
  Camera: null,
  Pivot: null,
  WorldBodyMeshes: [],
  WorldArmMeshes: [],
  WorldMeshCount: -1,
  LastThirdPerson: null,
  TransitionStart: 0,
  BodyOpacity: 0,
  ArmOpacity: 1,
  FromBodyOpacity: 0,
  FromArmOpacity: 1,
  ViewRoot: null,
  RealArmMeshes: [],
  Bones: new Map(),
  BaseBoneQuaternions: new Map(),
  FallbackRoot: null,
  FallbackJoints: new Map(),
  UseFallback: false,
  Ready: false,
  Loading: false,
  LastFrameAt: performance.now(),
  LastPosition: new THREE.Vector3(),
  HasPosition: false,
  SmoothedSpeed: 0,
  Phase: 0,
  MouseX: 0,
  MouseY: 0,
  SmoothMouseX: 0,
  SmoothMouseY: 0,
  BaseRootPosition: new THREE.Vector3(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion(),
  TempVector: new THREE.Vector3(),
  TempBounds: new THREE.Box3(),
  TempCenter: new THREE.Vector3(),
  TempSize: new THREE.Vector3(),
  Frustum: new THREE.Frustum(),
  Projection: new THREE.Matrix4()
};

const Loader = new GLTFLoader();

function Ease(Value) {
  const T = THREE.MathUtils.clamp(Value, 0, 1);
  return T * T * (3 - 2 * T);
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
  let Kept = 0;

  for (let Triangle = 0; Triangle < TriangleCount; Triangle += 1) {
    const Offset = Triangle * 3;
    const A = SourceIndex ? SourceIndex.getX(Offset) : Offset;
    const B = SourceIndex ? SourceIndex.getX(Offset + 1) : Offset + 1;
    const C = SourceIndex ? SourceIndex.getX(Offset + 2) : Offset + 2;
    const WA = BoneWeight(SkinIndex, SkinWeight, A, ArmBones);
    const WB = BoneWeight(SkinIndex, SkinWeight, B, ArmBones);
    const WC = BoneWeight(SkinIndex, SkinWeight, C, ArmBones);
    if (Math.max(WA, WB, WC) < ARM_WEIGHT_THRESHOLD) continue;
    if ((WA + WB + WC) / 3 < 0.07) continue;
    const MaterialIndex = MaterialIndexAt(Geometry, Offset);
    if (!Buckets.has(MaterialIndex)) Buckets.set(MaterialIndex, []);
    Buckets.get(MaterialIndex).push(A, B, C);
    Kept += 1;
  }

  if (Kept < 4) return null;

  const ArmGeometry = Geometry.clone();
  ArmGeometry.clearGroups();
  const Indices = [];
  for (const [MaterialIndex, Bucket] of [...Buckets.entries()].sort((A, B) => A[0] - B[0])) {
    const Start = Indices.length;
    Indices.push(...Bucket);
    ArmGeometry.addGroup(Start, Bucket.length, MaterialIndex);
  }
  ArmGeometry.setIndex(Indices);
  ArmGeometry.computeBoundingSphere();

  const Sources = Array.isArray(Object.material) ? Object.material : [Object.material];
  const Materials = Sources.map(Source => {
    const Material = Source.clone();
    Material.transparent = true;
    Material.opacity = 1;
    Material.depthTest = false;
    Material.depthWrite = false;
    Material.side = THREE.DoubleSide;
    Material.needsUpdate = true;
    return Material;
  });

  const Arms = new THREE.SkinnedMesh(ArmGeometry, Array.isArray(Object.material) ? Materials : Materials[0]);
  Arms.name = `${Object.name || "Worker"}_CameraArms`;
  Arms.bindMode = Object.bindMode;
  Arms.bind(Object.skeleton, Object.bindMatrix);
  Arms.bindMatrixInverse.copy(Object.bindMatrixInverse);
  Arms.position.copy(Object.position);
  Arms.quaternion.copy(Object.quaternion);
  Arms.scale.copy(Object.scale);
  Arms.frustumCulled = false;
  Arms.renderOrder = 100;
  return Arms;
}

function SetupBones(Model) {
  const Names = {
    ShoulderL: "Shoulder.L",
    UpperArmL: "UpperArm.L",
    LowerArmL: "LowerArm.L",
    WristL: "Wrist.L",
    ShoulderR: "Shoulder.R",
    UpperArmR: "UpperArm.R",
    LowerArmR: "LowerArm.R",
    WristR: "Wrist.R"
  };
  for (const [Key, Name] of Object.entries(Names)) {
    const Bone = Model.getObjectByName(Name);
    if (!Bone?.isBone) continue;
    State.Bones.set(Key, Bone);
    State.BaseBoneQuaternions.set(Key, Bone.quaternion.clone());
  }
}

function ResetBones() {
  for (const [Name, Bone] of State.Bones) {
    const Base = State.BaseBoneQuaternions.get(Name);
    if (Base) Bone.quaternion.copy(Base);
  }
}

function ApplyBone(Name, X = 0, Y = 0, Z = 0) {
  const Bone = State.Bones.get(Name);
  if (!Bone) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion);
}

function ArmBounds() {
  State.TempBounds.makeEmpty();
  for (const Mesh of State.RealArmMeshes) {
    Mesh.updateMatrixWorld(true);
    const Position = Mesh.geometry.getAttribute("position");
    const Index = Mesh.geometry.index;
    if (!Position || !Index) continue;
    const Seen = new Set();
    for (let Offset = 0; Offset < Index.count; Offset += 1) {
      const Vertex = Index.getX(Offset);
      if (Seen.has(Vertex)) continue;
      Seen.add(Vertex);
      State.TempVector.fromBufferAttribute(Position, Vertex).applyMatrix4(Mesh.matrixWorld);
      State.TempBounds.expandByPoint(State.TempVector);
    }
  }
  return State.TempBounds;
}

function FitRealArms() {
  if (!State.ViewRoot || !State.RealArmMeshes.length) return false;
  State.ViewRoot.position.set(0, 0, 0);
  State.ViewRoot.rotation.set(0, Math.PI, 0);
  State.ViewRoot.scale.setScalar(1);
  State.ViewRoot.updateMatrixWorld(true);

  let Bounds = ArmBounds();
  if (Bounds.isEmpty()) return false;
  Bounds.getSize(State.TempSize);

  const Scale = THREE.MathUtils.clamp(Math.min(
    MAX_VIEW_WIDTH / Math.max(State.TempSize.x, 0.01),
    MAX_VIEW_HEIGHT / Math.max(State.TempSize.y, 0.01),
    1
  ), 0.58, 1);
  State.ViewRoot.scale.setScalar(Scale);
  State.ViewRoot.updateMatrixWorld(true);

  Bounds = ArmBounds();
  Bounds.getCenter(State.TempCenter);
  State.ViewRoot.position.set(
    VIEWMODEL_CENTER.x - State.TempCenter.x,
    VIEWMODEL_CENTER.y - State.TempCenter.y,
    VIEWMODEL_CENTER.z - State.TempCenter.z
  );
  State.BaseRootPosition.copy(State.ViewRoot.position);
  State.ViewRoot.updateMatrixWorld(true);

  Bounds = ArmBounds();
  ViewCamera.updateProjectionMatrix();
  ViewCamera.updateMatrixWorld(true);
  State.Projection.multiplyMatrices(ViewCamera.projectionMatrix, ViewCamera.matrixWorldInverse);
  State.Frustum.setFromProjectionMatrix(State.Projection);
  return !Bounds.isEmpty() && State.Frustum.intersectsBox(Bounds) && Bounds.min.z < -0.05;
}

function CreateFallbackArm(Side) {
  const Sign = Side === "Left" ? -1 : 1;
  const Shoulder = new THREE.Group();
  Shoulder.position.set(Sign * 0.43, -0.24, -0.82);
  Shoulder.rotation.z = Sign * -0.18;

  const SleeveMaterial = new THREE.MeshStandardMaterial({ color: 0xc86431, roughness: 0.82, metalness: 0, depthTest: false, depthWrite: false });
  const SkinMaterial = new THREE.MeshStandardMaterial({ color: 0xb88261, roughness: 0.88, metalness: 0, depthTest: false, depthWrite: false });

  const Upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.30, 5, 10), SleeveMaterial);
  Upper.position.y = -0.20;
  Upper.renderOrder = 100;
  Shoulder.add(Upper);

  const Elbow = new THREE.Group();
  Elbow.position.y = -0.39;
  Shoulder.add(Elbow);

  const Forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.30, 5, 10), SkinMaterial);
  Forearm.position.y = -0.19;
  Forearm.renderOrder = 100;
  Elbow.add(Forearm);

  const Hand = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), SkinMaterial);
  Hand.scale.set(0.80, 1.20, 0.72);
  Hand.position.y = -0.40;
  Hand.renderOrder = 100;
  Elbow.add(Hand);

  State.FallbackJoints.set(`Shoulder${Side}`, Shoulder);
  State.FallbackJoints.set(`Elbow${Side}`, Elbow);
  return Shoulder;
}

function BuildFallback() {
  const Root = new THREE.Group();
  Root.name = "GuaranteedFirstPersonArms";
  Root.add(CreateFallbackArm("Left"));
  Root.add(CreateFallbackArm("Right"));
  ViewScene.add(Root);
  State.FallbackRoot = Root;
}

function SetArmOpacity(Value) {
  const Opacity = THREE.MathUtils.clamp(Value, 0, 1);
  for (const Mesh of State.RealArmMeshes) {
    Mesh.visible = !State.UseFallback && Opacity > 0.01;
    const Materials = Array.isArray(Mesh.material) ? Mesh.material : [Mesh.material];
    for (const Material of Materials) Material.opacity = Opacity;
  }
  if (State.FallbackRoot) {
    State.FallbackRoot.visible = State.UseFallback && Opacity > 0.01;
    State.FallbackRoot.traverse(Object => {
      if (!Object.isMesh) return;
      const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
      for (const Material of Materials) {
        Material.transparent = Opacity < 0.995;
        Material.opacity = Opacity;
      }
    });
  }
}

function UpdateMotion(Delta, Camera) {
  if (!State.HasPosition) {
    State.LastPosition.copy(Camera.position);
    State.HasPosition = true;
  }
  const DX = Camera.position.x - State.LastPosition.x;
  const DZ = Camera.position.z - State.LastPosition.z;
  State.LastPosition.copy(Camera.position);
  const Speed = Math.hypot(DX, DZ) / Math.max(Delta, 0.001);
  State.SmoothedSpeed = THREE.MathUtils.lerp(State.SmoothedSpeed, Speed, 1 - Math.exp(-Delta * 10));
  const Moving = State.SmoothedSpeed > 0.10;
  const Sprinting = Boolean(BasePlayer.IsSprinting?.());
  const Ratio = THREE.MathUtils.clamp(State.SmoothedSpeed / (Sprinting ? 5.3 : 3.45), 0, 1.15);
  State.Phase += Delta * (Moving ? THREE.MathUtils.lerp(5.4, Sprinting ? 9.5 : 7.1, Ratio) : 1.1);

  State.SmoothMouseX = THREE.MathUtils.lerp(State.SmoothMouseX, State.MouseX, 1 - Math.exp(-Delta * 18));
  State.SmoothMouseY = THREE.MathUtils.lerp(State.SmoothMouseY, State.MouseY, 1 - Math.exp(-Delta * 18));
  State.MouseX *= Math.exp(-Delta * 10);
  State.MouseY *= Math.exp(-Delta * 10);

  const Swing = Moving ? Math.sin(State.Phase) : 0;
  const Step = Moving ? Math.sin(State.Phase * 2 + 0.55) : Math.sin(performance.now() * 0.0018) * 0.12;
  const Breath = Math.sin(performance.now() * 0.0016) * 0.012;
  const SwingAmount = (Sprinting ? 0.25 : 0.16) * Ratio;

  if (!State.UseFallback) {
    ResetBones();
    ApplyBone("ShoulderL", 0.04 + Breath, State.SmoothMouseX * 0.08, 0.14);
    ApplyBone("ShoulderR", 0.04 + Breath, State.SmoothMouseX * 0.08, -0.14);
    ApplyBone("UpperArmL", -0.76 + Swing * SwingAmount, 0.08, 0.30);
    ApplyBone("UpperArmR", -0.76 - Swing * SwingAmount, -0.08, -0.30);
    ApplyBone("LowerArmL", -0.40 + Math.max(0, -Swing) * 0.11 + State.SmoothMouseY * 0.10, 0, 0.05);
    ApplyBone("LowerArmR", -0.40 + Math.max(0, Swing) * 0.11 + State.SmoothMouseY * 0.10, 0, -0.05);
    ApplyBone("WristL", Step * 0.035, 0, 0);
    ApplyBone("WristR", -Step * 0.035, 0, 0);

    State.ViewRoot.position.copy(State.BaseRootPosition);
    State.ViewRoot.position.x -= State.SmoothMouseX * 0.13 + Swing * 0.012 * Ratio;
    State.ViewRoot.position.y += State.SmoothMouseY * 0.07 + Math.abs(Step) * 0.010 * Ratio;
    State.ViewRoot.rotation.set(State.SmoothMouseY * 0.025, Math.PI, -State.SmoothMouseX * 0.045);
  } else if (State.FallbackRoot) {
    const LeftShoulder = State.FallbackJoints.get("ShoulderLeft");
    const RightShoulder = State.FallbackJoints.get("ShoulderRight");
    const LeftElbow = State.FallbackJoints.get("ElbowLeft");
    const RightElbow = State.FallbackJoints.get("ElbowRight");
    if (LeftShoulder) LeftShoulder.rotation.set(-0.22 + Swing * SwingAmount, State.SmoothMouseX * 0.06, 0.18);
    if (RightShoulder) RightShoulder.rotation.set(-0.22 - Swing * SwingAmount, State.SmoothMouseX * 0.06, -0.18);
    if (LeftElbow) LeftElbow.rotation.x = -0.52 + Math.max(0, -Swing) * 0.16 + State.SmoothMouseY * 0.08;
    if (RightElbow) RightElbow.rotation.x = -0.52 + Math.max(0, Swing) * 0.16 + State.SmoothMouseY * 0.08;
    State.FallbackRoot.position.set(-State.SmoothMouseX * 0.10, State.SmoothMouseY * 0.06 + Math.abs(Step) * 0.012, 0);
    State.FallbackRoot.rotation.z = -State.SmoothMouseX * 0.035;
  }
}

function PrepareWorldMaterial(Mesh) {
  if (Mesh.userData.ViewFadeReady) return;
  const Sources = Array.isArray(Mesh.material) ? Mesh.material : [Mesh.material];
  const Materials = Sources.map(Source => {
    const Material = Source.clone();
    Material.needsUpdate = true;
    return Material;
  });
  Mesh.material = Array.isArray(Mesh.material) ? Materials : Materials[0];
  Mesh.userData.ViewFadeReady = true;
}

function SetWorldOpacity(Mesh, Opacity) {
  const Value = THREE.MathUtils.clamp(Opacity, 0, 1);
  Mesh.visible = Value > 0.01;
  if (!Mesh.visible) return;
  PrepareWorldMaterial(Mesh);
  const Materials = Array.isArray(Mesh.material) ? Mesh.material : [Mesh.material];
  for (const Material of Materials) {
    Material.transparent = Value < 0.995;
    Material.opacity = Value;
    Material.depthWrite = Value > 0.92;
  }
}

function RefreshWorldRig() {
  if (!State.Scene) return;
  const Pivot = State.Scene.getObjectByName("PlayerCharacterPivot") || null;
  if (!Pivot) return;
  let Count = 0;
  Pivot.traverse(Object => { if (Object.isMesh) Count += 1; });
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
  for (const Mesh of State.WorldBodyMeshes) SetWorldOpacity(Mesh, State.BodyOpacity);
}

function UpdateTransition(ThirdPerson, Now) {
  if (State.LastThirdPerson === null) {
    State.LastThirdPerson = ThirdPerson;
    State.BodyOpacity = ThirdPerson ? 1 : 0;
    State.ArmOpacity = ThirdPerson ? 0 : 1;
    return;
  }
  if (ThirdPerson !== State.LastThirdPerson) {
    State.LastThirdPerson = ThirdPerson;
    State.TransitionStart = Now;
    State.FromBodyOpacity = State.BodyOpacity;
    State.FromArmOpacity = State.ArmOpacity;
  }
  const Raw = (Now - State.TransitionStart) / (TRANSITION_DURATION * 1000);
  if (Raw >= 1 || State.TransitionStart === 0) {
    State.BodyOpacity = ThirdPerson ? 1 : 0;
    State.ArmOpacity = ThirdPerson ? 0 : 1;
    return;
  }
  const Blend = Ease(Raw);
  State.BodyOpacity = THREE.MathUtils.lerp(State.FromBodyOpacity, ThirdPerson ? 1 : 0, Blend);
  State.ArmOpacity = THREE.MathUtils.lerp(State.FromArmOpacity, ThirdPerson ? 0 : 1, Blend);
}

async function LoadViewModel() {
  if (State.Loading || State.Ready) return;
  State.Loading = true;
  BuildFallback();

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
    SetupBones(Model);

    const Additions = [];
    Model.traverse(Object => {
      if (!Object.isMesh) return;
      Object.visible = false;
      const Arms = BuildArmMesh(Object);
      if (Arms) Additions.push([Object.parent, Arms]);
    });
    for (const [Parent, Arms] of Additions) {
      Parent.add(Arms);
      State.RealArmMeshes.push(Arms);
    }

    const Root = new THREE.Group();
    Root.name = "RealFirstPersonWorkerArms";
    Root.rotation.y = Math.PI;
    Root.add(Model);
    ViewScene.add(Root);
    State.ViewRoot = Root;
    Root.updateMatrixWorld(true);

    State.UseFallback = !FitRealArms();
  } catch (Error) {
    console.error("Real first-person arms failed; using guaranteed fallback.", Error);
    State.UseFallback = true;
  } finally {
    State.Ready = true;
    State.Loading = false;
  }
}

function Attach(Context) {
  State.Scene = Context.Scene;
  State.Camera = Context.Camera;
  BasePlayer.Attach(Context);
  LoadViewModel();
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene;
  State.Camera = Camera;

  const Now = performance.now();
  const Delta = Math.min((Now - State.LastFrameAt) / 1000, 0.05);
  State.LastFrameAt = Now;
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

  if (!State.Ready || State.ArmOpacity <= 0.01) return;
  UpdateMotion(Delta, Camera);
  SetArmOpacity(State.ArmOpacity);
  ViewCamera.aspect = Camera.aspect;
  ViewCamera.updateProjectionMatrix();
  const PreviousAutoClear = Renderer.autoClear;
  Renderer.autoClear = false;
  Renderer.clearDepth();
  Renderer.render(ViewScene, ViewCamera);
  Renderer.autoClear = PreviousAutoClear;
}

addEventListener("mousemove", Event => {
  if (!document.pointerLockElement && !(window.__STORE_PLAYER__?.IsThirdPerson?.() && (Event.buttons & 2))) return;
  State.MouseX = THREE.MathUtils.clamp(State.MouseX + Event.movementX * 0.00135, -0.22, 0.22);
  State.MouseY = THREE.MathUtils.clamp(State.MouseY + Event.movementY * 0.00115, -0.18, 0.18);
});

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render
};
window.__STORE_VIEWMODEL_BUILD__ = "V0.11-R10";
LoadViewModel();
