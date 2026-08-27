import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CardboardTextureDataUri, CardboardTextureSource } from "./cardboard-box-asset.js?v=20260826-153";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before retail sale displays.");

const Loader = new GLTFLoader();
const TextureLoader = new THREE.TextureLoader();
const Templates = new Map();
const Processing = new WeakSet();
const KayKitBase = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/";
const KenneyBase = "https://raw.githubusercontent.com/dennisorlando/junction-2025/f78a38d01f3a47697ff144bfed0301df7f25c784/models/mini-market/GLB%20format/";
const MicrosoftCardboardBox = "https://raw.githubusercontent.com/microsoft/experimental-pcf-control-assets/master/cardboard_box.glb";
let CardboardTexturePromise = null;

const Assets = Object.freeze({
  CoffeeTable: { Url: `${KayKitBase}table_low.gltf`, Label: "COFFEE TABLE", Price: "149.99", Height: 0.48, MaxWidth: 1.70, MaxDepth: 1.15, Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0" },
  SideTable: { Url: `${KayKitBase}table_small.gltf`, Label: "SIDE TABLE", Price: "89.99", Height: 0.62, MaxWidth: 0.95, MaxDepth: 0.95, Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0" },
  DiningTable: { Url: `${KayKitBase}table_medium_long.gltf`, Label: "DINING TABLE", Price: "329.99", Height: 0.76, MaxWidth: 2.30, MaxDepth: 1.25, Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0" },
  BoxShelf: { Url: `${KenneyBase}shelf-boxes.glb`, Label: "FLAT-PACK BOXES", Price: "129.99", Height: 1.48, MaxWidth: 1.55, MaxDepth: 0.95, Source: "https://kenney.nl/assets/mini-market" },
  CardboardBox: {
    Url: MicrosoftCardboardBox,
    Label: "CARDBOARD BOX",
    Description: "CORRUGATED SHIPPING BOX",
    Price: "$4.99",
    Height: 0.46,
    MaxWidth: 0.70,
    MaxDepth: 0.70,
    Source: CardboardTextureSource
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
async function LoadCardboardTexture() {
  if (!CardboardTexturePromise) {
    CardboardTexturePromise = TextureLoader.loadAsync(CardboardTextureDataUri)
      .then(Texture => {
        Texture.colorSpace = THREE.SRGBColorSpace;
        Texture.flipY = false;
        Texture.wrapS = THREE.ClampToEdgeWrapping;
        Texture.wrapT = THREE.ClampToEdgeWrapping;
        Texture.anisotropy = Math.min(8, Game.Renderer?.capabilities?.getMaxAnisotropy?.() || 4);
        Texture.needsUpdate = true;
        return Texture;
      })
      .catch(Error => {
        CardboardTexturePromise = null;
        throw Error;
      });
  }
  return CardboardTexturePromise;
}

function ApplyEmbeddedCardboardTexture(Root, Texture) {
  Root.traverse(Object => {
    if (!Object?.isMesh) return;
    const Existing = Object.material
      ? (Array.isArray(Object.material) ? Object.material : [Object.material])
      : [];
    const Materials = Existing.length ? Existing : [new THREE.MeshStandardMaterial()];
    const Copies = Materials.map(Material => {
      const Copy = Material.clone();
      Copy.map = Texture;
      if (Copy.color?.setHex) Copy.color.setHex(0xffffff);
      if ("roughness" in Copy) Copy.roughness = 0.90;
      if ("metalness" in Copy) Copy.metalness = 0;
      if ("emissive" in Copy && Copy.emissive?.setHex) Copy.emissive.setHex(0x000000);
      if ("emissiveIntensity" in Copy) Copy.emissiveIntensity = 0;
      Copy.needsUpdate = true;
      return Copy;
    });
    Object.material = Array.isArray(Object.material) ? Copies : Copies[0];
    Object.castShadow = false;
    Object.receiveShadow = true;
  });
}

function CreateEmergencyCardboardBox() {
  const Group = new THREE.Group();
  Group.name = "RetailSaleTemplateR84-CardboardBoxEmergency";

  const Cardboard = new THREE.MeshStandardMaterial({
    color: 0x8a6541,
    roughness: 0.94,
    metalness: 0
  });
  const Tape = new THREE.MeshStandardMaterial({
    color: 0xb79a70,
    roughness: 0.78,
    metalness: 0
  });
  const Label = new THREE.MeshStandardMaterial({
    color: 0xd7d1c4,
    roughness: 0.82,
    metalness: 0
  });

  const Body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.42), Cardboard);
  Body.position.y = 0.17;

  const LidLeft = new THREE.Mesh(new THREE.BoxGeometry(0.245, 0.022, 0.40), Cardboard.clone());
  LidLeft.position.set(-0.132, 0.351, 0);
  const LidRight = LidLeft.clone();
  LidRight.position.x = 0.132;

  const TapeTop = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.425), Tape);
  TapeTop.position.set(0, 0.368, 0);

  const ShippingLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.095), Label);
  ShippingLabel.position.set(0.085, 0.205, 0.2115);

  Group.add(Body, LidLeft, LidRight, TapeTop, ShippingLabel);
  Group.userData.CardboardEmergencyGeometryR86 = true;
  Group.userData.Source = CardboardTextureSource;
  return Group;
}

