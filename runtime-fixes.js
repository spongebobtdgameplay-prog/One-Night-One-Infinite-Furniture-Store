import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

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
const MOVEMENT_MIN_RADIUS = 0.275;
const MOVEMENT_MAX_RADIUS = 0.315;
const MOVEMENT_SKIN = 0.008;
const SLIDE_ITERATIONS = 4;
const SWEEP_BINARY_STEPS = 8;
const MAX_SWEEP_STEPS = 18;
const DEPENETRATION_RINGS = 14;
const DEPENETRATION_DIRECTIONS = 20;
const BATCH_WINDOW_MS = 3.5;

const CollidableModels = new Set([
  "Couch_Large1", "Couch_L", "Chair_2", "Table_RoundLarge", "Bed_King", "Bed_Single",
  "NightStand_2", "Shelf_Large", "Bookshelf", "Kitchen_Cabinet1", "Kitchen_Fridge",
  "Kitchen_Oven", "Kitchen_Sink", "Bathroom_Bathtub", "Bathroom_Toilet", "Light_Floor1",
  "Door_3", "Window_Large1", "StoreTask", "FurniturePriceSign"
]);

const MovementContact = {
  Normal: new THREE.Vector3(),
  Position: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3(),
  SlideDirection: new THREE.Vector3(),
  Strength: 0,
  Sliding: false,
  Type: "",
  LastHit: -Infinity
};
window.__STORE_MOVEMENT_CONTACT__ = MovementContact;

const MoveScratch = {
  Position: new THREE.Vector3(),
  Candidate: new THREE.Vector3(),
  OriginalStart: new THREE.Vector3(),
  Start: new THREE.Vector3(),
  Desired: new THREE.Vector3(),
  Remaining: new THREE.Vector3(),
  Leftover: new THREE.Vector3(),
  Normal: new THREE.Vector3(),
  PreviousNormal: new THREE.Vector3(),
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  BestNormal: new THREE.Vector3(),
  ContactPosition: new THREE.Vector3(),
  Resolved: new THREE.Vector3(),
  TempDirection: new THREE.Vector3()
};

const MovementBatch = {
  Camera: null,
  Start: new THREE.Vector3(),
  Desired: new THREE.Vector3(),
  LastCallAt: -Infinity
};

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

function FiniteBounds(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.z, Bounds.max.x, Bounds.max.z].every(Number.isFinite) &&
    Bounds.min.x < Bounds.max.x && Bounds.min.z < Bounds.max.z
  );
}

function CircleTouchesBox(Position, Radius, Bounds) {
  if (!FiniteBounds(Bounds)) return false;
  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  const DX = Position.x - ClosestX;
  const DZ = Position.z - ClosestZ;
  return DX * DX + DZ * DZ <= Radius * Radius;
}

function BodyTouchesRealBox(Position, Bounds) {
  if (!FiniteBounds(Bounds)) return false;
  if (Position.x >= Bounds.min.x && Position.x <= Bounds.max.x && Position.z >= Bounds.min.z && Position.z <= Bounds.max.z) return true;
  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  const DX = Position.x - ClosestX;
  const DZ = Position.z - ClosestZ;
  const Distance = Math.hypot(DX, DZ);
  if (Distance <= 0.000001) return true;
  return Distance <= EllipseRadiusInDirection(DX, DZ);
}

function EntryBounds(Entry) {
  return Entry?.OriginalStructureBox || Entry?.OriginalBox || Entry?.Box || Entry || null;
}

function EntryTouchesPlayer(Entry, Position, Radius) {
  if (!Entry) return false;
  const Bounds = EntryBounds(Entry);
  const IsStructure = Entry.PrecisePlayerStructure || /Wall|Partition/i.test(String(Entry.Type || ""));

  if (IsStructure && FiniteBounds(Bounds)) return CircleTouchesBox(Position, Radius, Bounds);

  if (typeof Entry.TestPlayerCollision === "function") {
    try {
      if (Entry.TestPlayerCollision(Position, Radius)) return true;
    } catch {}
    if (Entry.PreciseGeometry || Entry.LegacyCollisionDisabled) return false;
  }

  return CircleTouchesBox(Position, Radius, Bounds);
}

function MovementBlocked(Position, Radius) {
  for (const Entry of CollisionBoxes) {
    if (EntryTouchesPlayer(Entry, Position, Radius)) return true;
  }
  return false;
}

