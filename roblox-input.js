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

function EnterFirstPerson(RequestLock = false) {
  const Current = CaptureKnownControls();
  OrbitHeld = false;
  Canvas.style.cursor = "none";
  if (!Current) return;
  Current.pointerSpeed = 1;
  Current.isLocked = Boolean(document.pointerLockElement);
  if (RequestLock && !document.pointerLockElement) {
    try {
      OriginalLock.call(Current);
    } catch {}
  }
}

function SyncMode(RequestFirstPersonLock = false) {
  const IsThird = ThirdPerson();
  if (IsThird) EnterThirdPerson();
  else EnterFirstPerson(RequestFirstPersonLock);
  LastThirdPerson = IsThird;
}

addEventListener("mousedown", Event => {
  if (Event.button !== 2 || !ThirdPerson()) return;
  OrbitHeld = true;
  const Current = CaptureKnownControls();
  if (Current) {
    Current.isLocked = true;
    Current.pointerSpeed = 1;
  }
  Event.preventDefault();
});

addEventListener("mouseup", Event => {
  if (Event.button !== 2) return;
  OrbitHeld = false;
  if (ThirdPerson()) {
    const Current = CaptureKnownControls();
    if (Current) {
      Current.isLocked = true;
      Current.pointerSpeed = 0;
    }
  }
});

Canvas.addEventListener("contextmenu", Event => {
  if (ThirdPerson()) Event.preventDefault();
});

addEventListener("wheel", () => {
  queueMicrotask(() => SyncMode(!ThirdPerson()));
}, { passive: true });

addEventListener("keydown", Event => {
  if (Event.code !== "KeyV" || Event.repeat) return;
  queueMicrotask(() => SyncMode(!ThirdPerson()));
});

addEventListener("pointerlockchange", () => {
  const Current = CaptureKnownControls();
  if (!Current) return;
  if (ThirdPerson()) {
    Current.isLocked = true;
    Current.pointerSpeed = OrbitHeld ? 1 : 0;
  } else {
    Current.isLocked = Boolean(document.pointerLockElement);
    Current.pointerSpeed = 1;
  }
});

function Tick() {
  const Current = CaptureKnownControls();
  const IsThird = ThirdPerson();

  if (IsThird !== LastThirdPerson) SyncMode(false);

  if (Current && IsThird) {
    Current.isLocked = true;
    Current.pointerSpeed = OrbitHeld ? 1 : 0;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  requestAnimationFrame(Tick);
}

requestAnimationFrame(Tick);
window.__STORE_ROBLOX_INPUT_BUILD__ = "V0.11-R10";
