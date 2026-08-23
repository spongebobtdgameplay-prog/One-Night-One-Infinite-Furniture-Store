import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.Camera || !Game?.ActiveChunks) throw new Error("Game must load before R36 streaming optimizer.");

const SHELL_RADIUS = 18;
const FULL_DETAIL_RADIUS = 1;
const ACTIVE_GAME_RADIUS = 3;
const FIRST_CHUNK_TOP_Z = 10;
const CHUNK_LENGTH = Game.ChunkLength || 30;
const MAX_REAL_POINT_LIGHTS = 3;

const FloorGeometry = new THREE.BoxGeometry(34, 0.16, CHUNK_LENGTH + 0.25);
const CeilingGeometry = new THREE.BoxGeometry(34, 0.14, CHUNK_LENGTH + 0.25);
const WallGeometry = new THREE.BoxGeometry(0.20, 3.8, CHUNK_LENGTH + 0.25);
const LightGeometry = new THREE.BoxGeometry(3.05, 0.024, 0.22);

const FloorMaterial = new THREE.MeshStandardMaterial({ color: 0x504b44, roughness: 0.98, metalness: 0 });
const CeilingMaterial = new THREE.MeshStandardMaterial({ color: 0x777771, roughness: 1, metalness: 0 });
const WallMaterial = new THREE.MeshStandardMaterial({ color: 0x696861, roughness: 0.97, metalness: 0 });
const LightMaterial = new THREE.MeshBasicMaterial({ color: 0xffe5b5, toneMapped: false });

const ShellFloor = new THREE.InstancedMesh(FloorGeometry, FloorMaterial, SHELL_RADIUS * 2 + 2);
const ShellCeiling = new THREE.InstancedMesh(CeilingGeometry, CeilingMaterial, SHELL_RADIUS * 2 + 2);
const ShellWalls = new THREE.InstancedMesh(WallGeometry, WallMaterial, (SHELL_RADIUS * 2 + 2) * 2);
const ShellLights = new THREE.InstancedMesh(LightGeometry, LightMaterial, (SHELL_RADIUS * 2 + 2) * 3);

for (const Mesh of [ShellFloor, ShellCeiling, ShellWalls, ShellLights]) {
  Mesh.name = "StreamingShellR36";
  Mesh.frustumCulled = false;
  Mesh.count = 0;
  Mesh.renderOrder = -10;
  Game.Scene.add(Mesh);
}

const Matrix = new THREE.Matrix4();
const Position = new THREE.Vector3();
const Quaternion = new THREE.Quaternion();
const Scale = new THREE.Vector3(1, 1, 1);
const CactusMaterial = new THREE.MeshStandardMaterial({ color: 0x527d47, roughness: 0.88 });
const PotMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5034, roughness: 0.94 });
const CactusBodyGeometry = new THREE.CylinderGeometry(0.12, 0.13, 0.62, 10);
const CactusArmGeometry = new THREE.CylinderGeometry(0.055, 0.06, 0.28, 8);
const CactusPotGeometry = new THREE.CylinderGeometry(0.23, 0.18, 0.31, 12);
const DecoratedCacti = new WeakSet();
let LastChunkIndex = null;

function ChunkCenterZ(Index) {
  return FIRST_CHUNK_TOP_Z - CHUNK_LENGTH * (Index + 0.5);
}

function SetInstance(Mesh, Index, X, Y, Z) {
  Position.set(X, Y, Z);
  Quaternion.identity();
  Matrix.compose(Position, Quaternion, Scale);
  Mesh.setMatrixAt(Index, Matrix);
}

function UpdateShell(CurrentIndex) {
  let FloorIndex = 0;
  let WallIndex = 0;
  let LightIndex = 0;

  for (let Offset = -SHELL_RADIUS; Offset <= SHELL_RADIUS; Offset += 1) {
    if (Math.abs(Offset) <= ACTIVE_GAME_RADIUS) continue;
    const Index = CurrentIndex + Offset;
    const CenterZ = ChunkCenterZ(Index);

    SetInstance(ShellFloor, FloorIndex, 0, -0.08, CenterZ);
    SetInstance(ShellCeiling, FloorIndex, 0, 3.72, CenterZ);
    FloorIndex += 1;

    SetInstance(ShellWalls, WallIndex, -17, 1.86, CenterZ);
    WallIndex += 1;
    SetInstance(ShellWalls, WallIndex, 17, 1.86, CenterZ);
    WallIndex += 1;

    for (const LocalZ of [-9, 0, 9]) {
      SetInstance(ShellLights, LightIndex, 0, 3.505, CenterZ + LocalZ);
      LightIndex += 1;
    }
  }

  ShellFloor.count = FloorIndex;
  ShellCeiling.count = FloorIndex;
  ShellWalls.count = WallIndex;
  ShellLights.count = LightIndex;
  ShellFloor.instanceMatrix.needsUpdate = true;
  ShellCeiling.instanceMatrix.needsUpdate = true;
  ShellWalls.instanceMatrix.needsUpdate = true;
  ShellLights.instanceMatrix.needsUpdate = true;
}

