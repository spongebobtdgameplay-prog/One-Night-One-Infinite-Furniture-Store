import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

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
Renderer.toneMappingExposure = 1.10;

const Controls = new PointerLockControls(Camera, document.body);
const Loader = new GLTFLoader();
const GameTimer = new THREE.Clock();
const KeyState = new Set();
const CollisionBoxes = [];
const ModelCache = new Map();
const ActiveChunks = new Map();
const Tasks = new Map();
const PlayerApi = window.__STORE_PLAYER__ || null;

window.__STORE_COLLISION_BOXES__ = CollisionBoxes;

const STORE_HALF_WIDTH = 17;
const CEILING_HEIGHT = 3.72;
const CHUNK_LENGTH = 30;
const FIRST_CHUNK_TOP_Z = 10;
const CHUNKS_AHEAD = 5;
const CHUNKS_BEHIND = 1;
const MAX_ACTIVE_CHUNKS = CHUNKS_AHEAD + CHUNKS_BEHIND + 2;
const TASK_DISTANCE = 1.85;
const WorldSeed = Number.isFinite(window.__STORE_WORLD_SEED__) ? (window.__STORE_WORLD_SEED__ >>> 0) : 1000;

let StoreSeconds = 23 * 60 * 60 + 57 * 60;
let Started = false;
let LoadedDisplays = 0;
let CompletedTasks = 0;
let CurrentTask = null;
let LastChunkIndex = 0;
let LastObjectiveText = "";

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
  return Math.max(0, Math.floor((FIRST_CHUNK_TOP_Z - Z) / CHUNK_LENGTH));
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
    }

    if (Pattern === "wood") {
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
    }

    if (Pattern === "metal") {
      Context.globalAlpha = 0.13;
      for (let Line = 0; Line < 120; Line += 1) {
        const Y = SeededRandom(Line * 11 + 5) * Size;
        Context.fillStyle = AccentColor;
        Context.fillRect(0, Y, Size, SeededRandom(Line * 11 + 6) > 0.7 ? 2 : 1);
      }
      Context.globalAlpha = 1;
    }

    if (Pattern === "ceramic") {
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
  Context.fillStyle = "#77766f";
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
  Grime.addColorStop(1, "rgba(28,22,18,0.25)");
  Context.fillStyle = Grime;
  Context.fillRect(0, 0, Size, Size);
});

const FloorTexture = CreateTexture(256, 7.5, 7.5, (Context, Size) => {
  Context.fillStyle = "#565149";
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
const CardboardTexture = CreateSurfaceTexture("#92704c", "#caa477", "wood");

function Pbr(Map, Color, Roughness, Metalness = 0) {
  return new THREE.MeshStandardMaterial({ map: Map, color: Color, roughness: Roughness, metalness: Metalness });
}

const WallMaterial = Pbr(WallTexture, 0xb8b5ab, 0.94, 0.01);
const FloorMaterial = Pbr(FloorTexture, 0x92897d, 0.97, 0.01);
const CeilingMaterial = Pbr(CeilingTexture, 0xb4b2aa, 0.98, 0);
const TrimMaterial = new THREE.MeshStandardMaterial({ color: 0x2f2c28, roughness: 0.82, metalness: 0.16 });
const LightHousingMaterial = new THREE.MeshStandardMaterial({ color: 0x242628, roughness: 0.68, metalness: 0.62 });
const PanelGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffe8bd });
const CardboardMaterial = Pbr(CardboardTexture, 0xd8b98f, 0.95, 0);
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
  Couch_Large1: [2.25, 0.90],
  Couch_L: [2.45, 1.65],
  Chair_2: [0.78, 0.76],
  Table_RoundLarge: [1.38, 1.38],
  Bed_King: [1.90, 2.02],
  Bed_Single: [1.02, 1.96],
  NightStand_2: [0.52, 0.48],
  Shelf_Large: [1.75, 0.50],
  Bookshelf: [1.45, 0.42],
  Kitchen_Cabinet1: [1.05, 0.58],
  Kitchen_Fridge: [0.84, 0.78],
  Kitchen_Oven: [0.82, 0.70],
  Kitchen_Sink: [1.10, 0.66],
  Bathroom_Bathtub: [0.80, 1.72],
  Bathroom_Toilet: [0.62, 0.78]
};

