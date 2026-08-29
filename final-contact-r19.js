import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Collision = window.__STORE_COLLISION_UTILITY__;
const SurfaceContact = window.__STORE_SURFACE_CONTACT_UTILITY__;
const Physics = window.__STORE_PROCEDURAL_PHYSICS__ || null;
if (!Game?.Scene || !Player || !Collision || !SurfaceContact) {
  throw new Error("Game, player, and contact utilities must load before final contact pass.");
}

const BodyPoints = [
  { Bone: "Hips", Radius: 0.205 },
  { Bone: "Abdomen", Radius: 0.215 },
  { Bone: "Torso", Radius: 0.225 },
  { Bone: "Chest", Radius: 0.235 },
  { Bone: "Neck", Radius: 0.155 },
  { Bone: "Shoulder.L", Radius: 0.165 },
  { Bone: "Shoulder.R", Radius: 0.165 },
  { Bone: "UpperLeg.L", Radius: 0.175 },
  { Bone: "UpperLeg.R", Radius: 0.175 }
];

const BodyLinks = [
  { A: "Hips", B: "Abdomen", Radius: 0.220 },
  { A: "Abdomen", B: "Torso", Radius: 0.228 },
  { A: "Torso", B: "Chest", Radius: 0.238 },
  { A: "Chest", B: "Shoulder.L", Radius: 0.190 },
  { A: "Chest", B: "Shoulder.R", Radius: 0.190 },
  { A: "Hips", B: "UpperLeg.L", Radius: 0.185 },
  { A: "Hips", B: "UpperLeg.R", Radius: 0.185 }
];

const Segments = [
  { Joint: "Shoulder.L", Child: "UpperArm.L", Radius: 0.126 },
  { Joint: "UpperArm.L", Child: "LowerArm.L", Radius: 0.134 },
  { Joint: "LowerArm.L", Child: "Wrist.L", Radius: 0.126, EndExtension: 0.16 },
  { Joint: "Shoulder.R", Child: "UpperArm.R", Radius: 0.126 },
  { Joint: "UpperArm.R", Child: "LowerArm.R", Radius: 0.134 },
  { Joint: "LowerArm.R", Child: "Wrist.R", Radius: 0.126, EndExtension: 0.16 },
  { Joint: "UpperLeg.L", Child: "LowerLeg.L", Radius: 0.150 },
  { Joint: "LowerLeg.L", Child: "Foot.L", Radius: 0.136, EndExtension: 0.19 },
  { Joint: "UpperLeg.R", Child: "LowerLeg.R", Radius: 0.150 },
  { Joint: "LowerLeg.R", Child: "Foot.R", Radius: 0.136, EndExtension: 0.19 }
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
  SavedVisibility: new Map(),
  PivotCenter: new THREE.Vector3(),
  ExtendedEnd: new THREE.Vector3(),
  BodyPoint: new THREE.Vector3(),
  LinkStart: new THREE.Vector3(),
  LinkEnd: new THREE.Vector3(),
  LinkPoint: new THREE.Vector3(),
  Separation: new THREE.Vector3(),
  BestSeparation: new THREE.Vector3(),
  SavedPivotPosition: new THREE.Vector3(),
  PivotPositionSaved: false
};

const SegmentState = new Map();

function BodyCollision(Entry) {
  return Boolean(Entry?.ProceduralBodyContact || Collision.IsStructure(Entry));
}

function EntryBounds(Entry) {
  return Entry?.OriginalStructureBox || Entry?.OriginalBox || Entry?.Box || Entry || null;
}

function FiniteBounds(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite)
  );
}

function PointSeparation(Point, Radius, Bounds, Target) {
  if (!FiniteBounds(Bounds)) return 0;

  const MinX = Bounds.min.x - Radius;
  const MaxX = Bounds.max.x + Radius;
  const MinY = Bounds.min.y - Radius;
  const MaxY = Bounds.max.y + Radius;
  const MinZ = Bounds.min.z - Radius;
  const MaxZ = Bounds.max.z + Radius;

  if (
    Point.x <= MinX || Point.x >= MaxX ||
    Point.y <= MinY || Point.y >= MaxY ||
    Point.z <= MinZ || Point.z >= MaxZ
  ) return 0;

  const Distances = [
    [Point.x - MinX, -1, 0, 0],
    [MaxX - Point.x, 1, 0, 0],
    [Point.z - MinZ, 0, 0, -1],
    [MaxZ - Point.z, 0, 0, 1]
  ];
  Distances.sort((Left, Right) => Left[0] - Right[0]);
  const Depth = Distances[0][0] + 0.006;
  Target.set(Distances[0][1] * Depth, Distances[0][2] * Depth, Distances[0][3] * Depth);
  return Depth;
}

