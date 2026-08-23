import * as THREE from "three";

const State = {
  OrbitHeld: false,
  HasAngles: false,
  TargetYaw: 0,
  TargetPitch: 0,
  CurrentYaw: 0,
  CurrentPitch: 0,
  LastTime: performance.now(),
  Euler: new THREE.Euler(0, 0, 0, "YXZ"),
  Quaternion: new THREE.Quaternion()
};

function Settings() {
  return window.__STORE_USER_SETTINGS__ || { Sensitivity: 0.92, TrackpadSmoothing: 64 };
}

function Player() {
  return window.__STORE_PLAYER__ || null;
}

function Game() {
  return window.__STORE_GAME__ || null;
}

function ReadCameraAngles() {
  const Camera = Game()?.Camera;
  if (!Camera) return false;
  State.Euler.setFromQuaternion(Camera.quaternion, "YXZ");
  State.CurrentPitch = State.Euler.x;
  State.CurrentYaw = State.Euler.y;
  State.TargetPitch = State.CurrentPitch;
  State.TargetYaw = State.CurrentYaw;
  State.HasAngles = true;
  return true;
}

function NormalizeAngle(Value) {
  return Math.atan2(Math.sin(Value), Math.cos(Value));
}

function SmoothAngle(Current, Target, Alpha) {
  return Current + NormalizeAngle(Target - Current) * Alpha;
}

addEventListener("mousedown", Event => {
  if (Event.button !== 2 || !Player()?.IsThirdPerson?.()) return;
  State.OrbitHeld = true;
  ReadCameraAngles();
}, true);

addEventListener("mouseup", Event => {
  if (Event.button !== 2) return;
  State.OrbitHeld = false;
  State.HasAngles = false;
}, true);

addEventListener("blur", () => {
  State.OrbitHeld = false;
  State.HasAngles = false;
});

document.addEventListener("mousemove", Event => {
  if (!State.OrbitHeld || !Player()?.IsThirdPerson?.()) return;
  if (!State.HasAngles && !ReadCameraAngles()) return;
  const User = Settings();
  const Sensitivity = THREE.MathUtils.clamp(Number(User.Sensitivity) || 0.92, 0.35, 2.0);
  const Scale = 0.00185 * Sensitivity;
  State.TargetYaw -= Event.movementX * Scale;
  State.TargetPitch -= Event.movementY * Scale;
  State.TargetPitch = THREE.MathUtils.clamp(State.TargetPitch, -1.12, 1.08);
  Event.preventDefault();
  Event.stopImmediatePropagation();
}, true);

function Tick() {
  const Now = performance.now();
  const Delta = Math.min((Now - State.LastTime) / 1000, 0.05);
  State.LastTime = Now;
  const CurrentGame = Game();
  const CurrentPlayer = Player();
  const Controls = window.__STORE_POINTER_CONTROLS__ || null;
  const User = Settings();
  const Sensitivity = THREE.MathUtils.clamp(Number(User.Sensitivity) || 0.92, 0.35, 2.0);

  if (Controls && !CurrentPlayer?.IsThirdPerson?.()) Controls.pointerSpeed = Sensitivity;

  if (State.OrbitHeld && CurrentPlayer?.IsThirdPerson?.() && CurrentGame?.Camera) {
    if (!State.HasAngles) ReadCameraAngles();
    const Smooth = THREE.MathUtils.clamp(Number(User.TrackpadSmoothing) || 0, 0, 100) / 100;
    const Responsiveness = THREE.MathUtils.lerp(28, 9.5, Smooth);
    const Alpha = 1 - Math.exp(-Delta * Responsiveness);
    State.CurrentYaw = SmoothAngle(State.CurrentYaw, State.TargetYaw, Alpha);
    State.CurrentPitch = THREE.MathUtils.lerp(State.CurrentPitch, State.TargetPitch, Alpha);
    State.Euler.set(State.CurrentPitch, State.CurrentYaw, 0, "YXZ");
    CurrentGame.Camera.quaternion.setFromEuler(State.Euler);
    CurrentGame.Camera.updateMatrixWorld(true);
    if (Controls) Controls.pointerSpeed = 0;
  } else if (CurrentGame?.Camera && CurrentPlayer?.IsThirdPerson?.()) {
    State.HasAngles = false;
  }

  requestAnimationFrame(Tick);
}

requestAnimationFrame(Tick);
window.__STORE_CAMERA_INPUT_BUILD__ = "V0.11-R42";
