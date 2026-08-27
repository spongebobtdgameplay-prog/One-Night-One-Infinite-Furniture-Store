import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { CreateChunkLayout } from "./store-layout.js?v=20260827-158";

const Canvas = document.getElementById("GameCanvas");
const StartButton = document.getElementById("StartButton");
const BootScreen = document.getElementById("BootScreen");
const BootStatus = document.getElementById("BootStatus");
const Hud = document.getElementById("Hud");
const ErrorPanel = document.getElementById("ErrorPanel");
const ErrorText = document.getElementById("ErrorText");
const GameClock = document.getElementById("GameClock");
const ObjectiveText = document.getElementById("ObjectiveText");
const InteractPrompt = document.getElementById("InteractPrompt");
const TaskCounter = document.getElementById("TaskCounter");
const AisleCounter = document.getElementById("AisleCounter");

const Scene = new THREE.Scene();
Scene.background = new THREE.Color(0x141613);
Scene.fog = new THREE.FogExp2(0x141613, 0.0069);

const PlayerEyeHeight = 1.68;
const Camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 180);
Camera.position.set(0, PlayerEyeHeight, 8);

const Renderer = new THREE.WebGLRenderer({
  canvas: Canvas,
  antialias: false,
  powerPreference: "high-performance"
});
Renderer.setPixelRatio(Math.min(devicePixelRatio, 1.15));
Renderer.setSize(innerWidth, innerHeight, false);
Renderer.shadowMap.enabled = false;
Renderer.outputColorSpace = THREE.SRGBColorSpace;
Renderer.toneMapping = THREE.ACESFilmicToneMapping;
Renderer.toneMappingExposure = 1.15;

const Controls = new PointerLockControls(Camera, document.body);
const Loader = new GLTFLoader();
const GameTimer = new THREE.Clock();
const KeyState = new Set();
const CollisionBoxes = [];
const ModelCache = new Map();
const RugModelCache = new Map();
const KayKitFurnitureBase = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/";
const RugModelFiles = ["rug_rectangle_A.gltf", "rug_rectangle_stripes_B.gltf", "rug_oval_A.gltf", "rug_rectangle_B.gltf"];
const ActiveChunks = new Map();
const PreparedChunks = new Map();
const PreparingChunks = new Map();
const Tasks = new Map();
const PlayerApi = window.__STORE_PLAYER__ || null;

window.__STORE_COLLISION_BOXES__ = CollisionBoxes;

const STORE_HALF_WIDTH = 17;
const CEILING_HEIGHT = 3.72;
const CHUNK_LENGTH = 30;
const FIRST_CHUNK_TOP_Z = 10;
const CHUNKS_AHEAD = 2;
const CHUNKS_BEHIND = 1;
const PREFETCH_CHUNKS = 1;
const STREAM_PROMOTION_DISTANCE = 10;
const TASK_DISTANCE = 1.85;
const PLACEMENT_CLEARANCE = 0.10;
const RESERVED_CLEARANCE = 0.035;
const STORE_TIME_RATE = 14;
const DAY_SECONDS = 24 * 60 * 60;
function InitialSeedValue(Value) {
  if (Value === undefined || Value === null || Value === "") return 0;
  const NumberValue = Number(Value);
  if (!Number.isFinite(NumberValue)) return 0;
  return Math.trunc(NumberValue) >>> 0;
}

function GenerateClientWorldSeed() {
  const Values = new Uint32Array(1);
  crypto.getRandomValues(Values);
  return Values[0] || 1;
}

function ResolveInitialWorldSeed() {
  const ExplicitWorldSeed = InitialSeedValue(window.__STORE_WORLD_SEED__);
  if (ExplicitWorldSeed) return ExplicitWorldSeed;

  let SinglePlayerSeed = InitialSeedValue(window.__STORE_SINGLEPLAYER_WORLD_SEED__);
  if (!SinglePlayerSeed) {
    SinglePlayerSeed = GenerateClientWorldSeed();
    window.__STORE_SINGLEPLAYER_WORLD_SEED__ = SinglePlayerSeed;
  }
  window.__STORE_WORLD_SEED__ = SinglePlayerSeed;
  return SinglePlayerSeed;
}

let WorldSeed = ResolveInitialWorldSeed();

let StoreSeconds = 23 * 60 * 60 + 57 * 60;
let Started = false;
let LoadedDisplays = 0;
let CompletedTasks = 0;
let CurrentTask = null;
let LastChunkIndex = 0;
let LastObjectiveText = "";
let SeedResetFlight = null;

function MixSeed32(Value) {
  let Mixed = Value >>> 0;
  Mixed ^= Mixed >>> 16;
  Mixed = Math.imul(Mixed, 0x7feb352d);
  Mixed ^= Mixed >>> 15;
  Mixed = Math.imul(Mixed, 0x846ca68b);
  Mixed ^= Mixed >>> 16;
  return Mixed >>> 0;
}

function SeededRandom(Seed) {
  const Quantized = Math.trunc(Number(Seed) * 1000) >>> 0;
  return MixSeed32(Quantized) / 4294967296;
}

function ChunkSeed(Index) {
  const Coordinate = Math.imul((Index + 1) | 0, 0x9e3779b1);
  return MixSeed32((WorldSeed ^ Coordinate) >>> 0);
}

function RandomRange(Seed, Min, Max) {
  return Min + SeededRandom(Seed) * (Max - Min);
}

function ChunkCenterZ(Index) {
  return FIRST_CHUNK_TOP_Z - CHUNK_LENGTH * (Index + 0.5);
}

function ChunkTopZ(Index) {
  return FIRST_CHUNK_TOP_Z - CHUNK_LENGTH * Index;
}

function ChunkBottomZ(Index) {
  return FIRST_CHUNK_TOP_Z - CHUNK_LENGTH * (Index + 1);
}

function ChunkIndexForZ(Z) {
  return Math.floor((FIRST_CHUNK_TOP_Z - Z) / CHUNK_LENGTH);
}

function CreateTexture(Size, RepeatX, RepeatY, Draw) {
  const TextureCanvas = document.createElement("canvas");
  TextureCanvas.width = Size;
  TextureCanvas.height = Size;
  const Context = TextureCanvas.getContext("2d", { alpha: false });
  Draw(Context, Size);
  const Texture = new THREE.CanvasTexture(TextureCanvas);
  Texture.wrapS = THREE.RepeatWrapping;
  Texture.wrapT = THREE.RepeatWrapping;
  Texture.repeat.set(RepeatX, RepeatY);
  Texture.colorSpace = THREE.SRGBColorSpace;
  Texture.anisotropy = Math.min(4, Renderer.capabilities.getMaxAnisotropy());
  return Texture;
}

function CreateSurfaceTexture(BaseColor, AccentColor, Pattern) {
  return CreateTexture(192, 3, 3, (Context, Size) => {
    Context.fillStyle = BaseColor;
    Context.fillRect(0, 0, Size, Size);
    if (Pattern === "fabric") {
      Context.strokeStyle = AccentColor;
      Context.globalAlpha = 0.16;
      for (let Axis = 0; Axis < Size; Axis += 4) {
        Context.beginPath();
        Context.moveTo(Axis, 0);
        Context.lineTo(Axis, Size);
        Context.stroke();
        Context.beginPath();
        Context.moveTo(0, Axis);
        Context.lineTo(Size, Axis);
        Context.stroke();
      }
      Context.globalAlpha = 1;
    } else if (Pattern === "wood") {
      for (let Line = 0; Line < 44; Line += 1) {
        const Y = SeededRandom(Line * 7 + 2) * Size;
        Context.strokeStyle = AccentColor;
        Context.globalAlpha = 0.08 + SeededRandom(Line * 7 + 4) * 0.13;
        Context.lineWidth = 1 + SeededRandom(Line * 7 + 3) * 2.2;
        Context.beginPath();
        Context.moveTo(0, Y);
        Context.bezierCurveTo(Size * 0.25, Y + 8, Size * 0.72, Y - 7, Size, Y + 3);
        Context.stroke();
      }
      Context.globalAlpha = 1;
    } else if (Pattern === "metal") {
      Context.globalAlpha = 0.13;
      for (let Line = 0; Line < 120; Line += 1) {
        const Y = SeededRandom(Line * 11 + 5) * Size;
        Context.fillStyle = AccentColor;
        Context.fillRect(0, Y, Size, SeededRandom(Line * 11 + 6) > 0.7 ? 2 : 1);
      }
      Context.globalAlpha = 1;
    } else if (Pattern === "ceramic") {
      for (let Dot = 0; Dot < 320; Dot += 1) {
        const X = SeededRandom(Dot * 5 + 20) * Size;
        const Y = SeededRandom(Dot * 5 + 21) * Size;
        Context.fillStyle = AccentColor;
        Context.globalAlpha = 0.025 + SeededRandom(Dot * 5 + 22) * 0.05;
        Context.fillRect(X, Y, 1, 1);
      }
      Context.globalAlpha = 1;
    }
  });
}

