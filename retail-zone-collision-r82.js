import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.CollisionBoxes) throw new Error("Game must load before retail-zone collision.");

const PlayerEyeHeight = 1.68;

function CircleTouchesBox(Position, Radius, Box) {
  const ClosestX = THREE.MathUtils.clamp(Position.x, Box.min.x, Box.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Box.min.z, Box.max.z);
  const DX = Position.x - ClosestX;
  const DZ = Position.z - ClosestZ;
  return DX * DX + DZ * DZ <= Radius * Radius;
}

function TouchTest(Box) {
  return (Position, Radius = 0.28) => {
    const FeetY = Position.y - PlayerEyeHeight;
    const HeadY = Position.y + 0.12;
    if (Box.max.y < FeetY + 0.035 || Box.min.y > HeadY) return false;
    return CircleTouchesBox(Position, Radius, Box);
  };
}

function ProcessChunk(Chunk) {
  for (const Entry of Chunk?.CollisionEntries || []) {
    if (!Entry?.RetailZoneR82 || !Entry.Box?.min || !Entry.Box?.max) continue;
    Entry.TestPlayerCollision = TouchTest(Entry.Box);
    Entry.TestCollision = Entry.TestPlayerCollision;
    Entry.LegacyCollisionDisabled = false;
  }
}

function ProcessAll() {
  const Seen = new Set();
  for (const Chunk of Game.ActiveChunks.values()) {
    Seen.add(Chunk);
    ProcessChunk(Chunk);
  }
  for (const Chunk of Game.PreparedChunks.values()) if (!Seen.has(Chunk)) ProcessChunk(Chunk);
}

ProcessAll();
const Interval = setInterval(ProcessAll, 260);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_RETAIL_ZONE_COLLISION_R82__ = { ProcessAll, ProcessChunk };
window.__STORE_RETAIL_ZONE_COLLISION_BUILD__ = "V0.21.0-R82";
