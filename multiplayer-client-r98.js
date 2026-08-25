import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const SERVER_URL = "https://the-infinity-store-vh88.onrender.com";
const PLAYER_MODEL_URL = "https://raw.githubusercontent.com/euuuuuuan/fatal-funnel-public/main/packages/renderer/assets/models/quaternius-men/worker.glb";
const ACCOUNTS_KEY = "InfinityStoreSavedAccountsV2";
const ACTIVE_ACCOUNT_KEY = "InfinityStoreActiveAccountV2";
const LEGACY_TOKEN_KEY = "InfinityStoreSessionV1";
const ROOM_KEY = "InfinityStoreRoomV2";
const PLAYER_HEIGHT = 1.76;
const SEND_INTERVAL_MS = 50;
const INTERPOLATION_DELAY_MS = 110;
const MAX_SNAPSHOT_AGE_MS = 4500;

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
if (!Game?.Scene || !Game?.Camera || !Player) throw new Error("Game and player must load before multiplayer client R98.");

const Loader = new GLTFLoader();
const RemotePlayers = new Map();
const SharedCompletedTasks = new Set();
const PendingCompletedTasks = new Set();
const ActionFlights = new Map();
const TempDirection = new THREE.Vector3();
const TempPositionA = new THREE.Vector3();
const TempPositionB = new THREE.Vector3();
const LastSentPosition = new THREE.Vector3();

let Socket = null;
let ConnectPromise = null;
let SocketGeneration = 0;
let Account = null;
let Profile = null;
let CurrentRoom = null;
let RoomPlayers = [];
let DesiredRoomCode = localStorage.getItem(ROOM_KEY) || "";
let Sequence = 0;
let LastSendAt = 0;
let LastFrameAt = performance.now();
let HasLastSentPosition = false;
let RemoteAssetPromise = null;
let Status = "offline";
let SessionToken = "";
let ServerClockOffset = 0;
let LastRoomSignature = "";
let LastAisleReport = 0;

function LoadSavedAccounts() {
  try {
    const Parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
    return Array.isArray(Parsed)
      ? Parsed.filter(Item => Item && typeof Item.userId === "string" && typeof Item.username === "string" && typeof Item.token === "string")
      : [];
  } catch {
    return [];
  }
}

function WriteSavedAccounts(Accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(Accounts.slice(0, 8)));
}

function PublicSavedAccounts() {
  return LoadSavedAccounts()
    .sort((A, B) => Number(B.lastUsedAt || 0) - Number(A.lastUsedAt || 0))
    .map(Item => ({ userId: Item.userId, username: Item.username, lastUsedAt: Item.lastUsedAt || 0 }));
}

function SavedAccountById(UserId) {
  return LoadSavedAccounts().find(Item => Item.userId === UserId) || null;
}

function SaveAccountSession(AccountData, Token) {
  if (!AccountData?.id || !Token) return;
  const Accounts = LoadSavedAccounts().filter(Item => Item.userId !== AccountData.id);
  Accounts.unshift({ userId: AccountData.id, username: AccountData.username, token: String(Token), lastUsedAt: Date.now() });
  WriteSavedAccounts(Accounts);
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, AccountData.id);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

function RemoveSavedAccount(UserId) {
  if (!UserId) return;
  WriteSavedAccounts(LoadSavedAccounts().filter(Item => Item.userId !== UserId));
  if (localStorage.getItem(ACTIVE_ACCOUNT_KEY) === UserId) localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}

function InitialSessionToken() {
  const Active = SavedAccountById(localStorage.getItem(ACTIVE_ACCOUNT_KEY) || "");
  return Active?.token || localStorage.getItem(LEGACY_TOKEN_KEY) || "";
}
SessionToken = InitialSessionToken();

function Dispatch(Name, Detail = {}) {
  window.dispatchEvent(new CustomEvent(Name, { detail: Detail }));
}

function SetStatus(Value) {
  if (Status === Value) return;
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
    players: RoomPlayers.slice(),
    savedAccounts: PublicSavedAccounts(),
    remotePlayers: RemotePlayers.size
  };
}