const WallTexture = CreateTexture(256, 4.5, 4.5, (Context, Size) => {
  Context.fillStyle = "#807e76";
  Context.fillRect(0, 0, Size, Size);
  for (let Index = 0; Index < 900; Index += 1) {
    const X = SeededRandom(Index * 3 + 1) * Size;
    const Y = SeededRandom(Index * 3 + 2) * Size;
    const Shade = 86 + Math.floor(SeededRandom(Index * 3 + 3) * 58);
    Context.fillStyle = `rgba(${Shade},${Shade},${Math.max(0, Shade - 5)},0.08)`;
    Context.fillRect(X, Y, 1.2, 1.2);
  }
  const Grime = Context.createLinearGradient(0, 0, 0, Size);
  Grime.addColorStop(0, "rgba(255,255,255,0.025)");
  Grime.addColorStop(0.73, "rgba(40,34,28,0.02)");
  Grime.addColorStop(1, "rgba(28,22,18,0.12)");
  Context.fillStyle = Grime;
  Context.fillRect(0, 0, Size, Size);
});

const FloorTexture = CreateTexture(256, 7.5, 7.5, (Context, Size) => {
  Context.fillStyle = "#5d584f";
  Context.fillRect(0, 0, Size, Size);
  for (let Index = 0; Index < 950; Index += 1) {
    const X = SeededRandom(Index * 4 + 11) * Size;
    const Y = SeededRandom(Index * 4 + 12) * Size;
    const Bright = 54 + Math.floor(SeededRandom(Index * 4 + 13) * 48);
    Context.fillStyle = `rgba(${Bright},${Math.max(0, Bright - 3)},${Math.max(0, Bright - 8)},0.10)`;
    Context.fillRect(X, Y, 1.3, 1.3);
  }
  Context.strokeStyle = "rgba(29,27,24,0.48)";
  Context.lineWidth = 2;
  for (let Axis = 0; Axis <= Size; Axis += 64) {
    Context.beginPath();
    Context.moveTo(Axis, 0);
    Context.lineTo(Axis, Size);
    Context.stroke();
    Context.beginPath();
    Context.moveTo(0, Axis);
    Context.lineTo(Size, Axis);
    Context.stroke();
  }
});

const CeilingTexture = CreateTexture(256, 8, 8, (Context, Size) => {
  Context.fillStyle = "#7f7f7a";
  Context.fillRect(0, 0, Size, Size);
  Context.strokeStyle = "rgba(43,44,42,0.58)";
  Context.lineWidth = 3;
  for (let Axis = 0; Axis <= Size; Axis += 64) {
    Context.beginPath();
    Context.moveTo(Axis, 0);
    Context.lineTo(Axis, Size);
    Context.stroke();
    Context.beginPath();
    Context.moveTo(0, Axis);
    Context.lineTo(Size, Axis);
    Context.stroke();
  }
});

const FabricRustTexture = CreateSurfaceTexture("#713c31", "#d89d7d", "fabric");
const FabricGreenTexture = CreateSurfaceTexture("#34483c", "#91aa8a", "fabric");
const FabricBlueTexture = CreateSurfaceTexture("#394956", "#96a9b7", "fabric");
const FabricGoldTexture = CreateSurfaceTexture("#765b32", "#d0ad69", "fabric");
const OakTexture = CreateSurfaceTexture("#765437", "#d7a26d", "wood");
const DarkWoodTexture = CreateSurfaceTexture("#34271f", "#9d7251", "wood");
const PaintedGreenTexture = CreateSurfaceTexture("#43544b", "#a2b3a7", "wood");
const SteelTexture = CreateSurfaceTexture("#6d7374", "#d8dddc", "metal");
const DarkSteelTexture = CreateSurfaceTexture("#282d30", "#8d999d", "metal");
const CeramicTexture = CreateSurfaceTexture("#d5d0c3", "#857f74", "ceramic");

function Pbr(Map, Color, Roughness, Metalness = 0) {
  return new THREE.MeshStandardMaterial({ map: Map, color: Color, roughness: Roughness, metalness: Metalness });
}

const WallMaterial = Pbr(WallTexture, 0xc1beb4, 0.94, 0.01);
const FloorMaterial = Pbr(FloorTexture, 0x9b9185, 0.97, 0.01);
const CeilingMaterial = Pbr(CeilingTexture, 0xb4b2aa, 0.98, 0);
const TrimMaterial = new THREE.MeshStandardMaterial({ color: 0x2f2c28, roughness: 0.82, metalness: 0.16 });
const LightHousingMaterial = new THREE.MeshStandardMaterial({ color: 0x242628, roughness: 0.68, metalness: 0.62 });
const PanelGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffe8bd });
const TaskMetalMaterial = new THREE.MeshStandardMaterial({ color: 0x323a3b, roughness: 0.55, metalness: 0.72 });
const TaskGlowMaterial = new THREE.MeshStandardMaterial({ color: 0x5a6a51, emissive: 0x7bc76f, emissiveIntensity: 1.2, roughness: 0.5 });

const MaterialPalettes = {
  Couch_Large1: [Pbr(FabricRustTexture, 0xffc5ae, 0.92), Pbr(DarkWoodTexture, 0x80614f, 0.82)],
  Couch_L: [Pbr(FabricGreenTexture, 0xc3d0c3, 0.94), Pbr(DarkWoodTexture, 0x705446, 0.84)],
  Chair_2: [Pbr(FabricGoldTexture, 0xe0c18a, 0.93), Pbr(DarkWoodTexture, 0x7a5c45, 0.84)],
  Table_RoundLarge: [Pbr(OakTexture, 0xe0bb91, 0.80)],
  Bed_King: [Pbr(FabricBlueTexture, 0xd6e0e5, 0.96), Pbr(DarkWoodTexture, 0x80624d, 0.84)],
  Bed_Single: [Pbr(FabricGoldTexture, 0xe1cfad, 0.96), Pbr(OakTexture, 0xc89d70, 0.84)],
  NightStand_2: [Pbr(OakTexture, 0xd0a275, 0.83)],
  Shelf_Large: [Pbr(DarkWoodTexture, 0x7b604f, 0.84)],
  Bookshelf: [Pbr(OakTexture, 0xcaa06f, 0.84)],
  Kitchen_Cabinet1: [Pbr(PaintedGreenTexture, 0xa9b7ae, 0.78)],
  Kitchen_Fridge: [Pbr(SteelTexture, 0xe7e6dd, 0.45, 0.45)],
  Kitchen_Oven: [Pbr(DarkSteelTexture, 0x9da4a6, 0.48, 0.62)],
  Kitchen_Sink: [Pbr(SteelTexture, 0xd7dcda, 0.38, 0.72)],
  Bathroom_Bathtub: [Pbr(CeramicTexture, 0xf1ede3, 0.34)],
  Bathroom_Toilet: [Pbr(CeramicTexture, 0xf2eee5, 0.30)],
  Light_Floor1: [Pbr(DarkSteelTexture, 0x777f82, 0.48, 0.64), Pbr(FabricGoldTexture, 0xf2d49c, 0.88)],
  Door_3: [Pbr(DarkWoodTexture, 0x9d7559, 0.80)],
  Window_Large1: [Pbr(DarkSteelTexture, 0x7f898c, 0.46, 0.65)]
};

