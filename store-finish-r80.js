import * as THREE from "three";
const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.CollisionBoxes) {
  throw new Error("The Infinity Store game must load before store finishing.");
}

const PartitionWork = new WeakSet();
const RearWork = new WeakSet();

function BoundsOf(Object) {
  Object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Object);
}

function RemoveLegacyDisplayFrames(Chunk) {
  const Remove = [];
  Chunk.Group?.traverse?.(Object => {
    const Name = String(Object?.name || "");
    if (
      Object?.userData?.WallDecorationR76 ||
      Name.startsWith("OnlineWallDecorationR76-PartitionR80-") ||
      Name.startsWith("OnlineWallDecorationR76-RearR80-")
    ) Remove.push(Object);
  });
  for (const Object of Remove) Object.parent?.remove(Object);
}

function BrightPartitionMaterial(Material, Color) {
  if (!Material?.clone) return Material;
  const Copy = Material.clone();
  Copy.color?.setHex(Color, THREE.SRGBColorSpace);
  if ("roughness" in Copy) Copy.roughness = Math.max(0.72, Copy.roughness ?? 0.82);
  if ("metalness" in Copy) Copy.metalness = Math.min(0.18, Copy.metalness ?? 0.05);
  Copy.needsUpdate = true;
  return Copy;
}

async function FinishPartitions(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || PartitionWork.has(Chunk) || Chunk.Group.userData?.PresentationReadyR83) return;
  PartitionWork.add(Chunk);
  try {
    RemoveLegacyDisplayFrames(Chunk);
    const Partitions = [];
    Chunk.Group?.traverse?.(Object => {
      if (Object?.name === "ShowroomPartition" && Object.isMesh) Partitions.push(Object);
      else if ((Object?.name === "PartitionCap" || Object?.name === "PartitionBase") && Object.isMesh && !Object.userData?.FinishColorR83) {
        Object.material = BrightPartitionMaterial(Object.material, 0x8f877a);
        Object.userData.FinishColorR83 = true;
      }
    });

    for (let Index = 0; Index < Partitions.length; Index += 1) {
      const Partition = Partitions[Index];
      if (!Partition.userData?.FinishColorR83) {
        Partition.material = BrightPartitionMaterial(Partition.material, 0xc4beb2);
        Partition.userData.FinishColorR83 = true;
      }
      Partition.userData.MerchandisingWallR80 = true;

    }
  } finally {
    PartitionWork.delete(Chunk);
  }
}

function AddRearCollision(Chunk, Bounds) {
  let Entry = Chunk.CollisionEntries.find(Value => Value?.Type === "RearStoreWallR80");
  if (!Entry) {
    Entry = { ChunkId: Chunk.Id, Type: "RearStoreWallR80" };
    Chunk.CollisionEntries.push(Entry);
  }
  Entry.Box = Bounds.clone();
  Entry.OriginalBox = Bounds.clone();
  Entry.OriginalLegacyBox = Bounds.clone();
  Entry.Active = Boolean(Chunk.Active);
  Entry.LegacyCollisionDisabled = false;
  Entry.PreciseGeometry = false;
  if (Chunk.Active && !Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
  if (!Chunk.StructureBounds.some(Box => Box?.userData?.RearStoreWallR80)) {
    const Structure = Bounds.clone();
    Structure.userData = { RearStoreWallR80: true };
    Chunk.StructureBounds.push(Structure);
  }
}

async function EnsureRearClosure() {
  const Chunk = Game.ActiveChunks.get(0) || [...Game.PreparedChunks.values()].find(Value => Value?.Index === 0);
  if (!Chunk?.Ready || !Chunk.Group || RearWork.has(Chunk) || Chunk.Group.userData?.PresentationReadyR83) return;
  RearWork.add(Chunk);
  try {
    RemoveLegacyDisplayFrames(Chunk);
    let Group = Chunk.Group.getObjectByName("RearStoreClosureR80");
    const RearZ = Chunk.TopZ + 0.08;
    if (!Group) {
      const WallSource = Chunk.Group.getObjectByName("WallLeft");
      const BaseSource = Chunk.Group.getObjectByName("BaseboardLeft");
      const WallMaterial = BrightPartitionMaterial(WallSource?.material, 0xc2bcb1) || new THREE.MeshStandardMaterial({ color: 0xc2bcb1, roughness: 0.94 });
      const BaseMaterial = BrightPartitionMaterial(BaseSource?.material, 0x8e8577) || new THREE.MeshStandardMaterial({ color: 0x8e8577, roughness: 0.78, metalness: 0.12 });
      Group = new THREE.Group();
      Group.name = "RearStoreClosureR80";
      Group.userData.ChunkId = Chunk.Id;
      const Wall = new THREE.Mesh(new THREE.BoxGeometry(34, 3.80, 0.22), WallMaterial);
      Wall.name = "RearStoreWallR80";
      Wall.position.set(0, 1.86, RearZ);
      const Base = new THREE.Mesh(new THREE.BoxGeometry(33.7, 0.18, 0.26), BaseMaterial);
      Base.name = "RearStoreBaseboardR80";
      Base.position.set(0, 0.09, RearZ - 0.02);
      Group.add(Wall, Base);
      Chunk.Group.add(Group);
      Wall.updateWorldMatrix(true, true);
      AddRearCollision(Chunk, BoundsOf(Wall));
    }

  } finally {
    RearWork.delete(Chunk);
  }
}

function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || Chunk.Group.userData?.PresentationReadyR83) return;
  RemoveLegacyDisplayFrames(Chunk);
  FinishPartitions(Chunk).catch(Error => console.warn("Partition finish failed", Error));
}

function ProcessAll() {
  for (const Chunk of Game.ActiveChunks.values()) ProcessChunk(Chunk);
  for (const Chunk of Game.PreparedChunks.values()) ProcessChunk(Chunk);
  EnsureRearClosure().catch(Error => console.warn("Rear closure failed", Error));
}

ProcessAll();
const Interval = setInterval(ProcessAll, 1400);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_FINISH_R80__ = { ProcessAll, ProcessChunk, EnsureRearClosure };
window.__STORE_FINISH_BUILD__ = "V0.26.0-R88";