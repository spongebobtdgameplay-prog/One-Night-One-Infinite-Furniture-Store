import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Game?.Camera || !Game?.CollisionBoxes || !Player || !Collision) {
  throw new Error("Game, player, and collision utility must load before movement authority.");
}

const CoreRadius = 0.285;
const ContactGap = 0.014;
const MinimumSlideRatio = 0.0015;
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

function RecordContact(Result, Desired, SlideRatio = 0) {
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
  Contact.Sliding = Contact.SlideAmount >= MinimumSlideRatio && Result.Resolved.lengthSq() > 0.000001;
  Contact.Type = Result.Entry?.Type || "Collision";
  Contact.LastHit = performance.now();
}

function FirstHit(Start, Desired) {
  return Collision.ResolveHorizontalMove(
    Start,
    Desired,
    CoreRadius,
    Game.CollisionBoxes,
    {
      Skin: 0.008,
      MaxIterations: 1,
      MaxSweepSteps: 48,
      BinarySteps: 16,
      AllowSlide: false
    }
  );
}

function TangentSweep(Start, TangentMotion) {
  return Collision.ResolveHorizontalMove(
    Start,
    TangentMotion,
    CoreRadius,
    Game.CollisionBoxes,
    {
      Skin: 0.006,
      MaxIterations: 1,
      MaxSweepSteps: 48,
      BinarySteps: 16,
      AllowSlide: false
    }
  );
}

function AddLegalWallGap(Position, Normal) {
  Scratch.GapPosition.copy(Position).addScaledVector(Normal, ContactGap);
  Scratch.GapPosition.y = Position.y;

  if (!Collision.IsCircleBlocked(Scratch.GapPosition, CoreRadius, Game.CollisionBoxes)) {
    return Scratch.GapPosition;
  }

  Scratch.GapPosition.copy(Position).addScaledVector(Normal, ContactGap * 0.5);
  Scratch.GapPosition.y = Position.y;
  if (!Collision.IsCircleBlocked(Scratch.GapPosition, CoreRadius, Game.CollisionBoxes)) {
    return Scratch.GapPosition;
  }

  return Position;
}

function ResolveInputAxis(Camera, Desired, AllowInputSlide) {
  Scratch.Start.copy(Camera.position);
  Scratch.Desired.copy(Desired);
  Scratch.Desired.y = 0;

  const DesiredLength = Scratch.Desired.length();
  if (DesiredLength <= 0.000001) return null;

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

  const GapPosition = AddLegalWallGap(First.Position, Normal);
  let FinalPosition = GapPosition.clone();
  let FinalEntry = First.Entry;
  let SlideRatio = 0;

  if (AllowInputSlide) {
    Scratch.Tangent.copy(Scratch.Desired);
    const IntoNormal = Scratch.Tangent.dot(Normal);
    Scratch.Tangent.addScaledVector(Normal, -IntoNormal);
    const TangentLength = Scratch.Tangent.length();
    SlideRatio = THREE.MathUtils.clamp(TangentLength / DesiredLength, 0, 1);

    const FirstTravel = THREE.MathUtils.clamp(First.Resolved.length() / DesiredLength, 0, 1);
    const RemainingRatio = 1 - FirstTravel;

    if (SlideRatio >= MinimumSlideRatio && RemainingRatio > 0.000001) {
      Scratch.Tangent.multiplyScalar(RemainingRatio);
      const Slide = TangentSweep(GapPosition, Scratch.Tangent);
      FinalPosition.copy(Slide.Position);
      if (Slide.Entry) FinalEntry = Slide.Entry;
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

  RecordContact(Result, Scratch.Desired, SlideRatio);
  return Result;
}

const PreviousMoveForward = PointerLockControls.prototype.moveForward;
const PreviousMoveRight = PointerLockControls.prototype.moveRight;

function ControlCamera(Control) {
  return Control?.object || Control?.camera || Game.Camera;
}

PointerLockControls.prototype.moveForward = function MoveForwardWithoutSidewaysInjection(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveForward.call(this, Distance);
  Scratch.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  Scratch.Forward.y = 0;
  if (Scratch.Forward.lengthSq() <= 0.000001) return;
  Scratch.Desired.copy(Scratch.Forward).normalize().multiplyScalar(Distance);
  ResolveInputAxis(Camera, Scratch.Desired, false);
};

PointerLockControls.prototype.moveRight = function MoveRightWithInputAuthorizedSlide(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveRight.call(this, Distance);
  Scratch.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  Scratch.Right.y = 0;
  if (Scratch.Right.lengthSq() <= 0.000001) return;
  Scratch.Desired.copy(Scratch.Right).normalize().multiplyScalar(Distance);
  ResolveInputAxis(Camera, Scratch.Desired, true);
};

Player.GetPlayerRadius = () => CoreRadius;

window.__STORE_MOVEMENT_AUTHORITY__ = {
  ResolveInputAxis,
  GetCoreRadius: () => CoreRadius,
  GetContactGap: () => ContactGap,
  GetMinimumSlideRatio: () => MinimumSlideRatio
};
window.__STORE_MOVEMENT_AUTHORITY_BUILD__ = "V0.12.23";
