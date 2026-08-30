import * as THREE from "three";
import { CreateDepartmentSign3D } from "./sign-utility-r73.js?v=20260824-93";
import { CreateTaskTerminal3D } from "./task-terminal-utility-r73.js?v=20260824-93";
import { Preload3DTextFont } from "./three-text-utility-r73.js?v=20260824-93";
import {
  CreateOnlineSurfaceDecoration,
  OnlineDecorationKeys,
  PreloadOnlineDecorations
} from "./online-decoration-library-r75.js?v=20260824-93";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.CollisionBoxes) throw new Error("Store game must load before stable visual dressing.");

const Processing = new WeakSet();
const FurnitureNames = new Set([
  "Couch_Large1", "Couch_L", "Chair_2", "Table_RoundLarge", "Bed_King", "Bed_Single",
  "NightStand_2", "Shelf_Large", "Bookshelf", "Kitchen_Cabinet1", "Kitchen_Fridge",
  "Kitchen_Oven", "Kitchen_Sink", "Bathroom_Bathtub", "Bathroom_Toilet", "Light_Floor1"
]);

function RemoveNamed(Chunk) {
  const Remove = [];
  Chunk.Group?.traverse?.(Object => {
    const Name = String(Object?.name || "");
    if (
      Name === "SectionSign" ||
      Name === "SignMount" ||
      Name === "DepartmentHeaderR72" ||
      Name === "DepartmentHeaderV13" ||
      Name === "FurniturePriceSignR72" ||
      Name === "FurniturePriceSignR73" ||
      Name === "SuppressedLegacyPriceSignR83" ||
      Name.startsWith("FurnitureItemSignR74-") ||
      Name.startsWith("FurnitureItemSignR80-")
    ) Remove.push(Object);
  });
  for (const Object of Remove) Object.parent?.remove(Object);
}

async function ReplaceDepartmentSign(Chunk) {
  const Existing = Chunk.Group.getObjectByName("DepartmentHeaderR73");
  if (Existing) return Existing;
  const Sign = await CreateDepartmentSign3D(Chunk.Theme, {
    Name: "DepartmentHeaderR73",
    Width: 5.30,
    Height: 0.84,
    Depth: 0.17,
    HangerLength: 0.70
  });
  Sign.userData.ChunkId = Chunk.Id;
  Sign.userData.DecorationNoCollision = false;
  Sign.position.set(0, 2.54, Chunk.TopZ - 2.52);
  Sign.rotation.set(0, 0, 0);
  Sign.updateWorldMatrix(true, true);
  Chunk.Group.add(Sign);
  return Sign;
}

async function ReplaceTaskTerminal(Chunk, Task) {
  const Root = Task?.Object;
  if (!Root?.isObject3D || Root.userData?.StableTerminalR83) return;
  const Terminal = await CreateTaskTerminal3D(Task.Type);
  while (Root.children.length) Root.remove(Root.children[0]);
  Root.add(...Terminal.Group.children);
  Root.userData.StableTerminalR83 = true;
  Root.userData.NoBeaconR83 = true;
  Task.Screen = Terminal.Screen;
}

function DecorationPlanFor(Key, Model) {
  const IsBed = Model.name === "Bed_King" || Model.name === "Bed_Single";
  if (Key === "PillowA") {
    return { Key: OnlineDecorationKeys.PillowA, TargetHeight: IsBed ? 0.16 : 0.18, HeightRatio: IsBed ? 0.43 : 0.47, OffsetX: -0.18, OffsetZ: IsBed ? -0.14 : 0.03, RotationY: 0.10 };
  }
  if (Key === "PillowB") {
    return { Key: OnlineDecorationKeys.PillowB, TargetHeight: IsBed ? 0.16 : 0.17, HeightRatio: IsBed ? 0.43 : 0.47, OffsetX: 0.18, OffsetZ: IsBed ? -0.14 : 0.02, RotationY: -0.10 };
  }
  if (Key === "TableLamp") {
    return { Key: OnlineDecorationKeys.TableLamp, TargetHeight: 0.44, OffsetX: -0.10, OffsetZ: 0.02, RotationY: 0 };
  }
  return null;
}

function DecorationPlans(Chunk, Model) {
  const SlotName = String(Model.userData?.LayoutSlot || "");
  const Keys = Chunk.Layout?.Decorations?.[SlotName] || [];
  return Keys.map(Key => DecorationPlanFor(Key, Model)).filter(Boolean);
}

