import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;

if (Game?.Scene && Game?.Camera && Game?.CollisionBoxes) {
  const ProcessedModels = new WeakSet();
  const LocalFootprints = new Map();
  const TempA = new THREE.Vector3();
  const TempB = new THREE.Vector3();
  const TempC = new THREE.Vector3();
  const TempAB = new THREE.Vector3();
  const TempAC = new THREE.Vector3();
  const TempNormal = new THREE.Vector3();
  const RootInverse = new THREE.Matrix4();
  const MIN_PROJECTED_TRIANGLE_AREA = 0.006;
  const MIN_UPWARD_NORMAL = 0.22;
  const PROCESS_DISTANCE_SQ = 52 * 52;

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
    if (PointInsideTriangle(X, Z, A, B, C)) return true;
    if (DistanceSquaredToSegment(X, Z, A, B) <= RadiusSquared) return true;
    if (DistanceSquaredToSegment(X, Z, B, C) <= RadiusSquared) return true;
    if (DistanceSquaredToSegment(X, Z, C, A) <= RadiusSquared) return true;
    return false;
  }

  function IsUsefulTriangle(A, B, C) {
    TempAB.copy(B).sub(A);
    TempAC.copy(C).sub(A);
    TempNormal.crossVectors(TempAB, TempAC);
    const Length = TempNormal.length();
    if (Length <= 0.000001) return false;
    TempNormal.multiplyScalar(1 / Length);
    if (Math.abs(TempNormal.y) < MIN_UPWARD_NORMAL) return false;
    const Area = Math.abs((B.x - A.x) * (C.z - A.z) - (B.z - A.z) * (C.x - A.x)) * 0.5;
    return Area >= MIN_PROJECTED_TRIANGLE_AREA;
  }

  function BuildLocalFootprint(Model) {
    const Cached = LocalFootprints.get(Model.name);
    if (Cached) return Cached;

    Model.updateMatrixWorld(true);
    RootInverse.copy(Model.matrixWorld).invert();
    const Triangles = [];

    Model.traverse(Object => {
      if (!Object.isMesh || !Object.visible || !Object.geometry?.attributes?.position) return;
      const Position = Object.geometry.attributes.position;
      const Index = Object.geometry.index;
      const TriangleCount = Index ? Math.floor(Index.count / 3) : Math.floor(Position.count / 3);

      for (let TriangleIndex = 0; TriangleIndex < TriangleCount; TriangleIndex += 1) {
        const Offset = TriangleIndex * 3;
        const AIndex = Index ? Index.getX(Offset) : Offset;
        const BIndex = Index ? Index.getX(Offset + 1) : Offset + 1;
        const CIndex = Index ? Index.getX(Offset + 2) : Offset + 2;
        TempA.fromBufferAttribute(Position, AIndex).applyMatrix4(Object.matrixWorld).applyMatrix4(RootInverse);
        TempB.fromBufferAttribute(Position, BIndex).applyMatrix4(Object.matrixWorld).applyMatrix4(RootInverse);
        TempC.fromBufferAttribute(Position, CIndex).applyMatrix4(Object.matrixWorld).applyMatrix4(RootInverse);
        if (!IsUsefulTriangle(TempA, TempB, TempC)) continue;
        Triangles.push([
          new THREE.Vector2(TempA.x, TempA.z),
          new THREE.Vector2(TempB.x, TempB.z),
          new THREE.Vector2(TempC.x, TempC.z)
        ]);
      }
    });

    LocalFootprints.set(Model.name, Triangles);
    return Triangles;
  }

  function TransformFootprint(Model) {
    const Local = BuildLocalFootprint(Model);
    const Triangles = [];
    const Bounds = new THREE.Box2().makeEmpty();
    const Elements = Model.matrixWorld.elements;

    function Transform(Point) {
      const X = Elements[0] * Point.x + Elements[8] * Point.y + Elements[12];
      const Z = Elements[2] * Point.x + Elements[10] * Point.y + Elements[14];
      const Result = new THREE.Vector2(X, Z);
      Bounds.expandByPoint(Result);
      return Result;
    }

    for (const Triangle of Local) {
      Triangles.push([Transform(Triangle[0]), Transform(Triangle[1]), Transform(Triangle[2])]);
    }
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

  function CreatePreciseBounds(Geometry) {
    let LastX = NaN;
    let LastZ = NaN;
    let LastRadius = NaN;
    let LastResult = false;

    function Evaluate() {
      const X = Game.Camera.position.x;
      const Z = Game.Camera.position.z;
      const Radius = Player?.GetPlayerRadius?.() || 0.23;
      if (X !== LastX || Z !== LastZ || Radius !== LastRadius) {
        LastX = X;
        LastZ = Z;
        LastRadius = Radius;
        LastResult = CircleHitsGeometry(X, Z, Radius, Geometry);
      }
      return LastResult;
    }

    const Min = { y: 0 };
    const Max = { y: 2.5 };
    Object.defineProperty(Min, "x", { get: () => Evaluate() ? Game.Camera.position.x : Infinity });
    Object.defineProperty(Min, "z", { get: () => Evaluate() ? Game.Camera.position.z : Infinity });
    Object.defineProperty(Max, "x", { get: () => Evaluate() ? Game.Camera.position.x : -Infinity });
    Object.defineProperty(Max, "z", { get: () => Evaluate() ? Game.Camera.position.z : -Infinity });
    return { min: Min, max: Max };
  }

  function BindPreciseCollision(Model) {
    const ChunkId = Model.userData?.ChunkId;
    const Name = Model.name;
    if (!ChunkId || !Name) {
      ProcessedModels.add(Model);
      return;
    }

    const Candidates = Game.CollisionBoxes.filter(Entry => Entry.ChunkId === ChunkId && Entry.Type === Name && !Entry.PreciseGeometry);
    if (!Candidates.length) return;

    Model.updateMatrixWorld(true);
    const Geometry = TransformFootprint(Model);
    if (!Geometry.Triangles.length || Geometry.Bounds.isEmpty()) {
      ProcessedModels.add(Model);
      return;
    }

    const Center = Geometry.Bounds.getCenter(new THREE.Vector2());
    let BestEntry = null;
    let BestDistance = Infinity;
    for (const Entry of Candidates) {
      const Bounds = Entry.Box;
      const EntryX = (Bounds.min.x + Bounds.max.x) * 0.5;
      const EntryZ = (Bounds.min.z + Bounds.max.z) * 0.5;
      const DX = EntryX - Center.x;
      const DZ = EntryZ - Center.y;
      const Distance = DX * DX + DZ * DZ;
      if (Distance < BestDistance) {
        BestDistance = Distance;
        BestEntry = Entry;
      }
    }
    if (!BestEntry) return;

    BestEntry.OriginalBox = BestEntry.Box;
    BestEntry.PreciseTriangles = Geometry.Triangles;
    BestEntry.GeometryBounds = Geometry.Bounds;
    BestEntry.Box = CreatePreciseBounds(Geometry);
    BestEntry.PreciseGeometry = true;
    ProcessedModels.add(Model);
  }

  function ProcessNearestModel() {
    let Best = null;
    let BestDistance = Infinity;
    for (const Object of Game.Scene.children) {
      if (!Object?.isObject3D || Object.name === "PlayerCharacterPivot" || ProcessedModels.has(Object)) continue;
      const ChunkId = Object.userData?.ChunkId;
      if (!ChunkId) continue;
      const HasCandidate = Game.CollisionBoxes.some(Entry => Entry.ChunkId === ChunkId && Entry.Type === Object.name && !Entry.PreciseGeometry);
      if (!HasCandidate) continue;
      const DX = Object.position.x - Game.Camera.position.x;
      const DZ = Object.position.z - Game.Camera.position.z;
      const Distance = DX * DX + DZ * DZ;
      if (Distance > PROCESS_DISTANCE_SQ || Distance >= BestDistance) continue;
      Best = Object;
      BestDistance = Distance;
    }
    if (Best) BindPreciseCollision(Best);
  }

  const Timer = setInterval(ProcessNearestModel, 110);
  addEventListener("pagehide", () => clearInterval(Timer), { once: true });
  window.__STORE_PRECISION_COLLISION_BUILD__ = "V0.11-R35";
}
