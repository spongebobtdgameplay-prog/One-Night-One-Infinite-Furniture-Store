import http from "node:http";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import argon2 from "argon2";
import pg from "pg";
import { Server as SocketIOServer } from "socket.io";

const { Pool } = pg;

const PORT = Number(process.env.PORT) || 3000;
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const NODE_ENV = String(process.env.NODE_ENV || "development");
const SERVER_VERSION = "0.3.1";
const ROOM_MIN_PLAYERS = 2;
const ROOM_MAX_PLAYERS = 6;
const WORLD_SEED = 1000;
const STORE_START_SECONDS = 23 * 60 * 60 + 57 * 60;
const STORE_TIME_RATE = 14;
const SESSION_DAYS = 180;
const SESSION_TOUCH_MS = 5 * 60 * 1000;
const MOVEMENT_MIN_INTERVAL_MS = 35;
const MOVEMENT_MAX_SPEED = 8.25;
const MOVEMENT_BASE_ALLOWANCE = 0.42;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Add the Render Postgres Internal Database URL to the web service environment.");
}

const DEFAULT_ORIGINS = [
  "https://spongebobtdgameplay-prog.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];
const ConfiguredOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(Value => Value.trim())
  .filter(Boolean);
const CLIENT_ORIGINS = new Set([...DEFAULT_ORIGINS, ...ConfiguredOrigins]);

function OriginAllowed(Origin) {
  if (!Origin) return true;
  return CLIENT_ORIGINS.has(Origin);
}

function ShouldUseSSL() {
  if (/^(postgres|postgresql):\/\/(localhost|127\.0\.0\.1)/i.test(DATABASE_URL)) return false;
  if (process.env.PGSSL === "false") return false;
  if (process.env.PGSSL === "true") return true;
  return /[?&]sslmode=(require|verify-ca|verify-full)/i.test(DATABASE_URL);
}

const Database = new Pool({
  connectionString: DATABASE_URL,
  ssl: ShouldUseSSL() ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: false
});

Database.on("error", Error => console.error("Postgres pool error", Error));

async function InitializeDatabase() {
  await Database.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username VARCHAR(20) NOT NULL,
      username_key VARCHAR(20) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      disabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `);
  await Database.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      user_agent VARCHAR(256)
    )
  `);
  await Database.query(`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`);
  await Database.query(`CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)`);
  await Database.query(`
    CREATE TABLE IF NOT EXISTS player_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      games_played INTEGER NOT NULL DEFAULT 0,
      tasks_completed INTEGER NOT NULL DEFAULT 0,
      best_aisle INTEGER NOT NULL DEFAULT 0,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await Database.query("DELETE FROM sessions WHERE expires_at <= NOW()");
}

function NormalizeUsername(Value) {
  return String(Value || "").trim();
}

function UsernameKey(Value) {
  return NormalizeUsername(Value).toLowerCase();
}

function ValidateUsername(Value) {
  const Username = NormalizeUsername(Value);
  if (Username.length < 3 || Username.length > 20) return "USERNAME_LENGTH";
  if (!/^[A-Za-z0-9_]+$/.test(Username)) return "USERNAME_CHARACTERS";
  return "";
}

function ValidatePassword(Value) {
  const Password = String(Value || "");
  if (Password.length < 8) return "PASSWORD_TOO_SHORT";
  if (Password.length > 20) return "PASSWORD_TOO_LONG";
  if (!/^[\x20-\x7E]+$/.test(Password)) return "PASSWORD_ASCII_ONLY";
  return "";
}

function SessionTokenHash(Token) {
  return crypto.createHash("sha256").update(String(Token || "")).digest("hex");
}

function NewSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function PublicAccount(Row) {
  return { id: Row.id, username: Row.username, createdAt: Row.created_at };
}

async function CreateSession(UserId, UserAgent = "") {
  const Token = NewSessionToken();
  const TokenHash = SessionTokenHash(Token);
  const SessionId = crypto.randomUUID();
  const ExpiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await Database.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent) VALUES ($1, $2, $3, $4, $5)`,
    [SessionId, UserId, TokenHash, ExpiresAt, String(UserAgent || "").slice(0, 256)]
  );
  await Database.query(
    `DELETE FROM sessions WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 8
     )`,
    [UserId]
  );
  return { Token, ExpiresAt };
}

