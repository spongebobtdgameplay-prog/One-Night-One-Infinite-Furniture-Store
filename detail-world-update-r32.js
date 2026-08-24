import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.CollisionBoxes || !Game?.ActiveChunks || !Game?.PreparedChunks) {
  throw new Error("Game world must load before the V0.13 detail generator finalizer.");
}

const FurnitureNames = new Set([
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
  "Light_Floor1"
]);

const ArchitectureModels = new Set(["Door_3", "Window_Large1"]);
const RandomPartitionNames = new Set(["ShowroomPartition", "PartitionCap", "PartitionBase"]);
const BrokenSignNames = new Set(["SectionSign", "SignMount"]);
const ProcessedTask = new WeakSet();
const ProcessedChunkHeaders = new WeakSet();
const ClaimedCollisionEntries = new WeakSet();
const TaskTextureCache = new Map();
const DepartmentTextureCache = new Map();

const WALL_INTERIOR_X = 16.70;
const CHUNK_EDGE_GAP = 0.48;
const MODEL_WALL_GAP = 0.10;

const HeaderFrameMaterial = new THREE.MeshStandardMaterial({
  color: 0x3d4140,
  roughness: 0.70,
  metalness: 0.48
});
const HeaderBoardMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8c6a4,
  roughness: 0.90,
  metalness: 0
});
const TerminalMetalMaterial = new THREE.MeshStandardMaterial({
  color: 0x929b99,
  roughness: 0.60,
  metalness: 0.38
});
const TerminalPanelMaterial = new THREE.MeshStandardMaterial({
  color: 0xd6c8aa,
  roughness: 0.88,
  metalness: 0.02
});
const TerminalAccentMaterial = new THREE.MeshStandardMaterial({
  color: 0xd39a3a,
  roughness: 0.68,
  metalness: 0.08
});
const TerminalDarkTrimMaterial = new THREE.MeshStandardMaterial({
  color: 0x454b49,
  roughness: 0.72,
  metalness: 0.35
});

function MakeTextTexture(Width, Height, Draw) {
  const Canvas = document.createElement("canvas");
  Canvas.width = Width;
  Canvas.height = Height;
  const Context = Canvas.getContext("2d");
  Draw(Context, Width, Height);
  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  Texture.anisotropy = 2;
  return Texture;
}

function DepartmentTexture(Theme) {
  const Key = String(Theme || "SHOWROOM").toUpperCase();
  if (DepartmentTextureCache.has(Key)) return DepartmentTextureCache.get(Key);

  const Texture = MakeTextTexture(1024, 256, (Context, Width, Height) => {
    Context.fillStyle = "#e5d7b9";
    Context.fillRect(0, 0, Width, Height);
    Context.fillStyle = "#313635";
    Context.fillRect(0, 0, Width, 42);
    Context.fillRect(0, Height - 20, Width, 20);

    Context.fillStyle = "#262a29";
    Context.textAlign = "center";
    Context.textBaseline = "middle";
    Context.font = "900 94px Arial";
    Context.fillText(Key, Width * 0.5, 132);

    Context.fillStyle = "#77684e";
    Context.font = "800 25px Arial";
    Context.fillText("GREAT OLD GAMES • FURNITURE DEPARTMENT", Width * 0.5, 218);
  });
  DepartmentTextureCache.set(Key, Texture);
  return Texture;
}

function TaskTexture(Task) {
  const Type = String(Task?.Type || "terminal");
  if (TaskTextureCache.has(Type)) return TaskTextureCache.get(Type);

  const Title = Type === "breaker"
    ? "POWER RESET"
    : Type === "manifest"
      ? "STOCK CHECK"
      : Type === "scanner"
        ? "DAMAGE SCAN"
        : "STORE TERMINAL";

  const Texture = MakeTextTexture(768, 192, (Context, Width, Height) => {
    Context.fillStyle = "#e8ddc5";
    Context.fillRect(0, 0, Width, Height);
    Context.fillStyle = "#d39a3a";
    Context.fillRect(0, 0, Width, 36);
    Context.fillStyle = "#303534";
    Context.textAlign = "center";
    Context.textBaseline = "middle";
    Context.font = "900 66px Arial";
    Context.fillText(Title, Width * 0.5, 102);
    Context.fillStyle = "#6c685d";
    Context.font = "800 22px Arial";
    Context.fillText("STAFF EQUIPMENT", Width * 0.5, 158);
  });
  TaskTextureCache.set(Type, Texture);
  return Texture;
}

function RemoveObject(Object) {
  if (!Object?.parent) return;
  Object.parent.remove(Object);
}

