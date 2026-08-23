import * as THREE from "three";

const Game = window.__STORE_GAME__;

if (!Game?.Scene || !Game?.Renderer || !Game?.CollisionBoxes) throw new Error("Game must load before runtime fixes.");

const Canvas = document.getElementById("GameCanvas");
const StartButton = document.getElementById("StartButton");
const BootStatus = document.getElementById("BootStatus");
const CollisionBoxes = Game.CollisionBoxes;
const ProcessedInstances = new WeakSet();
const ProcessedStructures = new WeakSet();
const TempClosest = new THREE.Vector2();

const CollidableModels = new Set([
  "Couch_Large1",
  "Couch_L",
  "Chair_2",
  "Table_RoundLarge",
  "Bed_King",
  "Bed_Single",
  "NightStand_2",
  "Shelf_Large",
  "Bookshelf",
  "Kitchen_Cabinet1",
  "Kitchen_Fridge",
  "Kitchen_Oven",
  "Kitchen_Sink",
  "Bathroom_Bathtub",
  "Bathroom_Toilet",
  "Light_Floor1",
  "Door_3",
  "Window_Large1",
  "StoreTask",
  "FurniturePriceSign"
]);

function PrimeDocumentFocus() {
  try {
    window.focus();
  } catch {}
  try {
    document.body.focus({ preventScroll: true });
  } catch {}
  if (Canvas && document.activeElement !== Canvas) {
    if (!Canvas.hasAttribute("tabindex")) Canvas.tabIndex = -1;
    try {
      Canvas.focus({ preventScroll: true });
    } catch {}
  }
}

if (StartButton) StartButton.addEventListener("pointerdown", PrimeDocumentFocus, true);
if (Canvas) Canvas.addEventListener("pointerdown", PrimeDocumentFocus, true);

document.addEventListener("pointerlockerror", () => {
  if (BootStatus && !document.pointerLockElement) BootStatus.textContent = "Click the game view once to capture the mouse.";
});

function SyncRendererViewport() {
  const Renderer = Game.Renderer;
  if (!Renderer) return;
  Renderer.setScissorTest(false);
  Renderer.setViewport(0, 0, innerWidth, innerHeight);
}

addEventListener("resize", () => requestAnimationFrame(SyncRendererViewport));
requestAnimationFrame(SyncRendererViewport);

function GetPlayerRadius() {
  return THREE.MathUtils.clamp(window.__STORE_PLAYER__?.GetPlayerRadius?.() ?? 0.34, 0.30, 0.42);
}

function CircleTouchesBox(Position, Radius, Bounds) {
  if (!Bounds?.min || !Bounds?.max) return false;
  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  TempClosest.set(Position.x - ClosestX, Position.z - ClosestZ);
  return TempClosest.lengthSq() <= Radius * Radius;
}

function MakePreciseStructureBounds(OriginalBounds) {
  function Touching() {
    return CircleTouchesBox(Game.Camera.position, GetPlayerRadius(), OriginalBounds);
  }

  const Min = {};
  const Max = {};
  Object.defineProperties(Min, {
    x: { get: () => Touching() ? Game.Camera.position.x : Infinity },
    y: { get: () => OriginalBounds.min.y },
    z: { get: () => Touching() ? Game.Camera.position.z : Infinity }
  });
  Object.defineProperties(Max, {
    x: { get: () => Touching() ? Game.Camera.position.x : -Infinity },
    y: { get: () => OriginalBounds.max.y },
    z: { get: () => Touching() ? Game.Camera.position.z : -Infinity }
  });
  return { min: Min, max: Max };
}

function EnsurePreciseStructureCollision() {
  for (const Entry of CollisionBoxes) {
    if (!Entry?.Type || !/Wall|Partition/i.test(Entry.Type)) continue;
    if (Entry.PrecisePlayerStructure) continue;
    const Bounds = Entry.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    if (![Bounds.min.x, Bounds.min.z, Bounds.max.x, Bounds.max.z].every(Number.isFinite)) continue;
    Entry.OriginalStructureBox = Bounds;
    Entry.Box = MakePreciseStructureBounds(Bounds);
    Entry.PrecisePlayerStructure = true;
  }
}

function HasCollisionFor(Object) {
  const ChunkId = Object.userData?.ChunkId;
  const Name = Object.name;
  return CollisionBoxes.some(Entry => Entry.ChunkId === ChunkId && Entry.Type === Name && !Entry.LegacyCollisionDisabled);
}

function EnsureModelCollision(Object) {
  if (!Object?.isObject3D || !Object.parent) return;
  if (Object.name === "Houseplant_3") return;
  if (!CollidableModels.has(Object.name)) return;
  const ChunkId = Object.userData?.ChunkId;
  if (!ChunkId || HasCollisionFor(Object)) return;
  Object.updateMatrixWorld(true);
  const Bounds = new THREE.Box3().setFromObject(Object);
  if (Bounds.isEmpty()) return;
  CollisionBoxes.push({ Box: Bounds, ChunkId, Type: Object.name, AutoGeometryCandidate: true });
}

function EnsureWarehouseBoxCollisions(Object) {
  if (!Object?.isInstancedMesh || Object.name !== "WarehouseBoxes" || ProcessedInstances.has(Object)) return;
  const ChunkId = Object.userData?.ChunkId;
  if (!ChunkId) return;
  Object.updateMatrixWorld(true);
  if (!Object.geometry.boundingBox) Object.geometry.computeBoundingBox();
  const SourceBounds = Object.geometry.boundingBox;
  if (!SourceBounds) return;
  const InstanceMatrix = new THREE.Matrix4();
  const WorldMatrix = new THREE.Matrix4();
  for (let Index = 0; Index < Object.count; Index += 1) {
    Object.getMatrixAt(Index, InstanceMatrix);
    WorldMatrix.multiplyMatrices(Object.matrixWorld, InstanceMatrix);
    const Bounds = SourceBounds.clone().applyMatrix4(WorldMatrix);
    CollisionBoxes.push({
      Box: Bounds,
      ChunkId,
      Type: `WarehouseBox-${Index}`,
      PreciseGeometry: true,
      AutoInstanceCollision: true
    });
  }
  ProcessedInstances.add(Object);
}

function EnsureObjectCollisions() {
  EnsurePreciseStructureCollision();
  for (const Object of Game.Scene.children) EnsureModelCollision(Object);
  Game.Scene.traverse(EnsureWarehouseBoxCollisions);
  requestAnimationFrame(EnsureObjectCollisions);
}

EnsureObjectCollisions();
window.__STORE_RUNTIME_FIX_BUILD__ = "V0.11-R9";
