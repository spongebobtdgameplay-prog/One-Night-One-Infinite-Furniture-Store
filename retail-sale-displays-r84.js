import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before retail sale displays.");

const Loader = new GLTFLoader();
const TextureLoader = new THREE.TextureLoader();
const Templates = new Map();
const Processing = new WeakSet();
const KayKitBase = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/";
const KenneyBase = "https://raw.githubusercontent.com/dennisorlando/junction-2025/f78a38d01f3a47697ff144bfed0301df7f25c784/models/mini-market/GLB%20format/";
const PolyHavenCardboardBox = "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/cardboard_box_01/cardboard_box_01_1k.gltf";
const MicrosoftCardboardBox = "https://raw.githubusercontent.com/microsoft/experimental-pcf-control-assets/master/cardboard_box.glb";
const MicrosoftCardboardTexture = "https://raw.githubusercontent.com/microsoft/experimental-pcf-control-assets/master/cardboard_box.png";
let CardboardTexturePromise = null;

const Assets = Object.freeze({
  CoffeeTable: { Url: `${KayKitBase}table_low.gltf`, Label: "COFFEE TABLE", Price: "149.99", Height: 0.48, MaxWidth: 1.70, MaxDepth: 1.15, Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0" },
  SideTable: { Url: `${KayKitBase}table_small.gltf`, Label: "SIDE TABLE", Price: "89.99", Height: 0.62, MaxWidth: 0.95, MaxDepth: 0.95, Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0" },
  DiningTable: { Url: `${KayKitBase}table_medium_long.gltf`, Label: "DINING TABLE", Price: "329.99", Height: 0.76, MaxWidth: 2.30, MaxDepth: 1.25, Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0" },
  BoxShelf: { Url: `${KenneyBase}shelf-boxes.glb`, Label: "FLAT-PACK BOXES", Price: "129.99", Height: 1.48, MaxWidth: 1.55, MaxDepth: 0.95, Source: "https://kenney.nl/assets/mini-market" },
  CardboardBox: {
    Urls: [PolyHavenCardboardBox, MicrosoftCardboardBox],
    Label: "CARDBOARD BOX",
    Description: "WORN CORRUGATED SHIPPING BOX",
    Price: "$4.99",
    Height: 0.46,
    MaxWidth: 0.70,
    MaxDepth: 0.70,
    Source: "https://polyhaven.com/a/cardboard_box_01",
    FallbackSource: "https://github.com/microsoft/experimental-pcf-control-assets",
    FallbackTexture: MicrosoftCardboardTexture
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
function TextureHasImage(Texture) {
  return Boolean(Texture?.isTexture && (Texture.image || Texture.source?.data));
}

function HasLoadedColorTexture(Root) {
  let Found = false;
  Root?.traverse?.(Object => {
    if (Found || !Object?.isMesh || !Object.material) return;
    const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
    for (const Material of Materials) {
      if (TextureHasImage(Material?.map)) {
        Found = true;
        break;
      }
    }
  });
  return Found;
}

async function LoadCardboardFallbackTexture() {
  if (!CardboardTexturePromise) {
    CardboardTexturePromise = TextureLoader.loadAsync(MicrosoftCardboardTexture)
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

function ApplyCardboardFallbackTexture(Root, Texture) {
  Root.traverse(Object => {
    if (!Object?.isMesh) return;
    const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
    const Copies = Materials.filter(Boolean).map(Material => {
      const Copy = Material.clone();
      Copy.map = Texture;
      if (Copy.color?.setHex) Copy.color.setHex(0xffffff);
      if ("roughness" in Copy) Copy.roughness = 0.88;
      if ("metalness" in Copy) Copy.metalness = 0;
      if ("emissiveIntensity" in Copy) Copy.emissiveIntensity = 0;
      Copy.needsUpdate = true;
      return Copy;
    });
    if (!Copies.length) {
      Object.material = new THREE.MeshStandardMaterial({
        map: Texture,
        color: 0xffffff,
        roughness: 0.88,
        metalness: 0
      });
    } else {
      Object.material = Array.isArray(Object.material) ? Copies : Copies[0];
    }
  });
}

function ApplyCardboardColorFallback(Root) {
  Root.traverse(Object => {
    if (!Object?.isMesh || !Object.material) return;
    const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
    const Copies = Materials.map(Material => {
      const Copy = Material.clone();
      if (Copy.color?.setHex) Copy.color.setHex(0x8c6844);
      if ("roughness" in Copy) Copy.roughness = 0.94;
      if ("metalness" in Copy) Copy.metalness = 0;
      Copy.needsUpdate = true;
      return Copy;
    });
    Object.material = Array.isArray(Object.material) ? Copies : Copies[0];
  });
}


async function LoadTemplate(Key) {
  const Definition = Assets[Key];
  if (!Definition) return null;
  if (!Templates.has(Key)) {
    Templates.set(Key, (async () => {
      const Urls = Array.isArray(Definition.Urls) ? Definition.Urls : [Definition.Url];
      let LastError = null;
      for (let Index = 0; Index < Urls.length; Index += 1) {
        try {
          const Data = await Loader.loadAsync(Urls[Index]);
          const Root = Data.scene;
          Root.name = `RetailSaleTemplateR84-${Key}`;
          CloneMaterials(Root);

          if (Key === "CardboardBox") {
            const IsMicrosoftFallback = Urls[Index] === MicrosoftCardboardBox;
            if (IsMicrosoftFallback) {
              try {
                const Texture = await LoadCardboardFallbackTexture();
                ApplyCardboardFallbackTexture(Root, Texture);
                Root.userData.CardboardTextureAppliedR86 = true;
              } catch (TextureError) {
                ApplyCardboardColorFallback(Root);
                Root.userData.CardboardTextureFailedR86 = true;
                console.warn("Cardboard texture failed; using non-white cardboard material.", TextureError);
              }
            } else if (!HasLoadedColorTexture(Root)) {
              throw new Error("Primary cardboard model loaded without its color texture.");
            }
          }

          Root.userData.Source = Index === 0 ? Definition.Source : (Definition.FallbackSource || Definition.Source);
          Root.userData.AssetUrl = Urls[Index];
          return Root;
        } catch (Error) {
          LastError = Error;
        }
      }
      throw LastError || new Error(`No asset source available for ${Key}`);
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
window.__STORE_RETAIL_SALE_DISPLAYS_BUILD__ = "V0.27.3";