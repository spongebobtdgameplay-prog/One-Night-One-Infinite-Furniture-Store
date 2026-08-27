import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before retail sale displays.");

const Loader = new GLTFLoader();
const Templates = new Map();
const Processing = new WeakSet();
const KayKitBase = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/";
const KenneyBase = "https://raw.githubusercontent.com/dennisorlando/junction-2025/f78a38d01f3a47697ff144bfed0301df7f25c784/models/mini-market/GLB%20format/";
const DetailedCardboardBox = "./assets/models/cardboard_box_detailed.glb?v=20260826-155";
let CardboardSurfaceTexture = null;
let CardboardInstanceTemplatePromise = null;
const TempInstanceMatrix = new THREE.Matrix4();
const TempInstancePosition = new THREE.Vector3();
const TempInstanceQuaternion = new THREE.Quaternion();
const TempInstanceScale = new THREE.Vector3(1, 1, 1);
const TempInstanceEuler = new THREE.Euler();

const Assets = Object.freeze({
  CoffeeTable: { Url: `${KayKitBase}table_low.gltf`, Label: "COFFEE TABLE", Price: "149.99", Height: 0.48, MaxWidth: 1.70, MaxDepth: 1.15, Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0" },
  SideTable: { Url: `${KayKitBase}table_small.gltf`, Label: "SIDE TABLE", Price: "89.99", Height: 0.62, MaxWidth: 0.95, MaxDepth: 0.95, Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0" },
  DiningTable: { Url: `${KayKitBase}table_medium_long.gltf`, Label: "DINING TABLE", Price: "329.99", Height: 0.76, MaxWidth: 2.30, MaxDepth: 1.25, Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0" },
  BoxShelf: { Url: `${KenneyBase}shelf-boxes.glb`, Label: "FLAT-PACK BOXES", Price: "129.99", Height: 1.48, MaxWidth: 1.55, MaxDepth: 0.95, Source: "https://kenney.nl/assets/mini-market" },
  CardboardBox: {
    Url: DetailedCardboardBox,
    Label: "CARDBOARD BOX",
    Description: "HEAVY-DUTY CORRUGATED CARTON",
    Price: "$4.99",
    Height: 0.50,
    MaxWidth: 0.72,
    MaxDepth: 0.72,
    Source: "https://github.com/IcterusGames/Garage42"
  }
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
      if ("roughness" in Copy) Copy.roughness = Math.max(0.50, Copy.roughness ?? 0.70);
      Copy.needsUpdate = true;
      return Copy;
    });
    Object.material = Array.isArray(Object.material) ? Copies : Copies[0];
    Object.castShadow = false;
    Object.receiveShadow = false;
  });
}
function CreateCardboardSurfaceTexture() {
  if (CardboardSurfaceTexture) return CardboardSurfaceTexture;

  const Canvas = document.createElement("canvas");
  Canvas.width = 256;
  Canvas.height = 256;
  const Context = Canvas.getContext("2d");
  if (!Context) return null;

  const Gradient = Context.createLinearGradient(0, 0, 256, 256);
  Gradient.addColorStop(0, "#8b6844");
  Gradient.addColorStop(0.50, "#a27b52");
  Gradient.addColorStop(1, "#7c5a39");
  Context.fillStyle = Gradient;
  Context.fillRect(0, 0, 256, 256);

  for (let Index = 0; Index < 220; Index += 1) {
    const X = (Index * 73 + 19) % 256;
    const Y = (Index * 151 + 41) % 256;
    const Length = 7 + ((Index * 29) % 26);
    const Alpha = 0.025 + ((Index * 17) % 8) * 0.007;
    Context.strokeStyle = `rgba(57,36,20,${Alpha.toFixed(3)})`;
    Context.lineWidth = Index % 5 === 0 ? 1.1 : 0.55;
    Context.beginPath();
    Context.moveTo(X, Y);
    Context.lineTo(Math.min(256, X + Length), Y + ((Index % 3) - 1) * 1.5);
    Context.stroke();
  }

  for (let Y = 9; Y < 256; Y += 13) {
    Context.strokeStyle = "rgba(50,30,16,0.045)";
    Context.lineWidth = 0.55;
    Context.beginPath();
    Context.moveTo(0, Y);
    Context.lineTo(256, Y + 1);
    Context.stroke();
  }

  CardboardSurfaceTexture = new THREE.CanvasTexture(Canvas);
  CardboardSurfaceTexture.colorSpace = THREE.SRGBColorSpace;
  CardboardSurfaceTexture.wrapS = THREE.RepeatWrapping;
  CardboardSurfaceTexture.wrapT = THREE.RepeatWrapping;
  CardboardSurfaceTexture.repeat.set(1.35, 1.35);
  CardboardSurfaceTexture.anisotropy = Math.min(8, Game.Renderer?.capabilities?.getMaxAnisotropy?.() || 4);
  CardboardSurfaceTexture.needsUpdate = true;
  return CardboardSurfaceTexture;
}