function BoundsNormal(Position, Radius, Bounds, Motion, Target) {
  if (!FiniteBounds(Bounds)) return false;
  const MinX = Bounds.min.x - Radius;
  const MaxX = Bounds.max.x + Radius;
  const MinZ = Bounds.min.z - Radius;
  const MaxZ = Bounds.max.z + Radius;

  if (Position.x >= MinX && Position.x <= MaxX && Position.z >= MinZ && Position.z <= MaxZ) {
    const DistLeft = Position.x - MinX;
    const DistRight = MaxX - Position.x;
    const DistBack = Position.z - MinZ;
    const DistFront = MaxZ - Position.z;
    const MinDistance = Math.min(DistLeft, DistRight, DistBack, DistFront);

    if (MinDistance === DistLeft) Target.set(-1, 0, 0);
    else if (MinDistance === DistRight) Target.set(1, 0, 0);
    else if (MinDistance === DistBack) Target.set(0, 0, -1);
    else Target.set(0, 0, 1);

    if (Motion && Motion.dot(Target) > 0) Target.multiplyScalar(-1);
    return true;
  }

  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  Target.set(Position.x - ClosestX, 0, Position.z - ClosestZ);
  if (Target.lengthSq() <= 0.000001) return false;
  Target.normalize();
  if (Motion && Motion.dot(Target) > 0) Target.multiplyScalar(-1);
  return true;
}

function FindContact(Position, Radius, Motion) {
  let BestEntry = null;
  let BestScore = -Infinity;
  MoveScratch.BestNormal.set(0, 0, 0);

  for (const Entry of CollisionBoxes) {
    if (!EntryTouchesPlayer(Entry, Position, Radius)) continue;
    const Bounds = EntryBounds(Entry);
    if (!BoundsNormal(Position, Radius, Bounds, Motion, MoveScratch.Normal)) continue;
    const Score = Motion.lengthSq() > 0.000001 ? -Motion.dot(MoveScratch.Normal) : 1;
    if (Score > BestScore) {
      BestScore = Score;
      BestEntry = Entry;
      MoveScratch.BestNormal.copy(MoveScratch.Normal);
    }
  }

  if (!BestEntry) {
    if (Motion.lengthSq() > 0.000001) MoveScratch.BestNormal.copy(Motion).normalize().multiplyScalar(-1);
    else MoveScratch.BestNormal.set(0, 0, 1);
  }

  return { Entry: BestEntry, Normal: MoveScratch.BestNormal };
}

function MovementRadius() {
  const Reported = Number(Player()?.GetPlayerRadius?.()) || 0.34;
  return THREE.MathUtils.clamp(Reported * 0.90, MOVEMENT_MIN_RADIUS, MOVEMENT_MAX_RADIUS);
}

function Depenetrate(Position, Radius) {
  if (!MovementBlocked(Position, Radius)) return true;
  MoveScratch.Start.copy(Position);

  for (let Ring = 1; Ring <= DEPENETRATION_RINGS; Ring += 1) {
    const Distance = Ring * 0.014;
    for (let DirectionIndex = 0; DirectionIndex < DEPENETRATION_DIRECTIONS; DirectionIndex += 1) {
      const Angle = Math.PI * 2 * DirectionIndex / DEPENETRATION_DIRECTIONS;
      MoveScratch.Candidate.copy(MoveScratch.Start);
      MoveScratch.Candidate.x += Math.cos(Angle) * Distance;
      MoveScratch.Candidate.z += Math.sin(Angle) * Distance;
      if (!MovementBlocked(MoveScratch.Candidate, Radius)) {
        Position.copy(MoveScratch.Candidate);
        return true;
      }
    }
  }

  return false;
}

function SweepFraction(Start, Motion, Radius) {
  const MotionLength = Motion.length();
  if (MotionLength <= 0.000001) return 1;

  const StepLength = Math.max(0.028, Radius * 0.34);
  const StepCount = THREE.MathUtils.clamp(Math.ceil(MotionLength / StepLength), 1, MAX_SWEEP_STEPS);
  let LastSafe = 0;

  for (let Step = 1; Step <= StepCount; Step += 1) {
    const Fraction = Step / StepCount;
    MoveScratch.Candidate.copy(Start).addScaledVector(Motion, Fraction);
    if (!MovementBlocked(MoveScratch.Candidate, Radius)) {
      LastSafe = Fraction;
      continue;
    }

    let Low = LastSafe;
    let High = Fraction;
    for (let Binary = 0; Binary < SWEEP_BINARY_STEPS; Binary += 1) {
      const Mid = (Low + High) * 0.5;
      MoveScratch.Candidate.copy(Start).addScaledVector(Motion, Mid);
      if (MovementBlocked(MoveScratch.Candidate, Radius)) High = Mid;
      else Low = Mid;
    }
    return Low;
  }

  return 1;
}

