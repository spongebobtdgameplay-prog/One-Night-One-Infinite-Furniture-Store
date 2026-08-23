import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;

if (Game?.Scene && Game?.Camera && Game?.CollisionBoxes) {
  const ProcessedModels = new WeakSet();
  const TempVertex = new THREE.Vector3();

  function Cross(Origin, A, B) {
    return (A.x - Origin.x) * (B.y - Origin.y) - (A.y - Origin.y) * (B.x - Origin.x);
  }

  function ConvexHull(Points) {
    if (Points.length < 3) return Points;
    const Sorted = Points.slice().sort((A, B) => A.x === B.x ? A.y - B.y : A.x - B.x);
    const Lower = [];
    for (const Point of Sorted) {
      while (Lower.length >= 2 && Cross(Lower[Lower.length - 2], Lower[Lower.length - 1], Point) <= 0.000001) Lower.pop();
      Lower.push(Point);
    }
    const Upper = [];
    for (let Index = Sorted.length - 1; Index >= 0; Index -= 1) {
      const Point = Sorted[Index];
      while (Upper.length >= 2 && Cross(Upper[Upper.length - 2], Upper[Upper.length - 1], Point) <= 0.000001) Upper.pop();
      Upper.push(Point);
    }
    Lower.pop();
    Upper.pop();
    return Lower.concat(Upper);
  }

  function BuildModelHull(Model) {
    Model.updateMatrixWorld(true);
    const Unique = new Map();
    Model.traverse(Object => {
      if (!Object.isMesh || !Object.visible || !Object.geometry?.attributes?.position) return;
      const Position = Object.geometry.attributes.position;
      for (let Index = 0; Index < Position.count; Index += 1) {
        TempVertex.fromBufferAttribute(Position, Index).applyMatrix4(Object.matrixWorld);
        const X = Math.round(TempVertex.x * 10000) / 10000;
        const Z = Math.round(TempVertex.z * 10000) / 10000;
        Unique.set(`${X}:${Z}`, new THREE.Vector2(X, Z));
      }
    });
    return ConvexHull([...Unique.values()]);
  }

  function PointInsideConvex(X, Z, Hull) {
    let Direction = 0;
    for (let Index = 0; Index < Hull.length; Index += 1) {
      const A = Hull[Index];
      const B = Hull[(Index + 1) % Hull.length];
      const Value = (B.x - A.x) * (Z - A.y) - (B.y - A.y) * (X - A.x);
      if (Math.abs(Value) <= 0.000001) continue;
      const Current = Math.sign(Value);
      if (!Direction) Direction = Current;
      else if (Current !== Direction) return false;
    }
    return true;
  }

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

  function CircleHitsHull(X, Z, Radius, Hull) {
    if (PointInsideConvex(X, Z, Hull)) return true;
    const RadiusSquared = Radius * Radius;
    for (let Index = 0; Index < Hull.length; Index += 1) {
      const A = Hull[Index];
      const B = Hull[(Index + 1) % Hull.length];
      if (DistanceSquaredToSegment(X, Z, A, B) <= RadiusSquared) return true;
    }
    return false;
  }

  function HullCenter(Hull) {
    let MinX = Infinity;
    let MaxX = -Infinity;
    let MinZ = Infinity;
    let MaxZ = -Infinity;
    for (const Point of Hull) {
      MinX = Math.min(MinX, Point.x);
      MaxX = Math.max(MaxX, Point.x);
      MinZ = Math.min(MinZ, Point.y);
      MaxZ = Math.max(MaxZ, Point.y);
    }
    return new THREE.Vector2((MinX + MaxX) * 0.5, (MinZ + MaxZ) * 0.5);
  }

  function BoundsCenter(Bounds) {
    return new THREE.Vector2((Bounds.min.x + Bounds.max.x) * 0.5, (Bounds.min.z + Bounds.max.z) * 0.5);
  }

  function CreatePreciseBounds(Hull) {
    let LastX = NaN;
    let LastZ = NaN;
    let LastRadius = NaN;
    let LastResult = false;

    function Evaluate() {
      const X = Game.Camera.position.x;
      const Z = Game.Camera.position.z;
      const Radius = Player?.GetPlayerRadius?.() || 0.43;
      if (X !== LastX || Z !== LastZ || Radius !== LastRadius) {
        LastX = X;
        LastZ = Z;
        LastRadius = Radius;
        LastResult = CircleHitsHull(X, Z, Radius, Hull);
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
    if (ProcessedModels.has(Model)) return;
    const ChunkId = Model.userData?.ChunkId;
    const Name = Model.name;
    if (!ChunkId || !Name) {
      ProcessedModels.add(Model);
      return;
    }

    const Candidates = Game.CollisionBoxes.filter(Entry => Entry.ChunkId === ChunkId && Entry.Type === Name && !Entry.PreciseConvex);
    if (!Candidates.length) {
      ProcessedModels.add(Model);
      return;
    }

    const Hull = BuildModelHull(Model);
    if (Hull.length < 3) {
      ProcessedModels.add(Model);
      return;
    }

    const Center = HullCenter(Hull);
    let BestEntry = null;
    let BestDistance = Infinity;
    for (const Entry of Candidates) {
      const EntryCenter = BoundsCenter(Entry.Box);
      const Distance = EntryCenter.distanceToSquared(Center);
      if (Distance < BestDistance) {
        BestDistance = Distance;
        BestEntry = Entry;
      }
    }
    if (!BestEntry) return;

    BestEntry.OriginalBox = BestEntry.Box;
    BestEntry.ConvexHull = Hull;
    BestEntry.Box = CreatePreciseBounds(Hull);
    BestEntry.PreciseConvex = true;
    ProcessedModels.add(Model);
  }

  function ProcessScene() {
    for (const Object of Game.Scene.children) {
      if (!Object?.isObject3D || Object.name === "PlayerCharacterPivot") continue;
      BindPreciseCollision(Object);
    }
    requestAnimationFrame(ProcessScene);
  }

  requestAnimationFrame(ProcessScene);
  window.__STORE_PRECISION_COLLISION_BUILD__ = "V0.11";
}
