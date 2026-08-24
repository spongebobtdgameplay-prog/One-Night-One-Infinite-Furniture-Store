import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Movement = window.__STORE_MOVEMENT_AUTHORITY__;
const ForwardInvariant = window.__STORE_FORWARD_WALL_INVARIANT__;
if (!Game?.Camera || !Movement?.ResolveMovement) throw new Error("Movement authority must load before frame movement authority.");

const KeyState = new Set();
let FrameClaimed = false;
let ResetScheduled = false;

function InputAxes() {
  let Forward = 0;
  let Right = 0;
  if (KeyState.has("KeyW")) Forward += 1;
  if (KeyState.has("KeyS")) Forward -= 1;
  if (KeyState.has("KeyD")) Right += 1;
  if (KeyState.has("KeyA")) Right -= 1;
  const Length = Math.hypot(Forward, Right);
  if (Length > 0.000001) {
    Forward /= Length;
    Right /= Length;
  }
  return { Forward, Right };
}

function ScheduleFrameReset() {
  if (ResetScheduled) return;
  ResetScheduled = true;
  requestAnimationFrame(() => {
    FrameClaimed = false;
    ResetScheduled = false;
  });
}

function ControlCamera(Control) {
  return Control?.object || Control?.camera || Game.Camera;
}

function ResolveOnce(Camera, Distance, Axis) {
  const Axes = InputAxes();
  if (Math.abs(Axes.Forward) <= 0.000001 && Math.abs(Axes.Right) <= 0.000001) return false;

  const Component = Axis === "forward" ? Axes.Forward : Axes.Right;
  if (Math.abs(Component) <= 0.000001 || Math.abs(Distance) <= 0.000001) return false;
  if (FrameClaimed) return true;

  const TotalDistance = Math.abs(Distance / Component);
  if (!Number.isFinite(TotalDistance) || TotalDistance <= 0.000001) return false;

  FrameClaimed = true;
  ScheduleFrameReset();

  if (Math.abs(Axes.Forward) > 0.000001 && Math.abs(Axes.Right) <= 0.000001 && typeof ForwardInvariant?.ResolveForwardOnly === "function") {
    ForwardInvariant.ResolveForwardOnly(Camera, TotalDistance * Math.sign(Axes.Forward));
    return true;
  }

  Movement.ResolveMovement(Camera, Axes.Forward, Axes.Right, TotalDistance);
  return true;
}

const PreviousMoveForward = PointerLockControls.prototype.moveForward;
const PreviousMoveRight = PointerLockControls.prototype.moveRight;

PointerLockControls.prototype.moveForward = function MoveForwardOneSolvePerFrame(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveForward.call(this, Distance);
  if (ResolveOnce(Camera, Distance, "forward")) return;
  return PreviousMoveForward.call(this, Distance);
};

PointerLockControls.prototype.moveRight = function MoveRightOneSolvePerFrame(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveRight.call(this, Distance);
  if (ResolveOnce(Camera, Distance, "right")) return;
  return PreviousMoveRight.call(this, Distance);
};

addEventListener("keydown", Event => {
  if (/^Key[WASD]$/.test(Event.code)) KeyState.add(Event.code);
});

addEventListener("keyup", Event => {
  if (/^Key[WASD]$/.test(Event.code)) KeyState.delete(Event.code);
});

addEventListener("blur", () => {
  KeyState.clear();
  FrameClaimed = false;
});

window.__STORE_MOVEMENT_FRAME_AUTHORITY__ = {
  InputAxes,
  Reset: () => {
    FrameClaimed = false;
    KeyState.clear();
  }
};
window.__STORE_MOVEMENT_FRAME_AUTHORITY_BUILD__ = "V0.16.0-R74";