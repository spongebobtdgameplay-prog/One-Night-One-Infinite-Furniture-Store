import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.CollisionBoxes || !Game?.ActiveChunks || !Game?.PreparedChunks) {
  throw new Error("Store world must load before layout cleanup.");
}

const DepartmentTextures = new Map();
const SignCollisionEntries = new Map();
const TempCenter = new THREE.Vector3();
const TempSize = new THREE.Vector3();
const ClaimedToiletEntries = new Set();

function MakeDepartmentTexture(Theme) {
  const Key = String(Theme || "SHOWROOM").trim().toUpperCase() || "SHOWROOM";
  if (DepartmentTextures.has(Key)) return DepartmentTextures.get(Key);

  const Canvas = document.createElement("canvas");
  Canvas.width = 1536;
  Canvas.height = 320;
  const Context = Canvas.getContext("2d");

  Context.fillStyle = "#e5d7b9";
  Context.fillRect(0, 0, Canvas.width, Canvas.height);
  Context.fillStyle = "#303432";
  Context.fillRect(0, 0, Canvas.width, 46);
  Context.fillRect(0, Canvas.height - 24, Canvas.width, 24);
  Context.strokeStyle = "#6f624c";
  Context.lineWidth = 10;
  Context.strokeRect(10, 10, Canvas.width - 20, Canvas.height - 20);

  Context.fillStyle = "#171a19";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.font = "900 154px Arial";
  Context.fillText(Key, Canvas.width * 0.5, 181);

  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  Texture.anisotropy = 4;
  DepartmentTextures.set(Key, Texture);
  return Texture;
}

function ReplaceGeometry(Mesh, Geometry) {
  if (!Mesh?.isMesh) return;
  Mesh.geometry?.dispose?.();
  Mesh.geometry = Geometry;
}

function ApplyHeaderTexture(Mesh, Texture) {
  if (!Mesh?.isMesh) return;
  const Source = Array.isArray(Mesh.material) ? Mesh.material[0] : Mesh.material;
  const Material = Source?.clone?.() || new THREE.MeshStandardMaterial();
  Material.map = Texture;
  Material.color = new THREE.Color(0xffffff);
  Material.roughness = 0.9;
  Material.metalness = 0;
  Material.emissive = new THREE.Color(0x21190f);
  Material.emissiveIntensity = 0.035;
  Material.side = THREE.FrontSide;
  Material.needsUpdate = true;
  Mesh.material = Material;
}

function UpgradeDepartmentHeader(Chunk) {
  const Header = Chunk?.Group?.getObjectByName?.("DepartmentHeaderV13");
  if (!Header) return;

  const Frame = Header.getObjectByName("DepartmentHeaderFrame");
  const Board = Header.getObjectByName("DepartmentHeaderBoard");
  const Front = Header.getObjectByName("DepartmentHeaderFront");
  const Back = Header.getObjectByName("DepartmentHeaderBack");
  if (!Frame || !Board || !Front || !Back) return;

  if (!Header.userData.LayoutCleanupR71) {
    ReplaceGeometry(Frame, new THREE.BoxGeometry(8.45, 1.34, 0.2));
    ReplaceGeometry(Board, new THREE.BoxGeometry(8.18, 1.1, 0.24));
    ReplaceGeometry(Front, new THREE.PlaneGeometry(7.96, 0.94));
    ReplaceGeometry(Back, new THREE.PlaneGeometry(7.96, 0.94));

    Front.position.z = 0.122;
    Back.position.z = -0.122;
    Back.rotation.y = Math.PI;

    const Remove = Header.children.filter(Object => !Object.name && Object.isMesh);
    for (const Object of Remove) Header.remove(Object);

    const HangerMaterial = Frame.material;
    const LeftHanger = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.23, 0.055), HangerMaterial);
    LeftHanger.name = "DepartmentHeaderHangerLeftR71";
    LeftHanger.position.set(-2.62, 0.785, 0);
    const RightHanger = LeftHanger.clone();
    RightHanger.name = "DepartmentHeaderHangerRightR71";
    RightHanger.position.x = 2.62;
    Header.add(LeftHanger, RightHanger);

    Header.position.set(0, 2.82, Chunk.TopZ - 3.0);
    Header.userData.LayoutCleanupR71 = true;
  }

  const Texture = MakeDepartmentTexture(Chunk.Theme);
  if (Front.material?.map !== Texture) ApplyHeaderTexture(Front, Texture);
  if (Back.material?.map !== Texture) ApplyHeaderTexture(Back, Texture);
}