const Themes = ["LIVING ROOM", "BEDROOMS", "KITCHENS", "BATHROOMS", "WAREHOUSE", "SHOWROOM", "CLEARANCE", "STORAGE"];

function AddCollision(Bounds, ChunkId, Type = "world") {
  CollisionBoxes.push({ Box: Bounds, ChunkId, Type });
}

function Box(Name, Size, Position, Material, Chunk, Collidable = false) {
  const Mesh = new THREE.Mesh(new THREE.BoxGeometry(Size.x, Size.y, Size.z), Material);
  Mesh.name = Name;
  Mesh.position.copy(Position);
  Mesh.userData.ChunkId = Chunk.Id;
  Chunk.Group.add(Mesh);
  if (Collidable) {
    const Bounds = new THREE.Box3().setFromCenterAndSize(Position.clone(), Size.clone());
    AddCollision(Bounds, Chunk.Id, Name);
  }
  return Mesh;
}

function CreateLabelTexture(Text) {
  const LabelCanvas = document.createElement("canvas");
  LabelCanvas.width = 768;
  LabelCanvas.height = 192;
  const Context = LabelCanvas.getContext("2d");
  Context.fillStyle = "#c89b62";
  Context.fillRect(0, 0, LabelCanvas.width, LabelCanvas.height);
  Context.strokeStyle = "#4b3421";
  Context.lineWidth = 14;
  Context.strokeRect(7, 7, LabelCanvas.width - 14, LabelCanvas.height - 14);
  Context.fillStyle = "#211a14";
  Context.font = "800 68px Arial";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.fillText(Text, LabelCanvas.width / 2, LabelCanvas.height / 2 + 3);
  const Texture = new THREE.CanvasTexture(LabelCanvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  return Texture;
}

function AddSectionSign(Chunk, Text, Z) {
  const Texture = CreateLabelTexture(Text);
  const Group = new THREE.Group();
  Group.name = "SectionSign";
  Group.userData.ChunkId = Chunk.Id;
  const Front = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 1.14), new THREE.MeshBasicMaterial({ map: Texture, side: THREE.FrontSide }));
  Front.position.z = 0.012;
  Group.add(Front);
  const Back = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 1.14), new THREE.MeshBasicMaterial({ map: Texture, side: THREE.FrontSide }));
  Back.position.z = -0.012;
  Back.rotation.y = Math.PI;
  Group.add(Back);
  Group.position.set(0, 2.87, Z);
  Chunk.Group.add(Group);
  Box("SignMount", new THREE.Vector3(4.95, 0.06, 0.09), new THREE.Vector3(0, 3.48, Z), TrimMaterial, Chunk);
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
    Light.userData.FlickerSeed = Chunk.Index * 5.17 + Z * 0.11;
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

function AddModelCollision(Name, X, Z, Rotation, ChunkId) {
  const Profile = CollisionProfiles[Name];
  if (!Profile) return;
  const [Width, Depth] = Profile;
  const C = Math.abs(Math.cos(Rotation));
  const S = Math.abs(Math.sin(Rotation));
  const RotatedWidth = Width * C + Depth * S;
  const RotatedDepth = Width * S + Depth * C;
  const HalfX = Math.max(0.16, RotatedWidth * 0.5 - 0.055);
  const HalfZ = Math.max(0.16, RotatedDepth * 0.5 - 0.055);
  AddCollision(new THREE.Box3(
    new THREE.Vector3(X - HalfX, 0, Z - HalfZ),
    new THREE.Vector3(X + HalfX, 2.5, Z + HalfZ)
  ), ChunkId, Name);
}

async function SpawnModel(Chunk, Name, X, Z, Rotation = 0) {
  if (!ActiveChunks.has(Chunk.Index)) return;
  try {
    const Template = await GetModelTemplate(Name);
    if (!ActiveChunks.has(Chunk.Index)) return;
    const Model = Template.clone(true);
    Model.position.x += X;
    Model.position.z += Z;
    Model.rotation.y = Rotation;
    Model.name = Name;
    Model.userData.ChunkId = Chunk.Id;
    Scene.add(Model);
    Chunk.Models.push(Model);
    AddModelCollision(Name, X, Z, Rotation, Chunk.Id);
    LoadedDisplays += 1;
  } catch (Error) {
    console.warn(`Could not load ${Name}`, Error);
  }
}

