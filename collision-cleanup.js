const Game = window.__STORE_GAME__;

if (!Game?.CollisionBoxes) throw new Error("Game must load before collision cleanup.");

function ValidBounds(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.z, Bounds.max.x, Bounds.max.z].every(Number.isFinite) &&
    Bounds.min.x < Bounds.max.x &&
    Bounds.min.z < Bounds.max.z
  );
}

function RestoreFallback(Entry) {
  const Fallback = ValidBounds(Entry.OriginalLegacyBox)
    ? Entry.OriginalLegacyBox
    : ValidBounds(Entry.OriginalBox)
      ? Entry.OriginalBox
      : ValidBounds(Entry.Box)
        ? Entry.Box
        : null;

  if (Fallback) Entry.Box = Fallback;
  Entry.LegacyCollisionDisabled = false;
  return Fallback;
}

function KeepFurnitureCollision() {
  for (const Entry of Game.CollisionBoxes) {
    if (!Entry?.Type) continue;

    if (Entry.LegacyCollisionDisabled) RestoreFallback(Entry);

    if (Entry.Type === "Bathroom_Toilet") {
      RestoreFallback(Entry);
      if (Entry.TestPlayerCollision) delete Entry.TestPlayerCollision;
      Entry.PreciseGeometry = false;
      Entry.ForceFallbackCollision = true;
    }
  }

  requestAnimationFrame(KeepFurnitureCollision);
}

requestAnimationFrame(KeepFurnitureCollision);
window.__STORE_COLLISION_CLEANUP_BUILD__ = "V0.12.1";
