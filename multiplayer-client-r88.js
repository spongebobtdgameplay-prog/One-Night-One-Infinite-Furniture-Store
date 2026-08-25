import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const SERVER_URL = "https://the-infinity-store-vh88.onrender.com";
const PLAYER_MODEL_URL = "https://raw.githubusercontent.com/euuuuuuan/fatal-funnel-public/main/packages/renderer/assets/models/quaternius-men/worker.glb";
const TOKEN_KEY = "InfinityStoreSessionV1";
const ROOM_KEY = "InfinityStoreRoomV1";
const PLAYER_HEIGHT = 1.76;
const SEND_INTERVAL_MS = 50;
const INTERPOLATION_DELAY_MS = 115;
const MAX_SNAPSHOT_AGE_MS = 5000;

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
if (!Game?.Scene || !Game?.Camera || !Player) throw new Error("Game and player must load before multiplayer client.");

const Loader = new GLTFLoader();
const RemotePlayers = new Map();
const SharedCompletedTasks = new Set();
const PendingCompletedTasks = new Set();
const TempDirection = new THREE.Vector3();
const TempPosition = new THREE.Vector3();
const LastSentPosition = new THREE.Vector3();
const LastAisleReport = { Value: 0 };

let Socket = null;
let Account = null;
let Profile = null;
let SessionToken = localStorage.getItem(TOKEN_KEY) || "";
let CurrentRoom = null;
let DesiredRoomCode = localStorage.getItem(ROOM_KEY) || "";
let Sequence = 0;
let ServerClockOffset = 0;
let LastSendAt = 0;
let HasLastSentPosition = false;
let RemoteAssetPromise = null;
let LastFrameAt = performance.now();
let Status = "offline";

function Dispatch(Name, Detail = {}) {
  window.dispatchEvent(new CustomEvent(Name, { detail: Detail }));
}

function SetStatus(Value, Detail = "") {
  if (Status === Value && !Detail) return;
  Status = Value;
  Dispatch("store-network-change", GetState());
}

function GetState() {
  return {
    serverUrl: SERVER_URL,
    status: Status,
    connected: Boolean(Socket?.connected),
    account: Account,
    profile: Profile,
    room: CurrentRoom,
    remotePlayers: RemotePlayers.size
  };
}

function StoreSession(Token) {
  SessionToken = String(Token || "");
  if (SessionToken) localStorage.setItem(TOKEN_KEY, SessionToken);
  else localStorage.removeItem(TOKEN_KEY);
}

async function Api(Path, Options = {}) {
  const Controller = new AbortController();
  const Timeout = setTimeout(() => Controller.abort(), Options.timeout || 15_000);
  try {
    const Headers = { "Content-Type": "application/json", ...(Options.headers || {}) };
    if (Options.auth !== false && SessionToken) Headers.Authorization = `Bearer ${SessionToken}`;
    const Response = await fetch(`${SERVER_URL}${Path}`, {
      method: Options.method || "GET",
      headers: Headers,
      body: Options.body === undefined ? undefined : JSON.stringify(Options.body),
      signal: Controller.signal,
      cache: "no-store"
    });
    let Data = null;
    try { Data = await Response.json(); } catch { Data = { ok: false, error: "INVALID_SERVER_RESPONSE" }; }
    if (!Response.ok && !Data?.error) Data.error = `HTTP_${Response.status}`;
    return Data;
  } catch (Error) {
    if (Error?.name === "AbortError") return { ok: false, error: "SERVER_TIMEOUT" };
    return { ok: false, error: "SERVER_UNREACHABLE" };
  } finally {
    clearTimeout(Timeout);
  }
}

async function Register(Username, Password) {
  SetStatus("authenticating");
  const Result = await Api("/api/auth/register", {
    method: "POST",
    auth: false,
    body: { username: Username, password: Password }
  });
  if (!Result?.ok) {
    SetStatus(Account ? "online" : "offline");
    return Result;
  }
  StoreSession(Result.token);
  Account = Result.account;
  Profile = null;
  Dispatch("store-account-change", GetState());
  await ConnectSocket();
  return Result;
}