async function AccountFromToken(Token, Touch = true) {
  if (!Token || String(Token).length < 20) return null;
  const Result = await Database.query(
    `SELECT u.id, u.username, u.created_at, s.id AS session_id, s.last_seen_at, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.disabled = FALSE LIMIT 1`,
    [SessionTokenHash(Token)]
  );
  const Row = Result.rows[0];
  if (!Row) return null;
  let ExpiresAt = Row.expires_at;
  if (Touch && (!Row.last_seen_at || Date.now() - new Date(Row.last_seen_at).getTime() > SESSION_TOUCH_MS)) {
    ExpiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await Database.query(
      "UPDATE sessions SET last_seen_at = NOW(), expires_at = $2 WHERE id = $1",
      [Row.session_id, ExpiresAt]
    );
  }
  return {
    id: Row.id,
    username: Row.username,
    createdAt: Row.created_at,
    sessionId: Row.session_id,
    expiresAt: ExpiresAt
  };
}

function BearerToken(Request) {
  const Header = String(Request.headers.authorization || "");
  return Header.startsWith("Bearer ") ? Header.slice(7).trim() : "";
}

async function RequireAccount(Request, Response, Next) {
  try {
    const Account = await AccountFromToken(BearerToken(Request));
    if (!Account) return Response.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
    Request.account = Account;
    return Next();
  } catch (Error) {
    console.error("Auth middleware failed", Error);
    return Response.status(503).json({ ok: false, error: "DATABASE_UNAVAILABLE" });
  }
}

const App = express();
App.set("trust proxy", 1);
App.disable("x-powered-by");
App.use(helmet({ crossOriginResourcePolicy: false }));
App.use(express.json({ limit: "32kb" }));
App.use(cors({
  origin(Origin, Callback) {
    if (OriginAllowed(Origin)) return Callback(null, true);
    return Callback(new Error("Origin not allowed"));
  },
  credentials: false,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

const AuthLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_ATTEMPTS" }
});

App.get("/", (_Request, Response) => {
  Response.json({ service: "The Infinity Store multiplayer server", status: "online", version: SERVER_VERSION });
});

App.get("/health", async (_Request, Response) => {
  try {
    await Database.query("SELECT 1");
    Response.status(200).json({
      ok: true,
      version: SERVER_VERSION,
      uptime: Math.floor(process.uptime()),
      database: true,
      sockets: IO.engine.clientsCount,
      rooms: Rooms.size
    });
  } catch {
    Response.status(503).json({ ok: false, version: SERVER_VERSION, database: false });
  }
});

App.post("/api/auth/register", AuthLimiter, async (Request, Response) => {
  const Username = NormalizeUsername(Request.body?.username);
  const Password = String(Request.body?.password || "");
  const ConfirmPassword = String(Request.body?.confirmPassword || "");
  const UsernameError = ValidateUsername(Username);
  const PasswordError = ValidatePassword(Password);
  if (UsernameError) return Response.status(400).json({ ok: false, error: UsernameError });
  if (PasswordError) return Response.status(400).json({ ok: false, error: PasswordError });
  if (Password !== ConfirmPassword) return Response.status(400).json({ ok: false, error: "PASSWORDS_DO_NOT_MATCH" });

  try {
    const UserId = crypto.randomUUID();
    const PasswordHash = await argon2.hash(Password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32
    });
    const Client = await Database.connect();
    try {
      await Client.query("BEGIN");
      await Client.query(
        `INSERT INTO users (id, username, username_key, password_hash, last_login_at) VALUES ($1, $2, $3, $4, NOW())`,
        [UserId, Username, UsernameKey(Username), PasswordHash]
      );
      await Client.query("INSERT INTO player_profiles (user_id) VALUES ($1)", [UserId]);
      await Client.query("COMMIT");
    } catch (Error) {
      await Client.query("ROLLBACK");
      throw Error;
    } finally {
      Client.release();
    }
    const Session = await CreateSession(UserId, Request.headers["user-agent"]);
    return Response.status(201).json({
      ok: true,
      token: Session.Token,
      expiresAt: Session.ExpiresAt,
      account: { id: UserId, username: Username, createdAt: new Date().toISOString() }
    });
  } catch (Error) {
    if (Error?.code === "23505") return Response.status(409).json({ ok: false, error: "USERNAME_TAKEN" });
    console.error("Registration failed", Error);
    return Response.status(500).json({ ok: false, error: "REGISTER_FAILED" });
  }
});

