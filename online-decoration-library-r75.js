import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const BaseUrl = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/";
const SourceUrl = "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0";
const Loader = new GLTFLoader();
const Templates = new Map();

const Assets = {
  RugStriped: "rug_rectangle_stripes_A.gltf",
  RugOval: "rug_oval_A.gltf",
  StandingLamp: "lamp_standing.gltf",
  TableLamp: "lamp_table.gltf",
  StandingFrame: "pictureframe_standing_A.gltf",
  WallFrameLarge: "pictureframe_large_A.gltf",
  WallFrameMedium: "pictureframe_medium.gltf",
  BookSet: "book_set.gltf",
  BookSingle: "book_single.gltf",
  PillowA: "pillow_A.gltf",
  PillowB: "pillow_B.gltf"
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
  Root.userData.OnlineDecorationR76 = true;
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

function PlaceCenter(Object, X, Y, Z) {
  Object.updateWorldMatrix(true, true);
  const Bounds = ObjectBounds(Object);
  if (Bounds.isEmpty()) return Object;
  const Center = Bounds.getCenter(new THREE.Vector3());
  Object.position.x += X - Center.x;
  Object.position.y += Y - Center.y;
  Object.position.z += Z - Center.z;
  Object.updateWorldMatrix(true, true);
  return Object;
}

function ScaleToHeight(Object, TargetHeight) {
  const SourceBox = ObjectBounds(Object);
  if (SourceBox.isEmpty()) return false;
  const SourceSize = SourceBox.getSize(new THREE.Vector3());
  const Scale = TargetHeight / Math.max(SourceSize.y, 0.001);
  Object.scale.setScalar(Scale);
  Object.updateWorldMatrix(true, true);
  return true;
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

export async function CreateOnlineFloorDecoration(Key, X, Z, TargetHeight = 1, RotationY = 0) {
  const Root = await CloneAsset(Key);
  if (!Root) return null;
  Root.rotation.y = RotationY;
  if (!ScaleToHeight(Root, TargetHeight)) return null;
  Root.userData.DecorationKind = Key;
  return PlaceBottomCenter(Root, X, Z, 0.006);
}

export async function CreateOnlineSurfaceDecoration(Key, Model, Options = {}) {
  if (!Model?.parent) return null;
  const Root = await CloneAsset(Key);
  if (!Root) return null;

  Root.rotation.set(
    Number(Options.RotationX) || 0,
    Number(Options.RotationY) || 0,
    Number(Options.RotationZ) || 0
  );

  const TargetHeight = Math.max(0.04, Number(Options.TargetHeight) || 0.30);
  if (!ScaleToHeight(Root, TargetHeight)) return null;

  const ModelBox = ObjectBounds(Model);
  if (ModelBox.isEmpty()) return null;
  const ModelSize = ModelBox.getSize(new THREE.Vector3());
  const ModelCenter = ModelBox.getCenter(new THREE.Vector3());
  const OffsetX = THREE.MathUtils.clamp(Number(Options.OffsetX) || 0, -0.46, 0.46);
  const OffsetZ = THREE.MathUtils.clamp(Number(Options.OffsetZ) || 0, -0.46, 0.46);
  const X = ModelCenter.x + ModelSize.x * OffsetX;
  const Z = ModelCenter.z + ModelSize.z * OffsetZ;
  const HeightRatio = Number(Options.HeightRatio);
  const BottomY = Number.isFinite(Number(Options.BottomY))
    ? Number(Options.BottomY)
    : Number.isFinite(HeightRatio)
      ? ModelBox.min.y + ModelSize.y * THREE.MathUtils.clamp(HeightRatio, 0.05, 1.05)
      : ModelBox.max.y + 0.008;

  Root.userData.DecorationKind = Key;
  Root.userData.SourceModel = Model.name;
  return PlaceBottomCenter(Root, X, Z, BottomY);
}

export async function CreateOnlineWallDecoration(Key, X, Y, Z, TargetHeight = 1, RotationY = 0) {
  const Root = await CloneAsset(Key);
  if (!Root) return null;
  Root.rotation.y = RotationY;
  if (!ScaleToHeight(Root, TargetHeight)) return null;
  Root.userData.DecorationKind = Key;
  Root.userData.WallDecorationR76 = true;
  return PlaceCenter(Root, X, Y, Z);
}

export async function PreloadOnlineDecorations() {
  await Promise.allSettled(Object.keys(Assets).map(Key => LoadTemplate(Key)));
}

export const OnlineDecorationKeys = Object.freeze({
  StandingLamp: "StandingLamp",
  TableLamp: "TableLamp",
  StandingFrame: "StandingFrame",
  WallFrameLarge: "WallFrameLarge",
  WallFrameMedium: "WallFrameMedium",
  BookSet: "BookSet",
  BookSingle: "BookSingle",
  PillowA: "PillowA",
  PillowB: "PillowB"
});

window.__STORE_ONLINE_DECORATION_BUILD__ = "V0.17.1-R76";