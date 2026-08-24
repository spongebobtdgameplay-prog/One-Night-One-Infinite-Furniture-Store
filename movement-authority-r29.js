import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Game?.Camera || !Game?.Scene || !Game?.CollisionBoxes || !Player || !Collision) {
  throw new Error("Game, player, scene, and collision utility must load before facing-slide movement authority.");
}

const CoreRadius = 0.285;
const ContactGap = 0.012;
const FacingSlideDeadzone = 0.14;
const SkipWindowMs = 5;
const LegacyBinarySteps = 16;
const KeyState = new Set();

const Scratch = {
  CameraForward: new THREE.Vector3(),
  CameraRight: new THREE.Vector3(),
  Desired: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3(),
  CharacterFacing: new THREE.Vector3(),
  FacingTangent: new THREE.Vector3(),
  TangentMotion: new THREE.Vector3(),
  GapPosition: new THREE.Vector3(),
  Start: new THREE.Vector3(),
  Candidate: new THREE.Vector3(),
  Resolved: new THREE.Vector3(),
  FacingQuaternion: new THREE.Quaternion()
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

function BoundsFinite(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.z, Bounds.max.x, Bounds.max.z].every(Number.isFinite)
  );
}

function LegacyBlocked(Position) {
  for (const Entry of Game.CollisionBoxes) {
    if (!Entry) continue;
    if (typeof Entry.TestPlayerCollision === "function") {
      try {
        if (Entry.TestPlayerCollision(Position, CoreRadius)) return true;
      } catch {}
      continue;
    }

    const Bounds = Entry.Box || Entry;
    if (!BoundsFinite(Bounds)) continue;
    if (
      Position.x + CoreRadius > Bounds.min.x &&
      Position.x - CoreRadius < Bounds.max.x &&
      Position.z + CoreRadius > Bounds.min.z &&
      Position.z - CoreRadius < Bounds.max.z
    ) return true;
  }
  return false;
}

function ResolveNoSlide(Start, Desired) {
  return Collision.ResolveHorizontalMove(Start, Desired, CoreRadius, Game.CollisionBoxes, {
    Skin: 0.006,
    MaxIterations: 1,
    MaxSweepSteps: 52,
    BinarySteps: 18,
    AllowSlide: false
  });
}

function ClampToLegacySafe(Start, Target) {
  if (!LegacyBlocked(Target)) return Target.clone();
  if (LegacyBlocked(Start)) return Start.clone();

  let Low = 0;
  let High = 1;
  for (let Index = 0; Index < LegacyBinarySteps; Index += 1) {
    const Mid = (Low + High) * 0.5;
    Scratch.Candidate.copy(Start).lerp(Target, Mid);
    if (LegacyBlocked(Scratch.Candidate)) High = Mid;
    else Low = Mid;
  }
  return Start.clone().lerp(Target, Math.max(0, Low - 0.0005));
}

function AddLegalGap(Position, Normal, Start) {
  Scratch.GapPosition.copy(Position).addScaledVector(Normal, ContactGap);
  Scratch.GapPosition.y = Position.y;
  return ClampToLegacySafe(Start, Scratch.GapPosition);
}

function ReadCharacterFacing(Fallback) {
  const Pivot = Game.Scene.getObjectByName("PlayerCharacterPivot");
  if (Pivot) {
    Pivot.getWorldQuaternion(Scratch.FacingQuaternion);
    Scratch.CharacterFacing.set(0, 0, 1).applyQuaternion(Scratch.FacingQuaternion);
    Scratch.CharacterFacing.y = 0;
    if (Scratch.CharacterFacing.lengthSq() > 0.000001) return Scratch.CharacterFacing.normalize();
  }

  Scratch.CharacterFacing.copy(Fallback);
  Scratch.CharacterFacing.y = 0;
  if (Scratch.CharacterFacing.lengthSq() <= 0.000001) Scratch.CharacterFacing.set(0, 0, -1);
  else Scratch.CharacterFacing.normalize();
  return Scratch.CharacterFacing;
}

