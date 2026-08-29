const Game = window.__STORE_GAME__;
if (!Game?.PreparedChunks || !Game?.ActiveChunks) throw new Error("Game must load before presentation gating.");

const Finalizing = new WeakSet();
const Stability = new WeakMap();
const PendingFinalization = new WeakMap();
let FinalizationTail = Promise.resolve();
const FurnitureNames = new Set([
  "Couch_Large1", "Couch_L", "Chair_2", "Table_RoundLarge", "Bed_King", "Bed_Single",
  "NightStand_2", "Shelf_Large", "Bookshelf", "Kitchen_Cabinet1", "Kitchen_Fridge",
  "Kitchen_Oven", "Kitchen_Sink", "Bathroom_Bathtub", "Bathroom_Toilet", "Light_Floor1"
]);
const RetailNames = new Set([
  "RetailArmchairR79", "RetailLivingShelfR79", "RetailBedroomCabinetR79", "RetailBedroomChairR79",
  "RetailStorageShelfR79", "RetailStorageCabinetR79", "RetailDisplayCabinetR79"
]);

function SellableCount(Chunk) {
  const AuthorityCount = window.__STORE_COMPACT_PRICE_TAGS_R83__?.CountSellable?.(Chunk);
  if (Number.isFinite(AuthorityCount)) return AuthorityCount;
  let Count = 0;
  for (const Model of Chunk.Models || []) if (Model?.parent && FurnitureNames.has(Model.name)) Count += 1;
  for (const Object of Chunk.Group?.children || []) {
    if (Object?.parent !== Chunk.Group) continue;
    if (Object.userData?.RetailSellableR84) Count += 1;
    else if (Object.userData?.RetailImportedR79 && RetailNames.has(Object.name)) Count += 1;
  }
  return Count;
}

function UpdateStability(Chunk) {
  const Count = SellableCount(Chunk);
  const Now = performance.now();
  let State = Stability.get(Chunk);
  if (!State) {
    State = { Count, ChangedAt: Now };
    Stability.set(Chunk, State);
  } else if (State.Count !== Count) {
    State.Count = Count;
    State.ChangedAt = Now;
  }
  return { Count, StableFor: Now - State.ChangedAt };
}

function CompactTagCount(Chunk) {
  return window.__STORE_COMPACT_PRICE_TAGS_R83__?.CountTags?.(Chunk) ?? 0;
}

function HasVisibleLegacyPriceSign(Chunk) {
  let Found = false;
  Chunk.Group?.traverse?.(Object => {
    if (Found || !Object?.visible) return;
    const Name = String(Object.name || "");
    if (Name.startsWith("FurniturePriceSignR72") || Name.startsWith("FurniturePriceSignR73")) Found = true;
    if (Name.startsWith("FurnitureItemSignR74-") || Name.startsWith("FurnitureItemSignR80-")) Found = true;
  });
  return Found;
}

function PartitionsFinished(Chunk) {
  let Total = 0;
  let Finished = 0;
  Chunk.Group?.traverse?.(Object => {
    if (Object?.name !== "ShowroomPartition") return;
    Total += 1;
    if (Object.userData?.MerchandisingWallR80) Finished += 1;
  });
  return Total === Finished;
}

function RearFinished(Chunk) {
  if (Chunk.Index !== 0) return true;
  return Boolean(Chunk.Group.getObjectByName("RearStoreClosureR80"));
}

function RemoveTerminalBeacons(Chunk) {
  for (const Task of Chunk.TaskRecords || []) {
    const Root = Task?.Object;
    if (!Root?.traverse) continue;
    const Remove = [];
    Root.traverse(Object => {
      if (!Object?.isMesh) return;
      if (String(Object.geometry?.type || "") === "SphereGeometry") Remove.push(Object);
    });
    for (const Object of Remove) Object.parent?.remove(Object);
    Root.userData.NoBeaconR83 = true;
  }
}

