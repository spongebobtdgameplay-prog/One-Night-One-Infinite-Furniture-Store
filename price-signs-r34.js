import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.CollisionBoxes) throw new Error("Game must load before display price signs.");

const DisplayPrices = {
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
  Window_Large1: 319.99,
  WarehouseBoxes: 29.99
};

const DisplayNames = {
  Couch_Large1: "LARGE SOFA",
  Couch_L: "SECTIONAL SOFA",
  Chair_2: "LOUNGE CHAIR",
  Table_RoundLarge: "ROUND TABLE",
  Bed_King: "KING BED",
  Bed_Single: "SINGLE BED",
  NightStand_2: "NIGHT STAND",
  Shelf_Large: "LARGE SHELF",
  Bookshelf: "BOOKSHELF",
  Kitchen_Cabinet1: "KITCHEN CABINET",
  Kitchen_Fridge: "REFRIGERATOR",
  Kitchen_Oven: "OVEN",
  Kitchen_Sink: "KITCHEN SINK",
  Bathroom_Bathtub: "BATHTUB",
  Bathroom_Toilet: "TOILET",
  Light_Floor1: "FLOOR LAMP",
  Door_3: "INTERIOR DOOR",
  Window_Large1: "LARGE WINDOW",
  WarehouseBoxes: "MOVING BOX"
};

const ActiveSigns = new Map();
const TempBounds = new THREE.Box3();
const TempCenter = new THREE.Vector3();
const TempSize = new THREE.Vector3();
const TempLook = new THREE.Vector3();
const Candidate = new THREE.Vector3();
const BOARD_WIDTH = 0.72;
const BOARD_HEIGHT = 0.48;
const STRUCTURE_CLEARANCE = 0.22;
const FrameGeometry = new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, 0.075);
const FaceGeometry = new THREE.PlaneGeometry(0.66, 0.42);
const PoleGeometry = new THREE.BoxGeometry(0.035, 0.42, 0.04);
const FootGeometry = new THREE.BoxGeometry(0.30, 0.04, 0.24);
const FrameMaterial = new THREE.MeshStandardMaterial({ color: 0x29231e, roughness: 0.82, metalness: 0.16 });

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

function RoundRetailPrice(Value) {
  return Math.max(9.99, Math.round(Value / 10) * 10 - 0.01);
}

function PriceForModel(Model) {
  const Base = DisplayPrices[Model.name];
  const Random = RandomFromSeed(Hash(ModelKey(Model)));
  return RoundRetailPrice(Base * (0.92 + Random() * 0.17));
}

