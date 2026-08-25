import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before retail organization.");

const Processing = new WeakSet();

function BoundsOf(Object) {
  Object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Object);
}

function FindDirect(Chunk, Prefix) {
  return (Chunk.Group?.children || []).filter(Object => String(Object?.name || "").startsWith(Prefix));
}

function RemoveMatchingReservation(Chunk, OldBox) {
  if (!OldBox?.min || !OldBox?.max) return;
  const OldCenter = OldBox.getCenter(new THREE.Vector3());
  const OldSize = OldBox.getSize(new THREE.Vector3());
  for (let Index = Chunk.ReservedBounds.length - 1; Index >= 0; Index -= 1) {
    const Box = Chunk.ReservedBounds[Index];
    if (!Box?.min || !Box?.max) continue;
    const Center = Box.getCenter(new THREE.Vector3());
    const Size = Box.getSize(new THREE.Vector3());
    if (Center.distanceToSquared(OldCenter) > 0.035 * 0.035) continue;
    if (Math.abs(Size.x - OldSize.x) > 0.10 || Math.abs(Size.z - OldSize.z) > 0.10) continue;
    Chunk.ReservedBounds.splice(Index, 1);
  }
}

function RefreshCollision(Chunk, Object) {
  const Type = `${Object.name}SolidR82`;
  const Entry = (Chunk.CollisionEntries || []).find(Value => Value?.Type === Type);
  if (!Entry) return;
  const Old = Entry.Box?.clone?.();
  if (Old) RemoveMatchingReservation(Chunk, Old);
  const Bounds = BoundsOf(Object);
  if (Bounds.isEmpty()) return;
  const Size = Bounds.getSize(new THREE.Vector3());
  const Center = Bounds.getCenter(new THREE.Vector3());
  const Box = new THREE.Box3(
    new THREE.Vector3(Center.x - Math.max(0.10, Size.x * 0.47), Math.max(0, Bounds.min.y), Center.z - Math.max(0.10, Size.z * 0.47)),
    new THREE.Vector3(Center.x + Math.max(0.10, Size.x * 0.47), Bounds.max.y, Center.z + Math.max(0.10, Size.z * 0.47))
  );
  Entry.Box = Box;
  Entry.OriginalBox = Box.clone();
  Entry.OriginalLegacyBox = Box.clone();
  Chunk.ReservedBounds.push(Box.clone());
}

function Move(Object, X, Z, RotationY) {
  Object.position.x = X;
  Object.position.z = Z;
  Object.rotation.y = RotationY;
  Object.updateWorldMatrix(true, true);
}

function OrganizeCarts(Chunk) {
  const Carts = FindDirect(Chunk, "ShoppingCartR82-");
  if (!Carts.length) return;
  Carts.sort((A, B) => String(A.name).localeCompare(String(B.name)));
  const Side = Carts.reduce((Sum, Object) => Sum + Object.position.x, 0) < 0 ? -1 : 1;
  const Facing = Side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  const X = Side * 14.35;
  const CenterZ = Chunk.CenterZ;
  const StartZ = CenterZ - (Math.min(Carts.length, 7) - 1) * 0.48;

  for (let Index = 0; Index < Math.min(Carts.length, 7); Index += 1) {
    Move(Carts[Index], X, StartZ + Index * 0.96, Facing);
    RefreshCollision(Chunk, Carts[Index]);
  }
}

function OrganizeBagsAndBaskets(Chunk) {
  const Shelves = FindDirect(Chunk, "BagShelfR82-");
  const Baskets = FindDirect(Chunk, "ShoppingBasketR82-");
  if (!Shelves.length && !Baskets.length) return;
  const Source = Shelves[0] || Baskets[0];
  const Side = Source.position.x < 0 ? -1 : 1;
  const Facing = Side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
  const Z = Chunk.CenterZ;

  Shelves.sort((A, B) => String(A.name).localeCompare(String(B.name)));
  const ShelfSlots = [[Side * 14.55, Z - 1.05], [Side * 14.55, Z + 1.05]];
  for (let Index = 0; Index < Math.min(Shelves.length, ShelfSlots.length); Index += 1) {
    Move(Shelves[Index], ShelfSlots[Index][0], ShelfSlots[Index][1], Facing);
    RefreshCollision(Chunk, Shelves[Index]);
  }

  Baskets.sort((A, B) => String(A.name).localeCompare(String(B.name)));
  const BasketSlots = [
    [Side * 13.38, Z - 1.32], [Side * 13.38, Z - 0.44],
    [Side * 13.38, Z + 0.44], [Side * 13.38, Z + 1.32]
  ];
  for (let Index = 0; Index < Math.min(Baskets.length, BasketSlots.length); Index += 1) {
    Move(Baskets[Index], BasketSlots[Index][0], BasketSlots[Index][1], Facing);
    RefreshCollision(Chunk, Baskets[Index]);
  }
}

function CenterRetailZoneHeaders(Chunk) {
  const CartHeader = Chunk.Group?.getObjectByName?.("RetailZoneHeaderR82-CART-RETURN");
  const BagHeader = Chunk.Group?.getObjectByName?.("RetailZoneHeaderR82-BAGS-+-BASKETS");
  for (const Header of [CartHeader, BagHeader]) {
    if (!Header) continue;
    const Side = Header.position.x < 0 ? -1 : 1;
    Header.position.x = Side * 16.08;
    Header.position.y = 2.30;
    Header.position.z = Chunk.CenterZ;
    Header.scale.setScalar(0.88);
    Header.updateWorldMatrix(true, true);
  }
}

export async function ProcessChunk(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group || Processing.has(Chunk)) return;
  if (Chunk.Group.userData?.RetailOrganizationR83) return;
  if (!Chunk.Group.userData?.RetailZonesR82) return;
  Processing.add(Chunk);
  try {
    OrganizeCarts(Chunk);
    OrganizeBagsAndBaskets(Chunk);
    CenterRetailZoneHeaders(Chunk);
    Chunk.Group.userData.RetailOrganizationR83 = true;
  } finally {
    Processing.delete(Chunk);
  }
}

function Discover() {
  for (const Chunk of Game.PreparedChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) ProcessChunk(Chunk).catch(() => {});
  for (const Chunk of Game.ActiveChunks.values()) if (!Chunk?.Group?.userData?.PresentationReadyR83) ProcessChunk(Chunk).catch(() => {});
}

Discover();
const Interval = setInterval(Discover, 1100);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_RETAIL_ORGANIZATION_R83__ = { ProcessChunk, Discover };
window.__STORE_RETAIL_ORGANIZATION_BUILD__ = "V0.23.1-R85";