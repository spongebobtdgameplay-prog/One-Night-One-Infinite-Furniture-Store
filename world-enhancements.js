import * as THREE from "three";

const State = {
  Scene: null,
  Initialized: false,
  ProcessedPlants: new WeakSet(),
  ProcessedRoots: new WeakSet(),
  EnhancedGeometry: new Map(),
  ScanTimer: null
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
  Texture.anisotropy = 2;
  return Texture;
}

const CactusTexture = MakeCanvasTexture(256, (Context, Size) => {
  Context.fillStyle = "#2f6d3b";
  Context.fillRect(0, 0, Size, Size);

  for (let Stripe = 0; Stripe < 16; Stripe += 1) {
    const X = Stripe * Size / 16;
    const Gradient = Context.createLinearGradient(X, 0, X + Size / 16, 0);
    Gradient.addColorStop(0, "rgba(16,61,30,.72)");
    Gradient.addColorStop(.5, "rgba(113,164,91,.32)");
    Gradient.addColorStop(1, "rgba(22,76,38,.62)");
    Context.fillStyle = Gradient;
    Context.fillRect(X, 0, Size / 16 + 1, Size);
  }

  for (let Dot = 0; Dot < 620; Dot += 1) {
    const X = SeededRandom(Dot * 4 + 1) * Size;
    const Y = SeededRandom(Dot * 4 + 2) * Size;
    const Radius = .5 + SeededRandom(Dot * 4 + 3) * 1.7;
    Context.fillStyle = SeededRandom(Dot * 4 + 4) > .52
      ? "rgba(185,211,157,.19)"
      : "rgba(6,40,19,.20)";
    Context.beginPath();
    Context.arc(X, Y, Radius, 0, Math.PI * 2);
    Context.fill();
  }
});
CactusTexture.repeat.set(2.4, 3.6);

const PotTexture = MakeCanvasTexture(192, (Context, Size) => {
  Context.fillStyle = "#88472d";
  Context.fillRect(0, 0, Size, Size);
  for (let Dot = 0; Dot < 800; Dot += 1) {
    const X = SeededRandom(Dot * 3 + 7) * Size;
    const Y = SeededRandom(Dot * 3 + 8) * Size;
    const Shade = 75 + Math.floor(SeededRandom(Dot * 3 + 9) * 70);
    Context.fillStyle = `rgba(${Shade + 42},${Shade},${Math.max(24, Shade - 28)},.16)`;
    Context.fillRect(X, Y, 1.3, 1.3);
  }
});
PotTexture.repeat.set(2, 2);

const CactusMaterial = new THREE.MeshStandardMaterial({
  map: CactusTexture,
  color: 0x6fa35f,
  roughness: .84,
  metalness: 0,
  emissive: 0x0b1c0e,
  emissiveIntensity: .09
});

const PotMaterial = new THREE.MeshStandardMaterial({
  map: PotTexture,
  color: 0xc1764d,
  roughness: .94,
  metalness: 0
});

const SoilMaterial = new THREE.MeshStandardMaterial({
  color: 0x21150d,
  roughness: 1,
  metalness: 0
});

const SpineMaterial = new THREE.MeshStandardMaterial({
  color: 0xe0d7b8,
  roughness: .78,
  metalness: 0
});

function MakeCactusSegment(Radius, Height) {
  const Group = new THREE.Group();
  const Body = new THREE.Mesh(
    new THREE.CylinderGeometry(Radius, Radius * .97, Height, 32, 10, false),
    CactusMaterial
  );
  Group.add(Body);

  const Cap = new THREE.Mesh(new THREE.SphereGeometry(Radius, 32, 18), CactusMaterial);
  Cap.scale.y = .72;
  Cap.position.y = Height * .5;
  Group.add(Cap);
  return Group;
}

