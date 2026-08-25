import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.Camera || !Game?.Renderer || !Game?.CollisionBoxes || !Game?.ActiveChunks || !Game?.PreparedChunks) {
  throw new Error("The Infinity Store must load before core fix authority.");
}

const FurnitureNames = new Set([
  "Couch_Large1", "Couch_L", "Chair_2", "Table_RoundLarge", "Bed_King", "Bed_Single",
  "NightStand_2", "Shelf_Large", "Bookshelf", "Kitchen_Cabinet1", "Kitchen_Fridge",
  "Kitchen_Oven", "Kitchen_Sink", "Bathroom_Bathtub", "Bathroom_Toilet", "Light_Floor1"
]);
const RemovedGeometryNames = new Set(["Window_Large1"]);
const ProcessedCollision = new WeakMap();
const ProcessedMaterials = new WeakSet();
const RugBounds = new Map();
const PlayerEyeHeight = 1.68;
const TempBox = new THREE.Box3();
const TempSize = new THREE.Vector3();
const TempCenter = new THREE.Vector3();
let SurfaceStepStartedAt = -Infinity;
let SurfaceStepSide = 1;
let WasOnRug = false;

function RemoveGlobalEntry(Chunk, Entry) {
  if (!Entry) return;
  Entry.Active = false;
  for (let Index = Game.CollisionBoxes.length - 1; Index >= 0; Index -= 1) {
    if (Game.CollisionBoxes[Index] === Entry) Game.CollisionBoxes.splice(Index, 1);
  }
  const LocalIndex = Chunk.CollisionEntries?.indexOf?.(Entry) ?? -1;
  if (LocalIndex >= 0) Chunk.CollisionEntries.splice(LocalIndex, 1);
}

function RemoveObjectCollision(Chunk, Model) {
  for (const Entry of [...(Chunk.CollisionEntries || [])]) {
    const SameType = Entry?.Type === Model.name;
    const SameObject = Entry?.CollisionObject === Model;
    const SameSource = Entry?.SourceModel === Model || Entry?.Model === Model;
    if (SameType || SameObject || SameSource) RemoveGlobalEntry(Chunk, Entry);
  }
}

function PlayerTouchesBox(Position, Radius, Box) {
  const FeetY = Position.y - PlayerEyeHeight;
  const HeadY = Position.y + 0.12;
  if (Box.max.y < FeetY + 0.03 || Box.min.y > HeadY) return false;
  const ClosestX = THREE.MathUtils.clamp(Position.x, Box.min.x, Box.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Box.min.z, Box.max.z);
  const DX = Position.x - ClosestX;
  const DZ = Position.z - ClosestZ;
  return DX * DX + DZ * DZ <= Radius * Radius;
}

function TightMeshBoxes(Model) {
  const Boxes = [];
  Model.updateWorldMatrix(true, true);
  Model.traverse(Object => {
    if (!Object?.isMesh || !Object.visible || /Text|Label|Glow/i.test(String(Object.name || ""))) return;
    TempBox.setFromObject(Object);
    if (TempBox.isEmpty()) return;
    TempBox.getSize(TempSize);
    if (TempSize.x < 0.035 || TempSize.y < 0.035 || TempSize.z < 0.035) return;
    TempBox.getCenter(TempCenter);
    const HalfX = Math.max(0.025, TempSize.x * 0.475);
    const HalfZ = Math.max(0.025, TempSize.z * 0.475);
    const MinY = TempBox.min.y + Math.min(0.015, TempSize.y * 0.025);
    const MaxY = TempBox.max.y - Math.min(0.015, TempSize.y * 0.025);
    Boxes.push(new THREE.Box3(
      new THREE.Vector3(TempCenter.x - HalfX, MinY, TempCenter.z - HalfZ),
      new THREE.Vector3(TempCenter.x + HalfX, MaxY, TempCenter.z + HalfZ)
    ));
  });
  return Boxes.slice(0, 24);
}

