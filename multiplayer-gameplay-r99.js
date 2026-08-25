import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const Multiplayer = window.__STORE_MULTIPLAYER_LOBBY_R99__ || window.__STORE_MULTIPLAYER_R88__;
const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
if (!Multiplayer || !Game?.Scene || !Game?.Camera || !Player) throw new Error("Lobby network, game and player must load before multiplayer gameplay R99.");

const MODEL_URL = "https://raw.githubusercontent.com/euuuuuuan/fatal-funnel-public/main/packages/renderer/assets/models/quaternius-men/worker.glb";
const PLAYER_HEIGHT = 1.76;
const SEND_INTERVAL_MS = 50;
const INTERPOLATION_DELAY_MS = 110;
const MAX_SNAPSHOT_AGE_MS = 4500;
const Loader = new GLTFLoader();
const RemotePlayers = new Map();
const TempDirection = new THREE.Vector3();
const TempA = new THREE.Vector3();
const TempB = new THREE.Vector3();
const LastSentPosition = new THREE.Vector3();

let RemoteAssetPromise = null;
let LastSendAt = 0;
let Sequence = 0;
let HasLastSentPosition = false;
let LastFrameAt = performance.now();
let BoundSocket = null;
let LastAisleReport = 0;

function ServerNow() {
  return Multiplayer.ServerNow?.() || Date.now();
}

function PickClip(Clips, Patterns) {
  for (const Pattern of Patterns) {
    const Match = Clips.find(Clip => Pattern.test(Clip.name));
    if (Match) return Match;
  }
  return null;
}

async function EnsureRemoteAsset() {
  if (!RemoteAssetPromise) RemoteAssetPromise = Loader.loadAsync(MODEL_URL).then(Gltf => ({ scene: Gltf.scene, clips: Gltf.animations || [] }));
  return RemoteAssetPromise;
}

function CreateNameSprite(Name) {
  const Canvas = document.createElement("canvas");
  Canvas.width = 320;
  Canvas.height = 72;
  const Context = Canvas.getContext("2d");
  Context.fillStyle = "rgba(8,10,8,.84)";
  Context.fillRect(18, 13, 284, 46);
  Context.strokeStyle = "rgba(220,207,184,.40)";
  Context.strokeRect(18, 13, 284, 46);
  Context.fillStyle = "#ece1cd";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.font = "800 18px Arial";
  Context.fillText(String(Name || "").slice(0, 20).toUpperCase(), 160, 36);
  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  const Sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Texture, transparent: true, depthWrite: false }));
  Sprite.name = "RemotePlayerNameR88";
  Sprite.scale.set(0.92, 0.21, 1);
  Sprite.position.y = 2.03;
  return Sprite;
}

function PrepareRemoteModel(Source) {
  const Model = SkeletonUtils.clone(Source);
  Model.updateMatrixWorld(true);
  const Bounds = new THREE.Box3().setFromObject(Model);
  const Size = Bounds.getSize(new THREE.Vector3());
  Model.scale.setScalar(PLAYER_HEIGHT / Math.max(Size.y, 0.001));
  Model.updateMatrixWorld(true);
  const Scaled = new THREE.Box3().setFromObject(Model);
  const Center = Scaled.getCenter(new THREE.Vector3());
  Model.position.x -= Center.x;
  Model.position.z -= Center.z;
  Model.updateMatrixWorld(true);
  const Grounded = new THREE.Box3().setFromObject(Model);
  Model.position.y -= Grounded.min.y;
  Model.traverse(Object => {
    if (!Object.isMesh) return;
    Object.castShadow = false;
    Object.receiveShadow = false;
    Object.frustumCulled = true;
  });
  return Model;
}

function SetRemoteAnimation(Record, Name) {
  if (!Record?.Mixer || Record.Animation === Name) return;
  Record.Animation = Name;
  const Next = Record.Actions.get(Name) || Record.Actions.get("idle");
  if (!Next) return;
  Next.reset().fadeIn(0.10).play();
  if (Record.ActiveAction && Record.ActiveAction !== Next) Record.ActiveAction.fadeOut(0.10);
  Record.ActiveAction = Next;
}

async function BuildRemoteAvatar(Record) {
  if (Record.Building || Record.Pivot) return;
  Record.Building = true;
  try {
    const Asset = await EnsureRemoteAsset();
    if (!RemotePlayers.has(Record.id)) return;
    const Model = PrepareRemoteModel(Asset.scene);
    const Pivot = new THREE.Group();
    Pivot.name = `RemotePlayerR88-${Record.id}`;
    Pivot.userData.RemotePlayerR88 = true;
    Pivot.userData.SocketId = Record.id;
    Pivot.add(Model);
    if (Record.name) Pivot.add(CreateNameSprite(Record.name));
    Game.Scene.add(Pivot);
    Record.Pivot = Pivot;
    Record.Model = Model;
    Record.Mixer = new THREE.AnimationMixer(Model);
    const Definitions = { idle: [/idle/i], walk: [/walk/i, /jog/i], sprint: [/run/i, /sprint/i] };
    for (const [Name, Patterns] of Object.entries(Definitions)) {
      const Clip = PickClip(Asset.clips, Patterns);
      if (!Clip) continue;
      const Action = Record.Mixer.clipAction(Clip);
      Action.enabled = true;
      Action.setLoop(THREE.LoopRepeat, Infinity);
      Record.Actions.set(Name, Action);
    }
    SetRemoteAnimation(Record, "idle");
    if (Record.Snapshots.length) ApplyRemoteTransform(Record, Record.Snapshots.at(-1));
  } catch (Error) {
    console.warn("Remote player model failed", Error);
  } finally {
    Record.Building = false;
  }
}

