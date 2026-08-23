import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before first-person arm render.");

const ARM_RADIUS = 0.105;
const ARM_WALL_GAP = 0.060;
const MOVE_SPEED_REFERENCE = 3.45;

const State = {
  LastCameraPosition: new THREE.Vector3(),
  LastTime: performance.now(),
  HasCameraPosition: false,
  MoveBlend: 0,
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  Up: new THREE.Vector3(),
  Start: new THREE.Vector3(),
  End: new THREE.Vector3(),
  Direction: new THREE.Vector3(),
  CurrentDirection: new THREE.Vector3(),
  DesiredDirection: new THREE.Vector3(),
  ElbowTarget: new THREE.Vector3(),
  WristTarget: new THREE.Vector3(),
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
  State.MoveBlend = THREE.MathUtils.lerp(State.MoveBlend, Target, ExpAlpha(Delta, 14));
}

function UpdateCameraBasis(Camera) {
  State.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion).normalize();
  State.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion).normalize();
  State.Up.set(0, 1, 0).applyQuaternion(Camera.quaternion).normalize();
}

function SegmentAabbDistance(Start, End, Bounds, Padding) {
  State.Direction.copy(End).sub(Start);
  let TMin = 0;
  let TMax = 1;

  for (const Axis of ["x", "y", "z"]) {
    const Origin = Start[Axis];
    const Delta = State.Direction[Axis];
    const Min = Bounds.min[Axis] - Padding;
    const Max = Bounds.max[Axis] + Padding;

    if (Math.abs(Delta) < 0.0000001) {
      if (Origin < Min || Origin > Max) return null;
      continue;
    }

    let Near = (Min - Origin) / Delta;
    let Far = (Max - Origin) / Delta;
    if (Near > Far) [Near, Far] = [Far, Near];
    TMin = Math.max(TMin, Near);
    TMax = Math.min(TMax, Far);
    if (TMin > TMax) return null;
  }

  return TMin;
}

function ClampLimbTarget(Start, Target) {
  const Length = Start.distanceTo(Target);
  if (Length <= 0.0001) return Target;

  let Allowed = Length;
  const Collisions = window.__STORE_COLLISION_BOXES__ || [];
  for (const Entry of Collisions) {
    if (!Entry?.Type || !/Wall|Partition/i.test(Entry.Type)) continue;
    const Bounds = Entry.OriginalStructureBox || Entry.OriginalBox || Entry.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    if (![Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite)) continue;

    const Hit = SegmentAabbDistance(Start, Target, Bounds, ARM_RADIUS);
    if (Hit === null) continue;
    Allowed = Math.min(Allowed, Math.max(0.025, Hit * Length - ARM_WALL_GAP));
  }

  if (Allowed < Length) {
    Target.sub(Start).normalize().multiplyScalar(Allowed).add(Start);
  }
  return Target;
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

function SaveBone(Bone) {
  if (!Bone || State.SavedQuaternions.has(Bone)) return;
  State.SavedQuaternions.set(Bone, Bone.quaternion.clone());
}

function RestoreBones(Pivot) {
  for (const [Bone, Quaternion] of State.SavedQuaternions) Bone.quaternion.copy(Quaternion);
  State.SavedQuaternions.clear();
  Pivot?.updateMatrixWorld(true);
}

function SolveArm(Pivot, Camera, Side, Phase) {
  const Left = Side < 0;
  const Shoulder = Pivot.getObjectByName(Left ? "Shoulder.L" : "Shoulder.R");
  const Upper = Pivot.getObjectByName(Left ? "UpperArm.L" : "UpperArm.R");
  const Lower = Pivot.getObjectByName(Left ? "LowerArm.L" : "LowerArm.R");
  const Wrist = Pivot.getObjectByName(Left ? "Wrist.L" : "Wrist.R");
  if (!Shoulder?.isBone || !Upper?.isBone || !Lower?.isBone || !Wrist?.isBone) return;

  SaveBone(Shoulder);
  SaveBone(Upper);
  SaveBone(Lower);
  SaveBone(Wrist);

  const Move = State.MoveBlend;
  const Swing = Math.sin(Phase) * Move * (Left ? 1 : -1);

  const WristSide = Side * THREE.MathUtils.lerp(0.235, 0.165, Move);
  const ElbowSide = Side * THREE.MathUtils.lerp(0.315, 0.245, Move);
  const WristForward = THREE.MathUtils.lerp(0.47, 0.58, Move) + Swing * 0.075;
  const ElbowForward = THREE.MathUtils.lerp(0.235, 0.315, Move) + Swing * 0.030;
  const WristDown = THREE.MathUtils.lerp(0.245, 0.175, Move);
  const ElbowDown = THREE.MathUtils.lerp(0.185, 0.145, Move);

  State.ElbowTarget.copy(Camera.position)
    .addScaledVector(State.Forward, ElbowForward)
    .addScaledVector(State.Right, ElbowSide)
    .addScaledVector(State.Up, -ElbowDown);

  Upper.getWorldPosition(State.Start);
  ClampLimbTarget(State.Start, State.ElbowTarget);
  RotateBoneToward(Pivot, Upper, Lower, State.ElbowTarget);

  State.WristTarget.copy(Camera.position)
    .addScaledVector(State.Forward, WristForward)
    .addScaledVector(State.Right, WristSide)
    .addScaledVector(State.Up, -WristDown);

  Lower.getWorldPosition(State.Start);
  ClampLimbTarget(State.Start, State.WristTarget);
  RotateBoneToward(Pivot, Lower, Wrist, State.WristTarget);
}

function ApplyFirstPersonArms(Scene, Camera) {
  const Pivot = Scene.getObjectByName("PlayerCharacterPivot");
  if (!Pivot) return null;

  UpdateCameraBasis(Camera);
  const Phase = performance.now() / 1000 * THREE.MathUtils.lerp(4.5, 7.2, State.MoveBlend);
  SolveArm(Pivot, Camera, -1, Phase);
  SolveArm(Pivot, Camera, 1, Phase);
  return Pivot;
}

function Render(Renderer, Scene, Camera) {
  UpdateMovementBlend(Camera);

  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      if (BasePlayer.IsThirdPerson?.()) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      const Pivot = ApplyFirstPersonArms(RenderScene, RenderCamera);
      try {
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RestoreBones(Pivot);
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

window.__STORE_FIRST_PERSON_ARM_RENDER_BUILD__ = "V0.11-R27";