async function Api(Path, Options = {}) {
  const Controller = new AbortController();
  const Timeout = setTimeout(() => Controller.abort(), Options.timeout || 12_000);
  try {
    const Headers = { "Content-Type": "application/json", ...(Options.headers || {}) };
    const Token = Options.token === undefined ? SessionToken : String(Options.token || "");
    if (Options.auth !== false && Token) Headers.Authorization = `Bearer ${Token}`;
    const Response = await fetch(`${SERVER_URL}${Path}`, {
      method: Options.method || "GET",
      headers: Headers,
      body: Options.body === undefined ? undefined : JSON.stringify(Options.body),
      signal: Controller.signal,
      cache: "no-store"
    });
    let Data;
    try { Data = await Response.json(); }
    catch { Data = { ok: false, error: "INVALID_SERVER_RESPONSE" }; }
    if (!Response.ok && !Data?.error) Data.error = `HTTP_${Response.status}`;
    return Data;
  } catch (Error) {
    return { ok: false, error: Error?.name === "AbortError" ? "SERVER_TIMEOUT" : "SERVER_UNREACHABLE" };
  } finally {
    clearTimeout(Timeout);
  }
}

function ActionOnce(Key, Work) {
  const Existing = ActionFlights.get(Key);
  if (Existing) return Existing;
  const PromiseValue = Promise.resolve().then(Work).finally(() => {
    if (ActionFlights.get(Key) === PromiseValue) ActionFlights.delete(Key);
  });
  ActionFlights.set(Key, PromiseValue);
  return PromiseValue;
}

async function Register(Username, Password, ConfirmPassword) {
  return ActionOnce("auth:register", async () => {
    SetStatus("authenticating");
    const Result = await Api("/api/auth/register", { method: "POST", auth: false, body: { username: Username, password: Password, confirmPassword: ConfirmPassword } });
    if (!Result?.ok) { SetStatus(Account ? "online" : "offline"); return Result; }
    SessionToken = Result.token;
    Account = Result.account;
    Profile = null;
    SaveAccountSession(Account, SessionToken);
    await RefreshAccount();
    await ConnectSocket();
    Dispatch("store-account-change", GetState());
    return Result;
  });
}

async function Login(Username, Password) {
  return ActionOnce("auth:login", async () => {
    SetStatus("authenticating");
    const Result = await Api("/api/auth/login", { method: "POST", auth: false, body: { username: Username, password: Password } });
    if (!Result?.ok) { SetStatus(Account ? "online" : "offline"); return Result; }
    SessionToken = Result.token;
    Account = Result.account;
    Profile = null;
    SaveAccountSession(Account, SessionToken);
    await RefreshAccount();
    await ConnectSocket();
    Dispatch("store-account-change", GetState());
    return Result;
  });
}

async function RefreshAccount() {
  if (!SessionToken) return { ok: false, error: "AUTH_REQUIRED" };
  const Result = await Api("/api/auth/me");
  if (!Result?.ok) {
    if (Result?.error === "AUTH_REQUIRED") {
      if (Account?.id) RemoveSavedAccount(Account.id);
      SessionToken = "";
      Account = null;
      Profile = null;
      DisconnectSocket();
      Dispatch("store-account-change", GetState());
    }
    return Result;
  }
  Account = Result.account;
  Profile = Result.profile;
  SaveAccountSession(Account, SessionToken);
  Dispatch("store-account-change", GetState());
  return Result;
}

async function RestoreSession() {
  if (!SessionToken) { SetStatus("offline"); return { ok: false, error: "NO_SESSION" }; }
  SetStatus("waking");
  const Result = await RefreshAccount();
  if (!Result?.ok) { SetStatus("offline"); return Result; }
  await ConnectSocket();
  return Result;
}

