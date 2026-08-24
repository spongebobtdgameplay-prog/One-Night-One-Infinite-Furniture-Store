import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before visible material correction.");

const Processed = new WeakMap();
const ExactReplacements = new Map([
  [0x171a18, 0x687268],
  [0x232722, 0x667266],
  [0x171b1a, 0x626b68],
  [0x292a26, 0x746f63],
  [0x242628, 0x70797d],
  [0x2f2c28, 0x71695f],
  [0x323a3b, 0x667472],
  [0x282d30, 0x68757a]
]);

function SrgbHex(Material) {
  if (!Material?.color?.isColor) return null;
  return Material.color.getHex(THREE.SRGBColorSpace);
}

function IsTrueNearBlack(Hex) {
  if (!Number.isInteger(Hex)) return false;
  const Red = (Hex >> 16) & 255;
  const Green = (Hex >> 8) & 255;
  const Blue = Hex & 255;
  return Math.max(Red, Green, Blue) <= 28;
}

function ReplacementFor(Hex) {
  if (ExactReplacements.has(Hex)) return ExactReplacements.get(Hex);
  if (IsTrueNearBlack(Hex)) return 0x6c726f;
  return null;
}

function CorrectMaterial(Material) {
  const Hex = SrgbHex(Material);
  const Replacement = ReplacementFor(Hex);
  if (Replacement === null) return Material;

  const Clone = Material.clone();
  Clone.color.setHex(Replacement, THREE.SRGBColorSpace);
  Clone.needsUpdate = true;
  return Clone;
}

function ProcessMesh(Object) {
  if (!Object?.isMesh) return;
  const Current = Object.material;
  if (!Current) return;

  const Signature = Array.isArray(Current)
    ? Current.map(Material => `${Material?.uuid || ""}:${SrgbHex(Material) ?? ""}`).join(":")
    : `${Current.uuid || ""}:${SrgbHex(Current) ?? ""}`;
  if (Processed.get(Object) === Signature) return;

  if (Array.isArray(Current)) Object.material = Current.map(CorrectMaterial);
  else Object.material = CorrectMaterial(Current);

  const Updated = Object.material;
  const UpdatedSignature = Array.isArray(Updated)
    ? Updated.map(Material => `${Material?.uuid || ""}:${SrgbHex(Material) ?? ""}`).join(":")
    : `${Updated?.uuid || ""}:${SrgbHex(Updated) ?? ""}`;
  Processed.set(Object, UpdatedSignature);
}

function ProcessRoot(Root) {
  Root?.traverse?.(Object => {
    if (Object?.isMesh) ProcessMesh(Object);
  });
}

function ProcessAll() {
  ProcessRoot(Game.Scene);
  for (const Chunk of Game.ActiveChunks.values()) ProcessRoot(Chunk.Group);
  for (const Chunk of Game.PreparedChunks.values()) ProcessRoot(Chunk.Group);
}

ProcessAll();
const Interval = setInterval(ProcessAll, 700);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_VISIBLE_MATERIALS_R77__ = { ProcessAll };
window.__STORE_VISIBLE_MATERIALS_BUILD__ = "V0.18.1-R77";