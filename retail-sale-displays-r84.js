import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CreateOnlineRug } from "./online-decoration-library-r75.js?v=20260824-91";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before retail sale displays.");

const Loader = new GLTFLoader();
const Templates = new Map();
const Processing = new WeakSet();
const KayKitBase = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/";
const KenneyBase = "https://raw.githubusercontent.com/dennisorlando/junction-2025/f78a38d01f3a47697ff144bfed0301df7f25c784/models/mini-market/GLB%20format/";

const Assets = Object.freeze({
  CoffeeTable: {
    Url: `${KayKitBase}table_low.gltf`,
    Label: "COFFEE TABLE",
    Price: "149.99",
    Height: 0.48,
    MaxWidth: 1.70,
    MaxDepth: 1.15,
    Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0"
  },
  SideTable: {
    Url: `${KayKitBase}table_small.gltf`,
    Label: "SIDE TABLE",
    Price: "89.99",
    Height: 0.62,
    MaxWidth: 0.95,
    MaxDepth: 0.95,
    Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0"
  },
  DiningTable: {
    Url: `${KayKitBase}table_medium_long.gltf`,
    Label: "DINING TABLE",
    Price: "329.99",
    Height: 0.76,
    MaxWidth: 2.30,
    MaxDepth: 1.25,
    Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0"
  },
  BoxShelf: {
    Url: `${KenneyBase}shelf-boxes.glb`,
    Label: "FLAT-PACK BOXES",
    Price: "129.99",
    Height: 1.48,
    MaxWidth: 1.55,
    MaxDepth: 0.95,
    Source: "https://kenney.nl/assets/mini-market"
  }
});

const CouchNames = new Set(["Couch_Large1", "Couch_L"]);
const TempVector = new THREE.Vector3();

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

