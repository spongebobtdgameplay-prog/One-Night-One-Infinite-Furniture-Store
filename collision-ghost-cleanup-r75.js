const Game = window.__STORE_GAME__;
if (!Game?.CollisionBoxes || !Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before collision ghost cleanup.");

const VisualOnlyTypes = new Set([
  "FurniturePriceSignR72",
  "FurniturePriceSignR73",
  "FurnitureItemSignR74",
  "FurnitureDisplayCarpetR74",
  "SectionSign",
  "SignMount",
  "BlankSign",
  "EmptySign"
]);

function IsVisualOnlyEntry(Entry) {
  if (!Entry) return false;
  if (VisualOnlyTypes.has(String(Entry.Type || ""))) return true;
  if (Entry.DecorationNoCollision === true) return true;
  return false;
}

function RemoveGlobalEntry(Entry) {
  for (let Index = Game.CollisionBoxes.length - 1; Index >= 0; Index -= 1) {
    if (Game.CollisionBoxes[Index] !== Entry) continue;
    Game.CollisionBoxes.splice(Index, 1);
  }
  if (Entry) Entry.Active = false;
}

function CleanChunk(Chunk) {
  if (!Chunk?.CollisionEntries) return 0;
  let Removed = 0;
  for (let Index = Chunk.CollisionEntries.length - 1; Index >= 0; Index -= 1) {
    const Entry = Chunk.CollisionEntries[Index];
    if (!IsVisualOnlyEntry(Entry)) continue;
    RemoveGlobalEntry(Entry);
    Chunk.CollisionEntries.splice(Index, 1);
    Removed += 1;
  }
  return Removed;
}

function CleanAll() {
  let Removed = 0;
  const Seen = new Set();
  for (const Chunk of Game.ActiveChunks.values()) {
    Seen.add(Chunk);
    Removed += CleanChunk(Chunk);
  }
  for (const Chunk of Game.PreparedChunks.values()) {
    if (Seen.has(Chunk)) continue;
    Removed += CleanChunk(Chunk);
  }
  for (let Index = Game.CollisionBoxes.length - 1; Index >= 0; Index -= 1) {
    const Entry = Game.CollisionBoxes[Index];
    if (!IsVisualOnlyEntry(Entry)) continue;
    Entry.Active = false;
    Game.CollisionBoxes.splice(Index, 1);
    Removed += 1;
  }
  return Removed;
}

CleanAll();
const Interval = setInterval(CleanAll, 800);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_COLLISION_GHOST_CLEANUP__ = { CleanAll, CleanChunk };
window.__STORE_COLLISION_GHOST_CLEANUP_BUILD__ = "V0.17.0-R75";