const ModelDefinitions = {
  Couch_Large1: { Url: "Models/LivingRoom/GLB/Couch_Large1.glb", Axis: "x", Target: 2.45 },
  Couch_L: { Url: "Models/LivingRoom/GLB/Couch_L.glb", Axis: "x", Target: 2.80 },
  Chair_2: { Url: "Models/LivingRoom/GLB/Chair_2.glb", Axis: "y", Target: 1.00 },
  Table_RoundLarge: { Url: "Models/LivingRoom/GLB/Table_RoundLarge.glb", Axis: "x", Target: 1.55 },
  Bed_King: { Url: "Models/Bedroom/GLB/Bed_King.glb", Axis: "z", Target: 2.08 },
  Bed_Single: { Url: "Models/Bedroom/GLB/Bed_Single.glb", Axis: "z", Target: 2.02 },
  NightStand_2: { Url: "Models/Bedroom/GLB/NightStand_2.glb", Axis: "y", Target: 0.58 },
  Shelf_Large: { Url: "Models/Storage/GLB/Shelf_Large.glb", Axis: "y", Target: 2.12 },
  Bookshelf: { Url: "Models/Storage/GLB/Bookshelf.glb", Axis: "y", Target: 2.08 },
  Kitchen_Cabinet1: { Url: "Models/Kitchen/GLB/Kitchen_Cabinet1.glb", Axis: "y", Target: 0.91 },
  Kitchen_Fridge: { Url: "Models/Kitchen/GLB/Kitchen_Fridge.glb", Axis: "y", Target: 1.86 },
  Kitchen_Oven: { Url: "Models/Kitchen/GLB/Kitchen_Oven.glb", Axis: "y", Target: 0.91 },
  Kitchen_Sink: { Url: "Models/Kitchen/GLB/Kitchen_Sink.glb", Axis: "y", Target: 0.95 },
  Bathroom_Bathtub: { Url: "Models/Bathroom/GLB/Bathroom_Bathtub.glb", Axis: "z", Target: 1.82 },
  Bathroom_Toilet: { Url: "Models/Bathroom/GLB/Bathroom_Toilet.glb", Axis: "y", Target: 0.82 },
  Light_Floor1: { Url: "Models/Lighting/GLB/Light_Floor1.glb", Axis: "y", Target: 1.58 },
  Door_3: { Url: "Models/Architecture/GLB/Door_3.glb", Axis: "y", Target: 2.06 },
  Window_Large1: { Url: "Models/Architecture/GLB/Window_Large1.glb", Axis: "y", Target: 1.38 }
};

const CollisionProfiles = {
  Couch_Large1: [2.25, 0.90], Couch_L: [2.45, 1.65], Chair_2: [0.78, 0.76], Table_RoundLarge: [1.38, 1.38],
  Bed_King: [1.90, 2.02], Bed_Single: [1.02, 1.96], NightStand_2: [0.52, 0.48], Shelf_Large: [1.75, 0.50],
  Bookshelf: [1.45, 0.42], Kitchen_Cabinet1: [1.05, 0.58], Kitchen_Fridge: [0.84, 0.78], Kitchen_Oven: [0.82, 0.70],
  Kitchen_Sink: [1.10, 0.66], Bathroom_Bathtub: [0.80, 1.72], Bathroom_Toilet: [0.62, 0.78]
};

const PlacementProfiles = {
  ...CollisionProfiles,
  Light_Floor1: [0.48, 0.48],
  Door_3: [1.0, 0.24],
  Window_Large1: [1.45, 0.22]
};

const Themes = ["LIVING ROOM", "BEDROOMS", "KITCHENS", "BATHROOMS", "WAREHOUSE", "SHOWROOM", "CLEARANCE", "STORAGE"];
const ThemeCycleCache = new Map();

function BaseThemePermutation(Cycle) {
  const Order = Themes.map((_, Index) => Index);
  let State = MixSeed32((WorldSeed ^ Math.imul((Cycle + 1) | 0, 0x6d2b79f5)) >>> 0);
  for (let Index = Order.length - 1; Index > 0; Index -= 1) {
    State = MixSeed32((State + Math.imul(Index + 1, 0x9e3779b1)) >>> 0);
    const SwapIndex = State % (Index + 1);
    [Order[Index], Order[SwapIndex]] = [Order[SwapIndex], Order[Index]];
  }
  return Order;
}

function ThemePermutation(Cycle) {
  if (ThemeCycleCache.has(Cycle)) return ThemeCycleCache.get(Cycle);
  const Order = BaseThemePermutation(Cycle);
  if (Cycle > 0) {
    const PreviousBase = BaseThemePermutation(Cycle - 1);
    if (Order[0] === PreviousBase[PreviousBase.length - 1]) {
      [Order[0], Order[1]] = [Order[1], Order[0]];
    }
  }
  ThemeCycleCache.set(Cycle, Order);
  return Order;
}

function ThemeForChunk(Index) {
  const CycleLength = Themes.length;
  const Cycle = Math.floor(Math.max(0, Index) / CycleLength);
  const Position = Math.max(0, Index) % CycleLength;
  return Themes[ThemePermutation(Cycle)[Position]];
}

const GenerationQueue = [];
let GenerationRunning = false;

function ScheduleGenerationWork(Job) {
  return new Promise((Resolve, Reject) => {
    GenerationQueue.push({ Job, Resolve, Reject });
    PumpGenerationQueue();
  });
}

function PumpGenerationQueue() {
  if (GenerationRunning || !GenerationQueue.length) return;
  GenerationRunning = true;
  const Run = async () => {
    const Entry = GenerationQueue.shift();
    try {
      Entry.Resolve(await Entry.Job());
    } catch (Error) {
      Entry.Reject(Error);
    } finally {
      GenerationRunning = false;
      PumpGenerationQueue();
    }
  };
  if ("requestIdleCallback" in window) requestIdleCallback(() => Run(), { timeout: 55 });
  else setTimeout(Run, 0);
}

function OverlapsXZ(A, B, Padding = 0) {
  return A.max.x > B.min.x - Padding && A.min.x < B.max.x + Padding && A.max.z > B.min.z - Padding && A.min.z < B.max.z + Padding;
}

function Footprint(Name, X, Z, Rotation = 0, Extra = 0) {
  const [Width, Depth] = PlacementProfiles[Name] || [0.68, 0.68];
  const C = Math.abs(Math.cos(Rotation));
  const S = Math.abs(Math.sin(Rotation));
  const RotatedWidth = Width * C + Depth * S;
  const RotatedDepth = Width * S + Depth * C;
  const HalfX = RotatedWidth * 0.5 + Extra;
  const HalfZ = RotatedDepth * 0.5 + Extra;
  return new THREE.Box3(new THREE.Vector3(X - HalfX, 0, Z - HalfZ), new THREE.Vector3(X + HalfX, 2.5, Z + HalfZ));
}

function IsFootprintClear(Chunk, Bounds, CheckReserved = true) {
  if (Bounds.min.x < -STORE_HALF_WIDTH + 0.28 || Bounds.max.x > STORE_HALF_WIDTH - 0.28) return false;
  if (Bounds.min.z < Chunk.BottomZ + 0.32 || Bounds.max.z > Chunk.TopZ - 0.32) return false;
  for (const Structure of Chunk.StructureBounds) {
    if (OverlapsXZ(Bounds, Structure, PLACEMENT_CLEARANCE)) return false;
  }
  if (CheckReserved) {
    for (const Reserved of Chunk.ReservedBounds) {
      if (OverlapsXZ(Bounds, Reserved, RESERVED_CLEARANCE)) return false;
    }
  }
  return true;
}