function RemoveNamedObjects(Chunk, Names) {
  if (!Chunk?.Group) return;
  const Remove = [];
  Chunk.Group.traverse(Object => {
    if (Names.has(Object.name)) Remove.push(Object);
  });
  for (const Object of Remove) RemoveObject(Object);
}

function RemoveCollisionEntry(Chunk, Entry) {
  const GlobalIndex = Game.CollisionBoxes.indexOf(Entry);
  if (GlobalIndex >= 0) Game.CollisionBoxes.splice(GlobalIndex, 1);
  Entry.Active = false;

  const LocalIndex = Chunk.CollisionEntries.indexOf(Entry);
  if (LocalIndex >= 0) Chunk.CollisionEntries.splice(LocalIndex, 1);
}

function RemoveRandomPartitions(Chunk) {
  RemoveNamedObjects(Chunk, RandomPartitionNames);
  for (const Entry of [...(Chunk.CollisionEntries || [])]) {
    if (/Partition/i.test(String(Entry?.Type || ""))) RemoveCollisionEntry(Chunk, Entry);
  }

  Chunk.StructureBounds = (Chunk.CollisionEntries || [])
    .filter(Entry => /^Wall(?:Left|Right)$/i.test(String(Entry?.Type || "")))
    .map(Entry => {
      const Bounds = Entry.OriginalStructureBox || Entry.OriginalBox || Entry.Box || Entry;
      return Bounds?.clone ? Bounds.clone() : null;
    })
    .filter(Boolean);
}

function RemoveFloorArchitecture(Chunk) {
  const RemovedNames = new Set();
  for (let Index = (Chunk.Models || []).length - 1; Index >= 0; Index -= 1) {
    const Model = Chunk.Models[Index];
    if (!Model || !ArchitectureModels.has(Model.name)) continue;
    RemovedNames.add(Model.name);
    RemoveObject(Model);
    Chunk.Models.splice(Index, 1);
  }

  if (!RemovedNames.size) return;
  for (const Entry of [...(Chunk.CollisionEntries || [])]) {
    if (RemovedNames.has(String(Entry?.Type || ""))) RemoveCollisionEntry(Chunk, Entry);
  }
}

function RemoveBrokenSigns(Chunk) {
  RemoveNamedObjects(Chunk, BrokenSignNames);
}

function AddDepartmentHeader(Chunk) {
  if (!Chunk?.Group || ProcessedChunkHeaders.has(Chunk)) return;
  ProcessedChunkHeaders.add(Chunk);

  const Existing = Chunk.Group.getObjectByName?.("DepartmentHeaderV13");
  if (Existing) return;

  const Group = new THREE.Group();
  Group.name = "DepartmentHeaderV13";
  Group.userData.ChunkId = Chunk.Id;

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(5.20, 1.02, 0.18), HeaderFrameMaterial);
  Frame.name = "DepartmentHeaderFrame";
  const Board = new THREE.Mesh(new THREE.BoxGeometry(5.02, 0.84, 0.22), HeaderBoardMaterial);
  Board.name = "DepartmentHeaderBoard";

  const Texture = DepartmentTexture(Chunk.Theme);
  const LabelMaterial = new THREE.MeshStandardMaterial({
    map: Texture,
    color: 0xffffff,
    roughness: 0.90,
    metalness: 0,
    emissive: 0x21190f,
    emissiveIntensity: 0.04,
    side: THREE.FrontSide
  });

  const Front = new THREE.Mesh(new THREE.PlaneGeometry(4.90, 0.74), LabelMaterial);
  Front.name = "DepartmentHeaderFront";
  Front.position.z = 0.112;

  const Back = new THREE.Mesh(new THREE.PlaneGeometry(4.90, 0.74), LabelMaterial.clone());
  Back.name = "DepartmentHeaderBack";
  Back.position.z = -0.112;
  Back.rotation.y = Math.PI;

  const LeftHanger = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.34, 0.045), HeaderFrameMaterial);
  LeftHanger.position.set(-1.55, 0.66, 0);
  const RightHanger = LeftHanger.clone();
  RightHanger.position.x = 1.55;

  Group.add(Frame, Board, Front, Back, LeftHanger, RightHanger);
  Group.position.set(0, 2.89, Chunk.TopZ - 3.0);
  Chunk.Group.add(Group);
}

function BrightenDeadLights(Chunk) {
  Chunk.Group?.traverse?.(Object => {
    if (Object.name !== "LightGlow" || !Object.isMesh || !Object.material) return;
    if (Object.userData.DetailLightV13) return;
    Object.userData.DetailLightV13 = true;
    Object.material = Object.material.clone();
    if (Object.material.color) Object.material.color.setHex(0xffe8bd);
    if (Object.material.emissive) {
      Object.material.emissive.setHex(0xffd594);
      Object.material.emissiveIntensity = Math.max(0.45, Object.material.emissiveIntensity || 0);
    }
  });
}

