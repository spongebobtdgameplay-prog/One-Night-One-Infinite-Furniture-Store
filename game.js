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

const Scene = new THREE.Scene();
Scene.background = new THREE.Color(0x171816);
Scene.fog = new THREE.FogExp2(0x171816, 0.0075);

const PlayerEyeHeight = 1.68;
const Camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 130);
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
Renderer.toneMappingExposure = 1.12;

const Controls = new PointerLockControls(Camera, document.body);
const Loader = new GLTFLoader();
const GameTimer = new THREE.Clock();
const KeyState = new Set();
const CollisionBoxes = [];
const StoreLights = [];
const LightPanels = [];
const ModelCache = new Map();

let StoreSeconds = 23 * 60 * 60 + 57 * 60;
let Started = false;
let LoadedDisplays = 0;

function SeededRandom(Seed) {
  const Value = Math.sin(Seed * 12.9898 + 78.233) * 43758.5453;
  return Value - Math.floor(Value);
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
      Context.globalAlpha = 0.18;
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
      for (let Line = 0; Line < 42; Line += 1) {
        const Y = SeededRandom(Line * 7 + 2) * Size;
        const Width = 1 + SeededRandom(Line * 7 + 3) * 3;
        Context.strokeStyle = AccentColor;
        Context.globalAlpha = 0.08 + SeededRandom(Line * 7 + 4) * 0.14;
        Context.lineWidth = Width;
        Context.beginPath();
        Context.moveTo(0, Y);
        Context.bezierCurveTo(Size * 0.25, Y + 8, Size * 0.72, Y - 7, Size, Y + 3);
        Context.stroke();
      }
      Context.globalAlpha = 1;
    }

    if (Pattern === "metal") {
      Context.globalAlpha = 0.15;
      for (let Line = 0; Line < 100; Line += 1) {
        const Y = SeededRandom(Line * 11 + 5) * Size;
        Context.fillStyle = AccentColor;
        Context.fillRect(0, Y, Size, SeededRandom(Line * 11 + 6) > 0.65 ? 2 : 1);
      }
      Context.globalAlpha = 1;
    }

    if (Pattern === "ceramic") {
      for (let Dot = 0; Dot < 300; Dot += 1) {
        const X = SeededRandom(Dot * 5 + 20) * Size;
        const Y = SeededRandom(Dot * 5 + 21) * Size;
        Context.fillStyle = AccentColor;
        Context.globalAlpha = 0.035 + SeededRandom(Dot * 5 + 22) * 0.05;
        Context.fillRect(X, Y, 1, 1);
      }
      Context.globalAlpha = 1;
    }

    if (Pattern === "leaf") {
      for (let Patch = 0; Patch < 140; Patch += 1) {
        const X = SeededRandom(Patch * 3 + 50) * Size;
        const Y = SeededRandom(Patch * 3 + 51) * Size;
        const Radius = 3 + SeededRandom(Patch * 3 + 52) * 10;
        Context.fillStyle = AccentColor;
        Context.globalAlpha = 0.05 + SeededRandom(Patch * 3 + 53) * 0.11;
        Context.beginPath();
        Context.arc(X, Y, Radius, 0, Math.PI * 2);
        Context.fill();
      }
      Context.globalAlpha = 1;
    }
  });
}

const WallTexture = CreateTexture(256, 5, 5, (Context, Size) => {
  Context.fillStyle = "#77766f";
  Context.fillRect(0, 0, Size, Size);
  for (let Index = 0; Index < 900; Index += 1) {
    const X = SeededRandom(Index * 3 + 1) * Size;
    const Y = SeededRandom(Index * 3 + 2) * Size;
    const Shade = 90 + Math.floor(SeededRandom(Index * 3 + 3) * 55);
    Context.fillStyle = `rgba(${Shade},${Shade},${Shade - 4},0.08)`;
    Context.fillRect(X, Y, 1.2, 1.2);
  }
  const Grime = Context.createLinearGradient(0, 0, 0, Size);
  Grime.addColorStop(0, "rgba(255,255,255,0.035)");
  Grime.addColorStop(0.72, "rgba(40,34,28,0.02)");
  Grime.addColorStop(1, "rgba(28,22,18,0.23)");
  Context.fillStyle = Grime;
  Context.fillRect(0, 0, Size, Size);
});

