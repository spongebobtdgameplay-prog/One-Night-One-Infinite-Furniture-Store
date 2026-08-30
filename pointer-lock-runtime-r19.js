import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Canvas = document.getElementById("GameCanvas");
const Hud = document.getElementById("Hud");

if (!Game?.Camera || !Player || !Canvas) throw new Error("Game, player, and canvas must load before pointer-lock runtime.");

function HudActive() {
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function IsFirstPerson() {
  return !Player.IsThirdPerson?.();
}

function Controls() {
  return window.__STORE_POINTER_CONTROLS__ || null;
}

function LockTarget() {
  const Control = Controls();
  return Control?.domElement || document.body;
}

function RequestFirstPersonLock() {
  if (!HudActive() || !IsFirstPerson() || document.pointerLockElement) return false;
  const Target = LockTarget();
  if (!Target?.requestPointerLock || !document.hasFocus()) return false;

  try {
    const Result = Target.requestPointerLock({ unadjustedMovement: true });
    if (Result?.catch) Result.catch(() => {
      try { Target.requestPointerLock(); } catch {}
    });
  } catch {
    try { Target.requestPointerLock(); } catch {}
  }
  return true;
}

function SyncPointerState() {
  const Control = Controls();
  const FirstPerson = IsFirstPerson();
  const Active = HudActive();

  if (Control) {
    Control.enabled = true;

    if (FirstPerson) {
      Control.isLocked = Boolean(document.pointerLockElement);
    } else {
      Control.isLocked = Active;
    }
  }

  const Cursor = FirstPerson ? "none" : "default";
  Canvas.style.cursor = Cursor;
  document.body.style.cursor = Cursor;
}

Canvas.addEventListener("pointerdown", Event => {
  if (!HudActive() || !IsFirstPerson() || document.pointerLockElement) return;
  if (Event.button !== 0 && Event.button !== 2) return;
  RequestFirstPersonLock();
}, true);

Canvas.addEventListener("click", () => {
  if (HudActive() && IsFirstPerson() && !document.pointerLockElement) RequestFirstPersonLock();
}, true);

document.addEventListener("pointerlockchange", Event => {
  if (IsFirstPerson()) Event.stopImmediatePropagation();
  SyncPointerState();
}, true);

document.addEventListener("pointerlockerror", Event => {
  if (IsFirstPerson()) Event.stopImmediatePropagation();
  SyncPointerState();
}, true);

window.addEventListener("blur", SyncPointerState, true);
document.addEventListener("visibilitychange", SyncPointerState, true);

function PointerTick() {
  SyncPointerState();
  requestAnimationFrame(PointerTick);
}

requestAnimationFrame(PointerTick);
SyncPointerState();

window.__STORE_POINTER_LOCK_RUNTIME__ = {
  RequestFirstPersonLock,
  SyncPointerState,
  IsFirstPerson
};
window.__STORE_POINTER_LOCK_RUNTIME_BUILD__ = "V0.35.1-CAMERA";