function SpawnCactusMarker(Chunk, X, Z, Rotation = 0) {
  const Marker = new THREE.Group();
  Marker.name = "Houseplant_3";
  Marker.position.set(X, 0, Z);
  Marker.rotation.y = Rotation;
  Marker.userData.ChunkId = Chunk.Id;
  Scene.add(Marker);
  Chunk.Models.push(Marker);
}

function AddRug(Chunk, X, Z, Width, Depth, Seed) {
  const Colors = [0x574236, 0x37494b, 0x4a3d50, 0x4c493a, 0x3e4740, 0x493d35];
  const Material = new THREE.MeshStandardMaterial({ color: Colors[Math.floor(SeededRandom(Seed) * Colors.length)], roughness: 1 });
  Box("ShowroomRug", new THREE.Vector3(Width, 0.018, Depth), new THREE.Vector3(X, 0.012, Z), Material, Chunk);
}

function AddTask(Chunk, Type, X, Z) {
  const Group = new THREE.Group();
  Group.name = "StoreTask";
  Group.position.set(X, 0, Z);
  Group.userData.ChunkId = Chunk.Id;
  const Base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.92, 0.28), TaskMetalMaterial);
  Base.position.y = 0.46;
  Group.add(Base);
  const Screen = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.035), TaskGlowMaterial.clone());
  Screen.position.set(0, 0.62, 0.16);
  Group.add(Screen);
  const Handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.06), TrimMaterial);
  Handle.position.set(0.16, 0.32, 0.17);
  Group.add(Handle);
  Scene.add(Group);
  Chunk.TaskObjects.push(Group);
  const Labels = {
    breaker: "Reset the breaker",
    manifest: "Check the stock manifest",
    scanner: "Scan the damaged inventory"
  };
  const Task = {
    Id: `${Chunk.Id}:${Type}`,
    ChunkId: Chunk.Id,
    ChunkIndex: Chunk.Index,
    Type,
    Label: Labels[Type],
    Object: Group,
    Screen,
    Completed: false
  };
  Tasks.set(Task.Id, Task);
  Chunk.Tasks.push(Task.Id);
  return Task;
}

function PopulateLivingRoom(Chunk, CenterZ, Seed) {
  AddRug(Chunk, -9.5, CenterZ + 5.5, 5.0, 4.2, Seed + 1);
  AddRug(Chunk, 9.3, CenterZ - 5.5, 4.8, 4.0, Seed + 2);
  SpawnModel(Chunk, "Couch_Large1", -9.8, CenterZ + 5.6, 0);
  SpawnModel(Chunk, "Couch_L", 9.1, CenterZ - 5.6, Math.PI);
  SpawnModel(Chunk, "Chair_2", -7.7, CenterZ + 2.8, 0.4);
  SpawnModel(Chunk, "Chair_2", 7.6, CenterZ - 2.5, -0.45);
  SpawnModel(Chunk, "Table_RoundLarge", -9.5, CenterZ + 3.3, 0);
  SpawnModel(Chunk, "Table_RoundLarge", 9.1, CenterZ - 3.3, 0);
  SpawnModel(Chunk, "Light_Floor1", -7.2, CenterZ + 5.8, 0);
  SpawnModel(Chunk, "Light_Floor1", 7.0, CenterZ - 5.0, 0);
  if (Chunk.Index < 2) SpawnCactusMarker(Chunk, -12.0, CenterZ + 1.0, 0);
}