const FloorTexture = CreateTexture(256, 10, 20, (Context, Size) => {
  Context.fillStyle = "#5f5a51";
  Context.fillRect(0, 0, Size, Size);
  for (let Index = 0; Index < 1000; Index += 1) {
    const X = SeededRandom(Index * 4 + 11) * Size;
    const Y = SeededRandom(Index * 4 + 12) * Size;
    const Bright = 62 + Math.floor(SeededRandom(Index * 4 + 13) * 52);
    Context.fillStyle = `rgba(${Bright},${Bright - 3},${Bright - 8},0.10)`;
    Context.fillRect(X, Y, 1.4, 1.4);
  }
  Context.strokeStyle = "rgba(36,32,27,0.38)";
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

const CeilingTexture = CreateTexture(256, 9, 18, (Context, Size) => {
  Context.fillStyle = "#86857f";
  Context.fillRect(0, 0, Size, Size);
  Context.strokeStyle = "rgba(54,55,53,0.52)";
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
const LeafTexture = CreateSurfaceTexture("#31513a", "#7f9f6e", "leaf");
const CardboardTexture = CreateSurfaceTexture("#92704c", "#caa477", "wood");

function Pbr(Map, Color, Roughness, Metalness = 0) {
  return new THREE.MeshStandardMaterial({ map: Map, color: Color, roughness: Roughness, metalness: Metalness });
}

const WallMaterial = Pbr(WallTexture, 0xc0bdb3, 0.93, 0.02);
const FloorMaterial = Pbr(FloorTexture, 0x9b9285, 0.96, 0.01);
const CeilingMaterial = Pbr(CeilingTexture, 0xbcbab0, 0.98, 0);
const TrimMaterial = new THREE.MeshStandardMaterial({ color: 0x322f2a, roughness: 0.8, metalness: 0.18 });
const LightHousingMaterial = new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: 0.68, metalness: 0.65 });
const CardboardMaterial = Pbr(CardboardTexture, 0xe1c19a, 0.95, 0);

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
  Window_Large1: [Pbr(DarkSteelTexture, 0x7f898c, 0.46, 0.65)],
  Houseplant_3: [Pbr(LeafTexture, 0xa5c593, 0.92), Pbr(CeramicTexture, 0xc6b9a7, 0.74)]
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
  Window_Large1: { Url: "Models/Architecture/GLB/Window_Large1.glb", Axis: "y", Target: 1.38 },
  Houseplant_3: { Url: "Models/Decor/GLB/Houseplant_3.glb", Axis: "y", Target: 1.08 }
};

function AddCollisionBox(Object, Padding = 0) {
  Object.updateMatrixWorld(true);
  const Bounds = new THREE.Box3().setFromObject(Object);
  if (Padding !== 0) Bounds.expandByScalar(Padding);
  CollisionBoxes.push(Bounds);
}

function Box(Name, Size, Position, Material, Collidable = false) {
  const Mesh = new THREE.Mesh(new THREE.BoxGeometry(Size.x, Size.y, Size.z), Material);
  Mesh.name = Name;
  Mesh.position.copy(Position);
  Scene.add(Mesh);
  if (Collidable) AddCollisionBox(Mesh);
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

function AddSectionSign(Text, Z) {
  const Texture = CreateLabelTexture(Text);
  const MaterialFront = new THREE.MeshBasicMaterial({ map: Texture, side: THREE.FrontSide });
  const MaterialBack = new THREE.MeshBasicMaterial({ map: Texture, side: THREE.FrontSide });
  const Group = new THREE.Group();

  const Front = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.2), MaterialFront);
  Front.position.z = 0.012;
  Group.add(Front);

  const Back = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.2), MaterialBack);
  Back.position.z = -0.012;
  Back.rotation.y = Math.PI;
  Group.add(Back);

  Group.position.set(0, 2.88, Z);
  Scene.add(Group);
  Box("SignMount", new THREE.Vector3(5.05, 0.06, 0.09), new THREE.Vector3(0, 3.52, Z), TrimMaterial);
  Box("SignPostLeft", new THREE.Vector3(0.05, 0.7, 0.05), new THREE.Vector3(-2.25, 3.17, Z), TrimMaterial);
  Box("SignPostRight", new THREE.Vector3(0.05, 0.7, 0.05), new THREE.Vector3(2.25, 3.17, Z), TrimMaterial);
}