function RemoveObject(Object) {
  if (!Object?.parent) return;
  Object.parent.remove(Object);
}

function RemoveLegacyAndBlankSigns(Chunk) {
  const Remove = [];
  Chunk?.Group?.traverse?.(Object => {
    const Name = String(Object?.name || "");
    if (Name === "SectionSign" || Name === "SignMount" || Name === "BlankSign" || Name === "EmptySign") Remove.push(Object);
  });
  for (const Object of Remove) RemoveObject(Object);
}

function RemoveSignCollision(Sign) {
  const Entry = SignCollisionEntries.get(Sign);
  if (!Entry) return;
  const GlobalIndex = Game.CollisionBoxes.indexOf(Entry);
  if (GlobalIndex >= 0) Game.CollisionBoxes.splice(GlobalIndex, 1);
  for (const Chunk of Game.ActiveChunks.values()) {
    const LocalIndex = Chunk.CollisionEntries?.indexOf?.(Entry) ?? -1;
    if (LocalIndex >= 0) Chunk.CollisionEntries.splice(LocalIndex, 1);
  }
  for (const Chunk of Game.PreparedChunks.values()) {
    const LocalIndex = Chunk.CollisionEntries?.indexOf?.(Entry) ?? -1;
    if (LocalIndex >= 0) Chunk.CollisionEntries.splice(LocalIndex, 1);
  }
  Entry.Active = false;
  SignCollisionEntries.delete(Sign);
}

function RemovePriceSign(Sign) {
  RemoveSignCollision(Sign);
  RemoveObject(Sign);
}

function PriceSignIsValid(Sign) {
  const SourceModel = Sign?.userData?.SourceModel;
  if (!SourceModel?.parent) return false;
  let HasTextFace = false;
  Sign.traverse(Object => {
    if (!Object?.isMesh) return;
    const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
    if (Materials.some(Material => Material?.map?.isTexture)) HasTextFace = true;
  });
  return HasTextFace;
}

function FindChunkById(ChunkId) {
  for (const Chunk of Game.ActiveChunks.values()) if (Chunk?.Id === ChunkId) return Chunk;
  for (const Chunk of Game.PreparedChunks.values()) if (Chunk?.Id === ChunkId) return Chunk;
  return null;
}

function StructuredPriceSignPosition(Sign, Chunk) {
  const SourceModel = Sign.userData.SourceModel;
  SourceModel.updateWorldMatrix(true, true);
  const Bounds = new THREE.Box3().setFromObject(SourceModel);
  if (Bounds.isEmpty()) return;

  Bounds.getCenter(TempCenter);
  Bounds.getSize(TempSize);

  const Gap = 0.76;
  let X = TempCenter.x;
  let Z = TempCenter.z;

  if (TempCenter.x > 1.4) X = Bounds.min.x - Gap;
  else if (TempCenter.x < -1.4) X = Bounds.max.x + Gap;
  else {
    const ChunkCenterZ = (Chunk.TopZ + Chunk.BottomZ) * 0.5;
    const Direction = TempCenter.z >= ChunkCenterZ ? -1 : 1;
    Z = Direction > 0 ? Bounds.max.z + Gap : Bounds.min.z - Gap;
  }

  X = THREE.MathUtils.clamp(X, -15.3, 15.3);
  Z = THREE.MathUtils.clamp(Z, Chunk.BottomZ + 1.25, Chunk.TopZ - 1.25);

  Sign.position.set(X, 1.08, Z);
  Sign.scale.setScalar(1.12);

  if (Math.abs(X) > 1.4) {
    Sign.lookAt(new THREE.Vector3(0, Sign.position.y, Z));
  } else {
    const Direction = TempCenter.z >= (Chunk.TopZ + Chunk.BottomZ) * 0.5 ? 1 : -1;
    Sign.lookAt(new THREE.Vector3(X, Sign.position.y, Z + Direction * 5));
  }

  Sign.userData.StructuredR71 = true;
  Sign.updateWorldMatrix(true, true);
}

