const Multiplayer = window.__STORE_MULTIPLAYER_R88__;
const Game = window.__STORE_GAME__;
if (!Multiplayer || !Game?.Camera || !Game?.Tasks || !Game?.ActiveChunks) throw new Error("Multiplayer and game must load before multiplayer authority.");

const TaskCounter = document.getElementById("TaskCounter");
const GameClock = document.getElementById("GameClock");
const AppliedRemoteTasks = new Set();
const SubmittedLocalTasks = new Set();
const STORE_TIME_RATE = 14;
const ROOM_TICK_MS = 180;
let RoomClockSeconds = null;
let RoomClockCapturedAt = performance.now();
let LastRoomCode = "";
let RoomTickTimer = 0;

function FormatClock(Seconds) {
  const Day = 24 * 60 * 60;
  let Value = ((Number(Seconds) || 0) % Day + Day) % Day;
  let Hours = Math.floor(Value / 3600);
  const Minutes = Math.floor((Value % 3600) / 60);
  const Suffix = Hours >= 12 ? "PM" : "AM";
  Hours %= 12;
  if (Hours === 0) Hours = 12;
  return `${Hours}:${String(Minutes).padStart(2, "0")} ${Suffix}`;
}

function ApplyTaskVisual(Task) {
  if (!Task || Task.Completed) return;
  Task.Completed = true;
  if (Task.Screen?.material) {
    Task.Screen.material = Task.Screen.material.clone();
    Task.Screen.material.color?.setHex?.(0x23522c);
    Task.Screen.material.emissive?.setHex?.(0x36d45b);
    Task.Screen.material.emissiveIntensity = 1.9;
  }
  const Chunk = Game.ActiveChunks.get(Task.ChunkIndex);
  if (Task.Type === "breaker" && Chunk) {
    for (const Light of Chunk.Lights || []) Light.userData.BaseIntensity = Math.max(Light.userData.BaseIntensity || 0, 2.0);
  }
}

function RefreshRoomClock() {
  const Room = Multiplayer.GetState().room;
  if (!Room) {
    RoomClockSeconds = null;
    LastRoomCode = "";
    return;
  }
  if (Room.code !== LastRoomCode || Number.isFinite(Number(Room.storeSeconds))) {
    LastRoomCode = Room.code;
    RoomClockSeconds = Number(Room.storeSeconds);
    RoomClockCapturedAt = performance.now();
  }
}

function ApplySharedTasks() {
  const Room = Multiplayer.GetState().room;
  if (!Room) return;
  const Completed = new Set((Room.completedTasks || []).map(String));
  const Socket = Multiplayer.GetSocket?.();

  for (const Id of Completed) {
    const Task = Game.Tasks.get(Id);
    if (Task) {
      ApplyTaskVisual(Task);
      AppliedRemoteTasks.add(Id);
    }
  }

  for (const Task of Game.Tasks.values()) {
    if (!Task?.Completed) continue;
    if (Completed.has(Task.Id) || SubmittedLocalTasks.has(Task.Id)) continue;
    if (!Socket?.connected) continue;
    SubmittedLocalTasks.add(Task.Id);
    Socket.timeout(8000).emit("task:complete", { taskId: Task.Id }, (Error, Response) => {
      if (Error || !Response?.ok) SubmittedLocalTasks.delete(Task.Id);
    });
  }

  if (TaskCounter) {
    let SharedCount = Completed.size;
    for (const Task of Game.Tasks.values()) {
      if (Task?.Completed && !Completed.has(Task.Id)) SharedCount += 1;
    }
    TaskCounter.textContent = String(SharedCount);
  }
}

function ApplyServerCorrection(Snapshot) {
  const X = Number(Snapshot?.x);
  const Z = Number(Snapshot?.z);
  if (!Number.isFinite(X) || !Number.isFinite(Z)) return;
  const DX = X - Game.Camera.position.x;
  const DZ = Z - Game.Camera.position.z;
  const Distance = Math.hypot(DX, DZ);
  if (Distance < 0.035) return;
  if (Distance < 0.22) {
    Game.Camera.position.x += DX * 0.55;
    Game.Camera.position.z += DZ * 0.55;
  } else {
    Game.Camera.position.x = X;
    Game.Camera.position.z = Z;
  }
}

function StopRoomTick() {
  if (!RoomTickTimer) return;
  clearTimeout(RoomTickTimer);
  RoomTickTimer = 0;
}

function RoomTick() {
  RoomTickTimer = 0;
  const Room = Multiplayer.GetState().room;
  if (!Room) return;
  if (RoomClockSeconds !== null && GameClock) {
    const Elapsed = Math.max(0, performance.now() - RoomClockCapturedAt) / 1000;
    GameClock.textContent = FormatClock(RoomClockSeconds + Elapsed * STORE_TIME_RATE);
  }
  ApplySharedTasks();
  RoomTickTimer = setTimeout(RoomTick, ROOM_TICK_MS);
}

function RestartRoomTick() {
  StopRoomTick();
  RefreshRoomClock();
  if (!Multiplayer.GetState().room) {
    AppliedRemoteTasks.clear();
    SubmittedLocalTasks.clear();
    return;
  }
  ApplySharedTasks();
  RoomTickTimer = setTimeout(RoomTick, ROOM_TICK_MS);
}

addEventListener("store-room-change", RestartRoomTick);
addEventListener("store-movement-correction", Event => ApplyServerCorrection(Event.detail));
addEventListener("pagehide", StopRoomTick, { once: true });

RestartRoomTick();
window.__STORE_MULTIPLAYER_AUTHORITY_R89__ = { ApplySharedTasks, ApplyServerCorrection, RefreshRoomClock, RestartRoomTick };
window.__STORE_MULTIPLAYER_AUTHORITY_BUILD__ = "V0.25.1-R89-PERF3";