App.post("/api/auth/login", AuthLimiter, async (Request, Response) => {
  const Username = NormalizeUsername(Request.body?.username);
  const Password = String(Request.body?.password || "");
  if (!Username || !Password) return Response.status(400).json({ ok: false, error: "MISSING_CREDENTIALS" });
  const PasswordError = ValidatePassword(Password);
  if (PasswordError) return Response.status(400).json({ ok: false, error: PasswordError });

  try {
    const Result = await Database.query(
      `SELECT id, username, username_key, password_hash, created_at, disabled FROM users WHERE username_key = $1 LIMIT 1`,
      [UsernameKey(Username)]
    );
    const Row = Result.rows[0];
    if (!Row || Row.disabled) return Response.status(401).json({ ok: false, error: "INVALID_LOGIN" });
    if (!await argon2.verify(Row.password_hash, Password)) return Response.status(401).json({ ok: false, error: "INVALID_LOGIN" });
    await Database.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [Row.id]);
    const Session = await CreateSession(Row.id, Request.headers["user-agent"]);
    return Response.json({ ok: true, token: Session.Token, expiresAt: Session.ExpiresAt, account: PublicAccount(Row) });
  } catch (Error) {
    console.error("Login failed", Error);
    return Response.status(500).json({ ok: false, error: "LOGIN_FAILED" });
  }
});

App.get("/api/auth/me", RequireAccount, async (Request, Response) => {
  try {
    const ProfileResult = await Database.query(
      "SELECT games_played, tasks_completed, best_aisle, settings FROM player_profiles WHERE user_id = $1",
      [Request.account.id]
    );
    return Response.json({
      ok: true,
      account: { id: Request.account.id, username: Request.account.username, createdAt: Request.account.createdAt },
      profile: ProfileResult.rows[0] || { games_played: 0, tasks_completed: 0, best_aisle: 0, settings: {} }
    });
  } catch (Error) {
    console.error("Profile lookup failed", Error);
    return Response.status(500).json({ ok: false, error: "PROFILE_FAILED" });
  }
});

App.post("/api/auth/logout", RequireAccount, async (Request, Response) => {
  try {
    await Database.query("DELETE FROM sessions WHERE id = $1", [Request.account.sessionId]);
    return Response.json({ ok: true });
  } catch (Error) {
    console.error("Logout failed", Error);
    return Response.status(500).json({ ok: false, error: "LOGOUT_FAILED" });
  }
});

const HttpServer = http.createServer(App);
const IO = new SocketIOServer(HttpServer, {
  cors: {
    origin(Origin, Callback) {
      if (OriginAllowed(Origin)) return Callback(null, true);
      return Callback(new Error("Origin not allowed"));
    },
    methods: ["GET", "POST"],
    credentials: false
  },
  transports: ["websocket", "polling"],
  allowUpgrades: true,
  pingInterval: 20_000,
  pingTimeout: 15_000,
  maxHttpBufferSize: 64 * 1024,
  perMessageDeflate: false,
  connectionStateRecovery: { maxDisconnectionDuration: 120_000, skipMiddlewares: false }
});

const Rooms = new Map();
const SocketPlayers = new Map();

function ClampInteger(Value, Min, Max, Fallback) {
  const Parsed = Math.floor(Number(Value));
  return Number.isFinite(Parsed) ? Math.min(Max, Math.max(Min, Parsed)) : Fallback;
}