function PopulateBedroom(Chunk, CenterZ, Seed) {
  AddRug(Chunk, -9.4, CenterZ + 5.0, 5.2, 4.2, Seed + 3);
  AddRug(Chunk, 9.4, CenterZ - 5.0, 5.0, 4.2, Seed + 4);
  SpawnModel(Chunk, "Bed_King", -9.4, CenterZ + 4.8, 0);
  SpawnModel(Chunk, "Bed_King", 9.4, CenterZ - 4.8, Math.PI);
  SpawnModel(Chunk, "NightStand_2", -7.6, CenterZ + 4.8, 0);
  SpawnModel(Chunk, "NightStand_2", -11.2, CenterZ + 4.8, 0);
  SpawnModel(Chunk, "NightStand_2", 7.6, CenterZ - 4.8, 0);
  SpawnModel(Chunk, "NightStand_2", 11.2, CenterZ - 4.8, 0);
  SpawnModel(Chunk, "Bed_Single", -9.3, CenterZ - 5.0, 0);
  SpawnModel(Chunk, "Light_Floor1", 7.0, CenterZ + 1.0, 0);
}

function PopulateKitchen(Chunk, CenterZ) {
  for (let Offset = -2; Offset <= 2; Offset += 1) {
    SpawnModel(Chunk, "Kitchen_Cabinet1", -10.6 + Offset * 1.1, CenterZ + 5.4, 0);
    SpawnModel(Chunk, "Kitchen_Cabinet1", 10.6 - Offset * 1.1, CenterZ - 5.4, Math.PI);
  }
  SpawnModel(Chunk, "Kitchen_Fridge", -7.1, CenterZ + 5.3, 0);
  SpawnModel(Chunk, "Kitchen_Fridge", 7.1, CenterZ - 5.3, Math.PI);
  SpawnModel(Chunk, "Kitchen_Oven", -10.4, CenterZ + 2.4, Math.PI);
  SpawnModel(Chunk, "Kitchen_Sink", -8.7, CenterZ + 2.4, Math.PI);
  SpawnModel(Chunk, "Kitchen_Oven", 10.4, CenterZ - 2.4, 0);
  SpawnModel(Chunk, "Kitchen_Sink", 8.7, CenterZ - 2.4, 0);
}

function PopulateBathroom(Chunk, CenterZ) {
  SpawnModel(Chunk, "Bathroom_Bathtub", -10.0, CenterZ + 5.0, Math.PI / 2);
  SpawnModel(Chunk, "Bathroom_Bathtub", 10.0, CenterZ - 5.0, -Math.PI / 2);
  SpawnModel(Chunk, "Bathroom_Toilet", -7.8, CenterZ + 5.0, 0);
  SpawnModel(Chunk, "Bathroom_Toilet", -11.7, CenterZ + 1.8, 0);
  SpawnModel(Chunk, "Bathroom_Toilet", 7.8, CenterZ - 5.0, Math.PI);
  SpawnModel(Chunk, "Bathroom_Toilet", 11.7, CenterZ - 1.8, Math.PI);
  SpawnModel(Chunk, "Window_Large1", -5.7, CenterZ + 0.6, -Math.PI / 2);
  SpawnModel(Chunk, "Window_Large1", 5.7, CenterZ - 0.6, Math.PI / 2);
}

function PopulateWarehouse(Chunk, CenterZ, Seed) {
  for (const X of [-11.5, -8.0, 8.0, 11.5]) {
    SpawnModel(Chunk, "Shelf_Large", X, CenterZ + RandomRange(Seed + X * 4, -7, 7), X < 0 ? 0 : Math.PI);
  }
  for (const X of [-10.5, 10.5]) {
    SpawnModel(Chunk, "Bookshelf", X, CenterZ + RandomRange(Seed + X * 3, -7, 7), X < 0 ? 0 : Math.PI);
  }
  const BoxGeometry = new THREE.BoxGeometry(0.72, 0.56, 0.9);
  const Count = 20;
  const Boxes = new THREE.InstancedMesh(BoxGeometry, CardboardMaterial, Count);
  Boxes.name = "WarehouseBoxes";
  Boxes.userData.ChunkId = Chunk.Id;
  const Matrix = new THREE.Matrix4();
  for (let Index = 0; Index < Count; Index += 1) {
    const Side = Index % 2 === 0 ? -1 : 1;
    const Row = Math.floor(Index / 2) % 5;
    const Level = Math.floor(Index / 10);
    Matrix.makeTranslation(Side * (8.0 + (Index % 3) * 1.0), 0.28 + Level * 0.58, CenterZ - 6 + Row * 2.6);
    Boxes.setMatrixAt(Index, Matrix);
  }
  Boxes.instanceMatrix.needsUpdate = true;
  Chunk.Group.add(Boxes);
}

