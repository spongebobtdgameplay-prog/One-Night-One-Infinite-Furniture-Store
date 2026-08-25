import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.CollisionBoxes || !Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before core fix authority.");

const SurfaceStep = window.__STORE_SURFACE_STEP_ANIMATION_R87__;
const ExactCollisionByObject = new WeakMap();
const MaterialFixed = new WeakSet();
const ManagedOriginalNames = new Set([
  "Couch_Large1", "Couch_L", "Chair_2", "Table_RoundLarge", "Bed_King", "Bed_Single",
  "NightStand_2", "Shelf_Large", "Bookshelf", "Kitchen_Cabinet1", "Kitchen_Fridge",
  "Kitchen_Oven", "Kitchen_Sink", "Bathroom_Bathtub", "Bathroom_Toilet", "Light_Floor1"
]);
const ManagedImportedNames = new Set([
  "RetailArmchairR79", "RetailLivingShelfR79", "RetailBedroomCabinetR79", "RetailBedroomChairR79",
  "RetailStorageShelfR79", "RetailStorageCabinetR79", "RetailDisplayCabinetR79"
]);
const GRID_CELL = 0.58;
const MIN_TRIANGLE_AREA = 0.0007;
const MIN_HORIZONTAL_AMOUNT = 0.08;
const RugPattern = /CouchDisplayRugR84-|OnlineDisplayRugR75-|LargeShowroomRugR82/i;
const LegacyPattern = /GeneratedSolid|GeometryPrecise|ExactCollisionR86|ExactCollisionR87|PreciseCollision|FurnitureCollision|RetailSellableCollision/i;
const StructurePattern = /Wall|Partition|Boundary|RearStore|Ceiling|Door/i;
const TempV0 = new THREE.Vector3();
const TempV1 = new THREE.Vector3();
const TempV2 = new THREE.Vector3();
const TempInv = new THREE.Matrix4();
const TempPoint = new THREE.Vector3();
const TempClosest = new THREE.Vector3();

function IsRugObject(Object) {
  if (!Object) return false;
  const Name = String(Object.name || "");
  const Kind = String(Object.userData?.DecorationKind || "");
  return RugPattern.test(Name) || /Rug|LargeShowroomRug/i.test(Kind) || Object.userData?.WalkableCarpetR87 === true;
}

function IsManagedRoot(Object) {
  if (!Object) return false;
  if (ManagedOriginalNames.has(Object.name) || ManagedImportedNames.has(Object.name)) return true;
  if (Object.userData?.RetailSellableR84) return true;
  return false;
}

function IsStructureEntry(Entry) {
  return Entry?.PrecisePlayerStructure === true || StructurePattern.test(String(Entry?.Type || ""));
}

function EntryBox(Entry) {
  return Entry?.Box || Entry;
}

function IsLowWalkableEntry(Entry) {
  if (!Entry || IsStructureEntry(Entry)) return false;
  const Type = String(Entry.Type || "");
  const Object = Entry.CollisionObject || Entry.SourceModel || Entry.Model;
  if (/Rug|Carpet|FloorSurface|WalkableSurface/i.test(Type) || IsRugObject(Object)) return true;
  const Box = EntryBox(Entry);
  if (!Box?.min || !Box?.max) return false;
  const Height = Number(Box.max.y) - Number(Box.min.y);
  return Number(Box.max.y) <= 0.18 && Number(Box.min.y) <= 0.10 && Height <= 0.18;
}

function IsLegacyManagedEntry(Entry) {
  if (!Entry) return false;
  const Object = Entry.CollisionObject || Entry.SourceModel || Entry.Model;
  if (IsManagedRoot(Object)) return true;
  return LegacyPattern.test(String(Entry.Type || ""));
}

function PurgeGlobalEntries(Predicate) {
  for (let Index = Game.CollisionBoxes.length - 1; Index >= 0; Index -= 1) {
    if (Predicate(Game.CollisionBoxes[Index])) Game.CollisionBoxes.splice(Index, 1);
  }
}

function PurgeChunkEntries(Chunk, Predicate) {
  if (!Chunk?.CollisionEntries) return;
  for (let Index = Chunk.CollisionEntries.length - 1; Index >= 0; Index -= 1) {
    if (Predicate(Chunk.CollisionEntries[Index])) Chunk.CollisionEntries.splice(Index, 1);
  }
}