function ShapeCastPlacement(Chunk, Name, X, Z, Rotation = 0, Reserve = true) {
  const OriginalSide = Math.abs(X) > 4.5 ? Math.sign(X) : 0;
  const Offsets = [[0, 0]];
  for (const Radius of [0.45, 0.9, 1.35, 1.8, 2.25, 2.7, 3.15]) {
    Offsets.push([0, Radius], [0, -Radius], [Radius, 0], [-Radius, 0]);
    const Diagonal = Radius * 0.70710678;
    Offsets.push([Diagonal, Diagonal], [-Diagonal, Diagonal], [Diagonal, -Diagonal], [-Diagonal, -Diagonal]);
  }
  for (const [OffsetX, OffsetZ] of Offsets) {
    const CandidateX = X + OffsetX;
    const CandidateZ = Z + OffsetZ;
    if (OriginalSide && (Math.sign(CandidateX) !== OriginalSide || Math.abs(CandidateX) < 4.25)) continue;
    const Bounds = Footprint(Name, CandidateX, CandidateZ, Rotation, 0.035);
    if (!IsFootprintClear(Chunk, Bounds, true)) continue;
    if (Reserve) Chunk.ReservedBounds.push(Bounds.clone());
    return { X: CandidateX, Z: CandidateZ, Bounds };
  }
  return null;
}

function ResolveCustomPlacement(Chunk, X, Z, Width, Depth) {
  const Name = `Custom-${Chunk.ReservedBounds.length}`;
  PlacementProfiles[Name] = [Width, Depth];
  const Placement = ShapeCastPlacement(Chunk, Name, X, Z, 0, true);
  delete PlacementProfiles[Name];
  return Placement;
}

function AddChunkCollision(Chunk, Bounds, Type = "world") {
  const Entry = { Box: Bounds, ChunkId: Chunk.Id, Type, Active: false };
  Chunk.CollisionEntries.push(Entry);
  if (/Wall|Partition/i.test(Type)) Chunk.StructureBounds.push(Bounds.clone());
  return Entry;
}

function Box(Name, Size, Position, Material, Chunk, Collidable = false) {
  const Mesh = new THREE.Mesh(new THREE.BoxGeometry(Size.x, Size.y, Size.z), Material);
  Mesh.name = Name;
  Mesh.position.copy(Position);
  Mesh.userData.ChunkId = Chunk.Id;
  Chunk.Group.add(Mesh);
  if (Collidable) {
    const Bounds = new THREE.Box3().setFromCenterAndSize(Position.clone(), Size.clone());
    AddChunkCollision(Chunk, Bounds, Name);
  }
  return Mesh;
}

function AddPartition(Chunk, X, Z, Length = 3.3) {
  Box("ShowroomPartition", new THREE.Vector3(0.15, 2.25, Length), new THREE.Vector3(X, 1.125, Z), WallMaterial, Chunk, true);
  Box("PartitionCap", new THREE.Vector3(0.23, 0.07, Length + 0.08), new THREE.Vector3(X, 2.285, Z), TrimMaterial, Chunk);
  Box("PartitionBase", new THREE.Vector3(0.22, 0.11, Length + 0.06), new THREE.Vector3(X, 0.055, Z), TrimMaterial, Chunk);
}

function AddLightFixture(Chunk, X, Z, Broken = false) {
  Box("LightHousing", new THREE.Vector3(3.4, 0.08, 0.42), new THREE.Vector3(X, 3.56, Z), LightHousingMaterial, Chunk);
  const GlowMaterial = PanelGlowMaterial.clone();
  if (Broken) GlowMaterial.color.setHex(0x3b352e);
  Box("LightGlow", new THREE.Vector3(3.05, 0.018, 0.22), new THREE.Vector3(X, 3.51, Z), GlowMaterial, Chunk);
  if (!Broken && Math.abs(X) < 1) {
    const Light = new THREE.PointLight(0xffe3b1, 1.75, 14, 1.85);
    Light.position.set(X, 3.12, Z);
    Light.userData.BaseIntensity = 1.75;
    Light.userData.ChunkId = Chunk.Id;
    Chunk.Group.add(Light);
    Chunk.Lights.push(Light);
  }
}

function EnsureUvs(Geometry) {
  if (Geometry.attributes.uv || !Geometry.attributes.position) return;
  Geometry.computeBoundingBox();
  const Bounds = Geometry.boundingBox;
  const Size = new THREE.Vector3();
  Bounds.getSize(Size);
  const Position = Geometry.attributes.position;
  const Uvs = new Float32Array(Position.count * 2);
  const Dimensions = [
    { A: "x", B: "y", Area: Size.x * Size.y },
    { A: "x", B: "z", Area: Size.x * Size.z },
    { A: "z", B: "y", Area: Size.z * Size.y }
  ].sort((Left, Right) => Right.Area - Left.Area)[0];
  const MinA = Bounds.min[Dimensions.A];
  const MinB = Bounds.min[Dimensions.B];
  const SizeA = Math.max(Size[Dimensions.A], 0.0001);
  const SizeB = Math.max(Size[Dimensions.B], 0.0001);
  for (let Index = 0; Index < Position.count; Index += 1) {
    const Vertex = new THREE.Vector3().fromBufferAttribute(Position, Index);
    Uvs[Index * 2] = (Vertex[Dimensions.A] - MinA) / SizeA;
    Uvs[Index * 2 + 1] = (Vertex[Dimensions.B] - MinB) / SizeB;
  }
  Geometry.setAttribute("uv", new THREE.BufferAttribute(Uvs, 2));
}

function ApplyModelMaterials(Name, Model) {
  const Palette = MaterialPalettes[Name];
  if (!Palette) return;
  let MeshIndex = 0;
  Model.traverse(Object => {
    if (!Object.isMesh) return;
    EnsureUvs(Object.geometry);
    const Existing = Array.isArray(Object.material) ? Object.material : [Object.material];
    const Replaced = Existing.map((Material, Index) => {
      const Source = Palette[(MeshIndex + Index) % Palette.length];
      const Copy = Source.clone();
      if (Source.map) Copy.map = Source.map;
      Copy.side = THREE.FrontSide;
      return Copy;
    });
    Object.material = Array.isArray(Object.material) ? Replaced : Replaced[0];
    MeshIndex += 1;
  });
}

function PrepareModel(Name, Model) {
  const Definition = ModelDefinitions[Name];
  Model.updateMatrixWorld(true);
  const RawBounds = new THREE.Box3().setFromObject(Model);
  const RawSize = RawBounds.getSize(new THREE.Vector3());
  const AxisSize = Math.max(RawSize[Definition.Axis], 0.0001);
  const Scale = Definition.Target / AxisSize;
  Model.scale.setScalar(Scale);
  ApplyModelMaterials(Name, Model);
  Model.updateMatrixWorld(true);
  const Bounds = new THREE.Box3().setFromObject(Model);
  const Center = Bounds.getCenter(new THREE.Vector3());
  Model.position.x -= Center.x;
  Model.position.z -= Center.z;
  Model.updateMatrixWorld(true);
  const Grounded = new THREE.Box3().setFromObject(Model);
  Model.position.y -= Grounded.min.y;
}

async function GetModelTemplate(Name) {
  const Definition = ModelDefinitions[Name];
  if (!Definition) throw new Error(`Unknown model ${Name}`);
  if (!ModelCache.has(Name)) {
    ModelCache.set(Name, Loader.loadAsync(Definition.Url).then(Gltf => {
      const Template = Gltf.scene;
      PrepareModel(Name, Template);
      return Template;
    }));
  }
  return ModelCache.get(Name);
}

