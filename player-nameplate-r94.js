import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
if (!Game?.Scene || !Player) throw new Error("Game and player must load before player nameplates.");

let LocalPlate = null;
let LocalName = "";

function AccountName() {
  const GateName = window.__STORE_ACCOUNT_GATE_RESULT__?.account?.username;
  const NetworkName = window.__STORE_MULTIPLAYER_R88__?.GetState?.()?.account?.username;
  return String(NetworkName || GateName || "").trim().slice(0, 20);
}

function BuildPlate(Name) {
  const Canvas = document.createElement("canvas");
  Canvas.width = 384;
  Canvas.height = 96;
  const Context = Canvas.getContext("2d");
  Context.clearRect(0, 0, Canvas.width, Canvas.height);
  Context.fillStyle = "rgba(7,9,7,.76)";
  Context.fillRect(28, 22, 328, 52);
  Context.strokeStyle = "rgba(213,199,174,.42)";
  Context.lineWidth = 2;
  Context.strokeRect(28, 22, 328, 52);
  Context.fillStyle = "#e7dcc6";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.font = "800 27px Arial";
  Context.fillText(Name.toUpperCase(), 192, 49);
  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  Texture.minFilter = THREE.LinearFilter;
  Texture.magFilter = THREE.LinearFilter;
  const Material = new THREE.SpriteMaterial({ map: Texture, transparent: true, depthWrite: false, depthTest: true });
  const Sprite = new THREE.Sprite(Material);
  Sprite.name = "LocalAccountNameR94";
  Sprite.scale.set(0.92, 0.23, 1);
  Sprite.position.set(0, 2.02, 0);
  Sprite.center.set(0.5, 0.5);
  Sprite.renderOrder = 3;
  return Sprite;
}

function DisposePlate(Plate) {
  if (!Plate) return;
  Plate.parent?.remove(Plate);
  Plate.material?.map?.dispose?.();
  Plate.material?.dispose?.();
}

function RefreshLocal() {
  const Pivot = Game.Scene.getObjectByName("PlayerCharacterPivot");
  const Name = AccountName();
  if (!Pivot || !Name) {
    DisposePlate(LocalPlate);
    LocalPlate = null;
    LocalName = "";
    return;
  }
  if (!LocalPlate || LocalName !== Name) {
    DisposePlate(LocalPlate);
    LocalPlate = BuildPlate(Name);
    LocalName = Name;
    Pivot.add(LocalPlate);
  } else if (LocalPlate.parent !== Pivot) Pivot.add(LocalPlate);
  LocalPlate.visible = Boolean(Player.IsThirdPerson?.());
}

function ShrinkRemoteLabels() {
  Game.Scene.traverse(Object => {
    if (Object.name !== "RemotePlayerNameR88" || !Object.isSprite) return;
    if (Object.userData.NameplateCompactR94) return;
    Object.userData.NameplateCompactR94 = true;
    Object.scale.set(0.98, 0.245, 1);
    Object.position.y = 2.02;
    Object.material.depthWrite = false;
  });
}

function Refresh() {
  RefreshLocal();
  ShrinkRemoteLabels();
}

addEventListener("store-account-change", Refresh);
addEventListener("store-network-change", Refresh);
const Interval = setInterval(Refresh, 1000);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });
Refresh();

window.__STORE_PLAYER_NAMEPLATE_R94__ = { Refresh, GetName: AccountName };
window.__STORE_PLAYER_NAMEPLATE_BUILD__ = "V0.30.0-R94";