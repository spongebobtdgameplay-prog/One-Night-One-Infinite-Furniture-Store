import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
if (!Game?.Scene || !Game?.Camera || !Player?.Render) throw new Error("Game and player must load before carpet step animation.");

const Rugs = new Map();
const LastPosition = new THREE.Vector3();
const TempVelocity = new THREE.Vector3();
let HasLastPosition = false;
let CurrentRugId = "";
let StepStartedAt = -Infinity;
let StepSide = 1;
let LastTriggerAt = -Infinity;
let LastFrameAt = performance.now();
let SurfaceOffset = 0;
let SurfaceTarget = 0;
let StepHeight = 0.03;
let StepDirection = 1;
const BaseEyeHeight = Number(Game.PlayerEyeHeight) || Number(Game.Camera.position.y) || 1.68;

const STEP_DURATION = 360;
const STEP_COOLDOWN = 170;
const MIN_TRIGGER_SPEED = 0.22;
const EDGE_PADDING = 0.025;
const MAX_SURFACE_HEIGHT = 0.18;
const MIN_VISIBLE_STEP_HEIGHT = 0.018;
const BoneNames = [
  "Hips", "Abdomen", "Torso",
  "UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R", "Foot.L", "Foot.R",
  "UpperArm.L", "UpperArm.R"
];

function BoundsOf(Object) {
  Object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Object);
}

function RegisterRug(Object, ChunkId = "") {
  if (!Object?.isObject3D || !Object.parent) return;
  const Bounds = BoundsOf(Object);
  if (Bounds.isEmpty()) return;
  const Id = `${ChunkId || Object.userData?.ChunkId || "world"}:${Object.uuid}`;
  Rugs.set(Id, { Id, Object, ChunkId: ChunkId || Object.userData?.ChunkId || "", Bounds });
  Object.userData.WalkableCarpetR87 = true;
  return Id;
}

function UnregisterObject(Object) {
  if (!Object) return;
  for (const [Id, Record] of Rugs) if (Record.Object === Object) Rugs.delete(Id);
}

function UnregisterChunk(ChunkId) {
  for (const [Id, Record] of Rugs) if (Record.ChunkId === ChunkId) Rugs.delete(Id);
}

function RefreshRegisteredRugs() {
  const LiveChunkIds = new Set();
  for (const Chunk of Game.ActiveChunks?.values?.() || []) if (Chunk?.Id && !Chunk.Cancelled) LiveChunkIds.add(Chunk.Id);
  for (const Chunk of Game.PreparedChunks?.values?.() || []) if (Chunk?.Id && !Chunk.Cancelled) LiveChunkIds.add(Chunk.Id);

  for (const [Id, Record] of Rugs) {
    if (
      !Record.Object?.parent ||
      !Record.Object.visible ||
      (Record.ChunkId && !LiveChunkIds.has(Record.ChunkId))
    ) {
      Rugs.delete(Id);
      continue;
    }
    const Bounds = BoundsOf(Record.Object);
    if (Bounds.isEmpty()) Rugs.delete(Id);
    else Record.Bounds.copy(Bounds);
  }
}

function RugRecordAt(Position) {
  for (const Record of Rugs.values()) {
    const Bounds = Record.Bounds;
    if (Position.x < Bounds.min.x - EDGE_PADDING || Position.x > Bounds.max.x + EDGE_PADDING) continue;
    if (Position.z < Bounds.min.z - EDGE_PADDING || Position.z > Bounds.max.z + EDGE_PADDING) continue;
    return Record;
  }
  return null;
}

function RugAt(Position) {
  return RugRecordAt(Position)?.Id || "";
}

function TriggerStep(Side = null, Height = MIN_VISIBLE_STEP_HEIGHT, Direction = 1) {
  const Now = performance.now();
  if (Now - LastTriggerAt < STEP_COOLDOWN) return;
  LastTriggerAt = Now;
  StepStartedAt = Now;
  StepSide = Side === -1 || Side === 1 ? Side : -StepSide;
  StepHeight = THREE.MathUtils.clamp(Math.max(Math.abs(Number(Height) || 0), MIN_VISIBLE_STEP_HEIGHT), MIN_VISIBLE_STEP_HEIGHT, MAX_SURFACE_HEIGHT);
  StepDirection = Direction < 0 ? -1 : 1;
}

function UpdateCrossingState() {
  const Now = performance.now();
  const Delta = Math.max(0.001, Math.min((Now - LastFrameAt) / 1000, 0.08));
  LastFrameAt = Now;
  const Position = Game.Camera.position;
  const NextRug = RugRecordAt(Position);
  const NextRugId = NextRug?.Id || "";

  const PreviousSurfaceTarget = SurfaceTarget;
  const NextSurfaceTarget = NextRug
    ? THREE.MathUtils.clamp(Number(NextRug.Bounds?.max?.y) || 0, 0, MAX_SURFACE_HEIGHT)
    : 0;
  SurfaceTarget = NextSurfaceTarget;
  const SurfaceAlpha = 1 - Math.exp(-Delta * 22);
  SurfaceOffset = THREE.MathUtils.lerp(SurfaceOffset, SurfaceTarget, SurfaceAlpha);
  if (Math.abs(SurfaceOffset - SurfaceTarget) < 0.0004) SurfaceOffset = SurfaceTarget;
  Game.Camera.position.y = BaseEyeHeight + SurfaceOffset;

  if (!HasLastPosition) {
    LastPosition.copy(Position);
    CurrentRugId = NextRugId;
    HasLastPosition = true;
    return;
  }

  TempVelocity.copy(Position).sub(LastPosition);
  TempVelocity.y = 0;
  const Speed = TempVelocity.length() / Delta;

  if (NextRugId !== CurrentRugId && Speed >= MIN_TRIGGER_SPEED) {
    const HeightDelta = NextSurfaceTarget - PreviousSurfaceTarget;
    TriggerStep(null, Math.abs(HeightDelta), HeightDelta < 0 ? -1 : 1);
  }
  CurrentRugId = NextRugId;
  LastPosition.copy(Position);
}

