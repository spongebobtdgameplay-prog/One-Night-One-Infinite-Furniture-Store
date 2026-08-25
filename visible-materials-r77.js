import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before visible material correction.");

const Processed = new WeakMap();
const RootStamps = new WeakMap();
const SceneChildren = new WeakSet();
const ExactReplacements = new Map([
  [0x171a18, 0x687268], [0x232722, 0x667266], [0x171b1a, 0x626b68], [0x292a26, 0x746f63],
  [0x242628, 0x7f8986], [0x2f2c28, 0x71695f], [0x323a3b, 0x667472], [0x282d30, 0x68757a]
]);

function UiOpen() {
  return Boolean(window.__STORE_UI_MODAL_OPEN_R96__ || window.__STORE_UI_MODAL_OPEN_R95__);
}

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

function HasImportedRetailAncestor(Object) {
  let Current = Object;
  while (Current && Current !== Game.Scene) {
    if (Current.userData?.RetailImportedR79 || Current.userData?.RetailImportedShelfR79) return true;
    if (String(Current.name || "").startsWith("RetailImported-")) return true;
    Current = Current.parent;
  }
  return false;
}

function FindModelRoot(Object) {
  let Current = Object;
  while (Current && Current !== Game.Scene) {
    const Name = String(Current.name || "");
    if (Name === "Shelf_Large" || Name === "Window_Large1") return Current;
    Current = Current.parent;
  }
  return null;
}

function CorrectShelfMaterial(Material) {
  if (!Material) return Material;
  const Clone = Material.clone();
  Clone.map = null;
  Clone.color?.setHex(0x8d9995, THREE.SRGBColorSpace);
  if ("roughness" in Clone) Clone.roughness = 0.66;
  if ("metalness" in Clone) Clone.metalness = 0.22;
  if (Clone.emissive?.isColor) {
    Clone.emissive.setHex(0x202724, THREE.SRGBColorSpace);
    Clone.emissiveIntensity = 0.10;
  }
  Clone.needsUpdate = true;
  return Clone;
}

function CorrectWindowMaterial(Material) {
  if (!Material) return Material;
  const Clone = Material.clone();
  Clone.color?.setHex(0x84949a, THREE.SRGBColorSpace);
  if ("roughness" in Clone) Clone.roughness = 0.52;
  Clone.needsUpdate = true;
  return Clone;
}

function CorrectBlackMaterial(Material) {
  const Hex = SrgbHex(Material);
  if (Hex === null) return Material;
  const Replacement = ExactReplacements.get(Hex) ?? (IsTrueNearBlack(Hex) ? 0x6c7371 : null);
  if (Replacement === null) return Material;
  const Clone = Material.clone();
  Clone.color.setHex(Replacement, THREE.SRGBColorSpace);
  Clone.needsUpdate = true;
  return Clone;
}

function CorrectMaterial(Object, Material) {
  if (HasImportedRetailAncestor(Object)) return Material;
  const Root = FindModelRoot(Object);
  if (Root?.name === "Shelf_Large") return CorrectShelfMaterial(Material);
  if (Root?.name === "Window_Large1") return CorrectWindowMaterial(Material);
  return CorrectBlackMaterial(Material);
}

function ProcessMesh(Object) {
  if (!Object?.isMesh || !Object.material) return;
  const Current = Object.material;
  const Root = FindModelRoot(Object);
  const RootName = Root?.name || "";
  const Imported = HasImportedRetailAncestor(Object) ? "R79" : "";
  const Signature = Array.isArray(Current)
    ? `${RootName}:${Imported}:` + Current.map(Material => `${Material?.uuid || ""}:${SrgbHex(Material) ?? ""}`).join(":")
    : `${RootName}:${Imported}:${Current.uuid || ""}:${SrgbHex(Current) ?? ""}`;
  if (Processed.get(Object) === Signature) return;

  if (Array.isArray(Current)) Object.material = Current.map(Material => CorrectMaterial(Object, Material));
  else Object.material = CorrectMaterial(Object, Current);

  const Updated = Object.material;
  const UpdatedSignature = Array.isArray(Updated)
    ? `${RootName}:${Imported}:` + Updated.map(Material => `${Material?.uuid || ""}:${SrgbHex(Material) ?? ""}`).join(":")
    : `${RootName}:${Imported}:${Updated?.uuid || ""}:${SrgbHex(Updated) ?? ""}`;
  Processed.set(Object, UpdatedSignature);
}

function RootStamp(Root) {
  return Root ? `${Root.children?.length || 0}:${Root.userData?.PriceTagsR83 ? 1 : 0}:${Root.userData?.ShelfStockR83 ? 1 : 0}` : "";
}

function ProcessRoot(Root, Force = false) {
  if (!Root?.traverse) return;
  const Stamp = RootStamp(Root);
  if (!Force && RootStamps.get(Root) === Stamp) return;
  RootStamps.set(Root, Stamp);
  Root.traverse(Object => {
    if (Object?.isMesh) ProcessMesh(Object);
  });
}

function ProcessChunk(Chunk, Force = false) {
  if (!Chunk?.Group || Chunk.Cancelled) return;
  ProcessRoot(Chunk.Group, Force);
}

function ProcessSceneChildren() {
  for (const Child of Game.Scene.children) {
    if (!Child || SceneChildren.has(Child)) continue;
    SceneChildren.add(Child);
    const IsChunk = [...Game.ActiveChunks.values(), ...Game.PreparedChunks.values()].some(Chunk => Chunk?.Group === Child);
    if (!IsChunk) ProcessRoot(Child, true);
  }
}

function ProcessAll(Force = false) {
  if (UiOpen() && !Force) return;
  ProcessSceneChildren();
  for (const Chunk of Game.ActiveChunks.values()) ProcessChunk(Chunk, Force);
  for (const Chunk of Game.PreparedChunks.values()) ProcessChunk(Chunk, Force);
}

ProcessAll(true);
const Interval = setInterval(() => ProcessAll(false), 2600);
addEventListener("store-ui-performance-state", Event => {
  if (!Event.detail?.open) setTimeout(() => ProcessAll(false), 0);
});
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_VISIBLE_MATERIALS_R77__ = { ProcessAll, ProcessChunk };
window.__STORE_VISIBLE_MATERIALS_BUILD__ = "V0.30.2-R96";