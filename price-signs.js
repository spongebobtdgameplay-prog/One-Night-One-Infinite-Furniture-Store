import * as THREE from "three";

const Game = window.__STORE_GAME__;

if (!Game?.Scene || !Game?.CollisionBoxes) throw new Error("Game must load before price signs.");

const FurniturePrices = {
  Couch_Large1: 699.99,
  Couch_L: 849.99,
  Chair_2: 179.99,
  Table_RoundLarge: 329.99,
  Bed_King: 1099.99,
  Bed_Single: 599.99,
  NightStand_2: 139.99,
  Shelf_Large: 449.99,
  Bookshelf: 399.99,
  Kitchen_Cabinet1: 289.99,
  Kitchen_Fridge: 1299.99,
  Kitchen_Oven: 899.99,
  Kitchen_Sink: 499.99,
  Bathroom_Bathtub: 799.99,
  Bathroom_Toilet: 279.99,
  Light_Floor1: 129.99,
  Door_3: 249.99,
  Window_Large1: 319.99
};

const Discounts = [10, 15, 20, 25, 30, 35, 40, 50];
const ActiveSigns = new Map();
const TempCenter = new THREE.Vector3();
const TempSize = new THREE.Vector3();
const TempLook = new THREE.Vector3();
const TempBounds = new THREE.Box3();
const SIGN_CLEARANCE = 0.76;
const SIGN_SPACING = 1.70;
const SIGN_FOOTPRINT_RADIUS = 0.70;
const MAX_SIGNS_PER_CHUNK = 2;

function Hash(Text) {
  let Value = 2166136261;
  for (let Index = 0; Index < Text.length; Index += 1) {
    Value ^= Text.charCodeAt(Index);
    Value = Math.imul(Value, 16777619);
  }
  return Value >>> 0;
}

function RandomFromSeed(Seed) {
  let Value = Seed >>> 0;
  return () => {
    Value += 0x6D2B79F5;
    let Result = Value;
    Result = Math.imul(Result ^ Result >>> 15, Result | 1);
    Result ^= Result + Math.imul(Result ^ Result >>> 7, Result | 61);
    return ((Result ^ Result >>> 14) >>> 0) / 4294967296;
  };
}

function ModelKey(Model) {
  return `${Model.userData?.ChunkId || "store"}:${Model.name}:${Model.position.x.toFixed(3)}:${Model.position.z.toFixed(3)}`;
}

function Money(Value) {
  return `$${Value.toFixed(2)}`;
}

function RoundRetailPrice(Value) {
  const Rounded = Math.max(10, Math.round(Value / 10) * 10);
  return Rounded - 0.01;
}

function PriceForModel(Model, Random) {
  const Base = FurniturePrices[Model.name];
  return RoundRetailPrice(Base * (0.88 + Random() * 0.24));
}

function SalePrice(BasePrice, Discount) {
  return RoundRetailPrice(BasePrice * (1 - Discount / 100));
}

function FitText(Context, Text, MaxWidth, StartSize, MinSize, Weight = 800) {
  let Size = StartSize;
  while (Size > MinSize) {
    Context.font = `${Weight} ${Size}px Arial`;
    if (Context.measureText(Text).width <= MaxWidth) break;
    Size -= 2;
  }
  Context.font = `${Weight} ${Size}px Arial`;
}

