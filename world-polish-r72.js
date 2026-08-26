import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.CollisionBoxes || !Game?.ActiveChunks || !Game?.PreparedChunks) {
  throw new Error("Store game must load before world polish.");
}

const ProcessedChunks = new WeakSet();
const ProcessedModels = new WeakSet();
const ProcessedTasks = new WeakSet();
const HeaderTextures = new Map();
const PriceTextures = new Map();
const TaskTextures = new Map();
const DensityQueued = new WeakSet();
const DensityQueue = [];
const TempCenter = new THREE.Vector3();
const TempSize = new THREE.Vector3();
const TempBox = new THREE.Box3();
const ClaimedEntries = new WeakSet();
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
const DensityExcluded = new Set(["Light_Floor1", "Bathroom_Toilet", "Bathroom_Bathtub"]);

const HeaderFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x171a18, roughness: 0.72, metalness: 0.42 });
const HeaderBoardMaterial = new THREE.MeshStandardMaterial({ color: 0x232722, roughness: 0.88, metalness: 0.04 });
const TerminalMetalMaterial = new THREE.MeshStandardMaterial({ color: 0x545b59, roughness: 0.48, metalness: 0.62 });
const TerminalDarkMaterial = new THREE.MeshStandardMaterial({ color: 0x171b1a, roughness: 0.68, metalness: 0.44 });
const TerminalCreamMaterial = new THREE.MeshStandardMaterial({ color: 0xd8cfba, roughness: 0.86, metalness: 0.02 });
const TerminalAmberMaterial = new THREE.MeshStandardMaterial({ color: 0xc98a2f, emissive: 0x4e2705, emissiveIntensity: 0.34, roughness: 0.62 });
const PriceFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x292a26, roughness: 0.78, metalness: 0.28 });
const PriceBoardMaterial = new THREE.MeshStandardMaterial({ color: 0xd9cfb9, roughness: 0.9, metalness: 0 });

function MakeCanvasTexture(Width, Height, Draw) {
  const Canvas = document.createElement("canvas");
  Canvas.width = Width;
  Canvas.height = Height;
  const Context = Canvas.getContext("2d");
  Draw(Context, Width, Height);
  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  Texture.generateMipmaps = true;
  Texture.minFilter = THREE.LinearMipmapLinearFilter;
  Texture.magFilter = THREE.LinearFilter;
  Texture.anisotropy = Math.max(4, Game.Renderer.capabilities.getMaxAnisotropy());
  Texture.needsUpdate = true;
  return Texture;
}

function HeaderTexture(Theme) {
  const Key = String(Theme || "SHOWROOM").trim().toUpperCase() || "SHOWROOM";
  if (HeaderTextures.has(Key)) return HeaderTextures.get(Key);
  const Texture = MakeCanvasTexture(1536, 256, (Context, Width, Height) => {
    Context.fillStyle = "#20241f";
    Context.fillRect(0, 0, Width, Height);
    Context.strokeStyle = "#d9c69e";
    Context.lineWidth = 12;
    Context.strokeRect(12, 12, Width - 24, Height - 24);
    Context.strokeStyle = "#74684f";
    Context.lineWidth = 3;
    Context.strokeRect(31, 31, Width - 62, Height - 62);
    Context.fillStyle = "#efe3c6";
    Context.textAlign = "center";
    Context.textBaseline = "middle";
    let Size = 122;
    while (Size > 72) {
      Context.font = `900 ${Size}px Arial`;
      if (Context.measureText(Key).width <= Width - 170) break;
      Size -= 4;
    }
    Context.fillText(Key, Width * 0.5, Height * 0.53);
  });
  HeaderTextures.set(Key, Texture);
  return Texture;
}