async function Login(Username, Password) {
  SetStatus("authenticating");
  const Result = await Api("/api/auth/login", {
    method: "POST",
    auth: false,
    body: { username: Username, password: Password }
  });
  if (!Result?.ok) {
    SetStatus(Account ? "online" : "offline");
    return Result;
  }
  StoreSession(Result.token);
  Account = Result.account;
  Profile = null;
  Dispatch("store-account-change", GetState());
  await RefreshAccount();
  await ConnectSocket();
  return Result;
}

async function RefreshAccount() {
  if (!SessionToken) return { ok: false, error: "AUTH_REQUIRED" };
  const Result = await Api("/api/auth/me");
  if (!Result?.ok) {
    if (Result?.error === "AUTH_REQUIRED") {
      StoreSession("");
      Account = null;
      Profile = null;
      DisconnectSocket();
      Dispatch("store-account-change", GetState());
    }
    return Result;
  }
  Account = Result.account;
  Profile = Result.profile;
  Dispatch("store-account-change", GetState());
  return Result;
}

async function RestoreSession() {
  if (!SessionToken) {
    SetStatus("offline");
    return { ok: false, error: "NO_SESSION" };
  }
  SetStatus("waking");
  const Result = await RefreshAccount();
  if (!Result?.ok) {
    SetStatus("offline");
    return Result;
  }
  await ConnectSocket();
  return Result;
}

async function Logout() {
  if (SessionToken) await Api("/api/auth/logout", { method: "POST", body: {} });
  LeaveRoom().catch(() => {});
  StoreSession("");
  Account = null;
  Profile = null;
  DesiredRoomCode = "";
  localStorage.removeItem(ROOM_KEY);
  DisconnectSocket();
  RemoveAllRemotePlayers();
  SetStatus("offline");
  Dispatch("store-account-change", GetState());
  Dispatch("store-room-change", GetState());
  return { ok: true };
}

function DisconnectSocket() {
  if (!Socket) return;
  Socket.removeAllListeners();
  Socket.disconnect();
  Socket = null;
}

function SocketAck(EventName, Payload = {}, Timeout = 10_000) {
  return new Promise(Resolve => {
    if (!Socket?.connected) return Resolve({ ok: false, error: "SOCKET_OFFLINE" });
    Socket.timeout(Timeout).emit(EventName, Payload, (Error, Response) => {
      if (Error) Resolve({ ok: false, error: "SERVER_TIMEOUT" });
      else Resolve(Response || { ok: false, error: "EMPTY_RESPONSE" });
    });
  });
}

