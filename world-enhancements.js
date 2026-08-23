import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const State = {
  Scene: null,
  Camera: null,
  Renderer: null,
  Initialized: false,
  ProcessedRoots: new WeakSet(),
  ProcessedPlants: new WeakSet(),
  EnhancedGeometry: new Map(),
  ScanTimer: null
};

const OriginalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function(Scene, Camera) {
  if (!State.Scene) {
    State.Scene = Scene;
    State.Camera = Camera;
    State.Renderer = this;
    setTimeout(InitializeWorldEnhancements, 0);
  }
  return OriginalRender.call(this, Scene, Camera);
};

function SeededRandom(Seed) {
  const Value = Math.sin(Seed * 91.717 + 18.113) * 43758.5453;
  return Value - Math.floor(Value);
}

function MakeCanvasTexture(Size, Draw) {
  const Canvas = document.createElement("canvas");
  Canvas.width = Size;
  Canvas.height = Size;
  const Context = Canvas.getContext("2d");
  Draw(Context, Size);
  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.wrapS = THREE.RepeatWrapping;
  Texture.wrapT = THREE.RepeatWrapping;
  Texture.colorSpace = THREE.SRGBColorSpace;
  Texture.anisotropy = Math.min(4, State.Renderer?.capabilities.getMaxAnisotropy?.() || 1);
  return Texture;
}

const CactusTexture = MakeCanvasTexture(256, (Context, Size) => {
  Context.fillStyle = "#376c43";
  Context.fillRect(0, 0, Size, Size);

  for (let Stripe = 0; Stripe < 14; Stripe += 1) {
    const X = Stripe * (Size / 14);
    const Gradient = Context.createLinearGradient(X, 0, X + Size / 14, 0);
    Gradient.addColorStop(0, "rgba(18,63,32,.52)");
    Gradient.addColorStop(.45, "rgba(107,151,86,.24)");
    Gradient.addColorStop(1, "rgba(21,72,36,.48)");
    Context.fillStyle = Gradient;
    Context.fillRect(X, 0, Size / 14 + 1, Size);
  }

  for (let Dot = 0; Dot < 520; Dot += 1) {
    const X = SeededRandom(Dot * 4 + 1) * Size;
    const Y = SeededRandom(Dot * 4 + 2) * Size;
    const Radius = .4 + SeededRandom(Dot * 4 + 3) * 1.8;
    Context.fillStyle = SeededRandom(Dot * 4 + 4) > .5 ? "rgba(186,205,151,.16)" : "rgba(8,42,22,.18)";
    Context.beginPath();
    Context.arc(X, Y, Radius, 0, Math.PI * 2);
    Context.fill();
  }
});
CactusTexture.repeat.set(2.2, 3.5);

const TerracottaTexture = MakeCanvasTexture(192, (Context, Size) => {
  Context.fillStyle = "#8a4b30";
  Context.fillRect(0, 0, Size, Size);
  for (let Dot = 0; Dot < 700; Dot += 1) {
    const X = SeededRandom(Dot * 3 + 4) * Size;
    const Y = SeededRandom(Dot * 3 + 5) * Size;
    const Shade = 75 + Math.floor(SeededRandom(Dot * 3 + 6) * 80);
    Context.fillStyle = `rgba(${Shade + 45},${Shade},${Math.max(25, Shade - 30)},.12)`;
    Context.fillRect(X, Y, 1.4, 1.4);
  }
  Context.fillStyle = "rgba(255,198,139,.08)";
  Context.fillRect(0, 18, Size, 5);
});
TerracottaTexture.repeat.set(2, 2);

const CactusMaterial = new THREE.MeshStandardMaterial({
  map: CactusTexture,
  color: 0x78a968,
  roughness: .86,
  metalness: 0
});

const PotMaterial = new THREE.MeshStandardMaterial({
  map: TerracottaTexture,
  color: 0xc17c55,
  roughness: .94,
  metalness: 0
});

