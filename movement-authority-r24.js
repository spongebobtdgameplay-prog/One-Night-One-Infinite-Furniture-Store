import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Game?.Camera || !Game?.Scene || !Game?.CollisionBoxes || !Player || !Collision) {
  throw new Error("Game, player, scene, and collision utility must load before facing wall movement authority.");
}

const CoreRadius = 0.285;
const ContactGap = 0.014;
const FacingSlideDeadzone = 0.075;
const FacingSignSwitchThreshold = 0.16;
const ContactMemoryMs = 140;
const KeyState = new Set();
let SkipNextRight = false;

const ContactMemory = {
  Entry: null,
  Normal: new THREE.Vector3(),
  SlideSign: 0,
  LastHit: -Infinity
};

const Scratch = {
  CameraForward: new THREE.Vector3(),
  CameraRight: new THREE.Vector3(),
  CharacterForward: new THREE.Vector3(),
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

function VisibleCharacterFacing(Camera) {
  const Pivot = Game.Scene.getObjectByName("PlayerCharacterPivot");
  if (Pivot) {
    const Yaw = Pivot.rotation.y;
    Scratch.CharacterForward.set(Math.sin(Yaw), 0, Math.cos(Yaw));
    if (Scratch.CharacterForward.lengthSq() > 0.000001) return Scratch.CharacterForward.normalize();
  }

  CameraBasis(Camera);
  return Scratch.CharacterForward.copy(Scratch.CameraForward);
}

function ContactState() {
  if (window.__STORE_MOVEMENT_CONTACT__) return window.__STORE_MOVEMENT_CONTACT__;
  window.__STORE_MOVEMENT_CONTACT__ = {
    Normal: new THREE.Vector3(),
    Position: new THREE.Vector3(),
    DesiredDirection: new THREE.Vector3(),
    SlideDirection: new THREE.Vector3(),
    CharacterFacing: new THREE.Vector3(),
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

function StableFacingSign(Entry, Normal, FacingScalar) {
  const Now = performance.now();
  const SameEntry = Entry && ContactMemory.Entry === Entry;
  const SameNormal = ContactMemory.Normal.lengthSq() > 0.5 && ContactMemory.Normal.dot(Normal) > 0.94;
  const Recent = Now - ContactMemory.LastHit <= ContactMemoryMs;
  const CandidateSign = Math.abs(FacingScalar) >= FacingSlideDeadzone ? Math.sign(FacingScalar) : 0;

  if (!SameEntry || !SameNormal || !Recent) {
    ContactMemory.Entry = Entry || null;
    ContactMemory.Normal.copy(Normal);
    ContactMemory.SlideSign = CandidateSign;
  } else if (
    CandidateSign !== 0 &&
    CandidateSign !== ContactMemory.SlideSign &&
    Math.abs(FacingScalar) >= FacingSignSwitchThreshold
  ) {
    ContactMemory.SlideSign = CandidateSign;
  } else if (Math.abs(FacingScalar) < FacingSlideDeadzone * 0.55) {
    ContactMemory.SlideSign = 0;
  }

  ContactMemory.LastHit = Now;
  return ContactMemory.SlideSign;
}

function RecordContact(Result, Desired, Facing, SlideRatio, SlideSign) {
  if (!Result?.Hit) return;
  const Contact = ContactState();
  Contact.Normal.copy(Result.Normal);
  if (Contact.Normal.lengthSq() > 0.000001) Contact.Normal.normalize();
  Contact.Position.copy(Result.Position);
  Contact.DesiredDirection.copy(Desired);
  if (Contact.DesiredDirection.lengthSq() > 0.000001) Contact.DesiredDirection.normalize();
  Contact.CharacterFacing.copy(Facing);

  Scratch.TangentAxis.set(-Contact.Normal.z, 0, Contact.Normal.x);
  if (Scratch.TangentAxis.lengthSq() > 0.000001) Scratch.TangentAxis.normalize();
  Contact.SlideDirection.copy(Scratch.TangentAxis).multiplyScalar(SlideSign);

  const Inward = Math.max(0, -Contact.DesiredDirection.dot(Contact.Normal));
  Contact.SlideAmount = THREE.MathUtils.clamp(SlideRatio, 0, 1);
  Contact.FacingAngle = THREE.MathUtils.radToDeg(Math.asin(Contact.SlideAmount));
  Contact.Strength = THREE.MathUtils.clamp(0.58 + Inward * 0.42, 0, 1);
  Contact.Sliding = SlideSign !== 0 && Contact.SlideAmount >= FacingSlideDeadzone && Result.Resolved.lengthSq() > 0.000001;
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

  const Into = Scratch.DesiredDirection.dot(Normal);
  const Facing = VisibleCharacterFacing(Camera).clone();
  Scratch.TangentAxis.set(-Normal.z, 0, Normal.x);
  if (Scratch.TangentAxis.lengthSq() > 0.000001) Scratch.TangentAxis.normalize();

  const FacingScalar = Facing.dot(Scratch.TangentAxis);
  const SlideRatio = Into < 0 ? THREE.MathUtils.clamp(Math.abs(FacingScalar), 0, 1) : 0;
  const SlideSign = Into < 0 ? StableFacingSign(First.Entry, Normal, FacingScalar) : 0;

  const FirstTravel = THREE.MathUtils.clamp(First.Resolved.length() / Scratch.Desired.length(), 0, 1);
  const RemainingDistance = Scratch.Desired.length() * (1 - FirstTravel);
  const GapPosition = AddLegalGap(First.Position, Normal);

  let FinalPosition = GapPosition.clone();
  let FinalEntry = First.Entry;

  if (SlideSign !== 0 && SlideRatio >= FacingSlideDeadzone && RemainingDistance > 0.000001) {
    Scratch.TangentMotion.copy(Scratch.TangentAxis)
      .multiplyScalar(SlideSign * RemainingDistance * SlideRatio);
    const Slide = TangentSweep(GapPosition, Scratch.TangentMotion);
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
  RecordContact(Result, Scratch.Desired, Facing, SlideRatio, SlideSign);
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

PointerLockControls.prototype.moveForward = function MoveForwardFacingWall(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveForward.call(this, Distance);

  const Axes = InputAxes();
  if (Math.abs(Axes.Forward) <= 0.000001) return PreviousMoveForward.call(this, Distance);
  const TotalDistance = TotalDistanceFromComponent(Distance, Axes.Forward);
  ResolveCombined(Camera, Axes.Forward, Axes.Right, TotalDistance);
  SkipNextRight = Math.abs(Axes.Right) > 0.000001;
};

PointerLockControls.prototype.moveRight = function MoveRightFacingWall(Distance) {
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
  ContactMemory.Entry = null;
  ContactMemory.SlideSign = 0;
  ContactMemory.LastHit = -Infinity;
});

Player.GetPlayerRadius = () => CoreRadius;

window.__STORE_MOVEMENT_AUTHORITY__ = {
  ResolveCombined,
  GetCoreRadius: () => CoreRadius,
  GetContactGap: () => ContactGap,
  GetFacingSlideDeadzone: () => FacingSlideDeadzone
};
window.__STORE_MOVEMENT_AUTHORITY_BUILD__ = "V0.12.25";