function FriendlyName(Name) {
  return Name.replaceAll("_", " ").replace(/\d+/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function CreatePriceTexture(Name, BasePrice, Discount, Variant) {
  const Canvas = document.createElement("canvas");
  Canvas.width = 768;
  Canvas.height = 480;
  const Context = Canvas.getContext("2d");
  const Sale = SalePrice(BasePrice, Discount);
  const Banner = Variant === 0 ? `${Discount}% OFF` : Variant === 1 ? "STORE SPECIAL" : Variant === 2 ? "LIMITED DEAL" : "CLEARANCE";

  Context.fillStyle = "#f4e8cb";
  Context.fillRect(0, 0, Canvas.width, Canvas.height);
  Context.strokeStyle = "#34281d";
  Context.lineWidth = 18;
  Context.strokeRect(9, 9, Canvas.width - 18, Canvas.height - 18);

  Context.fillStyle = Variant === 3 ? "#8f251f" : "#b72f25";
  Context.fillRect(0, 0, Canvas.width, 104);
  Context.fillStyle = "#fff7e8";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  FitText(Context, Banner, 690, 62, 40, 900);
  Context.fillText(Banner, Canvas.width / 2, 52);

  Context.fillStyle = "#1f1a16";
  const ProductName = FriendlyName(Name);
  FitText(Context, ProductName, 650, 45, 28, 850);
  Context.fillText(ProductName, Canvas.width / 2, 145);

  FitText(Context, Money(Sale), 650, 102, 72, 900);
  Context.fillText(Money(Sale), Canvas.width / 2, 244);

  Context.fillStyle = "#66584a";
  const Detail = `WAS ${Money(BasePrice)}   •   SAVE ${Discount}%`;
  FitText(Context, Detail, 650, 34, 24, 750);
  Context.fillText(Detail, Canvas.width / 2, 326);

  Context.fillStyle = "#2d5a39";
  Context.fillRect(70, 374, Canvas.width - 140, 62);
  Context.fillStyle = "#eff8ec";
  FitText(Context, "IN-STORE OFFER • WHILE STOCK LASTS", 590, 27, 20, 800);
  Context.fillText("IN-STORE OFFER • WHILE STOCK LASTS", Canvas.width / 2, 405);

  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  Texture.anisotropy = 4;
  return Texture;
}

function IsBlockedByStructure(X, Z, Radius = SIGN_CLEARANCE) {
  for (const Entry of Game.CollisionBoxes) {
    if (!Entry?.Type || !/Wall|Partition/i.test(Entry.Type)) continue;
    const Bounds = Entry.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    if (
      X + Radius > Bounds.min.x && X - Radius < Bounds.max.x &&
      Z + Radius > Bounds.min.z && Z - Radius < Bounds.max.z
    ) return true;
  }
  return false;
}

function IsBlockedByDisplay(X, Z, SourceModel) {
  let Blocked = false;
  Game.Scene.traverse(Object => {
    if (Blocked || !Object?.isObject3D || Object === SourceModel || !Object.visible) return;
    const Name = Object.name || "";
    const IsDisplay = Boolean(FurniturePrices[Name]) || Name === "StoreTask" || Name === "WarehouseBoxes";
    if (!IsDisplay) return;
    TempBounds.setFromObject(Object);
    if (TempBounds.isEmpty()) return;
    if (
      X + SIGN_FOOTPRINT_RADIUS > TempBounds.min.x && X - SIGN_FOOTPRINT_RADIUS < TempBounds.max.x &&
      Z + SIGN_FOOTPRINT_RADIUS > TempBounds.min.z && Z - SIGN_FOOTPRINT_RADIUS < TempBounds.max.z
    ) Blocked = true;
  });
  return Blocked;
}

function IsTooCloseToAnotherSign(X, Z, IgnoreModel = null) {
  const MinimumSquared = SIGN_SPACING * SIGN_SPACING;
  for (const [Model, Sign] of ActiveSigns) {
    if (Model === IgnoreModel || !Sign?.parent) continue;
    const DX = Sign.position.x - X;
    const DZ = Sign.position.z - Z;
    if (DX * DX + DZ * DZ < MinimumSquared) return true;
  }
  return false;
}

function CandidatePositions(Model, Random) {
  const Bounds = new THREE.Box3().setFromObject(Model);
  Bounds.getCenter(TempCenter);
  Bounds.getSize(TempSize);
  const Gap = 0.82 + Random() * 0.34;
  const JitterX = (Random() - 0.5) * Math.min(0.62, Math.max(0.14, TempSize.x * 0.20));
  const JitterZ = (Random() - 0.5) * Math.min(0.62, Math.max(0.14, TempSize.z * 0.20));
  const Candidates = [
    new THREE.Vector3(Bounds.max.x + Gap, 0, TempCenter.z + JitterZ),
    new THREE.Vector3(Bounds.min.x - Gap, 0, TempCenter.z - JitterZ),
    new THREE.Vector3(TempCenter.x + JitterX, 0, Bounds.max.z + Gap),
    new THREE.Vector3(TempCenter.x - JitterX, 0, Bounds.min.z - Gap)
  ];

  for (let Index = Candidates.length - 1; Index > 0; Index -= 1) {
    const Other = Math.floor(Random() * (Index + 1));
    [Candidates[Index], Candidates[Other]] = [Candidates[Other], Candidates[Index]];
  }

  const Y = THREE.MathUtils.clamp(Bounds.min.y + 1.04 + (Random() - 0.5) * 0.08, 0.94, 1.34);
  for (const Candidate of Candidates) Candidate.y = Y;
  return Candidates;
}

function FindSignPlacement(Model, Random) {
  for (const Candidate of CandidatePositions(Model, Random)) {
    if (Math.abs(Candidate.x) > 15.72) continue;
    if (IsBlockedByStructure(Candidate.x, Candidate.z)) continue;
    if (IsBlockedByDisplay(Candidate.x, Candidate.z, Model)) continue;
    if (IsTooCloseToAnotherSign(Candidate.x, Candidate.z, Model)) continue;
    return Candidate;
  }
  return null;
}

function OrientPhysicalSign(Group, Model, Random) {
  if (Math.abs(Group.position.x) > 2.0) {
    TempLook.set(0, Group.position.y, Group.position.z);
    Group.lookAt(TempLook);
  } else {
    const Direction = Model.position.z >= Group.position.z ? 1 : -1;
    TempLook.set(Group.position.x, Group.position.y, Group.position.z + Direction * 5);
    Group.lookAt(TempLook);
  }
  Group.rotation.y += (Random() - 0.5) * 0.045;
}

function CreatePriceSign(Model) {
  const Seed = Hash(ModelKey(Model));
  const Random = RandomFromSeed(Seed);
  const Placement = FindSignPlacement(Model, Random);
  if (!Placement) return null;

  const BasePrice = PriceForModel(Model, Random);
  const Discount = Discounts[Math.floor(Random() * Discounts.length) % Discounts.length];
  const Variant = Math.floor(Random() * 4);
  const Texture = CreatePriceTexture(Model.name, BasePrice, Discount, Variant);

  const Group = new THREE.Group();
  Group.name = "FurniturePriceSign";
  Group.userData.ChunkId = Model.userData?.ChunkId;
  Group.userData.SourceModel = Model;
  Group.userData.Seed = Seed;

  const FrameMaterial = new THREE.MeshStandardMaterial({ color: 0x29231e, roughness: 0.80, metalness: 0.18 });
  const BoardMaterial = new THREE.MeshStandardMaterial({ color: 0xd8bd8b, roughness: 0.90, metalness: 0 });
  const FaceMaterial = new THREE.MeshStandardMaterial({ map: Texture, color: 0xffffff, roughness: 0.86, metalness: 0, emissive: 0x21170d, emissiveIntensity: 0.04 });

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.82, 0.15), FrameMaterial);
  Frame.name = "PriceSignFrame";
  Group.add(Frame);

  const Board = new THREE.Mesh(new THREE.BoxGeometry(1.17, 0.71, 0.18), BoardMaterial);
  Board.name = "PriceSignBoard";
  Group.add(Board);

  const Front = new THREE.Mesh(new THREE.PlaneGeometry(1.11, 0.65), FaceMaterial);
  Front.name = "PriceSignFront";
  Front.position.z = 0.092;
  Group.add(Front);

  const Back = new THREE.Mesh(new THREE.PlaneGeometry(1.11, 0.65), FaceMaterial.clone());
  Back.name = "PriceSignBack";
  Back.position.z = -0.092;
  Back.rotation.y = Math.PI;
  Group.add(Back);

  for (const X of [-0.31, 0.31]) {
    const Pole = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.50, 0.055), FrameMaterial);
    Pole.position.set(X, -0.64, 0);
    Group.add(Pole);
    const Foot = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.05, 0.31), FrameMaterial);
    Foot.position.set(X, -0.91, 0.02);
    Group.add(Foot);
  }

  const Brace = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.045, 0.055), FrameMaterial);
  Brace.position.set(0, -0.53, -0.04);
  Group.add(Brace);

  Group.position.copy(Placement);
  OrientPhysicalSign(Group, Model, Random);
  Game.Scene.add(Group);
  return Group;
}

