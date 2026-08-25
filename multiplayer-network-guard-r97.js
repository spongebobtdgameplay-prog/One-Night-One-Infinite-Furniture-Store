const Multiplayer = window.__STORE_MULTIPLAYER_R88__;
if (!Multiplayer) throw new Error("Multiplayer client must load before the network guard.");

const Original = {
  CreateRoom: Multiplayer.CreateRoom?.bind(Multiplayer),
  ListPublicRooms: Multiplayer.ListPublicRooms?.bind(Multiplayer),
  QuickJoin: Multiplayer.QuickJoin?.bind(Multiplayer),
  JoinRoom: Multiplayer.JoinRoom?.bind(Multiplayer),
  UpdateRoomSettings: Multiplayer.UpdateRoomSettings?.bind(Multiplayer),
  StartRoom: Multiplayer.StartRoom?.bind(Multiplayer),
  LeaveRoom: Multiplayer.LeaveRoom?.bind(Multiplayer)
};

const InFlight = new Map();
const Recent = new Map();
const PatchedManagers = new WeakSet();
const ForcedReconnectManagers = new WeakSet();

function Now() {
  return performance.now();
}

function Remember(Key, Result, Duration) {
  Recent.set(Key, { Result, ExpiresAt: Now() + Duration });
  return Result;
}

function RecentResult(Key) {
  const Entry = Recent.get(Key);
  if (!Entry) return null;
  if (Entry.ExpiresAt <= Now()) {
    Recent.delete(Key);
    return null;
  }
  return Entry.Result;
}

function SingleFlight(Key, Work, CacheMs = 0) {
  const Cached = CacheMs > 0 ? RecentResult(Key) : null;
  if (Cached) return Promise.resolve(Cached);
  const Existing = InFlight.get(Key);
  if (Existing) return Existing;

  const PromiseValue = Promise.resolve()
    .then(Work)
    .then(Result => CacheMs > 0 && Result?.ok ? Remember(Key, Result, CacheMs) : Result)
    .finally(() => {
      if (InFlight.get(Key) === PromiseValue) InFlight.delete(Key);
    });

  InFlight.set(Key, PromiseValue);
  return PromiseValue;
}

function NormalizeCode(Value) {
  return String(Value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function ForceWebSocketOnly() {
  const Socket = Multiplayer.GetSocket?.();
  const Manager = Socket?.io;
  if (!Socket || !Manager) return;

  if (!PatchedManagers.has(Manager)) {
    PatchedManagers.add(Manager);
    if (Manager.opts) {
      Manager.opts.transports = ["websocket"];
      Manager.opts.upgrade = false;
      Manager.opts.rememberUpgrade = true;
    }
  }

  const TransportName = String(Manager.engine?.transport?.name || "").toLowerCase();
  if (TransportName !== "polling" || ForcedReconnectManagers.has(Manager)) return;
  ForcedReconnectManagers.add(Manager);

  // Render supports WebSockets. If this connection fell back to HTTP polling,
  // reconnect once using WebSocket only instead of hammering the service with polls.
  try { Socket.disconnect(); } catch {}
  setTimeout(() => {
    try { Socket.connect(); } catch {}
  }, 180);
}

if (Original.CreateRoom) {
  Multiplayer.CreateRoom = function GuardedCreateRoom(Options = {}) {
    const ExistingRoom = Multiplayer.GetState?.()?.room;
    if (ExistingRoom?.code) {
      return Promise.resolve({ ok: true, room: ExistingRoom, players: [], reused: true });
    }
    const MaxPlayers = Math.max(2, Math.min(6, Math.floor(Number(Options.maxPlayers) || 4)));
    const Key = `create:${MaxPlayers}:${Boolean(Options.allowLateJoin)}:${Options.public !== false}`;
    return SingleFlight(Key, () => Original.CreateRoom({
      maxPlayers: MaxPlayers,
      allowLateJoin: Boolean(Options.allowLateJoin),
      public: Options.public !== false
    }), 5000);
  };
}

if (Original.ListPublicRooms) {
  Multiplayer.ListPublicRooms = function GuardedListPublicRooms() {
    return SingleFlight("public-rooms", () => Original.ListPublicRooms(), 5000);
  };
}

if (Original.QuickJoin) {
  Multiplayer.QuickJoin = function GuardedQuickJoin() {
    return SingleFlight("quick-join", () => Original.QuickJoin(), 2500);
  };
}

if (Original.JoinRoom) {
  Multiplayer.JoinRoom = function GuardedJoinRoom(Code, RememberRoom = true) {
    const Clean = NormalizeCode(Code);
    return SingleFlight(`join:${Clean}`, () => Original.JoinRoom(Clean, RememberRoom), 2500);
  };
}

if (Original.UpdateRoomSettings) {
  Multiplayer.UpdateRoomSettings = function GuardedUpdateRoomSettings(Options = {}) {
    const MaxPlayers = Math.max(2, Math.min(6, Math.floor(Number(Options.maxPlayers) || 4)));
    const Key = `settings:${MaxPlayers}:${Boolean(Options.allowLateJoin)}:${Options.public !== false}`;
    return SingleFlight(Key, () => Original.UpdateRoomSettings({
      maxPlayers: MaxPlayers,
      allowLateJoin: Boolean(Options.allowLateJoin),
      public: Options.public !== false
    }), 1200);
  };
}

if (Original.StartRoom) {
  Multiplayer.StartRoom = function GuardedStartRoom() {
    return SingleFlight("start-room", () => Original.StartRoom(), 3000);
  };
}

if (Original.LeaveRoom) {
  Multiplayer.LeaveRoom = function GuardedLeaveRoom() {
    return SingleFlight("leave-room", () => Original.LeaveRoom(), 1500);
  };
}

addEventListener("store-network-change", ForceWebSocketOnly);
addEventListener("store-account-change", ForceWebSocketOnly);
setTimeout(ForceWebSocketOnly, 0);
setTimeout(ForceWebSocketOnly, 500);

window.__STORE_MULTIPLAYER_NETWORK_GUARD_R97__ = {
  ForceWebSocketOnly,
  IsRequestInFlight: Key => InFlight.has(String(Key || "")),
  ClearPublicRoomCache: () => Recent.delete("public-rooms")
};
window.__STORE_MULTIPLAYER_NETWORK_GUARD_BUILD__ = "V0.30.4-R97";