function Money(Value) {
  return `$${Value.toFixed(2)}`;
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

function CreatePriceTexture(Model) {
  const Canvas = document.createElement("canvas");
  Canvas.width = 384;
  Canvas.height = 224;
  const Context = Canvas.getContext("2d");
  const Name = DisplayNames[Model.name] || Model.name.replaceAll("_", " ").toUpperCase();
  const Price = PriceForModel(Model);

  Context.fillStyle = "#f2e5c7";
  Context.fillRect(0, 0, Canvas.width, Canvas.height);
  Context.strokeStyle = "#35271b";
  Context.lineWidth = 9;
  Context.strokeRect(5, 5, Canvas.width - 10, Canvas.height - 10);

  Context.fillStyle = "#9d2c22";
  Context.fillRect(0, 0, Canvas.width, 48);
  Context.fillStyle = "#fff6e7";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.font = "900 25px Arial";
  Context.fillText("STORE PRICE", Canvas.width / 2, 24);

  Context.fillStyle = "#211a14";
  FitText(Context, Name, 340, 28, 18, 850);
  Context.fillText(Name, Canvas.width / 2, 82);

  FitText(Context, Money(Price), 342, 58, 40, 900);
  Context.fillText(Money(Price), Canvas.width / 2, 135);

  Context.fillStyle = "#5b4d3f";
  Context.font = "750 17px Arial";
  Context.fillText(Model.name === "WarehouseBoxes" ? "PER BOX • SELF SERVE" : "DISPLAY ITEM • IN STOCK", Canvas.width / 2, 188);

  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  Texture.anisotropy = 2;
  return Texture;
}

function GetBounds(Model) {
  if (Model.isInstancedMesh && !Model.boundingBox) Model.computeBoundingBox?.();
  TempBounds.setFromObject(Model);
  if (TempBounds.isEmpty()) return null;
  TempBounds.getCenter(TempCenter);
  TempBounds.getSize(TempSize);
  return TempBounds;
}

function IsBlockedByStructure(X, Z) {
  for (const Entry of Game.CollisionBoxes) {
    if (!Entry?.Type || !/Wall|Partition/i.test(Entry.Type)) continue;
    const Bounds = Entry.OriginalStructureBox || Entry.OriginalBox || Entry.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    if (
      X + STRUCTURE_CLEARANCE > Bounds.min.x && X - STRUCTURE_CLEARANCE < Bounds.max.x &&
      Z + STRUCTURE_CLEARANCE > Bounds.min.z && Z - STRUCTURE_CLEARANCE < Bounds.max.z
    ) return true;
  }
  return false;
}

function FindPlacement(Model) {
  const Bounds = GetBounds(Model);
  if (!Bounds) return null;
  const Gap = 0.36;
  const CenterX = TempCenter.x;
  const CenterZ = TempCenter.z;
  const PreferCenterSide = CenterX < 0 ? 1 : -1;
  const Candidates = [];

  if (Math.abs(CenterX) > 3) {
    Candidates.push(
      new THREE.Vector3(PreferCenterSide > 0 ? Bounds.max.x + Gap : Bounds.min.x - Gap, 0.70, CenterZ),
      new THREE.Vector3(PreferCenterSide > 0 ? Bounds.min.x - Gap : Bounds.max.x + Gap, 0.70, CenterZ),
      new THREE.Vector3(CenterX, 0.70, Bounds.max.z + Gap),
      new THREE.Vector3(CenterX, 0.70, Bounds.min.z - Gap)
    );
  } else {
    Candidates.push(
      new THREE.Vector3(CenterX, 0.70, Bounds.max.z + Gap),
      new THREE.Vector3(CenterX, 0.70, Bounds.min.z - Gap),
      new THREE.Vector3(Bounds.max.x + Gap, 0.70, CenterZ),
      new THREE.Vector3(Bounds.min.x - Gap, 0.70, CenterZ)
    );
  }

  for (const Position of Candidates) {
    if (Math.abs(Position.x) > 16.35) continue;
    if (IsBlockedByStructure(Position.x, Position.z)) continue;
    return Position;
  }

  Candidate.set(
    THREE.MathUtils.clamp(CenterX + PreferCenterSide * (TempSize.x * 0.5 + 0.18), -16.2, 16.2),
    0.70,
    CenterZ
  );
  return Candidate.clone();
}

function CreatePriceSign(Model) {
  const Placement = FindPlacement(Model);
  if (!Placement) return null;
  const Texture = CreatePriceTexture(Model);
  const FaceMaterial = new THREE.MeshStandardMaterial({
    map: Texture,
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0,
    emissive: 0x1c130b,
    emissiveIntensity: 0.035
  });

  const Group = new THREE.Group();
  Group.name = "FurniturePriceSign";
  Group.userData.ChunkId = Model.userData?.ChunkId;
  Group.userData.SourceModel = Model;
  Group.userData.PriceTexture = Texture;
  Group.userData.PriceMaterial = FaceMaterial;

  const Frame = new THREE.Mesh(FrameGeometry, FrameMaterial);
  Group.add(Frame);

  const Front = new THREE.Mesh(FaceGeometry, FaceMaterial);
  Front.position.z = 0.039;
  Group.add(Front);

  const Back = new THREE.Mesh(FaceGeometry, FaceMaterial);
  Back.position.z = -0.039;
  Back.rotation.y = Math.PI;
  Group.add(Back);

  const Pole = new THREE.Mesh(PoleGeometry, FrameMaterial);
  Pole.position.y = -0.43;
  Group.add(Pole);

  const Foot = new THREE.Mesh(FootGeometry, FrameMaterial);
  Foot.position.set(0, -0.66, 0.02);
  Group.add(Foot);

  Group.position.copy(Placement);
  if (Math.abs(Group.position.x) > 2) {
    TempLook.set(0, Group.position.y, Group.position.z);
    Group.lookAt(TempLook);
  } else {
    const Direction = Model.position.z >= Group.position.z ? 1 : -1;
    TempLook.set(Group.position.x, Group.position.y, Group.position.z + Direction * 4);
    Group.lookAt(TempLook);
  }

  Game.Scene.add(Group);
  return Group;
}

function DestroySign(Sign) {
  Sign?.parent?.remove(Sign);
  Sign?.userData?.PriceTexture?.dispose?.();
  Sign?.userData?.PriceMaterial?.dispose?.();
}

function DesiredModels() {
  const Desired = new Set();
  Game.Scene.traverse(Object => {
    if (!Object?.isObject3D || !DisplayPrices[Object.name] || !Object.userData?.ChunkId) return;
    Desired.add(Object);
  });
  return Desired;
}

let FrameCounter = 0;
function UpdateSigns() {
  FrameCounter += 1;
  if (FrameCounter % 24 === 1) {
    const Desired = DesiredModels();

    for (const [Model, Sign] of ActiveSigns) {
      if (!Model.parent || !Desired.has(Model)) {
        DestroySign(Sign);
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
window.__STORE_PRICE_SIGN_BUILD__ = "V0.11-R34";