function FriendlyName(Name) {
  return String(Name || "ITEM").replaceAll("_", " ").replace(/\d+/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function PriceTexture(ModelName) {
  const Key = FriendlyName(ModelName);
  if (PriceTextures.has(Key)) return PriceTextures.get(Key);
  const Texture = MakeCanvasTexture(768, 512, (Context, Width, Height) => {
    Context.fillStyle = "#e8dcc0";
    Context.fillRect(0, 0, Width, Height);
    Context.fillStyle = "#8e2d22";
    Context.fillRect(0, 0, Width, 92);
    Context.fillStyle = "#fff4df";
    Context.font = "900 47px Arial";
    Context.textAlign = "center";
    Context.textBaseline = "middle";
    Context.fillText("STORE DISPLAY", Width * 0.5, 47);
    Context.fillStyle = "#20231f";
    let Size = 58;
    while (Size > 34) {
      Context.font = `900 ${Size}px Arial`;
      if (Context.measureText(Key).width <= Width - 90) break;
      Size -= 2;
    }
    Context.fillText(Key, Width * 0.5, 205);
    Context.fillStyle = "#655b49";
    Context.font = "800 30px Arial";
    Context.fillText("DISPLAY MODEL", Width * 0.5, 292);
    Context.fillStyle = "#263a2a";
    Context.fillRect(86, 354, Width - 172, 84);
    Context.fillStyle = "#eef1e5";
    Context.font = "900 34px Arial";
    Context.fillText("SEE AISLE TAG", Width * 0.5, 396);
  });
  PriceTextures.set(Key, Texture);
  return Texture;
}

function TaskTexture(Type) {
  const Key = String(Type || "terminal");
  if (TaskTextures.has(Key)) return TaskTextures.get(Key);
  const Title = Key === "breaker" ? "BREAKER RESET" : Key === "manifest" ? "STOCK MANIFEST" : Key === "scanner" ? "DAMAGE SCANNER" : "STORE TERMINAL";
  const Code = Key === "breaker" ? "POWER CONTROL" : Key === "manifest" ? "INVENTORY CONTROL" : Key === "scanner" ? "INSPECTION UNIT" : "STAFF EQUIPMENT";
  const Texture = MakeCanvasTexture(1024, 512, (Context, Width, Height) => {
    Context.fillStyle = "#dcd2bc";
    Context.fillRect(0, 0, Width, Height);
    Context.fillStyle = "#232724";
    Context.fillRect(0, 0, Width, 102);
    Context.fillStyle = "#e8d5a7";
    Context.font = "900 55px Arial";
    Context.textAlign = "center";
    Context.textBaseline = "middle";
    Context.fillText(Title, Width * 0.5, 53);
    Context.fillStyle = "#404640";
    Context.font = "900 34px Arial";
    Context.fillText(Code, Width * 0.5, 166);
    Context.fillStyle = "#667167";
    Context.fillRect(108, 224, Width - 216, 126);
    Context.fillStyle = "#bce6bd";
    Context.fillRect(126, 242, Width - 252, 90);
    Context.fillStyle = "#253228";
    Context.font = "900 34px Arial";
    Context.fillText("READY", Width * 0.5, 288);
    Context.fillStyle = "#6e624e";
    Context.font = "800 25px Arial";
    Context.fillText("AUTHORIZED STAFF ONLY", Width * 0.5, 417);
  });
  TaskTextures.set(Key, Texture);
  return Texture;
}

function RemoveNamed(Chunk, Names) {
  const Remove = [];
  Chunk.Group?.traverse?.(Object => {
    if (Names.has(String(Object?.name || ""))) Remove.push(Object);
  });
  for (const Object of Remove) Object.parent?.remove(Object);
}

function FindChunkByIndex(Index) {
  return Game.ActiveChunks.get(Index) || Game.PreparedChunks.get(Index) || null;
}

function CreateDepartmentHeader(Chunk) {
  if (Chunk.Group.getObjectByName?.("DepartmentHeaderR72")) return;
  RemoveNamed(Chunk, new Set(["SectionSign", "SignMount", "DepartmentHeaderV13"]));

  const Group = new THREE.Group();
  Group.name = "DepartmentHeaderR72";
  Group.userData.ChunkId = Chunk.Id;

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(6.35, 0.92, 0.18), HeaderFrameMaterial);
  Frame.name = "DepartmentHeaderFrameR72";
  const Board = new THREE.Mesh(new THREE.BoxGeometry(6.12, 0.72, 0.21), HeaderBoardMaterial);
  Board.name = "DepartmentHeaderBoardR72";

  const FaceMaterial = new THREE.MeshBasicMaterial({ map: HeaderTexture(Chunk.Theme), side: THREE.FrontSide, toneMapped: false });
  const Front = new THREE.Mesh(new THREE.PlaneGeometry(5.94, 0.60), FaceMaterial);
  Front.position.z = 0.108;
  const Back = new THREE.Mesh(new THREE.PlaneGeometry(5.94, 0.60), FaceMaterial.clone());
  Back.position.z = -0.108;
  Back.rotation.y = Math.PI;

  const HangerLeft = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.46, 0.045), HeaderFrameMaterial);
  HangerLeft.position.set(-2.02, 0.68, 0);
  const HangerRight = HangerLeft.clone();
  HangerRight.position.x = 2.02;

  Group.add(Frame, Board, Front, Back, HangerLeft, HangerRight);
  Group.position.set(0, 2.94, Chunk.TopZ - 2.65);
  Chunk.Group.add(Group);
}

function UpdateHeaderVisibility() {
  for (const Chunk of Game.ActiveChunks.values()) {
    const Header = Chunk.Group?.getObjectByName?.("DepartmentHeaderR72");
    if (!Header) continue;
    const Previous = FindChunkByIndex(Chunk.Index - 1);
    Header.visible = !Previous || Previous.Theme !== Chunk.Theme;
  }
}

