import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
const SurfaceContact = window.__STORE_SURFACE_CONTACT_UTILITY__;
const Physics = window.__STORE_PROCEDURAL_PHYSICS__ || null;
if (!Game?.Scene || !Player || !Collision || !SurfaceContact) {
  throw new Error("Game, player, and contact utilities must load before final contact pass.");
}

const Segments = [
  { Joint: "Shoulder.L", Child: "UpperArm.L", Radius: 0.100 },
  { Joint: "UpperArm.L", Child: "LowerArm.L", Radius: 0.108 },
  { Joint: "LowerArm.L", Child: "Wrist.L", Radius: 0.098 },
  { Joint: "Shoulder.R", Child: "UpperArm.R", Radius: 0.100 },
  { Joint: "UpperArm.R", Child: "LowerArm.R", Radius: 0.108 },
  { Joint: "LowerArm.R", Child: "Wrist.R", Radius: 0.098 },
  { Joint: "UpperLeg.L", Child: "LowerLeg.L", Radius: 0.122 },
  { Joint: "LowerLeg.L", Child: "Foot.L", Radius: 0.108 },
  { Joint: "UpperLeg.R", Child: "LowerLeg.R", Radius: 0.122 },
  { Joint: "LowerLeg.R", Child: "Foot.R", Radius: 0.108 }
];

const Scratch = {
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
  SavedQuaternions: new Map(),
  SavedScales: new Map(),
  SavedVisibility: new Map()
};

const SegmentState = new Map();

function BodyCollision(Entry) {
  return Boolean(Entry?.ProceduralBodyContact || Collision.IsStructure(Entry));
}

function StateFor(Segment) {
  const Key = `${Segment.Joint}>${Segment.Child}`;
  let State = SegmentState.get(Key);
  if (State) return State;
  State = {
    PreviousDirection: new THREE.Vector3(),
    HasPrevious: false
  };
  SegmentState.set(Key, State);
  return State;
}

function SaveBone(Bone) {
  if (!Bone?.isBone || Scratch.SavedQuaternions.has(Bone)) return;
  Scratch.SavedQuaternions.set(Bone, Bone.quaternion.clone());
}

function RotateJointToTarget(Pivot, Joint, Child, Target) {
  if (!Joint?.isBone || !Child?.isBone || !Joint.parent) return false;
  Pivot.updateMatrixWorld(true);
  Joint.getWorldPosition(Scratch.Start);
  Child.getWorldPosition(Scratch.End);
  Scratch.CurrentDirection.copy(Scratch.End).sub(Scratch.Start);
  Scratch.TargetDirection.copy(Target).sub(Scratch.Start);
  if (Scratch.CurrentDirection.lengthSq() <= 0.000001 || Scratch.TargetDirection.lengthSq() <= 0.000001) return false;

  Scratch.CurrentDirection.normalize();
  Scratch.TargetDirection.normalize();
  if (Scratch.CurrentDirection.dot(Scratch.TargetDirection) > 0.9999995) return false;

  Scratch.DeltaQuaternion.setFromUnitVectors(Scratch.CurrentDirection, Scratch.TargetDirection);
  Joint.getWorldQuaternion(Scratch.JointQuaternion);
  Scratch.DesiredQuaternion.copy(Scratch.DeltaQuaternion).multiply(Scratch.JointQuaternion);
  Joint.parent.getWorldQuaternion(Scratch.ParentQuaternion).invert();
  Scratch.LocalQuaternion.copy(Scratch.ParentQuaternion).multiply(Scratch.DesiredQuaternion).normalize();
  Joint.quaternion.copy(Scratch.LocalQuaternion);
  Pivot.updateMatrixWorld(true);
  return true;
}

function RememberDirection(State, Start, End) {
  State.PreviousDirection.copy(End).sub(Start);
  if (State.PreviousDirection.lengthSq() <= 0.000001) return;
  State.PreviousDirection.normalize();
  State.HasPrevious = true;
}

