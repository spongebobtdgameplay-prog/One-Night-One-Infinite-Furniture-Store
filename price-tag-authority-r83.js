import * as THREE from "three";
import { CreateCompactPricePlacard3D, FaceCompactPricePlacardTowardAisle } from "./price-tag-utility-r81.js?v=20260824-92";
import { FurniturePrice } from "./store-pricing-r75.js?v=20260824-92";
import { FriendlyItemName } from "./display-layout-utility-r74.js?v=20260824-92";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("The Infinity Store must load before price tags.");

const FurnitureNames = new Set([
  "Couch_Large1", "Couch_L", "Chair_2", "Table_RoundLarge", "Bed_King", "Bed_Single",
  "NightStand_2", "Shelf_Large", "Bookshelf", "Kitchen_Cabinet1", "Kitchen_Fridge",
  "Kitchen_Oven", "Kitchen_Sink", "Bathroom_Bathtub", "Bathroom_Toilet", "Light_Floor1"
]);
const RetailLabels = new Map([
  ["RetailArmchairR79", "CUSHION ARMCHAIR"], ["RetailLivingShelfR79", "DISPLAY SHELF"],
  ["RetailBedroomCabinetR79", "BEDROOM CABINET"], ["RetailBedroomChairR79", "BEDROOM ARMCHAIR"],
  ["RetailStorageShelfR79", "STORAGE SHELF"], ["RetailStorageCabinetR79", "STORAGE CABINET"],
  ["RetailDisplayCabinetR79", "DISPLAY CABINET"]
]);
const AccentColors = [0xb85f47, 0x708c72, 0x6f87a0, 0xb58d48, 0x9a708f, 0x5f918d];
const Rebuilding = new WeakSet();
const Signatures = new WeakMap();
const BoundsCache = new WeakMap();
const TempCenter = new THREE.Vector3();
const TempSize = new THREE.Vector3();

function UiOpen() {
  return Boolean(window.__STORE_UI_MODAL_OPEN_R96__ || window.__STORE_UI_MODAL_OPEN_R95__);
}

function TransformSignature(Object) {
  const P = Object.position;
  const Q = Object.quaternion;
  const S = Object.scale;
  return `${P.x.toFixed(3)},${P.y.toFixed(3)},${P.z.toFixed(3)}|${Q.x.toFixed(3)},${Q.y.toFixed(3)},${Q.z.toFixed(3)},${Q.w.toFixed(3)}|${S.x.toFixed(3)},${S.y.toFixed(3)},${S.z.toFixed(3)}|${Object.parent?.uuid || ""}`;
}

function BoundsData(Object) {
  const Signature = TransformSignature(Object);
  const Existing = BoundsCache.get(Object);
  if (Existing?.Signature === Signature) return Existing;
  Object.updateWorldMatrix(true, true);
  const Box = new THREE.Box3().setFromObject(Object);
  Box.getCenter(TempCenter);
  Box.getSize(TempSize);
  const Data = {
    Signature,
    Box,
    Center: TempCenter.clone(),
    Size: TempSize.clone()
  };
  BoundsCache.set(Object, Data);
  return Data;
}

function RawSellableItems(Chunk) {
  const Items = [];
  const Seen = new Set();
  for (const Model of Chunk.Models || []) {
    if (!Model?.parent || !FurnitureNames.has(Model.name) || Seen.has(Model.uuid)) continue;
    Seen.add(Model.uuid);
    Items.push(Model);
  }
  for (const Object of Chunk.Group?.children || []) {
    if (Object?.parent !== Chunk.Group || Seen.has(Object.uuid)) continue;
    const ExistingRetail = Boolean(Object.userData?.RetailImportedR79 && RetailLabels.has(Object.name));
    const NewRetail = Boolean(Object.userData?.RetailSellableR84);
    if (!ExistingRetail && !NewRetail) continue;
    Seen.add(Object.uuid);
    Items.push(Object);
  }
  return Items;
}

function SellableItems(Chunk) {
  const Items = RawSellableItems(Chunk);
  Items.sort((A, B) => {
    const AC = BoundsData(A).Center;
    const BC = BoundsData(B).Center;
    if (Math.abs(AC.z - BC.z) > 0.001) return AC.z - BC.z;
    return AC.x - BC.x;
  });
  return Items;
}

function ItemLabel(Item) {
  return String(Item.userData?.RetailLabel || RetailLabels.get(Item.name) || FriendlyItemName(Item.name)).toUpperCase();
}

function ItemPrice(Item, Chunk, Index) {
  const Fixed = String(Item.userData?.RetailPrice || "").trim();
  return Fixed || FurniturePrice(Item.name, Chunk.Index, Index);
}

function SignatureOf(Items) {
  return Items.map(Item => {
    const Data = BoundsData(Item);
    return `${Item.uuid}:${Data.Center.x.toFixed(2)}:${Data.Center.z.toFixed(2)}:${ItemLabel(Item)}:${Item.userData?.RetailPrice || ""}`;
  }).join("|");
}

function ExistingTags(Chunk) {
  const Tags = [];
  Chunk.Group?.traverse?.(Object => {
    if (Object?.userData?.CompactPriceAuthorityR83) Tags.push(Object);
  });
  return Tags;
}

function RemoveOldPriceObjects(Chunk) {
  const Remove = [];
  Chunk.Group?.traverse?.(Object => {
    const Name = String(Object?.name || "");
    if (
      Name.startsWith("CompactPriceTagR83-") || Name.startsWith("FurnitureItemSignR74-") ||
      Name.startsWith("FurnitureItemSignR80-") || Name.startsWith("FurniturePriceSignR72") ||
      Name.startsWith("FurniturePriceSignR73") || Name === "SuppressedLegacyPriceSignR83"
    ) Remove.push(Object);
  });
  for (const Object of Remove) Object.parent?.remove(Object);
}

