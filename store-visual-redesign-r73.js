import * as THREE from "three";
import { CreateDepartmentSign3D, CreateStandingPriceSign3D, GetSignBounds } from "./sign-utility-r73.js";
import { CreateTaskTerminal3D } from "./task-terminal-utility-r73.js";
import { Preload3DTextFont } from "./three-text-utility-r73.js";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.CollisionBoxes) throw new Error("Store game must load before visual redesign.");

const ProcessedChunks = new WeakSet();
const QueuedChunks = new WeakSet();
const ProcessingChunks = new WeakSet();
const Queue = [];

function FriendlyName(Name) {
  return String(Name || "ITEM").replaceAll("_", " ").replace(/\d+/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function RemoveByName(Chunk, Name) {
  const Object = Chunk.Group?.getObjectByName?.(Name);
  if (Object?.parent) Object.parent.remove(Object);
  return Object || null;
}

function UpdateCollisionFromObject(Chunk, Type, Object, Height = null) {
  Object.updateWorldMatrix(true, true);
  const Bounds = new THREE.Box3().setFromObject(Object);
  if (Bounds.isEmpty()) return;

  const Center = Bounds.getCenter(new THREE.Vector3());
  const Size = Bounds.getSize(new THREE.Vector3());
  const Collision = new THREE.Box3(
    new THREE.Vector3(Center.x - Math.max(0.10, Size.x * 0.46), 0, Center.z - Math.max(0.10, Size.z * 0.46)),
    new THREE.Vector3(Center.x + Math.max(0.10, Size.x * 0.46), Height ?? Math.max(1.0, Bounds.max.y), Center.z + Math.max(0.10, Size.z * 0.46))
  );

  let Entry = (Chunk.CollisionEntries || []).find(Value => Value?.Type === Type && Value.VisualRedesignR73 !== true);
  if (!Entry) Entry = (Chunk.CollisionEntries || []).find(Value => Value?.Type === Type);
  if (!Entry) {
    Entry = { ChunkId: Chunk.Id, Type, Active: Boolean(Chunk.Active) };
    Chunk.CollisionEntries.push(Entry);
  }

  Entry.Box = Collision;
  Entry.OriginalBox = Collision.clone();
  Entry.OriginalLegacyBox = Collision.clone();
  Entry.PreciseGeometry = false;
  Entry.PreciseTriangles = null;
  Entry.GeometryBounds = null;
  Entry.TestPlayerCollision = null;
  Entry.TestCollision = null;
  Entry.LegacyCollisionDisabled = false;
  Entry.RedundantPreciseSibling = false;
  Entry.VisualRedesignR73 = true;
  Entry.Active = Boolean(Chunk.Active);

  if (Chunk.Active && !Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
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

async function ReplacePriceSign(Chunk) {
  const Old = Chunk.Group?.getObjectByName?.("FurniturePriceSignR72") || null;
  const Existing = Chunk.Group?.getObjectByName?.("FurniturePriceSignR73") || null;
  if (Existing) Existing.parent?.remove(Existing);
  if (!Old) return;

  const Position = Old.position.clone();
  const Quaternion = Old.quaternion.clone();
  const Source = Old.userData?.SourceModel;
  Old.parent?.remove(Old);
  if (!Source?.parent) return;

  const Sign = await CreateStandingPriceSign3D(FriendlyName(Source.name), { Name: "FurniturePriceSignR73" });
  Sign.userData.ChunkId = Chunk.Id;
  Sign.userData.SourceModel = Source;
  Sign.position.copy(Position);
  Sign.quaternion.copy(Quaternion);
  Chunk.Group.add(Sign);
  UpdateCollisionFromObject(Chunk, "FurniturePriceSignR72", Sign, 1.12);
}

async function ReplaceTaskTerminal(Chunk, Task) {
  const Root = Task?.Object;
  if (!Root?.isObject3D || Root.userData?.VisualRedesignR73) return;

  const Terminal = await CreateTaskTerminal3D(Task.Type);
  const Children = [...Terminal.Group.children];
  while (Root.children.length) Root.remove(Root.children[0]);
  Root.add(...Children);
  Root.userData.VisualRedesignR73 = true;
  Root.userData.TaskTerminalUtilityR73 = true;
  Task.Screen = Terminal.Screen;
  UpdateCollisionFromObject(Chunk, "StoreTaskTerminalR72", Root, 1.62);
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
  if (!Chunk?.Ready || Chunk.Cancelled || ProcessedChunks.has(Chunk) || ProcessingChunks.has(Chunk)) return;
  ProcessingChunks.add(Chunk);

  try {
    await ReplaceDepartmentSign(Chunk);
    await ReplacePriceSign(Chunk);
    for (const Task of Chunk.TaskRecords || []) await ReplaceTaskTerminal(Chunk, Task);
    Chunk.Group.userData.VisualRedesignR73 = true;
    ProcessedChunks.add(Chunk);
  } finally {
    ProcessingChunks.delete(Chunk);
  }
}

function Discover() {
  for (const Chunk of Game.ActiveChunks.values()) {
    if (!Chunk?.Ready || ProcessedChunks.has(Chunk) || QueuedChunks.has(Chunk) || !Chunk.Group?.userData?.WorldPolishR72) continue;
    QueuedChunks.add(Chunk);
    Queue.push(Chunk);
  }
  for (const Chunk of Game.PreparedChunks.values()) {
    if (!Chunk?.Ready || ProcessedChunks.has(Chunk) || QueuedChunks.has(Chunk) || !Chunk.Group?.userData?.WorldPolishR72) continue;
    QueuedChunks.add(Chunk);
    Queue.push(Chunk);
  }
  Pump();
  UpdateDepartmentVisibility();
}

let Running = false;
function Pump() {
  if (Running || !Queue.length) return;
  Running = true;

  const Run = async () => {
    const Chunk = Queue.shift();
    if (Chunk) await ProcessChunk(Chunk);
    Running = false;
    UpdateDepartmentVisibility();
    if (Queue.length) setTimeout(Pump, 18);
  };

  if ("requestIdleCallback" in window) requestIdleCallback(() => Run(), { timeout: 900 });
  else setTimeout(Run, 34);
}

Preload3DTextFont().catch(Error => console.warn("3D text font failed to preload", Error));
Discover();
const Interval = setInterval(Discover, 520);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_VISUAL_REDESIGN_R73__ = { Discover, ProcessChunk };
window.__STORE_VISUAL_REDESIGN_BUILD__ = "V0.15.0-R73";