function InstallFurnitureCollision(Chunk, Model) {
  Model.updateWorldMatrix(true, true);
  const Matrix = Model.matrixWorld.elements;
  const Signature = `${Matrix[0].toFixed(3)}:${Matrix[2].toFixed(3)}:${Matrix[8].toFixed(3)}:${Matrix[10].toFixed(3)}:${Matrix[12].toFixed(3)}:${Matrix[14].toFixed(3)}:${Model.children.length}`;
  if (ProcessedCollision.get(Model) === Signature) return;

  RemoveObjectCollision(Chunk, Model);
  const Boxes = TightMeshBoxes(Model);
  for (let Index = 0; Index < Boxes.length; Index += 1) {
    const StableBox = Boxes[Index];
    const Entry = {
      Box: StableBox,
      OriginalBox: StableBox.clone(),
      OriginalLegacyBox: StableBox.clone(),
      ChunkId: Chunk.Id,
      Type: `${Model.name}MeshCollisionR86`,
      Active: Boolean(Chunk.Active),
      CollisionObject: Model,
      CollisionPiece: Index,
      CoreFixR86: true,
      PreciseGeometry: true,
      LegacyCollisionDisabled: true,
      TestPlayerCollision(Position, Radius = 0.28) {
        return PlayerTouchesBox(Position, Radius, StableBox);
      }
    };
    Chunk.CollisionEntries.push(Entry);
    if (Chunk.Active && !Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
  }
  ProcessedCollision.set(Model, Signature);
}

function MaterialHex(Material) {
  if (!Material?.color?.isColor) return null;
  return Material.color.getHex(THREE.SRGBColorSpace);
}

function IsHardToSee(Material) {
  const Hex = MaterialHex(Material);
  if (Hex === null) return false;
  const Red = (Hex >> 16) & 255;
  const Green = (Hex >> 8) & 255;
  const Blue = Hex & 255;
  const Max = Math.max(Red, Green, Blue);
  const Average = (Red + Green + Blue) / 3;
  return Max <= 48 || Average <= 38;
}

function ReplacementForModel(ModelName) {
  if (ModelName === "Chair_2") return 0x87977f;
  if (ModelName === "Shelf_Large" || ModelName === "Bookshelf") return 0x8a8173;
  if (ModelName === "Kitchen_Oven" || ModelName === "Kitchen_Fridge" || ModelName === "Kitchen_Sink") return 0x8b9698;
  if (ModelName === "Light_Floor1") return 0x858d88;
  if (ModelName === "Couch_Large1" || ModelName === "Couch_L") return 0x7e8f83;
  return 0x747d79;
}

function FixDarkMaterials(Model) {
  if (ProcessedMaterials.has(Model)) return;
  ProcessedMaterials.add(Model);
  const Replacement = ReplacementForModel(Model.name);
  Model.traverse(Object => {
    if (!Object?.isMesh || !Object.material) return;
    const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
    const Updated = Materials.map(Material => {
      if (!IsHardToSee(Material)) return Material;
      const Copy = Material.clone();
      Copy.color?.setHex(Replacement, THREE.SRGBColorSpace);
      if ("roughness" in Copy) Copy.roughness = Math.max(0.55, Copy.roughness ?? 0.72);
      if (Copy.emissive?.isColor && Copy.emissiveIntensity > 0.01) {
        Copy.emissive.setHex(0x252c28, THREE.SRGBColorSpace);
        Copy.emissiveIntensity = Math.min(Copy.emissiveIntensity, 0.08);
      }
      Copy.needsUpdate = true;
      return Copy;
    });
    Object.material = Array.isArray(Object.material) ? Updated : Updated[0];
  });
}

function RemoveDecorativeWindows(Chunk) {
  const RemovedModels = [];
  for (const Model of [...(Chunk.Models || [])]) {
    if (!Model?.parent || !RemovedGeometryNames.has(Model.name)) continue;
    RemoveObjectCollision(Chunk, Model);
    Model.parent.remove(Model);
    RemovedModels.push(Model);
  }
  if (RemovedModels.length) Chunk.Models = (Chunk.Models || []).filter(Model => !RemovedModels.includes(Model));

  const RemoveObjects = [];
  Chunk.Group?.traverse?.(Object => {
    if (Object !== Chunk.Group && RemovedGeometryNames.has(String(Object?.name || ""))) RemoveObjects.push(Object);
  });
  for (const Object of RemoveObjects) {
    RemoveObjectCollision(Chunk, Object);
    Object.parent?.remove(Object);
  }
}

function IsRugObject(Object) {
  const Name = String(Object?.name || "");
  return Name.startsWith("CouchDisplayRugR84-") || Name.startsWith("OnlineDisplayRugR75-") || Name === "LargeShowroomRugR82" || Object?.userData?.DecorationKind === "Rug" || Object?.userData?.DecorationKind === "LargeShowroomRug";
}

function RemoveRugCollision(Chunk) {
  for (const Entry of [...(Chunk.CollisionEntries || [])]) {
    const Type = String(Entry?.Type || "");
    const Object = Entry?.CollisionObject;
    if (/Rug|FloorSurface|Carpet/i.test(Type) || IsRugObject(Object)) RemoveGlobalEntry(Chunk, Entry);
  }
}

function RefreshRugs(Chunk) {
  const Current = new Set();
  Chunk.Group?.traverse?.(Object => {
    if (!IsRugObject(Object) || !Object.visible) return;
    const Bounds = new THREE.Box3().setFromObject(Object);
    if (Bounds.isEmpty()) return;
    const Id = `${Chunk.Id}:${Object.uuid}`;
    RugBounds.set(Id, { Chunk, Object, Bounds });
    Current.add(Id);
  });
  for (const [Id, Record] of [...RugBounds]) {
    if (Record.Chunk !== Chunk) continue;
    if (!Current.has(Id) || !Record.Object?.parent) RugBounds.delete(Id);
  }
}

function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group) return;
  RemoveDecorativeWindows(Chunk);
  RemoveRugCollision(Chunk);
  RefreshRugs(Chunk);
  for (const Model of Chunk.Models || []) {
    if (!Model?.parent || !FurnitureNames.has(Model.name)) continue;
    FixDarkMaterials(Model);
    InstallFurnitureCollision(Chunk, Model);
  }
  Chunk.Group.userData.CoreFixR86 = true;
}