function ClearEnough(Chunk, X, Z, Occupied, Minimum = 0.48) {
  if (Math.abs(X) > 15.95 || Z < Chunk.BottomZ + 0.34 || Z > Chunk.TopZ - 0.34) return false;
  for (const Structure of Chunk.StructureBounds || []) {
    if (X > Structure.min.x - 0.12 && X < Structure.max.x + 0.12 && Z > Structure.min.z - 0.12 && Z < Structure.max.z + 0.12) return false;
  }
  const MinimumSquared = Minimum * Minimum;
  for (const Position of Occupied) {
    const DX = Position.x - X;
    const DZ = Position.z - Z;
    if (DX * DX + DZ * DZ < MinimumSquared) return false;
  }
  return true;
}

function Candidates(Chunk, Item, Index) {
  const Data = BoundsData(Item);
  const Bounds = Data.Box;
  if (Bounds.isEmpty()) return [];
  const Center = Data.Center;
  const Size = Data.Size;
  const TowardAisleX = Center.x < 0 ? Bounds.max.x + 0.18 : Bounds.min.x - 0.18;
  const AwayX = Center.x < 0 ? Bounds.min.x - 0.18 : Bounds.max.x + 0.18;
  const Quarter = Math.max(0.12, Math.min(0.46, Size.z * 0.23));
  const Order = Index % 2 === 0 ? [-Quarter, Quarter] : [Quarter, -Quarter];
  const Raw = [
    [TowardAisleX, Center.z + Order[0]], [TowardAisleX, Center.z + Order[1]], [TowardAisleX, Center.z],
    [Center.x - Math.min(0.35, Size.x * 0.22), Bounds.min.z - 0.18],
    [Center.x + Math.min(0.35, Size.x * 0.22), Bounds.max.z + 0.18], [AwayX, Center.z]
  ];
  return Raw.map(([X, Z]) => ({
    X: THREE.MathUtils.clamp(X, -15.95, 15.95),
    Z: THREE.MathUtils.clamp(Z, Chunk.BottomZ + 0.34, Chunk.TopZ - 0.34)
  }));
}

function FindPlacement(Chunk, Item, Index, Occupied) {
  const Options = Candidates(Chunk, Item, Index);
  for (const Position of Options) if (ClearEnough(Chunk, Position.X, Position.Z, Occupied)) return Position;
  for (const Position of Options) if (ClearEnough(Chunk, Position.X, Position.Z, Occupied, 0.34)) return Position;
  return Options[0] || null;
}

function YieldMainThread() {
  return new Promise(Resolve => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => Resolve(), { timeout: 80 });
    else setTimeout(Resolve, 12);
  });
}

export async function RebuildChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group || Rebuilding.has(Chunk)) return;
  if (Chunk.Group.userData?.PresentationReadyR83) return;
  Rebuilding.add(Chunk);
  try {
    const Items = SellableItems(Chunk);
    const Signature = SignatureOf(Items);
    const Existing = ExistingTags(Chunk);
    if (Signatures.get(Chunk) === Signature && Existing.length === Items.length) {
      Chunk.Group.userData.PriceTagsR83 = true;
      return;
    }

    RemoveOldPriceObjects(Chunk);
    const Occupied = [];
    for (let Index = 0; Index < Items.length; Index += 1) {
      const Item = Items[Index];
      if (!Item?.parent) continue;
      const Position = FindPlacement(Chunk, Item, Index, Occupied);
      if (!Position) continue;
      const Price = ItemPrice(Item, Chunk, Index);
      const Sign = await CreateCompactPricePlacard3D(ItemLabel(Item), Price, {
        Name: `CompactPriceTagR83-${Index}`,
        AccentColor: AccentColors[Index % AccentColors.length]
      });
      Sign.scale.setScalar(0.88);
      Sign.position.set(Position.X, 0, Position.Z);
      FaceCompactPricePlacardTowardAisle(Sign, Position.X, Position.Z);
      Sign.userData.ChunkId = Chunk.Id;
      Sign.userData.SourceModel = Item;
      Sign.userData.CompactPriceAuthorityR83 = true;
      Sign.userData.DecorationNoCollision = false;
      Sign.userData.Price = Price;
      Sign.userData.DistanceCullR94 = 48;
      Chunk.Group.add(Sign);
      Occupied.push(new THREE.Vector3(Position.X, 0, Position.Z));
      if (Index % 2 === 1) await YieldMainThread();
    }
    Signatures.set(Chunk, Signature);
    Chunk.Group.userData.PriceTagsR83 = ExistingTags(Chunk).length === Items.length;
  } finally {
    Rebuilding.delete(Chunk);
  }
}

export function CountTags(Chunk) {
  return ExistingTags(Chunk).length;
}

export function CountSellable(Chunk) {
  return RawSellableItems(Chunk).length;
}

function Discover() {
  if (UiOpen() || document.hidden) return;
  for (const Collection of [Game.PreparedChunks, Game.ActiveChunks]) {
    for (const Chunk of Collection.values()) {
      if (Chunk?.Ready && !Chunk.Cancelled && !Chunk.Group?.userData?.PresentationReadyR83 && !Rebuilding.has(Chunk)) {
        RebuildChunk(Chunk).catch(() => {});
        return;
      }
    }
  }
}

Discover();
const Interval = setInterval(Discover, 2600);
addEventListener("store-ui-performance-state", Event => {
  if (!Event.detail?.open) setTimeout(Discover, 0);
});
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_COMPACT_PRICE_TAGS_R83__ = { RebuildChunk, CountTags, CountSellable, Discover };
window.__STORE_COMPACT_PRICE_TAGS_BUILD__ = "V0.30.3-R96";