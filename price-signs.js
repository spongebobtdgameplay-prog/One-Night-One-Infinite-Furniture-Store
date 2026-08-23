import * as THREE from "three";

const Game = window.__STORE_GAME__;

if (!Game?.Scene || !Game?.Camera) throw new Error("Game must load before price signs.");

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

const Discounts = [15, 20, 25, 30, 35, 40, 50];
const ActiveSigns = new Map();
const TempCenter = new THREE.Vector3();

function Hash(Text) {
  let Value = 2166136261;
  for (let Index = 0; Index < Text.length; Index += 1) {
    Value ^= Text.charCodeAt(Index);
    Value = Math.imul(Value, 16777619);
  }
  return Value >>> 0;
}

function Money(Value) {
  return `$${Value.toFixed(2)}`;
}

function SalePrice(BasePrice, Discount) {
  const Raw = BasePrice * (1 - Discount / 100);
  return Math.max(9.99, Math.floor(Raw / 10) * 10 - 0.01);
}

function CreatePriceTexture(Name, BasePrice, Discount) {
  const Canvas = document.createElement("canvas");
  Canvas.width = 640;
  Canvas.height = 400;
  const Context = Canvas.getContext("2d");
  const Sale = SalePrice(BasePrice, Discount);

  Context.fillStyle = "#f4e8cb";
  Context.fillRect(0, 0, Canvas.width, Canvas.height);
  Context.strokeStyle = "#34281d";
  Context.lineWidth = 18;
  Context.strokeRect(9, 9, Canvas.width - 18, Canvas.height - 18);

  Context.fillStyle = "#b72f25";
  Context.fillRect(0, 0, Canvas.width, 92);
  Context.fillStyle = "#fff7e8";
  Context.font = "900 58px Arial";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.fillText(`${Discount}% OFF`, Canvas.width / 2, 46);

  Context.fillStyle = "#1f1a16";
  Context.font = "800 34px Arial";
  const FriendlyName = Name.replaceAll("_", " ").replace(/\d+/g, "").trim().toUpperCase();
  Context.fillText(FriendlyName, Canvas.width / 2, 132);

  Context.font = "900 86px Arial";
  Context.fillText(Money(Sale), Canvas.width / 2, 220);

  Context.fillStyle = "#66584a";
  Context.font = "700 31px Arial";
  Context.fillText(`WAS ${Money(BasePrice)}`, Canvas.width / 2, 286);

  Context.fillStyle = "#2d5a39";
  Context.fillRect(70, 322, Canvas.width - 140, 48);
  Context.fillStyle = "#eff8ec";
  Context.font = "800 24px Arial";
  Context.fillText("IN-STORE SPECIAL • WHILE STOCK LASTS", Canvas.width / 2, 346);

  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  Texture.anisotropy = 4;
  return Texture;
}

function CreatePriceSign(Model) {
  const BasePrice = FurniturePrices[Model.name];
  if (!BasePrice) return null;

  const Seed = Hash(`${Model.name}:${Model.userData?.ChunkId || "store"}:${Model.position.x.toFixed(2)}:${Model.position.z.toFixed(2)}`);
  const Discount = Discounts[Seed % Discounts.length];
  const Texture = CreatePriceTexture(Model.name, BasePrice, Discount);

  const Group = new THREE.Group();
  Group.name = "FurniturePriceSign";
  Group.userData.ChunkId = Model.userData?.ChunkId;
  Group.userData.SourceModel = Model;

  const FrameMaterial = new THREE.MeshStandardMaterial({ color: 0x29231e, roughness: 0.82, metalness: 0.12 });
  const BoardMaterial = new THREE.MeshStandardMaterial({ color: 0xd8bd8b, roughness: 0.9, metalness: 0 });
  const FaceMaterial = new THREE.MeshStandardMaterial({
    map: Texture,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    emissive: 0x21170d,
    emissiveIntensity: 0.055,
    side: THREE.FrontSide
  });

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.65, 0.09), FrameMaterial);
  Group.add(Frame);

  const Board = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.57, 0.105), BoardMaterial);
  Group.add(Board);

  const Front = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.53), FaceMaterial);
  Front.position.z = 0.054;
  Group.add(Front);

  const BackMaterial = FaceMaterial.clone();
  const Back = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.53), BackMaterial);
  Back.position.z = -0.054;
  Back.rotation.y = Math.PI;
  Group.add(Back);

  const Pole = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.46, 0.035), FrameMaterial);
  Pole.position.y = -0.54;
  Group.add(Pole);

  const Base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.24), FrameMaterial);
  Base.position.y = -0.77;
  Group.add(Base);

  const Bounds = new THREE.Box3().setFromObject(Model);
  Bounds.getCenter(TempCenter);
  const Side = TempCenter.x < 0 ? 1 : -1;
  const X = Side > 0 ? Bounds.max.x + 0.48 : Bounds.min.x - 0.48;
  const Y = THREE.MathUtils.clamp(Bounds.min.y + 1.02, 0.92, 1.42);
  Group.position.set(X, Y, TempCenter.z);

  Game.Scene.add(Group);
  return Group;
}

function UpdateSigns() {
  for (const Object of Game.Scene.children) {
    if (!Object?.isObject3D || !FurniturePrices[Object.name]) continue;
    if (!Object.userData?.ChunkId || ActiveSigns.has(Object)) continue;
    const Sign = CreatePriceSign(Object);
    if (Sign) ActiveSigns.set(Object, Sign);
  }

  for (const [Model, Sign] of ActiveSigns) {
    if (!Model.parent) {
      Sign.parent?.remove(Sign);
      ActiveSigns.delete(Model);
      continue;
    }
    Sign.lookAt(Game.Camera.position.x, Sign.position.y, Game.Camera.position.z);
  }

  requestAnimationFrame(UpdateSigns);
}

requestAnimationFrame(UpdateSigns);
window.__STORE_PRICE_SIGN_BUILD__ = "V0.11-R3";
