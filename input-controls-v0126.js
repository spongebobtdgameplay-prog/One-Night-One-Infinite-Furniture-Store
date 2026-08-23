const Capture = window.__STORE_INPUT_LISTENER_CAPTURE__;
const Player = () => window.__STORE_PLAYER__ || null;
const Controls = () => window.__STORE_POINTER_CONTROLS__ || null;
const Canvas = document.getElementById("GameCanvas");
const Crosshair = document.querySelector(".Crosshair");

const Style = document.createElement("style");
Style.textContent = `
  body.StoreNeedsMouseCapture,
  body.StoreNeedsMouseCapture #GameCanvas { cursor: crosshair !important; }
  #MouseCaptureHintV0126 {
    position: fixed;
    left: 50%;
    bottom: 76px;
    z-index: 55;
    transform: translateX(-50%);
    padding: 7px 10px;
    border: 1px solid rgba(255,255,255,.42);
    background: rgba(5,6,7,.76);
    color: rgba(255,255,255,.88);
    font: 800 .58rem ui-monospace,SFMono-Regular,Consolas,monospace;
    letter-spacing: .11em;
    pointer-events: none;
    opacity: 0;
    transition: opacity .12s ease;
  }
  body.StoreNeedsMouseCapture #MouseCaptureHintV0126 { opacity: 1; }
`;
document.head.appendChild(Style);

const Hint = document.createElement("div");
Hint.id = "MouseCaptureHintV0126";
Hint.textContent = "CLICK TO CAPTURE FIRST-PERSON LOOK";
document.body.appendChild(Hint);

function HudActive() {
  const Hud = document.getElementById("Hud");
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function IsFirstPerson() {
  return Player()?.IsThirdPerson?.() === false;
}

function NativePointerLocked() {
  return Boolean(document.pointerLockElement);
}

function Sensitivity() {
  const Value = Number(window.__STORE_USER_SETTINGS__?.Sensitivity);
  return Number.isFinite(Value) ? Math.min(2, Math.max(0.35, Value)) : 0.92;
}

function RequestFirstPersonPointerLock() {
  if (!HudActive() || !IsFirstPerson() || NativePointerLocked()) return;
  const CurrentControls = Controls();
  if (!CurrentControls) return;
  try {
    const Result = CurrentControls.lock();
    if (Result && typeof Result.catch === "function") Result.catch(() => queueMicrotask(UpdateCaptureState));
  } catch {
    queueMicrotask(UpdateCaptureState);
  }
}

function UpdateCaptureState() {
  const CurrentControls = Controls();
  const FirstPerson = IsFirstPerson();
  const Locked = NativePointerLocked();
  const NeedsCapture = HudActive() && FirstPerson && !Locked;

  document.body.classList.toggle("StoreNeedsMouseCapture", NeedsCapture);

  if (CurrentControls) {
    if (FirstPerson) {
      CurrentControls.isLocked = Locked;
      CurrentControls.pointerSpeed = Sensitivity();
    } else if (CurrentControls.pointerSpeed > 0) {
      CurrentControls.pointerSpeed = Sensitivity();
    }
  }

  if (Canvas && FirstPerson) Canvas.style.cursor = Locked ? "none" : "crosshair";
  if (Crosshair && FirstPerson) Crosshair.style.display = "block";
}

if (Capture?.WheelListeners?.length) {
  for (const Entry of Capture.WheelListeners) {
    window.removeEventListener("wheel", Entry.Listener, Entry.Options);
  }

  const PlayerWheel = Capture.WheelListeners[Capture.WheelListeners.length - 1];
  window.addEventListener("wheel", Event => {
    PlayerWheel.Listener.call(window, Event);
    if (IsFirstPerson() && !NativePointerLocked()) RequestFirstPersonPointerLock();
    queueMicrotask(UpdateCaptureState);
  }, PlayerWheel.Options);
}

Capture?.Restore?.();

addEventListener("mousedown", Event => {
  if (Event.button !== 0 || !IsFirstPerson() || NativePointerLocked()) return;
  RequestFirstPersonPointerLock();
}, true);

addEventListener("pointerlockchange", () => queueMicrotask(UpdateCaptureState));
addEventListener("pointerlockerror", () => queueMicrotask(UpdateCaptureState));
addEventListener("store-settings-change", UpdateCaptureState);

function InputTick() {
  UpdateCaptureState();
  requestAnimationFrame(InputTick);
}

requestAnimationFrame(InputTick);
UpdateCaptureState();

window.__STORE_INPUT_CONTROLS_BUILD__ = "V0.12.6";
