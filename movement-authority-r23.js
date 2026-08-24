import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Game?.Camera || !Game?.CollisionBoxes || !Player || !Collision) {
  throw new Error("Game, player, and collision utility must load before combined movement authority.");
}

const CoreRadius = 0.285;
const ContactGap = 0.014;
const SlideAngleThreshold = 0.055;
const KeyState = new Set();
let SkipNextRight = false;

const Scratch = {
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  Desired: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3(),
  Tangent: new THREE.Vector3(),
  GapPosition: new THREE.Vector3(),
  Start: new THREE.Vector3(),
  Resolved: new THREE.Vector3()
};

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

function FirstHit(Start, Desired) {
  return Collision.ResolveHorizontalMove(Start, Desired, CoreRadius, Game.CollisionBoxes, {
    Skin: 0.008,
    MaxIterations: 1,
    MaxSweepSteps: 48,
    BinarySteps: 16,
    AllowSlide: false
  });
}

function TangentSweep(Start, TangentMotion) {
  return Collision.ResolveHorizontalMove(Start, TangentMotion, CoreRadius, Game.CollisionBoxes, {
    Skin: 0.006,
    MaxIterations: 1,
    MaxSweepSteps: 48,
    BinarySteps: 16,
    AllowSlide: false
  });
}

function AddLegalGap(Position, Normal) {
  Scratch.GapPosition.copy(Position).addScaledVector(Normal, ContactGap);
  Scratch.GapPosition.y = Position.y;
  if (!Collision.IsCircleBlocked(Scratch.GapPosition, CoreRadius, Game.CollisionBoxes)) return Scratch.GapPosition;

  Scratch.GapPosition.copy(Position).addScaledVector(Normal, ContactGap * 0.5);
  Scratch.GapPosition.y = Position.y;
  if (!Collision.IsCircleBlocked(Scratch.GapPosition, CoreRadius, Game.CollisionBoxes)) return Scratch.GapPosition;
  return Position;
}

function RecordContact(Result, Desired, SlideRatio) {
  if (!Result?.Hit) return;
  const Contact = ContactState();
  Contact.Normal.copy(Result.Normal);
  if (Contact.Normal.lengthSq() > 0.000001) Contact.Normal.normalize();
  Contact.Position.copy(Result.Position);
  Contact.DesiredDirection.copy(Desired);
  if (Contact.DesiredDirection.lengthSq() > 0.000001) Contact.DesiredDirection.normalize();

  Scratch.Tangent.copy(Contact.DesiredDirection);
  const NormalDot = Scratch.Tangent.dot(Contact.Normal);
  Scratch.Tangent.addScaledVector(Contact.Normal, -NormalDot);
  Contact.SlideDirection.copy(Scratch.Tangent);
  if (Contact.SlideDirection.lengthSq() > 0.000001) Contact.SlideDirection.normalize();

  const Inward = Math.max(0, -Contact.DesiredDirection.dot(Contact.Normal));
  Contact.SlideAmount = THREE.MathUtils.clamp(SlideRatio, 0, 1);
  Contact.FacingAngle = THREE.MathUtils.radToDeg(Math.asin(Contact.SlideAmount));
  Contact.Strength = THREE.MathUtils.clamp(0.58 + Inward * 0.42, 0, 1);
  Contact.Sliding = Contact.SlideAmount >= SlideAngleThreshold && Result.Resolved.lengthSq() > 0.000001;
  Contact.Type = Result.Entry?.Type || "Collision";
  Contact.LastHit = performance.now();
}