function EnsureRemotePlayer(Data) {
  const Socket = Multiplayer.GetSocket?.();
  if (!Data?.id || Data.id === Socket?.id) return null;
  let Record = RemotePlayers.get(Data.id);
  if (!Record) {
    Record = { id: Data.id, userId: Data.userId || "", name: Data.name || "", Pivot: null, Model: null, Mixer: null, Actions: new Map(), ActiveAction: null, Animation: "", Snapshots: [], Building: false };
    RemotePlayers.set(Data.id, Record);
    BuildRemoteAvatar(Record);
  }
  if (Data.name) Record.name = Data.name;
  if (Data.movement) PushSnapshot(Data.id, { id: Data.id, userId: Data.userId, ...Data.movement });
  return Record;
}

function RemoveRemotePlayer(Id) {
  const Record = RemotePlayers.get(Id);
  if (!Record) return;
  Record.Mixer?.stopAllAction?.();
  Record.Pivot?.traverse?.(Object => {
    if (Object.name === "RemotePlayerNameR88") {
      Object.material?.map?.dispose?.();
      Object.material?.dispose?.();
    }
  });
  Record.Pivot?.parent?.remove(Record.Pivot);
  RemotePlayers.delete(Id);
}

function ReconcileRemotePlayers(Players) {
  const Socket = Multiplayer.GetSocket?.();
  const Seen = new Set();
  for (const Data of Players || []) {
    if (!Data?.id || Data.id === Socket?.id) continue;
    Seen.add(Data.id);
    EnsureRemotePlayer(Data);
  }
  for (const Id of [...RemotePlayers.keys()]) if (!Seen.has(Id)) RemoveRemotePlayer(Id);
}

function PushSnapshot(Id, Snapshot) {
  const Record = EnsureRemotePlayer({ id: Id, userId: Snapshot?.userId || "", name: Snapshot?.name || "" });
  if (!Record || !Snapshot) return;
  const Clean = {
    x: Number(Snapshot.x) || 0,
    y: Number(Snapshot.y) || 1.68,
    z: Number(Snapshot.z) || 0,
    yaw: Number(Snapshot.yaw) || 0,
    pitch: Number(Snapshot.pitch) || 0,
    animation: ["idle", "walk", "sprint"].includes(Snapshot.animation) ? Snapshot.animation : "idle",
    sprinting: Boolean(Snapshot.sprinting),
    sequence: Number(Snapshot.sequence) || 0,
    serverTime: Number(Snapshot.serverTime) || ServerNow()
  };
  const Existing = Record.Snapshots.at(-1);
  if (Existing && Clean.sequence && Clean.sequence <= Existing.sequence) return;
  Record.Snapshots.push(Clean);
  Record.Snapshots.sort((A, B) => A.serverTime - B.serverTime);
  while (Record.Snapshots.length > 24) Record.Snapshots.shift();
  const Cutoff = ServerNow() - MAX_SNAPSHOT_AGE_MS;
  while (Record.Snapshots.length > 2 && Record.Snapshots[1].serverTime < Cutoff) Record.Snapshots.shift();
}

function ApplyRemoteTransform(Record, Snapshot) {
  if (!Record?.Pivot || !Snapshot) return;
  Record.Pivot.position.set(Snapshot.x, 0, Snapshot.z);
  Record.Pivot.rotation.y = Snapshot.yaw;
  SetRemoteAnimation(Record, Snapshot.animation);
}

function LerpAngle(From, To, Alpha) {
  const Difference = Math.atan2(Math.sin(To - From), Math.cos(To - From));
  return From + Difference * Alpha;
}

function UpdateRemotePlayer(Record, Delta) {
  if (!Record.Pivot || !Record.Snapshots.length) return;
  Record.Mixer?.update?.(Delta);
  const TargetTime = ServerNow() - INTERPOLATION_DELAY_MS;
  const Snapshots = Record.Snapshots;
  while (Snapshots.length >= 3 && Snapshots[1].serverTime <= TargetTime) Snapshots.shift();
  const A = Snapshots[0];
  const B = Snapshots[1];
  if (!B) return ApplyRemoteTransform(Record, A);
  const Alpha = THREE.MathUtils.clamp((TargetTime - A.serverTime) / Math.max(1, B.serverTime - A.serverTime), 0, 1);
  TempA.set(A.x, 0, A.z);
  TempB.set(B.x, 0, B.z);
  Record.Pivot.position.copy(TempA.lerp(TempB, Alpha));
  Record.Pivot.rotation.y = LerpAngle(A.yaw, B.yaw, Alpha);
  SetRemoteAnimation(Record, Alpha < 0.5 ? A.animation : B.animation);
}