function PatchCollisionPush() {
  if (Game.CollisionBoxes.__CoreFixR87Patched) return;
  const OriginalPush = Game.CollisionBoxes.push.bind(Game.CollisionBoxes);
  Game.CollisionBoxes.push = (...Entries) => {
    const Allowed = Entries.filter(Entry => !IsLowWalkableEntry(Entry) && !IsLegacyManagedEntry(Entry) && !/Window_Large1/i.test(String(Entry?.Type || "")));
    return Allowed.length ? OriginalPush(...Allowed) : Game.CollisionBoxes.length;
  };
  Game.CollisionBoxes.__CoreFixR87Patched = true;
}
PatchCollisionPush();

function RemoveDecorativeWindows(Chunk) {
  const Remove = [];
  Chunk.Group?.traverse?.(Object => {
    if (/Window_Large1/i.test(String(Object.name || ""))) Remove.push(Object);
  });
  for (const Object of Remove) Object.parent?.remove(Object);
  PurgeChunkEntries(Chunk, Entry => /Window_Large1/i.test(String(Entry?.Type || "")) || /Window_Large1/i.test(String(Entry?.CollisionObject?.name || "")));
}

function PurgeGhostAndLegacyEntries(Chunk) {
  PurgeChunkEntries(Chunk, Entry => IsLowWalkableEntry(Entry) || IsLegacyManagedEntry(Entry));
  PurgeGlobalEntries(Entry => {
    const EntryChunk = Entry?.ChunkIndex ?? Entry?.ChunkId;
    if (EntryChunk !== undefined && Chunk.Index !== undefined && Number(EntryChunk) !== Number(Chunk.Index)) return false;
    return IsLowWalkableEntry(Entry) || IsLegacyManagedEntry(Entry);
  });
}

function RegisterWalkableRugs(Chunk) {
  Chunk.Group?.traverse?.(Object => {
    if (!Object?.parent || !IsRugObject(Object)) return;
    Object.userData.WalkableCarpetR87 = true;
    Object.userData.DecorationNoCollision = true;
    if (!Object.userData.SurfaceStepRegisteredR87) {
      SurfaceStep?.RegisterRug?.(Object, String(Chunk.Index ?? Chunk.Id ?? ""));
      Object.userData.SurfaceStepRegisteredR87 = true;
    }
  });
}

function FixDarkMaterials(Root) {
  if (!Root || MaterialFixed.has(Root)) return;
  Root.traverse(Object => {
    if (!Object.isMesh || !Object.material) return;
    const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
    for (let Index = 0; Index < Materials.length; Index += 1) {
      const Original = Materials[Index];
      if (!Original) continue;
      const Material = Original.clone();
      const Name = `${Root.name} ${Object.name}`;
      const HasMap = Boolean(Material.map);
      const Brightness = Material.color ? Material.color.r + Material.color.g + Material.color.b : 3;
      if (HasMap && Material.color && Brightness < 1.2) Material.color.setHex(0xb8beb8);
      else if (Material.color && Brightness < 0.72) {
        if (/Chair|Armchair|Couch/i.test(Name)) Material.color.setHex(0x738577);
        else if (/Shelf|Book|Box|Cabinet/i.test(Name)) Material.color.setHex(0x8f806a);
        else if (/Cart/i.test(Name)) Material.color.setHex(0x777f7c);
        else if (/Basket|Bag/i.test(Name)) Material.color.setHex(0x8d7864);
        else if (/Kitchen|Fridge|Oven|Sink|Light/i.test(Name)) Material.color.setHex(0x858b88);
        else Material.color.setHex(0x777a72);
      }
      Material.needsUpdate = true;
      Materials[Index] = Material;
    }
    Object.material = Array.isArray(Object.material) ? Materials : Materials[0];
  });
  MaterialFixed.add(Root);
}

function PointToSegmentDistanceSquared(PX, PZ, AX, AZ, BX, BZ) {
  const DX = BX - AX;
  const DZ = BZ - AZ;
  const LengthSquared = DX * DX + DZ * DZ;
  if (LengthSquared <= 1e-12) {
    const X = PX - AX;
    const Z = PZ - AZ;
    return X * X + Z * Z;
  }
  const T = THREE.MathUtils.clamp(((PX - AX) * DX + (PZ - AZ) * DZ) / LengthSquared, 0, 1);
  const X = PX - (AX + DX * T);
  const Z = PZ - (AZ + DZ * T);
  return X * X + Z * Z;
}

