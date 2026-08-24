import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.CollisionBoxes) throw new Error("Game must load before generator integrity.");

const FurnitureNames = new Set([
  "Couch_Large1",
  "Couch_L",
  "Chair_2",
  "Table_RoundLarge",
  "Bed_King",
  "Bed_Single",
  "NightStand_2",
  "Shelf_Large",
  "Bookshelf",
  "Kitchen_Cabinet1",
  "Kitchen_Fridge",
  "Kitchen_Oven",
  "Kitchen_Sink",
  "Bathroom_Bathtub",
  "Bathroom_Toilet",
  "Light_Floor1",
  "Door_3",
  "Window_Large1"
]);

const State = new WeakMap();
const ClaimedEntries = new WeakSet();
const TempCenter = new THREE.Vector3();
const TempSize = new THREE.Vector3();
const TempDelta = new THREE.Vector3();

function BoundsOf(Object) {
  Object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Object);
}

function HorizontalOverlap(A, B, Padding = 0.035) {
  return A.max.x > B.min.x - Padding && A.min.x < B.max.x + Padding && A.max.z > B.min.z - Padding && A.min.z < B.max.z + Padding;
}

function InsideChunk(Chunk, Bounds) {
  if (Bounds.min.x < -16.52 || Bounds.max.x > 16.52) return false;
  if (Bounds.min.z < Chunk.BottomZ + 0.40 || Bounds.max.z > Chunk.TopZ - 0.40) return false;
  for (const Structure of Chunk.StructureBounds || []) {
    if (HorizontalOverlap(Bounds, Structure, 0.045)) return false;
  }
  return true;
}

function ClearOfAccepted(Bounds, Accepted) {
  for (const Other of Accepted) {
    if (HorizontalOverlap(Bounds, Other, 0.045)) return false;
  }
  return true;
}

function CandidateOffsets() {
  const Offsets = [[0, 0]];
  for (let Radius = 0.35; Radius <= 6.30; Radius += 0.35) {
    for (let Step = 0; Step < 16; Step += 1) {
      const Angle = Step / 16 * Math.PI * 2;
      Offsets.push([Math.cos(Angle) * Radius, Math.sin(Angle) * Radius]);
    }
  }
  return Offsets;
}

const Offsets = CandidateOffsets();

function FindSafePosition(Chunk, Model, Bounds, Accepted) {
  Bounds.getCenter(TempCenter);
  const OriginalSide = Math.abs(TempCenter.x) > 4.3 ? Math.sign(TempCenter.x) : 0;

  for (const [DX, DZ] of Offsets) {
    const Candidate = Bounds.clone().translate(TempDelta.set(DX, 0, DZ));
    Candidate.getCenter(TempCenter);
    if (OriginalSide && (Math.sign(TempCenter.x) !== OriginalSide || Math.abs(TempCenter.x) < 4.05)) continue;
    if (!InsideChunk(Chunk, Candidate)) continue;
    if (!ClearOfAccepted(Candidate, Accepted)) continue;
    return { DX, DZ, Bounds: Candidate };
  }

  return null;
}

function EntryBounds(Entry) {
  return Entry?.OriginalLegacyBox || Entry?.OriginalBox || Entry?.Box || null;
}

function NearestEntry(Chunk, Model, Bounds) {
  Bounds.getCenter(TempCenter);
  let Best = null;
  let BestDistance = Infinity;

  for (const Entry of Chunk.CollisionEntries || []) {
    if (!Entry || Entry.Type !== Model.name || ClaimedEntries.has(Entry)) continue;
    const Box = EntryBounds(Entry);
    if (!Box?.min || !Box?.max) continue;
    const X = (Box.min.x + Box.max.x) * 0.5;
    const Z = (Box.min.z + Box.max.z) * 0.5;
    const DX = X - TempCenter.x;
    const DZ = Z - TempCenter.z;
    const Distance = DX * DX + DZ * DZ;
    if (Distance >= BestDistance) continue;
    BestDistance = Distance;
    Best = Entry;
  }

  if (Best) ClaimedEntries.add(Best);
  return Best;
}

function TranslateEntry(Entry, DX, DZ) {
  if (!Entry || (!DX && !DZ)) return;
  const Delta = new THREE.Vector3(DX, 0, DZ);
  const Seen = new Set();
  for (const Key of ["Box", "OriginalBox", "OriginalLegacyBox", "OriginalStructureBox"]) {
    const Box = Entry[Key];
    if (!Box?.translate || Seen.has(Box)) continue;
    Seen.add(Box);
    Box.translate(Delta);
  }

  if (Array.isArray(Entry.PreciseTriangles)) {
    for (const Triangle of Entry.PreciseTriangles) {
      for (const Point of Triangle || []) {
        if (!Point) continue;
        Point.x += DX;
        Point.y += DZ;
      }
    }
  }

  if (Entry.GeometryBounds?.min && Entry.GeometryBounds?.max) {
    Entry.GeometryBounds.min.x += DX;
    Entry.GeometryBounds.max.x += DX;
    Entry.GeometryBounds.min.y += DZ;
    Entry.GeometryBounds.max.y += DZ;
  }
}

