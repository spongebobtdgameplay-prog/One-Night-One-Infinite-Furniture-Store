import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.CollisionBoxes || !Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before optimized solid collision.");

const Managed = new WeakMap();
const TempMatrix = new THREE.Matrix4();
const TempPoint = new THREE.Vector3();
const TempLocalPoint = new THREE.Vector2();
const TempClosest = new THREE.Vector2();
const PlayerEyeHeight = Number(Game.PlayerEyeHeight) || 1.68;
const HULL_EPSILON = 0.00001;

function Cross(A, B, C) {
  return (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
}

function ConvexHull(Points) {
  if (Points.length < 3) return [];
  const Sorted = [...Points].sort((A, B) => A.x - B.x || A.y - B.y);
  const Unique = [];
  for (const Point of Sorted) {
    const Previous = Unique[Unique.length - 1];
    if (!Previous || Math.abs(Point.x - Previous.x) > HULL_EPSILON || Math.abs(Point.y - Previous.y) > HULL_EPSILON) Unique.push(Point);
  }
  if (Unique.length < 3) return [];

  const Lower = [];
  for (const Point of Unique) {
    while (Lower.length >= 2 && Cross(Lower[Lower.length - 2], Lower[Lower.length - 1], Point) <= HULL_EPSILON) Lower.pop();
    Lower.push(Point);
  }

  const Upper = [];
  for (let Index = Unique.length - 1; Index >= 0; Index -= 1) {
    const Point = Unique[Index];
    while (Upper.length >= 2 && Cross(Upper[Upper.length - 2], Upper[Upper.length - 1], Point) <= HULL_EPSILON) Upper.pop();
    Upper.push(Point);
  }

  Lower.pop();
  Upper.pop();
  return Lower.concat(Upper);
}

function PolygonArea(Hull) {
  let Area = 0;
  for (let Index = 0; Index < Hull.length; Index += 1) {
    const A = Hull[Index];
    const B = Hull[(Index + 1) % Hull.length];
    Area += A.x * B.y - B.x * A.y;
  }
  return Math.abs(Area) * 0.5;
}

function DistanceSquaredToSegment(X, Z, A, B, Closest = null) {
  const DX = B.x - A.x;
  const DZ = B.y - A.y;
  const LengthSquared = DX * DX + DZ * DZ;
  let T = 0;
  if (LengthSquared > 0.0000001) T = THREE.MathUtils.clamp(((X - A.x) * DX + (Z - A.y) * DZ) / LengthSquared, 0, 1);
  const ClosestX = A.x + DX * T;
  const ClosestZ = A.y + DZ * T;
  if (Closest) Closest.set(ClosestX, ClosestZ);
  const PX = X - ClosestX;
  const PZ = Z - ClosestZ;
  return PX * PX + PZ * PZ;
}

function PointInsideConvex(X, Z, Hull) {
  for (let Index = 0; Index < Hull.length; Index += 1) {
    const A = Hull[Index];
    const B = Hull[(Index + 1) % Hull.length];
    const Side = (B.x - A.x) * (Z - A.y) - (B.y - A.y) * (X - A.x);
    if (Side < -HULL_EPSILON) return false;
  }
  return true;
}

function CircleTouchesConvex(Position, Radius, Piece) {
  const Box = Piece.Box;
  const FeetY = Position.y - PlayerEyeHeight;
  const HeadY = Position.y + 0.12;
  if (Box.max.y < FeetY + 0.035 || Box.min.y > HeadY) return false;
  if (Position.x + Radius < Box.min.x || Position.x - Radius > Box.max.x || Position.z + Radius < Box.min.z || Position.z - Radius > Box.max.z) return false;
  if (PointInsideConvex(Position.x, Position.z, Piece.Hull)) return true;

  const RadiusSquared = Radius * Radius;
  for (let Index = 0; Index < Piece.Hull.length; Index += 1) {
    const A = Piece.Hull[Index];
    const B = Piece.Hull[(Index + 1) % Piece.Hull.length];
    if (DistanceSquaredToSegment(Position.x, Position.z, A, B) <= RadiusSquared) return true;
  }
  return false;
}

function ConvexContactNormal(Position, Piece, Motion, Target) {
  const Hull = Piece.Hull;
  const Inside = PointInsideConvex(Position.x, Position.z, Hull);
  let BestDistance = Infinity;
  let BestIndex = -1;

  for (let Index = 0; Index < Hull.length; Index += 1) {
    const A = Hull[Index];
    const B = Hull[(Index + 1) % Hull.length];
    const Distance = DistanceSquaredToSegment(Position.x, Position.z, A, B, TempClosest);
    if (Distance >= BestDistance) continue;
    BestDistance = Distance;
    BestIndex = Index;
    TempLocalPoint.copy(TempClosest);
  }

  if (BestIndex < 0) return null;
  const A = Hull[BestIndex];
  const B = Hull[(BestIndex + 1) % Hull.length];

  if (!Inside && BestDistance > 0.0000001) {
    Target.set(Position.x - TempLocalPoint.x, 0, Position.z - TempLocalPoint.y).normalize();
  } else {
    const EdgeX = B.x - A.x;
    const EdgeZ = B.y - A.y;
    Target.set(EdgeZ, 0, -EdgeX);
    if (Target.lengthSq() <= 0.0000001) return null;
    Target.normalize();
  }

  if (Motion?.lengthSq?.() > 0.000001 && Motion.dot(Target) > 0) Target.multiplyScalar(-1);
  return Target;
}

function BuildConvexPiece(Geometry, Matrix) {
  const Position = Geometry?.attributes?.position;
  if (!Position?.count) return null;

  const Points = [];
  let MinY = Infinity;
  let MaxY = -Infinity;

  for (let Index = 0; Index < Position.count; Index += 1) {
    TempPoint.fromBufferAttribute(Position, Index).applyMatrix4(Matrix);
    if (!Number.isFinite(TempPoint.x) || !Number.isFinite(TempPoint.y) || !Number.isFinite(TempPoint.z)) continue;
    Points.push(new THREE.Vector2(TempPoint.x, TempPoint.z));
    MinY = Math.min(MinY, TempPoint.y);
    MaxY = Math.max(MaxY, TempPoint.y);
  }

  const Hull = ConvexHull(Points);
  if (Hull.length < 3 || !Number.isFinite(MinY) || !Number.isFinite(MaxY) || PolygonArea(Hull) < 0.0002) return null;

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

  const Box = new THREE.Box3(
    new THREE.Vector3(MinX, MinY, MinZ),
    new THREE.Vector3(MaxX, MaxY, MaxZ)
  );
  return { Hull, Box };
}

function MakeEntry(Chunk, Piece, Type, Object, PieceIndex) {
  const StablePiece = {
    Hull: Piece.Hull.map(Point => Point.clone()),
    Box: Piece.Box.clone()
  };
  const StableBox = StablePiece.Box;
  const Entry = {
    Box: StableBox,
    OriginalBox: StableBox.clone(),
    OriginalLegacyBox: StableBox.clone(),
    ChunkId: Chunk.Id,
    Type,
    Active: Boolean(Chunk.Active),
    CollisionObject: Object,
    CollisionPiece: PieceIndex,
    LegacyCollisionDisabled: true,
    PreciseGeometry: true,
    ConvexCollisionR89: true,
    CollisionShape: "ConvexHull2D",
    TestPlayerCollision(Position, Radius = 0.28) {
      return CircleTouchesConvex(Position, Radius, StablePiece);
    },
    GetCollisionNormal(Position, Radius = 0.28, Motion = null, Target = new THREE.Vector3()) {
      if (!CircleTouchesConvex(Position, Radius, StablePiece)) return null;
      return ConvexContactNormal(Position, StablePiece, Motion, Target);
    }
  };
  Chunk.CollisionEntries.push(Entry);
  if (Chunk.Active && !Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
  return Entry;
}

function RemoveEntry(Chunk, Entry) {
  if (!Entry) return;
  Entry.Active = false;
  for (let Index = Game.CollisionBoxes.length - 1; Index >= 0; Index -= 1) if (Game.CollisionBoxes[Index] === Entry) Game.CollisionBoxes.splice(Index, 1);
  const Index = Chunk?.CollisionEntries?.indexOf?.(Entry) ?? -1;
  if (Index >= 0) Chunk.CollisionEntries.splice(Index, 1);
}

function RemoveManaged(Object) {
  const Record = Managed.get(Object);
  if (!Record) return;
  for (const Entry of Record.Entries) RemoveEntry(Record.Chunk, Entry);
  Managed.delete(Object);
}

function RemoveSupersededObjectEntries(Chunk, Object) {
  for (const Entry of [...(Chunk.CollisionEntries || [])]) {
    if (!Entry || Entry.ConvexCollisionR89 || Entry.WalkableSurfaceR88) continue;
    if (Entry.CollisionObject !== Object && Entry.SourceModel !== Object && Entry.Model !== Object) continue;
    RemoveEntry(Chunk, Entry);
  }
}

function HasTextAncestor(Object, Root) {
  let Current = Object;
  while (Current && Current !== Root) {
    if (/Text|Label|Glow/i.test(String(Current.name || ""))) return true;
    Current = Current.parent;
  }
  return false;
}

function MeshConvexPieces(Root, Limit = 18) {
  const Pieces = [];
  Root.updateWorldMatrix(true, true);
  Root.traverse(Object => {
    if (Pieces.length >= Limit || !Object?.isMesh || Object.isInstancedMesh || !Object.visible || !Object.geometry) return;
    if (HasTextAncestor(Object, Root)) return;
    if (/TextGeometry/i.test(String(Object.geometry?.type || ""))) return;
    Object.updateWorldMatrix(true, false);
    const Piece = BuildConvexPiece(Object.geometry, Object.matrixWorld);
    if (Piece) Pieces.push(Piece);
  });
  return Pieces;
}

function InstanceConvexPieces(Object, Limit = 80) {
  const Pieces = [];
  if (!Object?.isInstancedMesh || !Object.geometry) return Pieces;
  Object.updateWorldMatrix(true, false);
  const Count = Math.min(Object.count || 0, Limit);
  for (let Index = 0; Index < Count; Index += 1) {
    Object.getMatrixAt(Index, TempMatrix);
    TempMatrix.premultiply(Object.matrixWorld);
    const Piece = BuildConvexPiece(Object.geometry, TempMatrix);
    if (Piece) Pieces.push(Piece);
  }
  return Pieces;
}

function ObjectKind(Object) {
  const Name = String(Object?.name || "");
  if (Object?.userData?.CardboardBoxMarkerR88) return "";
  if (Object?.userData?.CardboardBoxInstancesR88 && Object.isInstancedMesh) return "CardboardBoxAisle";
  if (Object?.userData?.RetailSellableR84) return "RetailFurniture";
  if (Name === "DepartmentHeaderR73") return "DepartmentSign";
  if (Name.startsWith("RetailZoneHeaderR82-")) return "DepartmentSign";
  if (Name.startsWith("CompactPriceTagR83-")) return "FurnitureSign";
  if (Name === "StoreTask" || Name.startsWith("TaskTerminal3D")) return "StoreFixture";
  if (Name.startsWith("CouchDisplayRugR84-")) return "";
  if (Name.startsWith("OnlineChunkDecorationR76-")) return "FloorDecoration";
  if (Name.startsWith("OnlineSurfaceDecorationR76-")) return "SurfaceDecoration";
  if (Name.startsWith("OnlineWallDecorationR76-")) return "WallDecoration";
  if (Name.startsWith("OnlineDisplayRugR75-") || Name === "LargeShowroomRugR82") return "";
  if (Object?.userData?.DecorationKind === "Rug" || Object?.userData?.DecorationKind === "LargeShowroomRug") return "";
  if (Name === "Houseplant_3") return "Plant";
  if (Name === "WarehouseBoxes" && Object.isInstancedMesh) return "WarehouseBoxes";
  if (Name === "Ceiling") return "Ceiling";
  if (Name === "LightHousing") return "CeilingFixture";
  if (Name === "PartitionCap" || Name === "PartitionBase") return "PartitionTrim";
  if (Name === "BaseboardLeft" || Name === "BaseboardRight") return "Baseboard";
  return "";
}

function Signature(Object) {
  Object.updateWorldMatrix(true, true);
  const E = Object.matrixWorld.elements;
  const InstanceVersion = Object?.isInstancedMesh ? Number(Object.instanceMatrix?.version) || 0 : 0;
  return `${E[0].toFixed(3)}:${E[2].toFixed(3)}:${E[5].toFixed(3)}:${E[8].toFixed(3)}:${E[10].toFixed(3)}:${E[12].toFixed(3)}:${E[13].toFixed(3)}:${E[14].toFixed(3)}:${Object.children?.length || 0}:${Object.visible ? 1 : 0}:${Object.count || 0}:${InstanceVersion}`;
}

function Install(Object, Chunk, Kind) {
  const CurrentSignature = Signature(Object);
  const Existing = Managed.get(Object);
  if (Existing?.Signature === CurrentSignature && Existing.Chunk === Chunk) return;
  if (Existing) RemoveManaged(Object);

  RemoveSupersededObjectEntries(Chunk, Object);

  let Pieces;
  if (Kind === "WarehouseBoxes" || Kind === "CardboardBoxAisle") Pieces = InstanceConvexPieces(Object, 80);
  else if (Kind === "FurnitureSign" || Kind === "DepartmentSign") Pieces = MeshConvexPieces(Object, 18);
  else if (Kind === "StoreFixture") Pieces = MeshConvexPieces(Object, 24);
  else if (Kind === "RetailFurniture") Pieces = MeshConvexPieces(Object, 20);
  else if (Kind === "SurfaceDecoration") Pieces = MeshConvexPieces(Object, 6);
  else Pieces = MeshConvexPieces(Object, 10);

  const Entries = [];
  for (let Index = 0; Index < Pieces.length; Index += 1) Entries.push(MakeEntry(Chunk, Pieces[Index], `${Kind}ConvexR89`, Object, Index));
  Managed.set(Object, { Chunk, Entries, Signature: CurrentSignature });
  Object.userData.SolidCollisionR83 = true;
  Object.userData.ConvexCollisionR89 = true;
}

export function ProcessChunk(Chunk, Force = false) {
  if (!Chunk?.Group || Chunk.Cancelled) return;
  if (!Force && Chunk.Group.userData?.PresentationReadyR83 && Chunk.Group.userData?.SolidCollisionFinalR83) return;
  Chunk.Group.traverse(Object => {
    const Kind = ObjectKind(Object);
    if (Kind) Install(Object, Chunk, Kind);
    else if (Managed.has(Object)) RemoveManaged(Object);
  });
  if (Chunk.Group.userData?.PresentationReadyR83) Chunk.Group.userData.SolidCollisionFinalR83 = true;
}

function CleanupRemoved() {
  for (const [Object, Record] of [...Managed]) {
    if (Object?.parent && !Record.Chunk?.Cancelled) continue;
    RemoveManaged(Object);
  }
}

export function ProcessAll(Force = false) {
  for (const Chunk of Game.ActiveChunks.values()) ProcessChunk(Chunk, Force);
  CleanupRemoved();
}

ProcessAll();
const Interval = setInterval(() => ProcessAll(false), 1100);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_SOLID_OBJECT_COLLISION_R83__ = { ProcessAll, ProcessChunk };
window.__STORE_SOLID_OBJECT_COLLISION_BUILD__ = "V0.27.9-R90";