function PointInTriangle2D(PX, PZ, A, B, C) {
  const V0X = C.x - A.x, V0Z = C.z - A.z;
  const V1X = B.x - A.x, V1Z = B.z - A.z;
  const V2X = PX - A.x, V2Z = PZ - A.z;
  const Dot00 = V0X * V0X + V0Z * V0Z;
  const Dot01 = V0X * V1X + V0Z * V1Z;
  const Dot02 = V0X * V2X + V0Z * V2Z;
  const Dot11 = V1X * V1X + V1Z * V1Z;
  const Dot12 = V1X * V2X + V1Z * V2Z;
  const Denominator = Dot00 * Dot11 - Dot01 * Dot01;
  if (Math.abs(Denominator) < 1e-12) return false;
  const Inv = 1 / Denominator;
  const U = (Dot11 * Dot02 - Dot01 * Dot12) * Inv;
  const V = (Dot00 * Dot12 - Dot01 * Dot02) * Inv;
  return U >= 0 && V >= 0 && U + V <= 1;
}

function CircleHitsTriangle(PX, PZ, Radius, A, B, C) {
  if (PointInTriangle2D(PX, PZ, A, B, C)) return true;
  const RadiusSquared = Radius * Radius;
  return PointToSegmentDistanceSquared(PX, PZ, A.x, A.z, B.x, B.z) <= RadiusSquared ||
    PointToSegmentDistanceSquared(PX, PZ, B.x, B.z, C.x, C.z) <= RadiusSquared ||
    PointToSegmentDistanceSquared(PX, PZ, C.x, C.z, A.x, A.z) <= RadiusSquared;
}

function TriangleGridKey(X, Z) {
  return `${Math.floor(X / GRID_CELL)},${Math.floor(Z / GRID_CELL)}`;
}

function BuildExactFootprint(Model) {
  Model.updateWorldMatrix(true, true);
  const Triangles = [];
  const Grid = new Map();
  const Bounds = new THREE.Box3().setFromObject(Model);
  let MinimumY = Infinity;
  let MaximumY = -Infinity;

  Model.traverse(Object => {
    if (!Object.isMesh || !Object.visible || !Object.geometry?.attributes?.position) return;
    if (/Text|Label|Glow/i.test(String(Object.name || ""))) return;
    const Geometry = Object.geometry;
    const Positions = Geometry.attributes.position;
    const Index = Geometry.index;
    const TriangleCount = Index ? Index.count / 3 : Positions.count / 3;
    Object.updateWorldMatrix(true, false);

    for (let TriangleIndex = 0; TriangleIndex < TriangleCount; TriangleIndex += 1) {
      const IA = Index ? Index.getX(TriangleIndex * 3) : TriangleIndex * 3;
      const IB = Index ? Index.getX(TriangleIndex * 3 + 1) : TriangleIndex * 3 + 1;
      const IC = Index ? Index.getX(TriangleIndex * 3 + 2) : TriangleIndex * 3 + 2;
      TempV0.fromBufferAttribute(Positions, IA).applyMatrix4(Object.matrixWorld);
      TempV1.fromBufferAttribute(Positions, IB).applyMatrix4(Object.matrixWorld);
      TempV2.fromBufferAttribute(Positions, IC).applyMatrix4(Object.matrixWorld);

      const Area2 = Math.abs((TempV1.x - TempV0.x) * (TempV2.z - TempV0.z) - (TempV2.x - TempV0.x) * (TempV1.z - TempV0.z));
      if (Area2 < MIN_TRIANGLE_AREA) continue;
      TempPoint.subVectors(TempV1, TempV0);
      TempClosest.subVectors(TempV2, TempV0);
      const NormalY = Math.abs(TempPoint.x * TempClosest.z - TempPoint.z * TempClosest.x);
      const NormalLength = Math.max(1e-6, TempPoint.clone().cross(TempClosest).length());
      if (NormalY / NormalLength < MIN_HORIZONTAL_AMOUNT) continue;

      const A = { x: TempV0.x, z: TempV0.z };
      const B = { x: TempV1.x, z: TempV1.z };
      const C = { x: TempV2.x, z: TempV2.z };
      const Entry = { A, B, C };
      const IndexValue = Triangles.length;
      Triangles.push(Entry);
      MinimumY = Math.min(MinimumY, TempV0.y, TempV1.y, TempV2.y);
      MaximumY = Math.max(MaximumY, TempV0.y, TempV1.y, TempV2.y);
      const MinX = Math.min(A.x, B.x, C.x), MaxX = Math.max(A.x, B.x, C.x);
      const MinZ = Math.min(A.z, B.z, C.z), MaxZ = Math.max(A.z, B.z, C.z);
      for (let X = Math.floor(MinX / GRID_CELL); X <= Math.floor(MaxX / GRID_CELL); X += 1) {
        for (let Z = Math.floor(MinZ / GRID_CELL); Z <= Math.floor(MaxZ / GRID_CELL); Z += 1) {
          const Key = `${X},${Z}`;
          if (!Grid.has(Key)) Grid.set(Key, []);
          Grid.get(Key).push(IndexValue);
        }
      }
    }
  });

  return { Triangles, Grid, Bounds, MinimumY, MaximumY };
}

