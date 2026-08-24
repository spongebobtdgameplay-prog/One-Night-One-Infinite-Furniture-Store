import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
const SurfaceContact = window.__STORE_SURFACE_CONTACT_UTILITY__;
if (!Game?.Scene || !Game?.Camera || !Game?.CollisionBoxes || !Player || !Collision || !SurfaceContact) {
  throw new Error("Game, player, collision utility, and surface contact utility must load before wall nerves.");
}

const CoreRadius = 0.24;
const SlideIntentThreshold = 0.18;

const MovementScratch = {
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  Delta: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3(),
  Tangent: new THREE.Vector3()
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
  { Joint: "Shoulder.L", Child: "UpperArm.L", Radius: 0.072 },
  { Joint: "UpperArm.L", Child: "LowerArm.L", Radius: 0.070 },
  { Joint: "LowerArm.L", Child: "Wrist.L", Radius: 0.064 },
  { Joint: "Shoulder.R", Child: "UpperArm.R", Radius: 0.072 },
  { Joint: "UpperArm.R", Child: "LowerArm.R", Radius: 0.070 },
  { Joint: "LowerArm.R", Child: "Wrist.R", Radius: 0.064 },
  { Joint: "UpperLeg.L", Child: "LowerLeg.L", Radius: 0.086 },
  { Joint: "LowerLeg.L", Child: "Foot.L", Radius: 0.078 },
  { Joint: "UpperLeg.R", Child: "LowerLeg.R", Radius: 0.086 },
  { Joint: "LowerLeg.R", Child: "Foot.R", Radius: 0.078 }
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
  MovementScratch.DesiredDirection.y = 0;
  const DesiredLength = MovementScratch.DesiredDirection.length();
  if (DesiredLength > 0.000001) MovementScratch.DesiredDirection.divideScalar(DesiredLength);

  const Inward = Contact.Normal.lengthSq() > 0.5
    ? Math.max(0, -MovementScratch.DesiredDirection.dot(Contact.Normal))
    : 1;
  Contact.Strength = THREE.MathUtils.clamp(0.58 + Inward * 0.42, 0, 1);

  MovementScratch.Tangent.copy(Desired);
  MovementScratch.Tangent.y = 0;
  if (Contact.Normal.lengthSq() > 0.5) {
    MovementScratch.Tangent.addScaledVector(Contact.Normal, -MovementScratch.Tangent.dot(Contact.Normal));
  }
  const TangentRatio = DesiredLength > 0.000001 ? MovementScratch.Tangent.length() / DesiredLength : 0;
  Contact.Sliding = TangentRatio >= SlideIntentThreshold && Result.Resolved.lengthSq() > 0.000001;
  Contact.Type = Result.Entry?.Type || "Collision";
  Contact.LastHit = performance.now();
}

