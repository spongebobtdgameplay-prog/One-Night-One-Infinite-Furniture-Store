import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const SERVER_URL = "https://the-infinity-store-vh88.onrender.com";
const ACCOUNTS_KEY = "InfinityStoreSavedAccountsV2";
const ACTIVE_ACCOUNT_KEY = "InfinityStoreActiveAccountV2";
const LEGACY_TOKEN_KEY = "InfinityStoreSessionV1";
const ROOM_KEY = "InfinityStoreRoomV2";

const ActionFlights = new Map();
let Socket = null;
let ConnectPromise = null;
let SocketGeneration = 0;
let Account = null;
let Profile = null;
let CurrentRoom = null;
let RoomPlayers = [];
let DesiredRoomCode = localStorage.getItem(ROOM_KEY) || "";
let SessionToken = "";
let Status = "offline";
let LastRoomSignature = "";
let ServerClockOffset = 0;

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
    serverClockOffset: ServerClockOffset
  };
}

function SetStatus(Value) {
  if (Status === Value) return;
  Status = Value;
  Dispatch("store-network-change", GetState());
}

async function Api(Path, Options = {}) {
  const Controller = new AbortController();
  const Timer = setTimeout(() => Controller.abort(), Options.timeout || 12_000);
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
    clearTimeout(Timer);
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

function RoomSignature(Room, Players = RoomPlayers) {
  if (!Room) return "none";
  const PlayerSignature = (Players || []).map(Item => `${Item.id || ""}:${Item.userId || ""}:${Item.name || ""}`).sort().join("|");
  return `${Room.code}|${Room.playerCount}|${Room.maxPlayers}|${Room.started}|${Room.allowLateJoin}|${Room.public}|${Room.hostUserId}|${(Room.completedTasks || []).join?.(",") || ""}|${PlayerSignature}`;
}

function ApplyRoomState(Room, Players = RoomPlayers, ServerTime = 0, Force = false) {
  if (!Room) return false;
  if (Number.isFinite(Number(ServerTime)) && Number(ServerTime) > 0) ServerClockOffset = Number(ServerTime) - Date.now();
  const NextPlayers = Array.isArray(Players) ? Players : RoomPlayers;
  const Signature = RoomSignature(Room, NextPlayers);
  CurrentRoom = Room;
  RoomPlayers = NextPlayers.slice();
  if (!Force && Signature === LastRoomSignature) return false;
  LastRoomSignature = Signature;
  Dispatch("store-room-change", GetState());
  return true;
}

function DisconnectSocket() {
  SocketGeneration += 1;
  ConnectPromise = null;
  if (!Socket) return;
  const Old = Socket;
  Socket = null;
  try { Old.removeAllListeners(); } catch {}
  try { Old.disconnect(); } catch {}
  if (Account) SetStatus("offline");
}

function SocketAck(EventName, Payload = {}, Timeout = 8000) {
  return new Promise(Resolve => {
    if (!Socket?.connected) return Resolve({ ok: false, error: "SOCKET_OFFLINE" });
    Socket.timeout(Timeout).emit(EventName, Payload, (Error, Response) => {
      Resolve(Error ? { ok: false, error: "SERVER_TIMEOUT" } : (Response || { ok: false, error: "EMPTY_RESPONSE" }));
    });
  });
}

function ApplyJoinResult(Result, Rejoined = false) {
  if (!Result?.ok || !Result.room) return Result;
  DesiredRoomCode = Result.room.code;
  localStorage.setItem(ROOM_KEY, DesiredRoomCode);
  const Players = [Result.player, ...(Result.players || [])].filter(Boolean);
  ApplyRoomState(Result.room, Players, Result.serverTime || 0, true);
  if (Result.room.started && !Rejoined) queueMicrotask(() => Dispatch("store-multiplayer-start", { room: Result.room, lateJoin: true }));
  return Result;
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
    if (Socket !== Target || Generation !== SocketGeneration || Reason === "io client disconnect") return;
    SetStatus("reconnecting");
  });

  Target.on("connect_error", Error => {
    if (Socket !== Target || Generation !== SocketGeneration) return;
    if (/AUTH_REQUIRED/i.test(String(Error?.message || ""))) {
      if (Account?.id) RemoveSavedAccount(Account.id);
      SessionToken = "";
      Account = null;
      Profile = null;
      CurrentRoom = null;
      RoomPlayers = [];
      localStorage.removeItem(ROOM_KEY);
      Dispatch("store-account-change", GetState());
      Dispatch("store-room-change", GetState());
      SetStatus("offline");
    } else {
      SetStatus("reconnecting");
    }
  });

  Target.on("server:ready", Data => {
    if (Number(Data?.serverTime)) ServerClockOffset = Number(Data.serverTime) - Date.now();
    Dispatch("store-server-ready", Data || {});
  });

  Target.on("room:sync", Payload => {
    if (Payload?.room) ApplyRoomState(Payload.room, Payload.players || RoomPlayers, Payload.serverTime || 0, false);
  });

  Target.on("room:host", Payload => {
    if (!CurrentRoom || !Payload?.hostUserId || CurrentRoom.hostUserId === Payload.hostUserId) return;
    ApplyRoomState({ ...CurrentRoom, hostUserId: Payload.hostUserId }, RoomPlayers, 0, true);
  });

  Target.on("room:started", Payload => {
    if (Payload?.room) ApplyRoomState(Payload.room, RoomPlayers, Payload.serverTime || 0, true);
    Dispatch("store-multiplayer-start", { room: CurrentRoom });
  });

  Target.on("player:joined", Data => {
    if (!Data?.id || Data.id === Target.id) return;
    RoomPlayers = [...RoomPlayers.filter(Item => Item.id !== Data.id), Data];
  });

  Target.on("player:left", Data => {
    if (!Data?.id) return;
    RoomPlayers = RoomPlayers.filter(Item => Item.id !== Data.id);
  });

  Target.on("task:completed", Payload => {
    if (!Payload?.taskId || !CurrentRoom) return;
    const Completed = new Set(CurrentRoom.completedTasks || []);
    if (Completed.has(Payload.taskId)) return;
    Completed.add(Payload.taskId);
    ApplyRoomState({ ...CurrentRoom, completedTasks: [...Completed] }, RoomPlayers, Payload.serverTime || 0, true);
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
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 900,
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
    let Finished = false;
    const Finish = Result => {
      if (Finished) return;
      Finished = true;
      Target.off("connect", OnConnect);
      Target.off("connect_error", OnError);
      clearTimeout(Timer);
      Resolve(Result);
    };
    const OnConnect = () => Finish({ ok: true });
    const OnError = () => Finish({ ok: false, error: "SOCKET_OFFLINE" });
    Target.once("connect", OnConnect);
    Target.once("connect_error", OnError);
    const Timer = setTimeout(() => Finish({ ok: false, error: "SERVER_TIMEOUT" }), 12_500);
    if (!Target.connected) Target.connect();
    else Finish({ ok: true });
  }).finally(() => {
    if (Generation === SocketGeneration) ConnectPromise = null;
  });

  return ConnectPromise;
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
  return ConnectSocket();
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
    CurrentRoom = null;
    RoomPlayers = [];
    DesiredRoomCode = "";
    LastRoomSignature = "";
    localStorage.removeItem(ROOM_KEY);
    localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    DisconnectSocket();
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
    return ApplyJoinResult(await SocketAck("room:create", {
      maxPlayers: Math.max(2, Math.min(6, Math.floor(Number(Options.maxPlayers) || 4))),
      allowLateJoin: Boolean(Options.allowLateJoin),
      public: Options.public !== false
    }));
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
    if (Result?.ok && Result.room) ApplyRoomState(Result.room, RoomPlayers, Result.serverTime || 0, true);
    return Result;
  });
}

async function StartRoom() {
  return ActionOnce("room:start", async () => {
    const Result = await SocketAck("room:start", {});
    if (Result?.ok && Result.room) ApplyRoomState(Result.room, RoomPlayers, Result.serverTime || 0, true);
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
    Dispatch("store-room-change", GetState());
    return Result;
  });
}

async function ListPublicRooms() {
  if (!Account) return { ok: false, error: "AUTH_REQUIRED", count: 0, rooms: [] };
  return ActionOnce("rooms:list", () => Api("/api/rooms"));
}

RestoreSession().catch(() => SetStatus("offline"));

const ApiObject = {
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
  ServerNow: () => Date.now() + ServerClockOffset
};

window.__STORE_MULTIPLAYER_LOBBY_R99__ = ApiObject;
window.__STORE_MULTIPLAYER_R88__ = ApiObject;
window.__STORE_MULTIPLAYER_R98__ = ApiObject;
window.__STORE_MULTIPLAYER_BUILD__ = "V0.31.0-R99";