function ClipAgainstNormal(Vector, Normal) {
  const IntoSurface = Vector.dot(Normal);
  if (IntoSurface < 0) Vector.addScaledVector(Normal, -IntoSurface);
  return Vector;
}

function StabilizeNormal(Normal) {
  if (MovementContact.Strength <= 0.01 || performance.now() - MovementContact.LastHit > 130) return Normal;
  if (MovementContact.Normal.lengthSq() <= 0.5 || Normal.dot(MovementContact.Normal) < 0.55) return Normal;
  Normal.lerp(MovementContact.Normal, 0.30).normalize();
  return Normal;
}

function RecordMovementContact(Position, Normal, Entry, Desired, Resolved) {
  MovementContact.Position.copy(Position);
  MovementContact.Normal.copy(Normal);
  MovementContact.Type = Entry?.Type || "Collision";
  MovementContact.LastHit = performance.now();

  MovementContact.DesiredDirection.copy(Desired);
  if (MovementContact.DesiredDirection.lengthSq() > 0.000001) MovementContact.DesiredDirection.normalize();

  MovementContact.SlideDirection.copy(Resolved);
  if (MovementContact.SlideDirection.lengthSq() > 0.000001) MovementContact.SlideDirection.normalize();

  const Inward = Desired.lengthSq() > 0.000001
    ? Math.max(0, -MoveScratch.TempDirection.copy(Desired).normalize().dot(Normal))
    : 1;
  MovementContact.Strength = THREE.MathUtils.clamp(0.58 + Inward * 0.42, 0, 1);
  MovementContact.Sliding = Resolved.lengthSq() > 0.00001 && Desired.lengthSq() > 0.00001;
}

function ResolveSlideMove(Camera, Desired) {
  if (!Desired || Desired.lengthSq() <= 0.00000001) return;

  const Radius = MovementRadius();
  MoveScratch.OriginalStart.copy(Camera.position);
  MoveScratch.Position.copy(Camera.position);
  Depenetrate(MoveScratch.Position, Radius);
  MoveScratch.Remaining.copy(Desired);
  MoveScratch.PreviousNormal.set(0, 0, 0);

  let HitSomething = false;
  let LastEntry = null;
  MoveScratch.BestNormal.set(0, 0, 0);

  for (let Iteration = 0; Iteration < SLIDE_ITERATIONS; Iteration += 1) {
    if (MoveScratch.Remaining.lengthSq() <= 0.00000001) break;

    MoveScratch.Start.copy(MoveScratch.Position);
    const Fraction = SweepFraction(MoveScratch.Start, MoveScratch.Remaining, Radius);
    if (Fraction >= 0.9995) {
      MoveScratch.Position.add(MoveScratch.Remaining);
      MoveScratch.Remaining.set(0, 0, 0);
      break;
    }

    HitSomething = true;
    const RemainingLength = MoveScratch.Remaining.length();
    const SkinFraction = RemainingLength > 0.000001 ? MOVEMENT_SKIN / RemainingLength : 0;
    const SafeFraction = Math.max(0, Fraction - SkinFraction);
    MoveScratch.Position.addScaledVector(MoveScratch.Remaining, SafeFraction);

    MoveScratch.ContactPosition.copy(MoveScratch.Start).addScaledVector(MoveScratch.Remaining, Math.min(1, Fraction + 0.004));
    const Contact = FindContact(MoveScratch.ContactPosition, Radius, MoveScratch.Remaining);
    LastEntry = Contact.Entry;
    MoveScratch.BestNormal.copy(Contact.Normal);
    StabilizeNormal(MoveScratch.BestNormal);

    MoveScratch.Position.addScaledVector(MoveScratch.BestNormal, MOVEMENT_SKIN);
    Depenetrate(MoveScratch.Position, Radius);

    MoveScratch.Leftover.copy(MoveScratch.Remaining).multiplyScalar(1 - SafeFraction);
    ClipAgainstNormal(MoveScratch.Leftover, MoveScratch.BestNormal);

    if (MoveScratch.PreviousNormal.lengthSq() > 0.5 && MoveScratch.PreviousNormal.dot(MoveScratch.BestNormal) < 0.985) {
      ClipAgainstNormal(MoveScratch.Leftover, MoveScratch.PreviousNormal);
    }

    MoveScratch.PreviousNormal.copy(MoveScratch.BestNormal);
    MoveScratch.Leftover.multiplyScalar(0.998);
    MoveScratch.Remaining.copy(MoveScratch.Leftover);
  }

  Camera.position.x = MoveScratch.Position.x;
  Camera.position.z = MoveScratch.Position.z;

  MoveScratch.Resolved.copy(MoveScratch.Position).sub(MoveScratch.OriginalStart);
  MoveScratch.Resolved.y = 0;

  if (HitSomething) {
    RecordMovementContact(MoveScratch.Position, MoveScratch.BestNormal, LastEntry, Desired, MoveScratch.Resolved);
  }
}