function PopulateShowroom(Chunk, CenterZ, Seed) {
  AddRug(Chunk, -9.5, CenterZ + 5.5, 4.4, 3.6, Seed + 8);
  AddRug(Chunk, 9.5, CenterZ - 5.5, 4.4, 3.6, Seed + 9);
  SpawnModel(Chunk, "Couch_Large1", -9.5, CenterZ + 5.5, 0);
  SpawnModel(Chunk, "Bed_Single", 9.5, CenterZ - 5.5, Math.PI);
  SpawnModel(Chunk, "Bookshelf", -11.5, CenterZ - 3.0, 0);
  SpawnModel(Chunk, "Kitchen_Fridge", 11.5, CenterZ + 2.0, Math.PI);
  SpawnModel(Chunk, "Chair_2", -7.8, CenterZ + 1.0, 0.4);
  SpawnModel(Chunk, "Table_RoundLarge", 8.6, CenterZ - 1.0, 0);
}

function BuildChunk(Index) {
  if (ActiveChunks.has(Index)) return ActiveChunks.get(Index);
  const Id = `Chunk-${Index}`;
  const CenterZ = ChunkCenterZ(Index);
  const TopZ = ChunkTopZ(Index);
  const BottomZ = ChunkBottomZ(Index);
  const Seed = ChunkSeed(Index);
  const Theme = Themes[Math.floor(SeededRandom(Seed + 11.17) * Themes.length)];
  const Group = new THREE.Group();
  Group.name = Id;
  Group.userData.ChunkId = Id;
  Scene.add(Group);
  const Chunk = { Id, Index, Theme, Seed, CenterZ, TopZ, BottomZ, Group, Models: [], Lights: [], Tasks: [], TaskObjects: [] };
  ActiveChunks.set(Index, Chunk);

  Box("Floor", new THREE.Vector3(34, 0.16, CHUNK_LENGTH + 0.25), new THREE.Vector3(0, -0.08, CenterZ), FloorMaterial, Chunk);
  Box("Ceiling", new THREE.Vector3(34, 0.14, CHUNK_LENGTH + 0.25), new THREE.Vector3(0, CEILING_HEIGHT, CenterZ), CeilingMaterial, Chunk);
  Box("WallLeft", new THREE.Vector3(0.20, 3.8, CHUNK_LENGTH + 0.25), new THREE.Vector3(-STORE_HALF_WIDTH, 1.86, CenterZ), WallMaterial, Chunk, true);
  Box("WallRight", new THREE.Vector3(0.20, 3.8, CHUNK_LENGTH + 0.25), new THREE.Vector3(STORE_HALF_WIDTH, 1.86, CenterZ), WallMaterial, Chunk, true);
  Box("BaseboardLeft", new THREE.Vector3(0.25, 0.18, CHUNK_LENGTH + 0.25), new THREE.Vector3(-16.87, 0.09, CenterZ), TrimMaterial, Chunk);
  Box("BaseboardRight", new THREE.Vector3(0.25, 0.18, CHUNK_LENGTH + 0.25), new THREE.Vector3(16.87, 0.09, CenterZ), TrimMaterial, Chunk);

  const PartitionSide = SeededRandom(Seed + 4.13) < 0.5 ? -1 : 1;
  AddPartition(Chunk, PartitionSide * 6.35, CenterZ + 5.2, 4.0);
  AddPartition(Chunk, -PartitionSide * 6.35, CenterZ - 5.2, 4.0);
  if (SeededRandom(Seed + 4) > 0.62) AddPartition(Chunk, PartitionSide * 11.8, CenterZ - 1.5, 3.1);
  AddSectionSign(Chunk, Theme, TopZ - 3.1);

  for (const Offset of [-9.0, 0, 9.0]) AddLightFixture(Chunk, 0, CenterZ + Offset, SeededRandom(Seed + Offset * 3) > 0.88);
  for (const Offset of [-7.5, 7.5]) {
    AddLightFixture(Chunk, -9.0, CenterZ + Offset, SeededRandom(Seed + Offset * 4) > 0.84);
    AddLightFixture(Chunk, 9.0, CenterZ - Offset, SeededRandom(Seed + Offset * 5) > 0.84);
  }

  if (Theme === "LIVING ROOM") PopulateLivingRoom(Chunk, CenterZ, Seed);
  else if (Theme === "BEDROOMS") PopulateBedroom(Chunk, CenterZ, Seed);
  else if (Theme === "KITCHENS") PopulateKitchen(Chunk, CenterZ);
  else if (Theme === "BATHROOMS") PopulateBathroom(Chunk, CenterZ);
  else if (Theme === "WAREHOUSE" || Theme === "STORAGE") PopulateWarehouse(Chunk, CenterZ, Seed);
  else PopulateShowroom(Chunk, CenterZ, Seed);

  if (Index > 0) {
    const TypeRoll = Math.floor(SeededRandom(Seed + 97.25) * 3);
    const Type = TypeRoll === 0 ? "breaker" : TypeRoll === 1 ? "manifest" : "scanner";
    const TaskX = SeededRandom(Seed + 98.75) < 0.5 ? -14.1 : 14.1;
    const TaskZ = CenterZ + RandomRange(Seed + 99, -5.0, 5.0);
    AddTask(Chunk, Type, TaskX, TaskZ);
  }
  return Chunk;
}

