import {
  CreateOnlineSurfaceDecoration,
  OnlineDecorationKeys,
  PreloadOnlineDecorations
} from "./online-decoration-library-r75.js?v=20260824-88";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before shelf stocking.");

const StockableNames = new Set([
  "Shelf_Large",
  "Bookshelf",
  "RetailLivingShelfR79",
  "RetailStorageShelfR79",
  "RetailDisplayCabinetR79",
  "RetailStorageCabinetR79"
]);
const Processing = new WeakSet();

function StockTargets(Chunk) {
  const Targets = [];
  const Add = Object => {
    if (!Object?.parent || !StockableNames.has(Object.name) || Targets.includes(Object)) return;
    const SlotName = String(Object.userData?.LayoutSlot || "");
    const Slot = Chunk.Layout?.Slots?.[SlotName];
    if (!Slot?.StockStyle) return;
    Targets.push(Object);
  };
  for (const Model of Chunk.Models || []) Add(Model);
  for (const Object of Chunk.Group?.children || []) Add(Object);
  Targets.sort((A, B) => String(A.userData?.LayoutSlot || "").localeCompare(String(B.userData?.LayoutSlot || "")));
  return Targets.slice(0, 6);
}

function ExistingStock(Chunk) {
  const Stock = [];
  Chunk.Group?.traverse?.(Object => {
    if (Object?.userData?.ShelfStockR83) Stock.push(Object);
  });
  return Stock;
}

function RemoveExistingStock(Chunk) {
  for (const Object of ExistingStock(Chunk)) Object.parent?.remove(Object);
}

function PlansFor(Chunk, Target) {
  const SlotName = String(Target.userData?.LayoutSlot || "");
  const Slot = Chunk.Layout?.Slots?.[SlotName];
  if (Slot?.StockStyle !== "Books") return [];
  return [
    { Key: OnlineDecorationKeys.BookSet, TargetHeight: 0.18, HeightRatio: 0.29, OffsetX: -0.22, OffsetZ: 0, RotationY: 0.08 },
    { Key: OnlineDecorationKeys.BookSingle, TargetHeight: 0.14, HeightRatio: 0.56, OffsetX: 0.20, OffsetZ: 0.01, RotationY: -0.24 },
    { Key: OnlineDecorationKeys.BookSet, TargetHeight: 0.16, HeightRatio: 0.80, OffsetX: -0.05, OffsetZ: 0, RotationY: 0.12 }
  ];
}

async function Yield() {
  await new Promise(Resolve => {
    if ("requestIdleCallback" in window) requestIdleCallback(() => Resolve(), { timeout: 550 });
    else setTimeout(Resolve, 12);
  });
}

export async function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group || Processing.has(Chunk)) return;
  if (Chunk.Group.userData?.PresentationReadyR83) return;

  const Targets = StockTargets(Chunk);
  const Expected = Targets.length * 3;
  const Existing = ExistingStock(Chunk);
  if (Chunk.Group.userData?.ShelfStockR83 && Existing.length >= Expected) return;

  Processing.add(Chunk);
  try {
    RemoveExistingStock(Chunk);
    let DecorationIndex = 0;
    for (let TargetIndex = 0; TargetIndex < Targets.length; TargetIndex += 1) {
      const Target = Targets[TargetIndex];
      for (const Plan of PlansFor(Chunk, Target)) {
        try {
          const Decoration = await CreateOnlineSurfaceDecoration(Plan.Key, Target, Plan);
          if (!Decoration) continue;
          Decoration.name = `OnlineSurfaceDecorationR76-ShelfStockR83-${DecorationIndex}`;
          Decoration.userData.ChunkId = Chunk.Id;
          Decoration.userData.DecorationNoCollision = false;
          Decoration.userData.ShelfStockR83 = true;
          Chunk.Group.add(Decoration);
          DecorationIndex += 1;
        } catch (Error) {
          console.warn("Shelf stock decoration unavailable", Error);
        }
      }
      if (TargetIndex % 2 === 1) await Yield();
    }
    Chunk.Group.userData.ShelfStockR83 = true;
    Chunk.Group.userData.ShelfStockCountR83 = DecorationIndex;
  } finally {
    Processing.delete(Chunk);
  }
}

export function IsStocked(Chunk) {
  const Targets = StockTargets(Chunk);
  return ExistingStock(Chunk).length >= Targets.length * 3;
}

await PreloadOnlineDecorations().catch(() => {});

function Discover() {
  for (const Chunk of Game.ActiveChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) ProcessChunk(Chunk).catch(() => {});
}

Discover();
const Interval = setInterval(Discover, 1200);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_SHELF_STOCK_R83__ = { ProcessChunk, IsStocked, Discover };
window.__STORE_SHELF_STOCK_BUILD__ = "V0.27.6";