function DesiredModels() {
  const ByChunk = new Map();
  for (const Object of Game.Scene.children) {
    if (!Object?.isObject3D || !FurniturePrices[Object.name] || !Object.userData?.ChunkId) continue;
    const ChunkId = Object.userData.ChunkId;
    if (!ByChunk.has(ChunkId)) ByChunk.set(ChunkId, []);
    ByChunk.get(ChunkId).push(Object);
  }

  const Desired = new Set();
  for (const [ChunkId, Models] of ByChunk) {
    Models.sort((Left, Right) => ModelKey(Left).localeCompare(ModelKey(Right)));
    const ChunkRandom = RandomFromSeed(Hash(`sign-density:${ChunkId}`));
    const Quota = Math.min(Models.length, MAX_SIGNS_PER_CHUNK, ChunkRandom() < 0.82 ? 1 : 2);
    const Ranked = Models.map(Model => ({ Model, Score: Hash(`sign-choice:${ModelKey(Model)}`) / 4294967295 }));
    Ranked.sort((Left, Right) => Left.Score - Right.Score);
    for (let Index = 0; Index < Quota; Index += 1) Desired.add(Ranked[Index].Model);
  }
  return Desired;
}

let FrameCounter = 0;
function UpdateSigns() {
  FrameCounter += 1;
  if (FrameCounter % 20 === 1) {
    const Desired = DesiredModels();
    for (const [Model, Sign] of ActiveSigns) {
      if (!Model.parent || !Desired.has(Model)) {
        Sign.parent?.remove(Sign);
        ActiveSigns.delete(Model);
      }
    }
    for (const Model of Desired) {
      if (ActiveSigns.has(Model)) continue;
      const Sign = CreatePriceSign(Model);
      if (Sign) ActiveSigns.set(Model, Sign);
    }
  }
  requestAnimationFrame(UpdateSigns);
}

requestAnimationFrame(UpdateSigns);
window.__STORE_PRICE_SIGN_BUILD__ = "V0.11-R8";