async function SwitchAccount(UserId) {
  return ActionOnce("auth:switch", async () => {
    const Saved = SavedAccountById(String(UserId || ""));
    if (!Saved) return { ok: false, error: "SAVED_ACCOUNT_NOT_FOUND" };
    if (CurrentRoom) await LeaveRoom();
    DisconnectSocket();
    SessionToken = Saved.token;
    Account = null;
    Profile = null;
    SetStatus("authenticating");
    const Result = await Api("/api/auth/me", { token: Saved.token });
    if (!Result?.ok) {
      RemoveSavedAccount(Saved.userId);
      SessionToken = "";
      SetStatus("offline");
      Dispatch("store-account-change", GetState());
      return { ok: false, error: "SAVED_SESSION_EXPIRED" };
    }
    Account = Result.account;
    Profile = Result.profile;
    SaveAccountSession(Account, Saved.token);
    await ConnectSocket();
    Dispatch("store-account-change", GetState());
    return { ok: true, account: Account, profile: Profile };
  });
}

async function Logout() {
  return ActionOnce("auth:logout", async () => {
    const PreviousId = Account?.id || localStorage.getItem(ACTIVE_ACCOUNT_KEY) || "";
    if (CurrentRoom) await LeaveRoom();
    if (SessionToken) await Api("/api/auth/logout", { method: "POST", body: {} });
    RemoveSavedAccount(PreviousId);
    SessionToken = "";
    Account = null;
    Profile = null;
    DesiredRoomCode = "";
    CurrentRoom = null;
    RoomPlayers = [];
    localStorage.removeItem(ROOM_KEY);
    localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    DisconnectSocket();
    RemoveAllRemotePlayers();
    SetStatus("offline");
    Dispatch("store-account-change", GetState());
    Dispatch("store-room-change", GetState());
    return { ok: true };
  });
}

function ForgetSavedAccount(UserId) {
  if (Account?.id === UserId) return { ok: false, error: "ACTIVE_ACCOUNT" };
  RemoveSavedAccount(UserId);
  Dispatch("store-account-change", GetState());
  return { ok: true };
}

function DisconnectSocket() {
  SocketGeneration += 1;
  ConnectPromise = null;
  if (!Socket) return;
  const Old = Socket;
  Socket = null;
  try { Old.removeAllListeners(); } catch {}
  try { Old.disconnect(); } catch {}
  if (Status !== "offline") SetStatus(Account ? "offline" : "offline");
}

function SocketAck(EventName, Payload = {}, Timeout = 8000) {
  return new Promise(Resolve => {
    if (!Socket?.connected) return Resolve({ ok: false, error: "SOCKET_OFFLINE" });
    Socket.timeout(Timeout).emit(EventName, Payload, (Error, Response) => {
      Resolve(Error ? { ok: false, error: "SERVER_TIMEOUT" } : (Response || { ok: false, error: "EMPTY_RESPONSE" }));
    });
  });
}

function RoomSignature(Room, Players = RoomPlayers) {
  if (!Room) return "none";
  const PlayerSignature = (Players || []).map(Item => `${Item.id || ""}:${Item.userId || ""}:${Item.name || ""}`).sort().join("|");
  return `${Room.code}|${Room.playerCount}|${Room.maxPlayers}|${Room.started}|${Room.allowLateJoin}|${Room.public}|${Room.hostUserId}|${(Room.completedTasks || []).length}|${PlayerSignature}`;
}

function ApplyRoomState(Room, Players = RoomPlayers, ServerTime = 0, Force = false) {
  if (!Room) return false;
  if (Number.isFinite(Number(ServerTime)) && Number(ServerTime) > 0) ServerClockOffset = Number(ServerTime) - Date.now();
  const NextPlayers = Array.isArray(Players) ? Players : RoomPlayers;
  const Signature = RoomSignature(Room, NextPlayers);
  CurrentRoom = Room;
  RoomPlayers = NextPlayers.slice();
  ReconcileRemotePlayers(RoomPlayers);
  ApplyCompletedTasks(Room.completedTasks || []);
  if (!Force && Signature === LastRoomSignature) return false;
  LastRoomSignature = Signature;
  Dispatch("store-room-change", GetState());
  return true;
}

