import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.CollisionBoxes || !Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before solid object collision.");

const Managed = new Map();
const TempMatrix = new THREE.Matrix4();
const TempBox = new THREE.Box3();
const PlayerEyeHeight = 1.68;

function CircleTouchesBox(Position, Radius, Box) {
  const ClosestX = THREE.MathUtils.clamp(Position.x, Box.min.x, Box.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Box.min.z, Box.max.z);
  const DX = Position.x - ClosestX;
  const DZ = Position.z - ClosestZ;
  return DX * DX + DZ * DZ <= Radius * Radius;
}

function PlayerTouchesBox(Position, Radius, Box) {
  const FeetY = Position.y - PlayerEyeHeight;
  const HeadY = Position.y + 0.12;
  if (Box.max.y < FeetY + 0.035 || Box.min.y > HeadY) return false;
  if (Box.max.y <= 0.11 && Box.max.y - Box.min.y <= 0.10) return false;
  return CircleTouchesBox(Position, Radius, Box);
}

function MakeEntry(Chunk, Box, Type, Object, Piece) {
  const StableBox = Box.clone();
  const Entry = {
    Box: StableBox,
    OriginalBox: StableBox.clone(),
    OriginalLegacyBox: StableBox.clone(),
    ChunkId: Chunk.Id,
    Type,
    Active: Boolean(Chunk.Active),
    SolidObjectR77: true,
    CollisionObject: Object,
    CollisionPiece: Piece,
    LegacyCollisionDisabled: true,
    PreciseGeometry: true,
    TestPlayerCollision(Position, Radius = 0.28) {
      return PlayerTouchesBox(Position, Radius, StableBox);
    }
  };
  Chunk.CollisionEntries.push(Entry);
  if (Chunk.Active && !Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
  return Entry;
}

function RemoveEntry(Chunk, Entry) {
  if (!Entry) return;
  Entry.Active = false;
  for (let Index = Game.CollisionBoxes.length - 1; Index >= 0; Index -= 1) {
    if (Game.CollisionBoxes[Index] === Entry) Game.CollisionBoxes.splice(Index, 1);
  }
  const Index = Chunk?.CollisionEntries?.indexOf?.(Entry) ?? -1;
  if (Index >= 0) Chunk.CollisionEntries.splice(Index, 1);
}

function RemoveManaged(Object) {
  const Record = Managed.get(Object);
  if (!Record) return;
  for (const Entry of Record.Entries) RemoveEntry(Record.Chunk, Entry);
  Managed.delete(Object);
}

function HasTextAncestor(Object, Root) {
  let Current = Object;
  while (Current && Current !== Root) {
    const Name = String(Current.name || "");
    if (/Text|Label|Glow/i.test(Name)) return true;
    Current = Current.parent;
  }
  return false;
}

function MeshBoxes(Root, Limit = 18) {
  const Boxes = [];
  Root.updateWorldMatrix(true, true);
  Root.traverse(Object => {
    if (Boxes.length >= Limit || !Object?.isMesh || !Object.visible) return;
    if (HasTextAncestor(Object, Root)) return;
    if (/TextGeometry/i.test(String(Object.geometry?.type || ""))) return;
    const Box = new THREE.Box3().setFromObject(Object);
    if (Box.isEmpty()) return;
    const Size = Box.getSize(new THREE.Vector3());
    if (Size.x < 0.018 || Size.y < 0.018 || Size.z < 0.018) return;
    Boxes.push(Box);
  });
  return Boxes;
}

function InstanceBoxes(Object, Limit = 60) {
  const Boxes = [];
  if (!Object?.isInstancedMesh || !Object.geometry) return Boxes;
  Object.geometry.computeBoundingBox?.();
  const Local = Object.geometry.boundingBox;
  if (!Local) return Boxes;
  Object.updateWorldMatrix(true, false);
  const Count = Math.min(Object.count || 0, Limit);

  for (let Index = 0; Index < Count; Index += 1) {
    Object.getMatrixAt(Index, TempMatrix);
    TempMatrix.premultiply(Object.matrixWorld);
    TempBox.copy(Local).applyMatrix4(TempMatrix);
    if (!TempBox.isEmpty()) Boxes.push(TempBox.clone());
  }
  return Boxes;
}

function ObjectKind(Object) {
  const Name = String(Object?.name || "");
  if (Name === "DepartmentHeaderR73") return "DepartmentSign";
  if (Name.startsWith("FurnitureItemSignR74-")) return "FurnitureSign";
  if (Name.startsWith("OnlineChunkDecorationR76-")) return "FloorDecoration";
  if (Name.startsWith("OnlineWallDecorationR76-")) return "WallDecoration";
  if (Name === "Houseplant_3") return "Plant";
  if (Name === "WarehouseBoxes" && Object.isInstancedMesh) return "WarehouseBoxes";
  return "";
}

function ObjectSignature(Object) {
  Object.updateWorldMatrix(true, true);
  const Elements = Object.matrixWorld.elements;
  return `${Elements[12].toFixed(3)}:${Elements[13].toFixed(3)}:${Elements[14].toFixed(3)}:${Object.children?.length || 0}:${Object.visible ? 1 : 0}`;
}

function Install(Object, Chunk, Kind) {
  const Existing = Managed.get(Object);
  const Signature = ObjectSignature(Object);
  if (Existing?.Signature === Signature && Existing.Chunk === Chunk) return;
  if (Existing) RemoveManaged(Object);

  let Boxes;
  if (Kind === "WarehouseBoxes") Boxes = InstanceBoxes(Object, 80);
  else if (Kind === "FurnitureSign" || Kind === "DepartmentSign") Boxes = MeshBoxes(Object, 16);
  else Boxes = MeshBoxes(Object, 10);

  const Entries = [];
  for (let Index = 0; Index < Boxes.length; Index += 1) {
    Entries.push(MakeEntry(Chunk, Boxes[Index], `${Kind}SolidR77`, Object, Index));
  }
  Managed.set(Object, { Chunk, Entries, Signature });
  Object.userData.SolidCollisionR77 = true;
}

function FindChunkById(Id) {
  for (const Chunk of Game.ActiveChunks.values()) if (Chunk?.Id === Id) return Chunk;
  for (const Chunk of Game.PreparedChunks.values()) if (Chunk?.Id === Id) return Chunk;
  return null;
}

function ScanChunk(Chunk) {
  if (!Chunk?.Group || Chunk.Cancelled) return;
  Chunk.Group.traverse(Object => {
    const Kind = ObjectKind(Object);
    if (!Kind) return;
    Install(Object, Chunk, Kind);
  });
}

function CleanupRemoved() {
  for (const [Object, Record] of [...Managed]) {
    if (Object?.parent && !Record.Chunk?.Cancelled) continue;
    RemoveManaged(Object);
  }
}

function RebuildReservationsForSolids() {
  for (const [Object, Record] of Managed) {
    if (!Object?.parent || !Record?.Chunk?.ReservedBounds) continue;
    const Kind = ObjectKind(Object);
    if (Kind !== "FurnitureSign" && Kind !== "FloorDecoration") continue;
    const Bounds = new THREE.Box3().setFromObject(Object);
    if (Bounds.isEmpty()) continue;
    const Center = Bounds.getCenter(new THREE.Vector3());
    let AlreadyCovered = false;
    for (const Reserved of Record.Chunk.ReservedBounds) {
      if (!Reserved?.containsPoint?.(Center)) continue;
      AlreadyCovered = true;
      break;
    }
    if (!AlreadyCovered) Record.Chunk.ReservedBounds.push(Bounds.clone());
  }
}

function ProcessAll() {
  const Seen = new Set();
  for (const Chunk of Game.ActiveChunks.values()) {
    Seen.add(Chunk);
    ScanChunk(Chunk);
  }
  for (const Chunk of Game.PreparedChunks.values()) {
    if (!Seen.has(Chunk)) ScanChunk(Chunk);
  }
  CleanupRemoved();
  RebuildReservationsForSolids();
}

ProcessAll();
const Interval = setInterval(ProcessAll, 420);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_SOLID_OBJECT_COLLISION_R77__ = { ProcessAll };
window.__STORE_SOLID_OBJECT_COLLISION_BUILD__ = "V0.18.0-R77";