function AddSpines(Group, Radius, BottomY, TopY) {
  const Rings = 8;
  const Around = 12;
  const Geometry = new THREE.ConeGeometry(.0075, .065, 5);
  const Spines = new THREE.InstancedMesh(Geometry, SpineMaterial, Rings * Around);
  const Matrix = new THREE.Matrix4();
  const Position = new THREE.Vector3();
  const Quaternion = new THREE.Quaternion();
  const Scale = new THREE.Vector3(1, 1, 1);
  const Up = new THREE.Vector3(0, 1, 0);
  const Direction = new THREE.Vector3();
  let Index = 0;

  for (let Ring = 0; Ring < Rings; Ring += 1) {
    const Y = THREE.MathUtils.lerp(BottomY, TopY, Ring / (Rings - 1));
    for (let Point = 0; Point < Around; Point += 1) {
      const Angle = Point / Around * Math.PI * 2 + (Ring % 2) * .13;
      Direction.set(Math.cos(Angle), .07, Math.sin(Angle)).normalize();
      Position.set(
        Math.cos(Angle) * (Radius + .018),
        Y,
        Math.sin(Angle) * (Radius + .018)
      );
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

  const Pot = new THREE.Mesh(
    new THREE.CylinderGeometry(.245, .175, .32, 32, 5, false),
    PotMaterial
  );
  Pot.position.y = .16;
  Group.add(Pot);

  const Rim = new THREE.Mesh(new THREE.TorusGeometry(.238, .028, 12, 36), PotMaterial);
  Rim.rotation.x = Math.PI / 2;
  Rim.position.y = .305;
  Group.add(Rim);

  const Soil = new THREE.Mesh(new THREE.CylinderGeometry(.207, .207, .02, 32), SoilMaterial);
  Soil.position.y = .318;
  Group.add(Soil);

  const Main = MakeCactusSegment(.14, .64);
  Main.position.y = .64;
  Group.add(Main);

  const LeftArm = MakeCactusSegment(.072, .28);
  LeftArm.rotation.z = Math.PI / 2;
  LeftArm.position.set(-.205, .68, 0);
  Group.add(LeftArm);

  const LeftUp = MakeCactusSegment(.069, .27);
  LeftUp.position.set(-.34, .80, 0);
  Group.add(LeftUp);

  const RightArm = MakeCactusSegment(.066, .24);
  RightArm.rotation.z = -Math.PI / 2;
  RightArm.position.set(.19, .76, 0);
  Group.add(RightArm);

  const RightUp = MakeCactusSegment(.062, .21);
  RightUp.position.set(.30, .86, 0);
  Group.add(RightUp);

  AddSpines(Group, .14, .36, .96);
  return Group;
}

function ReplacePlantWithCactus(Root) {
  if (State.ProcessedPlants.has(Root)) return;
  State.ProcessedPlants.add(Root);

  const Position = new THREE.Vector3();
  const Quaternion = new THREE.Quaternion();
  Root.updateMatrixWorld(true);
  Root.getWorldPosition(Position);
  Root.getWorldQuaternion(Quaternion);
  Root.visible = false;

  const Cactus = CreateCactus();
  Cactus.position.set(Position.x, 0, Position.z);
  Cactus.quaternion.copy(Quaternion);
  State.Scene.add(Cactus);
}

function SubdivideGeometry(Geometry) {
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
  const TA = new THREE.Vector2();
  const TB = new THREE.Vector2();
  const TC = new THREE.Vector2();
  const TAB = new THREE.Vector2();
  const TBC = new THREE.Vector2();
  const TCA = new THREE.Vector2();

  function Push(P1, P2, P3, T1, T2, T3) {
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
      TA.fromBufferAttribute(Uv, Index);
      TB.fromBufferAttribute(Uv, Index + 1);
      TC.fromBufferAttribute(Uv, Index + 2);
      TAB.copy(TA).add(TB).multiplyScalar(.5);
      TBC.copy(TB).add(TC).multiplyScalar(.5);
      TCA.copy(TC).add(TA).multiplyScalar(.5);
    }

    Push(A, AB, CA, TA, TAB, TCA);
    Push(AB, B, BC, TAB, TB, TBC);
    Push(CA, BC, C, TCA, TBC, TC);
    Push(AB, BC, CA, TAB, TBC, TCA);
  }

  const Result = new THREE.BufferGeometry();
  Result.setAttribute("position", new THREE.Float32BufferAttribute(Positions, 3));
  if (Uv) Result.setAttribute("uv", new THREE.Float32BufferAttribute(Uvs, 2));
  Result.computeVertexNormals();
  Result.computeBoundingBox();
  Result.computeBoundingSphere();
  return Result;
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
    const Geometry = Object.geometry;
    const Position = Geometry?.getAttribute("position");
    if (!Position) return;
    const TriangleCount = Geometry.index ? Geometry.index.count / 3 : Position.count / 3;
    if (TriangleCount < 12 || TriangleCount > 1800) return;

    let Enhanced = State.EnhancedGeometry.get(Geometry.uuid);
    if (!Enhanced) {
      Enhanced = SubdivideGeometry(Geometry);
      State.EnhancedGeometry.set(Geometry.uuid, Enhanced);
    }

    Object.geometry = Enhanced;
    const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
    for (const Material of Materials) {
      if (!Material) continue;
      Material.flatShading = false;
      Material.needsUpdate = true;
    }
  });
}

