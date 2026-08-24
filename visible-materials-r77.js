import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before visible material correction.");

const Processed = new WeakMap();
const WarmMetal = 0x777b74;
const WarmTrim = 0x776d61;
const WarmWood = 0x765b49;
const SoftGray = 0x716f67;

function Luminance(Color) {
  if (!Color?.isColor) return 1;
  return Color.r * 0.2126 + Color.g * 0.7152 + Color.b * 0.0722;
}

function ReplacementFor(Object, Material) {
  const Name = `${Object?.name || ""} ${Material?.name || ""}`;
  if (/LightHousing|Metal|Steel|Frame|Rail|Post|Pole|Hanger/i.test(Name)) return WarmMetal;
  if (/Trim|Cap|Baseboard|Handle|Control/i.test(Name)) return WarmTrim;
  if (/Wood|Shelf|Book|Door/i.test(Name)) return WarmWood;
  return SoftGray;
}

function LiftMaterial(Object, Material) {
  if (!Material?.color?.isColor) return Material;
  if (Luminance(Material.color) >= 0.30) return Material;

  const Clone = Material.clone();
  Clone.color.setHex(ReplacementFor(Object, Material));
  if (Clone.isMeshStandardMaterial || Clone.isMeshPhysicalMaterial) {
    Clone.roughness = Math.max(0.48, Clone.roughness ?? 0.7);
    if (Clone.map) {
      Clone.emissive = Clone.emissive?.isColor ? Clone.emissive : new THREE.Color();
      Clone.emissive.setHex(0x29261f);
      Clone.emissiveIntensity = Math.max(Clone.emissiveIntensity || 0, 0.14);
    }
  }
  Clone.needsUpdate = true;
  return Clone;
}

function ProcessMesh(Object) {
  if (!Object?.isMesh) return;
  const Current = Object.material;
  if (!Current) return;
  const Signature = Array.isArray(Current)
    ? Current.map(Material => Material?.uuid || "").join(":")
    : Current.uuid || "";
  if (Processed.get(Object) === Signature) return;

  if (Array.isArray(Current)) Object.material = Current.map(Material => LiftMaterial(Object, Material));
  else Object.material = LiftMaterial(Object, Current);

  const Updated = Object.material;
  const UpdatedSignature = Array.isArray(Updated)
    ? Updated.map(Material => Material?.uuid || "").join(":")
    : Updated?.uuid || "";
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
window.__STORE_VISIBLE_MATERIALS_BUILD__ = "V0.18.0-R77";