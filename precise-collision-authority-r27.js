const Game = window.__STORE_GAME__;
if (!Game?.CollisionBoxes) throw new Error("Game collision boxes must load before precise collision authority.");

const DisabledTest = () => false;
const StructurePattern = /Wall|Partition/i;

function GroupKey(Entry) {
  return `${String(Entry?.ChunkId ?? "")}|${String(Entry?.Type ?? "")}`;
}

function IsStructure(Entry) {
  return Boolean(Entry?.PrecisePlayerStructure || StructurePattern.test(String(Entry?.Type || "")));
}

function EnforcePreciseFurnitureAuthority() {
  const Groups = new Map();

  for (const Entry of Game.CollisionBoxes) {
    if (!Entry?.Type || IsStructure(Entry)) continue;
    const Key = GroupKey(Entry);
    let Group = Groups.get(Key);
    if (!Group) {
      Group = [];
      Groups.set(Key, Group);
    }
    Group.push(Entry);
  }

  for (const Group of Groups.values()) {
    const Precise = Group.find(Entry =>
      Entry?.PreciseGeometry === true &&
      typeof Entry.TestPlayerCollision === "function" &&
      Entry.RedundantPreciseSibling !== true
    );
    if (!Precise) continue;

    Precise.LegacyCollisionDisabled = true;
    Precise.RedundantPreciseSibling = false;

    for (const Entry of Group) {
      if (Entry === Precise) continue;
      if (!Entry.OriginalLegacyBox && Entry.Box) Entry.OriginalLegacyBox = Entry.Box;
      Entry.LegacyCollisionDisabled = true;
      Entry.RedundantPreciseSibling = true;
      Entry.TestPlayerCollision = DisabledTest;
      Entry.TestCollision = DisabledTest;
    }
  }
}

EnforcePreciseFurnitureAuthority();
const Interval = setInterval(EnforcePreciseFurnitureAuthority, 120);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_PRECISE_COLLISION_AUTHORITY__ = {
  Apply: EnforcePreciseFurnitureAuthority
};
window.__STORE_PRECISE_COLLISION_AUTHORITY_BUILD__ = "V0.12.29";
