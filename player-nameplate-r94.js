import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
if (!Game?.Scene || !Player) throw new Error("Game and player must load before player nameplates.");

const RemoteNames = new Map();
let LocalPlate = null;
let LocalName = "";
let BoundSocket = null;

function AccountName() {
  const GateName = window.__STORE_ACCOUNT_GATE_RESULT__?.account?.username;
  const NetworkName = window.__STORE_MULTIPLAYER_R88__?.GetState?.()?.account?.username;
  return String(NetworkName || GateName || "").trim().slice(0, 20);
}

function DrawPlateCanvas(Canvas, Name) {
  const Context = Canvas.getContext("2d");
  Context.clearRect(0, 0, Canvas.width, Canvas.height);
  Context.fillStyle = "rgba(7,9,7,.76)";
  Context.fillRect(28, 22, Canvas.width - 56, Canvas.height - 44);
  Context.strokeStyle = "rgba(213,199,174,.42)";
  Context.lineWidth = 2;
  Context.strokeRect(28, 22, Canvas.width - 56, Canvas.height - 44);
  Context.fillStyle = "#e7dcc6";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.font = `800 ${Math.max(20, Math.min(27, 350 / Math.max(4, Name.length)))}px Arial`;
  Context.fillText(Name.toUpperCase(), Canvas.width * 0.5, Canvas.height * 0.51);
}

function BuildPlate(Name) {
  const Canvas = document.createElement("canvas");
  Canvas.width = 384;
  Canvas.height = 96;
  DrawPlateCanvas(Canvas, Name);
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

function SetRemoteName(Id, Name) {
  const Clean = String(Name || "").trim().slice(0, 20);
  if (!Id || !Clean || Clean.toUpperCase() === "PLAYER") return;
  RemoteNames.set(String(Id), Clean);
}

function UpdateRemoteSprite(Pivot) {
  const Id = String(Pivot?.userData?.SocketId || Pivot?.name?.replace(/^RemotePlayerR88-/, "") || "");
  const Sprite = Pivot?.getObjectByName?.("RemotePlayerNameR88");
  if (!Sprite?.isSprite) return;
  Sprite.scale.set(0.98, 0.245, 1);
  Sprite.position.y = 2.02;
  Sprite.material.depthWrite = false;
  const Name = RemoteNames.get(Id);
  if (!Name) {
    Sprite.visible = false;
    return;
  }
  Sprite.visible = true;
  if (Sprite.userData.AccountNameR94 === Name) return;
  const Canvas = Sprite.material?.map?.image;
  if (Canvas?.getContext) {
    DrawPlateCanvas(Canvas, Name);
    Sprite.material.map.needsUpdate = true;
    Sprite.userData.AccountNameR94 = Name;
  }
}

function RefreshRemoteLabels() {
  for (const Child of Game.Scene.children) {
    if (!/^RemotePlayerR88-/.test(String(Child?.name || ""))) continue;
    UpdateRemoteSprite(Child);
  }
}

function BindSocket() {
  const Socket = window.__STORE_MULTIPLAYER_R88__?.GetSocket?.();
  if (!Socket || Socket === BoundSocket) return;
  BoundSocket = Socket;
  Socket.on("player:joined", PlayerData => {
    SetRemoteName(PlayerData?.id, PlayerData?.name);
    queueMicrotask(RefreshRemoteLabels);
  });
  Socket.on("room:sync", Payload => {
    for (const PlayerData of Payload?.players || []) SetRemoteName(PlayerData?.id, PlayerData?.name);
    queueMicrotask(RefreshRemoteLabels);
  });
  Socket.on("player:left", PlayerData => {
    if (PlayerData?.id) RemoteNames.delete(String(PlayerData.id));
  });
}

function Refresh() {
  RefreshLocal();
  BindSocket();
  RefreshRemoteLabels();
}

addEventListener("store-account-change", Refresh);
addEventListener("store-network-change", Refresh);
addEventListener("store-room-change", Refresh);
const Interval = setInterval(Refresh, 900);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });
Refresh();

window.__STORE_PLAYER_NAMEPLATE_R94__ = { Refresh, GetName: AccountName };
window.__STORE_PLAYER_NAMEPLATE_BUILD__ = "V0.30.0-R94";