function AddPartition(X, Z) {
  Box("ShowroomPartition", new THREE.Vector3(0.16, 2.30, 3.35), new THREE.Vector3(X, 1.15, Z), WallMaterial, true);
  Box("PartitionCap", new THREE.Vector3(0.24, 0.08, 3.45), new THREE.Vector3(X, 2.34, Z), TrimMaterial);
  Box("PartitionBase", new THREE.Vector3(0.23, 0.12, 3.42), new THREE.Vector3(X, 0.06, Z), TrimMaterial);
}

Box("Floor", new THREE.Vector3(34, 0.16, 68), new THREE.Vector3(0, -0.08, -19), FloorMaterial);
Box("Ceiling", new THREE.Vector3(34, 0.14, 68), new THREE.Vector3(0, 3.72, -19), CeilingMaterial);
Box("WallLeft", new THREE.Vector3(0.20, 3.8, 68), new THREE.Vector3(-17, 1.86, -19), WallMaterial);
Box("WallRight", new THREE.Vector3(0.20, 3.8, 68), new THREE.Vector3(17, 1.86, -19), WallMaterial);
Box("WallBack", new THREE.Vector3(34, 3.8, 0.20), new THREE.Vector3(0, 1.86, -53), WallMaterial);
Box("BaseboardLeft", new THREE.Vector3(0.25, 0.18, 68), new THREE.Vector3(-16.87, 0.09, -19), TrimMaterial);
Box("BaseboardRight", new THREE.Vector3(0.25, 0.18, 68), new THREE.Vector3(16.87, 0.09, -19), TrimMaterial);
Box("BaseboardBack", new THREE.Vector3(34, 0.18, 0.25), new THREE.Vector3(0, 0.09, -52.87), TrimMaterial);

for (const [X, Z] of [
  [-6.35, 1.0], [6.35, -7.0], [-6.35, -15.0], [6.35, -23.0],
  [-6.35, -31.0], [6.35, -39.0], [-6.35, -47.0]
]) AddPartition(X, Z);

const RugColors = [0x574236, 0x37494b, 0x4a3d50, 0x4c493a, 0x3e4740, 0x493d35];
const RugPlacements = [
  [-10.3, 1.6, 5.0], [9.3, 1.4, 4.8], [-9.6, -6.1, 4.6], [9.3, -6.5, 5.2],
  [9.5, -14.0, 5.4], [-9.6, -18.0, 4.8], [-9.0, -29.5, 6.5], [9.2, -31.0, 6.0],
  [9.3, -36.4, 5.2], [-9.5, -39.2, 5.0]
];

for (let Index = 0; Index < RugPlacements.length; Index += 1) {
  const [X, Z, Width] = RugPlacements[Index];
  const Material = new THREE.MeshStandardMaterial({ color: RugColors[Index % RugColors.length], roughness: 1 });
  Box("ShowroomRug", new THREE.Vector3(Width, 0.018, 3.6), new THREE.Vector3(X, 0.012, Z), Material);
}

AddSectionSign("LIVING ROOM", 4.8);
AddSectionSign("BEDROOMS", -10.5);
AddSectionSign("KITCHENS", -25.5);
AddSectionSign("BATHROOMS", -34.0);
AddSectionSign("WAREHOUSE", -45.0);

