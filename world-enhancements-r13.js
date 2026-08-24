import * as THREE from "three";

const State = {
  Scene: null,
  Initialized: false,
  AnimationFrame: 0,
  Horizon: null,
  HorizonKey: ""
};

const HORIZON_SEGMENTS = 14;
const HORIZON_CHUNK_LENGTH = 30;
const HORIZON_HEIGHT = 3.72;
const HORIZON_GAP = 0.16;

function AddAtmosphereOverlay() {
  if (document.getElementById("StoreAtmosphereOverlay")) return;
  const Overlay = document.createElement("div");
  Overlay.id = "StoreAtmosphereOverlay";
  Overlay.style.position = "fixed";
  Overlay.style.inset = "0";
  Overlay.style.pointerEvents = "none";
  Overlay.style.zIndex = "8";
  Overlay.style.background = "radial-gradient(circle at 50% 46%,transparent 57%,rgba(66,62,51,.055) 78%,rgba(53,50,42,.11) 100%)";
  document.body.appendChild(Overlay);
}

function AddBackStoreMood() {
  if (State.Scene.getObjectByName("BackStoreMoodLight")) return;
  const Cold = new THREE.PointLight(0x88a596, 0.30, 13, 2);
  Cold.name = "BackStoreMoodLight";
  Cold.position.set(-5.5, 2.0, -40.5);
  State.Scene.add(Cold);
  const Amber = new THREE.PointLight(0xb67645, 0.25, 10, 2);
  Amber.name = "BackStoreMoodAmberLight";
  Amber.position.set(4.5, 2.3, -50.5);
  State.Scene.add(Amber);
}

function CloneMaterial(Material) {
  if (!Material?.clone) return Material;
  const Clone = Material.clone();
  Clone.needsUpdate = true;
  return Clone;
}

function CreateForwardHorizon(Materials) {
  const Group = new THREE.Group();
  Group.name = "StoreHorizonForward";
  Group.userData.StoreHorizon = true;
  Group.userData.ForwardOnly = true;

  const Floor = new THREE.InstancedMesh(
    new THREE.BoxGeometry(34, 0.16, HORIZON_CHUNK_LENGTH),
    CloneMaterial(Materials.Floor),
    HORIZON_SEGMENTS
  );
  const Ceiling = new THREE.InstancedMesh(
    new THREE.BoxGeometry(34, 0.14, HORIZON_CHUNK_LENGTH),
    CloneMaterial(Materials.Ceiling),
    HORIZON_SEGMENTS
  );
  const Walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.20, 3.8, HORIZON_CHUNK_LENGTH),
    CloneMaterial(Materials.Wall),
    HORIZON_SEGMENTS * 2
  );
  const Housing = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3.4, 0.08, 0.46),
    CloneMaterial(Materials.Housing),
    HORIZON_SEGMENTS * 3
  );
  const GlowMaterial = CloneMaterial(Materials.Glow);
  if (GlowMaterial) {
    GlowMaterial.depthWrite = false;
    GlowMaterial.depthTest = true;
    GlowMaterial.toneMapped = false;
    GlowMaterial.transparent = false;
    GlowMaterial.opacity = 1;
  }
  const Glows = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3.04, 0.012, 0.20),
    GlowMaterial,
    HORIZON_SEGMENTS * 3
  );

  const Matrix = new THREE.Matrix4();
  let WallIndex = 0;
  let LightIndex = 0;

  for (let Segment = 0; Segment < HORIZON_SEGMENTS; Segment += 1) {
    const CenterZ = -(Segment + 0.5) * HORIZON_CHUNK_LENGTH;
    Matrix.makeTranslation(0, -0.08, CenterZ);
    Floor.setMatrixAt(Segment, Matrix);
    Matrix.makeTranslation(0, HORIZON_HEIGHT, CenterZ);
    Ceiling.setMatrixAt(Segment, Matrix);

    for (const X of [-17, 17]) {
      Matrix.makeTranslation(X, 1.86, CenterZ);
      Walls.setMatrixAt(WallIndex, Matrix);
      WallIndex += 1;
    }

    for (const LocalZ of [-9, 0, 9]) {
      const Z = CenterZ + LocalZ;
      Matrix.makeTranslation(0, 3.56, Z);
      Housing.setMatrixAt(LightIndex, Matrix);
      Matrix.makeTranslation(0, 3.507, Z);
      Glows.setMatrixAt(LightIndex, Matrix);
      LightIndex += 1;
    }
  }

  for (const Object of [Floor, Ceiling, Walls, Housing, Glows]) {
    Object.instanceMatrix.needsUpdate = true;
    Object.frustumCulled = false;
  }

  Floor.name = "HorizonFloorR78";
  Ceiling.name = "HorizonCeilingR78";
  Walls.name = "HorizonWallsR78";
  Housing.name = "HorizonLightHousingR78";
  Glows.name = "HorizonLightGlowR78";
  Group.add(Floor, Ceiling, Walls, Housing, Glows);
  return Group;
}