async function AddFurnitureDecorations(Chunk) {
  if (Chunk.Group.userData?.StableFurnitureDecorR83) return;
  const Models = (Chunk.Models || []).filter(Model => Model?.parent && FurnitureNames.has(Model.name));
  let Added = 0;
  for (let Index = 0; Index < Models.length; Index += 1) {
    for (const Plan of DecorationPlans(Chunk, Models[Index])) {
      try {
        const Decoration = await CreateOnlineSurfaceDecoration(Plan.Key, Models[Index], Plan);
        if (!Decoration) continue;
        Decoration.name = `OnlineSurfaceDecorationR76-StableR83-${Added}`;
        Decoration.userData.ChunkId = Chunk.Id;
        Decoration.userData.DecorationNoCollision = false;
        Chunk.Group.add(Decoration);
        Added += 1;
      } catch (Error) {
        console.warn("Stable furniture decoration unavailable", Error);
      }
    }
  }
  Chunk.Group.userData.StableFurnitureDecorR83 = true;
}

function RemoveWindowLikeDecorations(Chunk) {
  const Remove = [];
  Chunk.Group?.traverse?.(Object => {
    const Name = String(Object?.name || "");
    if (
      Name === "Window_Large1" ||
      Object?.userData?.WallDecorationR76 ||
      Name.startsWith("OnlineWallDecorationR76-StableR83-") ||
      Name.startsWith("OnlineWallDecorationR76-PartitionR80-") ||
      Name.startsWith("OnlineWallDecorationR76-RearR80-")
    ) Remove.push(Object);
  });
  for (const Object of Remove) Object.parent?.remove(Object);
  Chunk.Group.userData.StableWallDecorR83 = true;
}

function RemoveTerminalSpheres(Chunk) {
  for (const Task of Chunk.TaskRecords || []) {
    const Remove = [];
    Task.Object?.traverse?.(Object => {
      if (Object?.isMesh && String(Object.geometry?.type || "") === "SphereGeometry") Remove.push(Object);
    });
    for (const Object of Remove) Object.parent?.remove(Object);
  }
}

export async function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group || Processing.has(Chunk)) return;
  if (Chunk.Group.userData?.PresentationReadyR83) return;
  if (Chunk.Group.userData?.VisualRedesignR83) {
    RemoveNamed(Chunk);
    RemoveTerminalSpheres(Chunk);
    RemoveWindowLikeDecorations(Chunk);
    return;
  }
  Processing.add(Chunk);
  try {
    RemoveNamed(Chunk);
    await ReplaceDepartmentSign(Chunk);
    for (const Task of Chunk.TaskRecords || []) await ReplaceTaskTerminal(Chunk, Task);
    RemoveTerminalSpheres(Chunk);
    await AddFurnitureDecorations(Chunk);
    RemoveWindowLikeDecorations(Chunk);
    Chunk.Group.userData.VisualRedesignR83 = true;
    Chunk.Group.userData.VisualRedesignR76 = true;
  } finally {
    Processing.delete(Chunk);
  }
}

function FindChunk(Index) {
  return Game.ActiveChunks.get(Index) || [...Game.PreparedChunks.values()].find(Chunk => Chunk?.Index === Index) || null;
}

function UpdateDepartmentVisibility() {
  for (const Chunk of Game.ActiveChunks.values()) {
    const Sign = Chunk.Group?.getObjectByName?.("DepartmentHeaderR73");
    if (!Sign) continue;
    const Previous = FindChunk(Chunk.Index - 1);
    Sign.visible = !Previous || Previous.Theme !== Chunk.Theme;
  }
}

await Promise.allSettled([Preload3DTextFont(), PreloadOnlineDecorations()]);

function Discover() {
  for (const Chunk of Game.PreparedChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) ProcessChunk(Chunk).catch(() => {});
  for (const Chunk of Game.ActiveChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) ProcessChunk(Chunk).catch(() => {});
  UpdateDepartmentVisibility();
}

// Initial discovery only. New chunks are processed by presentation-ready.
Discover();

window.__STORE_VISUAL_REDESIGN_R73__ = { Discover, ProcessChunk, UpdateDepartmentVisibility };
window.__STORE_VISUAL_STABLE_R83__ = { Discover, ProcessChunk, UpdateDepartmentVisibility };
window.__STORE_VISUAL_REDESIGN_BUILD__ = "V0.35.16-PIPELINE";