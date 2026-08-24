import * as THREE from "three";
import { CreateStandingPriceSign3D, FaceSignTowardAisle } from "./sign-utility-r73.js?v=20260824-84";
import { FurniturePrice } from "./store-pricing-r75.js?v=20260824-84";
import { FriendlyItemName } from "./display-layout-utility-r74.js?v=20260824-84";
import {
  CreateOnlineWallDecoration,
  OnlineDecorationKeys
} from "./online-decoration-library-r75.js?v=20260824-79";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.CollisionBoxes || !Game?.Placement) {
  throw new Error("The Infinity Store game must load before store finishing.");
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
const ProcessedPriceSignatures = new WeakMap();
const PriceWork = new WeakSet();
const FinishedPartitions = new WeakSet();
const RearDecorated = new WeakSet();

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
    if (!Object.userData?.RetailImportedR79) continue;
    if (!RetailLabels.has(Object.name)) continue;
    Items.push(Object);
  }
  Items.sort((A, B) => {
    const AZ = BoundsOf(A).getCenter(new THREE.Vector3()).z;
    const BZ = BoundsOf(B).getCenter(new THREE.Vector3()).z;
    if (Math.abs(AZ - BZ) > 0.001) return AZ - BZ;
    return BoundsOf(A).getCenter(new THREE.Vector3()).x - BoundsOf(B).getCenter(new THREE.Vector3()).x;
  });
  return Items;
}

function ItemLabel(Item) {
  return RetailLabels.get(Item.name) || FriendlyItemName(Item.name);
}

function PriceSignature(Items) {
  return Items.map(Item => {
    const Bounds = BoundsOf(Item);
    const Center = Bounds.getCenter(new THREE.Vector3());
    return `${Item.uuid}:${Item.name}:${Center.x.toFixed(2)}:${Center.z.toFixed(2)}`;
  }).join("|");
}

function ExistingFinishSigns(Chunk) {
  const Signs = [];
  Chunk.Group?.traverse?.(Object => {
    if (Object?.userData?.PriceFinishR80) Signs.push(Object);
  });
  return Signs;
}

function RemovePriceSigns(Chunk) {
  const Remove = [];
  Chunk.Group?.traverse?.(Object => {
    const Name = String(Object?.name || "");
    if (Name.startsWith("FurnitureItemSignR74-") || Name.startsWith("FurnitureItemSignR80-")) Remove.push(Object);
  });
  for (const Object of Remove) Object.parent?.remove(Object);
}

function FarEnough(X, Z, Occupied, Minimum = 0.78) {
  for (const Position of Occupied) {
    const DX = Position.x - X;
    const DZ = Position.z - Z;
    if (DX * DX + DZ * DZ < Minimum * Minimum) return false;
  }
  return true;
}

function NearTagCandidates(Chunk, Item) {
  const Bounds = BoundsOf(Item);
  if (Bounds.isEmpty()) return [];
  const Center = Bounds.getCenter(new THREE.Vector3());
  const Gap = 0.60;
  const AisleX = Center.x < 0 ? Bounds.max.x + Gap : Bounds.min.x - Gap;
  const Raw = [
    [AisleX, Center.z],
    [AisleX, Center.z + 0.36],
    [AisleX, Center.z - 0.36],
    [AisleX, Center.z + 0.70],
    [AisleX, Center.z - 0.70],
    [Center.x, Bounds.min.z - 0.58],
    [Center.x, Bounds.max.z + 0.58]
  ];
  return Raw.map(([X, Z]) => ({
    X: THREE.MathUtils.clamp(X, -15.70, 15.70),
    Z: THREE.MathUtils.clamp(Z, Chunk.BottomZ + 0.72, Chunk.TopZ - 0.72)
  }));
}

function NearTagPlacement(Chunk, Item, Occupied) {
  const Candidates = NearTagCandidates(Chunk, Item);
  let SafeFallback = null;
  for (const Candidate of Candidates) {
    let Placement = Candidate;
    try {
      const Cast = Game.Placement.ShapeCastPlacement(Chunk, "FurniturePriceSignR72", Candidate.X, Candidate.Z, 0, false);
      if (!Cast) continue;
      if (Math.hypot(Cast.X - Candidate.X, Cast.Z - Candidate.Z) > 0.42) continue;
      Placement = { X: Cast.X, Z: Cast.Z };
    } catch {}
    SafeFallback ||= Placement;
    if (FarEnough(Placement.X, Placement.Z, Occupied)) return Placement;
  }
  if (SafeFallback) return SafeFallback;
  return Candidates[0] || null;
}