function SlideFromCharacterFacing(Normal, FallbackFacing) {
  const Facing = ReadCharacterFacing(FallbackFacing);
  const FacingIntoNormal = Facing.dot(Normal);

  Scratch.FacingTangent.copy(Facing).addScaledVector(Normal, -FacingIntoNormal);
  Scratch.FacingTangent.y = 0;

  const TangentAmount = Scratch.FacingTangent.length();
  if (TangentAmount <= FacingSlideDeadzone) {
    Scratch.FacingTangent.set(0, 0, 0);
    return { Direction: Scratch.FacingTangent, Ratio: 0, TangentAmount, Inward: Math.max(0, -FacingIntoNormal) };
  }

  Scratch.FacingTangent.normalize();
  const Ratio = THREE.MathUtils.clamp(
    (TangentAmount - FacingSlideDeadzone) / (1 - FacingSlideDeadzone),
    0,
    1
  );

  return {
    Direction: Scratch.FacingTangent,
    Ratio,
    TangentAmount,
    Inward: Math.max(0, -FacingIntoNormal)
  };
}

function RecordContact(Result, Desired, Slide) {
  if (!Result?.Hit) return;
  const Contact = ContactState();
  Contact.Normal.copy(Result.Normal);
  if (Contact.Normal.lengthSq() > 0.000001) Contact.Normal.normalize();

  Contact.Position.copy(Result.Position);
  Contact.DesiredDirection.copy(Desired);
  if (Contact.DesiredDirection.lengthSq() > 0.000001) Contact.DesiredDirection.normalize();

  Contact.CharacterFacing.copy(Scratch.CharacterFacing);
  Contact.SlideDirection.copy(Slide.Direction);
  Contact.SlideAmount = Slide.Ratio;
  Contact.FacingAngle = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(Slide.TangentAmount, 0, 1)));
  Contact.Strength = THREE.MathUtils.clamp(0.58 + Slide.Inward * 0.42, 0, 1);
  Contact.Sliding = Slide.Ratio > 0.000001;
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
    const Safe = ClampToLegacySafe(Scratch.Start, First.Position);
    Camera.position.x = Safe.x;
    Camera.position.z = Safe.z;
    First.Position.copy(Safe);
    First.Resolved.copy(Safe).sub(Scratch.Start);
    First.Resolved.y = 0;
    return First;
  }

  const Normal = First.Normal.clone();
  if (Normal.lengthSq() <= 0.000001) Normal.copy(Scratch.DesiredDirection).multiplyScalar(-1);
  else Normal.normalize();

  const Slide = SlideFromCharacterFacing(Normal, Scratch.DesiredDirection);
  const DesiredLength = Scratch.Desired.length();
  const FirstTravel = THREE.MathUtils.clamp(First.Resolved.length() / Math.max(DesiredLength, 0.000001), 0, 1);
  const RemainingDistance = DesiredLength * (1 - FirstTravel);
  const GapPosition = AddLegalGap(First.Position, Normal, Scratch.Start);

  let FinalPosition = GapPosition.clone();
  let FinalEntry = First.Entry;

  if (Slide.Ratio > 0.000001 && RemainingDistance > 0.000001) {
    Scratch.TangentMotion.copy(Slide.Direction).multiplyScalar(RemainingDistance * Slide.Ratio);
    const TangentResult = ResolveNoSlide(GapPosition, Scratch.TangentMotion);
    FinalPosition = ClampToLegacySafe(GapPosition, TangentResult.Position);
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
  RecordContact(Result, Scratch.Desired, Slide);
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

PointerLockControls.prototype.moveForward = function MoveForwardFacingSlideAuthority(Distance) {
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

PointerLockControls.prototype.moveRight = function MoveRightFacingSlideAuthority(Distance) {
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
  LegacyBlocked,
  GetCoreRadius: () => CoreRadius,
  GetContactGap: () => ContactGap,
  GetFacingSlideDeadzone: () => FacingSlideDeadzone
};
window.__STORE_MOVEMENT_AUTHORITY_BUILD__ = "V0.12.31";
