const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before retail organization.");

const Processing = new WeakSet();

function PlannedZoneSlots(Chunk) {
  return new Set((Chunk.Layout?.Zones || []).map(Entry => Entry.Slot));
}

function PlacedZoneSlots(Chunk) {
  const Slots = new Set();
  for (const Object of Chunk.Group?.children || []) {
    if (!Object?.userData?.RetailZoneR82) continue;
    const Slot = String(Object.userData?.LayoutSlot || "");
    if (Slot) Slots.add(Slot);
  }
  return Slots;
}

export async function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group || Processing.has(Chunk)) return;
  if (Chunk.Group.userData?.RetailOrganizationR83) return;
  if (!Chunk.Group.userData?.RetailZonesR82) return;
  Processing.add(Chunk);
  try {
    const Planned = PlannedZoneSlots(Chunk);
    const Placed = PlacedZoneSlots(Chunk);
    Chunk.Group.userData.RetailOrganizationR83 = [...Planned].every(Slot => Placed.has(Slot));
  } finally {
    Processing.delete(Chunk);
  }
}

function Discover() {
  for (const Chunk of Game.PreparedChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) ProcessChunk(Chunk).catch(() => {});
  for (const Chunk of Game.ActiveChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) ProcessChunk(Chunk).catch(() => {});
}

Discover();
const Interval = setInterval(Discover, 1100);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_RETAIL_ORGANIZATION_R83__ = { ProcessChunk, Discover };
window.__STORE_RETAIL_ORGANIZATION_BUILD__ = "V0.27.0";
