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

const Scene = new THREE.Scene();
Scene.background = new THREE.Color(0x0b0d10);
Scene.fog = new THREE.FogExp2(0x0b0d10, 0.018);

const Camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 180);
Camera.position.set(0, 1.72, 8);

const Renderer = new THREE.WebGLRenderer({ canvas: Canvas, antialias: true, powerPreference: "high-performance" });
Renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
Renderer.setSize(innerWidth, innerHeight, false);
Renderer.shadowMap.enabled = true;
Renderer.shadowMap.type = THREE.PCFSoftShadowMap;
Renderer.outputColorSpace = THREE.SRGBColorSpace;
Renderer.toneMapping = THREE.ACESFilmicToneMapping;
Renderer.toneMappingExposure = 0.82;

const Controls = new PointerLockControls(Camera, document.body);
const Loader = new GLTFLoader();
const Clock = new THREE.Clock();

const KeyState = new Set();
let StoreSeconds = 23 * 60 * 60 + 57 * 60;
let Started = false;

const Ambient = new THREE.HemisphereLight(0xaeb8c2, 0x2a211a, 0.48);
Scene.add(Ambient);

const KeyLight = new THREE.DirectionalLight(0xe6d8c7, 1.1);
KeyLight.position.set(-10, 14, 7);
KeyLight.castShadow = true;
KeyLight.shadow.mapSize.set(2048, 2048);
KeyLight.shadow.camera.left = -28;
KeyLight.shadow.camera.right = 28;
KeyLight.shadow.camera.top = 28;
KeyLight.shadow.camera.bottom = -28;
Scene.add(KeyLight);

function Material(Color, Roughness = 0.8, Metalness = 0) {
  return new THREE.MeshStandardMaterial({ color: Color, roughness: Roughness, metalness: Metalness });
}

function Box(Name, Size, Position, Mat, Cast = false) {
  const Mesh = new THREE.Mesh(new THREE.BoxGeometry(Size.x, Size.y, Size.z), Mat);
  Mesh.name = Name;
  Mesh.position.copy(Position);
  Mesh.castShadow = Cast;
  Mesh.receiveShadow = true;
  Scene.add(Mesh);
  return Mesh;
}

const FloorMaterial = Material(0x625a50, 0.93);
const WallMaterial = Material(0xaaa49b, 0.92);
const CeilingMaterial = Material(0x777a78, 0.95);
const DarkMetal = Material(0x34373a, 0.68, 0.55);

Box("Floor", new THREE.Vector3(34, 0.18, 62), new THREE.Vector3(0, -0.09, -16), FloorMaterial);
Box("Ceiling", new THREE.Vector3(34, 0.18, 62), new THREE.Vector3(0, 3.72, -16), CeilingMaterial);
Box("WallLeft", new THREE.Vector3(0.22, 3.8, 62), new THREE.Vector3(-17, 1.86, -16), WallMaterial);
Box("WallRight", new THREE.Vector3(0.22, 3.8, 62), new THREE.Vector3(17, 1.86, -16), WallMaterial);
Box("WallBack", new THREE.Vector3(34, 3.8, 0.22), new THREE.Vector3(0, 1.86, -47), WallMaterial);

for (let Z = 7; Z >= -43; Z -= 7) {
  for (const X of [-10, 0, 10]) {
    const Housing = Box("LightHousing", new THREE.Vector3(4.6, 0.08, 0.46), new THREE.Vector3(X, 3.57, Z), DarkMetal);
    const Light = new THREE.RectAreaLight(0xfff0d7, 2.1, 4.2, 0.25);
    Light.position.set(X, 3.48, Z);
    Light.rotation.x = -Math.PI / 2;
    Scene.add(Light);
    Housing.userData.Light = Light;
  }
}

for (let Z = 1; Z >= -39; Z -= 8) {
  Box("DividerLeft", new THREE.Vector3(0.16, 2.65, 5.1), new THREE.Vector3(-5.7, 1.325, Z), WallMaterial);
  Box("DividerRight", new THREE.Vector3(0.16, 2.65, 5.1), new THREE.Vector3(5.7, 1.325, Z - 3.5), WallMaterial);
}

