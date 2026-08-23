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
const SIGN_CLEARANCE = 0.68;
const SIGN_SPACING = 1.55;
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
  const Variation = 0.88 + Random() * 0.24;
  return RoundRetailPrice(Base * Variation);
}

function SalePrice(BasePrice, Discount) {
  return RoundRetailPrice(BasePrice * (1 - Discount / 100));
}

function CreatePriceTexture(Name, BasePrice, Discount, Variant) {
  const Canvas = document.createElement("canvas");
  Canvas.width = 640;
  Canvas.height = 400;
  const Context = Canvas.getContext("2d");
  const Sale = SalePrice(BasePrice, Discount);
  const Banner = Variant === 0 ? `${Discount}% OFF` : Variant === 1 ? "STORE SPECIAL" : Variant === 2 ? "LIMITED DEAL" : "CLEARANCE";

  Context.fillStyle = "#f4e8cb";
  Context.fillRect(0, 0, Canvas.width, Canvas.height);
  Context.strokeStyle = "#34281d";
  Context.lineWidth = 18;
  Context.strokeRect(9, 9, Canvas.width - 18, Canvas.height - 18);

  Context.fillStyle = Variant === 3 ? "#8f251f" : "#b72f25";
  Context.fillRect(0, 0, Canvas.width, 92);
  Context.fillStyle = "#fff7e8";
  Context.font = "900 54px Arial";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.fillText(Banner, Canvas.width / 2, 46);

  Context.fillStyle = "#1f1a16";
  Context.font = "800 34px Arial";
  const FriendlyName = Name.replaceAll("_", " ").replace(/\d+/g, "").trim().toUpperCase();
  Context.fillText(FriendlyName, Canvas.width / 2, 132);

  Context.font = "900 86px Arial";
  Context.fillText(Money(Sale), Canvas.width / 2, 220);

  Context.fillStyle = "#66584a";
  Context.font = "700 31px Arial";
  Context.fillText(`WAS ${Money(BasePrice)} • SAVE ${Discount}%`, Canvas.width / 2, 286);

  Context.fillStyle = "#2d5a39";
  Context.fillRect(70, 322, Canvas.width - 140, 48);
  Context.fillStyle = "#eff8ec";
  Context.font = "800 24px Arial";
  Context.fillText("IN-STORE OFFER • WHILE STOCK LASTS", Canvas.width / 2, 346);

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

  const Gap = 0.58 + Random() * 0.34;
  const JitterX = (Random() - 0.5) * Math.min(0.68, Math.max(0.18, TempSize.x * 0.22));
  const JitterZ = (Random() - 0.5) * Math.min(0.68, Math.max(0.18, TempSize.z * 0.22));
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

  const Y = THREE.MathUtils.clamp(Bounds.min.y + 1.00 + (Random() - 0.5) * 0.10, 0.90, 1.34);
  for (const Candidate of Candidates) Candidate.y = Y;
  return Candidates;
}

function FindSignPlacement(Model, Random) {
  const Candidates = CandidatePositions(Model, Random);
  for (const Candidate of Candidates) {
    if (Math.abs(Candidate.x) > 15.85) continue;
    if (IsBlockedByStructure(Candidate.x, Candidate.z)) continue;
    if (IsTooCloseToAnotherSign(Candidate.x, Candidate.z, Model)) continue;
    return Candidate;
  }
  return null;
}

function OrientPhysicalSign(Group, Model, Random) {
  if (Math.abs(Group.position.x) > 2.5) {
    TempLook.set(0, Group.position.y, Group.position.z);
    Group.lookAt(TempLook);
  } else {
    const Direction = Random() < 0.5 ? 1 : -1;
    TempLook.set(Group.position.x, Group.position.y, Group.position.z + Direction * 5);
    Group.lookAt(TempLook);
  }
  Group.rotation.y += (Random() - 0.5) * 0.07;
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
  const FaceMaterial = new THREE.MeshStandardMaterial({
    map: Texture,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    emissive: 0x21170d,
    emissiveIntensity: 0.045,
    side: THREE.FrontSide
  });

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(1.00, 0.69, 0.14), FrameMaterial);
  Frame.name = "PriceSignFrame";
  Group.add(Frame);

  const Board = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.59, 0.17), BoardMaterial);
  Board.name = "PriceSignBoard";
  Group.add(Board);

  const Front = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.55), FaceMaterial);
  Front.name = "PriceSignFront";
  Front.position.z = 0.087;
  Group.add(Front);

  const Back = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.55), FaceMaterial.clone());
  Back.name = "PriceSignBack";
  Back.position.z = -0.087;
  Back.rotation.y = Math.PI;
  Group.add(Back);

  for (const X of [-0.24, 0.24]) {
    const Pole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.47, 0.05), FrameMaterial);
    Pole.name = "PriceSignPole";
    Pole.position.set(X, -0.56, 0);
    Group.add(Pole);

    const Foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.28), FrameMaterial);
    Foot.name = "PriceSignFoot";
    Foot.position.set(X, -0.81, 0.02);
    Group.add(Foot);
  }

  const RearBrace = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.05), FrameMaterial);
  RearBrace.name = "PriceSignBrace";
  RearBrace.position.set(0, -0.47, -0.035);
  Group.add(RearBrace);

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
    const Quota = Math.min(Models.length, MAX_SIGNS_PER_CHUNK, ChunkRandom() < 0.78 ? 1 : 2);
    const Ranked = Models.map(Model => ({ Model, Score: Hash(`sign-choice:${ModelKey(Model)}`) / 4294967295 }));
    Ranked.sort((Left, Right) => Left.Score - Right.Score);
    for (let Index = 0; Index < Quota; Index += 1) Desired.add(Ranked[Index].Model);
  }
  return Desired;
}

let FrameCounter = 0;
function UpdateSigns() {
  FrameCounter += 1;
  if (FrameCounter % 18 === 1) {
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
window.__STORE_PRICE_SIGN_BUILD__ = "V0.11-R7";
