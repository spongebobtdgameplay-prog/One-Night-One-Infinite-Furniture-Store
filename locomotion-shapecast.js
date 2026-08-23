import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before locomotion shapecast.");

const WALK_PROBE = 1.05;
const SPRINT_PROBE = 1.42;
const PROBE_STEPS = 14;
const SIDE_OFFSET = 0.22;
const SIDE_RADIUS = 0.11;
const ENTER_RESPONSE = 15;
const EXIT_RESPONSE = 9;

const State = {
  Scene: null,
  Camera: null,
  CollisionBoxes: null,
  Keys: new Set(),
  LastCameraPosition: new THREE.Vector3(),
  HasLastPosition: false,
  LastTime: performance.now(),
  Velocity: new THREE.Vector3(),
  MoveDirection: new THREE.Vector3(),
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  Sample: new THREE.Vector3(),
  LeftOrigin: new THREE.Vector3(),
  RightOrigin: new THREE.Vector3(),
  WallBlend: 0,
  LeftBlend: 0,
  RightBlend: 0,
  HitDistance: Infinity,
  RestPivotUuid: "",
  RestPose: new Map(),
  SavedPose: new Map(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion()
};

const PoseBones = [
  "Hips", "Abdomen", "Torso", "Chest", "Neck",
  "Shoulder.L", "Shoulder.R", "UpperArm.L", "UpperArm.R",
  "LowerArm.L", "LowerArm.R", "Wrist.L", "Wrist.R",
  "UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R",
  "Foot.L", "Foot.R"
];

const DampWeights = new Map([
  ["Hips", 0.28], ["Abdomen", 0.31], ["Torso", 0.34], ["Chest", 0.38], ["Neck", 0.24],
  ["Shoulder.L", 0.60], ["Shoulder.R", 0.60],
  ["UpperArm.L", 0.82], ["UpperArm.R", 0.82],
  ["LowerArm.L", 0.72], ["LowerArm.R", 0.72],
  ["Wrist.L", 0.55], ["Wrist.R", 0.55],
  ["UpperLeg.L", 0.88], ["UpperLeg.R", 0.88],
  ["LowerLeg.L", 0.84], ["LowerLeg.R", 0.84],
  ["Foot.L", 0.70], ["Foot.R", 0.70]
]);

function ExpAlpha(Delta, Responsiveness) {
  return 1 - Math.exp(-Delta * Responsiveness);
}

function FiniteBounds(Bounds) {
  return Boolean(
    Bounds?.min && Bounds?.max &&
    [Bounds.min.x, Bounds.min.z, Bounds.max.x, Bounds.max.z].every(Number.isFinite) &&
    Bounds.min.x < Bounds.max.x && Bounds.min.z < Bounds.max.z
  );
}

function CircleHitsBox(Position, Radius, Bounds) {
  const ClosestX = THREE.MathUtils.clamp(Position.x, Bounds.min.x, Bounds.max.x);
  const ClosestZ = THREE.MathUtils.clamp(Position.z, Bounds.min.z, Bounds.max.z);
  const DX = Position.x - ClosestX;
  const DZ = Position.z - ClosestZ;
  return DX * DX + DZ * DZ <= Radius * Radius;
}

function HitsCollision(Position, Radius) {
  const Collisions = State.CollisionBoxes || window.__STORE_COLLISION_BOXES__ || [];
  for (const Entry of Collisions) {
    if (!Entry) continue;
    if (typeof Entry.TestPlayerCollision === "function") {
      try {
        if (Entry.TestPlayerCollision(Position, Radius)) return true;
      } catch {}
      continue;
    }

    const Bounds = Entry.Box || Entry;
    if (!FiniteBounds(Bounds)) continue;
    if (CircleHitsBox(Position, Radius, Bounds)) return true;
  }
  return false;
}

function SweepCircle(Origin, Direction, Radius, Length) {
  if (Direction.lengthSq() < 0.000001) return Infinity;

  for (let Step = 1; Step <= PROBE_STEPS; Step += 1) {
    const Distance = Length * Step / PROBE_STEPS;
    State.Sample.copy(Origin).addScaledVector(Direction, Distance);
    if (HitsCollision(State.Sample, Radius)) return Distance;
  }

  return Infinity;
}

function InputDirection(Camera) {
  State.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  State.Forward.y = 0;
  if (State.Forward.lengthSq() < 0.000001) State.Forward.set(0, 0, -1);
  State.Forward.normalize();

  State.Right.set(-State.Forward.z, 0, State.Forward.x).normalize();
  State.MoveDirection.set(0, 0, 0);

  if (State.Keys.has("KeyW")) State.MoveDirection.add(State.Forward);
  if (State.Keys.has("KeyS")) State.MoveDirection.sub(State.Forward);
  if (State.Keys.has("KeyD")) State.MoveDirection.add(State.Right);
  if (State.Keys.has("KeyA")) State.MoveDirection.sub(State.Right);

  if (State.MoveDirection.lengthSq() > 0.000001) return State.MoveDirection.normalize();
  if (State.Velocity.lengthSq() > 0.01) return State.MoveDirection.copy(State.Velocity).normalize();
  return State.MoveDirection.set(0, 0, 0);
}

function BlendFromHit(Distance, Length) {
  if (!Number.isFinite(Distance)) return 0;
  return 1 - THREE.MathUtils.clamp((Distance - 0.05) / Math.max(Length - 0.05, 0.01), 0, 1);
}

function UpdateShapecast(Camera) {
  const Now = performance.now();
  const Delta = THREE.MathUtils.clamp((Now - State.LastTime) / 1000, 0.001, 0.05);
  State.LastTime = Now;

  if (!State.HasLastPosition) {
    State.LastCameraPosition.copy(Camera.position);
    State.HasLastPosition = true;
  }

  State.Velocity.copy(Camera.position).sub(State.LastCameraPosition).divideScalar(Delta);
  State.Velocity.y = 0;
  State.LastCameraPosition.copy(Camera.position);

  if (!BasePlayer.IsThirdPerson?.()) {
    State.WallBlend = THREE.MathUtils.lerp(State.WallBlend, 0, ExpAlpha(Delta, EXIT_RESPONSE));
    State.LeftBlend = THREE.MathUtils.lerp(State.LeftBlend, 0, ExpAlpha(Delta, EXIT_RESPONSE));
    State.RightBlend = THREE.MathUtils.lerp(State.RightBlend, 0, ExpAlpha(Delta, EXIT_RESPONSE));
    State.HitDistance = Infinity;
    return;
  }

  const Direction = InputDirection(Camera);
  if (Direction.lengthSq() < 0.000001) {
    State.WallBlend = THREE.MathUtils.lerp(State.WallBlend, 0, ExpAlpha(Delta, EXIT_RESPONSE));
    State.LeftBlend = THREE.MathUtils.lerp(State.LeftBlend, 0, ExpAlpha(Delta, EXIT_RESPONSE));
    State.RightBlend = THREE.MathUtils.lerp(State.RightBlend, 0, ExpAlpha(Delta, EXIT_RESPONSE));
    State.HitDistance = Infinity;
    return;
  }

  State.Right.set(-Direction.z, 0, Direction.x).normalize();
  const Radius = Math.max(0.22, Number(BasePlayer.GetPlayerRadius?.()) || 0.22);
  const Length = BasePlayer.IsSprinting?.() ? SPRINT_PROBE : WALK_PROBE;
  const Origin = Camera.position;

  const CenterHit = SweepCircle(Origin, Direction, Radius, Length);
  State.LeftOrigin.copy(Origin).addScaledVector(State.Right, -SIDE_OFFSET);
  State.RightOrigin.copy(Origin).addScaledVector(State.Right, SIDE_OFFSET);
  const LeftHit = SweepCircle(State.LeftOrigin, Direction, SIDE_RADIUS, Length);
  const RightHit = SweepCircle(State.RightOrigin, Direction, SIDE_RADIUS, Length);
  const ClosestHit = Math.min(CenterHit, LeftHit, RightHit);

  const TargetWall = BlendFromHit(ClosestHit, Length);
  const TargetLeft = BlendFromHit(LeftHit, Length);
  const TargetRight = BlendFromHit(RightHit, Length);
  const Response = TargetWall > State.WallBlend ? ENTER_RESPONSE : EXIT_RESPONSE;

  State.WallBlend = THREE.MathUtils.lerp(State.WallBlend, TargetWall, ExpAlpha(Delta, Response));
  State.LeftBlend = THREE.MathUtils.lerp(State.LeftBlend, TargetLeft, ExpAlpha(Delta, Response));
  State.RightBlend = THREE.MathUtils.lerp(State.RightBlend, TargetRight, ExpAlpha(Delta, Response));
  State.HitDistance = ClosestHit;
}

function CaptureRestPose(Pivot) {
  if (!Pivot || State.RestPivotUuid === Pivot.uuid) return;
  State.RestPivotUuid = Pivot.uuid;
  State.RestPose.clear();

  for (const Name of PoseBones) {
    const Bone = Pivot.getObjectByName(Name);
    if (Bone?.isBone) State.RestPose.set(Name, Bone.quaternion.clone());
  }
}

function SaveCurrentPose(Pivot) {
  State.SavedPose.clear();
  for (const Name of PoseBones) {
    const Bone = Pivot.getObjectByName(Name);
    if (Bone?.isBone) State.SavedPose.set(Name, Bone.quaternion.clone());
  }
}

function AddBoneRotation(Pivot, Name, X, Y, Z) {
  const Bone = Pivot.getObjectByName(Name);
  if (!Bone?.isBone) return;
  State.TempEuler.set(X, Y, Z, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion).normalize();
}

function ApplyCollisionPose(Pivot) {
  const Blend = THREE.MathUtils.smoothstep(State.WallBlend, 0.02, 0.96);
  if (Blend <= 0.001) return;

  for (const [Name, Rest] of State.RestPose) {
    const Bone = Pivot.getObjectByName(Name);
    if (!Bone?.isBone) continue;
    const Weight = DampWeights.get(Name) || 0;
    Bone.quaternion.slerp(Rest, THREE.MathUtils.clamp(Blend * Weight, 0, 0.94));
  }

  const LeftTuck = Math.max(State.LeftBlend, Blend * 0.18);
  const RightTuck = Math.max(State.RightBlend, Blend * 0.18);
  AddBoneRotation(Pivot, "Shoulder.L", -0.025 * LeftTuck, 0, 0.055 * LeftTuck);
  AddBoneRotation(Pivot, "Shoulder.R", -0.025 * RightTuck, 0, -0.055 * RightTuck);
  AddBoneRotation(Pivot, "UpperArm.L", -0.10 * LeftTuck, 0, 0.09 * LeftTuck);
  AddBoneRotation(Pivot, "UpperArm.R", -0.10 * RightTuck, 0, -0.09 * RightTuck);
  AddBoneRotation(Pivot, "Chest", -0.035 * Blend, 0, (RightTuck - LeftTuck) * 0.025);
  AddBoneRotation(Pivot, "Hips", 0.025 * Blend, 0, 0);
  Pivot.updateMatrixWorld(true);
}

function RestoreCurrentPose(Pivot) {
  for (const [Name, Quaternion] of State.SavedPose) {
    const Bone = Pivot.getObjectByName(Name);
    if (Bone?.isBone) Bone.quaternion.copy(Quaternion);
  }
  Pivot.updateMatrixWorld(true);
}

function Attach(Context) {
  State.Scene = Context.Scene || State.Scene;
  State.Camera = Context.Camera || State.Camera;
  State.CollisionBoxes = Context.CollisionBoxes || State.CollisionBoxes;
  BasePlayer.Attach?.(Context);
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene || State.Scene;
  State.Camera = Camera || State.Camera;
  UpdateShapecast(Camera);

  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
      if (!Pivot || !BasePlayer.IsThirdPerson?.()) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      CaptureRestPose(Pivot);
      SaveCurrentPose(Pivot);
      try {
        ApplyCollisionPose(Pivot);
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RestoreCurrentPose(Pivot);
      }
    }
  };

  BasePlayer.Render(ProxyRenderer, Scene, Camera);
}

addEventListener("keydown", Event => State.Keys.add(Event.code));
addEventListener("keyup", Event => State.Keys.delete(Event.code));
addEventListener("blur", () => State.Keys.clear());

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render
};

window.__STORE_LOCOMOTION_SHAPECAST__ = State;
window.__STORE_LOCOMOTION_SHAPECAST_BUILD__ = "V0.12.1";
