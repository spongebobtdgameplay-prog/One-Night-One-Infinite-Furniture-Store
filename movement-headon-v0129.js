import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
if (!Game?.Camera) throw new Error("Game must load before movement head-on guard.");

const BaseMoveForward = PointerLockControls.prototype.moveForward;
const BaseMoveRight = PointerLockControls.prototype.moveRight;
const HEAD_ON_DOT = 0.88;
const CONTACT_WINDOW_MS = 40;

const State = {
  Start: new THREE.Vector3(),
  Desired: new THREE.Vector3(),
  Direction: new THREE.Vector3(),
  Resolved: new THREE.Vector3()
};

function GameCamera(Control) {
  return Control?.object || Control?.camera || Game.Camera;
}

function CorrectForcedSideways(Camera, Desired, CallStartedAt) {
  const Contact = window.__STORE_MOVEMENT_CONTACT__;
  if (!Contact?.Normal || Contact.LastHit < CallStartedAt - 1 || performance.now() - Contact.LastHit > CONTACT_WINDOW_MS) return;
  if (Desired.lengthSq() <= 0.0000001) return;

  State.Direction.copy(Desired).normalize();
  const IntoWall = -State.Direction.dot(Contact.Normal);
  if (IntoWall < HEAD_ON_DOT) return;

  State.Resolved.copy(Camera.position).sub(State.Start);
  State.Resolved.y = 0;

  const AlongRequested = THREE.MathUtils.clamp(State.Resolved.dot(State.Direction), 0, Desired.length());
  Camera.position.x = State.Start.x + State.Direction.x * AlongRequested;
  Camera.position.z = State.Start.z + State.Direction.z * AlongRequested;

  Contact.Sliding = false;
  Contact.SlideDirection.set(0, 0, 0);
}

PointerLockControls.prototype.moveForward = function MoveForwardWithoutForcedSideways(Distance) {
  const Camera = GameCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return BaseMoveForward.call(this, Distance);

  State.Start.copy(Camera.position);
  State.Desired.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  State.Desired.y = 0;
  if (State.Desired.lengthSq() <= 0.000001) return;
  State.Desired.normalize().multiplyScalar(Distance);

  const StartedAt = performance.now();
  BaseMoveForward.call(this, Distance);
  CorrectForcedSideways(Camera, State.Desired, StartedAt);
};

PointerLockControls.prototype.moveRight = function MoveRightWithoutForcedSideways(Distance) {
  const Camera = GameCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return BaseMoveRight.call(this, Distance);

  State.Start.copy(Camera.position);
  State.Desired.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  State.Desired.y = 0;
  if (State.Desired.lengthSq() <= 0.000001) return;
  State.Desired.normalize().multiplyScalar(Distance);

  const StartedAt = performance.now();
  BaseMoveRight.call(this, Distance);
  CorrectForcedSideways(Camera, State.Desired, StartedAt);
};

window.__STORE_MOVEMENT_HEADON_BUILD__ = "V0.12.9";
