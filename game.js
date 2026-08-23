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
Scene.background = new THREE.Color(0x090b0d);
Scene.fog = new THREE.FogExp2(0x090b0d, 0.015);

const Camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 180);
Camera.position.set(0, 1.72, 8);

const Renderer = new THREE.WebGLRenderer({
  canvas: Canvas,
  antialias: true,
  powerPreference: "high-performance"
});
Renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
Renderer.setSize(innerWidth, innerHeight, false);
Renderer.shadowMap.enabled = true;
Renderer.shadowMap.type = THREE.PCFSoftShadowMap;
Renderer.outputColorSpace = THREE.SRGBColorSpace;
Renderer.toneMapping = THREE.ACESFilmicToneMapping;
Renderer.toneMappingExposure = 0.78;

const Controls = new PointerLockControls(Camera, document.body);
const Loader = new GLTFLoader();
const GameTimer = new THREE.Clock();
const KeyState = new Set();
const CollisionBoxes = [];
const StoreLights = [];

let StoreSeconds = 23 * 60 * 60 + 57 * 60;
let Started = false;
let LoadedModels = 0;

const Ambient = new THREE.HemisphereLight(0xaab2b8, 0x211b17, 0.42);
Scene.add(Ambient);

const KeyLight = new THREE.DirectionalLight(0xf0dfc7, 0.8);
KeyLight.position.set(-9, 12, 7);
KeyLight.castShadow = true;
KeyLight.shadow.mapSize.set(2048, 2048);
KeyLight.shadow.camera.left = -28;
KeyLight.shadow.camera.right = 28;
KeyLight.shadow.camera.top = 28;
KeyLight.shadow.camera.bottom = -28;
Scene.add(KeyLight);

function Material(Color, Roughness = 0.8, Metalness = 0) {
  return new THREE.MeshStandardMaterial({
    color: Color,
    roughness: Roughness,
    metalness: Metalness
  });
}

function AddCollisionBox(Object, Padding = 0) {
  Object.updateMatrixWorld(true);
  const Bounds = new THREE.Box3().setFromObject(Object);
  if (Padding !== 0) Bounds.expandByScalar(Padding);
  CollisionBoxes.push(Bounds);
}

function Box(Name, Size, Position, Mat, CastShadow = false, Collidable = false) {
  const Mesh = new THREE.Mesh(
    new THREE.BoxGeometry(Size.x, Size.y, Size.z),
    Mat
  );
  Mesh.name = Name;
  Mesh.position.copy(Position);
  Mesh.castShadow = CastShadow;
  Mesh.receiveShadow = true;
  Scene.add(Mesh);
  if (Collidable) AddCollisionBox(Mesh);
  return Mesh;
}

const FloorMaterial = Material(0x5a544c, 0.94);
const WallMaterial = Material(0xa39d93, 0.92);
const CeilingMaterial = Material(0x6f7372, 0.96);
const DarkMetal = Material(0x292c2e, 0.66, 0.58);
const SignMaterial = Material(0x8e5b31, 0.73);

Box("Floor", new THREE.Vector3(34, 0.18, 68), new THREE.Vector3(0, -0.09, -19), FloorMaterial);
Box("Ceiling", new THREE.Vector3(34, 0.18, 68), new THREE.Vector3(0, 3.72, -19), CeilingMaterial);
Box("WallLeft", new THREE.Vector3(0.22, 3.8, 68), new THREE.Vector3(-17, 1.86, -19), WallMaterial);
Box("WallRight", new THREE.Vector3(0.22, 3.8, 68), new THREE.Vector3(17, 1.86, -19), WallMaterial);
Box("WallBack", new THREE.Vector3(34, 3.8, 0.22), new THREE.Vector3(0, 1.86, -53), WallMaterial);

for (let Z = 7; Z >= -49; Z -= 7) {
  for (const X of [-10.5, 0, 10.5]) {
    Box(
      "LightHousing",
      new THREE.Vector3(4.6, 0.08, 0.46),
      new THREE.Vector3(X, 3.57, Z),
      DarkMetal
    );

    const Light = new THREE.RectAreaLight(0xffedd0, 2.3, 4.15, 0.26);
    Light.position.set(X, 3.48, Z);
    Light.rotation.x = -Math.PI / 2;
    Light.userData.BaseIntensity = 2.3;
    Light.userData.FlickerSeed = Math.random() * 100;
    StoreLights.push(Light);
    Scene.add(Light);
  }
}

for (let Z = 1; Z >= -45; Z -= 8) {
  Box(
    "DividerLeft",
    new THREE.Vector3(0.15, 2.68, 5.15),
    new THREE.Vector3(-5.75, 1.34, Z),
    WallMaterial,
    false,
    true
  );
  Box(
    "DividerRight",
    new THREE.Vector3(0.15, 2.68, 5.15),
    new THREE.Vector3(5.75, 1.34, Z - 3.5),
    WallMaterial,
    false,
    true
  );
}

for (const [TextX, TextZ] of [[-11.2, 5.2], [10.7, -9.2], [-10.9, -22], [10.8, -34.5]]) {
  Box(
    "ShowroomSign",
    new THREE.Vector3(3.8, 0.46, 0.1),
    new THREE.Vector3(TextX, 2.72, TextZ),
    SignMaterial
  );
}

const ModelPlacements = [
  ["Couch_Large1", "Models/LivingRoom/GLB/Couch_Large1.glb", -10.6, 3.0, 0],
  ["Couch_L", "Models/LivingRoom/GLB/Couch_L.glb", 9.3, -4.8, Math.PI],
  ["Chair_2", "Models/LivingRoom/GLB/Chair_2.glb", -8.4, -6.5, 0.45],
  ["Table_RoundLarge", "Models/LivingRoom/GLB/Table_RoundLarge.glb", -10.4, -3.4, 0],
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
  ["Door_3", "Models/Architecture/GLB/Door_3.glb", -5.55, -43.1, Math.PI / 2],
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
    Object.castShadow = true;
    Object.receiveShadow = true;
    if (Object.material) Object.material.side = THREE.FrontSide;
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

  if (LoadedModels === ModelPlacements.length) {
    BootStatus.textContent = `Store ready — ${LoadedModels} real models loaded.`;
  } else {
    BootStatus.textContent = `Store ready — ${LoadedModels}/${ModelPlacements.length} models loaded.`;
  }
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
  if (Z < -42) Objective = "Reach the door at the end of the aisle.";

  if (ObjectiveText.textContent !== Objective) ObjectiveText.textContent = Objective;
}

function IsBlocked(Position) {
  const Radius = 0.34;

  if (Position.x < -16.2 || Position.x > 16.2) return true;
  if (Position.z < -52.1 || Position.z > 8.8) return true;

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
  const Speed = Running ? 5.8 : 3.6;

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
    const BaseIntensity = Light.userData.BaseIntensity;
    const Seed = Light.userData.FlickerSeed;
    const SlowPulse = Math.sin(Time * 0.45 + Seed * 2.7);
    const FastBuzz = Math.sin(Time * 7.5 + Seed) * 0.035;
    let Intensity = BaseIntensity * (0.97 + FastBuzz);

    if (Index % 5 === 0 && SlowPulse > 0.96) Intensity *= 0.18;
    if (Index % 11 === 0 && SlowPulse < -0.985) Intensity = 0;

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
  Renderer.setSize(innerWidth, innerHeight, false);
});
addEventListener("error", Event => ShowError(Event.message || "Unknown runtime error."));
addEventListener("unhandledrejection", Event => ShowError(String(Event.reason || "Unknown loading error.")));

LoadModels();
Animate();