function AddModelCollision(Chunk, Entry) {
  const Profile = CollisionProfiles[Entry.Model];
  if (!Profile) return;
  const [Width, Depth] = Profile;
  const Rotation = Number(Entry.Rotation) || 0;
  const C = Math.abs(Math.cos(Rotation));
  const S = Math.abs(Math.sin(Rotation));
  const RotatedWidth = Width * C + Depth * S;
  const RotatedDepth = Width * S + Depth * C;
  const HalfX = Math.max(0.16, RotatedWidth * 0.5 - 0.055);
  const HalfZ = Math.max(0.16, RotatedDepth * 0.5 - 0.055);
  const Collision = AddChunkCollision(Chunk, new THREE.Box3(
    new THREE.Vector3(Entry.X - HalfX, 0, Entry.Z - HalfZ),
    new THREE.Vector3(Entry.X + HalfX, 2.5, Entry.Z + HalfZ)
  ), Entry.Model);
  Collision.LayoutSlot = Entry.Slot;
}

function SpawnLayoutModel(Chunk, Entry) {
  const Pending = GetModelTemplate(Entry.Model)
    .then(Template => ScheduleGenerationWork(() => {
      if (Chunk.Cancelled) return null;
      const Model = Template.clone(true);
      Model.position.x += Entry.X;
      Model.position.z += Entry.Z;
      Model.rotation.y = Number(Entry.Rotation) || 0;
      Model.name = Entry.Model;
      Model.userData.ChunkId = Chunk.Id;
      Model.userData.LayoutSlot = Entry.Slot;
      Model.userData.LayoutAuthority = Chunk.Layout.Authority;
      Model.userData.SpawnShapeChecked = true;
      Chunk.Group.add(Model);
      Chunk.Models.push(Model);
      AddModelCollision(Chunk, Entry);
      LoadedDisplays += 1;
      return Model;
    }))
    .catch(Error => {
      console.warn(`Could not load planned ${Entry.Model} in ${Entry.Slot}`, Error);
      return null;
    });
  Chunk.PendingLoads.push(Pending);
  return Pending;
}

async function GetRugTemplate(Variant = 0) {
  const File = RugModelFiles[Math.abs(Number(Variant) || 0) % RugModelFiles.length];
  if (!RugModelCache.has(File)) {
    RugModelCache.set(File, Loader.loadAsync(`${KayKitFurnitureBase}${File}`).then(Gltf => {
      const Template = Gltf.scene;
      Template.name = `FurnitureStoreRugTemplate-${File}`;
      Template.traverse(Object => {
        if (!Object?.isMesh) return;
        Object.castShadow = false;
        Object.receiveShadow = true;
        Object.frustumCulled = true;
        if (Object.material) {
          Object.material = Object.material.clone();
          if ("roughness" in Object.material) Object.material.roughness = Math.max(0.72, Object.material.roughness ?? 0.8);
          Object.material.needsUpdate = true;
        }
      });
      return Template;
    }).catch(Error => {
      RugModelCache.delete(File);
      throw Error;
    }));
  }
  return RugModelCache.get(File);
}

function SpawnPlannedRug(Chunk, Entry) {
  const Pending = GetRugTemplate(Entry.Variant)
    .then(Template => ScheduleGenerationWork(() => {
      if (Chunk.Cancelled) return null;
      const Rug = Template.clone(true);
      Rug.updateWorldMatrix(true, true);
      let Bounds = new THREE.Box3().setFromObject(Rug);
      if (Bounds.isEmpty()) return null;
      const Size = Bounds.getSize(new THREE.Vector3());
      const ScaleX = Number(Entry.Width) / Math.max(Size.x, 0.001);
      const ScaleZ = Number(Entry.Depth) / Math.max(Size.z, 0.001);
      const ScaleY = Math.min(ScaleX, ScaleZ);
      Rug.scale.set(ScaleX, ScaleY, ScaleZ);
      Rug.updateWorldMatrix(true, true);
      Bounds = new THREE.Box3().setFromObject(Rug);
      const Center = Bounds.getCenter(new THREE.Vector3());
      Rug.position.x += Number(Entry.X) - Center.x;
      Rug.position.z += Number(Entry.Z) - Center.z;
      Rug.position.y += 0.006 - Bounds.min.y;
      Rug.name = `ShowroomRug-${Entry.Slot}`;
      Rug.userData.ChunkId = Chunk.Id;
      Rug.userData.LayoutSlot = Entry.Slot;
      Rug.userData.LayoutAuthority = Chunk.Layout.Authority;
      Rug.userData.DecorationKind = "Rug";
      Rug.userData.WalkableCarpetR87 = true;
      Rug.userData.DecorationNoCollision = false;
      Rug.userData.RealFurnitureStoreRugR90 = true;
      Chunk.Group.add(Rug);
      return Rug;
    }))
    .catch(Error => {
      console.warn(`Could not load planned rug ${Entry.Slot}`, Error);
      return null;
    });
  Chunk.PendingLoads.push(Pending);
  return Pending;
}

function AddTask(Chunk, Entry) {
  if (!Entry) return null;
  const Group = new THREE.Group();
  Group.name = "StoreTask";
  Group.position.set(Entry.X, 0, Entry.Z);
  Group.rotation.y = Number(Entry.Rotation) || 0;
  Group.userData.ChunkId = Chunk.Id;
  Group.userData.LayoutSlot = Entry.Slot;
  Group.userData.LayoutAuthority = Chunk.Layout.Authority;
  const Base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.92, 0.28), TaskMetalMaterial);
  Base.position.y = 0.46;
  Group.add(Base);
  const Screen = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.035), TaskGlowMaterial.clone());
  Screen.position.set(0, 0.62, 0.16);
  Group.add(Screen);
  const Handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.06), TrimMaterial);
  Handle.position.set(0.16, 0.32, 0.17);
  Group.add(Handle);
  Chunk.Group.add(Group);
  Chunk.TaskObjects.push(Group);
  const Labels = { breaker: "Reset the breaker", manifest: "Check the stock manifest", scanner: "Scan the damaged inventory" };
  const Task = {
    Id: `${Chunk.Id}:${Entry.Type}`,
    ChunkId: Chunk.Id,
    ChunkIndex: Chunk.Index,
    Type: Entry.Type,
    Label: Labels[Entry.Type],
    Object: Group,
    Screen,
    Completed: false
  };
  Chunk.TaskRecords.push(Task);
  Chunk.Tasks.push(Task.Id);
  return Task;
}

function ApplyLayoutReservations(Chunk) {
  Chunk.ReservedBounds.length = 0;
  for (const Reservation of Chunk.Layout?.Reservations || []) {
    const Bounds = Reservation.Bounds;
    if (!Bounds) continue;
    const Box = new THREE.Box3(
      new THREE.Vector3(Bounds.MinX, 0, Bounds.MinZ),
      new THREE.Vector3(Bounds.MaxX, 2.6, Bounds.MaxZ)
    );
    Box.userData = { LayoutSlot: Reservation.Slot, LayoutKind: Reservation.Kind };
    Chunk.ReservedBounds.push(Box);
  }
}

function PopulateFromLayout(Chunk) {
  for (const Rug of Chunk.Layout?.Rugs || []) SpawnPlannedRug(Chunk, Rug);
  for (const Entry of Chunk.Layout?.Base || []) SpawnLayoutModel(Chunk, Entry);
  if (Chunk.Layout?.Task) AddTask(Chunk, Chunk.Layout.Task);
}

