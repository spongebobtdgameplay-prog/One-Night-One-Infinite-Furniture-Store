import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player must load before camera collision.");

const CAMERA_RADIUS = 0.13;
const CAMERA_SKIN = 0.055;
const TARGET_HEIGHT = 1.26;

const State = {
  CollisionBoxes: null,
  Segment: new THREE.Vector3(),
  Target: new THREE.Vector3(),
  Desired: new THREE.Vector3(),
  Offset: new THREE.Vector3(),
  SavedPosition: new THREE.Vector3(),
  SavedQuaternion: new THREE.Quaternion()
};

function Attach(Context) {
  State.CollisionBoxes = Context?.CollisionBoxes || State.CollisionBoxes;
  BasePlayer.Attach?.(Context);
}

function FiniteBounds(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite) &&
    Bounds.min.x < Bounds.max.x && Bounds.min.y < Bounds.max.y && Bounds.min.z < Bounds.max.z
  );
}

function EntryBounds(Entry) {
  return Entry?.OriginalStructureBox || Entry?.OriginalBox || Entry?.Box || Entry || null;
}

function SegmentBoundsFraction(Start, End, Bounds, Padding) {
  if (!FiniteBounds(Bounds)) return null;
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

  if (TMax < 0 || TMin > 1) return null;
  return THREE.MathUtils.clamp(Math.max(0, TMin), 0, 1);
}

function ClampThirdPersonCamera(Scene, Camera) {
  if (BasePlayer.IsThirdPerson?.() === false) return false;

  const Pivot = Scene.getObjectByName("PlayerCharacterPivot");
  if (!Pivot) return false;

  Pivot.getWorldPosition(State.Target);
  State.Target.y += TARGET_HEIGHT;
  State.Desired.copy(Camera.position);

  const Distance = State.Target.distanceTo(State.Desired);
  if (Distance <= 0.001) return false;

  let AllowedFraction = 1;
  const Collisions = State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];

  for (const Entry of Collisions) {
    if (!Entry || Entry.CameraCollision === false) continue;
    const Bounds = EntryBounds(Entry);
    const Hit = SegmentBoundsFraction(State.Target, State.Desired, Bounds, CAMERA_RADIUS);
    if (Hit === null) continue;
    AllowedFraction = Math.min(AllowedFraction, Hit);
  }

  if (AllowedFraction >= 0.9999) return false;

  State.SavedPosition.copy(Camera.position);
  State.SavedQuaternion.copy(Camera.quaternion);

  const SkinFraction = CAMERA_SKIN / Distance;
  const SafeFraction = THREE.MathUtils.clamp(AllowedFraction - SkinFraction, 0.025, 1);
  State.Offset.copy(State.Desired).sub(State.Target).multiplyScalar(SafeFraction);
  Camera.position.copy(State.Target).add(State.Offset);
  Camera.lookAt(State.Target);
  Camera.updateMatrixWorld(true);
  return true;
}

function RestoreCamera(Camera) {
  Camera.position.copy(State.SavedPosition);
  Camera.quaternion.copy(State.SavedQuaternion);
  Camera.updateMatrixWorld(true);
}

function Render(Renderer, Scene, Camera) {
  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      const Changed = ClampThirdPersonCamera(RenderScene, RenderCamera);
      try {
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        if (Changed) RestoreCamera(RenderCamera);
      }
    }
  };

  BasePlayer.Render(ProxyRenderer, Scene, Camera);
}

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render
};

window.__STORE_CAMERA_COLLISION_BUILD__ = "V0.12.9";
