import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Create3DText } from "./three-text-utility-r73.js?v=20260824-86";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.CollisionBoxes) {
  throw new Error("The Infinity Store game must load before retail zones.");
}

const KenneyCommit = "f78a38d01f3a47697ff144bfed0301df7f25c784";
const KenneyBase = `https://raw.githubusercontent.com/dennisorlando/junction-2025/${KenneyCommit}/models/mini-market/GLB%20format/`;
const KenneySource = "https://kenney.nl/assets/mini-market";
const KayKitBase = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/";
const Loader = new GLTFLoader();
const Templates = new Map();
const Processing = new WeakSet();

const Assets = Object.freeze({
  Cart: { Url: `${KenneyBase}shopping-cart.glb`, Source: KenneySource },
  Basket: { Url: `${KenneyBase}shopping-basket.glb`, Source: KenneySource },
  BagShelf: { Url: `${KenneyBase}shelf-bags.glb`, Source: KenneySource },
  RugLarge: { Url: `${KayKitBase}rug_rectangle_stripes_A.gltf`, Source: "https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0" }
});

const ZoneBoardMaterial = new THREE.MeshStandardMaterial({ color: 0xd8ccb3, roughness: 0.86, metalness: 0.02 });
const ZoneFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x858e87, roughness: 0.62, metalness: 0.34 });
const ZoneTextMaterial = new THREE.MeshStandardMaterial({ color: 0x4c5e55, roughness: 0.48, metalness: 0.02 });

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
      if ("roughness" in Copy) Copy.roughness = Math.max(0.46, Copy.roughness ?? 0.7);
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
  if (!Definition) throw new Error(`Unknown retail-zone asset ${Key}`);
  if (!Templates.has(Key)) {
    Templates.set(Key, Loader.loadAsync(Definition.Url).then(Gltf => {
      const Root = Gltf.scene;
      Root.name = `RetailZoneTemplate-${Key}`;
      Root.userData.Source = Definition.Source;
      Root.userData.License = "CC0-1.0";
      CloneMaterials(Root);
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
  const Clone = Template.clone(true);
  CloneMaterials(Clone);
  Clone.userData.RetailZoneR82 = true;
  Clone.userData.Source = Assets[Key].Source;
  Clone.userData.License = "CC0-1.0";
  return Clone;
}

function NormalizeHeight(Object, TargetHeight, MaximumWidth = Infinity, MaximumDepth = Infinity) {
  let Bounds = BoundsOf(Object);
  if (Bounds.isEmpty()) return false;
  const Size = Bounds.getSize(new THREE.Vector3());
  const Scale = Math.min(
    TargetHeight / Math.max(Size.y, 0.001),
    MaximumWidth / Math.max(Size.x, 0.001),
    MaximumDepth / Math.max(Size.z, 0.001)
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

function XZOverlap(A, B, Padding = 0.10) {
  return A.max.x > B.min.x - Padding && A.min.x < B.max.x + Padding && A.max.z > B.min.z - Padding && A.min.z < B.max.z + Padding;
}

function CanPlace(Chunk, Bounds, Extra = []) {
  if (Bounds.min.x < -16.15 || Bounds.max.x > 16.15) return false;
  if (Bounds.min.z < Chunk.BottomZ + 0.50 || Bounds.max.z > Chunk.TopZ - 0.50) return false;
  for (const Box of Chunk.StructureBounds || []) if (XZOverlap(Bounds, Box, 0.08)) return false;
  for (const Box of Chunk.ReservedBounds || []) if (XZOverlap(Bounds, Box, 0.10)) return false;
  for (const Box of Extra) if (XZOverlap(Bounds, Box, 0.10)) return false;
  return true;
}

function AddCollision(Chunk, Object, Type, Reserve = true) {
  const Bounds = BoundsOf(Object);
  if (Bounds.isEmpty()) return null;
  const Size = Bounds.getSize(new THREE.Vector3());
  const Center = Bounds.getCenter(new THREE.Vector3());
  const Box = new THREE.Box3(
    new THREE.Vector3(Center.x - Math.max(0.10, Size.x * 0.47), Math.max(0, Bounds.min.y), Center.z - Math.max(0.10, Size.z * 0.47)),
    new THREE.Vector3(Center.x + Math.max(0.10, Size.x * 0.47), Bounds.max.y, Center.z + Math.max(0.10, Size.z * 0.47))
  );
  const Entry = {
    Box,
    OriginalBox: Box.clone(),
    OriginalLegacyBox: Box.clone(),
    ChunkId: Chunk.Id,
    Type,
    Active: Boolean(Chunk.Active),
    RetailZoneR82: true,
    PreciseGeometry: false,
    LegacyCollisionDisabled: false
  };
  Chunk.CollisionEntries.push(Entry);
  if (Chunk.Active && !Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
  if (Reserve) Chunk.ReservedBounds.push(Box.clone());
  return Box;
}

async function MakeZoneHeader(Text) {
  const Group = new THREE.Group();
  Group.name = `RetailZoneHeaderR82-${Text.replaceAll(" ", "-")}`;
  const Frame = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.55, 0.095), ZoneFrameMaterial);
  const Board = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.43, 0.115), ZoneBoardMaterial);
  Group.add(Frame, Board);
  const Label = await Create3DText(Text, {
    MaxWidth: 1.92,
    MaxHeight: 0.24,
    Depth: 0.026,
    Material: ZoneTextMaterial
  });
  Label.position.set(0, -0.005, 0.075);
  Group.add(Label);
  return Group;
}

async function PlaceAsset(Chunk, Key, TargetHeight, X, Z, RotationY, Type, Extra, MaximumWidth = Infinity, MaximumDepth = Infinity) {
  const Object = await CloneAsset(Key);
  if (!NormalizeHeight(Object, TargetHeight, MaximumWidth, MaximumDepth)) return null;
  Object.position.set(X, 0, Z);
  Object.rotation.y = RotationY;
  Object.updateWorldMatrix(true, true);
  const Bounds = BoundsOf(Object);
  if (!CanPlace(Chunk, Bounds, Extra)) return null;
  Object.name = Type;
  Object.userData.ChunkId = Chunk.Id;
  Chunk.Group.add(Object);
  const Solid = AddCollision(Chunk, Object, `${Type}SolidR82`, true);
  if (Solid) Extra.push(Solid.clone());
  return Object;
}

async function AddCartBay(Chunk) {
  if (Chunk.Index % 6 !== 0) return;
  const Side = Math.floor(Chunk.Index / 6) % 2 === 0 ? -1 : 1;
  const CenterZ = Chunk.CenterZ;
  const Extra = [];
  const BaseX = Side * 13.70;
  const Facing = Side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  let Added = 0;

  const Slots = [
    [BaseX, CenterZ - 2.7],
    [BaseX, CenterZ - 1.35],
    [BaseX, CenterZ],
    [BaseX, CenterZ + 1.35],
    [BaseX, CenterZ + 2.7],
    [BaseX - Side * 1.15, CenterZ - 2.05],
    [BaseX - Side * 1.15, CenterZ + 2.05]
  ];

  for (let Index = 0; Index < Slots.length; Index += 1) {
    const [X, Z] = Slots[Index];
    try {
      const Cart = await PlaceAsset(Chunk, "Cart", 0.88, X, Z, Facing, `ShoppingCartR82-${Index}`, Extra, 1.15, 1.45);
      if (Cart) Added += 1;
    } catch (Error) {
      console.warn("Kenney shopping cart unavailable", Error);
      break;
    }
  }

  if (Added >= 2) {
    const Header = await MakeZoneHeader("CART RETURN");
    Header.position.set(Side * 15.45, 2.08, CenterZ);
    Header.rotation.y = Side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    Header.userData.ChunkId = Chunk.Id;
    Header.userData.RetailZoneR82 = true;
    Chunk.Group.add(Header);
    AddCollision(Chunk, Header, "CartReturnSignSolidR82", false);
  }
}

async function AddBagBay(Chunk) {
  if (((Chunk.Index % 6) + 6) % 6 !== 3) return;
  const Side = Math.floor(Chunk.Index / 3) % 2 === 0 ? 1 : -1;
  const CenterZ = Chunk.CenterZ;
  const Extra = [];
  const Facing = Side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
  let Added = 0;

  for (const [OffsetZ, OffsetX] of [[-2.25, 0], [2.25, 0]]) {
    try {
      const Shelf = await PlaceAsset(Chunk, "BagShelf", 1.55, Side * 14.10 - Side * OffsetX, CenterZ + OffsetZ, Facing, `BagShelfR82-${Added}`, Extra, 1.45, 0.95);
      if (Shelf) Added += 1;
    } catch (Error) {
      console.warn("Kenney bag shelf unavailable", Error);
      break;
    }
  }

  const BasketSlots = [
    [Side * 12.75, CenterZ - 2.65],
    [Side * 12.75, CenterZ - 1.75],
    [Side * 12.75, CenterZ + 1.75],
    [Side * 12.75, CenterZ + 2.65]
  ];
  for (let Index = 0; Index < BasketSlots.length; Index += 1) {
    const [X, Z] = BasketSlots[Index];
    try {
      await PlaceAsset(Chunk, "Basket", 0.42, X, Z, Facing, `ShoppingBasketR82-${Index}`, Extra, 0.75, 0.75);
    } catch (Error) {
      console.warn("Kenney shopping basket unavailable", Error);
      break;
    }
  }

  if (Added) {
    const Header = await MakeZoneHeader("BAGS + BASKETS");
    Header.position.set(Side * 15.45, 2.08, CenterZ);
    Header.rotation.y = Side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    Header.userData.ChunkId = Chunk.Id;
    Header.userData.RetailZoneR82 = true;
    Chunk.Group.add(Header);
    AddCollision(Chunk, Header, "BagAreaSignSolidR82", false);
  }
}

async function AddLargeShowroomRug(Chunk) {
  const ThemeOkay = ["LIVING ROOM", "BEDROOMS", "SHOWROOM", "CLEARANCE"].includes(Chunk.Theme);
  if (!ThemeOkay || Math.abs(Chunk.Index) % 3 !== 1) return;
  if (Chunk.Group.getObjectByName("LargeShowroomRugR82")) return;
  try {
    const Rug = await CloneAsset("RugLarge");
    let Bounds = BoundsOf(Rug);
    if (Bounds.isEmpty()) return;
    const Size = Bounds.getSize(new THREE.Vector3());
    const TargetWidth = 6.8 + (Math.abs(Chunk.Index) % 2) * 0.8;
    const TargetDepth = 4.8 + (Math.abs(Chunk.Index + 1) % 2) * 0.7;
    Rug.scale.set(TargetWidth / Math.max(Size.x, 0.001), 1, TargetDepth / Math.max(Size.z, 0.001));
    Rug.updateWorldMatrix(true, true);
    Bounds = BoundsOf(Rug);
    const Center = Bounds.getCenter(new THREE.Vector3());
    Rug.position.x -= Center.x;
    Rug.position.z -= Center.z;
    Rug.position.y += 0.010 - Bounds.min.y;
    const Side = Chunk.Index % 2 === 0 ? -1 : 1;
    Rug.position.x += Side * 9.2;
    Rug.position.z += Chunk.CenterZ + (Chunk.Index % 2 === 0 ? 4.1 : -4.1);
    Rug.name = "LargeShowroomRugR82";
    Rug.userData.ChunkId = Chunk.Id;
    Rug.userData.RetailZoneR82 = true;
    Rug.userData.DecorationKind = "LargeShowroomRug";
    Chunk.Group.add(Rug);
  } catch (Error) {
    console.warn("Large imported showroom rug unavailable", Error);
  }
}

export async function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group || Processing.has(Chunk)) return;
  if (Chunk.Group.userData.RetailZonesR82) return;
  Processing.add(Chunk);
  try {
    await AddLargeShowroomRug(Chunk);
    await AddCartBay(Chunk);
    await AddBagBay(Chunk);
    Chunk.Group.userData.RetailZonesR82 = true;
  } finally {
    Processing.delete(Chunk);
  }
}

export async function PreloadRetailZoneAssets() {
  await Promise.allSettled(Object.keys(Assets).map(Key => LoadTemplate(Key)));
}

function Discover() {
  for (const Chunk of Game.PreparedChunks.values()) ProcessChunk(Chunk).catch(Error => console.warn("Prepared retail zone failed", Error));
  for (const Chunk of Game.ActiveChunks.values()) {
    if (!Chunk.Group?.userData?.PresentationReadyR82) ProcessChunk(Chunk).catch(Error => console.warn("Initial retail zone failed", Error));
  }
}

await PreloadRetailZoneAssets();
Discover();
const Interval = setInterval(Discover, 700);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_RETAIL_ZONES_R82__ = { ProcessChunk, Discover, PreloadRetailZoneAssets };
window.__STORE_RETAIL_ZONES_BUILD__ = "V0.21.0-R82";
