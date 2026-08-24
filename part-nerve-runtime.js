import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Game?.Scene || !Game?.Camera || !Game?.CollisionBoxes || !Player || !Collision) throw new Error("Game, player, and collision utility must load before part nerve collision.");

const BatchWindowMs = 3.5;
const MovementRadius = () => THREE.MathUtils.clamp((Number(Player.GetPlayerRadius?.()) || 0.34) * 0.62, 0.19, 0.22);

const MovementBatch = {
  Camera: null,
  Start: new THREE.Vector3(),
  Desired: new THREE.Vector3(),
  LastCallAt: -Infinity
};

const MovementScratch = {
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  Delta: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3(),
  ResolvedDirection: new THREE.Vector3()
};

const PoseScratch = {
  Start: new THREE.Vector3(),
  End: new THREE.Vector3(),
  SafeEnd: new THREE.Vector3(),
  CurrentDirection: new THREE.Vector3(),
  TargetDirection: new THREE.Vector3(),
  ParentQuaternion: new THREE.Quaternion(),
  JointQuaternion: new THREE.Quaternion(),
  DeltaQuaternion: new THREE.Quaternion(),
  DesiredQuaternion: new THREE.Quaternion(),
  LocalQuaternion: new THREE.Quaternion(),
  SavedPose: new Map()
};

const NerveSegments = [
  ["Shoulder.L", "UpperArm.L", 0.070, 0.76],
  ["UpperArm.L", "LowerArm.L", 0.068, 0.82],
  ["LowerArm.L", "Wrist.L", 0.060, 0.88],
  ["Shoulder.R", "UpperArm.R", 0.070, 0.76],
  ["UpperArm.R", "LowerArm.R", 0.068, 0.82],
  ["LowerArm.R", "Wrist.R", 0.060, 0.88],
  ["UpperLeg.L", "LowerLeg.L", 0.082, 0.76],
  ["LowerLeg.L", "Foot.L", 0.074, 0.82],
  ["UpperLeg.R", "LowerLeg.R", 0.082, 0.76],
  ["LowerLeg.R", "Foot.R", 0.074, 0.82]
];

function StructuralCollision(Entry) {
  return Collision.IsStructure(Entry);
}

function RecordMovementContact(Result, Desired) {
  const Contact = window.__STORE_MOVEMENT_CONTACT__ || {
    Normal: new THREE.Vector3(),
    Position: new THREE.Vector3(),
    DesiredDirection: new THREE.Vector3(),
    SlideDirection: new THREE.Vector3(),
    Strength: 0,
    Sliding: false,
    Type: "",
    LastHit: -Infinity
  };
  window.__STORE_MOVEMENT_CONTACT__ = Contact;

  if (!Result.Hit) return;
  Contact.Normal.copy(Result.Normal);
  Contact.Position.copy(Result.Position);
  Contact.DesiredDirection.copy(Desired);
  if (Contact.DesiredDirection.lengthSq() > 0.000001) Contact.DesiredDirection.normalize();
  Contact.SlideDirection.copy(Result.Resolved);
  if (Contact.SlideDirection.lengthSq() > 0.000001) Contact.SlideDirection.normalize();

  MovementScratch.DesiredDirection.copy(Desired);
  if (MovementScratch.DesiredDirection.lengthSq() > 0.000001) MovementScratch.DesiredDirection.normalize();
  const Inward = Math.max(0, -MovementScratch.DesiredDirection.dot(Result.Normal));
  Contact.Strength = THREE.MathUtils.clamp(0.56 + Inward * 0.44, 0, 1);

  MovementScratch.ResolvedDirection.copy(Result.Resolved);
  if (MovementScratch.ResolvedDirection.lengthSq() > 0.000001) MovementScratch.ResolvedDirection.normalize();
  Contact.Sliding = Result.Resolved.lengthSq() > 0.00001 && Math.abs(MovementScratch.ResolvedDirection.dot(Result.Normal)) < 0.25;
  Contact.Type = Result.Entry?.Type || "Collision";
  Contact.LastHit = performance.now();
}

function ResolveCameraMove(Camera, Desired) {
  const Result = Collision.ResolveHorizontalMove(
    MovementBatch.Start,
    Desired,
    MovementRadius(),
    Game.CollisionBoxes,
    {
      Skin: 0.007,
      MaxIterations: 3,
      MaxSweepSteps: 30,
      BinarySteps: 10,
      AllowSlide: true,
      SlideIntentThreshold: 0.14
    }
  );
  Camera.position.x = Result.Position.x;
  Camera.position.z = Result.Position.z;
  RecordMovementContact(Result, Desired);
}

function ApplyMovementRequest(Camera, WorldDelta) {
  if (!Camera || WorldDelta.lengthSq() <= 0.00000001) return;
  const Now = performance.now();
  const SameBatch = MovementBatch.Camera === Camera && Now - MovementBatch.LastCallAt <= BatchWindowMs;

  if (SameBatch) {
    Camera.position.copy(MovementBatch.Start);
    MovementBatch.Desired.add(WorldDelta);
  } else {
    MovementBatch.Camera = Camera;
    MovementBatch.Start.copy(Camera.position);
    MovementBatch.Desired.copy(WorldDelta);
  }

  ResolveCameraMove(Camera, MovementBatch.Desired);
  MovementBatch.LastCallAt = Now;
}

const PreviousMoveForward = PointerLockControls.prototype.moveForward;
const PreviousMoveRight = PointerLockControls.prototype.moveRight;