function BrightenLightsOnce(Chunk) {
  Chunk.Group?.traverse?.(Object => {
    if (Object.name !== "LightGlow" || !Object.isMesh || ProcessedModels.has(Object)) return;
    ProcessedModels.add(Object);
    if (!Object.material) return;
    Object.material = Object.material.clone();
    if (Object.material.color) Object.material.color.setHex(0xffe7bc);
    if (Object.material.emissive) {
      Object.material.emissive.setHex(0xffd38e);
      Object.material.emissiveIntensity = Math.max(0.42, Object.material.emissiveIntensity || 0);
    }
  });
}

function BoundsOverlapXZ(A, B, Padding = 0.08) {
  return A.max.x > B.min.x - Padding && A.min.x < B.max.x + Padding && A.max.z > B.min.z - Padding && A.min.z < B.max.z + Padding;
}

function ModelBounds(Model) {
  Model.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Model);
}

function ResolveModelOverlaps(Chunk) {
  for (const Model of Chunk.Models || []) {
    if (!Model?.parent || !FurnitureNames.has(Model.name)) continue;
    Model.userData.WorldPolishPlacementR72 = true;
    Model.userData.LayoutAuthority = Model.userData.LayoutAuthority || Chunk.Layout?.Authority;
  }
}

function EnsureCollisionEntry(Chunk, Type, Bounds, Height = 1.5) {
  const Center = Bounds.getCenter(new THREE.Vector3());
  const Size = Bounds.getSize(new THREE.Vector3());
  const Box = new THREE.Box3(
    new THREE.Vector3(Center.x - Math.max(0.10, Size.x * 0.46), 0, Center.z - Math.max(0.10, Size.z * 0.46)),
    new THREE.Vector3(Center.x + Math.max(0.10, Size.x * 0.46), Height, Center.z + Math.max(0.10, Size.z * 0.46))
  );
  const Entry = { Box, OriginalBox: Box.clone(), OriginalLegacyBox: Box.clone(), ChunkId: Chunk.Id, Type, Active: Boolean(Chunk.Active), WorldPolishR72: true };
  Chunk.CollisionEntries.push(Entry);
  if (Chunk.Active && !Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
  return Entry;
}

function RebuildTaskTerminal(Chunk, Task) {
  const Group = Task?.Object;
  if (!Group?.isObject3D || ProcessedTasks.has(Group)) return;
  ProcessedTasks.add(Group);

  while (Group.children.length) Group.remove(Group.children[0]);

  const Foot = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.42), TerminalDarkMaterial);
  Foot.position.y = 0.035;
  const Post = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.72, 0.075), TerminalMetalMaterial);
  Post.position.y = 0.41;
  const Neck = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.11, 0.12), TerminalMetalMaterial);
  Neck.position.set(0, 0.76, -0.02);
  Neck.rotation.x = -0.16;
  const Console = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.50, 0.18), TerminalCreamMaterial);
  Console.position.set(0, 1.00, 0);
  Console.rotation.x = -0.16;
  const TrimTop = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.055, 0.20), TerminalDarkMaterial);
  TrimTop.position.set(0, 1.25, -0.035);
  TrimTop.rotation.x = -0.16;
  const Accent = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.025), TerminalAmberMaterial);
  Accent.position.set(0, 0.80, 0.115);
  Accent.rotation.x = -0.16;

  const ScreenMaterial = new THREE.MeshStandardMaterial({ color: 0x8fc99a, emissive: 0x366f44, emissiveIntensity: 0.95, roughness: 0.32, metalness: 0.02 });
  const Screen = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.18, 0.024), ScreenMaterial);
  Screen.position.set(0, 1.00, 0.115);
  Screen.rotation.x = -0.16;

  const LabelMaterial = new THREE.MeshBasicMaterial({ map: TaskTexture(Task.Type), side: THREE.FrontSide, toneMapped: false });
  const Label = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), LabelMaterial);
  Label.position.set(0, 1.11, 0.118);
  Label.rotation.x = -0.16;

  const Handle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.055), TerminalDarkMaterial);
  Handle.position.set(0.27, 0.88, 0.11);
  Handle.rotation.z = -0.08;
  const Beacon = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 10), TerminalAmberMaterial);
  Beacon.position.set(0, 1.36, -0.02);

  Group.add(Foot, Post, Neck, Console, TrimTop, Accent, Screen, Label, Handle, Beacon);
  Group.userData.WorldPolishTerminalR72 = true;
  Task.Screen = Screen;

  Group.updateWorldMatrix(true, true);
  const Bounds = new THREE.Box3().setFromObject(Group);
  EnsureCollisionEntry(Chunk, "StoreTaskTerminalR72", Bounds, 1.45);
}

