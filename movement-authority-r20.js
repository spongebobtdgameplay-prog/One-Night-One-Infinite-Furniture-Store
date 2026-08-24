import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Game?.Camera || !Game?.CollisionBoxes || !Player || !Collision) {
  throw new Error("Game, player, and collision utility must load before movement authority.");
}

const CoreRadius = 0.285;
const SlideIntentThreshold = 0.025;
const Scratch = {
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  Delta: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3(),
  Tangent: new THREE.Vector3()
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
    SlideAmount: 0,
    FacingAngle: 0,
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

  Scratch.DesiredDirection.copy(Contact.DesiredDirection);
  Scratch.Tangent.copy(Scratch.DesiredDirection);

  let Inward = 0;
  let TangentRatio = 0;
  let FacingAngle = 0;

  if (Contact.Normal.lengthSq() > 0.5 && Scratch.DesiredDirection.lengthSq() > 0.5) {
    Contact.Normal.normalize();
    const NormalDot = Scratch.DesiredDirection.dot(Contact.Normal);
    Inward = Math.max(0, -NormalDot);
    Scratch.Tangent.addScaledVector(Contact.Normal, -NormalDot);
    TangentRatio = THREE.MathUtils.clamp(Scratch.Tangent.length(), 0, 1);
    FacingAngle = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(Inward, 0, 1)));
  }

  Contact.SlideDirection.copy(Scratch.Tangent);
  if (Contact.SlideDirection.lengthSq() > 0.000001) Contact.SlideDirection.normalize();
  Contact.SlideAmount = TangentRatio;
  Contact.FacingAngle = FacingAngle;
  Contact.Strength = THREE.MathUtils.clamp(0.58 + Inward * 0.42, 0, 1);
  Contact.Sliding = TangentRatio >= SlideIntentThreshold && Result.Resolved.lengthSq() > 0.000001;
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
      MaxIterations: 3,
      MaxSweepSteps: 44,
      BinarySteps: 14,
      AllowSlide: true,
      SlideIntentThreshold
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

PointerLockControls.prototype.moveForward = function MoveForwardWithFacingSlide(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveForward.call(this, Distance);
  Scratch.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  Scratch.Forward.y = 0;
  if (Scratch.Forward.lengthSq() <= 0.000001) return;
  Scratch.Delta.copy(Scratch.Forward).normalize().multiplyScalar(Distance);
  ResolveInputAxis(Camera, Scratch.Delta);
};

PointerLockControls.prototype.moveRight = function MoveRightWithFacingSlide(Distance) {
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
  GetCoreRadius: () => CoreRadius,
  GetSlideIntentThreshold: () => SlideIntentThreshold
};
window.__STORE_MOVEMENT_AUTHORITY_BUILD__ = "V0.12.21";
