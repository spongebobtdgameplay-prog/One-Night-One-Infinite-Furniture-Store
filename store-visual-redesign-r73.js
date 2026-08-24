import * as THREE from "three";
import { CreateDepartmentSign3D, CreateStandingPriceSign3D } from "./sign-utility-r73.js";
import { CreateTaskTerminal3D } from "./task-terminal-utility-r73.js";
import { Preload3DTextFont } from "./three-text-utility-r73.js";
import {
  CreateDisplayCarpet,
  DisplayVariant,
  FaceTowardAisle,
  FindSpacedSignPlacement,
  FriendlyItemName,
  RecordSignPosition,
  ShouldUseCarpet
} from "./display-layout-utility-r74.js";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.CollisionBoxes || !Game?.Placement) throw new Error("Store game must load before visual redesign.");

const ProcessedModelCounts = new WeakMap();
const QueuedModelCounts = new WeakMap();
const ProcessingChunks = new WeakSet();
const Queue = [];
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
const AccentColors = [0xb85f47, 0x708c72, 0x6f87a0, 0xb58d48, 0x9a708f, 0x5f918d];

function FurnitureCount(Chunk) {
  let Count = 0;
  for (const Model of Chunk.Models || []) {
    if (Model?.parent && FurnitureNames.has(Model.name)) Count += 1;
  }
  return Count;
}

function RemoveByName(Chunk, Name) {
  const Object = Chunk.Group?.getObjectByName?.(Name);
  if (Object?.parent) Object.parent.remove(Object);
  return Object || null;
}

function RemoveOldDisplayObjects(Chunk) {
  const Remove = [];
  Chunk.Group?.traverse?.(Object => {
    const Name = String(Object?.name || "");
    if (
      Name === "FurniturePriceSignR72" ||
      Name === "FurniturePriceSignR73" ||
      Name.startsWith("FurnitureItemSignR74-") ||
      Name.startsWith("FurnitureDisplayCarpetR74-")
    ) Remove.push(Object);
  });
  for (const Object of Remove) Object.parent?.remove(Object);

  for (let Index = Chunk.CollisionEntries.length - 1; Index >= 0; Index -= 1) {
    const Entry = Chunk.CollisionEntries[Index];
    if (!Entry) continue;
    if (Entry.Type !== "FurniturePriceSignR72" && Entry.Type !== "FurniturePriceSignR73" && Entry.Type !== "FurnitureItemSignR74") continue;
    const GlobalIndex = Game.CollisionBoxes.indexOf(Entry);
    if (GlobalIndex >= 0) Game.CollisionBoxes.splice(GlobalIndex, 1);
    Entry.Active = false;
    Chunk.CollisionEntries.splice(Index, 1);
  }
}

function CollisionBoxFromObject(Object, Height = null) {
  Object.updateWorldMatrix(true, true);
  const Bounds = new THREE.Box3().setFromObject(Object);
  if (Bounds.isEmpty()) return null;
  const Center = Bounds.getCenter(new THREE.Vector3());
  const Size = Bounds.getSize(new THREE.Vector3());
  return new THREE.Box3(
    new THREE.Vector3(Center.x - Math.max(0.10, Size.x * 0.46), 0, Center.z - Math.max(0.10, Size.z * 0.46)),
    new THREE.Vector3(Center.x + Math.max(0.10, Size.x * 0.46), Height ?? Math.max(1.0, Bounds.max.y), Center.z + Math.max(0.10, Size.z * 0.46))
  );
}