const Ambient = new THREE.AmbientLight(0xd9d2c5, 0.78);
Scene.add(Ambient);
const Hemisphere = new THREE.HemisphereLight(0xc7d0d1, 0x3b3026, 0.72);
Scene.add(Hemisphere);
const FillLight = new THREE.DirectionalLight(0xffe6c2, 0.38);
FillLight.position.set(-7, 9, 6);
Scene.add(FillLight);

const PanelGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffe8bd });
for (let Z = 6; Z >= -50; Z -= 7) {
  for (const X of [-9.5, 0, 9.5]) {
    Box("LightHousing", new THREE.Vector3(4.0, 0.08, 0.44), new THREE.Vector3(X, 3.57, Z), LightHousingMaterial);
    LightPanels.push(Box("LightGlow", new THREE.Vector3(3.55, 0.018, 0.24), new THREE.Vector3(X, 3.515, Z), PanelGlowMaterial));
  }
}

for (const [Index, Z] of [6, -5, -16, -27, -38, -49].entries()) {
  const Light = new THREE.PointLight(0xffe3b1, 2.25, 17, 1.75);
  Light.position.set(Index % 2 === 0 ? -2.2 : 2.2, 3.18, Z);
  Light.userData.BaseIntensity = 2.25;
  Light.userData.FlickerSeed = Index * 4.731 + 2;
  Scene.add(Light);
  StoreLights.push(Light);
}

const ModelPlacements = [
  ["Couch_Large1", -10.3, 2.2, 0], ["Couch_Large1", 10.0, 1.5, Math.PI],
  ["Couch_L", 9.3, -5.4, Math.PI], ["Couch_L", -9.5, -6.2, 0],
  ["Chair_2", -8.2, -2.5, 0.35], ["Chair_2", -11.8, -3.2, -0.3],
  ["Chair_2", 7.6, -8.0, 0.55], ["Chair_2", 11.4, -8.1, -0.45],
  ["Table_RoundLarge", -10.2, -0.7, 0], ["Table_RoundLarge", 9.5, -7.2, 0],
  ["Light_Floor1", -7.7, 2.2, 0], ["Light_Floor1", 7.4, 1.5, 0],
  ["Light_Floor1", -7.5, -7.0, 0], ["Houseplant_3", 7.2, -3.1, 0],
  ["Houseplant_3", -12.0, 0.5, 0], ["Houseplant_3", 11.5, -7.4, 0],

  ["Bed_King", 9.4, -13.7, Math.PI], ["Bed_King", -9.7, -14.1, 0],
  ["Bed_Single", -9.5, -19.0, 0], ["Bed_Single", 9.7, -20.0, Math.PI],
  ["NightStand_2", 7.7, -13.9, 0], ["NightStand_2", 11.2, -13.9, 0],
  ["NightStand_2", -7.7, -14.0, 0], ["NightStand_2", -11.4, -14.0, 0],
  ["NightStand_2", -8.0, -19.0, 0], ["NightStand_2", 8.2, -20.0, 0],
  ["Light_Floor1", 7.2, -17.0, 0], ["Light_Floor1", -7.3, -21.0, 0],
  ["Houseplant_3", 11.9, -17.0, 0], ["Houseplant_3", -11.7, -21.0, 0],

  ["Shelf_Large", 11.4, -24.0, Math.PI], ["Bookshelf", 8.6, -24.0, Math.PI],
  ["Shelf_Large", -11.2, -24.0, 0], ["Bookshelf", -8.4, -24.0, 0],
  ["Kitchen_Cabinet1", -11.4, -29.4, 0], ["Kitchen_Cabinet1", -10.1, -29.4, 0],
  ["Kitchen_Cabinet1", -8.8, -29.4, 0], ["Kitchen_Fridge", -7.2, -29.5, 0],
  ["Kitchen_Oven", -11.0, -31.9, Math.PI], ["Kitchen_Sink", -9.5, -31.9, Math.PI],
  ["Kitchen_Cabinet1", 7.2, -29.5, Math.PI], ["Kitchen_Cabinet1", 8.5, -29.5, Math.PI],
  ["Kitchen_Cabinet1", 9.8, -29.5, Math.PI], ["Kitchen_Fridge", 11.4, -29.5, Math.PI],
  ["Kitchen_Oven", 7.4, -32.0, 0], ["Kitchen_Sink", 9.0, -32.0, 0],
  ["Houseplant_3", -12.0, -27.3, 0], ["Houseplant_3", 11.8, -27.0, 0],

  ["Bathroom_Bathtub", 10.4, -36.0, Math.PI / 2], ["Bathroom_Bathtub", -10.4, -38.0, -Math.PI / 2],
  ["Bathroom_Toilet", 7.8, -36.5, Math.PI], ["Bathroom_Toilet", 11.8, -39.5, Math.PI],
  ["Bathroom_Toilet", -7.8, -38.5, 0], ["Bathroom_Toilet", -11.8, -41.0, 0],
  ["Window_Large1", 5.55, -41.8, Math.PI / 2], ["Window_Large1", -5.55, -40.0, -Math.PI / 2],

  ["Shelf_Large", -12.0, -46.0, 0], ["Shelf_Large", -8.5, -46.0, 0],
  ["Shelf_Large", 8.5, -47.0, Math.PI], ["Shelf_Large", 12.0, -47.0, Math.PI],
  ["Bookshelf", -11.0, -50.0, 0], ["Bookshelf", 11.0, -50.0, Math.PI],
  ["Door_3", -5.55, -50.8, Math.PI / 2], ["Door_3", 5.55, -50.8, -Math.PI / 2]
];