function LayoutOccupancyReady(Chunk) {
  const Placed = new Set();
  for (const Object of Chunk.Group?.children || []) {
    const Slot = String(Object?.userData?.LayoutSlot || "");
    if (Slot) Placed.add(Slot);
  }
  for (const Object of Chunk.TaskObjects || []) {
    const Slot = String(Object?.userData?.LayoutSlot || "");
    if (Slot) Placed.add(Slot);
  }

  for (const GroupName of ["Base", "Rugs", "Retail", "Sale", "Zones", "Partitions"]) {
    for (const Entry of Chunk.Layout?.[GroupName] || []) {
      if (!Placed.has(Entry.Slot)) return false;
    }
  }
  if (Chunk.Layout?.Task && !Placed.has(Chunk.Layout.Task.Slot)) return false;

  return true;
}

function CoreReady(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group) return false;
  if (!Chunk.Layout?.Authority || Chunk.Layout.Authority !== "StoreLayoutV1") return false;
  if (Chunk.Group.userData?.LayoutAuthority !== Chunk.Layout.Authority) return false;
  if (!LayoutOccupancyReady(Chunk)) return false;
  const Stable = UpdateStability(Chunk);
  const ShelfStocked = window.__STORE_SHELF_STOCK_R83__?.IsStocked?.(Chunk) ?? Boolean(Chunk.Group.userData?.ShelfStockR83);
  const SaleDisplaysReady = window.__STORE_RETAIL_SALE_DISPLAYS_R84__?.Ready?.(Chunk) ?? false;
  return Boolean(
    Stable.StableFor >= 360 &&
    Chunk.Group.userData?.WorldPolishR72 &&
    Chunk.Group.userData?.VisualRedesignR76 &&
    Chunk.Group.userData?.RetailShowroomR79 &&
    Chunk.Group.userData?.RetailZonesR82 &&
    Chunk.Group.userData?.RetailOrganizationR83 &&
    Chunk.Group.userData?.CoreFixR86 &&
    ShelfStocked &&
    SaleDisplaysReady &&
    Chunk.Group.userData?.PriceTagsR83 &&
    PartitionsFinished(Chunk) &&
    RearFinished(Chunk) &&
    CompactTagCount(Chunk) >= Stable.Count &&
    !HasVisibleLegacyPriceSign(Chunk)
  );
}

function Delay(Milliseconds) {
  return new Promise(Resolve => setTimeout(Resolve, Milliseconds));
}

function IdleYield() {
  return new Promise(Resolve => {
    if ("requestIdleCallback" in window) requestIdleCallback(() => Resolve(), { timeout: 320 });
    else setTimeout(Resolve, 10);
  });
}

async function RunWorldPasses(Chunk) {
  const Visual = window.__STORE_VISUAL_REDESIGN_R73__;
  const Retail = window.__STORE_RETAIL_SHOWROOM_R79__;
  const Finish = window.__STORE_FINISH_R80__;
  const Tags = window.__STORE_COMPACT_PRICE_TAGS_R83__;
  const Zones = window.__STORE_RETAIL_ZONES_R82__;
  const Organize = window.__STORE_RETAIL_ORGANIZATION_R83__;
  const ShelfStock = window.__STORE_SHELF_STOCK_R83__;
  const SaleDisplays = window.__STORE_RETAIL_SALE_DISPLAYS_R84__;
  const CoreFix = window.__STORE_CORE_FIX_R86__;

  if (Visual?.ProcessChunk) await Visual.ProcessChunk(Chunk);
  await IdleYield();

  if (Retail?.ProcessChunk) await Retail.ProcessChunk(Chunk);
  if (Zones?.ProcessChunk) await Zones.ProcessChunk(Chunk);
  await IdleYield();

  if (SaleDisplays?.ProcessChunk) await SaleDisplays.ProcessChunk(Chunk);
  if (Organize?.ProcessChunk) await Organize.ProcessChunk(Chunk);
  await IdleYield();

  if (ShelfStock?.ProcessChunk) await ShelfStock.ProcessChunk(Chunk);
  Finish?.ProcessChunk?.(Chunk);
  if (Chunk.Index === 0) await Finish?.EnsureRearClosure?.();
  await IdleYield();

  await Tags?.RebuildChunk?.(Chunk);
  RemoveTerminalBeacons(Chunk);
  window.__STORE_RETAIL_ZONE_COLLISION_R82__?.ProcessChunk?.(Chunk);
  window.__STORE_VISIBLE_MATERIALS_R77__?.ProcessAll?.();
  CoreFix?.ProcessChunk?.(Chunk);
}