async function ConnectSocket() {
  if (!SessionToken || !Account) return { ok: false, error: "AUTH_REQUIRED" };
  if (Socket?.connected) return { ok: true };
  if (Socket) DisconnectSocket();

  SetStatus("connecting");
  Socket = io(SERVER_URL, {
    auth: { token: SessionToken },
    transports: ["websocket", "polling"],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 600,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.35,
    timeout: 15_000
  });

  Socket.on("connect", async () => {
    SetStatus("online");
    if (DesiredRoomCode) {
      const Result = await JoinRoom(DesiredRoomCode, false);
      if (!Result?.ok && Result?.error === "ROOM_NOT_FOUND") {
        DesiredRoomCode = "";
        localStorage.removeItem(ROOM_KEY);
      }
    }
  });

  Socket.on("disconnect", () => {
    SetStatus("reconnecting");
  });

  Socket.on("connect_error", Error => {
    if (/AUTH_REQUIRED/i.test(String(Error?.message || ""))) {
      StoreSession("");
      Account = null;
      Profile = null;
      Dispatch("store-account-change", GetState());
      SetStatus("offline");
    } else SetStatus("reconnecting");
  });

  Socket.on("server:ready", Data => {
    Dispatch("store-server-ready", Data || {});
  });

  Socket.on("player:joined", Data => {
    if (!Data?.id || Data.id === Socket.id) return;
    EnsureRemotePlayer(Data);
  });

  Socket.on("player:left", Data => {
    if (Data?.id) RemoveRemotePlayer(Data.id);
  });

  Socket.on("movement:snapshot", Snapshot => {
    if (!Snapshot?.id || Snapshot.id === Socket.id) return;
    PushRemoteSnapshot(Snapshot.id, Snapshot);
  });

  Socket.on("room:sync", Payload => {
    if (!Payload?.room) return;
    CurrentRoom = Payload.room;
    ReconcileRemotePlayers(Payload.players || []);
    ApplyCompletedTasks(Payload.room.completedTasks || []);
    Dispatch("store-room-change", GetState());
  });

  Socket.on("room:host", Payload => {
    if (CurrentRoom && Payload?.hostUserId) CurrentRoom.hostUserId = Payload.hostUserId;
    Dispatch("store-room-change", GetState());
  });

  Socket.on("task:completed", Payload => {
    if (Payload?.taskId) ApplyCompletedTask(Payload.taskId);
  });

  Socket.on("movement:correction", Snapshot => {
    if (!Snapshot || !CurrentRoom) return;
    Dispatch("store-movement-correction", Snapshot);
  });

  await new Promise(Resolve => {
    if (Socket.connected) return Resolve();
    const Done = () => {
      Socket?.off("connect", Done);
      Socket?.off("connect_error", Done);
      Resolve();
    };
    Socket.once("connect", Done);
    Socket.once("connect_error", Done);
    setTimeout(Done, 15_500);
  });

  return { ok: Boolean(Socket?.connected) };
}

function ApplyJoinResult(Result) {
  if (!Result?.ok) return Result;
  CurrentRoom = Result.room;
  DesiredRoomCode = Result.room.code;
  localStorage.setItem(ROOM_KEY, DesiredRoomCode);
  RemoveAllRemotePlayers();
  for (const Remote of Result.players || []) EnsureRemotePlayer(Remote);
  ApplyCompletedTasks(Result.room.completedTasks || []);
  Dispatch("store-room-change", GetState());
  return Result;
}

async function QuickJoin() {
  if (!Socket?.connected) {
    const Connected = await ConnectSocket();
    if (!Connected.ok) return Connected;
  }
  return ApplyJoinResult(await SocketAck("room:quickJoin", {}));
}

async function CreateRoom(IsPublic = false) {
  if (!Socket?.connected) {
    const Connected = await ConnectSocket();
    if (!Connected.ok) return Connected;
  }
  return ApplyJoinResult(await SocketAck("room:create", { public: Boolean(IsPublic) }));
}

async function JoinRoom(Code, Remember = true) {
  if (!Socket?.connected) {
    const Connected = await ConnectSocket();
    if (!Connected.ok) return Connected;
  }
  const Result = ApplyJoinResult(await SocketAck("room:join", { code: String(Code || "").trim().toUpperCase() }));
  if (!Result?.ok && !Remember) return Result;
  return Result;
}

async function LeaveRoom() {
  const Result = Socket?.connected ? await SocketAck("room:leave", {}) : { ok: true };
  CurrentRoom = null;
  DesiredRoomCode = "";
  localStorage.removeItem(ROOM_KEY);
  RemoveAllRemotePlayers();
  Dispatch("store-room-change", GetState());
  return Result;
}

async function PingServer() {
  if (!Socket?.connected) return;
  const Sent = Date.now();
  const Result = await SocketAck("ping:client", Sent, 5000);
  const Received = Date.now();
  if (!Result?.serverTime) return;
  const Midpoint = (Sent + Received) * 0.5;
  const Sample = Number(Result.serverTime) - Midpoint;
  ServerClockOffset = THREE.MathUtils.lerp(ServerClockOffset, Sample, 0.25);
}

function ServerNow() {
  return Date.now() + ServerClockOffset;
}

function PickClip(Clips, Patterns) {
  for (const Pattern of Patterns) {
    const Match = Clips.find(Clip => Pattern.test(Clip.name));
    if (Match) return Match;
  }
  return null;
}