function BindSocketEvents(Target, Generation) {
  Target.on("connect", async () => {
    if (Socket !== Target || Generation !== SocketGeneration) return;
    SetStatus("online");
    if (DesiredRoomCode && !CurrentRoom) {
      const Result = await SocketAck("room:join", { code: DesiredRoomCode });
      if (Result?.ok) ApplyJoinResult(Result, true);
      else if (["ROOM_NOT_FOUND", "ROOM_FULL", "LATE_JOIN_DISABLED"].includes(Result?.error)) {
        DesiredRoomCode = "";
        localStorage.removeItem(ROOM_KEY);
      }
    }
  });

  Target.on("disconnect", Reason => {
    if (Socket !== Target || Generation !== SocketGeneration) return;
    if (Reason === "io client disconnect") return;
    SetStatus("reconnecting");
  });

  Target.on("connect_error", Error => {
    if (Socket !== Target || Generation !== SocketGeneration) return;
    if (/AUTH_REQUIRED/i.test(String(Error?.message || ""))) {
      if (Account?.id) RemoveSavedAccount(Account.id);
      SessionToken = "";
      Account = null;
      Profile = null;
      SetStatus("offline");
      Dispatch("store-account-change", GetState());
    } else SetStatus("reconnecting");
  });

  Target.on("server:ready", Data => {
    if (Number(Data?.serverTime)) ServerClockOffset = Number(Data.serverTime) - Date.now();
    Dispatch("store-server-ready", Data || {});
  });

  Target.on("room:sync", Payload => {
    if (Payload?.room) ApplyRoomState(Payload.room, Payload.players || [], Payload.serverTime || 0, false);
  });

  Target.on("room:host", Payload => {
    if (!CurrentRoom || !Payload?.hostUserId || CurrentRoom.hostUserId === Payload.hostUserId) return;
    CurrentRoom = { ...CurrentRoom, hostUserId: Payload.hostUserId };
    LastRoomSignature = "";
    ApplyRoomState(CurrentRoom, RoomPlayers, 0, true);
  });

  Target.on("room:started", Payload => {
    if (Payload?.room) ApplyRoomState(Payload.room, RoomPlayers, Payload.serverTime || 0, true);
    Dispatch("store-multiplayer-start", { room: CurrentRoom });
  });

  Target.on("player:joined", Data => {
    if (!Data?.id || Data.id === Target.id) return;
    const Next = [...RoomPlayers.filter(Item => Item.id !== Data.id), Data];
    RoomPlayers = Next;
    EnsureRemotePlayer(Data);
  });

  Target.on("player:left", Data => {
    if (!Data?.id) return;
    RoomPlayers = RoomPlayers.filter(Item => Item.id !== Data.id);
    RemoveRemotePlayer(Data.id);
  });

  Target.on("movement:snapshot", Snapshot => {
    if (!Snapshot?.id || Snapshot.id === Target.id) return;
    PushRemoteSnapshot(Snapshot.id, Snapshot);
  });

  Target.on("task:completed", Payload => {
    if (Payload?.taskId) ApplyCompletedTask(Payload.taskId);
  });

  Target.on("movement:correction", Snapshot => {
    if (Snapshot && CurrentRoom?.started) Dispatch("store-movement-correction", Snapshot);
  });
}

async function ConnectSocket() {
  if (!SessionToken || !Account) return { ok: false, error: "AUTH_REQUIRED" };
  if (Socket?.connected) return { ok: true };
  if (ConnectPromise) return ConnectPromise;

  const Generation = ++SocketGeneration;
  SetStatus("connecting");

  const Target = Socket || io(SERVER_URL, {
    autoConnect: false,
    auth: { token: SessionToken },
    transports: ["websocket"],
    upgrade: false,
    rememberUpgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 850,
    reconnectionDelayMax: 6000,
    randomizationFactor: 0.35,
    timeout: 12_000
  });

  if (Socket !== Target) {
    Socket = Target;
    BindSocketEvents(Target, Generation);
  } else {
    Target.auth = { token: SessionToken };
  }

  ConnectPromise = new Promise(Resolve => {
    let DoneCalled = false;
    const Done = Result => {
      if (DoneCalled) return;
      DoneCalled = true;
      Target.off("connect", OnConnect);
      Target.off("connect_error", OnError);
      clearTimeout(Timer);
      Resolve(Result);
    };
    const OnConnect = () => Done({ ok: true });
    const OnError = () => Done({ ok: false, error: "SOCKET_OFFLINE" });
    Target.once("connect", OnConnect);
    Target.once("connect_error", OnError);
    const Timer = setTimeout(() => Done({ ok: false, error: "SERVER_TIMEOUT" }), 12_500);
    if (!Target.connected) Target.connect();
    else Done({ ok: true });
  }).finally(() => {
    if (Generation === SocketGeneration) ConnectPromise = null;
  });

  return ConnectPromise;
}