function ConstrainSegment(Pivot, Segment, Entries) {
  const Joint = Pivot.getObjectByName(Segment.Joint);
  const Child = Pivot.getObjectByName(Segment.Child);
  if (!Joint?.isBone || !Child?.isBone) return false;

  SaveBone(Joint);
  Joint.getWorldPosition(Scratch.Start);
  Child.getWorldPosition(Scratch.End);
  const State = StateFor(Segment);

  const Result = SurfaceContact.ResolveSurfaceCapsule(
    Scratch.Start,
    Scratch.End,
    Segment.Radius,
    Entries,
    Scratch.SafeEnd,
    {
      Skin: 0.004,
      Filter: BodyCollision,
      PreviousDirection: State.HasPrevious ? State.PreviousDirection : null,
      BinarySteps: 18,
      InitialNormalPush: 0.018,
      MaxNormalPush: 48,
      ContactBias: 0.0025
    }
  );

  if (!Result.Hit) {
    RememberDirection(State, Scratch.Start, Scratch.End);
    return false;
  }
  if (!Result.Solved) return false;

  const Changed = RotateJointToTarget(Pivot, Joint, Child, Scratch.SafeEnd);
  Pivot.updateMatrixWorld(true);
  Joint.getWorldPosition(Scratch.Start);
  Child.getWorldPosition(Scratch.End);
  RememberDirection(State, Scratch.Start, Scratch.End);
  return Changed;
}

function ApplyMeshSafeNerves(Pivot) {
  const Entries = Physics?.GetBodyContactEntries?.(Game.CollisionBoxes, Game.Camera?.position, 2.7) || Game.CollisionBoxes;
  for (let Pass = 0; Pass < 5; Pass += 1) {
    let Changed = false;
    for (const Segment of Segments) {
      if (ConstrainSegment(Pivot, Segment, Entries)) Changed = true;
    }
    if (!Changed) break;
  }
}

function HideFirstPersonHead(Pivot) {
  if (Player.IsThirdPerson?.()) return;

  for (const Name of ["Neck", "Head"]) {
    const Bone = Pivot.getObjectByName(Name);
    if (!Bone?.isBone) continue;
    Scratch.SavedScales.set(Bone, Bone.scale.clone());
    Bone.scale.setScalar(0.00001);
  }

  Pivot.traverse(Object => {
    if (!Object?.isMesh || !/head|helmet|hardhat|hair/i.test(String(Object.name || ""))) return;
    Scratch.SavedVisibility.set(Object, Object.visible);
    Object.visible = false;
  });
  Pivot.updateMatrixWorld(true);
}

function RestoreFinalPass(Pivot) {
  for (const [Bone, Quaternion] of Scratch.SavedQuaternions) Bone.quaternion.copy(Quaternion);
  for (const [Bone, Scale] of Scratch.SavedScales) Bone.scale.copy(Scale);
  for (const [Object, Visible] of Scratch.SavedVisibility) Object.visible = Visible;
  Scratch.SavedQuaternions.clear();
  Scratch.SavedScales.clear();
  Scratch.SavedVisibility.clear();
  Pivot.updateMatrixWorld(true);
}

const PreviousRender = Player.Render;
if (typeof PreviousRender !== "function") throw new Error("Player render function is unavailable for final contact pass.");

Player.Render = function RenderWithFinalContact(Renderer, Scene, Camera) {
  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
      if (!Pivot) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      try {
        ApplyMeshSafeNerves(Pivot);
        HideFirstPersonHead(Pivot);
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RestoreFinalPass(Pivot);
      }
    }
  };

  return PreviousRender.call(Player, ProxyRenderer, Scene, Camera);
};

window.__STORE_FINAL_CONTACT__ = {
  Segments,
  State: SegmentState,
  Apply: ApplyMeshSafeNerves
};
window.__STORE_FINAL_CONTACT_BUILD__ = "V0.27.4-PHYSICS";
