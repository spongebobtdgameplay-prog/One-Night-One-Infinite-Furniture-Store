import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before first-person full-body framing.");

const BODY_BACK_IDLE = 0.18;
const BODY_BACK_MOVING = 0.16;
const BODY_WALL_RADIUS = 0.12;
const BODY_WALL_GAP = 0.045;
const BODY_SAMPLE_HEIGHT = 1.34;
const ARM_RADIUS = 0.11;
const ARM_WALL_GAP = 0.055;
const MOVE_SPEED_REFERENCE = 3.45;

const State = {
  LastCameraPosition: new THREE.Vector3(),
  LastTime: performance.now(),
  HasCameraPosition: false,
  MoveBlend: 0,
  Forward: new THREE.Vector3(),
  HorizontalForward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  Up: new THREE.Vector3(),
  Segment: new THREE.Vector3(),
  Start: new THREE.Vector3(),
  End: new THREE.Vector3(),
  CurrentDirection: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3(),
  ElbowTarget: new THREE.Vector3(),
  WristTarget: new THREE.Vector3(),
  BodyOffset: new THREE.Vector3(),
  SavedPivotPosition: new THREE.Vector3(),
  SavedNeckScale: new THREE.Vector3(),
  WorldQuaternion: new THREE.Quaternion(),
  ParentQuaternion: new THREE.Quaternion(),
  DeltaQuaternion: new THREE.Quaternion(),
  DesiredWorldQuaternion: new THREE.Quaternion(),
  SavedQuaternions: new Map()
};

function ExpAlpha(Delta, Responsiveness) {
  return 1 - Math.exp(-Delta * Responsiveness);
}

function UpdateMovementBlend(Camera) {
  const Now = performance.now();
  const Delta = Math.min(Math.max((Now - State.LastTime) / 1000, 0.001), 0.05);
  State.LastTime = Now;

  if (!State.HasCameraPosition) {
    State.LastCameraPosition.copy(Camera.position);
    State.HasCameraPosition = true;
    State.MoveBlend = 0;
    return;
  }

  const DX = Camera.position.x - State.LastCameraPosition.x;
  const DZ = Camera.position.z - State.LastCameraPosition.z;
  State.LastCameraPosition.copy(Camera.position);
  const Speed = Math.hypot(DX, DZ) / Delta;
  const Target = THREE.MathUtils.clamp(Speed / MOVE_SPEED_REFERENCE, 0, 1);
  State.MoveBlend = THREE.MathUtils.lerp(State.MoveBlend, Target, ExpAlpha(Delta, 13));
}

function UpdateCameraBasis(Camera) {
  State.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion).normalize();
  State.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion).normalize();
  State.Up.set(0, 1, 0).applyQuaternion(Camera.quaternion).normalize();
  State.HorizontalForward.copy(State.Forward);
  State.HorizontalForward.y = 0;
  if (State.HorizontalForward.lengthSq() < 0.000001) State.HorizontalForward.set(0, 0, -1);
  State.HorizontalForward.normalize();
}

function SegmentAabbDistance(Start, End, Bounds, Padding) {
  State.Segment.copy(End).sub(Start);
  let TMin = 0;
  let TMax = 1;

  for (const Axis of ["x", "y", "z"]) {
    const Origin = Start[Axis];
    const Direction = State.Segment[Axis];
    const Min = Bounds.min[Axis] - Padding;
    const Max = Bounds.max[Axis] + Padding;

    if (Math.abs(Direction) < 0.0000001) {
      if (Origin < Min || Origin > Max) return null;
      continue;
    }

    let Near = (Min - Origin) / Direction;
    let Far = (Max - Origin) / Direction;
    if (Near > Far) [Near, Far] = [Far, Near];
    TMin = Math.max(TMin, Near);
    TMax = Math.min(TMax, Far);
    if (TMin > TMax) return null;
  }

  return TMin;
}

function ClampSegmentToStructures(Start, Target, Radius, Gap) {
  const Length = Start.distanceTo(Target);
  if (Length <= 0.0001) return Target;

  let Allowed = Length;
  const Collisions = window.__STORE_COLLISION_BOXES__ || [];
  for (const Entry of Collisions) {
    if (!Entry?.Type || !/Wall|Partition/i.test(Entry.Type)) continue;
    const Bounds = Entry.OriginalStructureBox || Entry.OriginalBox || Entry.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    if (![Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite)) continue;

    const Hit = SegmentAabbDistance(Start, Target, Bounds, Radius);
    if (Hit === null) continue;
    Allowed = Math.min(Allowed, Math.max(0, Hit * Length - Gap));
  }

  if (Allowed < Length) Target.sub(Start).normalize().multiplyScalar(Allowed).add(Start);
  return Target;
}

function ApplyCenteredBodyOffset(Pivot) {
  const Requested = THREE.MathUtils.lerp(BODY_BACK_IDLE, BODY_BACK_MOVING, State.MoveBlend);
  State.BodyOffset.copy(State.HorizontalForward).multiplyScalar(-Requested);

  State.Start.set(Pivot.position.x, BODY_SAMPLE_HEIGHT, Pivot.position.z);
  State.End.copy(State.Start).add(State.BodyOffset);
  ClampSegmentToStructures(State.Start, State.End, BODY_WALL_RADIUS, BODY_WALL_GAP);
  State.BodyOffset.copy(State.End).sub(State.Start);

  State.SavedPivotPosition.copy(Pivot.position);
  Pivot.position.add(State.BodyOffset);
  Pivot.updateMatrixWorld(true);
}

