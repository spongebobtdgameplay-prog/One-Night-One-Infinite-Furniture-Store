import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
if (!Game?.Scene || !Game?.Camera || !Game?.CollisionBoxes || !Player || !Collision) throw new Error("Game, player, and collision utility must load before part nerve collision.");

const CoreRadius = () => THREE.MathUtils.clamp((Number(Player.GetPlayerRadius?.()) || 0.34) * 0.64, 0.20, 0.225);

const MovementScratch = {
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  Delta: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3()
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
  PreferredDirection: new THREE.Vector3(),
  CameraForward: new THREE.Vector3(),
  CameraRight: new THREE.Vector3(),
  SavedPose: new Map()
};

const NerveSegments = [
  { Joint: "Shoulder.L", Child: "UpperArm.L", Radius: 0.072, Preference: "down-left" },
  { Joint: "UpperArm.L", Child: "LowerArm.L", Radius: 0.070, Preference: "down-left" },
  { Joint: "LowerArm.L", Child: "Wrist.L", Radius: 0.062, Preference: "down-left" },
  { Joint: "Shoulder.R", Child: "UpperArm.R", Radius: 0.072, Preference: "down-right" },
  { Joint: "UpperArm.R", Child: "LowerArm.R", Radius: 0.070, Preference: "down-right" },
  { Joint: "LowerArm.R", Child: "Wrist.R", Radius: 0.062, Preference: "down-right" },
  { Joint: "UpperLeg.L", Child: "LowerLeg.L", Radius: 0.086, Preference: "back-left" },
  { Joint: "LowerLeg.L", Child: "Foot.L", Radius: 0.078, Preference: "back-left" },
  { Joint: "UpperLeg.R", Child: "LowerLeg.R", Radius: 0.086, Preference: "back-right" },
  { Joint: "LowerLeg.R", Child: "Foot.R", Radius: 0.078, Preference: "back-right" }
];

const NerveState = new Map();

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
  Contact.Strength = THREE.MathUtils.clamp(0.58 + Inward * 0.42, 0, 1);
  Contact.Sliding = false;
  Contact.Type = Result.Entry?.Type || "Collision";
  Contact.LastHit = performance.now();
}

function ResolveRootMove(Camera, Desired) {
  const Result = Collision.ResolveHorizontalMove(
    Camera.position,
    Desired,
    CoreRadius(),
    Game.CollisionBoxes,
    {
      Skin: 0.005,
      MaxIterations: 1,
      MaxSweepSteps: 36,
      BinarySteps: 12,
      AllowSlide: false
    }
  );
  Camera.position.x = Result.Position.x;
  Camera.position.z = Result.Position.z;
  RecordMovementContact(Result, Desired);
  return Result;
}

const PreviousMoveForward = PointerLockControls.prototype.moveForward;
const PreviousMoveRight = PointerLockControls.prototype.moveRight;

function ControlCamera(Control) {
  return Control?.object || Control?.camera || Game.Camera;
}

PointerLockControls.prototype.moveForward = function MoveForwardWithNerveCore(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveForward.call(this, Distance);
  MovementScratch.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  MovementScratch.Forward.y = 0;
  if (MovementScratch.Forward.lengthSq() <= 0.000001) return;
  MovementScratch.Delta.copy(MovementScratch.Forward).normalize().multiplyScalar(Distance);
  ResolveRootMove(Camera, MovementScratch.Delta);
};

PointerLockControls.prototype.moveRight = function MoveRightWithNerveCore(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveRight.call(this, Distance);
  MovementScratch.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  MovementScratch.Right.y = 0;
  if (MovementScratch.Right.lengthSq() <= 0.000001) return;
  MovementScratch.Delta.copy(MovementScratch.Right).normalize().multiplyScalar(Distance);
  ResolveRootMove(Camera, MovementScratch.Delta);
};

function SavePose(Pivot) {
  PoseScratch.SavedPose.clear();
  for (const Segment of NerveSegments) {
    const Joint = Pivot.getObjectByName(Segment.Joint);
    const Child = Pivot.getObjectByName(Segment.Child);
    if (Joint?.isBone && !PoseScratch.SavedPose.has(Joint)) PoseScratch.SavedPose.set(Joint, Joint.quaternion.clone());
    if (Child?.isBone && !PoseScratch.SavedPose.has(Child)) PoseScratch.SavedPose.set(Child, Child.quaternion.clone());
  }
}

function RestorePose(Pivot) {
  for (const [Bone, Quaternion] of PoseScratch.SavedPose) Bone.quaternion.copy(Quaternion);
  Pivot.updateMatrixWorld(true);
}

