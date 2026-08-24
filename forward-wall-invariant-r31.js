import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
const Movement = window.__STORE_MOVEMENT_AUTHORITY__;

if (!Game?.Camera || !Game?.Scene || !Game?.CollisionBoxes || !Player || !Collision || !Movement) {
  throw new Error("Movement authority must load before the forward wall invariant.");
}

const KeyState = new Set();
const CoreRadius = Number(Movement.GetCoreRadius?.()) || Number(Player.GetPlayerRadius?.()) || 0.285;
const LegacyBinarySteps = 16;

const Scratch = {
  Forward: new THREE.Vector3(),
  Desired: new THREE.Vector3(),
  Candidate: new THREE.Vector3(),
  Facing: new THREE.Vector3(),
  FacingQuaternion: new THREE.Quaternion()
};

function HasForwardInput() {
  return KeyState.has("KeyW") || KeyState.has("KeyS");
}

function HasStrafeInput() {
  return KeyState.has("KeyA") || KeyState.has("KeyD");
}

function HorizontalCameraForward(Camera) {
  Scratch.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  Scratch.Forward.y = 0;
  if (Scratch.Forward.lengthSq() <= 0.000001) Scratch.Forward.set(0, 0, -1);
  else Scratch.Forward.normalize();
  return Scratch.Forward;
}

function BoundsFinite(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.z, Bounds.max.x, Bounds.max.z].every(Number.isFinite)
  );
}

function LegacyBlocked(Position) {
  if (typeof Movement.LegacyBlocked === "function") return Movement.LegacyBlocked(Position);

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

function ReadFacing(Fallback) {
  const Pivot = Game.Scene.getObjectByName("PlayerCharacterPivot");
  if (Pivot) {
    Pivot.getWorldQuaternion(Scratch.FacingQuaternion);
    Scratch.Facing.set(0, 0, 1).applyQuaternion(Scratch.FacingQuaternion);
    Scratch.Facing.y = 0;
    if (Scratch.Facing.lengthSq() > 0.000001) return Scratch.Facing.normalize();
  }
  return Scratch.Facing.copy(Fallback).normalize();
}

function RecordNoSlideContact(Result, DesiredDirection) {
  if (!Result?.Hit) return;
  const Contact = window.__STORE_MOVEMENT_CONTACT__ ||= {};
  for (const Key of ["Normal", "Position", "DesiredDirection", "SlideDirection", "CharacterFacing"]) {
    if (!Contact[Key]?.isVector3) Contact[Key] = new THREE.Vector3();
  }

  Contact.Normal.copy(Result.Normal || new THREE.Vector3());
  if (Contact.Normal.lengthSq() > 0.000001) Contact.Normal.normalize();
  Contact.Position.copy(Result.Position);
  Contact.DesiredDirection.copy(DesiredDirection);
  if (Contact.DesiredDirection.lengthSq() > 0.000001) Contact.DesiredDirection.normalize();
  Contact.CharacterFacing.copy(ReadFacing(Contact.DesiredDirection));
  Contact.SlideDirection.set(0, 0, 0);
  Contact.SlideAmount = 0;
  Contact.IntentInward = Math.max(0, -Contact.DesiredDirection.dot(Contact.Normal));
  Contact.IntentTangent = 0;
  Contact.FacingTangent = 0;
  Contact.FacingAngle = 0;
  Contact.Strength = 1;
  Contact.Sliding = false;
  Contact.Type = Result.Entry?.Type || "Collision";
  Contact.LastHit = performance.now();
}

function ResolveForwardOnly(Camera, Distance) {
  const Start = Camera.position.clone();
  HorizontalCameraForward(Camera);
  Scratch.Desired.copy(Scratch.Forward).multiplyScalar(Distance);

  const Result = Collision.ResolveHorizontalMove(Start, Scratch.Desired, CoreRadius, Game.CollisionBoxes, {
    Skin: 0.006,
    MaxIterations: 1,
    MaxSweepSteps: 52,
    BinarySteps: 18,
    AllowSlide: false
  });

  const Safe = ClampToLegacySafe(Start, Result.Position);
  Camera.position.x = Safe.x;
  Camera.position.z = Safe.z;
  Result.Position.copy(Safe);
  Result.Resolved.copy(Safe).sub(Start);
  Result.Resolved.y = 0;

  Scratch.Forward.copy(Scratch.Desired);
  if (Scratch.Forward.lengthSq() > 0.000001) Scratch.Forward.normalize();
  RecordNoSlideContact(Result, Scratch.Forward);
  return Result;
}

const PreviousMoveForward = PointerLockControls.prototype.moveForward;

function ControlCamera(Control) {
  return Control?.object || Control?.camera || Game.Camera;
}

PointerLockControls.prototype.moveForward = function MoveForwardWithHardWallInvariant(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera) return PreviousMoveForward.call(this, Distance);
  if (!Number.isFinite(Distance)) return;

  // Absolute rule: W/S alone is NEVER allowed to become tangent movement.
  // A/D must be physically held before any wall-slide authority may run.
  if (HasForwardInput() && !HasStrafeInput()) {
    return ResolveForwardOnly(Camera, Distance);
  }

  return PreviousMoveForward.call(this, Distance);
};

addEventListener("keydown", Event => {
  if (/^Key[WASD]$/.test(Event.code)) KeyState.add(Event.code);
});
addEventListener("keyup", Event => {
  if (/^Key[WASD]$/.test(Event.code)) KeyState.delete(Event.code);
});
addEventListener("blur", () => KeyState.clear());

window.__STORE_FORWARD_WALL_INVARIANT__ = {
  ResolveForwardOnly,
  HasForwardInput,
  HasStrafeInput
};
window.__STORE_FORWARD_WALL_INVARIANT_BUILD__ = "V0.12.33";
