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
Scene.fog = new THREE.FogExp2(0x171816, 0.0085);

const Camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 130);
Camera.position.set(0, 1.72, 8);

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
Renderer.toneMappingExposure = 1.08;

const Controls = new PointerLockControls(Camera, document.body);
const Loader = new GLTFLoader();
const GameTimer = new THREE.Clock();
const KeyState = new Set();
const CollisionBoxes = [];
const StoreLights = [];
const LightPanels = [];

let StoreSeconds = 23 * 60 * 60 + 57 * 60;
let Started = false;
let LoadedModels = 0;

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
  Texture.needsUpdate = true;
  return Texture;
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

  Context.strokeStyle = "rgba(55,52,47,0.36)";
  Context.lineWidth = 2;
  Context.beginPath();
  Context.moveTo(0, 2);
  Context.lineTo(Size, 2);
  Context.moveTo(0, Size - 2);
  Context.lineTo(Size, Size - 2);
  Context.stroke();

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

  for (let Index = 0; Index < 1200; Index += 1) {
    const X = SeededRandom(Index * 4 + 11) * Size;
    const Y = SeededRandom(Index * 4 + 12) * Size;
    const Bright = 62 + Math.floor(SeededRandom(Index * 4 + 13) * 52);
    Context.fillStyle = `rgba(${Bright},${Bright - 3},${Bright - 8},0.11)`;
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

  for (let Index = 0; Index < 8; Index += 1) {
    const X = SeededRandom(Index * 7 + 40) * Size;
    const Y = SeededRandom(Index * 7 + 41) * Size;
    const Radius = 12 + SeededRandom(Index * 7 + 42) * 26;
    const Stain = Context.createRadialGradient(X, Y, 0, X, Y, Radius);
    Stain.addColorStop(0, "rgba(35,29,23,0.13)");
    Stain.addColorStop(1, "rgba(35,29,23,0)");
    Context.fillStyle = Stain;
    Context.fillRect(X - Radius, Y - Radius, Radius * 2, Radius * 2);
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

  for (let Index = 0; Index < 650; Index += 1) {
    const X = SeededRandom(Index * 2 + 90) * Size;
    const Y = SeededRandom(Index * 2 + 91) * Size;
    Context.fillStyle = "rgba(48,48,45,0.13)";
    Context.fillRect(X, Y, 1, 1);
  }
});

const WallMaterial = new THREE.MeshStandardMaterial({
  map: WallTexture,
  color: 0xc0bdb3,
  roughness: 0.93,
  metalness: 0.02
});

const FloorMaterial = new THREE.MeshStandardMaterial({
  map: FloorTexture,
  color: 0x9b9285,
  roughness: 0.96,
  metalness: 0.01
});

const CeilingMaterial = new THREE.MeshStandardMaterial({
  map: CeilingTexture,
  color: 0xbcbab0,
  roughness: 0.98,
  metalness: 0
});

const TrimMaterial = new THREE.MeshStandardMaterial({
  color: 0x322f2a,
  roughness: 0.8,
  metalness: 0.18
});

const SignMaterial = new THREE.MeshStandardMaterial({
  color: 0x8b542a,
  roughness: 0.72,
  metalness: 0.04
});

const RugMaterial = new THREE.MeshStandardMaterial({
  color: 0x443a32,
  roughness: 1,
  metalness: 0
});

const LightHousingMaterial = new THREE.MeshStandardMaterial({
  color: 0x26282a,
  roughness: 0.68,
  metalness: 0.65
});

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
  Mesh.castShadow = false;
  Mesh.receiveShadow = false;
  Scene.add(Mesh);
  if (Collidable) AddCollisionBox(Mesh);
  return Mesh;
}

function CreateLabelTexture(Text) {
  const LabelCanvas = document.createElement("canvas");
  LabelCanvas.width = 512;
  LabelCanvas.height = 128;
  const Context = LabelCanvas.getContext("2d");
  Context.fillStyle = "#c89b62";
  Context.fillRect(0, 0, LabelCanvas.width, LabelCanvas.height);
  Context.strokeStyle = "#4b3421";
  Context.lineWidth = 10;
  Context.strokeRect(5, 5, LabelCanvas.width - 10, LabelCanvas.height - 10);
  Context.fillStyle = "#211a14";
  Context.font = "700 46px Arial";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.fillText(Text, LabelCanvas.width / 2, LabelCanvas.height / 2 + 2);
  const Texture = new THREE.CanvasTexture(LabelCanvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  return Texture;
}

function AddSectionSign(Text, Z) {
  const Texture = CreateLabelTexture(Text);
  const Material = new THREE.MeshBasicMaterial({ map: Texture, side: THREE.DoubleSide });
  const Sign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.2), Material);
  Sign.position.set(0, 2.88, Z);
  Scene.add(Sign);
  Box("SignMount", new THREE.Vector3(5.05, 0.06, 0.08), new THREE.Vector3(0, 3.52, Z), TrimMaterial);
  Box("SignPostLeft", new THREE.Vector3(0.05, 0.7, 0.05), new THREE.Vector3(-2.25, 3.17, Z), TrimMaterial);
  Box("SignPostRight", new THREE.Vector3(0.05, 0.7, 0.05), new THREE.Vector3(2.25, 3.17, Z), TrimMaterial);
}