function SaveBone(Bone) {
  if (!Bone || State.SavedQuaternions.has(Bone)) return;
  State.SavedQuaternions.set(Bone, Bone.quaternion.clone());
}

function RestoreBones(Pivot) {
  for (const [Bone, Quaternion] of State.SavedQuaternions) Bone.quaternion.copy(Quaternion);
  State.SavedQuaternions.clear();
  Pivot?.updateMatrixWorld(true);
}

function RotateBoneToward(Pivot, Bone, Child, Target) {
  if (!Bone || !Child || !Bone.parent) return;
  Pivot.updateMatrixWorld(true);

  Bone.getWorldPosition(State.Start);
  Child.getWorldPosition(State.End);
  State.CurrentDirection.copy(State.End).sub(State.Start);
  State.DesiredDirection.copy(Target).sub(State.Start);
  if (State.CurrentDirection.lengthSq() < 0.000001 || State.DesiredDirection.lengthSq() < 0.000001) return;

  State.CurrentDirection.normalize();
  State.DesiredDirection.normalize();
  Bone.getWorldQuaternion(State.WorldQuaternion);
  Bone.parent.getWorldQuaternion(State.ParentQuaternion);
  State.DeltaQuaternion.setFromUnitVectors(State.CurrentDirection, State.DesiredDirection);
  State.DesiredWorldQuaternion.copy(State.DeltaQuaternion).multiply(State.WorldQuaternion);
  State.ParentQuaternion.invert();
  Bone.quaternion.copy(State.ParentQuaternion.multiply(State.DesiredWorldQuaternion)).normalize();
  Pivot.updateMatrixWorld(true);
}

function SolveArm(Pivot, Camera, Side, Phase) {
  const Left = Side < 0;
  const Upper = Pivot.getObjectByName(Left ? "UpperArm.L" : "UpperArm.R");
  const Lower = Pivot.getObjectByName(Left ? "LowerArm.L" : "LowerArm.R");
  const Wrist = Pivot.getObjectByName(Left ? "Wrist.L" : "Wrist.R");
  if (!Upper?.isBone || !Lower?.isBone || !Wrist?.isBone) return;

  SaveBone(Upper);
  SaveBone(Lower);
  SaveBone(Wrist);

  const Move = State.MoveBlend;
  const Swing = Math.sin(Phase) * Move * (Left ? 1 : -1);
  const WristSide = Side * THREE.MathUtils.lerp(0.27, 0.21, Move);
  const ElbowSide = Side * THREE.MathUtils.lerp(0.34, 0.28, Move);
  const WristForward = THREE.MathUtils.lerp(0.43, 0.55, Move) + Swing * 0.075;
  const ElbowForward = THREE.MathUtils.lerp(0.24, 0.32, Move) + Swing * 0.030;
  const WristDown = THREE.MathUtils.lerp(0.31, 0.20, Move);
  const ElbowDown = THREE.MathUtils.lerp(0.22, 0.16, Move);

  State.ElbowTarget.copy(Camera.position)
    .addScaledVector(State.Forward, ElbowForward)
    .addScaledVector(State.Right, ElbowSide)
    .addScaledVector(State.Up, -ElbowDown);

  Upper.getWorldPosition(State.Start);
  ClampSegmentToStructures(State.Start, State.ElbowTarget, ARM_RADIUS, ARM_WALL_GAP);
  RotateBoneToward(Pivot, Upper, Lower, State.ElbowTarget);

  State.WristTarget.copy(Camera.position)
    .addScaledVector(State.Forward, WristForward)
    .addScaledVector(State.Right, WristSide)
    .addScaledVector(State.Up, -WristDown);

  Lower.getWorldPosition(State.Start);
  ClampSegmentToStructures(State.Start, State.WristTarget, ARM_RADIUS, ARM_WALL_GAP);
  RotateBoneToward(Pivot, Lower, Wrist, State.WristTarget);
}

function Render(Renderer, Scene, Camera) {
  UpdateMovementBlend(Camera);

  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      if (BasePlayer.IsThirdPerson?.()) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
      if (!Pivot) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      UpdateCameraBasis(RenderCamera);
      ApplyCenteredBodyOffset(Pivot);

      const Neck = Pivot.getObjectByName("Neck");
      if (Neck?.isBone) {
        State.SavedNeckScale.copy(Neck.scale);
        Neck.scale.set(0.08, 1, 0.08);
        Neck.updateMatrixWorld(true);
      }

      const Phase = performance.now() / 1000 * THREE.MathUtils.lerp(4.5, 7.2, State.MoveBlend);
      SolveArm(Pivot, RenderCamera, -1, Phase);
      SolveArm(Pivot, RenderCamera, 1, Phase);

      try {
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RestoreBones(Pivot);
        if (Neck?.isBone) {
          Neck.scale.copy(State.SavedNeckScale);
          Neck.updateMatrixWorld(true);
        }
        Pivot.position.copy(State.SavedPivotPosition);
        Pivot.updateMatrixWorld(true);
      }
    }
  };

  BasePlayer.Render(ProxyRenderer, Scene, Camera);
}

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Render,
  GetPlayerRadius: () => 0.23
};

window.__STORE_FIRST_PERSON_FULLBODY_BUILD__ = "V0.11-R28";
