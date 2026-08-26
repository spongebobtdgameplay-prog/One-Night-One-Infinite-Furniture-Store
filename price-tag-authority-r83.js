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
  ["RetailArmchairR79", "CUSHION ARMCHAIR"],
  ["RetailLivingShelfR79", "DISPLAY SHELF"],
  ["RetailBedroomCabinetR79", "BEDROOM CABINET"],
  ["RetailBedroomChairR79", "BEDROOM ARMCHAIR"],
  ["RetailStorageShelfR79", "STORAGE SHELF"],
  ["RetailStorageCabinetR79", "STORAGE CABINET"],
  ["RetailDisplayCabinetR79", "DISPLAY CABINET"]
]);
const AccentColors = [0xb77b43];
const Rebuilding = new WeakSet();
const Signatures = new WeakMap();

function BoundsOf(Object) {
  Object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Object);
}

function SellableItems(Chunk) {
  const Items = [];
  const Add = Item => {
    if (!Item?.parent) return;
    const SlotName = String(Item.userData?.LayoutSlot || "");
    const Slot = Chunk.Layout?.Slots?.[SlotName];
    const Anchor = Chunk.Layout?.PriceAnchors?.[SlotName];
    if (!Slot?.Sellable || !Anchor) return;
    Items.push(Item);
  };

  for (const Model of Chunk.Models || []) {
    if (FurnitureNames.has(Model?.name)) Add(Model);
  }
  for (const Object of Chunk.Group?.children || []) {
    if (Object?.parent !== Chunk.Group) continue;
    const ExistingRetail = Boolean(Object.userData?.RetailImportedR79 && RetailLabels.has(Object.name));
    const NewRetail = Boolean(Object.userData?.RetailSellableR84);
    if (ExistingRetail || NewRetail) Add(Object);
  }

  Items.sort((A, B) => String(A.userData?.LayoutSlot || "").localeCompare(String(B.userData?.LayoutSlot || "")));
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
    const C = BoundsOf(Item).getCenter(new THREE.Vector3());
    return `${Item.uuid}:${C.x.toFixed(2)}:${C.z.toFixed(2)}:${ItemLabel(Item)}:${Item.userData?.RetailPrice || ""}`;
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
      Name.startsWith("CompactPriceTagR83-") ||
      Name.startsWith("FurnitureItemSignR74-") ||
      Name.startsWith("FurnitureItemSignR80-") ||
      Name.startsWith("FurniturePriceSignR72") ||
      Name.startsWith("FurniturePriceSignR73") ||
      Name === "SuppressedLegacyPriceSignR83"
    ) Remove.push(Object);
  });
  for (const Object of Remove) Object.parent?.remove(Object);
}

async function Yield() {
  await new Promise(Resolve => {
    if ("requestIdleCallback" in window) requestIdleCallback(() => Resolve(), { timeout: 600 });
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
    for (let Index = 0; Index < Items.length; Index += 1) {
      const Item = Items[Index];
      if (!Item?.parent) continue;
      const SlotName = String(Item.userData?.LayoutSlot || "");
      const Anchor = Chunk.Layout?.PriceAnchors?.[SlotName];
      if (!Anchor) continue;
      const Price = ItemPrice(Item, Chunk, Index);
      const Sign = await CreateCompactPricePlacard3D(ItemLabel(Item), Price, {
        Name: `CompactPriceTagR83-${Index}`,
        AccentColor: AccentColors[0]
      });
      Sign.scale.setScalar(0.76);
      Sign.position.set(Anchor.X, 0, Anchor.Z);
      FaceCompactPricePlacardTowardAisle(Sign, Anchor.X, Anchor.Z);
      Sign.userData.ChunkId = Chunk.Id;
      Sign.userData.LayoutSlot = `${SlotName}.Price`;
      Sign.userData.LayoutAuthority = Chunk.Layout?.Authority;
      Sign.userData.SourceModel = Item;
      Sign.userData.CompactPriceAuthorityR83 = true;
      Sign.userData.DecorationNoCollision = false;
      Sign.userData.Price = Price;
      Chunk.Group.add(Sign);
      if (Index % 4 === 3) await Yield();
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
  return SellableItems(Chunk).length;
}

function Discover() {
  for (const Chunk of Game.PreparedChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) RebuildChunk(Chunk).catch(() => {});
  for (const Chunk of Game.ActiveChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) RebuildChunk(Chunk).catch(() => {});
}

Discover();
const Interval = setInterval(Discover, 1000);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_COMPACT_PRICE_TAGS_R83__ = { RebuildChunk, CountTags, CountSellable, Discover };
window.__STORE_COMPACT_PRICE_TAGS_BUILD__ = "V0.27.0";