function RemoveChunk(Index) {
  const Chunk = ActiveChunks.get(Index);
  if (!Chunk) return;
  Scene.remove(Chunk.Group);
  for (const Model of Chunk.Models) Scene.remove(Model);
  for (const Object of Chunk.TaskObjects) Scene.remove(Object);
  for (const TaskId of Chunk.Tasks) Tasks.delete(TaskId);
  for (let CollisionIndex = CollisionBoxes.length - 1; CollisionIndex >= 0; CollisionIndex -= 1) {
    if (CollisionBoxes[CollisionIndex].ChunkId === Chunk.Id) CollisionBoxes.splice(CollisionIndex, 1);
  }
  for (let ChildIndex = Scene.children.length - 1; ChildIndex >= 0; ChildIndex -= 1) {
    const Child = Scene.children[ChildIndex];
    if (Child.userData?.ChunkId === Chunk.Id) Scene.remove(Child);
  }
  ActiveChunks.delete(Index);
}

function EnsureChunksAroundPlayer() {
  const CurrentIndex = ChunkIndexForZ(Camera.position.z);
  LastChunkIndex = CurrentIndex;
  const MinIndex = Math.max(0, CurrentIndex - CHUNKS_BEHIND);
  const MaxIndex = CurrentIndex + CHUNKS_AHEAD;
  for (let Index = MinIndex; Index <= MaxIndex; Index += 1) BuildChunk(Index);
  for (const Index of [...ActiveChunks.keys()]) {
    if (Index < MinIndex || Index > MaxIndex + 1 || ActiveChunks.size > MAX_ACTIVE_CHUNKS) RemoveChunk(Index);
  }
  if (AisleCounter) AisleCounter.textContent = `${CurrentIndex + 1}`;
}

function UpdateClock(Delta) {
  StoreSeconds += Delta * 14;
  if (StoreSeconds >= 24 * 60 * 60) StoreSeconds -= 24 * 60 * 60;
  let Hours = Math.floor(StoreSeconds / 3600);
  const Minutes = Math.floor((StoreSeconds % 3600) / 60);
  const Suffix = Hours >= 12 ? "PM" : "AM";
  Hours %= 12;
  if (Hours === 0) Hours = 12;
  GameClock.textContent = `${Hours}:${String(Minutes).padStart(2, "0")} ${Suffix}`;
}

function FindNearestPendingTask() {
  let Best = null;
  let BestDistance = Infinity;
  for (const Task of Tasks.values()) {
    if (Task.Completed || Task.ChunkIndex < LastChunkIndex - 1) continue;
    const Distance = Camera.position.distanceTo(Task.Object.position);
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
  } else Text = "Keep moving deeper. The store is still generating ahead of you.";
  if (Text !== LastObjectiveText) {
    LastObjectiveText = Text;
    ObjectiveText.textContent = Text;
  }
  if (TaskCounter) TaskCounter.textContent = `${CompletedTasks}`;
}