function EnsurePriceSignCollision(Sign, Chunk) {
  if (!Sign?.parent || !Chunk?.CollisionEntries) return;
  Sign.updateWorldMatrix(true, true);
  const Bounds = new THREE.Box3().setFromObject(Sign);
  if (Bounds.isEmpty()) return;

  const Center = Bounds.getCenter(new THREE.Vector3());
  const Size = Bounds.getSize(new THREE.Vector3());
  const HalfX = Math.max(0.28, Size.x * 0.43);
  const HalfZ = Math.max(0.11, Size.z * 0.43);
  const CollisionBox = new THREE.Box3(
    new THREE.Vector3(Center.x - HalfX, 0, Center.z - HalfZ),
    new THREE.Vector3(Center.x + HalfX, 1.25, Center.z + HalfZ)
  );

  let Entry = SignCollisionEntries.get(Sign);
  if (!Entry) {
    Entry = {
      Box: CollisionBox,
      OriginalBox: CollisionBox.clone(),
      ChunkId: Chunk.Id,
      Type: "FurniturePriceSign",
      Active: true,
      LayoutCleanupR71: true
    };
    SignCollisionEntries.set(Sign, Entry);
    Chunk.CollisionEntries.push(Entry);
    if (!Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
  } else {
    Entry.Box.copy(CollisionBox);
    Entry.OriginalBox.copy(CollisionBox);
    Entry.Active = true;
    if (!Chunk.CollisionEntries.includes(Entry)) Chunk.CollisionEntries.push(Entry);
    if (!Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
  }
}

function StructurePriceSigns() {
  const ByChunk = new Map();
  const AllSigns = [];

  Game.Scene.traverse(Object => {
    if (Object?.name === "FurniturePriceSign") AllSigns.push(Object);
  });

  for (const Sign of AllSigns) {
    if (!PriceSignIsValid(Sign)) {
      RemovePriceSign(Sign);
      continue;
    }
    const ChunkId = Sign.userData?.ChunkId;
    const Chunk = FindChunkById(ChunkId);
    if (!Chunk) {
      RemovePriceSign(Sign);
      continue;
    }
    if (!ByChunk.has(ChunkId)) ByChunk.set(ChunkId, []);
    ByChunk.get(ChunkId).push(Sign);
  }

  for (const [ChunkId, Signs] of ByChunk) {
    Signs.sort((A, B) => {
      const AModel = A.userData.SourceModel;
      const BModel = B.userData.SourceModel;
      const AKey = `${AModel?.name || ""}:${AModel?.position?.x || 0}:${AModel?.position?.z || 0}`;
      const BKey = `${BModel?.name || ""}:${BModel?.position?.x || 0}:${BModel?.position?.z || 0}`;
      return AKey.localeCompare(BKey);
    });

    const Keep = Signs[0];
    for (let Index = 1; Index < Signs.length; Index += 1) RemovePriceSign(Signs[Index]);

    const Chunk = FindChunkById(ChunkId);
    if (!Keep?.parent || !Chunk) continue;
    StructuredPriceSignPosition(Keep, Chunk);
    EnsurePriceSignCollision(Keep, Chunk);
  }

  for (const [Sign, Entry] of SignCollisionEntries) {
    if (Sign?.parent) continue;
    const GlobalIndex = Game.CollisionBoxes.indexOf(Entry);
    if (GlobalIndex >= 0) Game.CollisionBoxes.splice(GlobalIndex, 1);
    Entry.Active = false;
    SignCollisionEntries.delete(Sign);
  }
}

function ToiletBounds(Model) {
  Model.updateWorldMatrix(true, true);
  const Bounds = new THREE.Box3().setFromObject(Model);
  if (Bounds.isEmpty()) return null;

  const Center = Bounds.getCenter(new THREE.Vector3());
  const Size = Bounds.getSize(new THREE.Vector3());
  const HalfX = Math.max(0.24, Size.x * 0.46);
  const HalfZ = Math.max(0.29, Size.z * 0.46);
  return new THREE.Box3(
    new THREE.Vector3(Center.x - HalfX, 0, Center.z - HalfZ),
    new THREE.Vector3(Center.x + HalfX, Math.max(1.0, Bounds.max.y), Center.z + HalfZ)
  );
}

function NearestToiletEntry(Chunk, Bounds) {
  const Center = Bounds.getCenter(new THREE.Vector3());
  let Best = null;
  let BestDistance = Infinity;

  for (const Entry of Chunk.CollisionEntries || []) {
    if (Entry?.Type !== "Bathroom_Toilet" || ClaimedToiletEntries.has(Entry)) continue;
    const Box = Entry.OriginalLegacyBox || Entry.OriginalBox || Entry.Box;
    if (!Box?.min || !Box?.max) continue;
    const DX = (Box.min.x + Box.max.x) * 0.5 - Center.x;
    const DZ = (Box.min.z + Box.max.z) * 0.5 - Center.z;
    const Distance = DX * DX + DZ * DZ;
    if (Distance < BestDistance) {
      BestDistance = Distance;
      Best = Entry;
    }
  }

  if (Best) ClaimedToiletEntries.add(Best);
  return Best;
}

function RestoreToiletCollision(Chunk, Model) {
  const Bounds = ToiletBounds(Model);
  if (!Bounds) return;

  let Entry = NearestToiletEntry(Chunk, Bounds);
  if (!Entry) {
    Entry = {
      Box: Bounds.clone(),
      OriginalBox: Bounds.clone(),
      OriginalLegacyBox: Bounds.clone(),
      ChunkId: Chunk.Id,
      Type: "Bathroom_Toilet",
      Active: Boolean(Chunk.Active),
      ToiletCollisionR71: true
    };
    Chunk.CollisionEntries.push(Entry);
  }

  Entry.Box = Bounds.clone();
  Entry.OriginalBox = Bounds.clone();
  Entry.OriginalLegacyBox = Bounds.clone();
  Entry.PreciseGeometry = false;
  Entry.PreciseTriangles = null;
  Entry.GeometryBounds = null;
  Entry.LegacyCollisionDisabled = false;
  Entry.RedundantPreciseSibling = false;
  Entry.TestPlayerCollision = null;
  Entry.TestCollision = null;
  Entry.ToiletCollisionR71 = true;

  if (Chunk.Active) {
    Entry.Active = true;
    if (!Game.CollisionBoxes.includes(Entry)) Game.CollisionBoxes.push(Entry);
  }
}

function RestoreToiletCollisions(Chunk) {
  ClaimedToiletEntries.clear();
  for (const Model of Chunk.Models || []) {
    if (Model?.name !== "Bathroom_Toilet" || !Model.parent) continue;
    RestoreToiletCollision(Chunk, Model);
  }
}

function ProcessChunk(Chunk) {
  if (!Chunk?.Group || Chunk.Cancelled) return;
  RemoveLegacyAndBlankSigns(Chunk);
  UpgradeDepartmentHeader(Chunk);
  RestoreToiletCollisions(Chunk);
}

function ProcessAll() {
  const Seen = new Set();
  for (const Chunk of Game.ActiveChunks.values()) {
    Seen.add(Chunk);
    ProcessChunk(Chunk);
  }
  for (const Chunk of Game.PreparedChunks.values()) {
    if (Seen.has(Chunk)) continue;
    ProcessChunk(Chunk);
  }
  StructurePriceSigns();
}

ProcessAll();
const Interval = setInterval(ProcessAll, 90);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_LAYOUT_CLEANUP_R71__ = { ProcessAll };
window.__STORE_LAYOUT_CLEANUP_BUILD__ = "V0.13.1-R71";
