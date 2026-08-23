import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.Renderer || !Game?.CollisionBoxes) throw new Error("Game must load before runtime fixes.");

const Canvas = document.getElementById("GameCanvas");
const StartButton = document.getElementById("StartButton");
const BootStatus = document.getElementById("BootStatus");
const CollisionBoxes = Game.CollisionBoxes;
const ProcessedInstances = new WeakSet();
const ProcessedModels = new WeakSet();
const BODY_HALF_WIDTH = 0.18;
const BODY_HALF_DEPTH = 0.12;

const CollidableModels = new Set([
  "Couch_Large1", "Couch_L", "Chair_2", "Table_RoundLarge", "Bed_King", "Bed_Single",
  "NightStand_2", "Shelf_Large", "Bookshelf", "Kitchen_Cabinet1", "Kitchen_Fridge",
  "Kitchen_Oven", "Kitchen_Sink", "Bathroom_Bathtub", "Bathroom_Toilet", "Light_Floor1",
  "Door_3", "Window_Large1", "StoreTask", "FurniturePriceSign"
]);

function Settings() {
  return window.__STORE_USER_SETTINGS__ || { Sensitivity: 0.92, TrackpadSmoothing: 58 };
}

function Player() {
  return window.__STORE_PLAYER__ || null;
}

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
  Game.Renderer.setScissorTest(false);
  Game.Renderer.setViewport(0, 0, innerWidth, innerHeight);
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
  const Denominator = LocalX * LocalX / (BODY_HALF_WIDTH * BODY_HALF_WIDTH) + LocalZ * LocalZ / (BODY_HALF_DEPTH * BODY_HALF_DEPTH);
  return Denominator > 0.000001 ? 1 / Math.sqrt(Denominator) : BODY_HALF_DEPTH;
}

function BodyTouchesRealBox(Position, Bounds) {
  if (!Bounds?.min || !Bounds?.max) return false;
  if (Position.x >= Bounds.min.x && Position.x <= Bounds.max.x && Position.z >= Bounds.min.z && Position.z <= Bounds.max.z) return true;
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
  if (!Object?.isObject3D || !Object.parent || ProcessedModels.has(Object)) return;
  if (Object.name === "Houseplant_3" || !CollidableModels.has(Object.name)) {
    ProcessedModels.add(Object);
    return;
  }
  const ChunkId = Object.userData?.ChunkId;
  if (!ChunkId) return;
  if (!HasCollisionFor(Object)) {
    Object.updateMatrixWorld(true);
    const Bounds = new THREE.Box3().setFromObject(Object);
    if (!Bounds.isEmpty()) CollisionBoxes.push({ Box: Bounds, ChunkId, Type: Object.name, AutoGeometryCandidate: true });
  }
  ProcessedModels.add(Object);
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
    CollisionBoxes.push({ Box: SourceBounds.clone().applyMatrix4(WorldMatrix), ChunkId, Type: `WarehouseBox-${Index}`, PreciseGeometry: true, AutoInstanceCollision: true });
  }
  ProcessedInstances.add(Object);
}

function CollisionMaintenance() {
  EnsurePreciseStructureCollision();
  const Chunks = Game.ActiveChunks?.values?.();
  if (Chunks) {
    for (const Chunk of Chunks) {
      for (const Model of Chunk.Models || []) EnsureModelCollision(Model);
      for (const Object of Chunk.TaskObjects || []) EnsureModelCollision(Object);
      Chunk.Group?.traverse?.(EnsureWarehouseBoxCollisions);
    }
  } else {
    for (const Object of Game.Scene.children) EnsureModelCollision(Object);
  }
}

const Orbit = {
  Held: false,
  Ready: false,
  TargetYaw: 0,
  TargetPitch: 0,
  CurrentYaw: 0,
  CurrentPitch: 0,
  LastTime: performance.now(),
  Euler: new THREE.Euler(0, 0, 0, "YXZ")
};

function ReadOrbit() {
  Orbit.Euler.setFromQuaternion(Game.Camera.quaternion, "YXZ");
  Orbit.CurrentPitch = Orbit.Euler.x;
  Orbit.CurrentYaw = Orbit.Euler.y;
  Orbit.TargetPitch = Orbit.CurrentPitch;
  Orbit.TargetYaw = Orbit.CurrentYaw;
  Orbit.Ready = true;
}

function NormalizeAngle(Value) {
  return Math.atan2(Math.sin(Value), Math.cos(Value));
}

addEventListener("mousedown", Event => {
  if (Event.button !== 2 || !Player()?.IsThirdPerson?.()) return;
  Orbit.Held = true;
  ReadOrbit();
}, true);

addEventListener("mouseup", Event => {
  if (Event.button !== 2) return;
  Orbit.Held = false;
  Orbit.Ready = false;
}, true);

addEventListener("blur", () => {
  Orbit.Held = false;
  Orbit.Ready = false;
});

document.addEventListener("mousemove", Event => {
  if (!Orbit.Held || !Player()?.IsThirdPerson?.()) return;
  if (!Orbit.Ready) ReadOrbit();
  const User = Settings();
  const Sensitivity = THREE.MathUtils.clamp(Number(User.Sensitivity) || 0.92, 0.35, 2);
  const Scale = 0.00185 * Sensitivity;
  Orbit.TargetYaw -= Event.movementX * Scale;
  Orbit.TargetPitch -= Event.movementY * Scale;
  Orbit.TargetPitch = THREE.MathUtils.clamp(Orbit.TargetPitch, -1.12, 1.08);
  Event.preventDefault();
  Event.stopImmediatePropagation();
}, true);

function CameraTick() {
  const Now = performance.now();
  const Delta = Math.min((Now - Orbit.LastTime) / 1000, 0.05);
  Orbit.LastTime = Now;
  const Controls = window.__STORE_POINTER_CONTROLS__ || null;
  const User = Settings();
  const Sensitivity = THREE.MathUtils.clamp(Number(User.Sensitivity) || 0.92, 0.35, 2);

  if (Controls && !Player()?.IsThirdPerson?.()) Controls.pointerSpeed = Sensitivity;

  if (Orbit.Held && Player()?.IsThirdPerson?.()) {
    if (!Orbit.Ready) ReadOrbit();
    const Smooth = THREE.MathUtils.clamp(Number(User.TrackpadSmoothing) || 0, 0, 100) / 100;
    const Responsiveness = THREE.MathUtils.lerp(30, 10.5, Smooth);
    const Alpha = 1 - Math.exp(-Delta * Responsiveness);
    Orbit.CurrentYaw += NormalizeAngle(Orbit.TargetYaw - Orbit.CurrentYaw) * Alpha;
    Orbit.CurrentPitch = THREE.MathUtils.lerp(Orbit.CurrentPitch, Orbit.TargetPitch, Alpha);
    Orbit.Euler.set(Orbit.CurrentPitch, Orbit.CurrentYaw, 0, "YXZ");
    Game.Camera.quaternion.setFromEuler(Orbit.Euler);
    Game.Camera.updateMatrixWorld(true);
    if (Controls) Controls.pointerSpeed = 0;
  }
  requestAnimationFrame(CameraTick);
}

CollisionMaintenance();
setInterval(CollisionMaintenance, 250);
requestAnimationFrame(CameraTick);
window.__STORE_RUNTIME_FIX_BUILD__ = "V0.11-R43";