function ApplyDetailedCardboardMaterial(Root) {
  const Texture = CreateCardboardSurfaceTexture();
  Root.traverse(Object => {
    if (!Object?.isMesh) return;
    const Existing = Object.material
      ? (Array.isArray(Object.material) ? Object.material : [Object.material])
      : [new THREE.MeshStandardMaterial()];
    const Materials = Existing.map(Material => {
      const Copy = Material.clone();
      Copy.map = Texture;
      if (Copy.color?.setHex) Copy.color.setHex(0xffffff);
      if ("roughness" in Copy) Copy.roughness = 0.94;
      if ("metalness" in Copy) Copy.metalness = 0;
      if ("emissive" in Copy && Copy.emissive?.setHex) Copy.emissive.setHex(0x000000);
      if ("emissiveIntensity" in Copy) Copy.emissiveIntensity = 0;
      Copy.needsUpdate = true;
      return Copy;
    });
    Object.material = Array.isArray(Object.material) ? Materials : Materials[0];
    Object.castShadow = false;
    Object.receiveShadow = true;
  });
}

async function LoadTemplate(Key) {
  const Definition = Assets[Key];
  if (!Definition) return null;
  if (!Templates.has(Key)) {
    Templates.set(Key, (async () => {
      if (Key === "CardboardBox") {
        const Data = await Loader.loadAsync(Definition.Url);
        const Root = Data.scene;
        Root.name = "RetailSaleTemplateR84-CardboardBoxDetailed";
        CloneMaterials(Root);
        ApplyDetailedCardboardMaterial(Root);
        Root.userData.CardboardDetailedModelR87 = true;
        Root.userData.CardboardTextureMode = "generated-fiber-surface";
        Root.userData.Source = Definition.Source;
        Root.userData.AssetUrl = Definition.Url;
        return Root;
      }

      const Data = await Loader.loadAsync(Definition.Url);
      const Root = Data.scene;
      Root.name = `RetailSaleTemplateR84-${Key}`;
      CloneMaterials(Root);
      Root.userData.Source = Definition.Source;
      Root.userData.AssetUrl = Definition.Url;
      return Root;
    })().catch(Error => {
      Templates.delete(Key);
      throw Error;
    }));
  }
  return Templates.get(Key);
}

async function CloneAsset(Key) {
  const Template = await LoadTemplate(Key);
  if (!Template) return null;
  const Clone = Template.clone(true);
  CloneMaterials(Clone);
  return Clone;
}

async function CardboardInstanceTemplate() {
  if (!CardboardInstanceTemplatePromise) {
    CardboardInstanceTemplatePromise = (async () => {
      const Definition = Assets.CardboardBox;
      const Template = await LoadTemplate("CardboardBox");
      if (!Template) throw new Error("Cardboard box template unavailable.");

      const Root = Template.clone(true);
      CloneMaterials(Root);
      if (!NormalizeAsset(Root, Definition, 0)) throw new Error("Cardboard box template normalization failed.");
      Root.updateWorldMatrix(true, true);

      let Mesh = null;
      Root.traverse(Object => {
        if (!Mesh && Object?.isMesh && Object.geometry) Mesh = Object;
      });
      if (!Mesh) throw new Error("Detailed cardboard model contains no renderable mesh.");

      const Geometry = Mesh.geometry.clone();
      Geometry.applyMatrix4(Mesh.matrixWorld);
      Geometry.computeBoundingBox();
      Geometry.computeBoundingSphere();

      const SourceMaterial = Array.isArray(Mesh.material) ? Mesh.material[0] : Mesh.material;
      const Material = SourceMaterial?.clone?.() || new THREE.MeshStandardMaterial({
        color: 0x9a744d,
        roughness: 0.94,
        metalness: 0
      });
      Material.needsUpdate = true;

      return { Geometry, Material };
    })().catch(Error => {
      CardboardInstanceTemplatePromise = null;
      throw Error;
    });
  }
  return CardboardInstanceTemplatePromise;
}