function CreatePreparedChunk(Index) {
  const Id = `Chunk-${Index}`;
  const CenterZ = ChunkCenterZ(Index);
  const TopZ = ChunkTopZ(Index);
  const BottomZ = ChunkBottomZ(Index);
  const Seed = ChunkSeed(Index);
  const Theme = ThemeForChunk(Index);
  const Layout = CreateChunkLayout({ Index, Seed, Theme, CenterZ, TopZ, BottomZ });
  const Group = new THREE.Group();
  Group.name = Id;
  Group.visible = false;
  Group.userData.ChunkId = Id;
  Group.userData.LayoutTemplate = Layout.Template;
  Group.userData.LayoutAuthority = Layout.Authority;
  const Chunk = {
    Id, Index, Theme, Seed, CenterZ, TopZ, BottomZ, Layout, Group,
    Models: [], Lights: [], Tasks: [], TaskObjects: [], TaskRecords: [], ExternalObjects: [],
    CollisionEntries: [], StructureBounds: [], ReservedBounds: [], PendingLoads: [],
    Ready: false, Active: false, Cancelled: false
  };

  Box("Floor", new THREE.Vector3(34, 0.16, CHUNK_LENGTH + 0.25), new THREE.Vector3(0, -0.08, CenterZ), FloorMaterial, Chunk);
  Box("Ceiling", new THREE.Vector3(34, 0.14, CHUNK_LENGTH + 0.25), new THREE.Vector3(0, CEILING_HEIGHT, CenterZ), CeilingMaterial, Chunk);
  Box("WallLeft", new THREE.Vector3(0.20, 3.8, CHUNK_LENGTH + 0.25), new THREE.Vector3(-STORE_HALF_WIDTH, 1.86, CenterZ), WallMaterial, Chunk, true);
  Box("WallRight", new THREE.Vector3(0.20, 3.8, CHUNK_LENGTH + 0.25), new THREE.Vector3(STORE_HALF_WIDTH, 1.86, CenterZ), WallMaterial, Chunk, true);
  Box("BaseboardLeft", new THREE.Vector3(0.25, 0.18, CHUNK_LENGTH + 0.25), new THREE.Vector3(-16.87, 0.09, CenterZ), TrimMaterial, Chunk);
  Box("BaseboardRight", new THREE.Vector3(0.25, 0.18, CHUNK_LENGTH + 0.25), new THREE.Vector3(16.87, 0.09, CenterZ), TrimMaterial, Chunk);

  ApplyLayoutReservations(Chunk);
  for (const Entry of Layout.Partitions || []) {
    const Wall = Box("ShowroomPartition", new THREE.Vector3(0.15, 2.25, Entry.Length), new THREE.Vector3(Entry.X, 1.125, Entry.Z), WallMaterial, Chunk, true);
    const Cap = Box("PartitionCap", new THREE.Vector3(0.23, 0.07, Entry.Length + 0.08), new THREE.Vector3(Entry.X, 2.285, Entry.Z), TrimMaterial, Chunk);
    const Base = Box("PartitionBase", new THREE.Vector3(0.22, 0.11, Entry.Length + 0.06), new THREE.Vector3(Entry.X, 0.055, Entry.Z), TrimMaterial, Chunk);
    for (const Object of [Wall, Cap, Base]) {
      Object.userData.LayoutSlot = Entry.Slot;
      Object.userData.LayoutAuthority = Layout.Authority;
    }
  }

  for (const Offset of [-9.0, 0, 9.0]) AddLightFixture(Chunk, 0, CenterZ + Offset, SeededRandom(Seed + Offset * 3) > 0.88);
  for (const Offset of [-7.5, 7.5]) {
    AddLightFixture(Chunk, -9.0, CenterZ + Offset, SeededRandom(Seed + Offset * 4) > 0.84);
    AddLightFixture(Chunk, 9.0, CenterZ - Offset, SeededRandom(Seed + Offset * 5) > 0.84);
  }

  PopulateFromLayout(Chunk);

  if (Layout.ValidationErrors.length) {
    console.warn(`Layout ${Layout.Template} for ${Id} skipped invalid slots`, Layout.ValidationErrors);
  }
  return Chunk;
}

function PrepareChunk(Index) {
  if (ActiveChunks.has(Index)) return Promise.resolve(ActiveChunks.get(Index));
  if (PreparedChunks.has(Index)) return Promise.resolve(PreparedChunks.get(Index));
  if (PreparingChunks.has(Index)) return PreparingChunks.get(Index);
  const PromiseValue = ScheduleGenerationWork(() => CreatePreparedChunk(Index))
    .then(async Chunk => {
      PreparedChunks.set(Index, Chunk);
      await Promise.allSettled(Chunk.PendingLoads);
      if (Chunk.Cancelled) {
        PreparedChunks.delete(Index);
        return null;
      }
      Chunk.Ready = true;
      return Chunk;
    })
    .finally(() => PreparingChunks.delete(Index));
  PreparingChunks.set(Index, PromiseValue);
  return PromiseValue;
}

function ActivateChunk(Chunk) {
  if (!Chunk || Chunk.Cancelled || !Chunk.Ready || Chunk.Active) return false;
  PreparedChunks.delete(Chunk.Index);
  Chunk.Active = true;
  Chunk.Group.visible = Boolean(Chunk.Group.userData?.PresentationReadyR83);
  Scene.add(Chunk.Group);
  for (const Object of Chunk.ExternalObjects) {
    Object.visible = Chunk.Group.visible;
    Scene.add(Object);
  }
  for (const Entry of Chunk.CollisionEntries) {
    if (Entry.Active) continue;
    Entry.Active = true;
    CollisionBoxes.push(Entry);
  }
  for (const Task of Chunk.TaskRecords) Tasks.set(Task.Id, Task);
  ActiveChunks.set(Chunk.Index, Chunk);
  return true;
}

function DeactivateChunk(Index, KeepPrepared = true) {
  const Chunk = ActiveChunks.get(Index);
  if (!Chunk) return;
  Scene.remove(Chunk.Group);
  for (const Object of Chunk.ExternalObjects) Scene.remove(Object);
  for (const Task of Chunk.TaskRecords) Tasks.delete(Task.Id);
  for (let CollisionIndex = CollisionBoxes.length - 1; CollisionIndex >= 0; CollisionIndex -= 1) {
    if (CollisionBoxes[CollisionIndex].ChunkId === Chunk.Id) CollisionBoxes.splice(CollisionIndex, 1);
  }
  for (const Entry of Chunk.CollisionEntries) Entry.Active = false;
  for (let ChildIndex = Scene.children.length - 1; ChildIndex >= 0; ChildIndex -= 1) {
    const Child = Scene.children[ChildIndex];
    if (Child.userData?.ChunkId === Chunk.Id && Child !== Chunk.Group && !Chunk.ExternalObjects.includes(Child)) Scene.remove(Child);
  }
  Chunk.Active = false;
  ActiveChunks.delete(Index);
  if (KeepPrepared && !Chunk.Cancelled) PreparedChunks.set(Index, Chunk);
  else Chunk.Cancelled = true;
}

function DropPreparedChunk(Index) {
  const Chunk = PreparedChunks.get(Index);
  if (!Chunk) return;
  Chunk.Cancelled = true;
  PreparedChunks.delete(Index);
}

function RequestChunk(Index) {
  const Prepared = PreparedChunks.get(Index);
  if (Prepared?.Ready) return Promise.resolve(Prepared);
  return PrepareChunk(Index);
}

function TryActivateIndex(Index) {
  if (ActiveChunks.has(Index)) return true;
  const Prepared = PreparedChunks.get(Index);
  return Prepared?.Ready ? ActivateChunk(Prepared) : false;
}

