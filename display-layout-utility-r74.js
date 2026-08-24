import * as THREE from "three";

const CarpetPalettes = [
  [0xa9634c, 0xd5a07c],
  [0x74866d, 0xb8c2a2],
  [0x6f8192, 0xaebfd0],
  [0x9d825a, 0xd2b989],
  [0x8b6f84, 0xc0a6bb]
];

function HashText(Text) {
  let Hash = 2166136261 >>> 0;
  const Value = String(Text || "");
  for (let Index = 0; Index < Value.length; Index += 1) {
    Hash ^= Value.charCodeAt(Index);
    Hash = Math.imul(Hash, 16777619);
  }
  return Hash >>> 0;
}

export function ModelBounds(Model) {
  Model.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Model);
}

export function FriendlyItemName(Name) {
  return String(Name || "ITEM").replaceAll("_", " ").replace(/\d+/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

export function DisplayVariant(Model, Index = 0) {
  return (HashText(`${Model?.name || "ITEM"}:${Index}`) + Index) % CarpetPalettes.length;
}

export function ShouldUseCarpet(ChunkIndex, Model, Index) {
  const Value = HashText(`${ChunkIndex}:${Model?.name || "ITEM"}:${Index}`);
  return Value % 3 === 0;
}

export function CreateDisplayCarpet(Model, Variant = 0) {
  const Bounds = ModelBounds(Model);
  if (Bounds.isEmpty()) return null;
  const Size = Bounds.getSize(new THREE.Vector3());
  const Center = Bounds.getCenter(new THREE.Vector3());
  const Width = THREE.MathUtils.clamp(Size.x + 0.80, 1.45, 4.75);
  const Depth = THREE.MathUtils.clamp(Size.z + 0.80, 1.45, 4.75);
  const Palette = CarpetPalettes[Math.abs(Variant) % CarpetPalettes.length];
  const MainMaterial = new THREE.MeshStandardMaterial({ color: Palette[0], roughness: 0.98, metalness: 0 });
  const EdgeMaterial = new THREE.MeshStandardMaterial({ color: Palette[1], roughness: 0.96, metalness: 0 });

  const Group = new THREE.Group();
  Group.name = "FurnitureDisplayCarpetR74";
  const Main = new THREE.Mesh(new THREE.BoxGeometry(Width, 0.026, Depth), MainMaterial);
  Main.position.set(Center.x, 0.013, Center.z);
  const EdgeTop = new THREE.Mesh(new THREE.BoxGeometry(Width, 0.010, 0.055), EdgeMaterial);
  EdgeTop.position.set(Center.x, 0.031, Center.z - Depth * 0.5 + 0.035);
  const EdgeBottom = EdgeTop.clone();
  EdgeBottom.position.z = Center.z + Depth * 0.5 - 0.035;
  const EdgeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.010, Math.max(0.2, Depth - 0.11)), EdgeMaterial);
  EdgeLeft.position.set(Center.x - Width * 0.5 + 0.035, 0.031, Center.z);
  const EdgeRight = EdgeLeft.clone();
  EdgeRight.position.x = Center.x + Width * 0.5 - 0.035;
  Group.add(Main, EdgeTop, EdgeBottom, EdgeLeft, EdgeRight);
  Group.userData.DisplayCarpetR74 = true;
  return Group;
}

function CandidatePositions(Bounds, Chunk) {
  const Center = Bounds.getCenter(new THREE.Vector3());
  const TowardAisleX = Center.x < 0 ? Bounds.max.x + 0.82 : Bounds.min.x - 0.82;
  const AwayAisleX = Center.x < 0 ? Bounds.min.x - 0.82 : Bounds.max.x + 0.82;
  const Candidates = [
    [TowardAisleX, Center.z],
    [TowardAisleX, Center.z + 0.95],
    [TowardAisleX, Center.z - 0.95],
    [Center.x, Bounds.min.z - 0.78],
    [Center.x, Bounds.max.z + 0.78],
    [TowardAisleX, Center.z + 1.75],
    [TowardAisleX, Center.z - 1.75],
    [AwayAisleX, Center.z]
  ];

  for (let Offset = 2.4; Offset <= 6.0; Offset += 1.2) {
    Candidates.push([TowardAisleX, Center.z + Offset], [TowardAisleX, Center.z - Offset]);
  }

  return Candidates.map(([X, Z]) => [
    THREE.MathUtils.clamp(X, -15.6, 15.6),
    THREE.MathUtils.clamp(Z, Chunk.BottomZ + 0.9, Chunk.TopZ - 0.9)
  ]);
}

function FarEnough(X, Z, Occupied, MinimumSpacing) {
  for (const Position of Occupied) {
    const DX = Position.x - X;
    const DZ = Position.z - Z;
    if (DX * DX + DZ * DZ < MinimumSpacing * MinimumSpacing) return false;
  }
  return true;
}

export function FindSpacedSignPlacement(Game, Chunk, Model, Occupied, Options = {}) {
  const MinimumSpacing = Options.MinimumSpacing ?? 1.45;
  const Bounds = ModelBounds(Model);
  if (Bounds.isEmpty()) return null;
  const Candidates = CandidatePositions(Bounds, Chunk);

  for (const [RequestedX, RequestedZ] of Candidates) {
    let X = RequestedX;
    let Z = RequestedZ;
    if (Game?.Placement?.ShapeCastPlacement) {
      const Placement = Game.Placement.ShapeCastPlacement(Chunk, "FurniturePriceSignR72", RequestedX, RequestedZ, 0, true);
      if (!Placement) continue;
      if (Math.hypot(Placement.X - RequestedX, Placement.Z - RequestedZ) > 1.30) continue;
      X = Placement.X;
      Z = Placement.Z;
    }
    if (!FarEnough(X, Z, Occupied, MinimumSpacing)) continue;
    return { X, Z };
  }

  const Center = Bounds.getCenter(new THREE.Vector3());
  const AisleX = Center.x < 0 ? Math.min(-1.4, Bounds.max.x + 0.72) : Math.max(1.4, Bounds.min.x - 0.72);
  for (let Step = 0; Step < 12; Step += 1) {
    const Direction = Step % 2 === 0 ? 1 : -1;
    const Ring = Math.floor(Step / 2) + 1;
    const Z = THREE.MathUtils.clamp(Center.z + Direction * Ring * 1.55, Chunk.BottomZ + 0.9, Chunk.TopZ - 0.9);
    if (FarEnough(AisleX, Z, Occupied, MinimumSpacing)) return { X: AisleX, Z };
  }

  return { X: AisleX, Z: THREE.MathUtils.clamp(Center.z, Chunk.BottomZ + 0.9, Chunk.TopZ - 0.9) };
}

export function RecordSignPosition(Occupied, Position) {
  Occupied.push(new THREE.Vector3(Position.X, 0, Position.Z));
}

export function FaceTowardAisle(Object, X, Z) {
  const TargetX = Math.abs(X) > 1.0 ? 0 : X;
  const TargetZ = Math.abs(X) > 1.0 ? Z : Z + 1;
  Object.lookAt(new THREE.Vector3(TargetX, Object.position.y, TargetZ));
}

window.__STORE_DISPLAY_LAYOUT_UTILITY_BUILD__ = "V0.16.0-R74";