function ResolveCombined(Camera, ForwardAmount, RightAmount, Distance) {
  Scratch.Start.copy(Camera.position);
  Scratch.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  Scratch.Forward.y = 0;
  if (Scratch.Forward.lengthSq() > 0.000001) Scratch.Forward.normalize();

  Scratch.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  Scratch.Right.y = 0;
  if (Scratch.Right.lengthSq() > 0.000001) Scratch.Right.normalize();

  Scratch.Desired.set(0, 0, 0)
    .addScaledVector(Scratch.Forward, ForwardAmount)
    .addScaledVector(Scratch.Right, RightAmount);
  if (Scratch.Desired.lengthSq() <= 0.000001 || !Number.isFinite(Distance) || Distance <= 0) return null;
  Scratch.Desired.normalize().multiplyScalar(Distance);

  const First = FirstHit(Scratch.Start, Scratch.Desired);
  if (!First.Hit) {
    Camera.position.x = First.Position.x;
    Camera.position.z = First.Position.z;
    return First;
  }

  Scratch.DesiredDirection.copy(Scratch.Desired).normalize();
  const Normal = First.Normal.clone();
  if (Normal.lengthSq() <= 0.000001) Normal.copy(Scratch.DesiredDirection).multiplyScalar(-1);
  else Normal.normalize();

  const Into = Scratch.Desired.dot(Normal);
  Scratch.Tangent.copy(Scratch.Desired);
  if (Into < 0) Scratch.Tangent.addScaledVector(Normal, -Into);
  else Scratch.Tangent.set(0, 0, 0);

  const SlideRatio = THREE.MathUtils.clamp(Scratch.Tangent.length() / Scratch.Desired.length(), 0, 1);
  const FirstTravel = THREE.MathUtils.clamp(First.Resolved.length() / Scratch.Desired.length(), 0, 1);
  const RemainingRatio = 1 - FirstTravel;
  const GapPosition = AddLegalGap(First.Position, Normal);

  let FinalPosition = GapPosition.clone();
  let FinalEntry = First.Entry;

  if (SlideRatio >= SlideAngleThreshold && RemainingRatio > 0.000001) {
    Scratch.Tangent.multiplyScalar(RemainingRatio);
    const Slide = TangentSweep(GapPosition, Scratch.Tangent);
    FinalPosition.copy(Slide.Position);
    if (Slide.Entry) FinalEntry = Slide.Entry;
  }

  Camera.position.x = FinalPosition.x;
  Camera.position.z = FinalPosition.z;
  Scratch.Resolved.copy(FinalPosition).sub(Scratch.Start);
  Scratch.Resolved.y = 0;

  const Result = {
    Position: FinalPosition.clone(),
    Resolved: Scratch.Resolved.clone(),
    Hit: true,
    Entry: FinalEntry,
    Normal
  };
  RecordContact(Result, Scratch.Desired, SlideRatio);
  return Result;
}

function TotalDistanceFromComponent(ComponentDistance, ComponentAmount) {
  if (Math.abs(ComponentAmount) <= 0.000001) return 0;
  return Math.abs(ComponentDistance / ComponentAmount);
}

const PreviousMoveForward = PointerLockControls.prototype.moveForward;
const PreviousMoveRight = PointerLockControls.prototype.moveRight;

function ControlCamera(Control) {
  return Control?.object || Control?.camera || Game.Camera;
}

PointerLockControls.prototype.moveForward = function MoveForwardCombined(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveForward.call(this, Distance);

  const Axes = InputAxes();
  if (Math.abs(Axes.Forward) <= 0.000001) return PreviousMoveForward.call(this, Distance);
  const TotalDistance = TotalDistanceFromComponent(Distance, Axes.Forward);
  ResolveCombined(Camera, Axes.Forward, Axes.Right, TotalDistance);
  SkipNextRight = Math.abs(Axes.Right) > 0.000001;
};

PointerLockControls.prototype.moveRight = function MoveRightCombined(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveRight.call(this, Distance);

  if (SkipNextRight) {
    SkipNextRight = false;
    return;
  }

  const Axes = InputAxes();
  if (Math.abs(Axes.Right) <= 0.000001) return PreviousMoveRight.call(this, Distance);
  const TotalDistance = TotalDistanceFromComponent(Distance, Axes.Right);
  ResolveCombined(Camera, Axes.Forward, Axes.Right, TotalDistance);
};

addEventListener("keydown", Event => {
  if (/^Key[WASD]$/.test(Event.code)) KeyState.add(Event.code);
});
addEventListener("keyup", Event => {
  if (/^Key[WASD]$/.test(Event.code)) KeyState.delete(Event.code);
});
addEventListener("blur", () => {
  KeyState.clear();
  SkipNextRight = false;
});

Player.GetPlayerRadius = () => CoreRadius;

window.__STORE_MOVEMENT_AUTHORITY__ = {
  ResolveCombined,
  GetCoreRadius: () => CoreRadius,
  GetContactGap: () => ContactGap,
  GetSlideAngleThreshold: () => SlideAngleThreshold
};
window.__STORE_MOVEMENT_AUTHORITY_BUILD__ = "V0.12.24";