function CircleHitsExact(Data, Position, Radius) {
  if (!Data?.Triangles?.length) return false;
  if (Position.y < Data.Bounds.min.y - 0.35 || Position.y > Data.Bounds.max.y + 2.6) return false;
  const MinX = Math.floor((Position.x - Radius) / GRID_CELL), MaxX = Math.floor((Position.x + Radius) / GRID_CELL);
  const MinZ = Math.floor((Position.z - Radius) / GRID_CELL), MaxZ = Math.floor((Position.z + Radius) / GRID_CELL);
  const Checked = new Set();
  for (let X = MinX; X <= MaxX; X += 1) {
    for (let Z = MinZ; Z <= MaxZ; Z += 1) {
      const List = Data.Grid.get(`${X},${Z}`);
      if (!List) continue;
      for (const TriangleIndex of List) {
        if (Checked.has(TriangleIndex)) continue;
        Checked.add(TriangleIndex);
        const Triangle = Data.Triangles[TriangleIndex];
        if (CircleHitsTriangle(Position.x, Position.z, Radius, Triangle.A, Triangle.B, Triangle.C)) return true;
      }
    }
  }
  return false;
}

function BuildOrientedFallback(Model) {
  const Entries = [];
  Model.updateWorldMatrix(true, true);
  Model.traverse(Object => {
    if (!Object.isMesh || !Object.visible || /Text|Label|Glow/i.test(String(Object.name || ""))) return;
    Object.geometry?.computeBoundingBox?.();
    if (!Object.geometry?.boundingBox) return;
    Entries.push({ Object, Box: Object.geometry.boundingBox.clone() });
  });
  return Entries;
}

function CircleHitsFallback(Entries, Position, Radius) {
  for (const Entry of Entries) {
    Entry.Object.updateWorldMatrix(true, false);
    TempInv.copy(Entry.Object.matrixWorld).invert();
    TempPoint.copy(Position).applyMatrix4(TempInv);
    const Scale = Entry.Object.getWorldScale(TempClosest);
    const LocalRadius = Radius / Math.max(0.0001, Math.min(Math.abs(Scale.x), Math.abs(Scale.z)));
    const ClosestX = THREE.MathUtils.clamp(TempPoint.x, Entry.Box.min.x, Entry.Box.max.x);
    const ClosestZ = THREE.MathUtils.clamp(TempPoint.z, Entry.Box.min.z, Entry.Box.max.z);
    const DX = TempPoint.x - ClosestX;
    const DZ = TempPoint.z - ClosestZ;
    if (DX * DX + DZ * DZ <= LocalRadius * LocalRadius) return true;
  }
  return false;
}

function TransformSignature(Model) {
  Model.updateWorldMatrix(true, false);
  const E = Model.matrixWorld.elements;
  return `${E[0].toFixed(4)},${E[1].toFixed(4)},${E[2].toFixed(4)},${E[4].toFixed(4)},${E[5].toFixed(4)},${E[6].toFixed(4)},${E[8].toFixed(4)},${E[9].toFixed(4)},${E[10].toFixed(4)},${E[12].toFixed(3)},${E[13].toFixed(3)},${E[14].toFixed(3)}`;
}