const SoilMaterial = new THREE.MeshStandardMaterial({
  color: 0x21160f,
  roughness: 1,
  metalness: 0
});

const SpineMaterial = new THREE.MeshStandardMaterial({
  color: 0xd8cfb2,
  roughness: .78,
  metalness: 0
});

function MakeRoundedCactusSegment(Radius, Height) {
  const Group = new THREE.Group();
  const Body = new THREE.Mesh(new THREE.CylinderGeometry(Radius, Radius * .97, Height, 28, 8, false), CactusMaterial);
  Group.add(Body);

  const Cap = new THREE.Mesh(new THREE.SphereGeometry(Radius, 28, 16), CactusMaterial);
  Cap.scale.y = .72;
  Cap.position.y = Height * .5;
  Group.add(Cap);
  return Group;
}

function AddMainBodySpines(Group, Radius, BottomY, TopY) {
  const Rings = 7;
  const Around = 10;
  const Geometry = new THREE.ConeGeometry(.007, .055, 5);
  const Spines = new THREE.InstancedMesh(Geometry, SpineMaterial, Rings * Around);
  const Matrix = new THREE.Matrix4();
  const Position = new THREE.Vector3();
  const Quaternion = new THREE.Quaternion();
  const Scale = new THREE.Vector3(1, 1, 1);
  const Up = new THREE.Vector3(0, 1, 0);
  const Direction = new THREE.Vector3();
  let Index = 0;

  for (let Ring = 0; Ring < Rings; Ring += 1) {
    const Y = THREE.MathUtils.lerp(BottomY, TopY, Ring / Math.max(1, Rings - 1));
    for (let Point = 0; Point < Around; Point += 1) {
      const Angle = Point / Around * Math.PI * 2 + (Ring % 2) * .15;
      Direction.set(Math.cos(Angle), .08, Math.sin(Angle)).normalize();
      Position.set(Math.cos(Angle) * (Radius + .018), Y, Math.sin(Angle) * (Radius + .018));
      Quaternion.setFromUnitVectors(Up, Direction);
      Matrix.compose(Position, Quaternion, Scale);
      Spines.setMatrixAt(Index, Matrix);
      Index += 1;
    }
  }

  Spines.instanceMatrix.needsUpdate = true;
  Group.add(Spines);
}

function CreateCactus() {
  const Group = new THREE.Group();
  Group.name = "DetailedCactus";

  const Pot = new THREE.Mesh(new THREE.CylinderGeometry(.235, .17, .31, 32, 4, false), PotMaterial);
  Pot.position.y = .155;
  Group.add(Pot);

  const Rim = new THREE.Mesh(new THREE.TorusGeometry(.232, .025, 10, 32), PotMaterial);
  Rim.rotation.x = Math.PI / 2;
  Rim.position.y = .30;
  Group.add(Rim);

  const Soil = new THREE.Mesh(new THREE.CylinderGeometry(.205, .205, .018, 32), SoilMaterial);
  Soil.position.y = .315;
  Group.add(Soil);

  const Main = MakeRoundedCactusSegment(.132, .61);
  Main.position.y = .62;
  Group.add(Main);

  const LeftArm = MakeRoundedCactusSegment(.075, .30);
  LeftArm.rotation.z = Math.PI / 2;
  LeftArm.position.set(-.20, .67, 0);
  Group.add(LeftArm);

  const LeftUp = MakeRoundedCactusSegment(.071, .25);
  LeftUp.position.set(-.34, .78, 0);
  Group.add(LeftUp);

  const RightArm = MakeRoundedCactusSegment(.066, .23);
  RightArm.rotation.z = -Math.PI / 2;
  RightArm.position.set(.18, .77, 0);
  Group.add(RightArm);

  const RightUp = MakeRoundedCactusSegment(.062, .19);
  RightUp.position.set(.28, .86, 0);
  Group.add(RightUp);

  AddMainBodySpines(Group, .132, .37, .90);
  return Group;
}