function LocalYaw() {
  const Pivot = Game.Scene.getObjectByName("PlayerCharacterPivot");
  if (Pivot) return Pivot.rotation.y;
  Game.Camera.getWorldDirection(TempDirection);
  TempDirection.y = 0;
  if (TempDirection.lengthSq() < 0.000001) return 0;
  TempDirection.normalize();
  return Math.atan2(TempDirection.x, TempDirection.z);
}

function LocalPitch() {
  Game.Camera.getWorldDirection(TempDirection);
  return Math.asin(THREE.MathUtils.clamp(TempDirection.y, -1, 1));
}

function SendMovement(Now) {
  const State = Multiplayer.GetState();
  const Socket = Multiplayer.GetSocket?.();
  if (!Socket?.connected || !State.room?.started || Now - LastSendAt < SEND_INTERVAL_MS) return;
  LastSendAt = Now;
  const Position = Game.Camera.position;
  let Moving = false;
  if (HasLastSentPosition) Moving = Math.hypot(Position.x - LastSentPosition.x, Position.z - LastSentPosition.z) > 0.008;
  LastSentPosition.copy(Position);
  HasLastSentPosition = true;
  const Sprinting = Boolean(Player.IsSprinting?.());
  Sequence += 1;
  Socket.volatile.emit("movement:update", {
    x: Position.x,
    y: Position.y,
    z: Position.z,
    yaw: LocalYaw(),
    pitch: LocalPitch(),
    animation: Moving ? (Sprinting ? "sprint" : "walk") : "idle",
    sprinting: Sprinting,
    sequence: Sequence
  });
}

function BindSocket() {
  const Socket = Multiplayer.GetSocket?.();
  if (!Socket || Socket === BoundSocket) return;
  if (BoundSocket) {
    BoundSocket.off?.("room:sync", OnRoomSync);
    BoundSocket.off?.("player:joined", OnPlayerJoined);
    BoundSocket.off?.("player:left", OnPlayerLeft);
    BoundSocket.off?.("movement:snapshot", OnMovement);
  }
  BoundSocket = Socket;
  Socket.on("room:sync", OnRoomSync);
  Socket.on("player:joined", OnPlayerJoined);
  Socket.on("player:left", OnPlayerLeft);
  Socket.on("movement:snapshot", OnMovement);
}

function OnRoomSync(Payload) { ReconcileRemotePlayers(Payload?.players || []); }
function OnPlayerJoined(Data) { EnsureRemotePlayer(Data); }
function OnPlayerLeft(Data) { if (Data?.id) RemoveRemotePlayer(Data.id); }
function OnMovement(Snapshot) { if (Snapshot?.id) PushSnapshot(Snapshot.id, Snapshot); }

function Frame() {
  const Now = performance.now();
  const Delta = Math.min((Now - LastFrameAt) / 1000, 0.05);
  LastFrameAt = Now;
  const Active = Multiplayer.GetState().room?.started && !document.hidden && !window.__STORE_UI_MODAL_OPEN_R99__;
  if (Active) {
    SendMovement(Now);
    for (const Record of RemotePlayers.values()) UpdateRemotePlayer(Record, Delta);
  }
  requestAnimationFrame(Frame);
}

function ReportAisle() {
  const State = Multiplayer.GetState();
  const Socket = Multiplayer.GetSocket?.();
  if (!Socket?.connected || !State.room?.started || document.hidden || !Game.ChunkIndexForZ) return;
  const Aisle = Math.max(0, Game.ChunkIndexForZ(Game.Camera.position.z) + 1);
  if (Aisle <= LastAisleReport) return;
  LastAisleReport = Aisle;
  Socket.emit("profile:aisle", { aisle: Aisle });
}

BindSocket();
ReconcileRemotePlayers(Multiplayer.GetState().players || []);
addEventListener("store-network-change", BindSocket);
addEventListener("store-room-change", () => ReconcileRemotePlayers(Multiplayer.GetState().players || []));
const AisleTimer = setInterval(ReportAisle, 1500);
requestAnimationFrame(Frame);
addEventListener("pagehide", () => {
  clearInterval(AisleTimer);
  for (const Id of [...RemotePlayers.keys()]) RemoveRemotePlayer(Id);
}, { once: true });

window.__STORE_MULTIPLAYER_GAMEPLAY_R99__ = { ReconcileRemotePlayers, SendMovement };
window.__STORE_MULTIPLAYER_GAMEPLAY_BUILD__ = "V0.31.0-R99";
