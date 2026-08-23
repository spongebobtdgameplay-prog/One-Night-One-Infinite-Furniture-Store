import * as THREE from "three";

const Game = window.__STORE_GAME__;

if (!Game?.Scene || !Game?.Renderer || !Game?.CollisionBoxes) throw new Error("Game must load before runtime fixes.");

const Canvas = document.getElementById("GameCanvas");
const StartButton = document.getElementById("StartButton");
const BootStatus = document.getElementById("BootStatus");
const CollisionBoxes = Game.CollisionBoxes;
const ProcessedInstances = new WeakSet();
const STRUCTURE_BODY_MARGIN = 0.15;
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
  if (Canvas) {
    if (!Canvas.hasAttribute("tabindex")) Canvas.tabIndex = -1;
    try {
      Canvas.focus({ preventScroll: true });
    } catch {
      Canvas.focus();
    }
  }
}

if (StartButton) {
  StartButton.addEventListener("pointerdown", PrimeDocumentFocus, true);
  StartButton.addEventListener("click", Event => {
    PrimeDocumentFocus();
    if (document.hasFocus()) return;
    Event.preventDefault();
    Event.stopImmediatePropagation();
    StartButton.textContent = "CLICK TO FOCUS & ENTER";
    if (BootStatus) BootStatus.textContent = "Focus this game tab, then click ENTER again.";
  }, true);
}

if (Canvas) Canvas.addEventListener("pointerdown", PrimeDocumentFocus, true);

const PointerLockPrototype = typeof Element !== "undefined" ? Element.prototype : null;
const OriginalRequestPointerLock = PointerLockPrototype?.requestPointerLock;

if (OriginalRequestPointerLock && !PointerLockPrototype.__STORE_SAFE_POINTER_LOCK__) {
  Object.defineProperty(PointerLockPrototype, "__STORE_SAFE_POINTER_LOCK__", { value: true });
  PointerLockPrototype.requestPointerLock = function(...Args) {
    PrimeDocumentFocus();
    const HasUserActivation = navigator.userActivation ? navigator.userActivation.isActive : true;
    if (!document.hasFocus() || !HasUserActivation) return Promise.resolve();
    try {
      const Result = OriginalRequestPointerLock.apply(this, Args);
      if (!Result || typeof Result.catch !== "function") return Result;
      return Result.catch(Error => {
        const Message = String(Error?.message || Error || "");
        if (Error?.name === "NotAllowedError" || /not focused|pointer lock/i.test(Message)) return;
        throw Error;
      });
    } catch (Error) {
      const Message = String(Error?.message || Error || "");
      if (Error?.name === "NotAllowedError" || /not focused|pointer lock/i.test(Message)) return Promise.resolve();
      throw Error;
    }
  };
}

function SyncRendererViewport() {
  const Renderer = Game.Renderer;
  if (!Renderer) return;
  Renderer.setScissorTest(false);
  Renderer.setViewport(0, 0, innerWidth, innerHeight);
}

addEventListener("resize", () => requestAnimationFrame(SyncRendererViewport));
requestAnimationFrame(SyncRendererViewport);

function HardenStructuralCollision() {
  for (const Entry of CollisionBoxes) {
    if (!Entry?.Type || !/Wall|Partition/i.test(Entry.Type) || Entry.BodyClearanceApplied) continue;
    const Bounds = Entry.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    if (![Bounds.min.x, Bounds.min.z, Bounds.max.x, Bounds.max.z].every(Number.isFinite)) continue;
    Bounds.min.x -= STRUCTURE_BODY_MARGIN;
    Bounds.max.x += STRUCTURE_BODY_MARGIN;
    Bounds.min.z -= STRUCTURE_BODY_MARGIN;
    Bounds.max.z += STRUCTURE_BODY_MARGIN;
    Entry.BodyClearanceApplied = true;
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
  HardenStructuralCollision();
  for (const Object of Game.Scene.children) EnsureModelCollision(Object);
  Game.Scene.traverse(EnsureWarehouseBoxCollisions);
  requestAnimationFrame(EnsureObjectCollisions);
}

EnsureObjectCollisions();
window.__STORE_RUNTIME_FIX_BUILD__ = "V0.11-R8";