function UpdateInteractionPrompt() {
  if (!InteractPrompt) return;
  if (!CurrentTask || CurrentTask.Completed) {
    InteractPrompt.classList.remove("Show");
    return;
  }
  const Distance = Camera.position.distanceTo(CurrentTask.Object.position);
  if (Distance <= TASK_DISTANCE) {
    InteractPrompt.textContent = `[ E ] ${CurrentTask.Label.toUpperCase()}`;
    InteractPrompt.classList.add("Show");
  } else InteractPrompt.classList.remove("Show");
}

function CompleteTask(Task) {
  if (!Task || Task.Completed) return;
  Task.Completed = true;
  CompletedTasks += 1;
  Task.Screen.material = Task.Screen.material.clone();
  Task.Screen.material.color.setHex(0x23522c);
  Task.Screen.material.emissive.setHex(0x36d45b);
  Task.Screen.material.emissiveIntensity = 1.9;
  const Chunk = ActiveChunks.get(Task.ChunkIndex);
  if (Task.Type === "breaker" && Chunk) {
    for (const Light of Chunk.Lights) Light.userData.BaseIntensity = Math.max(Light.userData.BaseIntensity, 2.0);
  }
  if (Task.Type === "scanner") Task.Object.rotation.y += Math.PI * 2;
  CurrentTask = null;
  UpdateObjective();
}

function TryInteract() {
  if (!Started || !Controls.isLocked || !CurrentTask || CurrentTask.Completed) return;
  if (Camera.position.distanceTo(CurrentTask.Object.position) <= TASK_DISTANCE) CompleteTask(CurrentTask);
}

function IsBlocked(Position) {
  const Radius = PlayerApi?.GetPlayerRadius?.() || 0.43;
  for (const Entry of CollisionBoxes) {
    if (typeof Entry?.TestPlayerCollision === "function") {
      if (Entry.TestPlayerCollision(Position, Radius)) return true;
      continue;
    }
    const Bounds = Entry.Box || Entry;
    if (
      Position.x + Radius > Bounds.min.x && Position.x - Radius < Bounds.max.x &&
      Position.z + Radius > Bounds.min.z && Position.z - Radius < Bounds.max.z
    ) return true;
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

function UpdateLights(Time) {
  for (const Chunk of ActiveChunks.values()) {
    for (const Light of Chunk.Lights) {
      const Seed = Light.userData.FlickerSeed;
      const Buzz = Math.sin(Time * 9.2 + Seed) * 0.025;
      const Fault = Math.sin(Time * 0.72 + Seed * 1.9);
      let Intensity = Light.userData.BaseIntensity * (1 + Buzz);
      if (Fault > 0.992) Intensity *= 0.18;
      Light.intensity = Intensity;
    }
  }
}

function ShowError(Message) {
  ErrorText.textContent = Message;
  ErrorPanel.classList.remove("Hidden");
}

const Ambient = new THREE.AmbientLight(0xd9d2c5, 0.72);
Scene.add(Ambient);
const Hemisphere = new THREE.HemisphereLight(0xc7d0d1, 0x30281f, 0.66);
Scene.add(Hemisphere);
const FillLight = new THREE.DirectionalLight(0xffe6c2, 0.34);
FillLight.position.set(-7, 9, 6);
Scene.add(FillLight);

for (let Index = 0; Index <= CHUNKS_AHEAD; Index += 1) BuildChunk(Index);
PlayerApi?.Attach?.({ Scene, Camera, Renderer, CollisionBoxes });
BootStatus.textContent = `Store ready — endless aisles online • seed ${WorldSeed}.`;

function Animate() {
  const Delta = Math.min(GameTimer.getDelta(), 0.05);
  const Time = performance.now() / 1000;
  UpdateLights(Time);
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

window.__STORE_GAME_BUILD__ = "V0.11-R38";
window.__STORE_GAME__ = {
  Scene,
  Camera,
  Renderer,
  CollisionBoxes,
  ActiveChunks,
  Tasks,
  WorldSeed,
  ChunkSeed
};
Animate();