const Game = window.__STORE_GAME__;
if (!Game?.CollisionBoxes) throw new Error("Game collision boxes must load before precise collision authority.");

function EnforcePreciseFurnitureAuthority() {
  for (const Entry of Game.CollisionBoxes) {
    if (!Entry) continue;
    if (Entry.PreciseGeometry === true) {
      Entry.LegacyCollisionDisabled = false;
      Entry.RedundantPreciseSibling = false;
      continue;
    }
    if (Entry.RedundantPreciseSibling === true && Entry.WorldPolishR72 !== true && Entry.DensityCloneR72 !== true) continue;
    Entry.LegacyCollisionDisabled = false;
    Entry.RedundantPreciseSibling = false;
  }
}

EnforcePreciseFurnitureAuthority();
const Interval = setInterval(EnforcePreciseFurnitureAuthority, 500);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_PRECISE_COLLISION_AUTHORITY__ = {
  Apply: EnforcePreciseFurnitureAuthority
};
window.__STORE_PRECISE_COLLISION_AUTHORITY_BUILD__ = "V0.14.0-R72";
