import * as THREE from "three";

const DisplayVariantCount = 6;

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
  return (HashText(`${Model?.name || "ITEM"}:${Index}`) + Index) % DisplayVariantCount;
}

export function ShouldUseCarpet(ChunkIndex, Model, Index) {
  const Value = HashText(`${ChunkIndex}:${Model?.name || "ITEM"}:${Index}`);
  return Value % 3 === 0;
}

function CandidatePositions(Bounds, Chunk) {
  const Center = Bounds.getCenter(new THREE.Vector3());
  const Gap = 0.61;
  const TowardAisleX = Center.x < 0 ? Bounds.max.x + Gap : Bounds.min.x - Gap;
  const SideZGap = 0.57;
  const Candidates = [
    [TowardAisleX, Center.z],
    [TowardAisleX, Center.z + 0.38],
    [TowardAisleX, Center.z - 0.38],
    [TowardAisleX, Center.z + 0.74],
    [TowardAisleX, Center.z - 0.74],
    [Center.x, Bounds.min.z - SideZGap],
    [Center.x, Bounds.max.z + SideZGap]
  ];

  return Candidates.map(([X, Z]) => [
    THREE.MathUtils.clamp(X, -15.75, 15.75),
    THREE.MathUtils.clamp(Z, Chunk.BottomZ + 0.72, Chunk.TopZ - 0.72)
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

function SafeShapePlacement(Game, Chunk, RequestedX, RequestedZ) {
  if (!Game?.Placement?.ShapeCastPlacement) return { X: RequestedX, Z: RequestedZ };
  const Placement = Game.Placement.ShapeCastPlacement(Chunk, "FurniturePriceSignR72", RequestedX, RequestedZ, 0, false);
  if (!Placement) return null;
  if (Math.hypot(Placement.X - RequestedX, Placement.Z - RequestedZ) > 0.52) return null;
  return { X: Placement.X, Z: Placement.Z };
}

export function FindSpacedSignPlacement(Game, Chunk, Model, Occupied, Options = {}) {
  const MinimumSpacing = Options.MinimumSpacing ?? 0.92;
  const Bounds = ModelBounds(Model);
  if (Bounds.isEmpty()) return null;
  const Candidates = CandidatePositions(Bounds, Chunk);

  for (const [RequestedX, RequestedZ] of Candidates) {
    const Placement = SafeShapePlacement(Game, Chunk, RequestedX, RequestedZ);
    if (!Placement) continue;
    if (!FarEnough(Placement.X, Placement.Z, Occupied, MinimumSpacing)) continue;
    return Placement;
  }

  // Every sellable display still gets a nearby tag. If the aisle is crowded,
  // prefer a close safe position over sending the tag metres down the aisle.
  for (const [RequestedX, RequestedZ] of Candidates) {
    const Placement = SafeShapePlacement(Game, Chunk, RequestedX, RequestedZ);
    if (Placement) return Placement;
  }

  const Center = Bounds.getCenter(new THREE.Vector3());
  const X = Center.x < 0 ? Bounds.max.x + 0.61 : Bounds.min.x - 0.61;
  return {
    X: THREE.MathUtils.clamp(X, -15.75, 15.75),
    Z: THREE.MathUtils.clamp(Center.z, Chunk.BottomZ + 0.72, Chunk.TopZ - 0.72)
  };
}

export function RecordSignPosition(Occupied, Position) {
  Occupied.push(new THREE.Vector3(Position.X, 0, Position.Z));
}

export function FaceTowardAisle(Object, X, Z) {
  const TargetX = Math.abs(X) > 1.0 ? 0 : X;
  const TargetZ = Math.abs(X) > 1.0 ? Z : Z + 1;
  Object.lookAt(new THREE.Vector3(TargetX, Object.position.y, TargetZ));
}

window.__STORE_DISPLAY_LAYOUT_UTILITY_BUILD__ = "V0.20.1-R80";