async function EnsureRemoteAsset() {
  if (RemoteAssetPromise) return RemoteAssetPromise;
  RemoteAssetPromise = Loader.loadAsync(PLAYER_MODEL_URL).then(Gltf => ({ scene: Gltf.scene, clips: Gltf.animations || [] }));
  return RemoteAssetPromise;
}

function CreateNameSprite(Name) {
  const Canvas = document.createElement("canvas");
  Canvas.width = 512;
  Canvas.height = 128;
  const Context = Canvas.getContext("2d");
  Context.clearRect(0, 0, Canvas.width, Canvas.height);
  Context.fillStyle = "rgba(9,11,10,.78)";
  Context.fillRect(22, 22, 468, 84);
  Context.strokeStyle = "rgba(238,228,207,.70)";
  Context.lineWidth = 4;
  Context.strokeRect(22, 22, 468, 84);
  Context.fillStyle = "#f0e7d4";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.font = "900 42px Arial";
  Context.fillText(String(Name || "PLAYER").slice(0, 20), 256, 64);
  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  const Material = new THREE.SpriteMaterial({ map: Texture, transparent: true, depthWrite: false });
  const Sprite = new THREE.Sprite(Material);
  Sprite.scale.set(2.15, 0.54, 1);
  Sprite.position.set(0, 2.12, 0);
  Sprite.name = "RemotePlayerNameR88";
  return Sprite;
}

function PrepareRemoteModel(Source) {
  const Model = SkeletonUtils.clone(Source);
  Model.updateMatrixWorld(true);
  const RawBounds = new THREE.Box3().setFromObject(Model);
  const RawSize = RawBounds.getSize(new THREE.Vector3());
  const Scale = PLAYER_HEIGHT / Math.max(RawSize.y, 0.001);
  Model.scale.setScalar(Scale);
  Model.updateMatrixWorld(true);
  const Bounds = new THREE.Box3().setFromObject(Model);
  const Center = Bounds.getCenter(new THREE.Vector3());
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
    Pivot.add(CreateNameSprite(Record.name));
    Game.Scene.add(Pivot);

    Record.Pivot = Pivot;
    Record.Model = Model;
    Record.Mixer = new THREE.AnimationMixer(Model);
    Record.Actions = new Map();
    const Definitions = {
      idle: [/idle/i],
      walk: [/walk/i, /jog/i],
      sprint: [/run/i, /sprint/i]
    };
    for (const [Name, Patterns] of Object.entries(Definitions)) {
      const Clip = PickClip(Asset.clips, Patterns);
      if (!Clip) continue;
      const Action = Record.Mixer.clipAction(Clip);
      Action.enabled = true;
      Action.setLoop(THREE.LoopRepeat, Infinity);
      Record.Actions.set(Name, Action);
    }
    SetRemoteAnimation(Record, "idle");
    if (Record.Snapshots.length) ApplyRemoteTransform(Record, Record.Snapshots[Record.Snapshots.length - 1]);
  } catch (Error) {
    console.warn("Remote worker model failed to load", Error);
  } finally {
    Record.Building = false;
  }
}

function EnsureRemotePlayer(Data) {
  if (!Data?.id || Data.id === Socket?.id) return null;
  let Record = RemotePlayers.get(Data.id);
  if (!Record) {
    Record = {
      id: Data.id,
      userId: Data.userId || "",
      name: Data.name || "PLAYER",
      Pivot: null,
      Model: null,
      Mixer: null,
      Actions: new Map(),
      ActiveAction: null,
      Animation: "",
      Snapshots: [],
      Building: false,
      LastSnapshotAt: performance.now()
    };
    RemotePlayers.set(Data.id, Record);
    BuildRemoteAvatar(Record);
  }
  if (Data.movement) PushRemoteSnapshot(Data.id, { id: Data.id, userId: Data.userId, ...Data.movement });
  Dispatch("store-network-change", GetState());
  return Record;
}

