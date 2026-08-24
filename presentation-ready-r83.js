const Game = window.__STORE_GAME__;
if (!Game?.PreparedChunks || !Game?.ActiveChunks) throw new Error("Game must load before presentation gating.");

const Finalizing = new WeakSet();
const Stability = new WeakMap();
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
  let Count = 0;
  for (const Model of Chunk.Models || []) if (Model?.parent && FurnitureNames.has(Model.name)) Count += 1;
  for (const Object of Chunk.Group?.children || []) {
    if (Object?.parent === Chunk.Group && Object.userData?.RetailImportedR79 && RetailNames.has(Object.name)) Count += 1;
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

function CoreReady(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group) return false;
  const Stable = UpdateStability(Chunk);
  return Boolean(
    Stable.StableFor >= 950 &&
    Chunk.Group.userData?.WorldPolishR72 &&
    Chunk.Group.userData?.VisualRedesignR76 &&
    Chunk.Group.userData?.RetailShowroomR79 &&
    Chunk.Group.userData?.RetailZonesR82 &&
    Chunk.Group.userData?.RetailOrganizationR83 &&
    Chunk.Group.userData?.ShelfStockR83 &&
    Chunk.Group.userData?.PriceTagsR83 &&
    PartitionsFinished(Chunk) &&
    CompactTagCount(Chunk) >= Stable.Count &&
    !HasVisibleLegacyPriceSign(Chunk)
  );
}

function Delay(Milliseconds) {
  return new Promise(Resolve => setTimeout(Resolve, Milliseconds));
}

async function RunWorldPasses(Chunk) {
  const Visual = window.__STORE_VISUAL_REDESIGN_R73__;
  const Retail = window.__STORE_RETAIL_SHOWROOM_R79__;
  const Finish = window.__STORE_FINISH_R80__;
  const Tags = window.__STORE_COMPACT_PRICE_TAGS_R83__;
  const Zones = window.__STORE_RETAIL_ZONES_R82__;
  const Organize = window.__STORE_RETAIL_ORGANIZATION_R83__;
  const ShelfStock = window.__STORE_SHELF_STOCK_R83__;

  if (Visual?.ProcessChunk) await Visual.ProcessChunk(Chunk);
  if (Retail?.ProcessChunk) await Retail.ProcessChunk(Chunk);
  if (Zones?.ProcessChunk) await Zones.ProcessChunk(Chunk);
  if (Organize?.ProcessChunk) await Organize.ProcessChunk(Chunk);
  if (ShelfStock?.ProcessChunk) await ShelfStock.ProcessChunk(Chunk);
  Finish?.ProcessChunk?.(Chunk);
  await Tags?.RebuildChunk?.(Chunk);
  RemoveTerminalBeacons(Chunk);
  window.__STORE_RETAIL_ZONE_COLLISION_R82__?.ProcessChunk?.(Chunk);
  window.__STORE_VISIBLE_MATERIALS_R77__?.ProcessAll?.();
}

export async function FinalizeChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group || Chunk.Group.userData?.PresentationReadyR83 || Finalizing.has(Chunk)) return;
  Finalizing.add(Chunk);
  try {
    const Started = performance.now();
    let Pass = 0;
    while (!CoreReady(Chunk) && performance.now() - Started < 7200) {
      if (Pass % 2 === 0) await RunWorldPasses(Chunk);
      UpdateStability(Chunk);
      await Delay(Pass < 6 ? 90 : 150);
      Pass += 1;
    }

    await RunWorldPasses(Chunk);
    await Delay(80);
    UpdateStability(Chunk);
    if (!CoreReady(Chunk)) console.warn(`Chunk ${Chunk.Id} presentation timed out after final dressing pass.`);

    Chunk.Group.userData.PresentationReadyR83 = true;
    Chunk.Group.userData.PresentationReadyR82 = true;
    Chunk.Group.userData.PresentationReadyAt = performance.now();
    window.__STORE_SOLID_OBJECT_COLLISION_R83__?.ProcessChunk?.(Chunk, true);
    window.__STORE_RETAIL_ZONE_COLLISION_R82__?.ProcessChunk?.(Chunk);
  } finally {
    Finalizing.delete(Chunk);
  }
}

async function PrimeBootWorld() {
  const Chunks = [];
  for (const Chunk of Game.ActiveChunks.values()) if (Chunk?.Ready && !Chunk.Cancelled) Chunks.push(Chunk);
  for (const Chunk of Game.PreparedChunks.values()) if (Chunk?.Ready && !Chunk.Cancelled && !Chunks.includes(Chunk)) Chunks.push(Chunk);
  await Promise.allSettled(Chunks.map(Chunk => FinalizeChunk(Chunk)));
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
const Interval = setInterval(Discover, 180);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_PRESENTATION_READY_R83__ = { FinalizeChunk, CoreReady, Discover };
window.__STORE_PRESENTATION_READY_BUILD__ = "V0.22.0-R83";