function SavePivotPosition(Pivot) {
  if (Scratch.PivotPositionSaved) return;
  Scratch.SavedPivotPosition.copy(Pivot.position);
  Scratch.PivotPositionSaved = true;
}

function SeparateBodyShell(Pivot, Entries) {
  SavePivotPosition(Pivot);
  let TotalPush = 0;

  for (let Pass = 0; Pass < 5 && TotalPush < 0.20; Pass += 1) {
    let BestDepth = 0;
    Scratch.BestSeparation.set(0, 0, 0);
    Pivot.updateMatrixWorld(true);

    for (const Sample of BodyPoints) {
      const Bone = Pivot.getObjectByName(Sample.Bone);
      if (!Bone?.isBone) continue;
      Bone.getWorldPosition(Scratch.BodyPoint);

      for (const Entry of Entries) {
        if (!BodyCollision(Entry)) continue;
        const Depth = PointSeparation(Scratch.BodyPoint, Sample.Radius, EntryBounds(Entry), Scratch.Separation);
        if (Depth <= BestDepth) continue;
        BestDepth = Depth;
        Scratch.BestSeparation.copy(Scratch.Separation);
      }
    }

    for (const Link of BodyLinks) {
      const BoneA = Pivot.getObjectByName(Link.A);
      const BoneB = Pivot.getObjectByName(Link.B);
      if (!BoneA?.isBone || !BoneB?.isBone) continue;

      BoneA.getWorldPosition(Scratch.LinkStart);
      BoneB.getWorldPosition(Scratch.LinkEnd);

      for (const T of [0.20, 0.40, 0.60, 0.80]) {
        Scratch.LinkPoint.copy(Scratch.LinkStart).lerp(Scratch.LinkEnd, T);
        for (const Entry of Entries) {
          if (!BodyCollision(Entry)) continue;
          const Depth = PointSeparation(Scratch.LinkPoint, Link.Radius, EntryBounds(Entry), Scratch.Separation);
          if (Depth <= BestDepth) continue;
          BestDepth = Depth;
          Scratch.BestSeparation.copy(Scratch.Separation);
        }
      }
    }

    if (BestDepth <= 0.0005) break;
    const Remaining = Math.max(0, 0.20 - TotalPush);
    const PushLength = Math.min(Scratch.BestSeparation.length(), 0.070, Remaining);
    if (PushLength <= 0.0005) break;

    Scratch.BestSeparation.setLength(PushLength);
    Pivot.position.add(Scratch.BestSeparation);
    TotalPush += PushLength;
  }

  Pivot.updateMatrixWorld(true);
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
  Scratch.ExtendedEnd.copy(Scratch.End);
  if (Segment.EndExtension > 0) {
    Scratch.CurrentDirection.copy(Scratch.End).sub(Scratch.Start);
    if (Scratch.CurrentDirection.lengthSq() > 0.000001) {
      Scratch.ExtendedEnd.addScaledVector(Scratch.CurrentDirection.normalize(), Segment.EndExtension);
    }
  }
  const State = StateFor(Segment);

  const Result = SurfaceContact.ResolveSurfaceCapsule(
    Scratch.Start,
    Scratch.ExtendedEnd,
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
  Pivot.getWorldPosition(Scratch.PivotCenter);
  const Entries = Physics?.GetBodyContactEntries?.(Game.CollisionBoxes, Scratch.PivotCenter, 3.2) || Game.CollisionBoxes;
  SeparateBodyShell(Pivot, Entries);

  for (let Pass = 0; Pass < 7; Pass += 1) {
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

  if (Scratch.PivotPositionSaved) {
    Pivot.position.copy(Scratch.SavedPivotPosition);
    Scratch.PivotPositionSaved = false;
  }

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
window.__STORE_FINAL_CONTACT_BUILD__ = "V0.27.7-PHYSICS";