function RebuildTaskTerminal(Chunk, Task) {
  const Group = Task?.Object;
  if (!Group?.isObject3D || ProcessedTask.has(Group)) return;
  ProcessedTask.add(Group);

  while (Group.children.length) Group.remove(Group.children[0]);

  const Base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.055, 0.38), TerminalDarkTrimMaterial);
  Base.name = "TaskTerminalBase";
  Base.position.y = 0.028;

  const Post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.66, 0.07), TerminalMetalMaterial);
  Post.name = "TaskTerminalPost";
  Post.position.y = 0.38;

  const Shell = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.50, 0.15), TerminalPanelMaterial);
  Shell.name = "TaskTerminalShell";
  Shell.position.y = 0.78;
  Shell.rotation.x = -0.07;

  const Accent = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.045, 0.025), TerminalAccentMaterial);
  Accent.name = "TaskTerminalAccent";
  Accent.position.set(0, 0.57, 0.087);
  Accent.rotation.x = -0.07;

  const ScreenMaterial = new THREE.MeshStandardMaterial({
    color: 0x82a88c,
    emissive: 0x36563e,
    emissiveIntensity: 0.72,
    roughness: 0.42,
    metalness: 0.03
  });
  const Screen = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.022), ScreenMaterial);
  Screen.name = "TaskTerminalScreen";
  Screen.position.set(0, 0.76, 0.087);
  Screen.rotation.x = -0.07;

  const LabelMaterial = new THREE.MeshStandardMaterial({
    map: TaskTexture(Task),
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    side: THREE.FrontSide
  });
  const Label = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.12), LabelMaterial);
  Label.name = "TaskTerminalLabel";
  Label.position.set(0, 0.96, 0.088);
  Label.rotation.x = -0.07;

  const Scanner = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.17, 0.065), TerminalDarkTrimMaterial);
  Scanner.name = "TaskTerminalHandle";
  Scanner.position.set(0.21, 0.64, 0.075);
  Scanner.rotation.z = -0.08;

  const BeaconMaterial = TerminalAccentMaterial.clone();
  BeaconMaterial.emissive = new THREE.Color(0x8a4a08);
  BeaconMaterial.emissiveIntensity = 0.32;
  const Beacon = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 8), BeaconMaterial);
  Beacon.name = "TaskTerminalBeacon";
  Beacon.position.set(0, 1.07, 0);

  Group.add(Base, Post, Shell, Accent, Screen, Label, Scanner, Beacon);
  Group.userData.DetailTerminalV13 = true;
  Task.Screen = Screen;
}

function UpgradeTaskTerminals(Chunk) {
  for (const Task of Chunk.TaskRecords || []) RebuildTaskTerminal(Chunk, Task);
}

function BoundsCenterXZ(Bounds, Target = new THREE.Vector2()) {
  return Target.set(
    (Bounds.min.x + Bounds.max.x) * 0.5,
    (Bounds.min.z + Bounds.max.z) * 0.5
  );
}

function FindCollisionEntryForModel(Chunk, Model, Bounds) {
  const Existing = Model.userData?.DetailCollisionEntryV13;
  if (Existing && Chunk.CollisionEntries.includes(Existing)) return Existing;

  const Center = BoundsCenterXZ(Bounds);
  let Best = null;
  let BestDistance = Infinity;
  for (const Entry of Chunk.CollisionEntries || []) {
    if (Entry?.Type !== Model.name || ClaimedCollisionEntries.has(Entry)) continue;
    const Box = Entry.OriginalLegacyBox || Entry.OriginalBox || Entry.Box;
    if (!Box?.min || !Box?.max) continue;
    const EntryX = (Box.min.x + Box.max.x) * 0.5;
    const EntryZ = (Box.min.z + Box.max.z) * 0.5;
    const DX = EntryX - Center.x;
    const DZ = EntryZ - Center.y;
    const Distance = DX * DX + DZ * DZ;
    if (Distance < BestDistance) {
      BestDistance = Distance;
      Best = Entry;
    }
  }

  if (Best) {
    ClaimedCollisionEntries.add(Best);
    Model.userData.DetailCollisionEntryV13 = Best;
  }
  return Best;
}

function TranslateBoxOnce(Box, DX, DZ, Seen) {
  if (!Box?.translate || Seen.has(Box)) return;
  Seen.add(Box);
  Box.translate(new THREE.Vector3(DX, 0, DZ));
}