function Bone(Root, Name) {
  return Root?.getObjectByName?.(Name) || null;
}

function ApplyBoneRotation(BoneObject, X = 0, Y = 0, Z = 0) {
  if (!BoneObject) return;
  const Euler = new THREE.Euler(X, Y, Z, "XYZ");
  const Rotation = new THREE.Quaternion().setFromEuler(Euler);
  BoneObject.quaternion.multiply(Rotation).normalize();
}

function StepCurve(Start, End, T) {
  if (T <= Start || T >= End) return 0;
  const Local = (T - Start) / (End - Start);
  return Math.sin(Local * Math.PI);
}

function ApplyStepPose(Root, Elapsed) {
  const T = THREE.MathUtils.clamp(Elapsed / STEP_DURATION, 0, 1);
  const Lead = StepCurve(0.00, 0.66, T);
  const Trail = StepCurve(0.34, 1.00, T);
  const Body = Math.sin(T * Math.PI);
  const HeightScale = THREE.MathUtils.clamp(0.46 + StepHeight / 0.065, 0.46, 1.32);
  const DirectionScale = StepDirection > 0 ? 1 : 0.72;
  const MotionScale = HeightScale * DirectionScale;
  const BodyLift = Math.min(0.052, Math.max(0.010, StepHeight * 0.52)) * Body * DirectionScale;

  Root.position.y += BodyLift;
  const IsLeftLead = StepSide < 0;
  const LeadUpper = Bone(Root, IsLeftLead ? "UpperLeg.L" : "UpperLeg.R");
  const LeadLower = Bone(Root, IsLeftLead ? "LowerLeg.L" : "LowerLeg.R");
  const LeadFoot = Bone(Root, IsLeftLead ? "Foot.L" : "Foot.R");
  const TrailUpper = Bone(Root, IsLeftLead ? "UpperLeg.R" : "UpperLeg.L");
  const TrailLower = Bone(Root, IsLeftLead ? "LowerLeg.R" : "LowerLeg.L");
  const TrailFoot = Bone(Root, IsLeftLead ? "Foot.R" : "Foot.L");

  ApplyBoneRotation(LeadUpper, -0.38 * Lead * MotionScale, 0, StepSide * -0.018 * Lead);
  ApplyBoneRotation(LeadLower, 0.48 * Lead * MotionScale, 0, 0);
  ApplyBoneRotation(LeadFoot, -0.23 * Lead * MotionScale, 0, 0);
  ApplyBoneRotation(TrailUpper, -0.20 * Trail * MotionScale, 0, StepSide * 0.012 * Trail);
  ApplyBoneRotation(TrailLower, 0.28 * Trail * MotionScale, 0, 0);
  ApplyBoneRotation(TrailFoot, -0.12 * Trail * MotionScale, 0, 0);
  ApplyBoneRotation(Bone(Root, "Hips"), 0.045 * Body * MotionScale, 0, StepSide * 0.035 * Body);
  ApplyBoneRotation(Bone(Root, "Abdomen"), -0.028 * Body * MotionScale, StepSide * -0.018 * Body * MotionScale, 0);
  ApplyBoneRotation(Bone(Root, "Torso"), -0.018 * Body, StepSide * 0.014 * Body, 0);
  ApplyBoneRotation(Bone(Root, "UpperArm.L"), (0.055 * Trail - 0.035 * Lead) * MotionScale, 0, 0);
  ApplyBoneRotation(Bone(Root, "UpperArm.R"), (0.055 * Lead - 0.035 * Trail) * MotionScale, 0, 0);
  Root.updateMatrixWorld(true);
}

if (!Player.__SurfaceStepAnimationR87Wrapped) {
  const OriginalPlayerRender = Player.Render.bind(Player);
  Player.Render = function SurfaceStepPlayerRender(Renderer, Scene, Camera) {
    UpdateCrossingState();
    const Elapsed = performance.now() - StepStartedAt;
    const Root = Elapsed < STEP_DURATION ? Game.Scene.getObjectByName("PlayerCharacterPivot") : null;
    if (!Root) return OriginalPlayerRender(Renderer, Scene, Camera);

    const Bones = BoneNames.map(Name => Bone(Root, Name)).filter(Boolean);
    const Saved = Bones.map(Item => Item.quaternion.clone());
    const SavedRootY = Root.position.y;
    ApplyStepPose(Root, Elapsed);
    try {
      return OriginalPlayerRender(Renderer, Scene, Camera);
    } finally {
      Root.position.y = SavedRootY;
      for (let Index = 0; Index < Bones.length; Index += 1) Bones[Index].quaternion.copy(Saved[Index]);
      Root.updateMatrixWorld(true);
    }
  };
  Player.__SurfaceStepAnimationR87Wrapped = true;
}

const RefreshInterval = setInterval(RefreshRegisteredRugs, 900);
addEventListener("pagehide", () => clearInterval(RefreshInterval), { once: true });

window.__STORE_SURFACE_STEP_ANIMATION_R87__ = {
  RegisterRug,
  UnregisterObject,
  UnregisterChunk,
  RefreshRegisteredRugs,
  TriggerStep,
  GetSurfaceOffset: () => SurfaceOffset,
  GetSurfaceTarget: () => SurfaceTarget,
  GetRegisteredCount: () => Rugs.size
};
window.__STORE_SURFACE_STEP_ANIMATION_BUILD__ = "V0.27.8";