async function RebuildPriceTags(Chunk, Items, Signature) {
  if (PriceWork.has(Chunk)) return;
  PriceWork.add(Chunk);
  try {
    RemovePriceSigns(Chunk);
    const Occupied = [];
    const AisleNumber = Chunk.Index >= 0 ? `${Chunk.Index + 1}` : `B${Math.abs(Chunk.Index)}`;

    for (let Index = 0; Index < Items.length; Index += 1) {
      const Item = Items[Index];
      if (!Item?.parent) continue;
      const Position = NearTagPlacement(Chunk, Item, Occupied);
      if (!Position) continue;

      const Sign = await CreateStandingPriceSign3D(ItemLabel(Item), {
        Name: `FurnitureItemSignR74-${Index}`,
        Style: Index % 3,
        AccentColor: AccentColors[Index % AccentColors.length],
        AisleLabel: `AISLE ${AisleNumber}`,
        Price: FurniturePrice(Item.name, Chunk.Index, Index)
      });
      Sign.scale.setScalar(0.82);
      Sign.position.set(Position.X, 0, Position.Z);
      FaceSignTowardAisle(Sign, Position.X, Position.Z);
      Sign.userData.ChunkId = Chunk.Id;
      Sign.userData.SourceModel = Item;
      Sign.userData.PriceFinishR80 = true;
      Sign.userData.DecorationNoCollision = false;
      Sign.userData.Price = FurniturePrice(Item.name, Chunk.Index, Index);
      Chunk.Group.add(Sign);
      Occupied.push(new THREE.Vector3(Position.X, 0, Position.Z));

      if (Index % 2 === 1) {
        await new Promise(Resolve => {
          if ("requestIdleCallback" in window) requestIdleCallback(() => Resolve(), { timeout: 700 });
          else setTimeout(Resolve, 18);
        });
      }
    }
    ProcessedPriceSignatures.set(Chunk, Signature);
  } finally {
    PriceWork.delete(Chunk);
  }
}

function EnsurePriceTags(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group) return;
  const Items = SellableItems(Chunk);
  const Signature = PriceSignature(Items);
  const Existing = ExistingFinishSigns(Chunk);
  if (ProcessedPriceSignatures.get(Chunk) === Signature && Existing.length === Items.length) return;
  RebuildPriceTags(Chunk, Items, Signature).catch(Error => console.warn("Close price tags failed", Error));
}

function BrightPartitionMaterial(Material, Color) {
  if (!Material?.clone) return Material;
  const Copy = Material.clone();
  Copy.color?.setHex(Color, THREE.SRGBColorSpace);
  if ("roughness" in Copy) Copy.roughness = Math.max(0.72, Copy.roughness ?? 0.82);
  if ("metalness" in Copy) Copy.metalness = Math.min(0.18, Copy.metalness ?? 0.05);
  Copy.needsUpdate = true;
  return Copy;
}

async function FinishPartitions(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || FinishedPartitions.has(Chunk)) return;
  FinishedPartitions.add(Chunk);
  const Partitions = [];
  Chunk.Group?.traverse?.(Object => {
    if (Object?.name === "ShowroomPartition" && Object.isMesh) Partitions.push(Object);
    else if ((Object?.name === "PartitionCap" || Object?.name === "PartitionBase") && Object.isMesh) {
      Object.material = BrightPartitionMaterial(Object.material, 0x8f877a);
    }
  });

  for (let Index = 0; Index < Partitions.length; Index += 1) {
    const Partition = Partitions[Index];
    Partition.material = BrightPartitionMaterial(Partition.material, 0xc4beb2);
    Partition.userData.MerchandisingWallR80 = true;
    const Bounds = BoundsOf(Partition);
    const Center = Bounds.getCenter(new THREE.Vector3());
    const TowardAisle = Center.x > 0 ? -1 : 1;
    const X = Center.x + TowardAisle * (Bounds.getSize(new THREE.Vector3()).x * 0.5 + 0.035);
    try {
      const Frame = await CreateOnlineWallDecoration(
        Index % 2 === 0 ? OnlineDecorationKeys.WallFrameMedium : OnlineDecorationKeys.WallFrameLarge,
        X,
        1.62,
        Center.z,
        Index % 2 === 0 ? 0.62 : 0.76,
        Center.x > 0 ? -Math.PI * 0.5 : Math.PI * 0.5
      );
      if (Frame) {
        Frame.name = `OnlineWallDecorationR76-PartitionR80-${Index}`;
        Frame.userData.ChunkId = Chunk.Id;
        Frame.userData.DecorationNoCollision = false;
        Chunk.Group.add(Frame);
      }
    } catch (Error) {
      console.warn("Partition display frame unavailable", Error);
    }
  }
}