const ModelPlacements = [
  ["Couch_Large1", "assets/models/living-room/Couch_Large1.glb", -10.5, -1.2, 0],
  ["Couch_L", "assets/models/living-room/Couch_L.glb", 9.4, -5.7, Math.PI],
  ["Chair_2", "assets/models/living-room/Chair_2.glb", -8.3, -8.8, 0.55],
  ["Table_RoundLarge", "assets/models/living-room/Table_RoundLarge.glb", -10.2, -5.1, 0],
  ["Bed_King", "assets/models/bedroom/Bed_King.glb", 9.4, -14.2, Math.PI],
  ["Bed_Single", "assets/models/bedroom/Bed_Single.glb", -9.6, -18.2, 0],
  ["NightStand_2", "assets/models/bedroom/NightStand_2.glb", -7.7, -18.3, 0],
  ["Bookshelf", "assets/models/storage/Bookshelf.glb", 9.8, -25.5, Math.PI],
  ["Kitchen_Fridge", "assets/models/kitchen/Kitchen_Fridge.glb", -10.2, -29.3, 0],
  ["Kitchen_Oven", "assets/models/kitchen/Kitchen_Oven.glb", -8.8, -29.3, 0],
  ["Kitchen_Sink", "assets/models/kitchen/Kitchen_Sink.glb", -7.2, -29.3, 0],
  ["Houseplant_3", "assets/models/decor/Houseplant_3.glb", 8.4, -10.1, 0]
];

function NormalizeModel(Model) {
  const Bounds = new THREE.Box3().setFromObject(Model);
  const Size = Bounds.getSize(new THREE.Vector3());
  const Center = Bounds.getCenter(new THREE.Vector3());
  Model.position.sub(Center);
  const Largest = Math.max(Size.x, Size.y, Size.z);
  const Scale = Largest > 0 ? 2.4 / Largest : 1;
  Model.scale.setScalar(Scale);
  const NewBounds = new THREE.Box3().setFromObject(Model);
  Model.position.y -= NewBounds.min.y;
  Model.traverse(Object => {
    if (!Object.isMesh) return;
    Object.castShadow = true;
    Object.receiveShadow = true;
  });
}

async function LoadModels() {
  let Loaded = 0;
  for (const [Name, Url, X, Z, Rotation] of ModelPlacements) {
    try {
      BootStatus.textContent = `Loading ${Name}...`;
      const Gltf = await Loader.loadAsync(Url);
      const Model = Gltf.scene;
      NormalizeModel(Model);
      Model.position.x += X;
      Model.position.z += Z;
      Model.rotation.y = Rotation;
      Scene.add(Model);
      Loaded += 1;
    } catch (Error) {
      console.warn(`Could not load ${Name}`, Error);
    }
  }
  BootStatus.textContent = Loaded ? `${Loaded} store models ready.` : "Store shell ready. Models are still being added.";
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
  Controls.moveForward(Forward * Speed * Delta);
  Controls.moveRight(Right * Speed * Delta);
  Camera.position.x = THREE.MathUtils.clamp(Camera.position.x, -16.2, 16.2);
  Camera.position.z = THREE.MathUtils.clamp(Camera.position.z, -46.2, 8.8);
  Camera.position.y = 1.72;
}

function Animate() {
  const Delta = Math.min(Clock.getDelta(), 0.05);
  if (Started) {
    UpdateMovement(Delta);
    UpdateClock(Delta);
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
addEventListener("resize", () => {
  Camera.aspect = innerWidth / innerHeight;
  Camera.updateProjectionMatrix();
  Renderer.setSize(innerWidth, innerHeight, false);
});
addEventListener("error", Event => ShowError(Event.message || "Unknown runtime error."));
addEventListener("unhandledrejection", Event => ShowError(String(Event.reason || "Unknown loading error.")));

LoadModels();
Animate();