function EnsureChunksAroundPlayer() {
  const CurrentIndex = ChunkIndexForZ(Camera.position.z);
  LastChunkIndex = CurrentIndex;
  const MinIndex = Math.max(0, CurrentIndex - CHUNKS_BEHIND);
  const MaxIndex = Math.max(0, CurrentIndex + CHUNKS_AHEAD);
  const PrefetchMin = Math.max(0, MinIndex - PREFETCH_CHUNKS);
  const PrefetchMax = MaxIndex + PREFETCH_CHUNKS;
  const WantedActive = new Set();

  for (let Index = MinIndex; Index <= MaxIndex; Index += 1) {
    WantedActive.add(Index);
    if (!TryActivateIndex(Index)) RequestChunk(Index).catch(Error => console.warn(`Chunk ${Index} preparation failed`, Error));
  }

  RequestChunk(PrefetchMin).catch(() => {});
  RequestChunk(PrefetchMax).catch(() => {});

  const DistanceToTop = Math.max(0, ChunkTopZ(CurrentIndex) - Camera.position.z);
  const DistanceToBottom = Math.max(0, Camera.position.z - ChunkBottomZ(CurrentIndex));
  if (DistanceToTop <= STREAM_PROMOTION_DISTANCE && TryActivateIndex(PrefetchMin)) WantedActive.add(PrefetchMin);
  if (DistanceToBottom <= STREAM_PROMOTION_DISTANCE && TryActivateIndex(PrefetchMax)) WantedActive.add(PrefetchMax);

  for (const Index of [...ActiveChunks.keys()]) {
    if (!WantedActive.has(Index)) DeactivateChunk(Index, Index >= PrefetchMin && Index <= PrefetchMax);
  }
  for (const Index of [...PreparedChunks.keys()]) {
    if (Index < PrefetchMin || Index > PrefetchMax) DropPreparedChunk(Index);
  }

  if (AisleCounter) AisleCounter.textContent = CurrentIndex >= 0 ? `${CurrentIndex + 1}` : `B${Math.abs(CurrentIndex)}`;
}

async function PrepareInitialWorld() {
  const Order = [0, 1, 2];
  for (let Position = 0; Position < Order.length; Position += 1) {
    if (BootStatus) BootStatus.textContent = `Assembling buffered store ${Position + 1}/${Order.length} • seed ${WorldSeed}`;
    const Chunk = await PrepareChunk(Order[Position]);
    if (Chunk) ActivateChunk(Chunk);
  }
  RequestChunk(3).catch(() => {});
}

function NormalizeWorldSeed(Value) {
  const NumberValue = Number(Value);
  if (!Number.isFinite(NumberValue)) return null;
  const Seed = Math.trunc(NumberValue) >>> 0;
  return Seed || 1;
}

async function SetWorldSeed(Value) {
  const NextSeed = NormalizeWorldSeed(Value);
  if (NextSeed === null) return false;
  if (NextSeed === WorldSeed) return true;

  if (SeedResetFlight) {
    await SeedResetFlight;
    if (NextSeed === WorldSeed) return true;
  }

  SeedResetFlight = (async () => {
    const WasStarted = Started;
    Started = false;
    try {
      await Promise.allSettled([...PreparingChunks.values()]);

      for (const Index of [...ActiveChunks.keys()]) DeactivateChunk(Index, false);
      for (const Index of [...PreparedChunks.keys()]) DropPreparedChunk(Index);

      PreparingChunks.clear();
      ThemeCycleCache.clear();
      CollisionBoxes.length = 0;
      Tasks.clear();
      LoadedDisplays = 0;
      CompletedTasks = 0;
      CurrentTask = null;
      LastChunkIndex = 0;
      LastObjectiveText = "";

      WorldSeed = NextSeed;
      window.__STORE_WORLD_SEED__ = WorldSeed;
      if (window.__STORE_GAME__) window.__STORE_GAME__.WorldSeed = WorldSeed;

      Camera.position.set(0, PlayerEyeHeight, 8);
      await PrepareInitialWorld();
      ResetTaskProgress();
      window.__STORE_VISUAL_REDESIGN_R73__?.Discover?.();
      window.__STORE_RETAIL_SHOWROOM_R79__?.Discover?.();
      window.__STORE_PRESENTATION_READY_R83__?.Discover?.();

      if (BootStatus) BootStatus.textContent = `Store ready — synchronized seed ${WorldSeed}.`;
      return true;
    } finally {
      Started = WasStarted;
    }
  })().finally(() => {
    SeedResetFlight = null;
  });

  return SeedResetFlight;
}

function RenderClock() {
  let Hours = Math.floor(StoreSeconds / 3600);
  const Minutes = Math.floor((StoreSeconds % 3600) / 60);
  const Suffix = Hours >= 12 ? "PM" : "AM";
  Hours %= 12;
  if (Hours === 0) Hours = 12;
  GameClock.textContent = `${Hours}:${String(Minutes).padStart(2, "0")} ${Suffix}`;
}

function UpdateClock(Delta) {
  StoreSeconds = (StoreSeconds + Delta * STORE_TIME_RATE) % DAY_SECONDS;
  RenderClock();
}

