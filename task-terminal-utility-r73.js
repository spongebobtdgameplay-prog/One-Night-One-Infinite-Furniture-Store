import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Create3DText } from "./three-text-utility-r73.js";

const KenneyCommit = "f78a38d01f3a47697ff144bfed0301df7f25c784";
const KenneyBase = `https://raw.githubusercontent.com/dennisorlando/junction-2025/${KenneyCommit}/models/mini-market/GLB%20format/`;
const KenneySource = "https://kenney.nl/assets/mini-market";
const Loader = new GLTFLoader();
let MachineTemplatePromise = null;

const LabelMaterial = new THREE.MeshStandardMaterial({
  color: 0xf0dfbc,
  roughness: 0.55,
  metalness: 0.03,
  emissive: 0x4d381c,
  emissiveIntensity: 0.10
});
const ScreenMaterial = new THREE.MeshStandardMaterial({
  color: 0x78bf89,
  roughness: 0.30,
  metalness: 0.04,
  emissive: 0x2f7541,
  emissiveIntensity: 1.05
});
const FrameMaterial = new THREE.MeshStandardMaterial({
  color: 0x7e8781,
  roughness: 0.54,
  metalness: 0.46
});

function BoundsOf(Object) {
  Object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Object);
}

function CloneMaterials(Root) {
  Root.traverse(Object => {
    if (!Object?.isMesh || !Object.material) return;
    const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
    const Copies = Materials.map(Material => {
      const Copy = Material.clone();
      if ("roughness" in Copy) Copy.roughness = Math.max(0.48, Copy.roughness ?? 0.68);
      Copy.needsUpdate = true;
      return Copy;
    });
    Object.material = Array.isArray(Object.material) ? Copies : Copies[0];
    Object.castShadow = false;
    Object.receiveShadow = true;
  });
}

async function LoadMachineTemplate() {
  if (!MachineTemplatePromise) {
    MachineTemplatePromise = Loader.loadAsync(`${KenneyBase}bottle-return.glb`).then(Gltf => {
      const Root = Gltf.scene;
      Root.name = "KenneyStoreMachineTemplateR90";
      CloneMaterials(Root);
      Root.userData.Source = KenneySource;
      Root.userData.License = "CC0-1.0";
      return Root;
    }).catch(Error => {
      MachineTemplatePromise = null;
      throw Error;
    });
  }
  return MachineTemplatePromise;
}

function NormalizeMachine(Object) {
  let Bounds = BoundsOf(Object);
  if (Bounds.isEmpty()) return false;
  const Size = Bounds.getSize(new THREE.Vector3());
  const Scale = Math.min(
    1.48 / Math.max(Size.y, 0.001),
    0.82 / Math.max(Size.x, 0.001),
    0.58 / Math.max(Size.z, 0.001)
  );
  Object.scale.multiplyScalar(Scale);
  Object.updateWorldMatrix(true, true);
  Bounds = BoundsOf(Object);
  const Center = Bounds.getCenter(new THREE.Vector3());
  Object.position.x -= Center.x;
  Object.position.z -= Center.z;
  Object.position.y -= Bounds.min.y;
  Object.updateWorldMatrix(true, true);
  return true;
}

async function CreateMachineBody() {
  const Template = await LoadMachineTemplate();
  const Machine = Template.clone(true);
  CloneMaterials(Machine);
  if (!NormalizeMachine(Machine)) throw new Error("Store machine model has invalid bounds.");
  Machine.name = "ImportedStoreTaskMachineR90";
  Machine.userData.Source = KenneySource;
  Machine.userData.License = "CC0-1.0";
  Machine.userData.RealStoreFixtureR90 = true;
  return Machine;
}

async function AddTerminalFace(Group, Type) {
  const TitleText = Type === "breaker" ? "BREAKER" : Type === "manifest" ? "MANIFEST" : "SCANNER";
  const Title = await Create3DText(TitleText, {
    MaxWidth: 0.54,
    MaxHeight: 0.10,
    Depth: 0.022,
    Material: LabelMaterial
  });
  Title.position.set(0, 1.27, 0.315);
  Group.add(Title);

  const ScreenFrame = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.25, 0.030), FrameMaterial);
  ScreenFrame.name = "TaskMachineScreenFrameR90";
  ScreenFrame.position.set(0, 0.96, 0.315);

  const Screen = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.19), ScreenMaterial.clone());
  Screen.name = "TaskMachineScreenR90";
  Screen.position.set(0, 0.96, 0.332);
  Group.add(ScreenFrame, Screen);

  const Ready = await Create3DText(Type === "breaker" ? "RESET" : "READY", {
    MaxWidth: 0.22,
    MaxHeight: 0.052,
    Depth: 0.012,
    Material: LabelMaterial
  });
  Ready.position.set(0, 0.96, 0.339);
  Group.add(Ready);
  return Screen;
}

export async function CreateTaskTerminal3D(Type) {
  const Normalized = String(Type || "scanner").toLowerCase();
  const Group = new THREE.Group();
  Group.name = `TaskTerminal3DR90-${Normalized}`;

  const Machine = await CreateMachineBody();
  Group.add(Machine);
  const Screen = await AddTerminalFace(Group, Normalized);

  Group.userData.TaskTerminalUtilityR73 = true;
  Group.userData.TaskType = Normalized;
  Group.userData.NoBeaconR83 = true;
  Group.userData.RealStoreFixtureR90 = true;
  Group.userData.Source = KenneySource;
  Group.userData.License = "CC0-1.0";
  return { Group, Screen };
}

window.__STORE_TASK_TERMINAL_UTILITY_BUILD__ = "V0.27.9-R90";