function AddCollisionFromObject(Chunk, Type, Object, Height = null) {
  const Box = CollisionBoxFromObject(Object, Height);
  if (!Box) return null;
  const Entry = {
    Box,
    OriginalBox: Box.clone(),
    OriginalLegacyBox: Box.clone(),
    ChunkId: Chunk.Id,
    Type,
    Active: Boolean(Chunk.Active),
    VisualRedesignR74: true
  };
  Chunk.CollisionEntries.push(Entry);
  if (Chunk.Active && !Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
  return Entry;
}

function ReplaceCollisionFromObject(Chunk, Type, Object, Height = null) {
  const Box = CollisionBoxFromObject(Object, Height);
  if (!Box) return null;
  let Entry = Chunk.CollisionEntries.find(Value => Value?.Type === Type && Value.VisualRedesignR74 !== true);
  if (!Entry) Entry = Chunk.CollisionEntries.find(Value => Value?.Type === Type);
  if (!Entry) {
    Entry = { ChunkId: Chunk.Id, Type };
    Chunk.CollisionEntries.push(Entry);
  }
  Entry.Box = Box;
  Entry.OriginalBox = Box.clone();
  Entry.OriginalLegacyBox = Box.clone();
  Entry.PreciseGeometry = false;
  Entry.PreciseTriangles = null;
  Entry.GeometryBounds = null;
  Entry.TestPlayerCollision = null;
  Entry.TestCollision = null;
  Entry.LegacyCollisionDisabled = false;
  Entry.RedundantPreciseSibling = false;
  Entry.VisualRedesignR74 = true;
  Entry.Active = Boolean(Chunk.Active);
  if (Chunk.Active && !Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
  return Entry;
}

function YieldVisualWork() {
  return new Promise(Resolve => {
    if ("requestIdleCallback" in window) requestIdleCallback(() => Resolve(), { timeout: 700 });
    else setTimeout(Resolve, 20);
  });
}

async function ReplaceDepartmentSign(Chunk) {
  RemoveByName(Chunk, "DepartmentHeaderR73");
  RemoveByName(Chunk, "DepartmentHeaderR72");
  RemoveByName(Chunk, "DepartmentHeaderV13");
  RemoveByName(Chunk, "SectionSign");
  RemoveByName(Chunk, "SignMount");

  const Sign = await CreateDepartmentSign3D(Chunk.Theme, {
    Name: "DepartmentHeaderR73",
    Width: 6.25,
    Height: 0.96,
    Depth: 0.20
  });
  Sign.userData.ChunkId = Chunk.Id;
  Sign.position.set(0, 2.88, Chunk.TopZ - 2.72);
  Chunk.Group.add(Sign);
}

async function CreateItemSigns(Chunk) {
  RemoveOldDisplayObjects(Chunk);
  const Models = (Chunk.Models || []).filter(Model => Model?.parent && FurnitureNames.has(Model.name));
  Models.sort((Left, Right) => {
    const ZDifference = Left.position.z - Right.position.z;
    if (Math.abs(ZDifference) > 0.001) return ZDifference;
    return Left.position.x - Right.position.x;
  });

  const Occupied = [];
  const AisleNumber = Chunk.Index >= 0 ? `${Chunk.Index + 1}` : `B${Math.abs(Chunk.Index)}`;

  for (let Index = 0; Index < Models.length; Index += 1) {
    const Model = Models[Index];
    const Position = FindSpacedSignPlacement(Game, Chunk, Model, Occupied, { MinimumSpacing: 1.55 });
    if (!Position) continue;

    const Variant = DisplayVariant(Model, Index);
    const Sign = await CreateStandingPriceSign3D(FriendlyItemName(Model.name), {
      Name: `FurnitureItemSignR74-${Index}`,
      Style: Variant,
      AccentColor: AccentColors[Variant % AccentColors.length],
      AisleLabel: `AISLE ${AisleNumber}`
    });
    Sign.userData.ChunkId = Chunk.Id;
    Sign.userData.SourceModel = Model;
    Sign.position.set(Position.X, 0, Position.Z);
    FaceTowardAisle(Sign, Position.X, Position.Z);
    Chunk.Group.add(Sign);
    AddCollisionFromObject(Chunk, "FurnitureItemSignR74", Sign, 1.16);
    RecordSignPosition(Occupied, Position);

    if (ShouldUseCarpet(Chunk.Index, Model, Index) && Model.name !== "Light_Floor1") {
      const Carpet = CreateDisplayCarpet(Model, Variant);
      if (Carpet) {
        Carpet.name = `FurnitureDisplayCarpetR74-${Index}`;
        Carpet.userData.ChunkId = Chunk.Id;
        Chunk.Group.add(Carpet);
      }
    }

    if (Index % 2 === 1) await YieldVisualWork();
  }
}

async function ReplaceTaskTerminal(Chunk, Task) {
  const Root = Task?.Object;
  if (!Root?.isObject3D || Root.userData?.VisualRedesignR74) return;

  const Terminal = await CreateTaskTerminal3D(Task.Type);
  const Children = [...Terminal.Group.children];
  while (Root.children.length) Root.remove(Root.children[0]);
  Root.add(...Children);
  Root.userData.VisualRedesignR73 = true;
  Root.userData.VisualRedesignR74 = true;
  Root.userData.TaskTerminalUtilityR73 = true;
  Task.Screen = Terminal.Screen;
  ReplaceCollisionFromObject(Chunk, "StoreTaskTerminalR72", Root, 1.62);
}

function FindChunkByIndex(Index) {
  return Game.ActiveChunks.get(Index) || Game.PreparedChunks.get(Index) || null;
}

function UpdateDepartmentVisibility() {
  for (const Chunk of Game.ActiveChunks.values()) {
    const Sign = Chunk.Group?.getObjectByName?.("DepartmentHeaderR73");
    if (!Sign) continue;
    const Previous = FindChunkByIndex(Chunk.Index - 1);
    Sign.visible = !Previous || Previous.Theme !== Chunk.Theme;
  }
}

async function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || ProcessingChunks.has(Chunk)) return;
  ProcessingChunks.add(Chunk);

  try {
    await ReplaceDepartmentSign(Chunk);
    for (const Task of Chunk.TaskRecords || []) await ReplaceTaskTerminal(Chunk, Task);
    await CreateItemSigns(Chunk);
    Chunk.Group.userData.VisualRedesignR73 = true;
    Chunk.Group.userData.VisualRedesignR74 = true;
    ProcessedModelCounts.set(Chunk, FurnitureCount(Chunk));
  } finally {
    ProcessingChunks.delete(Chunk);
  }
}