function SetStoreSeconds(Value) {
  const Seconds = Number(Value);
  if (!Number.isFinite(Seconds)) return false;
  StoreSeconds = ((Seconds % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  RenderClock();
  return true;
}

function FindNearestPendingTask() {
  let Best = null;
  let BestDistance = Infinity;
  for (const Task of Tasks.values()) {
    if (Task.Completed || Task.ChunkIndex < LastChunkIndex - 1) continue;
    const Distance = Camera.position.distanceTo(Task.Object.getWorldPosition(new THREE.Vector3()));
    if (Distance < BestDistance) {
      Best = Task;
      BestDistance = Distance;
    }
  }
  return { Task: Best, Distance: BestDistance };
}

function UpdateObjective() {
  const { Task, Distance } = FindNearestPendingTask();
  CurrentTask = Task;
  let Text;
  if (Task) {
    const DistanceText = Number.isFinite(Distance) ? ` • ${Math.max(1, Math.round(Distance))}m` : "";
    Text = `${Task.Label}${DistanceText}`;
  } else Text = "Keep moving deeper. More aisles are already buffered ahead.";
  if (Text !== LastObjectiveText) {
    LastObjectiveText = Text;
    ObjectiveText.textContent = Text;
  }
  if (TaskCounter) TaskCounter.textContent = `${CompletedTasks}`;
}

function TaskWorldPosition(Task, Target = new THREE.Vector3()) {
  return Task.Object.getWorldPosition(Target);
}

function UpdateInteractionPrompt() {
  if (!InteractPrompt) return;
  if (!CurrentTask || CurrentTask.Completed) {
    InteractPrompt.classList.remove("Show");
    return;
  }
  const Distance = Camera.position.distanceTo(TaskWorldPosition(CurrentTask));
  if (Distance <= TASK_DISTANCE) {
    InteractPrompt.textContent = `[ E ] ${CurrentTask.Label.toUpperCase()}`;
    InteractPrompt.classList.add("Show");
  } else InteractPrompt.classList.remove("Show");
}

function ApplyTaskCompletionVisuals(Task) {
  if (!Task || Task.Completed) return false;
  Task.Completed = true;
  Task.Screen.material = Task.Screen.material.clone();
  Task.Screen.material.color.setHex(0x23522c);
  Task.Screen.material.emissive.setHex(0x36d45b);
  Task.Screen.material.emissiveIntensity = 1.9;
  const Chunk = ActiveChunks.get(Task.ChunkIndex);
  if (Task.Type === "breaker" && Chunk) {
    for (const Light of Chunk.Lights) {
      if (!Number.isFinite(Light.userData.TaskBaseIntensity)) Light.userData.TaskBaseIntensity = Light.userData.BaseIntensity;
      Light.userData.BaseIntensity = Math.max(Light.userData.BaseIntensity, 2.0);
    }
  }
  if (Task.Type === "scanner") Task.Object.rotation.y += Math.PI * 2;
  return true;
}

function SetCompletedTaskCount(Value) {
  const Count = Number(Value);
  if (!Number.isFinite(Count)) return false;
  CompletedTasks = Math.max(0, Math.floor(Count));
  if (TaskCounter) TaskCounter.textContent = `${CompletedTasks}`;
  return true;
}

function CompleteSharedTask(TaskId, TotalCompleted = CompletedTasks) {
  SetCompletedTaskCount(TotalCompleted);
  const Task = Tasks.get(String(TaskId || ""));
  if (!Task) return false;
  ApplyTaskCompletionVisuals(Task);
  if (CurrentTask === Task) CurrentTask = null;
  UpdateObjective();
  return true;
}

function ResetTaskProgress() {
  SetCompletedTaskCount(0);
  CurrentTask = null;
  const SeenChunks = new Set();
  const ResetChunk = Chunk => {
    if (!Chunk || SeenChunks.has(Chunk)) return;
    SeenChunks.add(Chunk);
    for (const Task of Chunk.TaskRecords || []) {
      Task.Completed = false;
      if (Task.Screen?.material) {
        Task.Screen.material.dispose?.();
        Task.Screen.material = TaskGlowMaterial.clone();
      }
      if (Task.Type === "breaker") {
        for (const Light of Chunk.Lights || []) {
          if (!Number.isFinite(Light.userData.TaskBaseIntensity)) continue;
          Light.userData.BaseIntensity = Light.userData.TaskBaseIntensity;
          delete Light.userData.TaskBaseIntensity;
        }
      }
      if (Task.Type === "scanner") Task.Object.rotation.y = 0;
    }
  };
  for (const Chunk of ActiveChunks.values()) ResetChunk(Chunk);
  for (const Chunk of PreparedChunks.values()) ResetChunk(Chunk);
  UpdateObjective();
  UpdateInteractionPrompt();
  return true;
}

function CompleteTask(Task) {
  if (!Task || Task.Completed) return;
  ApplyTaskCompletionVisuals(Task);
  SetCompletedTaskCount(CompletedTasks + 1);
  CurrentTask = null;
  UpdateObjective();
}

function TryInteract() {
  if (!Started || !Controls.isLocked || !CurrentTask || CurrentTask.Completed) return;
  if (Camera.position.distanceTo(TaskWorldPosition(CurrentTask)) <= TASK_DISTANCE) CompleteTask(CurrentTask);
}

function IsBlocked(Position) {
  const Radius = PlayerApi?.GetPlayerRadius?.() || 0.43;
  for (const Entry of CollisionBoxes) {
    if (typeof Entry?.TestPlayerCollision === "function") {
      if (Entry.TestPlayerCollision(Position, Radius)) return true;
      continue;
    }
    const Bounds = Entry.Box || Entry;
    if (Position.x + Radius > Bounds.min.x && Position.x - Radius < Bounds.max.x && Position.z + Radius > Bounds.min.z && Position.z - Radius < Bounds.max.z) return true;
  }
  return false;
}

function MoveAxis(ForwardDistance, RightDistance) {
  if (ForwardDistance !== 0) {
    const Before = Camera.position.clone();
    Controls.moveForward(ForwardDistance);
    if (IsBlocked(Camera.position)) Camera.position.copy(Before);
  }
  if (RightDistance !== 0) {
    const Before = Camera.position.clone();
    Controls.moveRight(RightDistance);
    if (IsBlocked(Camera.position)) Camera.position.copy(Before);
  }
}

function UpdateMovement(Delta) {
  if (!Controls.isLocked) return;
  let Forward = 0;
  let Right = 0;
  if (KeyState.has("KeyW")) Forward += 1;
  if (KeyState.has("KeyS")) Forward -= 1;
  if (KeyState.has("KeyD")) Right += 1;
  if (KeyState.has("KeyA")) Right -= 1;
  const Moving = Forward !== 0 || Right !== 0;
  const WantsSprint = KeyState.has("ShiftLeft") || KeyState.has("ShiftRight");
  const Speed = PlayerApi?.GetMovementSpeed?.(WantsSprint, Moving) ?? (WantsSprint && Moving ? 5.6 : 3.55);
  const Length = Math.hypot(Forward, Right) || 1;
  Forward /= Length;
  Right /= Length;
  const Distance = Speed * Delta;
  const StepCount = Math.max(1, Math.ceil(Distance / 0.18));
  const ForwardStep = Forward * Distance / StepCount;
  const RightStep = Right * Distance / StepCount;
  for (let Step = 0; Step < StepCount; Step += 1) MoveAxis(ForwardStep, RightStep);
  Camera.position.y = PlayerEyeHeight;
}

function ShowError(Message) {
  ErrorText.textContent = Message;
  ErrorPanel.classList.remove("Hidden");
}

const Ambient = new THREE.AmbientLight(0xd9d2c5, 0.82);
Scene.add(Ambient);
const Hemisphere = new THREE.HemisphereLight(0xc7d0d1, 0x30281f, 0.72);
Scene.add(Hemisphere);
const FillLight = new THREE.DirectionalLight(0xffe6c2, 0.40);
FillLight.position.set(-7, 9, 6);
Scene.add(FillLight);

await PrepareInitialWorld();
PlayerApi?.Attach?.({ Scene, Camera, Renderer, CollisionBoxes });
if (BootStatus) BootStatus.textContent = `Store ready — buffered endless aisles • seed ${WorldSeed}.`;

function Animate() {
  const Delta = Math.min(GameTimer.getDelta(), 0.05);
  if (Started) {
    UpdateMovement(Delta);
    EnsureChunksAroundPlayer();
    UpdateClock(Delta);
    UpdateObjective();
    UpdateInteractionPrompt();
  }
  if (PlayerApi?.Render) PlayerApi.Render(Renderer, Scene, Camera);
  else Renderer.render(Scene, Camera);
  requestAnimationFrame(Animate);
}

StartButton.addEventListener("click", () => {
  Started = true;
  BootScreen.classList.remove("ScreenVisible");
  Hud.classList.remove("Hidden");
  Controls.lock();
});

Canvas.addEventListener("click", () => {
  if (Started && !Controls.isLocked) Controls.lock();
});

addEventListener("keydown", Event => {
  KeyState.add(Event.code);
  if (Event.code === "KeyE" && !Event.repeat) TryInteract();
});
addEventListener("keyup", Event => KeyState.delete(Event.code));
addEventListener("blur", () => KeyState.clear());
addEventListener("resize", () => {
  Camera.aspect = innerWidth / innerHeight;
  Camera.updateProjectionMatrix();
  Renderer.setPixelRatio(Math.min(devicePixelRatio, 1.15));
  Renderer.setSize(innerWidth, innerHeight, false);
});
addEventListener("error", Event => ShowError(Event.message || "Unknown runtime error."));
addEventListener("unhandledrejection", Event => ShowError(String(Event.reason || "Unknown loading error.")));

const PlacementApi = {
  IsCircleSafe(X, Z, Radius, ChunkId = null) {
    for (const Entry of CollisionBoxes) {
      if (ChunkId && Entry.ChunkId !== ChunkId) continue;
      if (!/Wall|Partition/i.test(Entry.Type || "")) continue;
      const Bounds = Entry.OriginalStructureBox || Entry.OriginalBox || Entry.Box || Entry;
      if (!Bounds?.min || !Bounds?.max) continue;
      if (X + Radius > Bounds.min.x && X - Radius < Bounds.max.x && Z + Radius > Bounds.min.z && Z - Radius < Bounds.max.z) return false;
    }
    return Math.abs(X) + Radius < STORE_HALF_WIDTH - 0.18;
  },
  ShapeCastPlacement
};

window.__STORE_GAME_BUILD__ = "V0.13.4";
window.__STORE_VERSION__ = "0.13.4";
window.__STORE_GAME__ = {
  Scene,
  Camera,
  Renderer,
  CollisionBoxes,
  ActiveChunks,
  PreparedChunks,
  Tasks,
  WorldSeed,
  ChunkSeed,
  ChunkIndexForZ,
  ChunkLength: CHUNK_LENGTH,
  PlayerEyeHeight,
  PrepareChunk,
  SetStoreSeconds,
  SetCompletedTaskCount,
  CompleteSharedTask,
  ResetTaskProgress,
  SetWorldSeed,
  Placement: PlacementApi,
  Version: "0.13.4"
};
Animate();