function ControlCamera(Control) {
  return Control?.object || Control?.camera || Game.Camera;
}

PointerLockControls.prototype.moveForward = function MoveForwardWithUtility(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveForward.call(this, Distance);
  MovementScratch.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  MovementScratch.Forward.y = 0;
  if (MovementScratch.Forward.lengthSq() <= 0.000001) return;
  MovementScratch.Delta.copy(MovementScratch.Forward).normalize().multiplyScalar(Distance);
  ApplyMovementRequest(Camera, MovementScratch.Delta);
};

PointerLockControls.prototype.moveRight = function MoveRightWithUtility(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveRight.call(this, Distance);
  MovementScratch.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  MovementScratch.Right.y = 0;
  if (MovementScratch.Right.lengthSq() <= 0.000001) return;
  MovementScratch.Delta.copy(MovementScratch.Right).normalize().multiplyScalar(Distance);
  ApplyMovementRequest(Camera, MovementScratch.Delta);
};

function SavePose(Pivot) {
  PoseScratch.SavedPose.clear();
  for (const [JointName, ChildName] of NerveSegments) {
    const Joint = Pivot.getObjectByName(JointName);
    const Child = Pivot.getObjectByName(ChildName);
    if (Joint?.isBone && !PoseScratch.SavedPose.has(Joint)) PoseScratch.SavedPose.set(Joint, Joint.quaternion.clone());
    if (Child?.isBone && !PoseScratch.SavedPose.has(Child)) PoseScratch.SavedPose.set(Child, Child.quaternion.clone());
  }
}

function RestorePose(Pivot) {
  for (const [Bone, Quaternion] of PoseScratch.SavedPose) Bone.quaternion.copy(Quaternion);
  Pivot.updateMatrixWorld(true);
}

function RotateJointToward(Joint, Child, Target, Strength) {
  if (!Joint?.isBone || !Child?.isBone || !Joint.parent) return;
  Joint.getWorldPosition(PoseScratch.Start);
  Child.getWorldPosition(PoseScratch.End);
  PoseScratch.CurrentDirection.copy(PoseScratch.End).sub(PoseScratch.Start);
  PoseScratch.TargetDirection.copy(Target).sub(PoseScratch.Start);
  if (PoseScratch.CurrentDirection.lengthSq() <= 0.000001 || PoseScratch.TargetDirection.lengthSq() <= 0.000001) return;

  PoseScratch.CurrentDirection.normalize();
  PoseScratch.TargetDirection.normalize();
  PoseScratch.DeltaQuaternion.setFromUnitVectors(PoseScratch.CurrentDirection, PoseScratch.TargetDirection);
  Joint.getWorldQuaternion(PoseScratch.JointQuaternion);
  PoseScratch.DesiredQuaternion.copy(PoseScratch.DeltaQuaternion).multiply(PoseScratch.JointQuaternion);
  Joint.parent.getWorldQuaternion(PoseScratch.ParentQuaternion);
  PoseScratch.ParentQuaternion.invert();
  PoseScratch.LocalQuaternion.copy(PoseScratch.ParentQuaternion).multiply(PoseScratch.DesiredQuaternion).normalize();
  Joint.quaternion.slerp(PoseScratch.LocalQuaternion, THREE.MathUtils.clamp(Strength, 0, 1));
  Joint.updateMatrixWorld(true);
}

function ConstrainNerveSegment(Pivot, JointName, ChildName, Radius, Strength) {
  const Joint = Pivot.getObjectByName(JointName);
  const Child = Pivot.getObjectByName(ChildName);
  if (!Joint?.isBone || !Child?.isBone) return false;

  Joint.getWorldPosition(PoseScratch.Start);
  Child.getWorldPosition(PoseScratch.End);
  const Result = Collision.ClampSegmentToWorld(
    PoseScratch.Start,
    PoseScratch.End,
    Radius,
    Game.CollisionBoxes,
    PoseScratch.SafeEnd,
    { Skin: 0.007, Filter: StructuralCollision }
  );
  if (!Result.Hit) return false;

  RotateJointToward(Joint, Child, PoseScratch.SafeEnd, Strength);
  Pivot.updateMatrixWorld(true);
  return true;
}

function ApplyNerveCollision(Pivot) {
  for (let Pass = 0; Pass < 3; Pass += 1) {
    let Changed = false;
    for (const [JointName, ChildName, Radius, Strength] of NerveSegments) {
      if (ConstrainNerveSegment(Pivot, JointName, ChildName, Radius, Strength)) Changed = true;
    }
    if (!Changed) break;
  }
}

const PreviousRender = Player.Render;
if (typeof PreviousRender === "function") {
  Player.Render = function RenderWithPartNerves(Renderer, Scene, Camera) {
    const ProxyRenderer = {
      render(RenderScene, RenderCamera) {
        const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
        if (!Pivot) {
          Renderer.render(RenderScene, RenderCamera);
          return;
        }

        SavePose(Pivot);
        try {
          ApplyNerveCollision(Pivot);
          Renderer.render(RenderScene, RenderCamera);
        } finally {
          RestorePose(Pivot);
        }
      }
    };
    return PreviousRender.call(Player, ProxyRenderer, Scene, Camera);
  };
}

window.__STORE_PART_NERVE_COLLISION__ = {
  Segments: NerveSegments,
  ConstrainSegment: ConstrainNerveSegment,
  Apply: ApplyNerveCollision
};
window.__STORE_PART_NERVE_COLLISION_BUILD__ = "V0.12.12";