function AddAtmosphereOverlay() {
  if (document.getElementById("StoreAtmosphereOverlay")) return;
  const Overlay = document.createElement("div");
  Overlay.id = "StoreAtmosphereOverlay";
  Overlay.style.position = "fixed";
  Overlay.style.inset = "0";
  Overlay.style.pointerEvents = "none";
  Overlay.style.zIndex = "8";
  Overlay.style.background = "radial-gradient(circle at 50% 46%, transparent 44%, rgba(0,0,0,.13) 73%, rgba(0,0,0,.38) 100%)";
  document.body.appendChild(Overlay);
}

function AddBackStoreMood() {
  if (State.Scene.getObjectByName("BackStoreMoodLight")) return;

  const ColdLight = new THREE.PointLight(0x789482, .38, 11, 2);
  ColdLight.name = "BackStoreMoodLight";
  ColdLight.position.set(-5.5, 2.0, -40.5);
  State.Scene.add(ColdLight);

  const RedLight = new THREE.PointLight(0xb62619, .48, 8, 2);
  RedLight.position.set(0, 2.4, -49.5);
  State.Scene.add(RedLight);
}

function ProcessSceneAssets() {
  if (!State.Scene) return;
  for (const Root of [...State.Scene.children]) {
    if (Root.name === "Houseplant_3") ReplacePlantWithCactus(Root);
    if (SmoothRoots.has(Root.name)) EnhanceLowPolyRoot(Root);
  }
}

function InitializeWorldEnhancements() {
  if (State.Initialized || !State.Scene) return;
  State.Initialized = true;

  if (State.Scene.fog?.isFogExp2) {
    State.Scene.fog.color.setHex(0x111411);
    State.Scene.fog.density = .0081;
  }

  AddAtmosphereOverlay();
  AddBackStoreMood();
  ProcessSceneAssets();

  State.ScanTimer = setInterval(ProcessSceneAssets, 250);
  setTimeout(() => {
    if (State.ScanTimer) clearInterval(State.ScanTimer);
  }, 30000);
}

const OriginalSceneAdd = THREE.Scene.prototype.add;
THREE.Scene.prototype.add = function(...Objects) {
  if (!State.Scene && this.isScene) {
    State.Scene = this;
    queueMicrotask(InitializeWorldEnhancements);
  }
  return OriginalSceneAdd.apply(this, Objects);
};

window.__STORE_ENHANCEMENTS_BUILD__ = "V0.06";
