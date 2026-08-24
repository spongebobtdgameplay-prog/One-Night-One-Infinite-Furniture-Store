import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const BaseUrl = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/";
const SourceUrl = "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0";
const Loader = new GLTFLoader();
const Templates = new Map();

const Assets = {
  RugStriped: "rug_rectangle_stripes_A.gltf",
  RugOval: "rug_oval_A.gltf",
  Cactus: "cactus_medium_A.gltf",
  StandingLamp: "lamp_standing.gltf",
  StandingFrame: "pictureframe_standing_A.gltf"
};

async function LoadTemplate(Key) {
  if (!Assets[Key]) return null;
  if (!Templates.has(Key)) {
    Templates.set(Key, Loader.loadAsync(`${BaseUrl}${Assets[Key]}`).then(Data => {
      const Root = Data.scene;
      Root.name = `KayKitTemplate-${Key}`;
      Root.traverse(Object => {
        if (!Object?.isMesh) return;
        Object.castShadow = false;
        Object.receiveShadow = false;
        Object.frustumCulled = true;
        if (Object.material) {
          Object.material = Object.material.clone();
          if ("roughness" in Object.material) Object.material.roughness = Math.max(0.55, Object.material.roughness ?? 0.75);
          Object.material.needsUpdate = true;
        }
      });
      return Root;
    }).catch(Error => {
      Templates.delete(Key);
      throw Error;
    }));
  }
  return Templates.get(Key);
}

async function CloneAsset(Key) {
  const Template = await LoadTemplate(Key);
  if (!Template) return null;
  const Root = Template.clone(true);
  Root.name = `OnlineDecoration-${Key}`;
  Root.userData.OnlineDecorationR75 = true;
  Root.userData.DecorationNoCollision = true;
  Root.userData.Source = SourceUrl;
  Root.userData.License = "CC0-1.0";
  return Root;
}

function ObjectBounds(Object) {
  Object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Object);
}

function PlaceBottomCenter(Object, X, Z, BottomY = 0.006) {
  Object.updateWorldMatrix(true, true);
  const Bounds = ObjectBounds(Object);
  if (Bounds.isEmpty()) return Object;
  const Center = Bounds.getCenter(new THREE.Vector3());
  Object.position.x += X - Center.x;
  Object.position.z += Z - Center.z;
  Object.position.y += BottomY - Bounds.min.y;
  Object.updateWorldMatrix(true, true);
  return Object;
}

export async function CreateOnlineRug(Model, Variant = 0) {
  if (!Model?.parent) return null;
  const Key = Math.abs(Variant) % 2 === 0 ? "RugStriped" : "RugOval";
  const Rug = await CloneAsset(Key);
  if (!Rug) return null;

  const ModelBox = ObjectBounds(Model);
  const SourceBox = ObjectBounds(Rug);
  if (ModelBox.isEmpty() || SourceBox.isEmpty()) return null;

  const ModelSize = ModelBox.getSize(new THREE.Vector3());
  const ModelCenter = ModelBox.getCenter(new THREE.Vector3());
  const SourceSize = SourceBox.getSize(new THREE.Vector3());
  const TargetWidth = THREE.MathUtils.clamp(ModelSize.x + 0.72, 1.35, 4.8);
  const TargetDepth = THREE.MathUtils.clamp(ModelSize.z + 0.72, 1.35, 4.8);
  const ScaleX = TargetWidth / Math.max(SourceSize.x, 0.001);
  const ScaleZ = TargetDepth / Math.max(SourceSize.z, 0.001);
  const ScaleY = Math.min(ScaleX, ScaleZ);
  Rug.scale.set(ScaleX, ScaleY, ScaleZ);
  Rug.userData.DecorationKind = "Rug";
  return PlaceBottomCenter(Rug, ModelCenter.x, ModelCenter.z, 0.008);
}

export async function CreateOnlineFloorDecoration(Key, X, Z, TargetHeight = 1) {
  const Root = await CloneAsset(Key);
  if (!Root) return null;
  const SourceBox = ObjectBounds(Root);
  if (SourceBox.isEmpty()) return null;
  const SourceSize = SourceBox.getSize(new THREE.Vector3());
  const Scale = TargetHeight / Math.max(SourceSize.y, 0.001);
  Root.scale.setScalar(Scale);
  Root.userData.DecorationKind = Key;
  return PlaceBottomCenter(Root, X, Z, 0.006);
}

export async function PreloadOnlineDecorations() {
  await Promise.allSettled(Object.keys(Assets).map(Key => LoadTemplate(Key)));
}

export const OnlineDecorationKeys = Object.freeze({
  Cactus: "Cactus",
  StandingLamp: "StandingLamp",
  StandingFrame: "StandingFrame"
});

window.__STORE_ONLINE_DECORATION_BUILD__ = "V0.17.0-R75";