async function LoadTemplate(Key) {
  const Definition = Assets[Key];
  if (!Definition) return null;
  if (!Templates.has(Key)) {
    Templates.set(Key, Loader.loadAsync(Definition.Url).then(Data => {
      const Root = Data.scene;
      Root.name = `RetailSaleTemplateR84-${Key}`;
      CloneMaterials(Root);
      Root.userData.Source = Definition.Source;
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
  const Scale = Math.min(
    Definition.Height / Math.max(Size.y, 0.001),
    Definition.MaxWidth / Math.max(Size.x, 0.001),
    Definition.MaxDepth / Math.max(Size.z, 0.001)
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

function OverlapXZ(A, B, Padding = 0.16) {
  return A.max.x > B.min.x - Padding && A.min.x < B.max.x + Padding && A.max.z > B.min.z - Padding && A.min.z < B.max.z + Padding;
}

function OccupiedBounds(Chunk) {
  const Bounds = [];
  for (const Model of Chunk.Models || []) {
    if (!Model?.parent) continue;
    const Box = BoundsOf(Model);
    if (!Box.isEmpty()) Bounds.push(Box);
  }
  for (const Object of Chunk.Group?.children || []) {
    if (!Object?.parent || Object.parent !== Chunk.Group) continue;
    if (!Object.userData?.RetailImportedR79 && !Object.userData?.RetailZoneR82 && !Object.userData?.RetailSellableR84) continue;
    const Box = BoundsOf(Object);
    if (!Box.isEmpty()) Bounds.push(Box);
  }
  return Bounds;
}

function CanPlace(Chunk, Candidate, Occupied) {
  if (Candidate.min.x < -15.65 || Candidate.max.x > 15.65) return false;
  if (Candidate.min.z < Chunk.BottomZ + 0.62 || Candidate.max.z > Chunk.TopZ - 0.62) return false;
  for (const Box of Chunk.StructureBounds || []) if (OverlapXZ(Candidate, Box, 0.12)) return false;
  for (const Box of Chunk.ReservedBounds || []) if (OverlapXZ(Candidate, Box, 0.14)) return false;
  for (const Box of Occupied) if (OverlapXZ(Candidate, Box, 0.22)) return false;
  return true;
}

function CandidateSlots(Chunk, Seed = 0) {
  const Z = Chunk.CenterZ;
  const Slots = [
    [-10.8, Z - 6.2], [10.8, Z + 6.2],
    [-12.4, Z + 5.1], [12.4, Z - 5.1],
    [-9.5, Z + 2.8], [9.5, Z - 2.8],
    [-12.8, Z - 1.2], [12.8, Z + 1.2],
    [-8.9, Z - 7.4], [8.9, Z + 7.4]
  ];
  const Shift = ((Seed % Slots.length) + Slots.length) % Slots.length;
  return [...Slots.slice(Shift), ...Slots.slice(0, Shift)];
}

async function PlaceSaleAsset(Chunk, Key, Name, Seed, RotationY, Occupied) {
  const Definition = Assets[Key];
  const Object = await CloneAsset(Key);
  if (!Object || !NormalizeAsset(Object, Definition, RotationY)) return null;
  const LocalBounds = BoundsOf(Object);

  for (const [X, Z] of CandidateSlots(Chunk, Seed)) {
    const Candidate = LocalBounds.clone().translate(new THREE.Vector3(X, 0, Z));
    if (!CanPlace(Chunk, Candidate, Occupied)) continue;
    Object.position.x += X;
    Object.position.z += Z;
    Object.name = Name;
    Object.userData.ChunkId = Chunk.Id;
    Object.userData.RetailImportedR84 = true;
    Object.userData.RetailSellableR84 = true;
    Object.userData.RetailLabel = Definition.Label;
    Object.userData.RetailPrice = Definition.Price;
    Object.userData.Source = Definition.Source;
    Object.userData.DecorationNoCollision = false;
    Chunk.Group.add(Object);
    Object.updateWorldMatrix(true, true);
    const FinalBounds = BoundsOf(Object);
    Occupied.push(FinalBounds.clone());
    Chunk.ReservedBounds.push(FinalBounds.clone());
    return Object;
  }
  return null;
}

function SalePlans(Chunk) {
  const Theme = String(Chunk.Theme || "").toUpperCase();
  const Plans = [];
  if (Theme === "LIVING ROOM" || Theme === "SHOWROOM" || Theme === "CLEARANCE") {
    Plans.push({ Key: "CoffeeTable", Name: "RetailCoffeeTableR84", RotationY: Chunk.Index % 2 ? Math.PI * 0.5 : 0 });
    if (Math.abs(Chunk.Index) % 2 === 0) Plans.push({ Key: "SideTable", Name: "RetailSideTableR84", RotationY: 0 });
  } else if (Theme === "BEDROOMS") {
    Plans.push({ Key: "SideTable", Name: "RetailSideTableR84", RotationY: 0 });
  } else if (Theme === "KITCHENS") {
    Plans.push({ Key: "DiningTable", Name: "RetailDiningTableR84", RotationY: Chunk.Index % 2 ? Math.PI * 0.5 : 0 });
  }
  if (Theme === "STORAGE" || Theme === "WAREHOUSE" || Theme === "CLEARANCE" || Math.abs(Chunk.Index) % 5 === 4) {
    Plans.push({ Key: "BoxShelf", Name: "RetailBoxShelfR84", RotationY: Chunk.Index % 2 ? Math.PI * 0.5 : -Math.PI * 0.5 });
  }
  return Plans.slice(0, 2);
}

function ExistingSaleItems(Chunk) {
  return (Chunk.Group?.children || []).filter(Object => Object?.parent === Chunk.Group && Object.userData?.RetailSellableR84);
}

async function EnsureSaleItems(Chunk) {
  if (!Chunk.Group.userData?.RetailShowroomR79) return false;
  const Plans = SalePlans(Chunk);
  const Existing = ExistingSaleItems(Chunk);
  if (Existing.length >= Plans.length) {
    Chunk.Group.userData.RetailSaleItemsR84 = true;
    return true;
  }

  for (const Object of Existing) {
    const Index = Chunk.ReservedBounds.findIndex(Box => {
      if (!Box?.min || !Box?.max) return false;
      const ObjectBox = BoundsOf(Object);
      const A = Box.getCenter(TempVector);
      const B = ObjectBox.getCenter(new THREE.Vector3());
      return A.distanceToSquared(B) < 0.02 * 0.02;
    });
    if (Index >= 0) Chunk.ReservedBounds.splice(Index, 1);
    Object.parent?.remove(Object);
  }

  const Occupied = OccupiedBounds(Chunk).filter(Box => !Existing.some(Object => OverlapXZ(Box, BoundsOf(Object), -0.01)));
  let Added = 0;
  for (let Index = 0; Index < Plans.length; Index += 1) {
    const Plan = Plans[Index];
    try {
      const Object = await PlaceSaleAsset(Chunk, Plan.Key, `${Plan.Name}-${Index}`, Math.abs(Chunk.Index) * 3 + Index * 2, Plan.RotationY, Occupied);
      if (Object) Added += 1;
    } catch (Error) {
      console.warn(`Retail sale asset ${Plan.Key} unavailable`, Error);
    }
  }
  Chunk.Group.userData.RetailSaleItemsR84 = Added >= Plans.length;
  return Added >= Plans.length;
}

function CouchSignature(Model) {
  const Bounds = BoundsOf(Model);
  if (Bounds.isEmpty()) return "";
  const Center = Bounds.getCenter(new THREE.Vector3());
  const Size = Bounds.getSize(new THREE.Vector3());
  return `${Center.x.toFixed(3)}:${Center.z.toFixed(3)}:${Size.x.toFixed(3)}:${Size.z.toFixed(3)}`;
}

function ExistingCouchRugs(Chunk) {
  return (Chunk.Group?.children || []).filter(Object => Object?.parent === Chunk.Group && Object.userData?.CouchDisplayRugR84);
}

async function EnsureCouchRugs(Chunk) {
  const Couches = (Chunk.Models || []).filter(Model => Model?.parent && CouchNames.has(Model.name));
  const Rugs = ExistingCouchRugs(Chunk);
  const CouchIds = new Set(Couches.map(Model => Model.uuid));

  for (const Rug of Rugs) {
    const Source = Couches.find(Model => Model.uuid === Rug.userData.CouchSourceUUIDR84);
    if (Source && Rug.userData.CouchSourceSignatureR84 === CouchSignature(Source)) continue;
    Rug.parent?.remove(Rug);
  }

  const CurrentRugs = ExistingCouchRugs(Chunk);
  for (let Index = 0; Index < Couches.length; Index += 1) {
    const Couch = Couches[Index];
    const Signature = CouchSignature(Couch);
    if (CurrentRugs.some(Rug => Rug.userData.CouchSourceUUIDR84 === Couch.uuid && Rug.userData.CouchSourceSignatureR84 === Signature)) continue;
    try {
      const Rug = await CreateOnlineRug(Couch, Math.abs(Chunk.Index) + Index);
      if (!Rug) continue;
      Rug.name = `CouchDisplayRugR84-${Index}`;
      Rug.userData.ChunkId = Chunk.Id;
      Rug.userData.CouchDisplayRugR84 = true;
      Rug.userData.CouchSourceUUIDR84 = Couch.uuid;
      Rug.userData.CouchSourceSignatureR84 = Signature;
      Rug.userData.DecorationNoCollision = false;
      Chunk.Group.add(Rug);
    } catch (Error) {
      console.warn("Couch showroom rug unavailable", Error);
    }
  }

  const FinishedRugs = ExistingCouchRugs(Chunk).filter(Rug => CouchIds.has(Rug.userData.CouchSourceUUIDR84));
  Chunk.Group.userData.CouchRugsR84 = FinishedRugs.length >= Couches.length;
  return FinishedRugs.length >= Couches.length;
}

export async function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group || Processing.has(Chunk) || Chunk.Group.userData?.PresentationReadyR83) return;
  Processing.add(Chunk);
  try {
    const RugsReady = await EnsureCouchRugs(Chunk);
    const SaleReady = await EnsureSaleItems(Chunk);
    Chunk.Group.userData.RetailSaleDisplaysR84 = Boolean(RugsReady && SaleReady);
  } finally {
    Processing.delete(Chunk);
  }
}

export function Ready(Chunk) {
  if (!Chunk?.Group) return false;
  const Couches = (Chunk.Models || []).filter(Model => Model?.parent && CouchNames.has(Model.name));
  const Rugs = ExistingCouchRugs(Chunk);
  const RugsReady = Couches.every(Couch => Rugs.some(Rug => Rug.userData.CouchSourceUUIDR84 === Couch.uuid && Rug.userData.CouchSourceSignatureR84 === CouchSignature(Couch)));
  return Boolean(RugsReady && Chunk.Group.userData?.RetailSaleItemsR84);
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
window.__STORE_RETAIL_SALE_DISPLAYS_BUILD__ = "V0.23.0-R84";