function ApplyJoinResult(Result, Rejoined = false) {
  if (!Result?.ok || !Result.room) return Result;
  DesiredRoomCode = Result.room.code;
  localStorage.setItem(ROOM_KEY, DesiredRoomCode);
  const Players = [Result.player, ...(Result.players || [])].filter(Boolean);
  ApplyRoomState(Result.room, Players, Result.serverTime || 0, true);
  if (Result.room.started) queueMicrotask(() => Dispatch("store-multiplayer-start", { room: Result.room, lateJoin: !Rejoined }));
  return Result;
}

async function EnsureConnected() {
  return Socket?.connected ? { ok: true } : ConnectSocket();
}

async function QuickJoin() {
  return ActionOnce("room:quickJoin", async () => {
    const Connected = await EnsureConnected();
    if (!Connected?.ok) return Connected;
    return ApplyJoinResult(await SocketAck("room:quickJoin", {}));
  });
}

async function CreateRoom(Options = {}) {
  return ActionOnce("room:create", async () => {
    if (CurrentRoom?.code) return { ok: true, room: CurrentRoom, players: RoomPlayers.slice(), reused: true };
    const Connected = await EnsureConnected();
    if (!Connected?.ok) return Connected;
    const Payload = {
      maxPlayers: Math.max(2, Math.min(6, Math.floor(Number(Options.maxPlayers) || 4))),
      allowLateJoin: Boolean(Options.allowLateJoin),
      public: Options.public !== false
    };
    return ApplyJoinResult(await SocketAck("room:create", Payload));
  });
}

async function JoinRoom(Code, Remember = true) {
  const Clean = String(Code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  if (!Clean) return { ok: false, error: "ROOM_CODE_REQUIRED" };
  return ActionOnce(`room:join:${Clean}`, async () => {
    const Connected = await EnsureConnected();
    if (!Connected?.ok) return Connected;
    const Result = ApplyJoinResult(await SocketAck("room:join", { code: Clean }));
    if (!Result?.ok && !Remember) return Result;
    return Result;
  });
}

async function UpdateRoomSettings(Options = {}) {
  return ActionOnce("room:updateSettings", async () => {
    const Result = await SocketAck("room:updateSettings", {
      maxPlayers: Math.max(2, Math.min(6, Math.floor(Number(Options.maxPlayers) || 4))),
      allowLateJoin: Boolean(Options.allowLateJoin),
      public: Boolean(Options.public)
    });
    if (Result?.ok && Result.room) ApplyRoomState(Result.room, RoomPlayers, 0, true);
    return Result;
  });
}

async function StartRoom() {
  return ActionOnce("room:start", async () => {
    const Result = await SocketAck("room:start", {});
    if (Result?.ok && Result.room) ApplyRoomState(Result.room, RoomPlayers, 0, true);
    return Result;
  });
}

async function LeaveRoom() {
  return ActionOnce("room:leave", async () => {
    const Result = Socket?.connected ? await SocketAck("room:leave", {}) : { ok: true };
    CurrentRoom = null;
    RoomPlayers = [];
    DesiredRoomCode = "";
    LastRoomSignature = "";
    localStorage.removeItem(ROOM_KEY);
    RemoveAllRemotePlayers();
    SharedCompletedTasks.clear();
    PendingCompletedTasks.clear();
    Dispatch("store-room-change", GetState());
    return Result;
  });
}

async function ListPublicRooms() {
  if (!Account) return { ok: false, error: "AUTH_REQUIRED", count: 0, rooms: [] };
  return ActionOnce("rooms:list", () => Api("/api/rooms"));
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
  if (!RemoteAssetPromise) RemoteAssetPromise = Loader.loadAsync(PLAYER_MODEL_URL).then(Gltf => ({ scene: Gltf.scene, clips: Gltf.animations || [] }));
  return RemoteAssetPromise;
}

function CreateNameSprite(Name) {
  const Canvas = document.createElement("canvas");
  Canvas.width = 320;
  Canvas.height = 72;
  const Context = Canvas.getContext("2d");
  Context.fillStyle = "rgba(8,10,8,.84)";
  Context.fillRect(18, 14, 284, 44);
  Context.strokeStyle = "rgba(231,220,198,.42)";
  Context.strokeRect(18, 14, 284, 44);
  Context.fillStyle = "#eee4d0";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.font = "800 18px Arial";
  Context.fillText(String(Name || "").slice(0, 20), 160, 36);
  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  const Sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Texture, transparent: true, depthWrite: false }));
  Sprite.scale.set(0.96, 0.22, 1);
  Sprite.position.set(0, 2.03, 0);
  Sprite.name = "RemotePlayerNameR88";
  return Sprite;
}