function ExistingCardboardMarkers(Chunk) {
  return (Chunk.Group?.children || []).filter(Object => Object?.userData?.CardboardBoxMarkerR88);
}

function RemoveCardboardAisle(Chunk) {
  const Remove = (Chunk.Group?.children || []).filter(Object =>
    Object?.userData?.CardboardBoxMarkerR88 ||
    Object?.userData?.CardboardBoxInstancesR88 ||
    String(Object?.name || "").startsWith("RetailCardboardBoxR84-")
  );
  for (const Object of Remove) Object.parent?.remove(Object);
}

async function EnsureCardboardAisle(Chunk, Entries) {
  if (!Entries.length) {
    RemoveCardboardAisle(Chunk);
    return true;
  }

  const ExistingMesh = (Chunk.Group?.children || []).find(Object => Object?.userData?.CardboardBoxInstancesR88);
  const ExistingMarkers = ExistingCardboardMarkers(Chunk);
  const ExistingSlots = new Set(ExistingMarkers.map(Object => String(Object.userData?.LayoutSlot || "")));
  if (ExistingMesh?.count === Entries.length && Entries.every(Entry => ExistingSlots.has(Entry.Slot))) return true;

  RemoveCardboardAisle(Chunk);

  const Template = await CardboardInstanceTemplate();
  const Instances = new THREE.InstancedMesh(Template.Geometry, Template.Material, Entries.length);
  Instances.name = "CardboardBoxAisleR88";
  Instances.frustumCulled = true;
  Instances.userData.ChunkId = Chunk.Id;
  Instances.userData.LayoutAuthority = Chunk.Layout?.Authority;
  Instances.userData.CardboardBoxInstancesR88 = true;
  Instances.userData.DecorationNoCollision = false;
  Instances.castShadow = false;
  Instances.receiveShadow = true;

  for (let Index = 0; Index < Entries.length; Index += 1) {
    const Entry = Entries[Index];
    TempInstancePosition.set(Entry.X, 0, Entry.Z);
    TempInstanceEuler.set(0, Number(Entry.Rotation) || 0, 0);
    TempInstanceQuaternion.setFromEuler(TempInstanceEuler);
    const InstanceScale = Number.isFinite(Number(Entry.Scale)) ? Number(Entry.Scale) : 1;
    TempInstanceScale.setScalar(InstanceScale);
    TempInstanceMatrix.compose(TempInstancePosition, TempInstanceQuaternion, TempInstanceScale);
    Instances.setMatrixAt(Index, TempInstanceMatrix);

    const Marker = new THREE.Object3D();
    Marker.name = `RetailCardboardBoxMarkerR88-${Index}`;
    Marker.position.set(Entry.X, 0, Entry.Z);
    Marker.userData.ChunkId = Chunk.Id;
    Marker.userData.LayoutSlot = Entry.Slot;
    Marker.userData.LayoutAuthority = Chunk.Layout?.Authority;
    Marker.userData.RetailImportedR84 = true;
    Marker.userData.RetailSellableR84 = Entry.Sellable !== false;
    Marker.userData.RetailLabel = Assets.CardboardBox.Label;
    Marker.userData.RetailPrice = Assets.CardboardBox.Price;
    Marker.userData.RetailDescription = Assets.CardboardBox.Description;
    Marker.userData.Source = Assets.CardboardBox.Source;
    Marker.userData.CardboardBoxMarkerR88 = true;
    Marker.userData.DecorationNoCollision = true;
    Chunk.Group.add(Marker);
  }

  Instances.instanceMatrix.needsUpdate = true;
  Instances.computeBoundingBox?.();
  Instances.computeBoundingSphere?.();
  Chunk.Group.add(Instances);
  return true;
}

