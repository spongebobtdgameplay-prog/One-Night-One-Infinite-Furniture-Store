const Multiplayer = window.__STORE_MULTIPLAYER_R88__;
const Game = window.__STORE_GAME__;
if (!Multiplayer || !Game?.Camera || !Game?.Tasks || !Game?.ActiveChunks) throw new Error("Multiplayer and game must load before R98 multiplayer authority.");

const TaskCounter = document.getElementById("TaskCounter");
const GameClock = document.getElementById("GameClock");
const AppliedRemoteTasks = new Set();
const SubmittedLocalTasks = new Set();
const STORE_TIME_RATE = 14;
let RoomClockSeconds = null;
let RoomClockCapturedAt = performance.now();

function FormatClock(Seconds) {
  const Day = 86400;
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
}

function RefreshRoomClock() {
  const Room = Multiplayer.GetState().room;
  if (!Room?.started) {
    RoomClockSeconds = null;
    return;
  }
  RoomClockSeconds = Number(Room.storeSeconds);
  RoomClockCapturedAt = performance.now();
}

function ApplySharedTasks() {
  const Room = Multiplayer.GetState().room;
  if (!Room?.started) return;
  const Completed = new Set((Room.completedTasks || []).map(String));
  const Socket = Multiplayer.GetSocket?.();

  for (const Id of Completed) {
    const Task = Game.Tasks.get(Id);
    if (Task && !AppliedRemoteTasks.has(Id)) {
      ApplyTaskVisual(Task);
      AppliedRemoteTasks.add(Id);
    }
  }

  for (const Task of Game.Tasks.values()) {
    if (!Task?.Completed || Completed.has(Task.Id) || SubmittedLocalTasks.has(Task.Id) || !Socket?.connected) continue;
    SubmittedLocalTasks.add(Task.Id);
    Socket.timeout(6000).emit("task:complete", { taskId: Task.Id }, (Error, Response) => {
      if (Error || !Response?.ok) SubmittedLocalTasks.delete(Task.Id);
    });
  }

  if (TaskCounter) {
    let SharedCount = Completed.size;
    for (const Task of Game.Tasks.values()) if (Task?.Completed && !Completed.has(Task.Id)) SharedCount += 1;
    const Text = String(SharedCount);
    if (TaskCounter.textContent !== Text) TaskCounter.textContent = Text;
  }
}

function ApplyServerCorrection(Snapshot) {
  if (!Multiplayer.GetState().room?.started) return;
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

function Tick() {
  const Room = Multiplayer.GetState().room;
  if (!Room?.started || document.hidden || window.__STORE_UI_MODAL_OPEN_R98__) return;
  if (RoomClockSeconds !== null && GameClock) {
    const Elapsed = Math.max(0, performance.now() - RoomClockCapturedAt) / 1000;
    const Text = FormatClock(RoomClockSeconds + Elapsed * STORE_TIME_RATE);
    if (GameClock.textContent !== Text) GameClock.textContent = Text;
  }
  ApplySharedTasks();
}

function OnRoomChange() {
  RefreshRoomClock();
  const Room = Multiplayer.GetState().room;
  if (!Room?.started) {
    AppliedRemoteTasks.clear();
    SubmittedLocalTasks.clear();
    return;
  }
  ApplySharedTasks();
}

addEventListener("store-room-change", OnRoomChange);
addEventListener("store-multiplayer-start", OnRoomChange);
addEventListener("store-movement-correction", Event => ApplyServerCorrection(Event.detail));
const Timer = setInterval(Tick, 250);
addEventListener("pagehide", () => clearInterval(Timer), { once: true });
RefreshRoomClock();

window.__STORE_MULTIPLAYER_AUTHORITY_R89__ = { ApplySharedTasks, ApplyServerCorrection, RefreshRoomClock };
window.__STORE_MULTIPLAYER_AUTHORITY_R98__ = window.__STORE_MULTIPLAYER_AUTHORITY_R89__;
window.__STORE_MULTIPLAYER_AUTHORITY_BUILD__ = "V0.30.5-R98";
