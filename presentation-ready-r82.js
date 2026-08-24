const Game = window.__STORE_GAME__;
if (!Game?.PreparedChunks || !Game?.ActiveChunks) throw new Error("Game must load before presentation gating.");

const Finalizing = new WeakSet();
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

function CompactSignCount(Chunk) {
  let Count = 0;
  Chunk.Group?.traverse?.(Object => {
    if (Object?.userData?.CompactPriceAuthorityR81) Count += 1;
  });
  return Count;
}

function HasLegacyPriceForest(Chunk) {
  let Found = false;
  Chunk.Group?.traverse?.(Object => {
    if (Found) return;
    const Name = String(Object?.name || "");
    if (Name.startsWith("FurniturePriceSignR72") || Name.startsWith("FurniturePriceSignR73")) Found = true;
    if (Name.startsWith("FurnitureItemSignR74-") && !Object.userData?.CompactPriceAuthorityR81) Found = true;
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

function ReadyForPresentation(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group) return false;
  const RequiredSigns = SellableCount(Chunk);
  return Boolean(
    Chunk.Group.userData?.WorldPolishR72 &&
    Chunk.Group.userData?.VisualRedesignR76 &&
    Chunk.Group.userData?.RetailShowroomR79 &&
    Chunk.Group.userData?.RetailZonesR82 &&
    PartitionsFinished(Chunk) &&
    CompactSignCount(Chunk) >= RequiredSigns &&
    !HasLegacyPriceForest(Chunk)
  );
}

function Delay(Milliseconds) {
  return new Promise(Resolve => setTimeout(Resolve, Milliseconds));
}

async function RunWorldPasses(Chunk) {
  const Visual = window.__STORE_VISUAL_REDESIGN_R73__;
  const Retail = window.__STORE_RETAIL_SHOWROOM_R79__;
  const Finish = window.__STORE_FINISH_R80__;
  const PriceTags = window.__STORE_COMPACT_PRICE_TAGS_R81__;
  const Zones = window.__STORE_RETAIL_ZONES_R82__;

  if (Visual?.ProcessChunk) await Visual.ProcessChunk(Chunk);
  if (Retail?.ProcessChunk) await Retail.ProcessChunk(Chunk);
  if (Zones?.ProcessChunk) await Zones.ProcessChunk(Chunk);
  Finish?.ProcessAll?.();
  PriceTags?.ProcessChunk?.(Chunk);
  window.__STORE_SOLID_OBJECT_COLLISION_R77__?.ProcessAll?.();
  window.__STORE_VISIBLE_MATERIALS_R77__?.ProcessAll?.();
}

export async function FinalizeChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group || Chunk.Group.userData?.PresentationReadyR82 || Finalizing.has(Chunk)) return;
  Finalizing.add(Chunk);
  try {
    const Started = performance.now();
    let Pass = 0;
    while (!ReadyForPresentation(Chunk) && performance.now() - Started < 5200) {
      if (Pass % 3 === 0) await RunWorldPasses(Chunk);
      await Delay(Pass < 5 ? 70 : 120);
      Pass += 1;
    }
    if (!ReadyForPresentation(Chunk)) console.warn(`Chunk ${Chunk.Id} presentation timed out; exposing completed core chunk.`);
    Chunk.Group.userData.PresentationReadyR82 = true;
    Chunk.Group.userData.PresentationReadyAt = performance.now();
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

// Finish the already-buffered boot world while the loading screen is still visible.
await PrimeBootWorld();

// After boot, hide prepared chunks from the native activation path until all
// retail dressing, price tags and zone assets have been completed off-screen.
const PreviousPreparedGet = Game.PreparedChunks.get.bind(Game.PreparedChunks);
Game.PreparedChunks.get = function(Index) {
  const Chunk = PreviousPreparedGet(Index);
  if (!Chunk || Chunk.Cancelled || Chunk.Active) return Chunk;
  if (Chunk.Ready && !Chunk.Group?.userData?.PresentationReadyR82) return null;
  return Chunk;
};

function Discover() {
  for (const Chunk of Game.PreparedChunks.values()) {
    if (Chunk?.Ready && !Chunk.Cancelled && !Chunk.Group?.userData?.PresentationReadyR82) {
      FinalizeChunk(Chunk).catch(Error => console.warn("Prepared chunk presentation failed", Error));
    }
  }
}

Discover();
const Interval = setInterval(Discover, 140);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_PRESENTATION_READY_R82__ = { FinalizeChunk, ReadyForPresentation, Discover };
window.__STORE_PRESENTATION_READY_BUILD__ = "V0.21.0-R82";