function NormalizeAsset(Object, Definition, RotationY = 0) {
  Object.rotation.y = RotationY;
  Object.updateWorldMatrix(true, true);
  let Bounds = BoundsOf(Object);
  if (Bounds.isEmpty()) return false;
  const Size = Bounds.getSize(new THREE.Vector3());
  const Scale = Math.min(Definition.Height / Math.max(Size.y, 0.001), Definition.MaxWidth / Math.max(Size.x, 0.001), Definition.MaxDepth / Math.max(Size.z, 0.001));
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

function ExistingSaleItems(Chunk) {
  return (Chunk.Group?.children || []).filter(Object => Object?.parent === Chunk.Group && Object.userData?.RetailImportedR84);
}

async function PlacePlannedSaleAsset(Chunk, Entry, Index) {
  const Definition = Assets[Entry.AssetKey];
  if (!Definition) return null;
  const Object = await CloneAsset(Entry.AssetKey);
  if (!Object || !NormalizeAsset(Object, Definition, Number(Entry.Rotation) || 0)) return null;
  Object.position.x += Entry.X;
  Object.position.z += Entry.Z;
  Object.name = `${Entry.Name}-${Index}`;
  Object.userData.ChunkId = Chunk.Id;
  Object.userData.LayoutSlot = Entry.Slot;
  Object.userData.LayoutAuthority = Chunk.Layout?.Authority;
  Object.userData.RetailImportedR84 = true;
  Object.userData.RetailSellableR84 = Entry.Sellable !== false;
  Object.userData.RetailLabel = Definition.Label;
  Object.userData.RetailPrice = Definition.Price;
  Object.userData.RetailDescription = Definition.Description || "";
  Object.userData.Source = Object.userData.Source || Definition.Source;
  Object.userData.DecorationNoCollision = false;
  Chunk.Group.add(Object);
  Object.updateWorldMatrix(true, true);
  return Object;
}

async function EnsureSaleItems(Chunk) {
  if (!Chunk.Group.userData?.RetailShowroomR79) return false;
  const Planned = Chunk.Layout?.Sale || [];
  const CardboardEntries = Planned.filter(Entry => Entry.AssetKey === "CardboardBox");
  const StandardEntries = Planned.filter(Entry => Entry.AssetKey !== "CardboardBox");
  const Existing = ExistingSaleItems(Chunk);
  const ExistingSlots = new Set(Existing.map(Object => String(Object.userData?.LayoutSlot || "")));

  for (let Index = 0; Index < StandardEntries.length; Index += 1) {
    const Entry = StandardEntries[Index];
    if (ExistingSlots.has(Entry.Slot)) continue;
    try {
      await PlacePlannedSaleAsset(Chunk, Entry, Index);
    } catch (Error) {
      console.warn(`Planned sale asset unavailable for ${Entry.Slot}`, Error);
    }
  }

  try {
    await EnsureCardboardAisle(Chunk, CardboardEntries);
  } catch (Error) {
    console.warn(`Cardboard aisle unavailable in ${Chunk.Id}`, Error);
  }

  const CurrentSlots = new Set(ExistingSaleItems(Chunk).map(Object => String(Object.userData?.LayoutSlot || "")));
  const Required = Planned.filter(Entry => Entry.Required !== false);
  const Ready = Required.every(Entry => CurrentSlots.has(Entry.Slot));
  Chunk.Group.userData.RetailSaleAttemptedR85 = true;
  Chunk.Group.userData.RetailSaleItemsR84 = Ready;
  return Ready;
}

export async function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group || Processing.has(Chunk) || Chunk.Group.userData?.PresentationReadyR83) return;
  Processing.add(Chunk);
  try {
    const SaleReady = await EnsureSaleItems(Chunk);
    Chunk.Group.userData.RetailSaleDisplaysR84 = SaleReady;
  } finally {
    Processing.delete(Chunk);
  }
}

export function Ready(Chunk) {
  if (!Chunk?.Group) return false;
  const Planned = Chunk.Layout?.Sale || [];
  const CurrentSlots = new Set(ExistingSaleItems(Chunk).map(Object => String(Object.userData?.LayoutSlot || "")));
  const Required = Planned.filter(Entry => Entry.Required !== false);
  return Required.every(Entry => CurrentSlots.has(Entry.Slot));
}

export async function Preload() {
  await Promise.allSettled(Object.keys(Assets).map(Key => LoadTemplate(Key)));
}

await Preload();

function Discover() {
  for (const Chunk of Game.ActiveChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) ProcessChunk(Chunk).catch(() => {});
}

Discover();
const Interval = setInterval(Discover, 900);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_RETAIL_SALE_DISPLAYS_R84__ = { ProcessChunk, Ready, Preload, Discover };
window.__STORE_RETAIL_SALE_DISPLAYS_BUILD__ = "V0.27.7";