function RemoveRemotePlayer(Id) {
  const Record = RemotePlayers.get(Id);
  if (!Record) return;
  if (Record.Pivot?.parent) Record.Pivot.parent.remove(Record.Pivot);
  Record.Mixer?.stopAllAction?.();
  Record.Pivot?.traverse?.(Object => {
    if (Object?.material?.map && Object.name === "RemotePlayerNameR88") Object.material.map.dispose?.();
    if (Object?.material && Object.name === "RemotePlayerNameR88") Object.material.dispose?.();
  });
  RemotePlayers.delete(Id);
  Dispatch("store-network-change", GetState());
}

function RemoveAllRemotePlayers() {
  for (const Id of [...RemotePlayers.keys()]) RemoveRemotePlayer(Id);
}

function PushRemoteSnapshot(Id, Snapshot) {
  const Record = EnsureRemotePlayer({ id: Id, userId: Snapshot?.userId || "", name: Snapshot?.name || "PLAYER" });
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
  const Existing = Record.Snapshots[Record.Snapshots.length - 1];
  if (Existing && Clean.sequence && Clean.sequence <= Existing.sequence) return;
  Record.Snapshots.push(Clean);
  Record.Snapshots.sort((A, B) => A.serverTime - B.serverTime);
  while (Record.Snapshots.length > 28) Record.Snapshots.shift();
  const Cutoff = ServerNow() - MAX_SNAPSHOT_AGE_MS;
  while (Record.Snapshots.length > 2 && Record.Snapshots[1].serverTime < Cutoff) Record.Snapshots.shift();
  Record.LastSnapshotAt = performance.now();
}

function ReconcileRemotePlayers(Players) {
  const Seen = new Set();
  for (const Data of Players || []) {
    if (!Data?.id || Data.id === Socket?.id) continue;
    Seen.add(Data.id);
    const Record = EnsureRemotePlayer(Data);
    if (Data.movement) PushRemoteSnapshot(Data.id, { id: Data.id, userId: Data.userId, ...Data.movement });
    if (Record && Data.name) Record.name = Data.name;
  }
  for (const Id of [...RemotePlayers.keys()]) if (!Seen.has(Id)) RemoveRemotePlayer(Id);
}