function CleanRoomCode(Value) {
  return String(Value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function GenerateRoomCode() {
  for (let Attempt = 0; Attempt < 100; Attempt += 1) {
    let Code = "";
    for (let Index = 0; Index < 6; Index += 1) Code += ROOM_CODE_ALPHABET[crypto.randomInt(0, ROOM_CODE_ALPHABET.length)];
    if (!Rooms.has(Code)) return Code;
  }
  return Date.now().toString(36).toUpperCase().slice(-8);
}

function CreateRoom(HostAccount, Options = {}) {
  const Room = {
    code: GenerateRoomCode(),
    public: Options.public !== false,
    allowLateJoin: Options.allowLateJoin !== false,
    hostUserId: HostAccount.id,
    seed: WORLD_SEED,
    maxPlayers: ClampInteger(Options.maxPlayers, ROOM_MIN_PLAYERS, ROOM_MAX_PLAYERS, 4),
    createdAt: Date.now(),
    started: false,
    startedAt: null,
    players: new Map(),
    completedTasks: new Set()
  };
  Rooms.set(Room.code, Room);
  return Room;
}

function RoomStoreSeconds(Room, Now = Date.now()) {
  if (!Room.started || !Room.startedAt) return STORE_START_SECONDS;
  const Elapsed = Math.max(0, Now - Room.startedAt) / 1000;
  return (STORE_START_SECONDS + Elapsed * STORE_TIME_RATE) % (24 * 60 * 60);
}

function PublicMovement(Movement) {
  return {
    x: Movement.x, y: Movement.y, z: Movement.z,
    yaw: Movement.yaw, pitch: Movement.pitch,
    animation: Movement.animation, sprinting: Movement.sprinting,
    sequence: Movement.sequence, serverTime: Movement.serverTime
  };
}

function PublicPlayer(Player) {
  return {
    id: Player.socketId,
    userId: Player.userId,
    name: Player.name,
    joinedAt: Player.joinedAt,
    movement: PublicMovement(Player.movement)
  };
}

function PublicRoom(Room) {
  return {
    code: Room.code,
    public: Room.public,
    allowLateJoin: Room.allowLateJoin,
    hostUserId: Room.hostUserId,
    seed: Room.seed,
    maxPlayers: Room.maxPlayers,
    playerCount: Room.players.size,
    minPlayersToStart: ROOM_MIN_PLAYERS,
    started: Room.started,
    startedAt: Room.startedAt,
    storeSeconds: RoomStoreSeconds(Room),
    completedTasks: [...Room.completedTasks]
  };
}

function DefaultMovement() {
  return {
    x: 0, y: 1.68, z: 8,
    yaw: Math.PI, pitch: 0,
    animation: "idle", sprinting: false,
    sequence: 0, serverTime: Date.now()
  };
}

function PlayerRecord(Socket, Room) {
  const Account = Socket.data.account;
  return {
    socketId: Socket.id,
    userId: Account.id,
    name: Account.username,
    roomCode: Room.code,
    joinedAt: Date.now(),
    movement: DefaultMovement(),
    lastMovementPacketAt: 0,
    lastAcceptedMovementAt: 0
  };
}

function ReassignHost(Room) {
  if (!Room || Room.players.size === 0) return;
  if ([...Room.players.values()].some(Player => Player.userId === Room.hostUserId)) return;
  const Next = [...Room.players.values()].sort((A, B) => A.joinedAt - B.joinedAt)[0];
  Room.hostUserId = Next.userId;
  IO.to(Room.code).emit("room:host", { hostUserId: Room.hostUserId });
}

function EmitRoomSync(Room) {
  if (!Room) return;
  IO.to(Room.code).emit("room:sync", {
    room: PublicRoom(Room),
    players: [...Room.players.values()].map(PublicPlayer),
    serverTime: Date.now()
  });
}

function LeaveCurrentRoom(Socket, Emit = true) {
  const Player = SocketPlayers.get(Socket.id);
  if (!Player?.roomCode) return;
  const Room = Rooms.get(Player.roomCode);
  const RoomCode = Player.roomCode;
  if (Room) {
    Room.players.delete(Socket.id);
    if (Emit) Socket.to(RoomCode).emit("player:left", { id: Socket.id, userId: Player.userId });
    if (Room.players.size === 0) Rooms.delete(RoomCode);
    else {
      ReassignHost(Room);
      EmitRoomSync(Room);
    }
  }
  Socket.leave(RoomCode);
  SocketPlayers.delete(Socket.id);
}

function RoomJoinError(Room) {
  if (!Room) return "ROOM_NOT_FOUND";
  if (Room.players.size >= Room.maxPlayers) return "ROOM_FULL";
  if (Room.started && !Room.allowLateJoin) return "LATE_JOIN_DISABLED";
  return "";
}

function JoinRoom(Socket, Room) {
  const JoinError = RoomJoinError(Room);
  if (JoinError) return { ok: false, error: JoinError };
  const Existing = SocketPlayers.get(Socket.id);
  if (Existing?.roomCode === Room.code) {
    return {
      ok: true,
      room: PublicRoom(Room),
      player: PublicPlayer(Existing),
      players: [...Room.players.values()].filter(Player => Player.socketId !== Socket.id).map(PublicPlayer)
    };
  }
  if (Existing) LeaveCurrentRoom(Socket);

  const Player = PlayerRecord(Socket, Room);
  Room.players.set(Socket.id, Player);
  SocketPlayers.set(Socket.id, Player);
  Socket.join(Room.code);
  Socket.to(Room.code).emit("player:joined", PublicPlayer(Player));
  EmitRoomSync(Room);

  return {
    ok: true,
    room: PublicRoom(Room),
    player: PublicPlayer(Player),
    players: [...Room.players.values()].filter(Other => Other.socketId !== Socket.id).map(PublicPlayer)
  };
}

function QuickJoinRoom(Socket) {
  const Candidate = [...Rooms.values()]
    .filter(Room => Room.public && !RoomJoinError(Room))
    .sort((A, B) => Number(A.started) - Number(B.started) || B.players.size - A.players.size || A.createdAt - B.createdAt)[0];
  if (!Candidate) return { ok: false, error: "NO_PUBLIC_SERVERS" };
  return JoinRoom(Socket, Candidate);
}

function CleanFinite(Value, Fallback = 0) {
  const NumberValue = Number(Value);
  return Number.isFinite(NumberValue) ? NumberValue : Fallback;
}

function Clamp(Value, Min, Max) {
  return Math.min(Max, Math.max(Min, Value));
}

function NormalizeAngle(Value) {
  return Math.atan2(Math.sin(Value), Math.cos(Value));
}

function CleanMovement(Payload = {}) {
  const Animation = ["idle", "walk", "sprint"].includes(Payload.animation) ? Payload.animation : "idle";
  return {
    x: CleanFinite(Payload.x),
    y: Clamp(CleanFinite(Payload.y, 1.68), 0.25, 3.6),
    z: CleanFinite(Payload.z, 8),
    yaw: NormalizeAngle(CleanFinite(Payload.yaw)),
    pitch: Clamp(CleanFinite(Payload.pitch), -1.45, 1.45),
    animation: Animation,
    sprinting: Boolean(Payload.sprinting) && Animation === "sprint",
    sequence: Math.max(0, Math.floor(CleanFinite(Payload.sequence))),
    serverTime: Date.now()
  };
}

function MovementValid(Player, Next, Now) {
  if (Math.abs(Next.x) > 16.75) return false;
  if (Math.abs(Next.z) > 1_000_000) return false;
  if (Player.movement.sequence === 0) return true;
  const DeltaSeconds = Math.max(0.001, (Now - Player.lastAcceptedMovementAt) / 1000);
  const Distance = Math.hypot(Next.x - Player.movement.x, Next.z - Player.movement.z);
  return Distance <= MOVEMENT_BASE_ALLOWANCE + MOVEMENT_MAX_SPEED * DeltaSeconds;
}

function ValidTaskId(Value) {
  const Text = String(Value || "");
  return /^Chunk-[1-9]\d*:(breaker|manifest|scanner)$/.test(Text) ? Text : "";
}

IO.use(async (Socket, Next) => {
  try {
    const Token = String(Socket.handshake.auth?.token || "");
    const Account = await AccountFromToken(Token);
    if (!Account) return Next(new Error("AUTH_REQUIRED"));
    Socket.data.account = Account;
    Socket.data.sessionToken = Token;
    return Next();
  } catch (Error) {
    console.error("Socket authentication failed", Error);
    return Next(new Error("AUTH_UNAVAILABLE"));
  }
});

IO.on("connection", Socket => {
  const Account = Socket.data.account;
  Socket.emit("server:ready", {
    id: Socket.id,
    userId: Account.id,
    name: Account.username,
    version: SERVER_VERSION,
    transport: Socket.conn.transport.name,
    recovered: Socket.recovered
  });

  Socket.on("room:quickJoin", (_Payload = {}, Ack = () => {}) => Ack(QuickJoinRoom(Socket)));

  Socket.on("room:create", (Payload = {}, Ack = () => {}) => {
    const Room = CreateRoom(Account, {
      maxPlayers: Payload.maxPlayers,
      allowLateJoin: Boolean(Payload.allowLateJoin),
      public: Payload.public !== false
    });
    Ack(JoinRoom(Socket, Room));
  });

  Socket.on("room:join", (Payload = {}, Ack = () => {}) => {
    const Code = CleanRoomCode(Payload.code);
    if (!Code) return Ack({ ok: false, error: "ROOM_CODE_REQUIRED" });
    return Ack(JoinRoom(Socket, Rooms.get(Code)));
  });

  Socket.on("room:updateSettings", (Payload = {}, Ack = () => {}) => {
    const Player = SocketPlayers.get(Socket.id);
    const Room = Player ? Rooms.get(Player.roomCode) : null;
    if (!Player || !Room) return Ack({ ok: false, error: "NOT_IN_ROOM" });
    if (Room.hostUserId !== Account.id) return Ack({ ok: false, error: "HOST_ONLY" });
    if (Room.started) return Ack({ ok: false, error: "GAME_ALREADY_STARTED" });
    const NextMax = ClampInteger(Payload.maxPlayers, ROOM_MIN_PLAYERS, ROOM_MAX_PLAYERS, Room.maxPlayers);
    if (NextMax < Room.players.size) return Ack({ ok: false, error: "MAX_BELOW_PLAYER_COUNT" });
    Room.maxPlayers = NextMax;
    Room.allowLateJoin = Boolean(Payload.allowLateJoin);
    Room.public = Boolean(Payload.public);
    EmitRoomSync(Room);
    return Ack({ ok: true, room: PublicRoom(Room) });
  });

  Socket.on("room:start", (_Payload = {}, Ack = () => {}) => {
    const Player = SocketPlayers.get(Socket.id);
    const Room = Player ? Rooms.get(Player.roomCode) : null;
    if (!Player || !Room) return Ack({ ok: false, error: "NOT_IN_ROOM" });
    if (Room.hostUserId !== Account.id) return Ack({ ok: false, error: "HOST_ONLY" });
    if (Room.started) return Ack({ ok: true, alreadyStarted: true, room: PublicRoom(Room) });
    if (Room.players.size < ROOM_MIN_PLAYERS) return Ack({ ok: false, error: "NEED_MORE_PLAYERS", required: ROOM_MIN_PLAYERS });
    Room.started = true;
    Room.startedAt = Date.now();
    for (const Member of Room.players.values()) {
      Database.query(
        `UPDATE player_profiles SET games_played = games_played + 1, updated_at = NOW() WHERE user_id = $1`,
        [Member.userId]
      ).catch(() => {});
    }
    const Public = PublicRoom(Room);
    IO.to(Room.code).emit("room:started", { room: Public, serverTime: Date.now() });
    EmitRoomSync(Room);
    return Ack({ ok: true, room: Public });
  });

  Socket.on("room:leave", (_Payload = {}, Ack = () => {}) => {
    LeaveCurrentRoom(Socket);
    Ack({ ok: true });
  });

  Socket.on("movement:update", Payload => {
    const Player = SocketPlayers.get(Socket.id);
    const Room = Player ? Rooms.get(Player.roomCode) : null;
    if (!Player || !Room?.started) return;
    const Now = Date.now();
    if (Now - Player.lastMovementPacketAt < MOVEMENT_MIN_INTERVAL_MS) return;
    Player.lastMovementPacketAt = Now;
    const Next = CleanMovement(Payload);
    if (Next.sequence <= Player.movement.sequence && Player.movement.sequence !== 0) return;
    if (!MovementValid(Player, Next, Now)) {
      Socket.emit("movement:correction", PublicMovement(Player.movement));
      return;
    }
    Player.movement = Next;
    Player.lastAcceptedMovementAt = Now;
    Socket.to(Room.code).volatile.emit("movement:snapshot", {
      id: Socket.id,
      userId: Player.userId,
      ...PublicMovement(Next)
    });
  });

  Socket.on("task:complete", (Payload = {}, Ack = () => {}) => {
    const Player = SocketPlayers.get(Socket.id);
    const Room = Player ? Rooms.get(Player.roomCode) : null;
    if (!Player || !Room) return Ack({ ok: false, error: "NOT_IN_ROOM" });
    if (!Room.started) return Ack({ ok: false, error: "GAME_NOT_STARTED" });
    const TaskId = ValidTaskId(Payload.taskId);
    if (!TaskId) return Ack({ ok: false, error: "INVALID_TASK" });
    if (Room.completedTasks.has(TaskId)) return Ack({ ok: true, alreadyCompleted: true });
    Room.completedTasks.add(TaskId);
    IO.to(Room.code).emit("task:completed", {
      taskId: TaskId,
      userId: Player.userId,
      name: Player.name,
      serverTime: Date.now()
    });
    Database.query(
      `UPDATE player_profiles SET tasks_completed = tasks_completed + 1, updated_at = NOW() WHERE user_id = $1`,
      [Player.userId]
    ).catch(() => {});
    return Ack({ ok: true });
  });

  Socket.on("profile:aisle", Payload => {
    const Player = SocketPlayers.get(Socket.id);
    const Room = Player ? Rooms.get(Player.roomCode) : null;
    if (!Room?.started) return;
    const Aisle = Math.max(0, Math.min(1_000_000, Math.floor(CleanFinite(Payload?.aisle))));
    if (!Aisle) return;
    Database.query(
      `UPDATE player_profiles SET best_aisle = GREATEST(best_aisle, $2), updated_at = NOW() WHERE user_id = $1`,
      [Account.id, Aisle]
    ).catch(() => {});
  });

  Socket.on("ping:client", (ClientTime, Ack = () => {}) => {
    Ack({ clientTime: CleanFinite(ClientTime), serverTime: Date.now() });
  });

  Socket.on("disconnect", () => LeaveCurrentRoom(Socket));
});

App.get("/api/rooms", RequireAccount, (_Request, Response) => {
  const RoomsList = [...Rooms.values()]
    .filter(Room => Room.public && !RoomJoinError(Room))
    .map(Room => ({
      code: Room.code,
      players: Room.players.size,
      maxPlayers: Room.maxPlayers,
      started: Room.started,
      allowLateJoin: Room.allowLateJoin
    }));
  Response.json({ ok: true, count: RoomsList.length, rooms: RoomsList });
});

const SyncInterval = setInterval(() => {
  for (const Room of Rooms.values()) EmitRoomSync(Room);
}, 2000);
SyncInterval.unref?.();

const SessionCleanupInterval = setInterval(() => {
  Database.query("DELETE FROM sessions WHERE expires_at <= NOW()").catch(() => {});
}, 60 * 60 * 1000);
SessionCleanupInterval.unref?.();

await InitializeDatabase();

HttpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`The Infinity Store server v${SERVER_VERSION} listening on port ${PORT} (${NODE_ENV})`);
});

async function Shutdown(Signal) {
  console.log(`${Signal} received; shutting down.`);
  clearInterval(SyncInterval);
  clearInterval(SessionCleanupInterval);
  IO.close();
  HttpServer.close(async () => {
    try { await Database.end(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => Shutdown("SIGTERM"));
process.on("SIGINT", () => Shutdown("SIGINT"));