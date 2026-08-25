import http from "node:http";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";

const PORT = Number(process.env.PORT) || 3000;
const CLIENT_ORIGINS = new Set([
  "https://spongebobtdgameplay-prog.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

function OriginAllowed(Origin) {
  if (!Origin) return true;
  if (CLIENT_ORIGINS.has(Origin)) return true;
  return Origin.startsWith("https://spongebobtdgameplay-prog.github.io");
}

const App = express();
App.disable("x-powered-by");
App.use(express.json({ limit: "64kb" }));
App.use(cors({
  origin(Origin, Callback) {
    if (OriginAllowed(Origin)) return Callback(null, true);
    return Callback(new Error("Origin not allowed"));
  },
  credentials: true
}));

App.get("/", (_Request, Response) => {
  Response.json({
    service: "The Infinity Store multiplayer server",
    status: "online",
    version: "0.1.0"
  });
});

App.get("/health", (_Request, Response) => {
  Response.status(200).json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    players: IO.engine.clientsCount
  });
});

const HttpServer = http.createServer(App);
const IO = new SocketIOServer(HttpServer, {
  cors: {
    origin(Origin, Callback) {
      if (OriginAllowed(Origin)) return Callback(null, true);
      return Callback(new Error("Origin not allowed"));
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 128 * 1024
});

const Players = new Map();
const Rooms = new Map();

function CleanRoomId(Value) {
  const Text = String(Value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return Text.slice(0, 32) || "PUBLIC";
}

function CleanName(Value) {
  const Text = String(Value || "PLAYER").trim().replace(/[^a-zA-Z0-9 _-]/g, "");
  return Text.slice(0, 24) || "PLAYER";
}

function CleanNumber(Value, Fallback = 0) {
  const NumberValue = Number(Value);
  return Number.isFinite(NumberValue) ? NumberValue : Fallback;
}

function CleanMovement(Data = {}) {
  return {
    x: CleanNumber(Data.x),
    y: CleanNumber(Data.y),
    z: CleanNumber(Data.z),
    yaw: CleanNumber(Data.yaw),
    pitch: CleanNumber(Data.pitch),
    animation: String(Data.animation || "idle").slice(0, 24),
    sprinting: Boolean(Data.sprinting),
    sequence: Math.max(0, Math.floor(CleanNumber(Data.sequence)))
  };
}

function RoomRecord(RoomId) {
  let Room = Rooms.get(RoomId);
  if (!Room) {
    Room = {
      id: RoomId,
      createdAt: Date.now(),
      players: new Set()
    };
    Rooms.set(RoomId, Room);
  }
  return Room;
}

function PublicPlayer(Player) {
  return {
    id: Player.id,
    name: Player.name,
    roomId: Player.roomId,
    movement: Player.movement
  };
}

function LeaveCurrentRoom(Socket) {
  const Player = Players.get(Socket.id);
  if (!Player?.roomId) return;

  const PreviousRoomId = Player.roomId;
  const Room = Rooms.get(PreviousRoomId);
  if (Room) {
    Room.players.delete(Socket.id);
    if (Room.players.size === 0) Rooms.delete(PreviousRoomId);
  }

  Socket.leave(PreviousRoomId);
  Socket.to(PreviousRoomId).emit("player:left", { id: Socket.id });
  Player.roomId = "";
}

IO.on("connection", Socket => {
  Players.set(Socket.id, {
    id: Socket.id,
    name: "PLAYER",
    roomId: "",
    movement: {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      animation: "idle",
      sprinting: false,
      sequence: 0
    },
    connectedAt: Date.now(),
    lastMovementAt: 0
  });

  Socket.emit("server:ready", {
    id: Socket.id,
    version: "0.1.0",
    transport: Socket.conn.transport.name
  });

  Socket.on("room:join", (Payload = {}, Ack = () => {}) => {
    const Player = Players.get(Socket.id);
    if (!Player) return Ack({ ok: false, error: "PLAYER_NOT_FOUND" });

    const RoomId = CleanRoomId(Payload.roomId);
    const Name = CleanName(Payload.name);

    if (Player.roomId && Player.roomId !== RoomId) LeaveCurrentRoom(Socket);

    Player.name = Name;
    Player.roomId = RoomId;
    const Room = RoomRecord(RoomId);
    Room.players.add(Socket.id);
    Socket.join(RoomId);

    const ExistingPlayers = [...Room.players]
      .filter(Id => Id !== Socket.id)
      .map(Id => Players.get(Id))
      .filter(Boolean)
      .map(PublicPlayer);

    Socket.to(RoomId).emit("player:joined", PublicPlayer(Player));
    Ack({
      ok: true,
      roomId: RoomId,
      player: PublicPlayer(Player),
      players: ExistingPlayers
    });
  });

  Socket.on("movement:update", Payload => {
    const Player = Players.get(Socket.id);
    if (!Player?.roomId) return;

    const Now = Date.now();
    if (Now - Player.lastMovementAt < 30) return;
    Player.lastMovementAt = Now;

    const Movement = CleanMovement(Payload);
    if (Movement.sequence <= Player.movement.sequence && Player.movement.sequence !== 0) return;

    Player.movement = Movement;
    Socket.to(Player.roomId).volatile.emit("movement:snapshot", {
      id: Socket.id,
      ...Movement,
      serverTime: Now
    });
  });

  Socket.on("room:leave", (_Payload, Ack = () => {}) => {
    LeaveCurrentRoom(Socket);
    Ack({ ok: true });
  });

  Socket.on("ping:client", (ClientTime, Ack = () => {}) => {
    Ack({ clientTime: ClientTime, serverTime: Date.now() });
  });

  Socket.on("disconnect", () => {
    LeaveCurrentRoom(Socket);
    Players.delete(Socket.id);
  });
});

HttpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`The Infinity Store multiplayer server listening on port ${PORT}`);
});
