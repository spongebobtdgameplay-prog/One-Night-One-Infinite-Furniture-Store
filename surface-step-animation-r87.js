import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
if (!Game?.Scene || !Game?.Camera || !Player?.Render) throw new Error("Game and player must load before carpet step animation.");

const Rugs = new Map();
const LastPosition = new THREE.Vector3();
const Velocity = new THREE.Vector3();
const Center = new THREE.Vector3();
const TempEuler = new THREE.Euler();
const TempQuaternion = new THREE.Quaternion();
let HasLastPosition = false;
let CurrentRugId = "";
let StepStartedAt = -Infinity;
let StepSide = 1;
let LastTriggerAt = -Infinity;
let LastFrameAt = performance.now();
let ArmedEdge = "";

const STEP_DURATION = 430;
const STEP_COOLDOWN = 260;
const MIN_TRIGGER_SPEED = 0.20;
const EDGE_LOOKAHEAD = 0.18;
const EDGE_PADDING = 0.025;
const BoneNames = [
  "Hips", "Abdomen", "Torso", "Chest",
  "UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R", "Foot.L", "Foot.R",
  "UpperArm.L", "UpperArm.R", "LowerArm.L", "LowerArm.R"
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
  Object.userData.ProceduralStepSurfaceR94 = true;
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
  for (const [Id, Record] of Rugs) {
    if (!Record.Object?.parent || !Record.Object.visible) {
      Rugs.delete(Id);
      continue;
    }
    const Bounds = BoundsOf(Record.Object);
    if (Bounds.isEmpty()) Rugs.delete(Id);
    else Record.Bounds.copy(Bounds);
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

function ApproachingEdge(Position, Direction) {
  if (Direction.lengthSq() < 0.000001) return "";
  for (const Record of Rugs.values()) {
    const B = Record.Bounds;
    if (Position.x < B.min.x - EDGE_LOOKAHEAD || Position.x > B.max.x + EDGE_LOOKAHEAD || Position.z < B.min.z - EDGE_LOOKAHEAD || Position.z > B.max.z + EDGE_LOOKAHEAD) continue;
    Center.set((B.min.x + B.max.x) * 0.5, Position.y, (B.min.z + B.max.z) * 0.5);
    const ToCenterX = Center.x - Position.x;
    const ToCenterZ = Center.z - Position.z;
    const MovingToward = ToCenterX * Direction.x + ToCenterZ * Direction.z > 0;
    const Inside = Position.x >= B.min.x && Position.x <= B.max.x && Position.z >= B.min.z && Position.z <= B.max.z;
    if (Inside) {
      const Edge = Math.min(Position.x - B.min.x, B.max.x - Position.x, Position.z - B.min.z, B.max.z - Position.z);
      if (Edge <= EDGE_LOOKAHEAD * 0.62 && !MovingToward) return `${Record.Id}:OUT`;
    } else {
      const DX = Position.x < B.min.x ? B.min.x - Position.x : Position.x > B.max.x ? Position.x - B.max.x : 0;
      const DZ = Position.z < B.min.z ? B.min.z - Position.z : Position.z > B.max.z ? Position.z - B.max.z : 0;
      if (Math.hypot(DX, DZ) <= EDGE_LOOKAHEAD && MovingToward) return `${Record.Id}:IN`;
    }
  }
  return "";
}

function TriggerStep(Side = null) {
  const Now = performance.now();
  if (Now - LastTriggerAt < STEP_COOLDOWN) return;
  LastTriggerAt = Now;
  StepStartedAt = Now;
  StepSide = Side === -1 || Side === 1 ? Side : -StepSide;
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

  Velocity.copy(Position).sub(LastPosition);
  Velocity.y = 0;
  const Speed = Velocity.length() / Delta;
  if (Velocity.lengthSq() > 0.000001) Velocity.normalize();
  const NextRugId = RugAt(Position);
  const Edge = Speed >= MIN_TRIGGER_SPEED ? ApproachingEdge(Position, Velocity) : "";

  if (Edge && Edge !== ArmedEdge) {
    ArmedEdge = Edge;
    TriggerStep(Velocity.x + Velocity.z < 0 ? -1 : 1);
  } else if (!Edge) ArmedEdge = "";

  if (NextRugId !== CurrentRugId && Speed >= MIN_TRIGGER_SPEED && performance.now() - LastTriggerAt > 90) TriggerStep();
  CurrentRugId = NextRugId;
  LastPosition.copy(Position);
}

function Bone(Root, Name) {
  const Object = Root?.getObjectByName?.(Name) || null;
  return Object?.isBone ? Object : null;
}

function ApplyBoneRotation(BoneObject, X = 0, Y = 0, Z = 0) {
  if (!BoneObject) return;
  TempEuler.set(X, Y, Z, "XYZ");
  TempQuaternion.setFromEuler(TempEuler);
  BoneObject.quaternion.multiply(TempQuaternion).normalize();
}

function StepCurve(Start, End, T) {
  if (T <= Start || T >= End) return 0;
  const Local = (T - Start) / (End - Start);
  return Math.sin(Local * Math.PI);
}

function ApplyStepPose(Root, Elapsed) {
  const T = THREE.MathUtils.clamp(Elapsed / STEP_DURATION, 0, 1);
  const Lead = StepCurve(0.00, 0.67, T);
  const Trail = StepCurve(0.29, 1.00, T);
  const Body = Math.sin(T * Math.PI);
  const IsLeftLead = StepSide < 0;

  ApplyBoneRotation(Bone(Root, IsLeftLead ? "UpperLeg.L" : "UpperLeg.R"), -0.54 * Lead, 0, StepSide * -0.025 * Lead);
  ApplyBoneRotation(Bone(Root, IsLeftLead ? "LowerLeg.L" : "LowerLeg.R"), 0.72 * Lead, 0, 0);
  ApplyBoneRotation(Bone(Root, IsLeftLead ? "Foot.L" : "Foot.R"), -0.32 * Lead, 0, 0);
  ApplyBoneRotation(Bone(Root, IsLeftLead ? "UpperLeg.R" : "UpperLeg.L"), -0.25 * Trail, 0, StepSide * 0.018 * Trail);
  ApplyBoneRotation(Bone(Root, IsLeftLead ? "LowerLeg.R" : "LowerLeg.L"), 0.37 * Trail, 0, 0);
  ApplyBoneRotation(Bone(Root, IsLeftLead ? "Foot.R" : "Foot.L"), -0.18 * Trail, 0, 0);
  ApplyBoneRotation(Bone(Root, "Hips"), 0.065 * Body, 0, StepSide * 0.048 * Body);
  ApplyBoneRotation(Bone(Root, "Abdomen"), -0.045 * Body, StepSide * -0.022 * Body, 0);
  ApplyBoneRotation(Bone(Root, "Torso"), -0.028 * Body, StepSide * 0.018 * Body, 0);
  ApplyBoneRotation(Bone(Root, "Chest"), -0.015 * Body, 0, StepSide * -0.012 * Body);
  ApplyBoneRotation(Bone(Root, "UpperArm.L"), 0.075 * Trail - 0.052 * Lead, 0, 0);
  ApplyBoneRotation(Bone(Root, "UpperArm.R"), 0.075 * Lead - 0.052 * Trail, 0, 0);
  Root.updateMatrixWorld(true);
  return Body;
}

if (!Player.__SurfaceStepAnimationR94Wrapped) {
  const OriginalPlayerRender = Player.Render.bind(Player);
  Player.Render = function SurfaceStepPlayerRender(Renderer, Scene, Camera) {
    UpdateCrossingState();
    const Elapsed = performance.now() - StepStartedAt;
    const Root = Elapsed < STEP_DURATION ? Game.Scene.getObjectByName("PlayerCharacterPivot") : null;
    if (!Root) return OriginalPlayerRender(Renderer, Scene, Camera);

    const Bones = BoneNames.map(Name => Bone(Root, Name)).filter(Boolean);
    const SavedQuaternions = Bones.map(Item => Item.quaternion.clone());
    const SavedRootY = Root.position.y;
    const SavedCameraY = Camera.position.y;
    const Body = ApplyStepPose(Root, Elapsed);
    Root.position.y = SavedRootY + Body * 0.060;
    if (!Player.IsThirdPerson?.()) Camera.position.y = SavedCameraY + Body * 0.024;
    Root.updateMatrixWorld(true);

    try {
      return OriginalPlayerRender(Renderer, Scene, Camera);
    } finally {
      Root.position.y = SavedRootY;
      Camera.position.y = SavedCameraY;
      for (let Index = 0; Index < Bones.length; Index += 1) Bones[Index].quaternion.copy(SavedQuaternions[Index]);
      Root.updateMatrixWorld(true);
    }
  };
  Player.__SurfaceStepAnimationR94Wrapped = true;
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
  GetRegisteredCount: () => Rugs.size
};
window.__STORE_SURFACE_STEP_ANIMATION_R94__ = window.__STORE_SURFACE_STEP_ANIMATION_R87__;
window.__STORE_SURFACE_STEP_ANIMATION_BUILD__ = "V0.30.0-R94";