function ApplyMovementRequest(Camera, WorldDelta) {
  if (!Camera || WorldDelta.lengthSq() <= 0.00000001) return;
  const Now = performance.now();
  const SameBatch = MovementBatch.Camera === Camera && Now - MovementBatch.LastCallAt <= BATCH_WINDOW_MS;

  if (SameBatch) {
    Camera.position.copy(MovementBatch.Start);
    MovementBatch.Desired.add(WorldDelta);
  } else {
    MovementBatch.Camera = Camera;
    MovementBatch.Start.copy(Camera.position);
    MovementBatch.Desired.copy(WorldDelta);
  }

  ResolveSlideMove(Camera, MovementBatch.Desired);
  MovementBatch.LastCallAt = Now;
}

const OriginalMoveForward = PointerLockControls.prototype.moveForward;
const OriginalMoveRight = PointerLockControls.prototype.moveRight;

function GameControlCamera(Control) {
  return Control?.object || Control?.camera || Game.Camera;
}

PointerLockControls.prototype.moveForward = function MoveForwardWithSlide(Distance) {
  const Camera = GameControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return OriginalMoveForward.call(this, Distance);
  MoveScratch.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  MoveScratch.Forward.y = 0;
  if (MoveScratch.Forward.lengthSq() <= 0.000001) return;
  MoveScratch.Forward.normalize().multiplyScalar(Distance);
  ApplyMovementRequest(Camera, MoveScratch.Forward);
};

PointerLockControls.prototype.moveRight = function MoveRightWithSlide(Distance) {
  const Camera = GameControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return OriginalMoveRight.call(this, Distance);
  MoveScratch.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  MoveScratch.Right.y = 0;
  if (MoveScratch.Right.lengthSq() <= 0.000001) return;
  MoveScratch.Right.normalize().multiplyScalar(Distance);
  ApplyMovementRequest(Camera, MoveScratch.Right);
};

function EnsurePreciseStructureCollision() {
  for (const Entry of CollisionBoxes) {
    if (!Entry?.Type || !/Wall|Partition/i.test(Entry.Type) || Entry.PrecisePlayerStructure) continue;
    const Bounds = Entry.Box || Entry;
    if (!FiniteBounds(Bounds)) continue;
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

function DecayMovementContact(Delta, Now) {
  if (Now - MovementContact.LastHit <= 125) return;
  const Alpha = 1 - Math.exp(-Delta * 11);
  MovementContact.Strength = THREE.MathUtils.lerp(MovementContact.Strength, 0, Alpha);
  if (MovementContact.Strength < 0.012) {
    MovementContact.Strength = 0;
    MovementContact.Sliding = false;
    MovementContact.Type = "";
    MovementContact.Normal.set(0, 0, 0);
    MovementContact.DesiredDirection.set(0, 0, 0);
    MovementContact.SlideDirection.set(0, 0, 0);
  }
}

function CameraTick() {
  const Now = performance.now();
  const Delta = Math.min((Now - Orbit.LastTime) / 1000, 0.05);
  Orbit.LastTime = Now;
  const Controls = window.__STORE_POINTER_CONTROLS__ || null;
  const User = Settings();
  const Sensitivity = THREE.MathUtils.clamp(Number(User.Sensitivity) || 0.92, 0.35, 2);

  DecayMovementContact(Delta, Now);

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
window.__STORE_RUNTIME_FIX_BUILD__ = "V0.12.4";