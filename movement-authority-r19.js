import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Game?.Camera || !Game?.CollisionBoxes || !Player || !Collision) {
  throw new Error("Game, player, and collision utility must load before movement authority.");
}

const CoreRadius = 0.285;
const Scratch = {
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  Delta: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3()
};

function ContactState() {
  if (window.__STORE_MOVEMENT_CONTACT__) return window.__STORE_MOVEMENT_CONTACT__;
  window.__STORE_MOVEMENT_CONTACT__ = {
    Normal: new THREE.Vector3(),
    Position: new THREE.Vector3(),
    DesiredDirection: new THREE.Vector3(),
    SlideDirection: new THREE.Vector3(),
    Strength: 0,
    Sliding: false,
    Type: "",
    LastHit: -Infinity
  };
  return window.__STORE_MOVEMENT_CONTACT__;
}

function RecordContact(Result, Desired) {
  if (!Result?.Hit) return;
  const Contact = ContactState();
  Contact.Normal.copy(Result.Normal);
  Contact.Position.copy(Result.Position);
  Contact.DesiredDirection.copy(Desired);
  if (Contact.DesiredDirection.lengthSq() > 0.000001) Contact.DesiredDirection.normalize();
  Contact.SlideDirection.copy(Result.Resolved);
  if (Contact.SlideDirection.lengthSq() > 0.000001) Contact.SlideDirection.normalize();
  Scratch.DesiredDirection.copy(Desired);
  if (Scratch.DesiredDirection.lengthSq() > 0.000001) Scratch.DesiredDirection.normalize();
  const Inward = Contact.Normal.lengthSq() > 0.5
    ? Math.max(0, -Scratch.DesiredDirection.dot(Contact.Normal))
    : 1;
  Contact.Strength = THREE.MathUtils.clamp(0.58 + Inward * 0.42, 0, 1);
  Contact.Sliding = false;
  Contact.Type = Result.Entry?.Type || "Collision";
  Contact.LastHit = performance.now();
}

function ResolveInputAxis(Camera, Desired) {
  const Result = Collision.ResolveHorizontalMove(
    Camera.position,
    Desired,
    CoreRadius,
    Game.CollisionBoxes,
    {
      Skin: 0.006,
      MaxIterations: 1,
      MaxSweepSteps: 44,
      BinarySteps: 14,
      AllowSlide: false
    }
  );

  Camera.position.x = Result.Position.x;
  Camera.position.z = Result.Position.z;
  RecordContact(Result, Desired);
  return Result;
}

const PreviousMoveForward = PointerLockControls.prototype.moveForward;
const PreviousMoveRight = PointerLockControls.prototype.moveRight;

function ControlCamera(Control) {
  return Control?.object || Control?.camera || Game.Camera;
}

PointerLockControls.prototype.moveForward = function MoveForwardWithoutManufacturedSlide(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveForward.call(this, Distance);
  Scratch.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  Scratch.Forward.y = 0;
  if (Scratch.Forward.lengthSq() <= 0.000001) return;
  Scratch.Delta.copy(Scratch.Forward).normalize().multiplyScalar(Distance);
  ResolveInputAxis(Camera, Scratch.Delta);
};

PointerLockControls.prototype.moveRight = function MoveRightWithoutManufacturedSlide(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveRight.call(this, Distance);
  Scratch.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  Scratch.Right.y = 0;
  if (Scratch.Right.lengthSq() <= 0.000001) return;
  Scratch.Delta.copy(Scratch.Right).normalize().multiplyScalar(Distance);
  ResolveInputAxis(Camera, Scratch.Delta);
};

Player.GetPlayerRadius = () => CoreRadius;

window.__STORE_MOVEMENT_AUTHORITY__ = {
  ResolveInputAxis,
  GetCoreRadius: () => CoreRadius
};
window.__STORE_MOVEMENT_AUTHORITY_BUILD__ = "V0.12.18";