function RestoreToiletCollision(Chunk) {
  const Toilets = (Chunk.Models || []).filter(Model => Model?.parent && Model.name === "Bathroom_Toilet");
  const Entries = (Chunk.CollisionEntries || []).filter(Entry => Entry?.Type === "Bathroom_Toilet");
  const Used = new Set();

  for (const Toilet of Toilets) {
    const Bounds = ModelBounds(Toilet);
    if (Bounds.isEmpty()) continue;
    const Center = Bounds.getCenter(new THREE.Vector3());
    let Best = null;
    let BestDistance = Infinity;
    for (const Entry of Entries) {
      if (Used.has(Entry)) continue;
      const Box = Entry.OriginalLegacyBox || Entry.OriginalBox || Entry.Box;
      if (!Box?.min || !Box?.max) continue;
      const DX = (Box.min.x + Box.max.x) * 0.5 - Center.x;
      const DZ = (Box.min.z + Box.max.z) * 0.5 - Center.z;
      const Distance = DX * DX + DZ * DZ;
      if (Distance < BestDistance) {
        BestDistance = Distance;
        Best = Entry;
      }
    }
    if (!Best) {
      Best = EnsureCollisionEntry(Chunk, "Bathroom_Toilet", Bounds, Math.max(1.0, Bounds.max.y));
      Entries.push(Best);
    }
    Used.add(Best);
    const Size = Bounds.getSize(new THREE.Vector3());
    const Box = new THREE.Box3(
      new THREE.Vector3(Center.x - Math.max(0.24, Size.x * 0.47), 0, Center.z - Math.max(0.28, Size.z * 0.47)),
      new THREE.Vector3(Center.x + Math.max(0.24, Size.x * 0.47), Math.max(1.0, Bounds.max.y), Center.z + Math.max(0.28, Size.z * 0.47))
    );
    Best.Box = Box;
    Best.OriginalBox = Box.clone();
    Best.OriginalLegacyBox = Box.clone();
    Best.PreciseGeometry = false;
    Best.PreciseTriangles = null;
    Best.GeometryBounds = null;
    Best.LegacyCollisionDisabled = false;
    Best.RedundantPreciseSibling = false;
    Best.TestPlayerCollision = null;
    Best.TestCollision = null;
    Best.Active = Boolean(Chunk.Active);
    if (Chunk.Active && !Game.CollisionBoxes.includes(Best)) Game.CollisionBoxes.push(Best);
  }
}

function ProcessChunk(Chunk) {
  if (!Chunk?.Group || Chunk.Cancelled || !Chunk.Ready || ProcessedChunks.has(Chunk)) return;
  ProcessedChunks.add(Chunk);
  RemoveNamed(Chunk, new Set(["SectionSign", "SignMount", "DepartmentHeaderV13", "FurniturePriceSign"]));
  BrightenLightsOnce(Chunk);
  ResolveModelOverlaps(Chunk);
  RestoreToiletCollision(Chunk);
  for (const Task of Chunk.TaskRecords || []) RebuildTaskTerminal(Chunk, Task);
  CreateDepartmentHeader(Chunk);
  Chunk.Group.userData.WorldPolishR72 = true;
}

const DiscoveryQueue = [];
const DiscoverySet = new WeakSet();
let DiscoveryRunning = false;

function DiscoverChunks() {
  for (const Chunk of Game.ActiveChunks.values()) {
    if (!Chunk?.Ready || ProcessedChunks.has(Chunk) || DiscoverySet.has(Chunk)) continue;
    DiscoverySet.add(Chunk);
    DiscoveryQueue.push(Chunk);
  }
  for (const Chunk of Game.PreparedChunks.values()) {
    if (!Chunk?.Ready || ProcessedChunks.has(Chunk) || DiscoverySet.has(Chunk)) continue;
    DiscoverySet.add(Chunk);
    DiscoveryQueue.push(Chunk);
  }
  PumpDiscovery();
  UpdateHeaderVisibility();
}

function PumpDiscovery() {
  if (DiscoveryRunning || !DiscoveryQueue.length) return;
  DiscoveryRunning = true;
  const Run = () => {
    const Chunk = DiscoveryQueue.shift();
    if (Chunk) ProcessChunk(Chunk);
    DiscoveryRunning = false;
    if (DiscoveryQueue.length) setTimeout(PumpDiscovery, 28);
  };
  if ("requestIdleCallback" in window) requestIdleCallback(Run, { timeout: 350 });
  else setTimeout(Run, 24);
}

DiscoverChunks();
const Interval = setInterval(DiscoverChunks, 420);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_WORLD_POLISH_R72__ = { DiscoverChunks, ProcessChunk };
window.__STORE_WORLD_POLISH_BUILD__ = "V0.27.0";