function QueueChunkIfNeeded(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group?.userData?.WorldPolishR72 || ProcessingChunks.has(Chunk)) return;
  const Count = FurnitureCount(Chunk);
  if (Chunk.Group.userData.VisualRedesignR74 && ProcessedModelCounts.get(Chunk) === Count) return;
  if (QueuedModelCounts.get(Chunk) === Count) return;
  QueuedModelCounts.set(Chunk, Count);
  Queue.push({ Chunk, Count });
}

function Discover() {
  for (const Chunk of Game.ActiveChunks.values()) QueueChunkIfNeeded(Chunk);
  for (const Chunk of Game.PreparedChunks.values()) QueueChunkIfNeeded(Chunk);
  Pump();
  UpdateDepartmentVisibility();
}

let Running = false;
function Pump() {
  if (Running || !Queue.length) return;
  Running = true;

  const Run = async () => {
    const Job = Queue.shift();
    if (Job?.Chunk) {
      QueuedModelCounts.delete(Job.Chunk);
      await ProcessChunk(Job.Chunk);
    }
    Running = false;
    UpdateDepartmentVisibility();
    if (Queue.length) setTimeout(Pump, 28);
  };

  if ("requestIdleCallback" in window) requestIdleCallback(() => Run(), { timeout: 950 });
  else setTimeout(Run, 36);
}

Preload3DTextFont().catch(Error => console.warn("3D text font failed to preload", Error));
Discover();
const Interval = setInterval(Discover, 560);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_VISUAL_REDESIGN_R73__ = { Discover, ProcessChunk };
window.__STORE_VISUAL_REDESIGN_BUILD__ = "V0.16.0-R74";