function AddRearCollision(Chunk, Bounds) {
  let Entry = Chunk.CollisionEntries.find(Value => Value?.Type === "RearStoreWallR80");
  if (!Entry) {
    Entry = { ChunkId: Chunk.Id, Type: "RearStoreWallR80" };
    Chunk.CollisionEntries.push(Entry);
  }
  Entry.Box = Bounds.clone();
  Entry.OriginalBox = Bounds.clone();
  Entry.OriginalLegacyBox = Bounds.clone();
  Entry.Active = Boolean(Chunk.Active);
  Entry.LegacyCollisionDisabled = false;
  Entry.PreciseGeometry = false;
  if (Chunk.Active && !Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
  if (!Chunk.StructureBounds.some(Box => Box?.userData?.RearStoreWallR80)) {
    const Structure = Bounds.clone();
    Structure.userData = { RearStoreWallR80: true };
    Chunk.StructureBounds.push(Structure);
  }
}

async function EnsureRearClosure() {
  const Chunk = Game.ActiveChunks.get(0) || Game.PreparedChunks.get(0);
  if (!Chunk?.Ready || !Chunk.Group || RearDecorated.has(Chunk)) return;
  RearDecorated.add(Chunk);

  const Existing = Chunk.Group.getObjectByName("RearStoreClosureR80");
  if (Existing) return;
  const WallSource = Chunk.Group.getObjectByName("WallLeft");
  const BaseSource = Chunk.Group.getObjectByName("BaseboardLeft");
  const WallMaterial = BrightPartitionMaterial(WallSource?.material, 0xc2bcb1) || new THREE.MeshStandardMaterial({ color: 0xc2bcb1, roughness: 0.94 });
  const BaseMaterial = BrightPartitionMaterial(BaseSource?.material, 0x8e8577) || new THREE.MeshStandardMaterial({ color: 0x8e8577, roughness: 0.78, metalness: 0.12 });

  const Group = new THREE.Group();
  Group.name = "RearStoreClosureR80";
  Group.userData.ChunkId = Chunk.Id;
  const RearZ = Chunk.TopZ + 0.08;

  const Wall = new THREE.Mesh(new THREE.BoxGeometry(34, 3.80, 0.22), WallMaterial);
  Wall.name = "RearStoreWallR80";
  Wall.position.set(0, 1.86, RearZ);
  const Base = new THREE.Mesh(new THREE.BoxGeometry(33.7, 0.18, 0.26), BaseMaterial);
  Base.name = "RearStoreBaseboardR80";
  Base.position.set(0, 0.09, RearZ - 0.02);
  Group.add(Wall, Base);
  Chunk.Group.add(Group);

  Wall.updateWorldMatrix(true, true);
  const Bounds = BoundsOf(Wall);
  AddRearCollision(Chunk, Bounds);

  const RearFrames = [
    { X: -7.2, Key: OnlineDecorationKeys.WallFrameLarge, Height: 0.92 },
    { X: 7.2, Key: OnlineDecorationKeys.WallFrameLarge, Height: 0.92 }
  ];
  for (let Index = 0; Index < RearFrames.length; Index += 1) {
    const Plan = RearFrames[Index];
    try {
      const Frame = await CreateOnlineWallDecoration(Plan.Key, Plan.X, 1.82, RearZ - 0.13, Plan.Height, 0);
      if (!Frame) continue;
      Frame.name = `OnlineWallDecorationR76-RearR80-${Index}`;
      Frame.userData.ChunkId = Chunk.Id;
      Frame.userData.DecorationNoCollision = false;
      Chunk.Group.add(Frame);
    } catch (Error) {
      console.warn("Rear wall decoration unavailable", Error);
    }
  }
}

function ProcessAll() {
  const Seen = new Set();
  for (const Chunk of Game.ActiveChunks.values()) {
    Seen.add(Chunk);
    EnsurePriceTags(Chunk);
    FinishPartitions(Chunk).catch(Error => console.warn("Partition finish failed", Error));
  }
  for (const Chunk of Game.PreparedChunks.values()) {
    if (Seen.has(Chunk)) continue;
    EnsurePriceTags(Chunk);
    FinishPartitions(Chunk).catch(Error => console.warn("Partition finish failed", Error));
  }
  EnsureRearClosure().catch(Error => console.warn("Rear closure failed", Error));
}

ProcessAll();
const Interval = setInterval(ProcessAll, 720);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_FINISH_R80__ = { ProcessAll, EnsurePriceTags, EnsureRearClosure };
window.__STORE_FINISH_BUILD__ = "V0.20.1-R80";