function IsStructuralChild(Object) {
  const Name = Object?.name || "";
  return /^(Floor|Ceiling|WallLeft|WallRight|BaseboardLeft|BaseboardRight|LightHousing|LightGlow|SectionSign|SignMount)$/.test(Name);
}

function ApplyChunkDetail(CurrentIndex) {
  for (const Chunk of Game.ActiveChunks.values()) {
    if (!Chunk || !Number.isFinite(Chunk.Index)) continue;
    const FullDetail = Math.abs(Chunk.Index - CurrentIndex) <= FULL_DETAIL_RADIUS;

    for (const Model of Chunk.Models || []) Model.visible = FullDetail;
    for (const Object of Chunk.TaskObjects || []) Object.visible = FullDetail;

    for (const Child of Chunk.Group?.children || []) {
      if (Child.isPointLight) {
        Child.visible = false;
        continue;
      }
      if (!IsStructuralChild(Child)) Child.visible = FullDetail;
    }
  }
}

function DecorateCactus(Marker) {
  if (!Marker || DecoratedCacti.has(Marker) || Marker.name !== "Houseplant_3") return;
  DecoratedCacti.add(Marker);

  const Pot = new THREE.Mesh(CactusPotGeometry, PotMaterial);
  Pot.position.y = 0.155;
  Marker.add(Pot);

  const Body = new THREE.Mesh(CactusBodyGeometry, CactusMaterial);
  Body.position.y = 0.61;
  Marker.add(Body);

  const LeftArm = new THREE.Mesh(CactusArmGeometry, CactusMaterial);
  LeftArm.position.set(-0.16, 0.69, 0);
  LeftArm.rotation.z = Math.PI * 0.5;
  Marker.add(LeftArm);

  const RightArm = new THREE.Mesh(CactusArmGeometry, CactusMaterial);
  RightArm.position.set(0.16, 0.76, 0);
  RightArm.rotation.z = -Math.PI * 0.5;
  Marker.add(RightArm);
}

function UpdateCacti() {
  for (const Chunk of Game.ActiveChunks.values()) {
    for (const Model of Chunk?.Models || []) DecorateCactus(Model);
  }
}

function SetStaticNearestLights(CurrentIndex) {
  const Candidates = [];
  for (const Chunk of Game.ActiveChunks.values()) {
    if (!Chunk || Math.abs(Chunk.Index - CurrentIndex) > FULL_DETAIL_RADIUS) {
      for (const Light of Chunk?.Lights || []) Light.visible = false;
      continue;
    }
    for (const Light of Chunk.Lights || []) {
      const DX = Light.position.x - Game.Camera.position.x;
      const DZ = Light.position.z - Game.Camera.position.z;
      Candidates.push({ Light, Distance: DX * DX + DZ * DZ });
    }
  }

  Candidates.sort((Left, Right) => Left.Distance - Right.Distance);
  for (let Index = 0; Index < Candidates.length; Index += 1) {
    const Light = Candidates[Index].Light;
    Light.visible = Index < MAX_REAL_POINT_LIGHTS;
    Light.intensity = Number.isFinite(Light.userData?.BaseIntensity) ? Light.userData.BaseIntensity : 1.65;
  }
}

function Update() {
  const CurrentIndex = Game.ChunkIndexForZ(Game.Camera.position.z);
  if (CurrentIndex !== LastChunkIndex) {
    LastChunkIndex = CurrentIndex;
    UpdateShell(CurrentIndex);
  }
  ApplyChunkDetail(CurrentIndex);
  UpdateCacti();
}

const OriginalRender = Game.Renderer.render.bind(Game.Renderer);
Game.Renderer.render = function(Scene, Camera) {
  const CurrentIndex = Game.ChunkIndexForZ(Game.Camera.position.z);
  SetStaticNearestLights(CurrentIndex);
  return OriginalRender(Scene, Camera);
};

Update();
const Timer = setInterval(Update, 100);
addEventListener("pagehide", () => clearInterval(Timer), { once: true });

window.__STORE_STREAMING_OPTIMIZER_BUILD__ = "V0.11-R36";