function AddAtmosphereOverlay() {
  if (document.getElementById("StoreAtmosphereOverlay")) return;

  const NoiseCanvas = document.createElement("canvas");
  NoiseCanvas.width = 96;
  NoiseCanvas.height = 96;
  const Context = NoiseCanvas.getContext("2d");
  const Image = Context.createImageData(96, 96);
  for (let Index = 0; Index < Image.data.length; Index += 4) {
    const Value = Math.floor(Math.random() * 255);
    Image.data[Index] = Value;
    Image.data[Index + 1] = Value;
    Image.data[Index + 2] = Value;
    Image.data[Index + 3] = 18;
  }
  Context.putImageData(Image, 0, 0);

  const Overlay = document.createElement("div");
  Overlay.id = "StoreAtmosphereOverlay";
  Overlay.style.position = "fixed";
  Overlay.style.inset = "0";
  Overlay.style.zIndex = "8";
  Overlay.style.pointerEvents = "none";
  Overlay.style.backgroundImage = `radial-gradient(circle at 50% 46%, transparent 42%, rgba(0,0,0,.18) 72%, rgba(0,0,0,.46) 100%), url(${NoiseCanvas.toDataURL()})`;
  Overlay.style.backgroundRepeat = "no-repeat, repeat";
  Overlay.style.backgroundSize = "100% 100%, 96px 96px";
  Overlay.style.opacity = ".72";
  Overlay.style.mixBlendMode = "multiply";
  document.body.appendChild(Overlay);
}

function CreateGrimeTexture() {
  return MakeCanvasTexture(256, (Context, Size) => {
    Context.clearRect(0, 0, Size, Size);
    for (let Blob = 0; Blob < 18; Blob += 1) {
      const X = SeededRandom(Blob * 7 + 1) * Size;
      const Y = SeededRandom(Blob * 7 + 2) * Size;
      const Radius = 18 + SeededRandom(Blob * 7 + 3) * 60;
      const Gradient = Context.createRadialGradient(X, Y, 0, X, Y, Radius);
      Gradient.addColorStop(0, "rgba(24,20,15,.20)");
      Gradient.addColorStop(.5, "rgba(35,29,20,.08)");
      Gradient.addColorStop(1, "rgba(0,0,0,0)");
      Context.fillStyle = Gradient;
      Context.fillRect(X - Radius, Y - Radius, Radius * 2, Radius * 2);
    }

    for (let Drip = 0; Drip < 8; Drip += 1) {
      const X = SeededRandom(Drip * 5 + 90) * Size;
      const Width = 3 + SeededRandom(Drip * 5 + 91) * 10;
      const Height = 45 + SeededRandom(Drip * 5 + 92) * 120;
      const Gradient = Context.createLinearGradient(0, 0, 0, Height);
      Gradient.addColorStop(0, "rgba(18,17,13,.02)");
      Gradient.addColorStop(1, "rgba(18,17,13,.19)");
      Context.fillStyle = Gradient;
      Context.fillRect(X, 0, Width, Height);
    }
  });
}

function AddWallGrime(Scene) {
  const Texture = CreateGrimeTexture();
  const Material = new THREE.MeshBasicMaterial({
    map: Texture,
    transparent: true,
    opacity: .82,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const Placements = [
    [-16.88, 1.25, 1.5, Math.PI / 2],
    [16.88, 1.35, -6.0, -Math.PI / 2],
    [-16.88, 1.30, -14.5, Math.PI / 2],
    [16.88, 1.15, -23.0, -Math.PI / 2],
    [-16.88, 1.25, -31.5, Math.PI / 2],
    [16.88, 1.25, -40.5, -Math.PI / 2],
    [-16.88, 1.30, -48.0, Math.PI / 2]
  ];

  for (let Index = 0; Index < Placements.length; Index += 1) {
    const [X, Y, Z, Rotation] = Placements[Index];
    const Plane = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + (Index % 3) * .35, 2.15), Material.clone());
    Plane.position.set(X, Y, Z);
    Plane.rotation.y = Rotation;
    Scene.add(Plane);
  }
}