function EnsureUvs(Geometry) {
  if (Geometry.attributes.uv || !Geometry.attributes.position) return;
  Geometry.computeBoundingBox();
  const Box3 = Geometry.boundingBox;
  const Size = new THREE.Vector3();
  Box3.getSize(Size);
  const Position = Geometry.attributes.position;
  const Uvs = new Float32Array(Position.count * 2);
  const Dimensions = [
    { A: "x", B: "y", Area: Size.x * Size.y },
    { A: "x", B: "z", Area: Size.x * Size.z },
    { A: "z", B: "y", Area: Size.z * Size.y }
  ].sort((Left, Right) => Right.Area - Left.Area)[0];
  const MinA = Box3.min[Dimensions.A];
  const MinB = Box3.min[Dimensions.B];
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
  const Palette = MaterialPalettes[Name] || [Pbr(OakTexture, 0xffffff, 0.86)];
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
  if (!ModelCache.has(Name)) {
    ModelCache.set(Name, Loader.loadAsync(Definition.Url).then(Gltf => {
      const Template = Gltf.scene;
      PrepareModel(Name, Template);
      return Template;
    }));
  }
  return ModelCache.get(Name);
}

async function LoadModels() {
  for (const [Name, X, Z, Rotation] of ModelPlacements) {
    try {
      BootStatus.textContent = `Furnishing store ${LoadedDisplays + 1}/${ModelPlacements.length}: ${Name}`;
      const Template = await GetModelTemplate(Name);
      const Model = Template.clone(true);
      Model.position.x += X;
      Model.position.z += Z;
      Model.rotation.y = Rotation;
      Model.name = Name;
      Scene.add(Model);
      Model.updateMatrixWorld(true);
      AddCollisionBox(Model, Name === "Houseplant_3" || Name === "Light_Floor1" ? -0.16 : -0.07);
      LoadedDisplays += 1;
    } catch (Error) {
      console.warn(`Could not load ${Name}`, Error);
    }
  }
  BootStatus.textContent = `Store ready — ${LoadedDisplays} displays from ${ModelCache.size} model assets.`;
}