function ResolveRootMove(Camera, Desired) {
  const Result = Collision.ResolveHorizontalMove(
    Camera.position,
    Desired,
    CoreRadius,
    Game.CollisionBoxes,
    {
      Skin: 0.005,
      MaxIterations: 3,
      MaxSweepSteps: 42,
      BinarySteps: 13,
      AllowSlide: true,
      SlideIntentThreshold
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

PointerLockControls.prototype.moveForward = function MoveForwardWithIntentSlide(Distance) {
  const Camera = ControlCamera(this);
  if (Camera !== Game.Camera || !Number.isFinite(Distance)) return PreviousMoveForward.call(this, Distance);
  MovementScratch.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  MovementScratch.Forward.y = 0;
  if (MovementScratch.Forward.lengthSq() <= 0.000001) return;
  MovementScratch.Delta.copy(MovementScratch.Forward).normalize().multiplyScalar(Distance);
  ResolveRootMove(Camera, MovementScratch.Delta);
};

PointerLockControls.prototype.moveRight = function MoveRightWithIntentSlide(Distance) {
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

function RotateJointToTarget(Joint, Child, Target) {
  if (!Joint?.isBone || !Child?.isBone || !Joint.parent) return false;
  Joint.getWorldPosition(PoseScratch.Start);
  Child.getWorldPosition(PoseScratch.End);
  PoseScratch.CurrentDirection.copy(PoseScratch.End).sub(PoseScratch.Start);
  PoseScratch.TargetDirection.copy(Target).sub(PoseScratch.Start);
  if (PoseScratch.CurrentDirection.lengthSq() <= 0.000001 || PoseScratch.TargetDirection.lengthSq() <= 0.000001) return false;

  PoseScratch.CurrentDirection.normalize();
  PoseScratch.TargetDirection.normalize();
  if (PoseScratch.CurrentDirection.dot(PoseScratch.TargetDirection) > 0.9999995) return false;

  PoseScratch.DeltaQuaternion.setFromUnitVectors(PoseScratch.CurrentDirection, PoseScratch.TargetDirection);
  Joint.getWorldQuaternion(PoseScratch.JointQuaternion);
  PoseScratch.DesiredQuaternion.copy(PoseScratch.DeltaQuaternion).multiply(PoseScratch.JointQuaternion);
  Joint.parent.getWorldQuaternion(PoseScratch.ParentQuaternion).invert();
  PoseScratch.LocalQuaternion.copy(PoseScratch.ParentQuaternion).multiply(PoseScratch.DesiredQuaternion).normalize();
  Joint.quaternion.copy(PoseScratch.LocalQuaternion);
  Joint.updateMatrixWorld(true);
  return true;
}

function StateFor(Segment) {
  const Key = `${Segment.Joint}>${Segment.Child}`;
  let State = NerveState.get(Key);
  if (State) return State;
  State = {
    PreviousDirection: new THREE.Vector3(),
    HasPrevious: false,
    Contact: false,
    Normal: new THREE.Vector3(),
    Entry: null
  };
  NerveState.set(Key, State);
  return State;
}

function RememberDirection(State, Start, End) {
  State.PreviousDirection.copy(End).sub(Start);
  if (State.PreviousDirection.lengthSq() <= 0.000001) return;
  State.PreviousDirection.normalize();
  State.HasPrevious = true;
}

function ConstrainSegment(Pivot, Segment) {
  const Joint = Pivot.getObjectByName(Segment.Joint);
  const Child = Pivot.getObjectByName(Segment.Child);
  if (!Joint?.isBone || !Child?.isBone) return false;

  Joint.getWorldPosition(PoseScratch.Start);
  Child.getWorldPosition(PoseScratch.End);
  const State = StateFor(Segment);
  const Result = SurfaceContact.ResolveSurfaceCapsule(
    PoseScratch.Start,
    PoseScratch.End,
    Segment.Radius,
    Game.CollisionBoxes,
    PoseScratch.SafeEnd,
    {
      Skin: 0.004,
      Filter: StructuralCollision,
      PreviousDirection: State.HasPrevious ? State.PreviousDirection : null,
      BinarySteps: 16,
      InitialNormalPush: 0.025,
      MaxNormalPush: 32,
      ContactBias: 0.0015
    }
  );

  if (!Result.Hit) {
    State.Contact = false;
    State.Entry = null;
    State.Normal.set(0, 0, 0);
    RememberDirection(State, PoseScratch.Start, PoseScratch.End);
    return false;
  }

  State.Contact = true;
  State.Entry = Result.Entry;
  State.Normal.copy(Result.Normal);
  if (!Result.Solved) return false;

  const Changed = RotateJointToTarget(Joint, Child, PoseScratch.SafeEnd);
  Pivot.updateMatrixWorld(true);
  Child.getWorldPosition(PoseScratch.End);
  Joint.getWorldPosition(PoseScratch.Start);
  RememberDirection(State, PoseScratch.Start, PoseScratch.End);
  return Changed;
}

function ApplyFinalPoseNerves(Pivot) {
  for (let Pass = 0; Pass < 3; Pass += 1) {
    let Changed = false;
    for (const Segment of NerveSegments) {
      if (ConstrainSegment(Pivot, Segment)) Changed = true;
    }
    if (!Changed) break;
  }
}

const PreviousRender = Player.Render;
if (typeof PreviousRender !== "function") throw new Error("Player render function is unavailable for final-pose nerves.");

Player.Render = function RenderWithContinuousWallNerves(Renderer, Scene, Camera) {
  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
      if (!Pivot) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      SavePose(Pivot);
      try {
        ApplyFinalPoseNerves(Pivot);
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RestorePose(Pivot);
      }
    }
  };
  return PreviousRender.call(Player, ProxyRenderer, Scene, Camera);
};

Player.GetPlayerRadius = () => CoreRadius;

window.__STORE_PART_NERVE_COLLISION__ = {
  Segments: NerveSegments,
  State: NerveState,
  Apply: ApplyFinalPoseNerves,
  ResolveRootMove,
  GetCoreRadius: () => CoreRadius
};
window.__STORE_PART_NERVE_COLLISION_BUILD__ = "V0.12.16";
