import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before first-person body placement.");

const IDLE_FORWARD_OFFSET = 0.035;
const MOVING_FORWARD_OFFSET = 0.055;
const IDLE_LEFT_OFFSET = 0.21;
const MOVING_LEFT_OFFSET = 0.30;
const WALL_GAP = 0.055;
const BODY_SAMPLE_HEIGHT = 1.34;
const MOVE_SPEED_REFERENCE = 3.45;

const State = {
  LastCameraPosition: new THREE.Vector3(),
  HasCameraPosition: false,
  LastTime: performance.now(),
  MoveBlend: 0,
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  DesiredOffset: new THREE.Vector3(),
  Start: new THREE.Vector3(),
  End: new THREE.Vector3(),
  Segment: new THREE.Vector3(),
  SavedPivotPosition: new THREE.Vector3()
};

function ExpAlpha(Delta, Responsiveness) {
  return 1 - Math.exp(-Delta * Responsiveness);
}

function SegmentAabbDistance(Start, End, Bounds) {
  State.Segment.copy(End).sub(Start);
  let TMin = 0;
  let TMax = 1;

  for (const Axis of ["x", "y", "z"]) {
    const Origin = Start[Axis];
    const Direction = State.Segment[Axis];
    const Min = Bounds.min[Axis];
    const Max = Bounds.max[Axis];

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
  State.MoveBlend = THREE.MathUtils.lerp(State.MoveBlend, Target, ExpAlpha(Delta, 12));
}

function BuildDesiredOffset(Camera) {
  State.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  State.Forward.y = 0;
  if (State.Forward.lengthSq() < 0.000001) State.Forward.set(0, 0, -1);
  State.Forward.normalize();

  State.Right.set(1, 0, 0).applyQuaternion(Camera.quaternion);
  State.Right.y = 0;
  if (State.Right.lengthSq() < 0.000001) State.Right.set(1, 0, 0);
  State.Right.normalize();

  const ForwardOffset = THREE.MathUtils.lerp(IDLE_FORWARD_OFFSET, MOVING_FORWARD_OFFSET, State.MoveBlend);
  const LeftOffset = THREE.MathUtils.lerp(IDLE_LEFT_OFFSET, MOVING_LEFT_OFFSET, State.MoveBlend);

  State.DesiredOffset.copy(State.Forward).multiplyScalar(ForwardOffset);
  State.DesiredOffset.addScaledVector(State.Right, -LeftOffset);
  return State.DesiredOffset;
}

function ClampOffsetToStructures(Pivot, DesiredOffset) {
  State.Start.set(Pivot.position.x, BODY_SAMPLE_HEIGHT, Pivot.position.z);
  State.End.copy(State.Start).add(DesiredOffset);

  const Length = DesiredOffset.length();
  if (Length <= 0.000001) return DesiredOffset;

  let AllowedScale = 1;
  const Collisions = window.__STORE_COLLISION_BOXES__ || [];
  for (const Entry of Collisions) {
    if (!Entry?.Type || !/Wall|Partition/i.test(Entry.Type)) continue;
    const Bounds = Entry.OriginalStructureBox || Entry.OriginalBox || Entry.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    if (![Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite)) continue;
    const Hit = SegmentAabbDistance(State.Start, State.End, Bounds);
    if (Hit === null) continue;
    const SafeDistance = Math.max(0, Hit * Length - WALL_GAP);
    AllowedScale = Math.min(AllowedScale, SafeDistance / Length);
  }

  DesiredOffset.multiplyScalar(THREE.MathUtils.clamp(AllowedScale, 0, 1));
  return DesiredOffset;
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

      const DesiredOffset = ClampOffsetToStructures(Pivot, BuildDesiredOffset(RenderCamera));
      State.SavedPivotPosition.copy(Pivot.position);
      Pivot.position.add(DesiredOffset);
      Pivot.updateMatrixWorld(true);

      try {
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        Pivot.position.copy(State.SavedPivotPosition);
        Pivot.updateMatrixWorld(true);
      }
    }
  };

  BasePlayer.Render(ProxyRenderer, Scene, Camera);
}

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Render
};

window.__STORE_FIRST_PERSON_BODY_PLACEMENT_BUILD__ = "V0.11-R26";
