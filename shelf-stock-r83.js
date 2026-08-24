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
  for (const Model of Chunk.Models || []) {
    if (Model?.parent && StockableNames.has(Model.name)) Targets.push(Model);
  }
  for (const Object of Chunk.Group?.children || []) {
    if (Object?.parent === Chunk.Group && StockableNames.has(Object.name) && !Targets.includes(Object)) Targets.push(Object);
  }
  return Targets.slice(0, 5);
}

function PlansFor(Index) {
  const Flip = Index % 2 === 0 ? 1 : -1;
  return [
    {
      Key: OnlineDecorationKeys.BookSet,
      TargetHeight: 0.18,
      HeightRatio: 0.29,
      OffsetX: -0.22 * Flip,
      OffsetZ: 0,
      RotationY: 0.08 * Flip
    },
    {
      Key: OnlineDecorationKeys.BookSingle,
      TargetHeight: 0.14,
      HeightRatio: 0.56,
      OffsetX: 0.20 * Flip,
      OffsetZ: 0.01,
      RotationY: -0.24 * Flip
    },
    {
      Key: Index % 3 === 0 ? OnlineDecorationKeys.StandingFrame : OnlineDecorationKeys.BookSet,
      TargetHeight: Index % 3 === 0 ? 0.20 : 0.16,
      HeightRatio: 0.80,
      OffsetX: -0.05 * Flip,
      OffsetZ: 0,
      RotationY: 0.12 * Flip
    }
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
  if (Chunk.Group.userData?.ShelfStockR83) return;
  Processing.add(Chunk);
  try {
    const Targets = StockTargets(Chunk);
    let DecorationIndex = 0;
    for (let TargetIndex = 0; TargetIndex < Targets.length; TargetIndex += 1) {
      const Target = Targets[TargetIndex];
      const Plans = PlansFor(TargetIndex);
      for (const Plan of Plans) {
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

await PreloadOnlineDecorations().catch(() => {});

function Discover() {
  for (const Chunk of Game.PreparedChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) ProcessChunk(Chunk).catch(() => {});
  for (const Chunk of Game.ActiveChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) ProcessChunk(Chunk).catch(() => {});
}

Discover();
const Interval = setInterval(Discover, 1200);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_SHELF_STOCK_R83__ = { ProcessChunk, Discover };
window.__STORE_SHELF_STOCK_BUILD__ = "V0.22.0-R83";