async function FinalizeChunkNow(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group || Chunk.Group.userData?.PresentationReadyR83) return false;

  Finalizing.add(Chunk);
  try {
    await RunWorldPasses(Chunk);

    const StabilityStart = performance.now();
    while (!CoreReady(Chunk) && performance.now() - StabilityStart < 900) {
      UpdateStability(Chunk);
      await Delay(90);
    }

    if (!CoreReady(Chunk)) {
      await RunWorldPasses(Chunk);
      const RepairStart = performance.now();
      while (!CoreReady(Chunk) && performance.now() - RepairStart < 520) {
        UpdateStability(Chunk);
        await Delay(90);
      }
    }

    if (!CoreReady(Chunk)) {
      Chunk.Group.userData.PresentationRetryAfter = performance.now() + 900;
      console.warn(`Chunk ${Chunk.Id} is not presentation-ready yet; deferring instead of exposing a partial aisle.`);
      return false;
    }

    Chunk.Group.userData.PresentationReadyR83 = true;
    Chunk.Group.userData.PresentationReadyR82 = true;
    Chunk.Group.userData.PresentationReadyAt = performance.now();
    delete Chunk.Group.userData.PresentationRetryAfter;

    window.__STORE_SOLID_OBJECT_COLLISION_R83__?.ProcessChunk?.(Chunk, true);
    window.__STORE_RETAIL_ZONE_COLLISION_R82__?.ProcessChunk?.(Chunk);
    window.__STORE_CORE_FIX_R86__?.ProcessChunk?.(Chunk);
    return true;
  } finally {
    Finalizing.delete(Chunk);
  }
}

export function FinalizeChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group || Chunk.Group.userData?.PresentationReadyR83) return Promise.resolve(false);

  const RetryAfter = Number(Chunk.Group.userData?.PresentationRetryAfter) || 0;
  if (RetryAfter > performance.now()) return Promise.resolve(false);

  const Existing = PendingFinalization.get(Chunk);
  if (Existing) return Existing;

  const Job = FinalizationTail
    .catch(() => {})
    .then(() => FinalizeChunkNow(Chunk))
    .finally(() => PendingFinalization.delete(Chunk));

  PendingFinalization.set(Chunk, Job);
  FinalizationTail = Job.catch(() => {});
  return Job;
}

async function PrimeBootWorld() {
  const Chunks = [];
  for (const Chunk of Game.ActiveChunks.values()) if (Chunk?.Ready && !Chunk.Cancelled) Chunks.push(Chunk);
  for (const Chunk of Game.PreparedChunks.values()) if (Chunk?.Ready && !Chunk.Cancelled && !Chunks.includes(Chunk)) Chunks.push(Chunk);
  Chunks.sort((A, B) => Math.abs(A.Index) - Math.abs(B.Index));
  for (const Chunk of Chunks) await FinalizeChunk(Chunk);
}

await PrimeBootWorld();

const PreviousPreparedGet = Game.PreparedChunks.get.bind(Game.PreparedChunks);
Game.PreparedChunks.get = function(Index) {
  const Chunk = PreviousPreparedGet(Index);
  if (!Chunk || Chunk.Cancelled || Chunk.Active) return Chunk;
  if (Chunk.Ready && !Chunk.Group?.userData?.PresentationReadyR83) return null;
  return Chunk;
};

function Discover() {
  for (const Chunk of Game.PreparedChunks.values()) {
    if (Chunk?.Ready && !Chunk.Cancelled && !Chunk.Group?.userData?.PresentationReadyR83) {
      FinalizeChunk(Chunk).catch(Error => console.warn("Prepared chunk presentation failed", Error));
    }
  }
}

Discover();
const Interval = setInterval(Discover, 650);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_PRESENTATION_READY_R83__ = { FinalizeChunk, CoreReady, Discover };
window.__STORE_PRESENTATION_READY_BUILD__ = "V0.27.7";