import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Game?.Camera || !Game?.CollisionBoxes || !Player || !Collision) {
  throw new Error("Game, player, and collision utility must load before intent wall movement authority.");
}

const CoreRadius = 0.285;
const ContactGap = 0.014;
const TangentDeadzone = 0.06;
const DominanceMargin = 0.035;
const DominanceBlendWidth = 0.22;
const KeyState = new Set();
let SkipNextRight = false;

const Scratch = {
  CameraForward: new THREE.Vector3(),
  CameraRight: new THREE.Vector3(),
  Desired: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3(),
  TangentAxis: new THREE.Vector3(),
  TangentMotion: new THREE.Vector3(),
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

function CameraBasis(Camera) {
  Scratch.CameraForward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  Scratch.CameraForward.y = 0;
  if (Scratch.CameraForward.lengthSq() <= 0.000001) Scratch.CameraForward.set(0, 0, -1);
  else Scratch.CameraForward.normalize();

  Scratch.CameraRight.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  Scratch.CameraRight.y = 0;
  if (Scratch.CameraRight.lengthSq() <= 0.000001) Scratch.CameraRight.set(1, 0, 0);
  else Scratch.CameraRight.normalize();
}

function MovementIntent() {
  const Existing = window.__STORE_MOVEMENT_INTENT__;
  if (Existing?.Direction?.isVector3) return Existing;
  const Intent = {
    Direction: new THREE.Vector3(),
    Active: false,
    Forward: 0,
    Right: 0,
    UpdatedAt: -Infinity
  };
  window.__STORE_MOVEMENT_INTENT__ = Intent;
  return Intent;
}

function PublishIntent(Direction, Forward, Right) {
  const Intent = MovementIntent();
  Intent.Direction.copy(Direction);
  if (Intent.Direction.lengthSq() > 0.000001) Intent.Direction.normalize();
  Intent.Active = Math.abs(Forward) > 0.000001 || Math.abs(Right) > 0.000001;
  Intent.Forward = Forward;
  Intent.Right = Right;
  Intent.UpdatedAt = performance.now();
  return Intent;
}

function ClearIntentIfIdle() {
  const Axes = InputAxes();
  if (Math.abs(Axes.Forward) > 0.000001 || Math.abs(Axes.Right) > 0.000001) return;
  const Intent = MovementIntent();
  Intent.Active = false;
  Intent.Forward = 0;
  Intent.Right = 0;
  Intent.UpdatedAt = performance.now();
}

function ContactState() {
  const Contact = window.__STORE_MOVEMENT_CONTACT__ ||= {};
  for (const Key of ["Normal", "Position", "DesiredDirection", "SlideDirection", "CharacterFacing"]) {
    if (!Contact[Key]?.isVector3) Contact[Key] = new THREE.Vector3();
  }
  if (!Number.isFinite(Contact.Strength)) Contact.Strength = 0;
  if (!Number.isFinite(Contact.SlideAmount)) Contact.SlideAmount = 0;
  if (!Number.isFinite(Contact.FacingAngle)) Contact.FacingAngle = 0;
  if (!Number.isFinite(Contact.LastHit)) Contact.LastHit = -Infinity;
  if (typeof Contact.Sliding !== "boolean") Contact.Sliding = false;
  if (typeof Contact.Type !== "string") Contact.Type = "";
  return Contact;
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

function Smooth01(Value) {
  const T = THREE.MathUtils.clamp(Value, 0, 1);
  return T * T * (3 - 2 * T);
}

function SlideFromIntent(IntentDirection, Normal) {
  Scratch.TangentAxis.set(-Normal.z, 0, Normal.x);
  if (Scratch.TangentAxis.lengthSq() <= 0.000001) {
    return { Sign: 0, Ratio: 0, Inward: 0, Tangent: 0 };
  }
  Scratch.TangentAxis.normalize();

  const TangentScalar = IntentDirection.dot(Scratch.TangentAxis);
  const Tangent = Math.abs(TangentScalar);
  const Inward = Math.max(0, -IntentDirection.dot(Normal));

  // Mostly into the wall means stop. Sliding only begins once the player's
  // intended direction is more along the wall than into it.
  const Dominance = Tangent - Inward - DominanceMargin;
  if (Tangent < TangentDeadzone || Dominance <= 0) {
    return { Sign: 0, Ratio: 0, Inward, Tangent };
  }

  const Blend = Smooth01(Dominance / DominanceBlendWidth);
  return {
    Sign: Math.sign(TangentScalar),
    Ratio: THREE.MathUtils.clamp(Tangent * Blend, 0, 1),
    Inward,
    Tangent
  };
}

function RecordContact(Result, IntentDirection, Slide) {
  if (!Result?.Hit) return;
  const Contact = ContactState();
  Contact.Normal.copy(Result.Normal);
  if (Contact.Normal.lengthSq() > 0.000001) Contact.Normal.normalize();
  Contact.Position.copy(Result.Position);
  Contact.DesiredDirection.copy(IntentDirection);
  Contact.CharacterFacing.copy(IntentDirection);

  Scratch.TangentAxis.set(-Contact.Normal.z, 0, Contact.Normal.x);
  if (Scratch.TangentAxis.lengthSq() > 0.000001) Scratch.TangentAxis.normalize();
  Contact.SlideDirection.copy(Scratch.TangentAxis).multiplyScalar(Slide.Sign);

  Contact.SlideAmount = Slide.Ratio;
  Contact.FacingAngle = THREE.MathUtils.radToDeg(Math.atan2(Slide.Tangent, Math.max(Slide.Inward, 0.000001)));
  Contact.Strength = THREE.MathUtils.clamp(0.58 + Slide.Inward * 0.42, 0, 1);
  Contact.Sliding = Slide.Sign !== 0 && Slide.Ratio > 0.000001 && Result.Resolved.lengthSq() > 0.000001;
  Contact.Type = Result.Entry?.Type || "Collision";
  Contact.LastHit = performance.now();
}

function ResolveCombined(Camera, ForwardAmount, RightAmount, Distance) {
  Scratch.Start.copy(Camera.position);
  CameraBasis(Camera);

  Scratch.Desired.set(0, 0, 0)
    .addScaledVector(Scratch.CameraForward, ForwardAmount)
    .addScaledVector(Scratch.CameraRight, RightAmount);
  if (Scratch.Desired.lengthSq() <= 0.000001 || !Number.isFinite(Distance) || Distance <= 0) return null;

  Scratch.Desired.normalize();
  PublishIntent(Scratch.Desired, ForwardAmount, RightAmount);
  Scratch.Desired.multiplyScalar(Distance);
  Scratch.DesiredDirection.copy(Scratch.Desired).normalize();

  const First = FirstHit(Scratch.Start, Scratch.Desired);
  if (!First.Hit) {
    Camera.position.x = First.Position.x;
    Camera.position.z = First.Position.z;
    return First;
  }

  const Normal = First.Normal.clone();
  if (Normal.lengthSq() <= 0.000001) Normal.copy(Scratch.DesiredDirection).multiplyScalar(-1);
  else Normal.normalize();

  const Slide = SlideFromIntent(Scratch.DesiredDirection, Normal);
  const FirstTravel = THREE.MathUtils.clamp(First.Resolved.length() / Scratch.Desired.length(), 0, 1);
  const RemainingDistance = Scratch.Desired.length() * (1 - FirstTravel);
  const GapPosition = AddLegalGap(First.Position, Normal);

  let FinalPosition = GapPosition.clone();
  let FinalEntry = First.Entry;

  if (Slide.Sign !== 0 && Slide.Ratio > 0.000001 && RemainingDistance > 0.000001) {
    Scratch.TangentMotion.copy(Scratch.TangentAxis)
      .multiplyScalar(Slide.Sign * RemainingDistance * Slide.Ratio);
    const TangentResult = TangentSweep(GapPosition, Scratch.TangentMotion);
    FinalPosition.copy(TangentResult.Position);
    if (TangentResult.Entry) FinalEntry = TangentResult.Entry;
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
  RecordContact(Result, Scratch.DesiredDirection, Slide);
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

PointerLockControls.prototype.moveForward = function MoveForwardIntentWall(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveForward.call(this, Distance);

  const Axes = InputAxes();
  if (Math.abs(Axes.Forward) <= 0.000001) return PreviousMoveForward.call(this, Distance);
  const TotalDistance = TotalDistanceFromComponent(Distance, Axes.Forward);
  ResolveCombined(Camera, Axes.Forward, Axes.Right, TotalDistance);
  SkipNextRight = Math.abs(Axes.Right) > 0.000001;
};

PointerLockControls.prototype.moveRight = function MoveRightIntentWall(Distance) {
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
  if (!/^Key[WASD]$/.test(Event.code)) return;
  KeyState.delete(Event.code);
  ClearIntentIfIdle();
});
addEventListener("blur", () => {
  KeyState.clear();
  SkipNextRight = false;
  const Intent = MovementIntent();
  Intent.Active = false;
  Intent.Forward = 0;
  Intent.Right = 0;
  Intent.UpdatedAt = performance.now();
});

Player.GetPlayerRadius = () => CoreRadius;

window.__STORE_MOVEMENT_AUTHORITY__ = {
  ResolveCombined,
  GetCoreRadius: () => CoreRadius,
  GetContactGap: () => ContactGap,
  GetDominanceMargin: () => DominanceMargin
};
window.__STORE_MOVEMENT_AUTHORITY_BUILD__ = "V0.12.27";
