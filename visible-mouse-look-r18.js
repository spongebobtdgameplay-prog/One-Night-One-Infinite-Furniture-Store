import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Canvas = document.getElementById("GameCanvas");

if (!Game?.Camera || !Player || !Canvas) throw new Error("Game, player, and canvas must load before visible mouse look.");

const State = {
  Dragging: false,
  PointerId: null,
  LastX: 0,
  LastY: 0,
  Button: -1,
  Euler: new THREE.Euler(0, 0, 0, "YXZ")
};

const PitchLimit = Math.PI * 0.495;
const BaseSensitivity = 0.00215;
const MaxFrameDelta = 72;

function HudActive() {
  const Hud = document.getElementById("Hud");
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function IsThirdPerson() {
  return Boolean(Player.IsThirdPerson?.());
}

function Sensitivity() {
  const Value = Number(window.__STORE_USER_SETTINGS__?.Sensitivity);
  return BaseSensitivity * THREE.MathUtils.clamp(Number.isFinite(Value) ? Value : 0.92, 0.18, 2.5);
}

function Controls() {
  return window.__STORE_POINTER_CONTROLS__ || null;
}

function ForceVisibleCursor() {
  const Control = Controls();
  if (Control) {
    Control.enabled = false;
    Control.isLocked = HudActive();
  }

  if (document.pointerLockElement) {
    try { document.exitPointerLock(); } catch {}
  }
}

function RotateCamera(DeltaX, DeltaY) {
  const Camera = Game.Camera;
  if (!Camera) return;

  const DX = THREE.MathUtils.clamp(Number(DeltaX) || 0, -MaxFrameDelta, MaxFrameDelta);
  const DY = THREE.MathUtils.clamp(Number(DeltaY) || 0, -MaxFrameDelta, MaxFrameDelta);
  if (Math.abs(DX) < 0.001 && Math.abs(DY) < 0.001) return;

  const Scale = Sensitivity();
  State.Euler.setFromQuaternion(Camera.quaternion, "YXZ");
  State.Euler.y -= DX * Scale;
  State.Euler.x -= DY * Scale;
  State.Euler.x = THREE.MathUtils.clamp(State.Euler.x, -PitchLimit, PitchLimit);
  State.Euler.z = 0;
  Camera.quaternion.setFromEuler(State.Euler);
  Camera.updateMatrixWorld(true);
}

function BeginDrag(Event) {
  if (!HudActive()) return;

  const ThirdPerson = IsThirdPerson();
  const Allowed = ThirdPerson ? Event.button === 2 : (Event.button === 0 || Event.button === 2);
  if (!Allowed) return;

  State.Dragging = true;
  State.PointerId = Event.pointerId;
  State.Button = Event.button;
  State.LastX = Event.clientX;
  State.LastY = Event.clientY;

  try { Canvas.setPointerCapture(Event.pointerId); } catch {}
  Event.preventDefault();
}

function MoveDrag(Event) {
  if (!State.Dragging || Event.pointerId !== State.PointerId) return;

  let DeltaX = Event.clientX - State.LastX;
  let DeltaY = Event.clientY - State.LastY;
  if (Number.isFinite(Event.movementX) && Math.abs(Event.movementX) <= MaxFrameDelta) DeltaX = Event.movementX;
  if (Number.isFinite(Event.movementY) && Math.abs(Event.movementY) <= MaxFrameDelta) DeltaY = Event.movementY;

  State.LastX = Event.clientX;
  State.LastY = Event.clientY;
  RotateCamera(DeltaX, DeltaY);
  Event.preventDefault();
}

function EndDrag(Event = null) {
  if (!State.Dragging) return;
  const PointerId = State.PointerId;
  State.Dragging = false;
  State.PointerId = null;
  State.Button = -1;

  if (PointerId !== null) {
    try {
      if (Canvas.hasPointerCapture(PointerId)) Canvas.releasePointerCapture(PointerId);
    } catch {}
  }
  Event?.preventDefault?.();
}

const Style = document.createElement("style");
Style.id = "VisibleMouseLookR18Style";
Style.textContent = `
  #GameCanvas { cursor: default !important; }
  body { cursor: default !important; }
`;
document.head.appendChild(Style);

Canvas.addEventListener("pointerdown", BeginDrag, { capture: true });
Canvas.addEventListener("pointermove", MoveDrag, { capture: true, passive: false });
Canvas.addEventListener("pointerup", EndDrag, { capture: true });
Canvas.addEventListener("pointercancel", EndDrag, { capture: true });
Canvas.addEventListener("lostpointercapture", EndDrag, { capture: true });
Canvas.addEventListener("contextmenu", Event => {
  if (HudActive()) Event.preventDefault();
}, true);

window.addEventListener("blur", () => EndDrag());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) EndDrag();
});
document.addEventListener("pointerlockchange", ForceVisibleCursor, true);

function InputTick() {
  ForceVisibleCursor();
  requestAnimationFrame(InputTick);
}

requestAnimationFrame(InputTick);
ForceVisibleCursor();

window.__STORE_VISIBLE_MOUSE_LOOK__ = {
  IsDragging: () => State.Dragging,
  EndDrag,
  RotateCamera
};
window.__STORE_VISIBLE_MOUSE_LOOK_BUILD__ = "V0.12.17";