function LerpAngle(From, To, Alpha) {
  const Difference = Math.atan2(Math.sin(To - From), Math.cos(To - From));
  return From + Difference * Alpha;
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

function ApplyRemoteTransform(Record, Snapshot) {
  if (!Record?.Pivot || !Snapshot) return;
  Record.Pivot.position.set(Snapshot.x, 0, Snapshot.z);
  Record.Pivot.rotation.y = Snapshot.yaw;
  SetRemoteAnimation(Record, Snapshot.animation);
}

function UpdateRemotePlayer(Record, Delta) {
  if (!Record.Pivot || !Record.Snapshots.length) return;
  Record.Mixer?.update?.(Delta);
  const TargetTime = ServerNow() - INTERPOLATION_DELAY_MS;
  const Snapshots = Record.Snapshots;

  while (Snapshots.length >= 3 && Snapshots[1].serverTime <= TargetTime) Snapshots.shift();
  const A = Snapshots[0];
  const B = Snapshots[1];
  if (!B) {
    ApplyRemoteTransform(Record, A);
    return;
  }

  const Span = Math.max(1, B.serverTime - A.serverTime);
  const Alpha = THREE.MathUtils.clamp((TargetTime - A.serverTime) / Span, 0, 1);
  TempPosition.set(A.x, 0, A.z).lerp(new THREE.Vector3(B.x, 0, B.z), Alpha);
  Record.Pivot.position.copy(TempPosition);
  Record.Pivot.rotation.y = LerpAngle(A.yaw, B.yaw, Alpha);
  SetRemoteAnimation(Record, Alpha < 0.5 ? A.animation : B.animation);
}

function LocalYaw() {
  const Pivot = Game.Scene.getObjectByName("PlayerCharacterPivot");
  if (Pivot) return Pivot.rotation.y;
  Game.Camera.getWorldDirection(TempDirection);
  TempDirection.y = 0;
  if (TempDirection.lengthSq() <= 0.000001) return 0;
  TempDirection.normalize();
  return Math.atan2(TempDirection.x, TempDirection.z);
}

function LocalPitch() {
  Game.Camera.getWorldDirection(TempDirection);
  return Math.asin(THREE.MathUtils.clamp(TempDirection.y, -1, 1));
}

function SendMovement(Now) {
  if (!Socket?.connected || !CurrentRoom || Now - LastSendAt < SEND_INTERVAL_MS) return;
  LastSendAt = Now;
  const Position = Game.Camera.position;
  let Moving = false;
  if (HasLastSentPosition) {
    const Distance = Math.hypot(Position.x - LastSentPosition.x, Position.z - LastSentPosition.z);
    Moving = Distance > 0.008;
  }
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

function ApplyCompletedTask(TaskId) {
  const Id = String(TaskId || "");
  if (!Id || SharedCompletedTasks.has(Id)) return;
  SharedCompletedTasks.add(Id);
  const Task = Game.Tasks?.get?.(Id);
  if (!Task) {
    PendingCompletedTasks.add(Id);
    return;
  }
  if (Task.Completed) return;
  Task.Completed = true;
  if (Task.Screen?.material) {
    Task.Screen.material = Task.Screen.material.clone();
    Task.Screen.material.color?.setHex?.(0x23522c);
    Task.Screen.material.emissive?.setHex?.(0x36d45b);
    Task.Screen.material.emissiveIntensity = 1.9;
  }
  const Chunk = Game.ActiveChunks?.get?.(Task.ChunkIndex);
  if (Task.Type === "breaker" && Chunk) {
    for (const Light of Chunk.Lights || []) Light.userData.BaseIntensity = Math.max(Light.userData.BaseIntensity || 0, 2.0);
  }
  PendingCompletedTasks.delete(Id);
}

function ApplyCompletedTasks(Ids) {
  for (const Id of Ids || []) ApplyCompletedTask(Id);
}

function DetectLocalTaskCompletions() {
  if (!Socket?.connected || !CurrentRoom || !Game.Tasks) return;
  for (const Task of Game.Tasks.values()) {
    if (!Task?.Completed || SharedCompletedTasks.has(Task.Id)) continue;
    SharedCompletedTasks.add(Task.Id);
    Socket.emit("task:complete", { taskId: Task.Id }, Response => {
      if (!Response?.ok) SharedCompletedTasks.delete(Task.Id);
    });
  }
  for (const Id of [...PendingCompletedTasks]) ApplyCompletedTask(Id);
}

function ReportAisleProgress() {
  if (!Socket?.connected || !CurrentRoom || !Game.ChunkIndexForZ) return;
  const Aisle = Math.max(0, Game.ChunkIndexForZ(Game.Camera.position.z) + 1);
  if (Aisle <= LastAisleReport.Value) return;
  LastAisleReport.Value = Aisle;
  Socket.emit("profile:aisle", { aisle: Aisle });
}

function Frame() {
  const Now = performance.now();
  const Delta = Math.min((Now - LastFrameAt) / 1000, 0.05);
  LastFrameAt = Now;
  SendMovement(Now);
  for (const Record of RemotePlayers.values()) UpdateRemotePlayer(Record, Delta);
  requestAnimationFrame(Frame);
}

setInterval(() => PingServer().catch(() => {}), 5000);
setInterval(DetectLocalTaskCompletions, 220);
setInterval(ReportAisleProgress, 1500);
requestAnimationFrame(Frame);
RestoreSession().catch(() => SetStatus("offline"));

window.__STORE_MULTIPLAYER_R88__ = {
  ServerUrl: SERVER_URL,
  Register,
  Login,
  Logout,
  RestoreSession,
  RefreshAccount,
  ConnectSocket,
  QuickJoin,
  CreateRoom,
  JoinRoom,
  LeaveRoom,
  GetState,
  GetSocket: () => Socket
};
window.__STORE_MULTIPLAYER_BUILD__ = "V0.25.0-R88";