function AddPartition(X, Z) {
  const Panel = Box(
    "ShowroomPartition",
    new THREE.Vector3(0.16, 2.36, 3.55),
    new THREE.Vector3(X, 1.18, Z),
    WallMaterial,
    true
  );
  Box("PartitionCap", new THREE.Vector3(0.24, 0.08, 3.65), new THREE.Vector3(X, 2.39, Z), TrimMaterial);
  Box("PartitionBase", new THREE.Vector3(0.23, 0.12, 3.62), new THREE.Vector3(X, 0.06, Z), TrimMaterial);
  Panel.userData.IsPartition = true;
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
  [-6.35, 1.0],
  [6.35, -7.0],
  [-6.35, -15.0],
  [6.35, -23.0],
  [-6.35, -31.0],
  [6.35, -39.0],
  [-6.35, -47.0]
]) {
  AddPartition(X, Z);
}

for (const [X, Z, ScaleX] of [
  [-10.3, 1.6, 4.8],
  [9.3, -5.2, 5.4],
  [9.5, -14.0, 5.2],
  [-9.6, -18.0, 4.6],
  [-9.0, -29.5, 6.3],
  [9.3, -36.4, 5.0]
]) {
  Box("ShowroomRug", new THREE.Vector3(ScaleX, 0.018, 3.6), new THREE.Vector3(X, 0.012, Z), RugMaterial);
}

AddSectionSign("LIVING ROOM", 4.6);
AddSectionSign("BEDROOMS", -11.0);
AddSectionSign("KITCHENS", -26.0);
AddSectionSign("BATHROOMS", -34.0);
AddSectionSign("WAREHOUSE", -45.5);

const Ambient = new THREE.AmbientLight(0xd9d2c5, 0.72);
Scene.add(Ambient);

const Hemisphere = new THREE.HemisphereLight(0xc7d0d1, 0x3b3026, 0.68);
Scene.add(Hemisphere);

const FillLight = new THREE.DirectionalLight(0xffe6c2, 0.42);
FillLight.position.set(-7, 9, 6);
Scene.add(FillLight);

const PanelGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffe8bd });

for (let Z = 6; Z >= -50; Z -= 7) {
  for (const X of [-9.5, 0, 9.5]) {
    Box("LightHousing", new THREE.Vector3(4.0, 0.08, 0.44), new THREE.Vector3(X, 3.57, Z), LightHousingMaterial);
    const Glow = Box("LightGlow", new THREE.Vector3(3.55, 0.018, 0.24), new THREE.Vector3(X, 3.515, Z), PanelGlowMaterial);
    LightPanels.push(Glow);
  }
}

for (const [Index, Z] of [6, -5, -16, -27, -38, -49].entries()) {
  const Light = new THREE.PointLight(0xffe3b1, 2.25, 17, 1.75);
  Light.position.set(Index % 2 === 0 ? -2.2 : 2.2, 3.18, Z);
  Light.castShadow = false;
  Light.userData.BaseIntensity = 2.25;
  Light.userData.FlickerSeed = Index * 4.731 + 2;
  Scene.add(Light);
  StoreLights.push(Light);
}

