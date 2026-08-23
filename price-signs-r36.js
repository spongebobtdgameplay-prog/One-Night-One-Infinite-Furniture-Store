import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.Camera) throw new Error("Game must load before R36 price signs.");

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

const HalfWidths = {
  Couch_Large1: 1.13,
  Couch_L: 1.23,
  Chair_2: 0.39,
  Table_RoundLarge: 0.69,
  Bed_King: 0.95,
  Bed_Single: 0.51,
  NightStand_2: 0.26,
  Shelf_Large: 0.88,
  Bookshelf: 0.73,
  Kitchen_Cabinet1: 0.53,
  Kitchen_Fridge: 0.42,
  Kitchen_Oven: 0.41,
  Kitchen_Sink: 0.55,
  Bathroom_Bathtub: 0.91,
  Bathroom_Toilet: 0.31,
  Light_Floor1: 0.28,
  Door_3: 0.52,
  Window_Large1: 0.70
};

const SignGeometry = new THREE.PlaneGeometry(0.68, 0.42);
const Materials = new Map();
const ActiveSigns = new Map();
const NearDistanceSq = 34 * 34;
const TempLook = new THREE.Vector3();
const TempBounds = new THREE.Box3();
const TempCenter = new THREE.Vector3();

function FitText(Context, Text, MaxWidth, StartSize, MinSize, Weight = 800) {
  let Size = StartSize;
  while (Size > MinSize) {
    Context.font = `${Weight} ${Size}px Arial`;
    if (Context.measureText(Text).width <= MaxWidth) break;
    Size -= 2;
  }
  Context.font = `${Weight} ${Size}px Arial`;
}

function MaterialFor(Name) {
  let Material = Materials.get(Name);
  if (Material) return Material;

  const Canvas = document.createElement("canvas");
  Canvas.width = 320;
  Canvas.height = 192;
  const Context = Canvas.getContext("2d", { alpha: false });
  Context.fillStyle = "#eee0c2";
  Context.fillRect(0, 0, Canvas.width, Canvas.height);
  Context.fillStyle = "#9b2e24";
  Context.fillRect(0, 0, Canvas.width, 40);
  Context.strokeStyle = "#33271d";
  Context.lineWidth = 8;
  Context.strokeRect(4, 4, Canvas.width - 8, Canvas.height - 8);
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.fillStyle = "#fff7e8";
  Context.font = "900 21px Arial";
  Context.fillText("STORE PRICE", Canvas.width / 2, 21);
  Context.fillStyle = "#211a14";
  FitText(Context, DisplayNames[Name] || Name, 286, 25, 16, 850);
  Context.fillText(DisplayNames[Name] || Name, Canvas.width / 2, 70);
  FitText(Context, `$${DisplayPrices[Name].toFixed(2)}`, 286, 50, 34, 900);
  Context.fillText(`$${DisplayPrices[Name].toFixed(2)}`, Canvas.width / 2, 118);
  Context.fillStyle = "#5e5042";
  Context.font = "750 14px Arial";
  Context.fillText(Name === "WarehouseBoxes" ? "PER BOX" : "DISPLAY ITEM", Canvas.width / 2, 160);

  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  Texture.anisotropy = 1;
  Material = new THREE.MeshBasicMaterial({ map: Texture, side: THREE.DoubleSide, toneMapped: false });
  Materials.set(Name, Material);
  return Material;
}

function DisplayPosition(Object) {
  if (Object.name !== "WarehouseBoxes") return Object.position;
  TempBounds.setFromObject(Object);
  if (TempBounds.isEmpty()) return Object.position;
  return TempBounds.getCenter(TempCenter);
}

function CreateSign(Model) {
  const Center = DisplayPosition(Model);
  const TowardAisle = Center.x < 0 ? 1 : -1;
  const HalfWidth = HalfWidths[Model.name] ?? 0.55;
  const Sign = new THREE.Mesh(SignGeometry, MaterialFor(Model.name));
  Sign.name = "FurniturePriceSign";
  Sign.userData.ChunkId = Model.userData?.ChunkId;
  Sign.userData.SourceModel = Model;
  Sign.position.set(
    THREE.MathUtils.clamp(Center.x + TowardAisle * (HalfWidth + 0.34), -16.1, 16.1),
    0.82,
    Center.z
  );

  TempLook.set(0, Sign.position.y, Sign.position.z);
  Sign.lookAt(TempLook);
  Game.Scene.add(Sign);
  return Sign;
}

function CollectNearbyDisplays() {
  const Desired = new Set();
  for (const Object of Game.Scene.children) {
    if (!Object?.isObject3D || !DisplayPrices[Object.name] || !Object.userData?.ChunkId || !Object.visible) continue;
    const DX = Object.position.x - Game.Camera.position.x;
    const DZ = Object.position.z - Game.Camera.position.z;
    if (DX * DX + DZ * DZ <= NearDistanceSq) Desired.add(Object);
  }

  for (const Chunk of Game.ActiveChunks?.values?.() || []) {
    if (!Chunk?.Group?.visible) continue;
    const Boxes = Chunk.Group.getObjectByName?.("WarehouseBoxes");
    if (!Boxes?.visible) continue;
    const CenterZ = Number.isFinite(Chunk.CenterZ) ? Chunk.CenterZ : Boxes.position.z;
    const DZ = CenterZ - Game.Camera.position.z;
    if (DZ * DZ <= NearDistanceSq) Desired.add(Boxes);
  }
  return Desired;
}

function Update() {
  const Desired = CollectNearbyDisplays();

  for (const [Model, Sign] of ActiveSigns) {
    if (!Model.parent || !Desired.has(Model)) {
      Sign.parent?.remove(Sign);
      ActiveSigns.delete(Model);
    }
  }

  for (const Model of Desired) {
    if (ActiveSigns.has(Model)) continue;
    const Sign = CreateSign(Model);
    ActiveSigns.set(Model, Sign);
  }
}

const Timer = setInterval(Update, 350);
setTimeout(Update, 0);
addEventListener("pagehide", () => clearInterval(Timer), { once: true });

window.__STORE_PRICE_SIGN_BUILD__ = "V0.11-R36";
