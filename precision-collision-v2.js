import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
if (!Game?.Scene || !Game?.CollisionBoxes || !Game?.ActiveChunks) throw new Error("Game must load before precise collision.");

const Processed = new WeakSet();
const Queued = new WeakSet();
const Queue = [];
const TempA = new THREE.Vector3();
const TempB = new THREE.Vector3();
const TempC = new THREE.Vector3();
const TempAB = new THREE.Vector3();
const TempAC = new THREE.Vector3();
const TempNormal = new THREE.Vector3();
const MIN_AREA = 0.006;
const MIN_UP = 0.22;

function DistanceSquaredToSegment(X, Z, A, B) {
  const DX = B.x - A.x;
  const DZ = B.y - A.y;
  const LengthSquared = DX * DX + DZ * DZ;
  if (LengthSquared <= 0.0000001) {
    const PX = X - A.x;
    const PZ = Z - A.y;
    return PX * PX + PZ * PZ;
  }
  const T = THREE.MathUtils.clamp(((X - A.x) * DX + (Z - A.y) * DZ) / LengthSquared, 0, 1);
  const ClosestX = A.x + DX * T;
  const ClosestZ = A.y + DZ * T;
  const PX = X - ClosestX;
  const PZ = Z - ClosestZ;
  return PX * PX + PZ * PZ;
}

function PointInsideTriangle(X, Z, A, B, C) {
  const AB = (B.x - A.x) * (Z - A.y) - (B.y - A.y) * (X - A.x);
  const BC = (C.x - B.x) * (Z - B.y) - (C.y - B.y) * (X - B.x);
  const CA = (A.x - C.x) * (Z - C.y) - (A.y - C.y) * (X - C.x);
  const HasNegative = AB < -0.000001 || BC < -0.000001 || CA < -0.000001;
  const HasPositive = AB > 0.000001 || BC > 0.000001 || CA > 0.000001;
  return !(HasNegative && HasPositive);
}

function CircleHitsTriangle(X, Z, RadiusSquared, Triangle) {
  const A = Triangle[0];
  const B = Triangle[1];
  const C = Triangle[2];
  return PointInsideTriangle(X, Z, A, B, C) ||
    DistanceSquaredToSegment(X, Z, A, B) <= RadiusSquared ||
    DistanceSquaredToSegment(X, Z, B, C) <= RadiusSquared ||
    DistanceSquaredToSegment(X, Z, C, A) <= RadiusSquared;
}

function UsefulTriangle(A, B, C) {
  TempAB.copy(B).sub(A);
  TempAC.copy(C).sub(A);
  TempNormal.crossVectors(TempAB, TempAC);
  const NormalLength = TempNormal.length();
  if (NormalLength <= 0.000001) return false;
  TempNormal.multiplyScalar(1 / NormalLength);
  if (Math.abs(TempNormal.y) < MIN_UP) return false;
  const Area = Math.abs((B.x - A.x) * (C.z - A.z) - (B.z - A.z) * (C.x - A.x)) * 0.5;
  return Area >= MIN_AREA;
}

function BuildFootprint(Model) {
  Model.updateMatrixWorld(true);
  const Triangles = [];
  const Bounds = new THREE.Box2().makeEmpty();
  Model.traverse(Object => {
    if (!Object.isMesh || !Object.visible || !Object.geometry?.attributes?.position) return;
    const Position = Object.geometry.attributes.position;
    const Index = Object.geometry.index;
    const Count = Index ? Math.floor(Index.count / 3) : Math.floor(Position.count / 3);
    for (let TriangleIndex = 0; TriangleIndex < Count; TriangleIndex += 1) {
      const Offset = TriangleIndex * 3;
      const IA = Index ? Index.getX(Offset) : Offset;
      const IB = Index ? Index.getX(Offset + 1) : Offset + 1;
      const IC = Index ? Index.getX(Offset + 2) : Offset + 2;
      TempA.fromBufferAttribute(Position, IA).applyMatrix4(Object.matrixWorld);
      TempB.fromBufferAttribute(Position, IB).applyMatrix4(Object.matrixWorld);
      TempC.fromBufferAttribute(Position, IC).applyMatrix4(Object.matrixWorld);
      if (!UsefulTriangle(TempA, TempB, TempC)) continue;
      const A = new THREE.Vector2(TempA.x, TempA.z);
      const B = new THREE.Vector2(TempB.x, TempB.z);
      const C = new THREE.Vector2(TempC.x, TempC.z);
      Bounds.expandByPoint(A);
      Bounds.expandByPoint(B);
      Bounds.expandByPoint(C);
      Triangles.push([A, B, C]);
    }
  });
  return { Triangles, Bounds };
}

