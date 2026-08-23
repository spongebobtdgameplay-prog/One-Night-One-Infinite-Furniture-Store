import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.Camera || !Game?.ActiveChunks) throw new Error("Game must load before R37 streaming optimizer.");

const SHELL_RADIUS = 18;
const FULL_DETAIL_RADIUS = 1;
const ACTIVE_GAME_RADIUS = 3;
const FIRST_CHUNK_TOP_Z = 10;
const CHUNK_LENGTH = Game.ChunkLength || 30;

const FloorGeometry = new THREE.BoxGeometry(34, 0.16, CHUNK_LENGTH + 0.25);
const CeilingGeometry = new THREE.BoxGeometry(34, 0.14, CHUNK_LENGTH + 0.25);
const WallGeometry = new THREE.BoxGeometry(0.20, 3.8, CHUNK_LENGTH + 0.25);
const LightGeometry = new THREE.BoxGeometry(3.05, 0.024, 0.22);

const FloorMaterial = new THREE.MeshBasicMaterial({ color: 0x504b44 });
const CeilingMaterial = new THREE.MeshBasicMaterial({ color: 0x6f6f6a });
const WallMaterial = new THREE.MeshBasicMaterial({ color: 0x61605b });
const LightMaterial = new THREE.MeshBasicMaterial({ color: 0xffe5b5, toneMapped: false });

const ShellCapacity = SHELL_RADIUS * 2 + 2;
const ShellFloor = new THREE.InstancedMesh(FloorGeometry, FloorMaterial, ShellCapacity);
const ShellCeiling = new THREE.InstancedMesh(CeilingGeometry, CeilingMaterial, ShellCapacity);
const ShellWalls = new THREE.InstancedMesh(WallGeometry, WallMaterial, ShellCapacity * 2);
const ShellLights = new THREE.InstancedMesh(LightGeometry, LightMaterial, ShellCapacity * 3);

for (const Mesh of [ShellFloor, ShellCeiling, ShellWalls, ShellLights]) {
  Mesh.name = "StreamingShellR37";
  Mesh.frustumCulled = false;
  Mesh.count = 0;
  Mesh.renderOrder = -10;
  Game.Scene.add(Mesh);
}

const Matrix = new THREE.Matrix4();
const Position = new THREE.Vector3();
const Quaternion = new THREE.Quaternion();
const Scale = new THREE.Vector3(1, 1, 1);
const DetailState = new Map();
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
    const CenterZ = ChunkCenterZ(CurrentIndex + Offset);

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

function StateForChunk(Chunk) {
  let State = DetailState.get(Chunk.Index);
  if (State) return State;
  State = {
    Attached: true,
    DetachedModels: [],
    DetachedTasks: [],
    DetachedChildren: []
  };
  DetailState.set(Chunk.Index, State);
  return State;
}

function DetachChunkDetail(Chunk) {
  const State = StateForChunk(Chunk);
  if (!State.Attached) return;
  State.Attached = false;
  State.DetachedModels.length = 0;
  State.DetachedTasks.length = 0;
  State.DetachedChildren.length = 0;

  for (const Model of Chunk.Models || []) {
    if (Model?.parent === Game.Scene) {
      Game.Scene.remove(Model);
      State.DetachedModels.push(Model);
    }
  }

  for (const Task of Chunk.TaskObjects || []) {
    if (Task?.parent === Game.Scene) {
      Game.Scene.remove(Task);
      State.DetachedTasks.push(Task);
    }
  }

  const Children = [...(Chunk.Group?.children || [])];
  for (const Child of Children) {
    if (Child.isPointLight) {
      Child.visible = false;
      continue;
    }
    if (IsStructuralChild(Child)) continue;
    Chunk.Group.remove(Child);
    State.DetachedChildren.push(Child);
  }
}

function AttachChunkDetail(Chunk) {
  const State = StateForChunk(Chunk);
  if (State.Attached) return;
  State.Attached = true;

  for (const Model of State.DetachedModels) {
    if (!Model.parent) Game.Scene.add(Model);
  }
  for (const Task of State.DetachedTasks) {
    if (!Task.parent) Game.Scene.add(Task);
  }
  for (const Child of State.DetachedChildren) {
    if (!Child.parent) Chunk.Group.add(Child);
  }

  State.DetachedModels.length = 0;
  State.DetachedTasks.length = 0;
  State.DetachedChildren.length = 0;
}

function RemoveDeadStates() {
  for (const Index of [...DetailState.keys()]) {
    if (!Game.ActiveChunks.has(Index)) DetailState.delete(Index);
  }
}

function UpdateDetail(CurrentIndex) {
  for (const Chunk of Game.ActiveChunks.values()) {
    if (!Chunk || !Number.isFinite(Chunk.Index)) continue;
    const Near = Math.abs(Chunk.Index - CurrentIndex) <= FULL_DETAIL_RADIUS;
    if (Near) AttachChunkDetail(Chunk);
    else DetachChunkDetail(Chunk);

    for (const Light of Chunk.Lights || []) {
      Light.visible = false;
      Light.intensity = 0;
    }
  }
  RemoveDeadStates();
}

function Update() {
  const CurrentIndex = Game.ChunkIndexForZ(Game.Camera.position.z);
  if (CurrentIndex !== LastChunkIndex) {
    LastChunkIndex = CurrentIndex;
    UpdateShell(CurrentIndex);
  }
  UpdateDetail(CurrentIndex);
}

Update();
const Timer = setInterval(Update, 120);
addEventListener("pagehide", () => clearInterval(Timer), { once: true });

window.__STORE_STREAMING_OPTIMIZER_BUILD__ = "V0.11-R37";
