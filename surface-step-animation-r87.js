import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Physics = window.__STORE_PROCEDURAL_PHYSICS__ || null;
if (!Game?.Scene || !Game?.Camera) throw new Error("Game must load before carpet step animation.");

const Rugs = new Map();
const LastPosition = new THREE.Vector3();
const TempVelocity = new THREE.Vector3();

let HasLastPosition = false;
let CurrentRugId = "";
let StepStartedAt = -Infinity;
let StepSide = 1;
let StepEntering = true;
let StepRugId = "";
let LastTriggerAt = -Infinity;
let LastFrameAt = performance.now();
let StepSpeed = 0;
const StepDirection = new THREE.Vector3(0, 0, -1);

const STEP_DURATION = 430;
const STEP_COOLDOWN = 120;
const MIN_TRIGGER_SPEED = 0.08;
const EDGE_PADDING = 0.22;

function BoundsOf(Object) {
  Object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Object);
}

function RegisterRug(Object, ChunkId = "") {
  if (!Object?.isObject3D || !Object.parent) return "";
  const Bounds = BoundsOf(Object);
  if (Bounds.isEmpty()) return "";

  const Id = `${ChunkId || Object.userData?.ChunkId || "world"}:${Object.uuid}`;
  Rugs.set(Id, {
    Id,
    Object,
    ChunkId: ChunkId || Object.userData?.ChunkId || "",
    Bounds
  });

  Object.userData.WalkableCarpetR87 = true;
  Object.userData.DecorationNoCollision = true;
  Physics?.RegisterWalkableSurface?.(Object, ChunkId);
  return Id;
}

function UnregisterObject(Object) {
  if (!Object) return;
  for (const [Id, Record] of Rugs) {
    if (Record.Object === Object) Rugs.delete(Id);
  }
  Physics?.UnregisterWalkableSurface?.(Object);
}

function UnregisterChunk(ChunkId) {
  for (const [Id, Record] of Rugs) {
    if (Record.ChunkId === ChunkId) Rugs.delete(Id);
  }
  Physics?.UnregisterChunk?.(ChunkId);
}

function RefreshRegisteredRugs() {
  for (const [Id, Record] of Rugs) {
    if (!Record.Object?.parent || !Record.Object.visible) {
      Rugs.delete(Id);
      continue;
    }

    const Bounds = BoundsOf(Record.Object);
    if (Bounds.isEmpty()) {
      Rugs.delete(Id);
      continue;
    }

    Record.Bounds.copy(Bounds);
    Physics?.RefreshWalkableSurface?.(Record.Object);
  }
}

function RugAt(Position) {
  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (Position.x < Bounds.min.x - EDGE_PADDING || Position.x > Bounds.max.x + EDGE_PADDING) continue;
    if (Position.z < Bounds.min.z - EDGE_PADDING || Position.z > Bounds.max.z + EDGE_PADDING) continue;
    return Record.Id;
  }
  return "";
}

function TriggerStep(Side = null, Entering = true, RugId = "", Speed = 0, Direction = null) {
  const Now = performance.now();
  if (Now - LastTriggerAt < STEP_COOLDOWN) return false;

  LastTriggerAt = Now;
  StepStartedAt = Now;
  StepSide = Side === -1 || Side === 1 ? Side : -StepSide;
  StepEntering = Boolean(Entering);
  StepRugId = String(RugId || "");
  StepSpeed = Math.max(0, Number(Speed) || 0);

  if (Direction?.isVector3 && Direction.lengthSq() > 0.000001) {
    StepDirection.copy(Direction);
    StepDirection.y = 0;
    StepDirection.normalize();
  }

  return true;
}

function UpdateCrossingState() {
  const Now = performance.now();
  const Delta = Math.max(0.001, Math.min((Now - LastFrameAt) / 1000, 0.08));
  LastFrameAt = Now;

  const Position = Game.Camera.position;
  if (!HasLastPosition) {
    LastPosition.copy(Position);
    CurrentRugId = RugAt(Position);
    HasLastPosition = true;
    return;
  }

  TempVelocity.copy(Position).sub(LastPosition);
  TempVelocity.y = 0;
  const Speed = TempVelocity.length() / Delta;
  const NextRugId = RugAt(Position);

  if (NextRugId !== CurrentRugId && Speed >= MIN_TRIGGER_SPEED) {
    const Entering = Boolean(NextRugId);
    TriggerStep(null, Entering, Entering ? NextRugId : CurrentRugId, Speed, TempVelocity);
  }

  CurrentRugId = NextRugId;
  LastPosition.copy(Position);
}

function GetStepState() {
  const Elapsed = performance.now() - StepStartedAt;
  const Progress = THREE.MathUtils.clamp(Elapsed / STEP_DURATION, 0, 1);
  const Record = Rugs.get(StepRugId) || null;
  const Height = Record?.Bounds?.max?.y ?? 0;
  return {
    Active: Elapsed >= 0 && Elapsed < STEP_DURATION,
    Progress,
    Side: StepSide,
    Entering: StepEntering,
    RugId: StepRugId,
    Duration: STEP_DURATION,
    Height,
    Speed: StepSpeed,
    DirectionX: StepDirection.x,
    DirectionZ: StepDirection.z
  };
}

const RefreshInterval = setInterval(RefreshRegisteredRugs, 900);
addEventListener("pagehide", () => clearInterval(RefreshInterval), { once: true });

window.__STORE_SURFACE_STEP_ANIMATION_R87__ = {
  RegisterRug,
  UnregisterObject,
  UnregisterChunk,
  RefreshRegisteredRugs,
  TriggerStep,
  UpdateCrossingState,
  GetStepState,
  GetRegisteredCount: () => Rugs.size
};

window.__STORE_SURFACE_STEP_ANIMATION_BUILD__ = "V0.27.8-PHYSICS";