function CreateExitSign(Scene) {
  const Canvas = document.createElement("canvas");
  Canvas.width = 512;
  Canvas.height = 192;
  const Context = Canvas.getContext("2d");
  Context.fillStyle = "#260704";
  Context.fillRect(0, 0, Canvas.width, Canvas.height);
  Context.strokeStyle = "#a72b20";
  Context.lineWidth = 16;
  Context.strokeRect(8, 8, Canvas.width - 16, Canvas.height - 16);
  Context.fillStyle = "#ff5a45";
  Context.font = "900 104px Arial";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.fillText("EXIT", Canvas.width / 2, Canvas.height / 2 + 6);

  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  const Material = new THREE.MeshBasicMaterial({ map: Texture });
  const Sign = new THREE.Mesh(new THREE.PlaneGeometry(2.1, .78), Material);
  Sign.position.set(0, 2.62, -52.82);
  Scene.add(Sign);

  const RedLight = new THREE.PointLight(0xb62619, .72, 9, 2);
  RedLight.position.set(0, 2.45, -49.5);
  Scene.add(RedLight);
}

function SubdivideOnce(Geometry) {
  const Source = Geometry.index ? Geometry.toNonIndexed() : Geometry.clone();
  const Position = Source.getAttribute("position");
  if (!Position || Position.count < 9) return Geometry;

  const Uv = Source.getAttribute("uv");
  const Positions = [];
  const Uvs = [];
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  const AB = new THREE.Vector3();
  const BC = new THREE.Vector3();
  const CA = new THREE.Vector3();
  const Uva = new THREE.Vector2();
  const Uvb = new THREE.Vector2();
  const Uvc = new THREE.Vector2();
  const Uvab = new THREE.Vector2();
  const Uvbc = new THREE.Vector2();
  const Uvca = new THREE.Vector2();

  function PushTriangle(P1, P2, P3, T1, T2, T3) {
    Positions.push(P1.x, P1.y, P1.z, P2.x, P2.y, P2.z, P3.x, P3.y, P3.z);
    if (Uv) Uvs.push(T1.x, T1.y, T2.x, T2.y, T3.x, T3.y);
  }

  for (let Index = 0; Index < Position.count; Index += 3) {
    A.fromBufferAttribute(Position, Index);
    B.fromBufferAttribute(Position, Index + 1);
    C.fromBufferAttribute(Position, Index + 2);
    AB.copy(A).add(B).multiplyScalar(.5);
    BC.copy(B).add(C).multiplyScalar(.5);
    CA.copy(C).add(A).multiplyScalar(.5);

    if (Uv) {
      Uva.fromBufferAttribute(Uv, Index);
      Uvb.fromBufferAttribute(Uv, Index + 1);
      Uvc.fromBufferAttribute(Uv, Index + 2);
      Uvab.copy(Uva).add(Uvb).multiplyScalar(.5);
      Uvbc.copy(Uvb).add(Uvc).multiplyScalar(.5);
      Uvca.copy(Uvc).add(Uva).multiplyScalar(.5);
    }

    PushTriangle(A, AB, CA, Uva, Uvab, Uvca);
    PushTriangle(AB, B, BC, Uvab, Uvb, Uvbc);
    PushTriangle(CA, BC, C, Uvca, Uvbc, Uvc);
    PushTriangle(AB, BC, CA, Uvab, Uvbc, Uvca);
  }

  const Result = new THREE.BufferGeometry();
  Result.setAttribute("position", new THREE.Float32BufferAttribute(Positions, 3));
  if (Uv) Result.setAttribute("uv", new THREE.Float32BufferAttribute(Uvs, 2));
  const Merged = mergeVertices(Result, .0001);
  Merged.computeVertexNormals();
  Merged.computeBoundingBox();
  Merged.computeBoundingSphere();
  return Merged;
}