function FindHorizonMaterials(Game) {
  for (const Chunk of Game.ActiveChunks.values()) {
    const Floor = Chunk.Group?.getObjectByName("Floor");
    const Ceiling = Chunk.Group?.getObjectByName("Ceiling");
    const Wall = Chunk.Group?.getObjectByName("WallLeft");
    const Glow = Chunk.Group?.getObjectByName("LightGlow");
    const Housing = Chunk.Group?.getObjectByName("LightHousing");
    if (Floor?.material && Ceiling?.material && Wall?.material && Glow?.material && Housing?.material) {
      return {
        Floor: Floor.material,
        Ceiling: Ceiling.material,
        Wall: Wall.material,
        Glow: Glow.material,
        Housing: Housing.material
      };
    }
  }
  return null;
}

function EnsureHorizon() {
  if (State.Horizon) return State.Horizon;
  const Game = window.__STORE_GAME__;
  if (!Game?.ActiveChunks?.size || !State.Scene) return null;
  const Materials = FindHorizonMaterials(Game);
  if (!Materials) return null;
  const Forward = CreateForwardHorizon(Materials);
  State.Scene.add(Forward);
  State.Horizon = Forward;
  return State.Horizon;
}

function UpdateHorizon() {
  const Game = window.__STORE_GAME__;
  const Horizon = EnsureHorizon();
  if (!Game?.ActiveChunks?.size || !Horizon) return;

  const Chunks = [...Game.ActiveChunks.values()].filter(Chunk => Number.isFinite(Chunk.Index));
  if (!Chunks.length) return;

  let Maximum = Chunks[0];
  for (const Chunk of Chunks) {
    if (Chunk.Index > Maximum.Index) Maximum = Chunk;
  }

  const Key = `${Maximum.Index}:${Maximum.BottomZ}`;
  if (Key === State.HorizonKey) return;
  State.HorizonKey = Key;
  Horizon.position.set(0, 0, Maximum.BottomZ - HORIZON_GAP);
  Horizon.updateMatrixWorld(true);
}

function ProcessSceneAssets() {
  if (!State.Scene) return;
  UpdateHorizon();
}

function Frame() {
  ProcessSceneAssets();
  State.AnimationFrame = requestAnimationFrame(Frame);
}

function Initialize() {
  if (State.Initialized || !State.Scene) return;
  State.Initialized = true;
  if (State.Scene.fog?.isFogExp2) {
    State.Scene.fog.color.setHex(0x24261f);
    State.Scene.fog.density = 0.0027;
  }
  AddAtmosphereOverlay();
  AddBackStoreMood();
  ProcessSceneAssets();
  State.AnimationFrame = requestAnimationFrame(Frame);
  addEventListener("pagehide", () => cancelAnimationFrame(State.AnimationFrame), { once: true });
}

const OriginalSceneAdd = THREE.Scene.prototype.add;
THREE.Scene.prototype.add = function(...Objects) {
  if (!State.Scene && this.isScene) {
    State.Scene = this;
    queueMicrotask(Initialize);
  }
  return OriginalSceneAdd.apply(this, Objects);
};

window.__STORE_ENHANCEMENTS_BUILD__ = "V0.19.0-R78";
