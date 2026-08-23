const Game = window.__STORE_GAME__;

if (!Game?.CollisionBoxes) throw new Error("Game must load before collision cleanup.");

function EmptyBounds() {
  return {
    min: { x: Infinity, y: 0, z: Infinity },
    max: { x: -Infinity, y: 2.5, z: -Infinity }
  };
}

function CleanupLegacyFurnitureCollision() {
  for (const Entry of Game.CollisionBoxes) {
    if (!Entry?.Type) continue;
    if (/Wall|Partition/i.test(Entry.Type)) continue;
    if (Entry.PreciseGeometry) continue;
    if (Entry.LegacyCollisionDisabled) continue;
    Entry.OriginalLegacyBox = Entry.Box;
    Entry.Box = EmptyBounds();
    Entry.LegacyCollisionDisabled = true;
  }
  requestAnimationFrame(CleanupLegacyFurnitureCollision);
}

requestAnimationFrame(CleanupLegacyFurnitureCollision);
window.__STORE_COLLISION_CLEANUP_BUILD__ = "V0.11-R2";
