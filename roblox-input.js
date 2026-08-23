import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Player = window.__STORE_PLAYER__;
const Canvas = document.getElementById("GameCanvas");

if (!Player || !Canvas) throw new Error("Player and canvas must exist before Roblox-style input.");

const OriginalLock = PointerLockControls.prototype.lock;
const OriginalUnlock = PointerLockControls.prototype.unlock;
let Controls = null;
let OrbitHeld = false;
let LastThirdPerson = Boolean(Player.IsThirdPerson?.());

function ThirdPerson() {
  return Boolean(window.__STORE_PLAYER__?.IsThirdPerson?.());
}

PointerLockControls.prototype.lock = function(...Args) {
  Controls = this;
  window.__STORE_POINTER_CONTROLS__ = this;

  if (ThirdPerson()) {
    this.isLocked = true;
    this.pointerSpeed = OrbitHeld ? 1 : 0;
    return;
  }

  return OriginalLock.apply(this, Args);
};

PointerLockControls.prototype.unlock = function(...Args) {
  Controls = this;
  window.__STORE_POINTER_CONTROLS__ = this;
  return OriginalUnlock.apply(this, Args);
};

function CaptureKnownControls() {
  Controls ||= window.__STORE_POINTER_CONTROLS__ || null;
  return Controls;
}

function EnterThirdPerson() {
  const Current = CaptureKnownControls();
  OrbitHeld = false;
  if (document.pointerLockElement) document.exitPointerLock();
  if (Current) {
    Current.isLocked = true;
    Current.pointerSpeed = 0;
  }
  Canvas.style.cursor = "default";
}

function EnterFirstPerson() {
  const Current = CaptureKnownControls();
  OrbitHeld = false;
  if (Current) {
    Current.isLocked = Boolean(document.pointerLockElement);
    Current.pointerSpeed = 1;
  }
  Canvas.style.cursor = document.pointerLockElement ? "none" : "crosshair";
}

function SyncMode() {
  const IsThird = ThirdPerson();
  if (IsThird) EnterThirdPerson();
  else EnterFirstPerson();
  LastThirdPerson = IsThird;
}

addEventListener("mousedown", Event => {
  const Current = CaptureKnownControls();
  if (!Current) return;

  if (ThirdPerson()) {
    if (Event.button !== 2) return;
    OrbitHeld = true;
    Current.isLocked = true;
    Current.pointerSpeed = 1;
    Event.preventDefault();
    return;
  }

  if (Event.button === 0 && !document.pointerLockElement) {
    try {
      OriginalLock.call(Current);
    } catch {}
  }
});

addEventListener("mouseup", Event => {
  if (Event.button !== 2) return;
  OrbitHeld = false;
  if (!ThirdPerson()) return;
  const Current = CaptureKnownControls();
  if (Current) {
    Current.isLocked = true;
    Current.pointerSpeed = 0;
  }
});

Canvas.addEventListener("contextmenu", Event => {
  if (ThirdPerson()) Event.preventDefault();
});

addEventListener("pointerlockchange", () => {
  const Current = CaptureKnownControls();
  if (!Current) return;

  if (ThirdPerson()) {
    Current.isLocked = true;
    Current.pointerSpeed = OrbitHeld ? 1 : 0;
    Canvas.style.cursor = "default";
  } else {
    Current.isLocked = Boolean(document.pointerLockElement);
    Current.pointerSpeed = 1;
    Canvas.style.cursor = document.pointerLockElement ? "none" : "crosshair";
  }
});

function Tick() {
  const Current = CaptureKnownControls();
  const IsThird = ThirdPerson();

  if (IsThird !== LastThirdPerson) SyncMode();

  if (Current && IsThird) {
    Current.isLocked = true;
    Current.pointerSpeed = OrbitHeld ? 1 : 0;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  requestAnimationFrame(Tick);
}

requestAnimationFrame(Tick);
window.__STORE_ROBLOX_INPUT_BUILD__ = "V0.11-R12";
