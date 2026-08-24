import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Game?.Camera || !Game?.CollisionBoxes || !Player || !Collision) {
  throw new Error("Game, player, and collision utility must load before single movement authority.");
}

const CoreRadius = 0.285;
const ContactGap = 0.008;
const SkipWindowMs = 5;
const KeyState = new Set();

const Scratch = {
  CameraForward: new THREE.Vector3(),
  CameraRight: new THREE.Vector3(),
  Desired: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3(),
  StrafeMotion: new THREE.Vector3(),
  TangentMotion: new THREE.Vector3(),
  GapPosition: new THREE.Vector3(),
  Start: new THREE.Vector3(),
  Resolved: new THREE.Vector3()
};

let SkipAxis = "";
let SkipUntil = -Infinity;

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

function ContactState() {
  const Contact = window.__STORE_MOVEMENT_CONTACT__ ||= {};
  for (const Key of ["Normal", "Position", "DesiredDirection", "SlideDirection", "CharacterFacing"]) {
    if (!Contact[Key]?.isVector3) Contact[Key] = new THREE.Vector3();
  }
  return Contact;
}

function ResolveNoSlide(Start, Desired) {
  return Collision.ResolveHorizontalMove(Start, Desired, CoreRadius, Game.CollisionBoxes, {
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
  return Position;
}

function RecordContact(Result, Desired, SlideMotion) {
  if (!Result?.Hit) return;
  const Contact = ContactState();
  Contact.Normal.copy(Result.Normal);
  if (Contact.Normal.lengthSq() > 0.000001) Contact.Normal.normalize();
  Contact.Position.copy(Result.Position);
  Contact.DesiredDirection.copy(Desired);
  if (Contact.DesiredDirection.lengthSq() > 0.000001) Contact.DesiredDirection.normalize();
  Contact.CharacterFacing.copy(Contact.DesiredDirection);
  Contact.SlideDirection.copy(SlideMotion);
  if (Contact.SlideDirection.lengthSq() > 0.000001) Contact.SlideDirection.normalize();

  const Inward = Math.max(0, -Contact.DesiredDirection.dot(Contact.Normal));
  const DesiredLength = Math.max(Desired.length(), 0.000001);
  Contact.SlideAmount = THREE.MathUtils.clamp(SlideMotion.length() / DesiredLength, 0, 1);
  Contact.FacingAngle = THREE.MathUtils.radToDeg(Math.atan2(Contact.SlideAmount, Math.max(Inward, 0.000001)));
  Contact.Strength = THREE.MathUtils.clamp(0.58 + Inward * 0.42, 0, 1);
  Contact.Sliding = SlideMotion.lengthSq() > 0.000001;
  Contact.Type = Result.Entry?.Type || "Collision";
  Contact.LastHit = performance.now();
}

function ResolveMovement(Camera, ForwardAmount, RightAmount, Distance) {
  if (!Number.isFinite(Distance) || Distance <= 0) return null;

  Scratch.Start.copy(Camera.position);
  CameraBasis(Camera);
  Scratch.Desired.set(0, 0, 0)
    .addScaledVector(Scratch.CameraForward, ForwardAmount)
    .addScaledVector(Scratch.CameraRight, RightAmount);

  if (Scratch.Desired.lengthSq() <= 0.000001) return null;
  Scratch.Desired.normalize().multiplyScalar(Distance);
  Scratch.DesiredDirection.copy(Scratch.Desired).normalize();

  const First = ResolveNoSlide(Scratch.Start, Scratch.Desired);
  if (!First.Hit) {
    Camera.position.x = First.Position.x;
    Camera.position.z = First.Position.z;
    return First;
  }

  const Normal = First.Normal.clone();
  if (Normal.lengthSq() <= 0.000001) Normal.copy(Scratch.DesiredDirection).multiplyScalar(-1);
  else Normal.normalize();

  const DesiredLength = Scratch.Desired.length();
  const FirstTravel = THREE.MathUtils.clamp(First.Resolved.length() / Math.max(DesiredLength, 0.000001), 0, 1);
  const RemainingRatio = 1 - FirstTravel;
  const GapPosition = AddLegalGap(First.Position, Normal);

  let FinalPosition = GapPosition.clone();
  let FinalEntry = First.Entry;
  Scratch.TangentMotion.set(0, 0, 0);

  // Forward/backward input is never converted into sideways motion.
  // Wall following is allowed only from the player's real A/D contribution.
  if (Math.abs(RightAmount) > 0.000001 && RemainingRatio > 0.000001) {
    Scratch.StrafeMotion.copy(Scratch.CameraRight)
      .multiplyScalar(RightAmount * Distance * RemainingRatio);

    const Into = Scratch.StrafeMotion.dot(Normal);
    Scratch.TangentMotion.copy(Scratch.StrafeMotion);
    if (Into < 0) Scratch.TangentMotion.addScaledVector(Normal, -Into);

    if (Scratch.TangentMotion.lengthSq() > 0.000001) {
      const Slide = ResolveNoSlide(GapPosition, Scratch.TangentMotion);
      FinalPosition.copy(Slide.Position);
      if (Slide.Entry) FinalEntry = Slide.Entry;
      Scratch.TangentMotion.copy(FinalPosition).sub(GapPosition);
    } else {
      Scratch.TangentMotion.set(0, 0, 0);
    }
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
  RecordContact(Result, Scratch.Desired, Scratch.TangentMotion);
  return Result;
}

function TotalDistance(ComponentDistance, ComponentAmount) {
  if (Math.abs(ComponentAmount) <= 0.000001) return Math.abs(ComponentDistance);
  return Math.abs(ComponentDistance / ComponentAmount);
}

function SetSkip(Axis) {
  SkipAxis = Axis;
  SkipUntil = performance.now() + SkipWindowMs;
}

function ConsumeSkip(Axis) {
  if (SkipAxis !== Axis || performance.now() > SkipUntil) return false;
  SkipAxis = "";
  SkipUntil = -Infinity;
  return true;
}

const PreviousMoveForward = PointerLockControls.prototype.moveForward;
const PreviousMoveRight = PointerLockControls.prototype.moveRight;

function ControlCamera(Control) {
  return Control?.object || Control?.camera || Game.Camera;
}

PointerLockControls.prototype.moveForward = function MoveForwardSingleAuthority(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera) return PreviousMoveForward.call(this, Distance);
  if (!Number.isFinite(Distance) || ConsumeSkip("forward")) return;

  const Axes = InputAxes();
  const HasForwardInput = Math.abs(Axes.Forward) > 0.000001;
  const ForwardAmount = HasForwardInput ? Axes.Forward : Math.sign(Distance || 1);
  const RightAmount = HasForwardInput ? Axes.Right : 0;
  const DistanceTotal = TotalDistance(Distance, ForwardAmount);

  ResolveMovement(Camera, ForwardAmount, RightAmount, DistanceTotal);
  if (HasForwardInput && Math.abs(RightAmount) > 0.000001) SetSkip("right");
};

PointerLockControls.prototype.moveRight = function MoveRightSingleAuthority(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera) return PreviousMoveRight.call(this, Distance);
  if (!Number.isFinite(Distance) || ConsumeSkip("right")) return;

  const Axes = InputAxes();
  const HasRightInput = Math.abs(Axes.Right) > 0.000001;
  const RightAmount = HasRightInput ? Axes.Right : Math.sign(Distance || 1);
  const ForwardAmount = HasRightInput ? Axes.Forward : 0;
  const DistanceTotal = TotalDistance(Distance, RightAmount);

  ResolveMovement(Camera, ForwardAmount, RightAmount, DistanceTotal);
  if (HasRightInput && Math.abs(ForwardAmount) > 0.000001) SetSkip("forward");
};

addEventListener("keydown", Event => {
  if (/^Key[WASD]$/.test(Event.code)) KeyState.add(Event.code);
});
addEventListener("keyup", Event => {
  if (/^Key[WASD]$/.test(Event.code)) KeyState.delete(Event.code);
});
addEventListener("blur", () => {
  KeyState.clear();
  SkipAxis = "";
  SkipUntil = -Infinity;
});

Player.GetPlayerRadius = () => CoreRadius;

window.__STORE_MOVEMENT_AUTHORITY__ = {
  ResolveMovement,
  GetCoreRadius: () => CoreRadius,
  GetContactGap: () => ContactGap
};
window.__STORE_MOVEMENT_AUTHORITY_BUILD__ = "V0.12.28";