const SmoothRoots = new Set([
  "Couch_Large1",
  "Couch_L",
  "Chair_2",
  "Bathroom_Bathtub",
  "Bathroom_Toilet",
  "Light_Floor1"
]);

function EnhanceLowPolyRoot(Root) {
  if (State.ProcessedRoots.has(Root)) return;
  State.ProcessedRoots.add(Root);

  Root.traverse(Object => {
    if (!Object.isMesh || Object.isSkinnedMesh) return;
    if (Array.isArray(Object.material) && Object.material.length > 1) return;
    const Geometry = Object.geometry;
    const Position = Geometry?.getAttribute("position");
    if (!Position) return;
    const TriangleCount = Geometry.index ? Geometry.index.count / 3 : Position.count / 3;
    if (TriangleCount < 12 || TriangleCount > 2200) return;

    let Enhanced = State.EnhancedGeometry.get(Geometry.uuid);
    if (!Enhanced) {
      Enhanced = SubdivideOnce(Geometry);
      State.EnhancedGeometry.set(Geometry.uuid, Enhanced);
    }
    Object.geometry = Enhanced;
    if (Object.material) {
      Object.material = Object.material.clone();
      Object.material.flatShading = false;
      Object.material.needsUpdate = true;
    }
  });
}

function ReplacePlantWithCactus(Root) {
  if (State.ProcessedPlants.has(Root)) return;
  State.ProcessedPlants.add(Root);

  const Position = new THREE.Vector3();
  const Quaternion = new THREE.Quaternion();
  Root.getWorldPosition(Position);
  Root.getWorldQuaternion(Quaternion);
  Root.visible = false;

  const Cactus = CreateCactus();
  Cactus.position.set(Position.x, 0, Position.z);
  Cactus.quaternion.copy(Quaternion);
  State.Scene.add(Cactus);
}

function ProcessSceneAssets() {
  if (!State.Scene) return;

  for (const Root of State.Scene.children) {
    if (Root.name === "Houseplant_3") ReplacePlantWithCactus(Root);
    if (SmoothRoots.has(Root.name)) EnhanceLowPolyRoot(Root);
  }
}

function TuneExistingLights(Scene) {
  let PanelIndex = 0;
  Scene.traverse(Object => {
    if (Object.name === "LightGlow" && Object.isMesh) {
      Object.material = Object.material.clone();
      if (PanelIndex % 8 === 5) Object.material.color.setHex(0x312d26);
      else if (PanelIndex % 5 === 3) Object.material.color.multiplyScalar(.68);
      PanelIndex += 1;
    }

    if (Object.isPointLight && Number.isFinite(Object.userData?.BaseIntensity)) {
      if (Object.position.z < -31) {
        Object.userData.BaseIntensity *= .70;
        Object.color.setHex(0xbecbbd);
      } else if (Object.position.z < -16) {
        Object.userData.BaseIntensity *= .86;
      }
    }
  });
}

function InitializeWorldEnhancements() {
  if (State.Initialized || !State.Scene || !State.Renderer) return;
  State.Initialized = true;

  if (State.Scene.fog?.isFogExp2) {
    State.Scene.fog.color.setHex(0x111411);
    State.Scene.fog.density = .0084;
  }

  State.Renderer.toneMappingExposure = 1.02;
  AddAtmosphereOverlay();
  AddWallGrime(State.Scene);
  CreateExitSign(State.Scene);
  TuneExistingLights(State.Scene);
  ProcessSceneAssets();

  const ColdBacklight = new THREE.PointLight(0x789482, .42, 11, 2);
  ColdBacklight.position.set(-5.5, 2.0, -40.5);
  State.Scene.add(ColdBacklight);

  State.ScanTimer = setInterval(ProcessSceneAssets, 350);
  setTimeout(() => clearInterval(State.ScanTimer), 24000);
}