function PrepareRemoteModel(Source) {
  const Model = SkeletonUtils.clone(Source);
  Model.updateMatrixWorld(true);
  const RawBounds = new THREE.Box3().setFromObject(Model);
  const RawSize = RawBounds.getSize(new THREE.Vector3());
  Model.scale.setScalar(PLAYER_HEIGHT / Math.max(RawSize.y, 0.001));
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
    if (Record.Snapshots.length) ApplyRemoteTransform(Record, Record.Snapshots[Record.Snapshots.length - 1]);
  } catch (Error) {
    console.warn("Remote player model failed to load", Error);
  } finally {
    Record.Building = false;
  }
}

function EnsureRemotePlayer(Data) {
  if (!Data?.id || Data.id === Socket?.id) return null;
  let Record = RemotePlayers.get(Data.id);
  if (!Record) {
    Record = { id: Data.id, userId: Data.userId || "", name: Data.name || "", Pivot: null, Model: null, Mixer: null, Actions: new Map(), ActiveAction: null, Animation: "", Snapshots: [], Building: false };
    RemotePlayers.set(Data.id, Record);
    BuildRemoteAvatar(Record);
  }
  if (Data.name) Record.name = Data.name;
  if (Data.movement) PushRemoteSnapshot(Data.id, { id: Data.id, userId: Data.userId, ...Data.movement });
  return Record;
}

function RemoveRemotePlayer(Id) {
  const Record = RemotePlayers.get(Id);
  if (!Record) return;
  Record.Pivot?.parent?.remove(Record.Pivot);
  Record.Mixer?.stopAllAction?.();
  Record.Pivot?.traverse?.(Object => {
    if (Object.name === "RemotePlayerNameR88") {
      Object.material?.map?.dispose?.();
      Object.material?.dispose?.();
    }
  });
  RemotePlayers.delete(Id);
}

function RemoveAllRemotePlayers() {
  for (const Id of [...RemotePlayers.keys()]) RemoveRemotePlayer(Id);
}

function PushRemoteSnapshot(Id, Snapshot) {
  const Record = EnsureRemotePlayer({ id: Id, userId: Snapshot?.userId || "", name: Snapshot?.name || "" });
  if (!Record) return;
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
  while (Record.Snapshots.length > 24) Record.Snapshots.shift();
  const Cutoff = ServerNow() - MAX_SNAPSHOT_AGE_MS;
  while (Record.Snapshots.length > 2 && Record.Snapshots[1].serverTime < Cutoff) Record.Snapshots.shift();
}