function ProcessAll() {
  const Seen = new Set();
  for (const Chunk of Game.ActiveChunks.values()) {
    Seen.add(Chunk);
    ProcessChunk(Chunk);
  }
  for (const Chunk of Game.PreparedChunks.values()) if (!Seen.has(Chunk)) ProcessChunk(Chunk);
}

function PointOnRug(Position) {
  for (const Record of RugBounds.values()) {
    const Bounds = Record.Bounds;
    if (Position.x < Bounds.min.x - 0.02 || Position.x > Bounds.max.x + 0.02) continue;
    if (Position.z < Bounds.min.z - 0.02 || Position.z > Bounds.max.z + 0.02) continue;
    return true;
  }
  return false;
}

function UpdateSurfaceStep() {
  const OnRug = PointOnRug(Game.Camera.position);
  if (OnRug !== WasOnRug) {
    SurfaceStepStartedAt = performance.now();
    SurfaceStepSide *= -1;
    WasOnRug = OnRug;
  }
  requestAnimationFrame(UpdateSurfaceStep);
}

function Bone(Root, Name) {
  return Root?.getObjectByName?.(Name) || null;
}

function ApplyStepPose(Root, Strength, Side) {
  const UpperLegL = Bone(Root, "UpperLeg.L");
  const UpperLegR = Bone(Root, "UpperLeg.R");
  const LowerLegL = Bone(Root, "LowerLeg.L");
  const LowerLegR = Bone(Root, "LowerLeg.R");
  const FootL = Bone(Root, "Foot.L");
  const FootR = Bone(Root, "Foot.R");
  const Hips = Bone(Root, "Hips");
  const LeadUpper = Side < 0 ? UpperLegL : UpperLegR;
  const LeadLower = Side < 0 ? LowerLegL : LowerLegR;
  const LeadFoot = Side < 0 ? FootL : FootR;
  const TrailUpper = Side < 0 ? UpperLegR : UpperLegL;
  if (LeadUpper) LeadUpper.rotation.x -= 0.22 * Strength;
  if (LeadLower) LeadLower.rotation.x += 0.28 * Strength;
  if (LeadFoot) LeadFoot.rotation.x -= 0.13 * Strength;
  if (TrailUpper) TrailUpper.rotation.x += 0.08 * Strength;
  if (Hips) Hips.rotation.z += Side * 0.025 * Strength;
}

const OriginalRender = Game.Renderer.render.bind(Game.Renderer);
Game.Renderer.render = function(Scene, Camera) {
  const Elapsed = performance.now() - SurfaceStepStartedAt;
  if (Elapsed < 230) {
    const Root = Game.Scene.getObjectByName("PlayerCharacterPivot");
    if (Root) {
      const Bones = ["UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R", "Foot.L", "Foot.R", "Hips"]
        .map(Name => Bone(Root, Name)).filter(Boolean);
      const Saved = Bones.map(Item => Item.quaternion.clone());
      const T = THREE.MathUtils.clamp(Elapsed / 230, 0, 1);
      const Strength = Math.sin(T * Math.PI);
      ApplyStepPose(Root, Strength, SurfaceStepSide);
      Root.updateMatrixWorld(true);
      try {
        return OriginalRender(Scene, Camera);
      } finally {
        for (let Index = 0; Index < Bones.length; Index += 1) Bones[Index].quaternion.copy(Saved[Index]);
        Root.updateMatrixWorld(true);
      }
    }
  }
  return OriginalRender(Scene, Camera);
};

ProcessAll();
requestAnimationFrame(UpdateSurfaceStep);
const Interval = setInterval(ProcessAll, 650);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_CORE_FIX_R86__ = { ProcessAll, ProcessChunk };
window.__STORE_CORE_FIX_BUILD__ = "V0.24.0-R86";