function CircleHitsGeometry(X, Z, Radius, Geometry) {
  const Bounds = Geometry.Bounds;
  if (Bounds.isEmpty()) return false;
  if (X + Radius < Bounds.min.x || X - Radius > Bounds.max.x || Z + Radius < Bounds.min.y || Z - Radius > Bounds.max.y) return false;
  const RadiusSquared = Radius * Radius;
  for (const Triangle of Geometry.Triangles) {
    const MinX = Math.min(Triangle[0].x, Triangle[1].x, Triangle[2].x) - Radius;
    const MaxX = Math.max(Triangle[0].x, Triangle[1].x, Triangle[2].x) + Radius;
    const MinZ = Math.min(Triangle[0].y, Triangle[1].y, Triangle[2].y) - Radius;
    const MaxZ = Math.max(Triangle[0].y, Triangle[1].y, Triangle[2].y) + Radius;
    if (X < MinX || X > MaxX || Z < MinZ || Z > MaxZ) continue;
    if (CircleHitsTriangle(X, Z, RadiusSquared, Triangle)) return true;
  }
  return false;
}

function CandidateEntries(Model) {
  const ChunkId = Model.userData?.ChunkId;
  if (!ChunkId || !Model.name) return [];
  return Game.CollisionBoxes.filter(Entry => Entry.ChunkId === ChunkId && Entry.Type === Model.name && !Entry.PreciseGeometry);
}

function Bind(Model) {
  if (!Model?.parent || Processed.has(Model)) return;
  const Entries = CandidateEntries(Model);
  if (!Entries.length) {
    Processed.add(Model);
    return;
  }
  const Geometry = BuildFootprint(Model);
  if (!Geometry.Triangles.length || Geometry.Bounds.isEmpty()) {
    Processed.add(Model);
    return;
  }
  const Center = Geometry.Bounds.getCenter(new THREE.Vector2());
  let Best = null;
  let BestDistance = Infinity;
  for (const Entry of Entries) {
    const Box = Entry.Box;
    if (!Box?.min || !Box?.max) continue;
    const DX = (Box.min.x + Box.max.x) * 0.5 - Center.x;
    const DZ = (Box.min.z + Box.max.z) * 0.5 - Center.y;
    const Distance = DX * DX + DZ * DZ;
    if (Distance < BestDistance) {
      BestDistance = Distance;
      Best = Entry;
    }
  }
  if (!Best) {
    Processed.add(Model);
    return;
  }
  Best.OriginalBox ||= Best.Box;
  Best.PreciseTriangles = Geometry.Triangles;
  Best.GeometryBounds = Geometry.Bounds;
  Best.PreciseGeometry = true;
  Best.TestPlayerCollision = (Position, Radius = Player?.GetPlayerRadius?.() || 0.28) => CircleHitsGeometry(Position.x, Position.z, Radius, Geometry);
  Processed.add(Model);
}

function EnqueueActiveModels() {
  for (const Chunk of Game.ActiveChunks.values()) {
    for (const Model of Chunk.Models || []) {
      if (!Model?.parent || Processed.has(Model) || Queued.has(Model)) continue;
      if (!CandidateEntries(Model).length) continue;
      Queued.add(Model);
      Queue.push(Model);
    }
  }
  Queue.sort((A, B) => {
    const ADX = A.position.x - Game.Camera.position.x;
    const ADZ = A.position.z - Game.Camera.position.z;
    const BDX = B.position.x - Game.Camera.position.x;
    const BDZ = B.position.z - Game.Camera.position.z;
    return ADX * ADX + ADZ * ADZ - (BDX * BDX + BDZ * BDZ);
  });
  ScheduleWork();
}

let WorkScheduled = false;
function ProcessQueue(Deadline) {
  WorkScheduled = false;
  const Start = performance.now();
  let ProcessedThisTurn = 0;
  while (Queue.length) {
    if (ProcessedThisTurn >= 2) break;
    if (Deadline?.timeRemaining && Deadline.timeRemaining() < 2) break;
    if (!Deadline && performance.now() - Start > 4) break;
    const Model = Queue.shift();
    if (!Model) break;
    if (Model.parent && !Processed.has(Model)) Bind(Model);
    ProcessedThisTurn += 1;
  }
  if (Queue.length) ScheduleWork();
}

function ScheduleWork() {
  if (WorkScheduled || !Queue.length) return;
  WorkScheduled = true;
  if ("requestIdleCallback" in window) requestIdleCallback(ProcessQueue, { timeout: 180 });
  else setTimeout(() => ProcessQueue(null), 24);
}

setInterval(EnqueueActiveModels, 350);
setTimeout(EnqueueActiveModels, 0);
window.__STORE_PRECISION_COLLISION_BUILD__ = "V0.11-R43";