function TranslateCollisionEntry(Entry, DX, DZ) {
  if (!Entry || (!DX && !DZ)) return;
  const Seen = new Set();
  TranslateBoxOnce(Entry.Box, DX, DZ, Seen);
  TranslateBoxOnce(Entry.OriginalBox, DX, DZ, Seen);
  TranslateBoxOnce(Entry.OriginalLegacyBox, DX, DZ, Seen);
  TranslateBoxOnce(Entry.OriginalStructureBox, DX, DZ, Seen);

  if (Array.isArray(Entry.PreciseTriangles)) {
    for (const Triangle of Entry.PreciseTriangles) {
      for (const Point of Triangle || []) {
        if (!Point) continue;
        Point.x += DX;
        Point.y += DZ;
      }
    }
  }

  const GeometryBounds = Entry.GeometryBounds;
  if (GeometryBounds?.min && GeometryBounds?.max) {
    GeometryBounds.min.x += DX;
    GeometryBounds.max.x += DX;
    GeometryBounds.min.y += DZ;
    GeometryBounds.max.y += DZ;
  }
}

function ClampModelAwayFromShell(Chunk, Model) {
  if (!Model?.parent || !FurnitureNames.has(Model.name)) return false;

  Model.updateWorldMatrix(true, true);
  const Bounds = new THREE.Box3().setFromObject(Model);
  if (Bounds.isEmpty()) return false;

  const MinimumX = -WALL_INTERIOR_X + MODEL_WALL_GAP;
  const MaximumX = WALL_INTERIOR_X - MODEL_WALL_GAP;
  const MinimumZ = Chunk.BottomZ + CHUNK_EDGE_GAP;
  const MaximumZ = Chunk.TopZ - CHUNK_EDGE_GAP;

  let DX = 0;
  let DZ = 0;

  if (Bounds.min.x < MinimumX) DX += MinimumX - Bounds.min.x;
  if (Bounds.max.x + DX > MaximumX) DX += MaximumX - (Bounds.max.x + DX);
  if (Bounds.min.z < MinimumZ) DZ += MinimumZ - Bounds.min.z;
  if (Bounds.max.z + DZ > MaximumZ) DZ += MaximumZ - (Bounds.max.z + DZ);

  if (Math.abs(DX) <= 0.00001 && Math.abs(DZ) <= 0.00001) return false;

  const Entry = FindCollisionEntryForModel(Chunk, Model, Bounds);
  Model.position.x += DX;
  Model.position.z += DZ;
  Model.updateWorldMatrix(true, true);
  TranslateCollisionEntry(Entry, DX, DZ);

  Model.userData.GeneratorWallCorrectedV13 = true;
  Model.userData.GeneratorWallCorrection = { x: DX, z: DZ };
  return true;
}

function ValidateModelPlacements(Chunk) {
  for (const Model of Chunk.Models || []) ClampModelAwayFromShell(Chunk, Model);
}

function ProcessChunk(Chunk) {
  if (!Chunk?.Group || Chunk.Cancelled) return;
  RemoveRandomPartitions(Chunk);
  RemoveFloorArchitecture(Chunk);
  RemoveBrokenSigns(Chunk);
  BrightenDeadLights(Chunk);
  UpgradeTaskTerminals(Chunk);
  ValidateModelPlacements(Chunk);
  AddDepartmentHeader(Chunk);
  Chunk.Group.userData.DetailGeneratorV13 = true;
}

function ProcessAllChunks() {
  const Seen = new Set();
  for (const Chunk of Game.ActiveChunks.values()) {
    Seen.add(Chunk);
    ProcessChunk(Chunk);
  }
  for (const Chunk of Game.PreparedChunks.values()) {
    if (Seen.has(Chunk)) continue;
    ProcessChunk(Chunk);
  }
}

const PreviousSceneAdd = THREE.Scene.prototype.add;
THREE.Scene.prototype.add = function(...Objects) {
  for (const Object of Objects) {
    const ChunkId = Object?.userData?.ChunkId;
    if (!ChunkId || !/^Chunk-/.test(String(ChunkId))) continue;
    for (const Chunk of Game.PreparedChunks.values()) {
      if (Chunk?.Id === ChunkId) {
        ProcessChunk(Chunk);
        break;
      }
    }
  }
  return PreviousSceneAdd.apply(this, Objects);
};

ProcessAllChunks();
const Interval = setInterval(ProcessAllChunks, 140);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_DETAIL_GENERATOR__ = {
  ProcessAllChunks,
  ProcessChunk,
  ValidateModelPlacements
};
window.__STORE_DETAIL_GENERATOR_BUILD__ = "V0.13.0";