function AddWarehouseBoxes() {
  const Geometry = new THREE.BoxGeometry(0.72, 0.56, 0.9);
  const Count = 28;
  const Boxes = new THREE.InstancedMesh(Geometry, CardboardMaterial, Count);
  const Matrix = new THREE.Matrix4();
  for (let Index = 0; Index < Count; Index += 1) {
    const Side = Index % 2 === 0 ? -1 : 1;
    const Column = Math.floor(Index / 2) % 7;
    const Level = Math.floor(Index / 14);
    const X = Side * (7.6 + (Column % 3) * 1.05);
    const Z = -45.0 - Math.floor(Column / 3) * 1.2 - (Index % 3) * 0.18;
    const Y = 0.28 + Level * 0.58;
    Matrix.makeTranslation(X, Y, Z);
    Boxes.setMatrixAt(Index, Matrix);
  }
  Boxes.instanceMatrix.needsUpdate = true;
  Scene.add(Boxes);
}

AddWarehouseBoxes();

function ShowError(Message) {
  ErrorText.textContent = Message;
  ErrorPanel.classList.remove("Hidden");
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

function UpdateObjective() {
  const Z = Camera.position.z;
  let Objective = "Find a way through the showroom.";
  if (Z < -7) Objective = "The aisles are longer than they were before.";
  if (Z < -17) Objective = "Keep moving past the bedroom displays.";
  if (Z < -27) Objective = "Find a route through the kitchen section.";
  if (Z < -35) Objective = "Something is wrong with the back of the store.";
  if (Z < -45) Objective = "Reach the warehouse doors.";
  if (ObjectiveText.textContent !== Objective) ObjectiveText.textContent = Objective;
}

function IsBlocked(Position) {
  const Radius = 0.31;
  if (Position.x < -16.25 || Position.x > 16.25) return true;
  if (Position.z < -52.15 || Position.z > 8.85) return true;
  for (const Bounds of CollisionBoxes) {
    if (
      Position.x + Radius > Bounds.min.x && Position.x - Radius < Bounds.max.x &&
      Position.z + Radius > Bounds.min.z && Position.z - Radius < Bounds.max.z
    ) return true;
  }
  return false;
}

function UpdateMovement(Delta) {
  if (!Controls.isLocked) return;
  const Running = KeyState.has("ShiftLeft") || KeyState.has("ShiftRight");
  const Speed = Running ? 5.6 : 3.55;
  let Forward = 0;
  let Right = 0;
  if (KeyState.has("KeyW")) Forward += 1;
  if (KeyState.has("KeyS")) Forward -= 1;
  if (KeyState.has("KeyD")) Right += 1;
  if (KeyState.has("KeyA")) Right -= 1;
  const Length = Math.hypot(Forward, Right) || 1;
  Forward /= Length;
  Right /= Length;

  const BeforeForward = Camera.position.clone();
  Controls.moveForward(Forward * Speed * Delta);
  if (IsBlocked(Camera.position)) Camera.position.copy(BeforeForward);
  const BeforeSide = Camera.position.clone();
  Controls.moveRight(Right * Speed * Delta);
  if (IsBlocked(Camera.position)) Camera.position.copy(BeforeSide);
  Camera.position.y = PlayerEyeHeight;
}

function UpdateLights(Time) {
  for (let Index = 0; Index < StoreLights.length; Index += 1) {
    const Light = StoreLights[Index];
    const Seed = Light.userData.FlickerSeed;
    const Buzz = Math.sin(Time * 9.2 + Seed) * 0.025;
    const Fault = Math.sin(Time * 0.72 + Seed * 1.9);
    let Intensity = Light.userData.BaseIntensity * (1 + Buzz);
    if ((Index === 2 || Index === 5) && Fault > 0.988) Intensity *= 0.18;
    Light.intensity = Intensity;
  }
}

function Animate() {
  const Delta = Math.min(GameTimer.getDelta(), 0.05);
  const Time = performance.now() / 1000;
  UpdateLights(Time);
  if (Started) {
    UpdateMovement(Delta);
    UpdateClock(Delta);
    UpdateObjective();
  }
  Renderer.render(Scene, Camera);
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

addEventListener("keydown", Event => KeyState.add(Event.code));
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

LoadModels();
Animate();