function RemoveExistingExactEntry(Chunk, Root) {
  const Remove = Entry => Entry?.CoreFixR87 && Entry?.CollisionObject === Root;
  PurgeChunkEntries(Chunk, Remove);
  PurgeGlobalEntries(Remove);
}

function InstallExactCollision(Chunk, Root) {
  const Signature = TransformSignature(Root);
  const Existing = ExactCollisionByObject.get(Root);
  if (Existing?.Signature === Signature && Existing.Entry && Game.CollisionBoxes.includes(Existing.Entry)) return;
  RemoveExistingExactEntry(Chunk, Root);

  const Exact = BuildExactFootprint(Root);
  const Fallback = Exact.Triangles.length ? null : BuildOrientedFallback(Root);
  const Bounds = Exact.Bounds.clone();
  const Entry = {
    Type: `${Root.name || "Furniture"}ExactCollisionR87`,
    Box: Bounds,
    CollisionObject: Root,
    SourceModel: Root,
    CoreFixR87: true,
    CoreFixR86: true,
    PreciseGeometry: true,
    TestPlayerCollision(Position, Radius) {
      if (!Root.parent || !Root.visible || Root.userData?.CarriedR94 || Root.userData?.DeliveredR94) return false;
      return Exact.Triangles.length ? CircleHitsExact(Exact, Position, Radius) : CircleHitsFallback(Fallback, Position, Radius);
    }
  };
  Chunk.CollisionEntries ||= [];
  Chunk.CollisionEntries.push(Entry);
  Game.CollisionBoxes.push(Entry);
  ExactCollisionByObject.set(Root, { Signature, Entry });
}

function CollectManagedRoots(Chunk) {
  const Roots = [];
  const Seen = new Set();
  for (const Model of Chunk.Models || []) {
    if (!Model?.parent || !IsManagedRoot(Model) || Seen.has(Model)) continue;
    Seen.add(Model);
    Roots.push(Model);
  }
  for (const Object of Chunk.Group?.children || []) {
    if (!Object?.parent || !IsManagedRoot(Object) || Seen.has(Object)) continue;
    Seen.add(Object);
    Roots.push(Object);
  }
  return Roots;
}

function FixRetailZoneColors(Chunk) {
  for (const Object of Chunk.Group?.children || []) {
    const Name = String(Object?.name || "");
    if (!Object?.parent || IsRugObject(Object)) continue;
    if (Name.startsWith("ShoppingCartR82-") || Name.startsWith("ShoppingBasketR82-") || Name.startsWith("BagShelfR82-")) FixDarkMaterials(Object);
  }
}

export function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group) return;
  RemoveDecorativeWindows(Chunk);
  PurgeGhostAndLegacyEntries(Chunk);
  RegisterWalkableRugs(Chunk);

  const Roots = CollectManagedRoots(Chunk);
  for (const Root of Roots) {
    FixDarkMaterials(Root);
    InstallExactCollision(Chunk, Root);
  }
  FixRetailZoneColors(Chunk);

  Chunk.Group.userData.CoreFixR87 = true;
  Chunk.Group.userData.CoreFixR86 = true;
}

export function ProcessAll() {
  const Seen = new Set();
  for (const Chunk of Game.ActiveChunks.values()) {
    Seen.add(Chunk);
    ProcessChunk(Chunk);
  }
  for (const Chunk of Game.PreparedChunks.values()) if (!Seen.has(Chunk)) ProcessChunk(Chunk);
  for (let Index = Game.CollisionBoxes.length - 1; Index >= 0; Index -= 1) {
    const Entry = Game.CollisionBoxes[Index];
    if (IsLowWalkableEntry(Entry) || IsLegacyManagedEntry(Entry) || /Window_Large1/i.test(String(Entry?.Type || ""))) Game.CollisionBoxes.splice(Index, 1);
  }
}

ProcessAll();
const Interval = setInterval(ProcessAll, 1600);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_CORE_FIX_R86__ = { ProcessAll, ProcessChunk };
window.__STORE_CORE_FIX_R87__ = window.__STORE_CORE_FIX_R86__;
window.__STORE_CORE_FIX_BUILD__ = "V0.30.0-R94";