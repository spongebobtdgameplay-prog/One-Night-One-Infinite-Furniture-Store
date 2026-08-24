import * as THREE from "three";
import { CreateCompactPricePlacard3D, FaceCompactPricePlacardTowardAisle } from "./price-tag-utility-r81.js?v=20260824-85";
import { FurniturePrice } from "./store-pricing-r75.js?v=20260824-84";
import { FriendlyItemName } from "./display-layout-utility-r74.js?v=20260824-84";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.CollisionBoxes || !Game?.Placement) {
  throw new Error("The Infinity Store game must load before compact price tags.");
}

const FurnitureNames = new Set([
  "Couch_Large1",
  "Couch_L",
  "Chair_2",
  "Table_RoundLarge",
  "Bed_King",
  "Bed_Single",
  "NightStand_2",
  "Shelf_Large",
  "Bookshelf",
  "Kitchen_Cabinet1",
  "Kitchen_Fridge",
  "Kitchen_Oven",
  "Kitchen_Sink",
  "Bathroom_Bathtub",
  "Bathroom_Toilet",
  "Light_Floor1"
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

const AccentColors = [0xb85f47, 0x708c72, 0x6f87a0, 0xb58d48, 0x9a708f, 0x5f918d];
const Rebuilding = new WeakSet();
const Signatures = new WeakMap();

function BoundsOf(Object) {
  Object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Object);
}

function SellableItems(Chunk) {
  const Items = [];
  for (const Model of Chunk.Models || []) {
    if (Model?.parent && FurnitureNames.has(Model.name)) Items.push(Model);
  }
  for (const Object of Chunk.Group?.children || []) {
    if (!Object?.parent || Object.parent !== Chunk.Group) continue;
    if (!Object.userData?.RetailImportedR79 || !RetailLabels.has(Object.name)) continue;
    Items.push(Object);
  }
  Items.sort((A, B) => {
    const ACenter = BoundsOf(A).getCenter(new THREE.Vector3());
    const BCenter = BoundsOf(B).getCenter(new THREE.Vector3());
    if (Math.abs(ACenter.z - BCenter.z) > 0.001) return ACenter.z - BCenter.z;
    return ACenter.x - BCenter.x;
  });
  return Items;
}

function ItemLabel(Item) {
  return RetailLabels.get(Item.name) || FriendlyItemName(Item.name);
}

function ChunkSignature(Items) {
  return Items.map(Item => {
    const Center = BoundsOf(Item).getCenter(new THREE.Vector3());
    return `${Item.uuid}:${Center.x.toFixed(2)}:${Center.z.toFixed(2)}`;
  }).join("|");
}

function ExistingCompactSigns(Chunk) {
  const Signs = [];
  Chunk.Group?.traverse?.(Object => {
    if (Object?.userData?.CompactPriceAuthorityR81) Signs.push(Object);
  });
  return Signs;
}

function RemoveAllFurniturePriceSigns(Chunk) {
  const Remove = [];
  Chunk.Group?.traverse?.(Object => {
    const Name = String(Object?.name || "");
    if (
      Name.startsWith("FurnitureItemSignR74-") ||
      Name.startsWith("FurnitureItemSignR80-") ||
      Name.startsWith("FurniturePriceSignR72") ||
      Name.startsWith("FurniturePriceSignR73")
    ) Remove.push(Object);
  });
  for (const Object of Remove) Object.parent?.remove(Object);
}

function CircleHitsBox(X, Z, Radius, Box) {
  const ClosestX = THREE.MathUtils.clamp(X, Box.min.x, Box.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Z, Box.min.z, Box.max.z);
  const DX = X - ClosestX;
  const DZ = Z - ClosestZ;
  return DX * DX + DZ * DZ < Radius * Radius;
}

function StructureClear(Chunk, X, Z) {
  for (const Box of Chunk.StructureBounds || []) {
    if (CircleHitsBox(X, Z, 0.13, Box)) return false;
  }
  return Math.abs(X) < 16.15 && Z > Chunk.BottomZ + 0.32 && Z < Chunk.TopZ - 0.32;
}

function FarEnoughFromOtherTags(X, Z, Occupied, Minimum = 0.56) {
  for (const Position of Occupied) {
    const DX = Position.x - X;
    const DZ = Position.z - Z;
    if (DX * DX + DZ * DZ < Minimum * Minimum) return false;
  }
  return true;
}

function CandidatePositions(Chunk, Item, Index) {
  const Bounds = BoundsOf(Item);
  if (Bounds.isEmpty()) return [];
  const Center = Bounds.getCenter(new THREE.Vector3());
  const AisleX = Center.x < 0 ? Bounds.max.x + 0.16 : Bounds.min.x - 0.16;
  const InnerZ1 = THREE.MathUtils.lerp(Bounds.min.z, Bounds.max.z, 0.25);
  const InnerZ2 = THREE.MathUtils.lerp(Bounds.min.z, Bounds.max.z, 0.75);
  const First = Index % 2 === 0 ? InnerZ1 : InnerZ2;
  const Second = Index % 2 === 0 ? InnerZ2 : InnerZ1;
  const AwayX = Center.x < 0 ? Bounds.min.x - 0.16 : Bounds.max.x + 0.16;
  return [
    { X: AisleX, Z: First },
    { X: AisleX, Z: Second },
    { X: AisleX, Z: Center.z },
    { X: AwayX, Z: First },
    { X: AwayX, Z: Second }
  ].map(Position => ({
    X: THREE.MathUtils.clamp(Position.X, -15.95, 15.95),
    Z: THREE.MathUtils.clamp(Position.Z, Chunk.BottomZ + 0.38, Chunk.TopZ - 0.38)
  }));
}

function FindPlacement(Chunk, Item, Index, Occupied) {
  const Candidates = CandidatePositions(Chunk, Item, Index);
  for (const Candidate of Candidates) {
    if (!StructureClear(Chunk, Candidate.X, Candidate.Z)) continue;
    if (!FarEnoughFromOtherTags(Candidate.X, Candidate.Z, Occupied)) continue;
    return Candidate;
  }

  const Bounds = BoundsOf(Item);
  if (Bounds.isEmpty()) return null;
  const Center = Bounds.getCenter(new THREE.Vector3());
  const Direction = Center.x < 0 ? 1 : -1;
  for (let Step = 0; Step < 5; Step += 1) {
    const X = THREE.MathUtils.clamp(
      Center.x < 0 ? Bounds.max.x + 0.16 + Step * 0.10 : Bounds.min.x - 0.16 - Step * 0.10,
      -15.95,
      15.95
    );
    const Z = THREE.MathUtils.clamp(Center.z + Direction * (Step % 2 === 0 ? 0.10 : -0.10) * Step, Chunk.BottomZ + 0.38, Chunk.TopZ - 0.38);
    if (StructureClear(Chunk, X, Z) && FarEnoughFromOtherTags(X, Z, Occupied, 0.46)) return { X, Z };
  }

  return Candidates[0] || null;
}

async function RebuildChunk(Chunk, Items, Signature) {
  if (Rebuilding.has(Chunk)) return;
  Rebuilding.add(Chunk);
  try {
    RemoveAllFurniturePriceSigns(Chunk);
    const Occupied = [];

    for (let Index = 0; Index < Items.length; Index += 1) {
      const Item = Items[Index];
      if (!Item?.parent) continue;
      const Placement = FindPlacement(Chunk, Item, Index, Occupied);
      if (!Placement) continue;

      const Price = FurniturePrice(Item.name, Chunk.Index, Index);
      const Sign = await CreateCompactPricePlacard3D(ItemLabel(Item), Price, {
        Name: `FurnitureItemSignR74-Compact-${Index}`,
        AccentColor: AccentColors[Index % AccentColors.length]
      });
      Sign.position.set(Placement.X, 0, Placement.Z);
      FaceCompactPricePlacardTowardAisle(Sign, Placement.X, Placement.Z);
      Sign.userData.ChunkId = Chunk.Id;
      Sign.userData.SourceModel = Item;
      Sign.userData.CompactPriceAuthorityR81 = true;
      Sign.userData.PriceFinishR80 = true;
      Sign.userData.DecorationNoCollision = false;
      Sign.userData.Price = Price;
      Chunk.Group.add(Sign);
      Occupied.push(new THREE.Vector3(Placement.X, 0, Placement.Z));

      if (Index % 3 === 2) {
        await new Promise(Resolve => {
          if ("requestIdleCallback" in window) requestIdleCallback(() => Resolve(), { timeout: 650 });
          else setTimeout(Resolve, 14);
        });
      }
    }

    Signatures.set(Chunk, Signature);
  } finally {
    Rebuilding.delete(Chunk);
  }
}

function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group) return;
  const Items = SellableItems(Chunk);
  const Signature = ChunkSignature(Items);
  const CompactSigns = ExistingCompactSigns(Chunk);
  let HasLargeLegacySign = false;
  Chunk.Group.traverse(Object => {
    if (HasLargeLegacySign) return;
    const Name = String(Object?.name || "");
    if (Name.startsWith("FurnitureItemSignR74-") && !Object.userData?.CompactPriceAuthorityR81) HasLargeLegacySign = true;
  });

  if (!HasLargeLegacySign && Signatures.get(Chunk) === Signature && CompactSigns.length === Items.length) return;
  RebuildChunk(Chunk, Items, Signature).catch(Error => console.warn("Compact price placard rebuild failed", Error));
}

function ProcessAll() {
  const Seen = new Set();
  for (const Chunk of Game.ActiveChunks.values()) {
    Seen.add(Chunk);
    ProcessChunk(Chunk);
  }
  for (const Chunk of Game.PreparedChunks.values()) {
    if (!Seen.has(Chunk)) ProcessChunk(Chunk);
  }
}

ProcessAll();
setTimeout(ProcessAll, 120);
setTimeout(ProcessAll, 520);
const Interval = setInterval(ProcessAll, 600);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_COMPACT_PRICE_TAGS_R81__ = { ProcessAll, ProcessChunk };
window.__STORE_COMPACT_PRICE_TAGS_BUILD__ = "V0.20.2-R81";