import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.Renderer || !Game?.CollisionBoxes) throw new Error("Game must load before runtime fixes.");

const Canvas = document.getElementById("GameCanvas");
const StartButton = document.getElementById("StartButton");
const BootStatus = document.getElementById("BootStatus");
const CollisionBoxes = Game.CollisionBoxes;
const ProcessedInstances = new WeakSet();
const BODY_HALF_WIDTH = 0.24;
const BODY_HALF_DEPTH = 0.15;

const CollidableModels = new Set([
  "Couch_Large1", "Couch_L", "Chair_2", "Table_RoundLarge", "Bed_King", "Bed_Single",
  "NightStand_2", "Shelf_Large", "Bookshelf", "Kitchen_Cabinet1", "Kitchen_Fridge",
  "Kitchen_Oven", "Kitchen_Sink", "Bathroom_Bathtub", "Bathroom_Toilet", "Light_Floor1",
  "Door_3", "Window_Large1", "StoreTask", "FurniturePriceSign"
]);

function PrimeDocumentFocus() {
  try { window.focus(); } catch {}
  if (!Canvas) return;
  if (!Canvas.hasAttribute("tabindex")) Canvas.tabIndex = -1;
  try { Canvas.focus({ preventScroll: true }); } catch {}
}

if (StartButton) StartButton.addEventListener("pointerdown", PrimeDocumentFocus, true);
if (Canvas) Canvas.addEventListener("pointerdown", PrimeDocumentFocus, true);

document.addEventListener("pointerlockerror", () => {
  if (BootStatus && !document.pointerLockElement) BootStatus.textContent = "Click the game view once to capture first-person mouse look.";
});

function SyncRendererViewport() {
  const Renderer = Game.Renderer;
  Renderer.setScissorTest(false);
  Renderer.setViewport(0, 0, innerWidth, innerHeight);
}
addEventListener("resize", () => requestAnimationFrame(SyncRendererViewport));
requestAnimationFrame(SyncRendererViewport);

function GetPivotYaw() {
  return Game.Scene.getObjectByName("PlayerCharacterPivot")?.rotation?.y || 0;
}

function EllipseRadiusInDirection(WorldX, WorldZ) {
  const Length = Math.hypot(WorldX, WorldZ);
  if (Length <= 0.000001) return Math.min(BODY_HALF_WIDTH, BODY_HALF_DEPTH);
  const NX = WorldX / Length;
  const NZ = WorldZ / Length;
  const Yaw = GetPivotYaw();
  const C = Math.cos(Yaw);
  const S = Math.sin(Yaw);
  const LocalX = NX * C - NZ * S;
  const LocalZ = NX * S + NZ * C;
  const Denominator =
    LocalX * LocalX / (BODY_HALF_WIDTH * BODY_HALF_WIDTH) +
    LocalZ * LocalZ / (BODY_HALF_DEPTH * BODY_HALF_DEPTH);
  return Denominator > 0.000001 ? 1 / Math.sqrt(Denominator) : BODY_HALF_DEPTH;
}

function BodyTouchesRealBox(Position, Bounds) {
  if (!Bounds?.min || !Bounds?.max) return false;
  if (
    Position.x >= Bounds.min.x && Position.x <= Bounds.max.x &&
    Position.z >= Bounds.min.z && Position.z <= Bounds.max.z
  ) return true;

  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  const DX = Position.x - ClosestX;
  const DZ = Position.z - ClosestZ;
  const Distance = Math.hypot(DX, DZ);
  if (Distance <= 0.000001) return true;
  return Distance <= EllipseRadiusInDirection(DX, DZ);
}

function EnsurePreciseStructureCollision() {
  for (const Entry of CollisionBoxes) {
    if (!Entry?.Type || !/Wall|Partition/i.test(Entry.Type) || Entry.PrecisePlayerStructure) continue;
    const Bounds = Entry.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    if (![Bounds.min.x, Bounds.min.z, Bounds.max.x, Bounds.max.z].every(Number.isFinite)) continue;
    Entry.OriginalStructureBox = Bounds;
    Entry.TestPlayerCollision = Position => BodyTouchesRealBox(Position, Bounds);
    Entry.PrecisePlayerStructure = true;
  }
}

function HasCollisionFor(Object) {
  const ChunkId = Object.userData?.ChunkId;
  return CollisionBoxes.some(Entry => Entry.ChunkId === ChunkId && Entry.Type === Object.name && !Entry.LegacyCollisionDisabled);
}

function EnsureModelCollision(Object) {
  if (!Object?.isObject3D || !Object.parent || Object.name === "Houseplant_3" || !CollidableModels.has(Object.name)) return;
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
    CollisionBoxes.push({
      Box: SourceBounds.clone().applyMatrix4(WorldMatrix),
      ChunkId,
      Type: `WarehouseBox-${Index}`,
      PreciseGeometry: true,
      AutoInstanceCollision: true
    });
  }
  ProcessedInstances.add(Object);
}

function Tick() {
  EnsurePreciseStructureCollision();
  for (const Object of Game.Scene.children) EnsureModelCollision(Object);
  Game.Scene.traverse(EnsureWarehouseBoxCollisions);
  requestAnimationFrame(Tick);
}

Tick();
window.__STORE_RUNTIME_FIX_BUILD__ = "V0.11-R24";