function RotateJointExactly(Joint, Child, Target) {
  if (!Joint?.isBone || !Child?.isBone || !Joint.parent) return false;
  Joint.getWorldPosition(PoseScratch.Start);
  Child.getWorldPosition(PoseScratch.End);
  PoseScratch.CurrentDirection.copy(PoseScratch.End).sub(PoseScratch.Start);
  PoseScratch.TargetDirection.copy(Target).sub(PoseScratch.Start);
  if (PoseScratch.CurrentDirection.lengthSq() <= 0.000001 || PoseScratch.TargetDirection.lengthSq() <= 0.000001) return false;

  PoseScratch.CurrentDirection.normalize();
  PoseScratch.TargetDirection.normalize();
  if (PoseScratch.CurrentDirection.dot(PoseScratch.TargetDirection) > 0.999999) return false;

  PoseScratch.DeltaQuaternion.setFromUnitVectors(PoseScratch.CurrentDirection, PoseScratch.TargetDirection);
  Joint.getWorldQuaternion(PoseScratch.JointQuaternion);
  PoseScratch.DesiredQuaternion.copy(PoseScratch.DeltaQuaternion).multiply(PoseScratch.JointQuaternion);
  Joint.parent.getWorldQuaternion(PoseScratch.ParentQuaternion).invert();
  PoseScratch.LocalQuaternion.copy(PoseScratch.ParentQuaternion).multiply(PoseScratch.DesiredQuaternion).normalize();
  Joint.quaternion.copy(PoseScratch.LocalQuaternion);
  Joint.updateMatrixWorld(true);
  return true;
}

function SegmentState(Segment) {
  const Key = `${Segment.Joint}>${Segment.Child}`;
  if (!NerveState.has(Key)) {
    NerveState.set(Key, {
      PreviousDirection: new THREE.Vector3(),
      HasPrevious: false,
      Contact: false
    });
  }
  return NerveState.get(Key);
}

function PreferredDirection(Segment, Camera) {
  PoseScratch.CameraForward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  PoseScratch.CameraForward.y = 0;
  if (PoseScratch.CameraForward.lengthSq() <= 0.000001) PoseScratch.CameraForward.set(0, 0, -1);
  else PoseScratch.CameraForward.normalize();
  PoseScratch.CameraRight.set(-PoseScratch.CameraForward.z, 0, PoseScratch.CameraForward.x).normalize();

  const Side = Segment.Preference.endsWith("left") ? -1 : 1;
  if (Segment.Preference.startsWith("down")) {
    PoseScratch.PreferredDirection.set(0, -1, 0)
      .addScaledVector(PoseScratch.CameraRight, Side * 0.30)
      .addScaledVector(PoseScratch.CameraForward, -0.12)
      .normalize();
  } else {
    PoseScratch.PreferredDirection.copy(PoseScratch.CameraForward).multiplyScalar(-0.70)
      .addScaledVector(PoseScratch.CameraRight, Side * 0.22)
      .addScaledVector(new THREE.Vector3(0, -1, 0), 0.18)
      .normalize();
  }
  return PoseScratch.PreferredDirection;
}

function ConstrainNerveSegment(Pivot, Segment, Camera) {
  const Joint = Pivot.getObjectByName(Segment.Joint);
  const Child = Pivot.getObjectByName(Segment.Child);
  if (!Joint?.isBone || !Child?.isBone) return false;

  Joint.getWorldPosition(PoseScratch.Start);
  Child.getWorldPosition(PoseScratch.End);
  const State = SegmentState(Segment);
  const Result = Collision.ResolveFixedLengthCapsule(
    PoseScratch.Start,
    PoseScratch.End,
    Segment.Radius,
    Game.CollisionBoxes,
    PoseScratch.SafeEnd,
    {
      Skin: 0.006,
      Filter: StructuralCollision,
      PreviousDirection: State.HasPrevious ? State.PreviousDirection : null,
      PreferredDirection: PreferredDirection(Segment, Camera),
      AngleStepDegrees: 6,
      AzimuthSteps: 18,
      MaxAngleDegrees: 118
    }
  );

  if (!Result.Hit) {
    PoseScratch.CurrentDirection.copy(PoseScratch.End).sub(PoseScratch.Start);
    if (PoseScratch.CurrentDirection.lengthSq() > 0.000001) {
      State.PreviousDirection.copy(PoseScratch.CurrentDirection).normalize();
      State.HasPrevious = true;
    }
    State.Contact = false;
    return false;
  }

  State.Contact = true;
  if (!Result.Solved) return false;

  RotateJointExactly(Joint, Child, PoseScratch.SafeEnd);
  Pivot.updateMatrixWorld(true);
  Child.getWorldPosition(PoseScratch.End);
  PoseScratch.CurrentDirection.copy(PoseScratch.End).sub(PoseScratch.Start);
  if (PoseScratch.CurrentDirection.lengthSq() > 0.000001) {
    State.PreviousDirection.copy(PoseScratch.CurrentDirection).normalize();
    State.HasPrevious = true;
  }
  return true;
}

function ApplyNerveCollision(Pivot, Camera) {
  for (let Pass = 0; Pass < 4; Pass += 1) {
    let Changed = false;
    for (const Segment of NerveSegments) {
      if (ConstrainNerveSegment(Pivot, Segment, Camera)) Changed = true;
    }
    if (!Changed) break;
  }
}

const PreviousRender = Player.Render;
if (typeof PreviousRender !== "function") throw new Error("Player render function is unavailable for part nerves.");

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
        ApplyNerveCollision(Pivot, RenderCamera);
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RestorePose(Pivot);
      }
    }
  };
  return PreviousRender.call(Player, ProxyRenderer, Scene, Camera);
};

window.__STORE_PART_NERVE_COLLISION__ = {
  Segments: NerveSegments,
  State: NerveState,
  Apply: ApplyNerveCollision,
  ResolveRootMove
};
window.__STORE_PART_NERVE_COLLISION_BUILD__ = "V0.12.13";