function ReconcileRemotePlayers(Players) {
  const Seen = new Set();
  for (const Data of Players || []) {
    if (!Data?.id || Data.id === Socket?.id) continue;
    Seen.add(Data.id);
    EnsureRemotePlayer(Data);
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
  if (!B) return ApplyRemoteTransform(Record, A);
  const Alpha = THREE.MathUtils.clamp((TargetTime - A.serverTime) / Math.max(1, B.serverTime - A.serverTime), 0, 1);
  TempPositionA.set(A.x, 0, A.z);
  TempPositionB.set(B.x, 0, B.z);
  Record.Pivot.position.copy(TempPositionA.lerp(TempPositionB, Alpha));
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
  if (!Socket?.connected || !CurrentRoom?.started || Now - LastSendAt < SEND_INTERVAL_MS) return;
  LastSendAt = Now;
  const Position = Game.Camera.position;
  const Moving = HasLastSentPosition && Math.hypot(Position.x - LastSentPosition.x, Position.z - LastSentPosition.z) > 0.008;
  LastSentPosition.copy(Position);
  HasLastSentPosition = true;
  const Sprinting = Boolean(Player.IsSprinting?.());
  Sequence += 1;
  Socket.volatile.emit("movement:update", {
    x: Position.x, y: Position.y, z: Position.z,
    yaw: LocalYaw(), pitch: LocalPitch(),
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
  if (!Task) { PendingCompletedTasks.add(Id); return; }
  if (!Task.Completed) {
    Task.Completed = true;
    if (Task.Screen?.material) {
      Task.Screen.material = Task.Screen.material.clone();
      Task.Screen.material.color?.setHex?.(0x23522c);
      Task.Screen.material.emissive?.setHex?.(0x36d45b);
      Task.Screen.material.emissiveIntensity = 1.9;
    }
  }
  PendingCompletedTasks.delete(Id);
}

function ApplyCompletedTasks(Ids) {
  for (const Id of Ids || []) ApplyCompletedTask(Id);
}

function DetectLocalTaskCompletions() {
  if (!Socket?.connected || !CurrentRoom?.started || !Game.Tasks) return;
  for (const Task of Game.Tasks.values()) {
    if (!Task?.Completed || SharedCompletedTasks.has(Task.Id)) continue;
    SharedCompletedTasks.add(Task.Id);
    Socket.timeout(6000).emit("task:complete", { taskId: Task.Id }, Error => {
      if (Error) SharedCompletedTasks.delete(Task.Id);
    });
  }
  for (const Id of [...PendingCompletedTasks]) ApplyCompletedTask(Id);
}

function ReportAisleProgress() {
  if (!Socket?.connected || !CurrentRoom?.started || !Game.ChunkIndexForZ) return;
  const Aisle = Math.max(0, Game.ChunkIndexForZ(Game.Camera.position.z) + 1);
  if (Aisle <= LastAisleReport) return;
  LastAisleReport = Aisle;
  Socket.emit("profile:aisle", { aisle: Aisle });
}

function Frame() {
  const Now = performance.now();
  const Delta = Math.min((Now - LastFrameAt) / 1000, 0.05);
  LastFrameAt = Now;
  if (CurrentRoom?.started && !window.__STORE_UI_MODAL_OPEN_R96__) {
    SendMovement(Now);
    for (const Record of RemotePlayers.values()) UpdateRemotePlayer(Record, Delta);
  }
  requestAnimationFrame(Frame);
}

const TaskTimer = setInterval(DetectLocalTaskCompletions, 400);
const AisleTimer = setInterval(ReportAisleProgress, 2000);
addEventListener("pagehide", () => {
  clearInterval(TaskTimer);
  clearInterval(AisleTimer);
  DisconnectSocket();
}, { once: true });
requestAnimationFrame(Frame);
RestoreSession().catch(() => SetStatus("offline"));

window.__STORE_MULTIPLAYER_R88__ = {
  ServerUrl: SERVER_URL,
  Register,
  Login,
  Logout,
  SwitchAccount,
  ForgetSavedAccount,
  RestoreSession,
  RefreshAccount,
  ConnectSocket,
  ListPublicRooms,
  QuickJoin,
  CreateRoom,
  JoinRoom,
  UpdateRoomSettings,
  StartRoom,
  LeaveRoom,
  GetState,
  GetSocket: () => Socket,
  ServerNow
};
window.__STORE_MULTIPLAYER_BUILD__ = "V0.30.5-R98";