function TightenEntryToModel(Entry, Model) {
  if (!Entry || Entry.PreciseGeometry || typeof Entry.TestPlayerCollision === "function") return;
  const Bounds = BoundsOf(Model);
  if (Bounds.isEmpty()) return;
  const Center = Bounds.getCenter(new THREE.Vector3());
  const Size = Bounds.getSize(new THREE.Vector3());
  const HalfX = Math.max(0.10, Size.x * 0.485);
  const HalfZ = Math.max(0.10, Size.z * 0.485);
  const Box = new THREE.Box3(
    new THREE.Vector3(Center.x - HalfX, Math.max(0, Bounds.min.y), Center.z - HalfZ),
    new THREE.Vector3(Center.x + HalfX, Bounds.max.y, Center.z + HalfZ)
  );
  Entry.Box = Box;
  Entry.OriginalBox = Box.clone();
  Entry.OriginalLegacyBox = Box.clone();
  Entry.GeneratorExactR77 = true;
}

function RemoveEntry(Chunk, Entry) {
  if (!Entry) return;
  Entry.Active = false;
  for (let Index = Game.CollisionBoxes.length - 1; Index >= 0; Index -= 1) {
    if (Game.CollisionBoxes[Index] === Entry) Game.CollisionBoxes.splice(Index, 1);
  }
  const LocalIndex = Chunk.CollisionEntries.indexOf(Entry);
  if (LocalIndex >= 0) Chunk.CollisionEntries.splice(LocalIndex, 1);
}

function RemoveModel(Chunk, Model, Entry) {
  RemoveEntry(Chunk, Entry);
  Model.parent?.remove(Model);
  const Index = Chunk.Models.indexOf(Model);
  if (Index >= 0) Chunk.Models.splice(Index, 1);
}

function ModelVolume(Model) {
  const Bounds = BoundsOf(Model);
  if (Bounds.isEmpty()) return 0;
  Bounds.getSize(TempSize);
  return TempSize.x * TempSize.y * TempSize.z;
}

function ResolveFurniture(Chunk) {
  ClaimedEntries.clear?.();
  const Models = (Chunk.Models || []).filter(Model => Model?.parent && FurnitureNames.has(Model.name) && !BoundsOf(Model).isEmpty());
  Models.sort((A, B) => ModelVolume(B) - ModelVolume(A));
  const Accepted = [];

  for (const Model of [...Models]) {
    const Bounds = BoundsOf(Model);
    if (Bounds.isEmpty()) continue;
    const Entry = NearestEntry(Chunk, Model, Bounds);
    const Safe = FindSafePosition(Chunk, Model, Bounds, Accepted);

    if (!Safe) {
      RemoveModel(Chunk, Model, Entry);
      continue;
    }

    if (Math.abs(Safe.DX) > 0.0001 || Math.abs(Safe.DZ) > 0.0001) {
      Model.position.x += Safe.DX;
      Model.position.z += Safe.DZ;
      Model.updateWorldMatrix(true, true);
      TranslateEntry(Entry, Safe.DX, Safe.DZ);
      Model.userData.GeneratorRelocatedR77 = { X: Safe.DX, Z: Safe.DZ };
    }

    TightenEntryToModel(Entry, Model);
    Accepted.push(BoundsOf(Model));
  }
}

function IsReservationObject(Object) {
  const Name = String(Object?.name || "");
  if (FurnitureNames.has(Name)) return true;
  if (Name === "StoreTask") return true;
  if (Name === "DepartmentHeaderR73") return true;
  if (Name.startsWith("FurnitureItemSignR74-")) return true;
  if (Name.startsWith("OnlineChunkDecorationR76-")) return true;
  return false;
}

function RebuildReservations(Chunk) {
  const Reservations = [];
  for (const Model of Chunk.Models || []) {
    if (!Model?.parent || !FurnitureNames.has(Model.name)) continue;
    const Bounds = BoundsOf(Model);
    if (!Bounds.isEmpty()) Reservations.push(Bounds.clone());
  }

  Chunk.Group?.traverse?.(Object => {
    if (!Object?.parent || !IsReservationObject(Object)) return;
    if (FurnitureNames.has(Object.name)) return;
    const Bounds = BoundsOf(Object);
    if (!Bounds.isEmpty()) Reservations.push(Bounds.clone());
  });

  Chunk.ReservedBounds.length = 0;
  Chunk.ReservedBounds.push(...Reservations);
}

function ChunkSignature(Chunk) {
  let Signature = `${Chunk.Models?.length || 0}`;
  for (const Model of Chunk.Models || []) {
    if (!Model?.parent || !FurnitureNames.has(Model.name)) continue;
    Signature += `|${Model.name}:${Model.position.x.toFixed(2)}:${Model.position.z.toFixed(2)}:${Model.rotation.y.toFixed(2)}`;
  }
  return Signature;
}

function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group?.userData?.WorldPolishR72) return;
  const Signature = ChunkSignature(Chunk);
  if (State.get(Chunk) === Signature) return;
  ResolveFurniture(Chunk);
  RebuildReservations(Chunk);
  State.set(Chunk, ChunkSignature(Chunk));
  Chunk.Group.userData.GeneratorIntegrityR77 = true;
}

function ProcessAll() {
  const Seen = new Set();
  for (const Chunk of Game.ActiveChunks.values()) {
    Seen.add(Chunk);
    ProcessChunk(Chunk);
  }
  for (const Chunk of Game.PreparedChunks.values()) {
    if (!Seen.has(Chunk)) ProcessChunk(Chunk);
  }
}

ProcessAll();
const Interval = setInterval(ProcessAll, 280);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_GENERATOR_INTEGRITY_R77__ = { ProcessAll, ProcessChunk };
window.__STORE_GENERATOR_INTEGRITY_BUILD__ = "V0.18.0-R77";