async function LoadTemplate(Key) {
  const Definition = Assets[Key];
  if (!Definition) return null;
  if (!Templates.has(Key)) {
    Templates.set(Key, (async () => {
      if (Key === "CardboardBox") {
        let Root = null;
        try {
          const Data = await Loader.loadAsync(Definition.Url);
          Root = Data.scene;
        } catch (Error) {
          console.warn("Cardboard GLB failed; using the local shipping-box fallback.", Error);
          Root = CreateEmergencyCardboardBox();
        }

        Root.name = "RetailSaleTemplateR84-CardboardBox";
        CloneMaterials(Root);

        try {
          const Texture = await LoadCardboardTexture();
          ApplyEmbeddedCardboardTexture(Root, Texture);
          Root.userData.CardboardTextureAppliedR86 = true;
          Root.userData.CardboardTextureMode = "embedded-data-uri";
        } catch (Error) {
          console.warn("Embedded cardboard texture could not initialize; keeping brown shipping-box material.", Error);
          Root.userData.CardboardTextureFailedR86 = true;
        }

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
  const Existing = ExistingSaleItems(Chunk);
  const ExistingSlots = new Set(Existing.map(Object => String(Object.userData?.LayoutSlot || "")));

  for (let Index = 0; Index < Planned.length; Index += 1) {
    const Entry = Planned[Index];
    if (ExistingSlots.has(Entry.Slot)) continue;
    try {
      await PlacePlannedSaleAsset(Chunk, Entry, Index);
    } catch (Error) {
      console.warn(`Planned sale asset unavailable for ${Entry.Slot}`, Error);
    }
  }

  const CurrentSlots = new Set(ExistingSaleItems(Chunk).map(Object => String(Object.userData?.LayoutSlot || "")));
  const Ready = Planned.every(Entry => CurrentSlots.has(Entry.Slot));
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
  return Planned.every(Entry => CurrentSlots.has(Entry.Slot));
}

export async function Preload() {
  await Promise.allSettled(Object.keys(Assets).map(Key => LoadTemplate(Key)));
}

await Preload();

function Discover() {
  for (const Chunk of Game.PreparedChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) ProcessChunk(Chunk).catch(() => {});
  for (const Chunk of Game.ActiveChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) ProcessChunk(Chunk).catch(() => {});
}

Discover();
const Interval = setInterval(Discover, 900);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_RETAIL_SALE_DISPLAYS_R84__ = { ProcessChunk, Ready, Preload, Discover };
window.__STORE_RETAIL_SALE_DISPLAYS_BUILD__ = "V0.27.4";