const ModelPlacements = [
  ["Couch_Large1", "Models/LivingRoom/GLB/Couch_Large1.glb", -10.6, 2.4, 0],
  ["Couch_L", "Models/LivingRoom/GLB/Couch_L.glb", 9.3, -4.8, Math.PI],
  ["Chair_2", "Models/LivingRoom/GLB/Chair_2.glb", -8.4, -6.5, 0.45],
  ["Table_RoundLarge", "Models/LivingRoom/GLB/Table_RoundLarge.glb", -10.4, -2.6, 0],
  ["Bed_King", "Models/Bedroom/GLB/Bed_King.glb", 9.5, -13.8, Math.PI],
  ["Bed_Single", "Models/Bedroom/GLB/Bed_Single.glb", -9.7, -17.8, 0],
  ["NightStand_2", "Models/Bedroom/GLB/NightStand_2.glb", -8.5, -17.5, 0],
  ["Shelf_Large", "Models/Storage/GLB/Shelf_Large.glb", 11.1, -24.4, Math.PI],
  ["Bookshelf", "Models/Storage/GLB/Bookshelf.glb", 8.8, -24.4, Math.PI],
  ["Kitchen_Cabinet1", "Models/Kitchen/GLB/Kitchen_Cabinet1.glb", -11.2, -29.6, 0],
  ["Kitchen_Fridge", "Models/Kitchen/GLB/Kitchen_Fridge.glb", -9.8, -29.6, 0],
  ["Kitchen_Oven", "Models/Kitchen/GLB/Kitchen_Oven.glb", -8.3, -29.6, 0],
  ["Kitchen_Sink", "Models/Kitchen/GLB/Kitchen_Sink.glb", -6.9, -29.6, 0],
  ["Bathroom_Bathtub", "Models/Bathroom/GLB/Bathroom_Bathtub.glb", 10.3, -36.3, Math.PI / 2],
  ["Bathroom_Toilet", "Models/Bathroom/GLB/Bathroom_Toilet.glb", 7.9, -37.0, Math.PI],
  ["Light_Floor1", "Models/Lighting/GLB/Light_Floor1.glb", -8.1, 2.4, 0],
  ["Door_3", "Models/Architecture/GLB/Door_3.glb", -5.55, -50.7, Math.PI / 2],
  ["Window_Large1", "Models/Architecture/GLB/Window_Large1.glb", 5.55, -43.2, Math.PI / 2],
  ["Houseplant_3", "Models/Decor/GLB/Houseplant_3.glb", 8.0, -8.2, 0]
];

function PrepareModel(Model) {
  Model.scale.setScalar(0.5);
  Model.updateMatrixWorld(true);

  const Bounds = new THREE.Box3().setFromObject(Model);
  const Center = Bounds.getCenter(new THREE.Vector3());
  Model.position.x -= Center.x;
  Model.position.z -= Center.z;

  Model.updateMatrixWorld(true);
  const GroundedBounds = new THREE.Box3().setFromObject(Model);
  Model.position.y -= GroundedBounds.min.y;

  Model.traverse(Object => {
    if (!Object.isMesh) return;
    Object.castShadow = false;
    Object.receiveShadow = false;

    const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
    for (const Material of Materials) {
      if (!Material) continue;
      Material.side = THREE.FrontSide;
      if (Material.color) Material.color.multiplyScalar(1.12);
      if ("roughness" in Material) Material.roughness = Math.max(0.52, Material.roughness ?? 0.75);
      Material.needsUpdate = true;
    }
  });
}

async function LoadModels() {
  for (const [Name, Url, X, Z, Rotation] of ModelPlacements) {
    try {
      BootStatus.textContent = `Loading furniture ${LoadedModels + 1}/${ModelPlacements.length}: ${Name}`;
      const Gltf = await Loader.loadAsync(Url);
      const Model = Gltf.scene;
      PrepareModel(Model);
      Model.position.x += X;
      Model.position.z += Z;
      Model.rotation.y = Rotation;
      Model.name = Name;
      Scene.add(Model);
      Model.updateMatrixWorld(true);
      AddCollisionBox(Model, -0.08);
      LoadedModels += 1;
    } catch (Error) {
      console.warn(`Could not load ${Name}`, Error);
    }
  }

  BootStatus.textContent = LoadedModels === ModelPlacements.length
    ? `Store ready — ${LoadedModels} real models loaded.`
    : `Store ready — ${LoadedModels}/${ModelPlacements.length} models loaded.`;
}

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
  if (Z < -45) Objective = "Reach the warehouse door.";
  if (ObjectiveText.textContent !== Objective) ObjectiveText.textContent = Objective;
}

function IsBlocked(Position) {
  const Radius = 0.32;
  if (Position.x < -16.25 || Position.x > 16.25) return true;
  if (Position.z < -52.15 || Position.z > 8.85) return true;

  for (const Bounds of CollisionBoxes) {
    if (
      Position.x + Radius > Bounds.min.x &&
      Position.x - Radius < Bounds.max.x &&
      Position.z + Radius > Bounds.min.z &&
      Position.z - Radius < Bounds.max.z
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

  Camera.position.y = 1.72;
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
