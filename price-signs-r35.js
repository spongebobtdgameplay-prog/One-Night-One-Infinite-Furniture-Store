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
const MaterialCache = new Map();
const TempBounds = new THREE.Box3();
const TempCenter = new THREE.Vector3();
const TempLook = new THREE.Vector3();
const SignGeometry = new THREE.PlaneGeometry(0.72, 0.44);
const MAX_VISIBLE_DISTANCE_SQ = 58 * 58;

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
  let Material = MaterialCache.get(Name);
  if (Material) return Material;

  const Canvas = document.createElement("canvas");
  Canvas.width = 384;
  Canvas.height = 232;
  const Context = Canvas.getContext("2d", { alpha: false });
  Context.fillStyle = "#efe0bf";
  Context.fillRect(0, 0, Canvas.width, Canvas.height);
  Context.fillStyle = "#9d2c22";
  Context.fillRect(0, 0, Canvas.width, 48);
  Context.strokeStyle = "#35271b";
  Context.lineWidth = 10;
  Context.strokeRect(5, 5, Canvas.width - 10, Canvas.height - 10);
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.fillStyle = "#fff6e7";
  Context.font = "900 25px Arial";
  Context.fillText("STORE PRICE", Canvas.width / 2, 25);
  Context.fillStyle = "#211a14";
  FitText(Context, DisplayNames[Name] || Name.replaceAll("_", " "), 342, 30, 18, 850);
  Context.fillText(DisplayNames[Name] || Name.replaceAll("_", " "), Canvas.width / 2, 86);
  FitText(Context, `$${DisplayPrices[Name].toFixed(2)}`, 344, 62, 42, 900);
  Context.fillText(`$${DisplayPrices[Name].toFixed(2)}`, Canvas.width / 2, 144);
  Context.fillStyle = "#5d5042";
  Context.font = "750 17px Arial";
  Context.fillText(Name === "WarehouseBoxes" ? "PER BOX" : "DISPLAY ITEM", Canvas.width / 2, 198);

  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  Texture.anisotropy = 1;
  Material = new THREE.MeshBasicMaterial({ map: Texture, side: THREE.DoubleSide, toneMapped: false });
  MaterialCache.set(Name, Material);
  return Material;
}

function FindPlacement(Model) {
  TempBounds.setFromObject(Model);
  if (TempBounds.isEmpty()) return null;
  TempBounds.getCenter(TempCenter);
  const TowardAisle = TempCenter.x < 0 ? 1 : -1;
  const X = THREE.MathUtils.clamp(
    TempCenter.x + TowardAisle * (Math.max(0.38, (TempBounds.max.x - TempBounds.min.x) * 0.5) + 0.32),
    -16.15,
    16.15
  );
  return new THREE.Vector3(X, 0.82, TempCenter.z);
}

function CreateSign(Model) {
  const Position = FindPlacement(Model);
  if (!Position) return null;
  const Sign = new THREE.Mesh(SignGeometry, MaterialFor(Model.name));
  Sign.name = "FurniturePriceSign";
  Sign.position.copy(Position);
  Sign.userData.ChunkId = Model.userData?.ChunkId;
  Sign.userData.SourceModel = Model;
  Sign.frustumCulled = true;

  if (Math.abs(Sign.position.x) > 2) {
    TempLook.set(0, Sign.position.y, Sign.position.z);
    Sign.lookAt(TempLook);
  } else {
    const Direction = Model.position.z >= Sign.position.z ? 1 : -1;
    TempLook.set(Sign.position.x, Sign.position.y, Sign.position.z + Direction * 4);
    Sign.lookAt(TempLook);
  }

  Game.Scene.add(Sign);
  return Sign;
}

function CollectDisplays() {
  const Desired = new Set();
  for (const Object of Game.Scene.children) {
    if (!Object?.isObject3D || !DisplayPrices[Object.name] || !Object.userData?.ChunkId) continue;
    Desired.add(Object);
  }
  for (const Chunk of Game.ActiveChunks?.values?.() || []) {
    const Boxes = Chunk.Group?.getObjectByName?.("WarehouseBoxes");
    if (Boxes) Desired.add(Boxes);
  }
  return Desired;
}

function UpdateSigns() {
  const Desired = CollectDisplays();

  for (const [Model, Sign] of ActiveSigns) {
    if (!Model.parent || !Desired.has(Model)) {
      Sign.parent?.remove(Sign);
      ActiveSigns.delete(Model);
      continue;
    }
    Sign.visible = Sign.position.distanceToSquared(Game.Camera.position) <= MAX_VISIBLE_DISTANCE_SQ;
  }

  for (const Model of Desired) {
    if (ActiveSigns.has(Model)) continue;
    const Sign = CreateSign(Model);
    if (!Sign) continue;
    Sign.visible = Sign.position.distanceToSquared(Game.Camera.position) <= MAX_VISIBLE_DISTANCE_SQ;
    ActiveSigns.set(Model, Sign);
  }
}

const Timer = setInterval(UpdateSigns, 250);
setTimeout(UpdateSigns, 0);
addEventListener("pagehide", () => clearInterval(Timer), { once: true });
window.__STORE_PRICE_SIGN_BUILD__ = "V0.11-R35";
