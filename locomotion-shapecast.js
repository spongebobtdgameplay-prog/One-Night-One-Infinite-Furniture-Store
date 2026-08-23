import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before locomotion shapecast.");

const WALK_PROBE = 1.08;
const SPRINT_PROBE = 1.46;
const ARM_SIDE_PROBE = 0.78;
const PROBE_STEPS = 16;
const MOVE_LANE_OFFSET = 0.18;
const MOVE_LANE_RADIUS = 0.10;
const ARM_PROBE_RADIUS = 0.075;
const ENTER_RESPONSE = 18;
const EXIT_RESPONSE = 10;

const State = {
  Scene: null,
  Camera: null,
  CollisionBoxes: null,
  Keys: new Set(),
  LastPivotPosition: new THREE.Vector3(),
  PivotPosition: new THREE.Vector3(),
  HasLastPosition: false,
  LastTime: performance.now(),
  Velocity: new THREE.Vector3(),
  MoveDirection: new THREE.Vector3(),
  Forward: new THREE.Vector3(),
  Right: new THREE.Vector3(),
  BodyRight: new THREE.Vector3(),
  Sample: new THREE.Vector3(),
  LeftOrigin: new THREE.Vector3(),
  RightOrigin: new THREE.Vector3(),
  LeftDirection: new THREE.Vector3(),
  RightDirection: new THREE.Vector3(),
  TempWorldQuaternion: new THREE.Quaternion(),
  WallBlend: 0,
  LeftBlend: 0,
  RightBlend: 0,
  HitDistance: Infinity,
  LeftDistance: Infinity,
  RightDistance: Infinity,
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

const ForwardDampWeights = new Map([
  ["Hips", 0.30], ["Abdomen", 0.34], ["Torso", 0.38], ["Chest", 0.42], ["Neck", 0.24],
  ["Shoulder.L", 0.54], ["Shoulder.R", 0.54],
  ["UpperArm.L", 0.72], ["UpperArm.R", 0.72],
  ["LowerArm.L", 0.70], ["LowerArm.R", 0.70],
  ["Wrist.L", 0.58], ["Wrist.R", 0.58],
  ["UpperLeg.L", 0.94], ["UpperLeg.R", 0.94],
  ["LowerLeg.L", 0.90], ["LowerLeg.R", 0.90],
  ["Foot.L", 0.78], ["Foot.R", 0.78]
]);

const LeftArmBones = ["Shoulder.L", "UpperArm.L", "LowerArm.L", "Wrist.L"];
const RightArmBones = ["Shoulder.R", "UpperArm.R", "LowerArm.R", "Wrist.R"];

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
    }

    const Bounds = Entry.Box || Entry;
    if (!FiniteBounds(Bounds)) continue;
    if (CircleHitsBox(Position, Radius, Bounds)) return true;
  }
  return false;
}

function SweepCircle(Origin, Direction, Radius, Length) {
  if (Direction.lengthSq() < 0.000001 || Length <= 0) return Infinity;

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

function BlendFromHit(Distance, Length, NearDistance = 0.04) {
  if (!Number.isFinite(Distance)) return 0;
  return 1 - THREE.MathUtils.clamp(
    (Distance - NearDistance) / Math.max(Length - NearDistance, 0.01),
    0,
    1
  );
}

function BodyRightDirection(Pivot) {
  Pivot.getWorldQuaternion(State.TempWorldQuaternion);
  State.BodyRight.set(1, 0, 0).applyQuaternion(State.TempWorldQuaternion);
  State.BodyRight.y = 0;
  if (State.BodyRight.lengthSq() < 0.000001) State.BodyRight.set(1, 0, 0);
  return State.BodyRight.normalize();
}

function DecayBlend(Delta) {
  const Alpha = ExpAlpha(Delta, EXIT_RESPONSE);
  State.WallBlend = THREE.MathUtils.lerp(State.WallBlend, 0, Alpha);
  State.LeftBlend = THREE.MathUtils.lerp(State.LeftBlend, 0, Alpha);
  State.RightBlend = THREE.MathUtils.lerp(State.RightBlend, 0, Alpha);
  State.HitDistance = Infinity;
  State.LeftDistance = Infinity;
  State.RightDistance = Infinity;
}

function UpdateShapecast(Camera, Pivot) {
  const Now = performance.now();
  const Delta = THREE.MathUtils.clamp((Now - State.LastTime) / 1000, 0.001, 0.05);
  State.LastTime = Now;

  Pivot.getWorldPosition(State.PivotPosition);
  State.PivotPosition.y = 0;

  if (!State.HasLastPosition) {
    State.LastPivotPosition.copy(State.PivotPosition);
    State.HasLastPosition = true;
  }

  State.Velocity.copy(State.PivotPosition).sub(State.LastPivotPosition).divideScalar(Delta);
  State.Velocity.y = 0;
  State.LastPivotPosition.copy(State.PivotPosition);

  if (!BasePlayer.IsThirdPerson?.()) {
    DecayBlend(Delta);
    return;
  }

  const ReportedRadius = Number(BasePlayer.GetPlayerRadius?.()) || 0.30;
  const BodyRadius = THREE.MathUtils.clamp(ReportedRadius, 0.22, 0.42);
  const Direction = InputDirection(Camera);
  const Moving = Direction.lengthSq() > 0.000001;
  const Length = BasePlayer.IsSprinting?.() ? SPRINT_PROBE : WALK_PROBE;

  let CenterHit = Infinity;
  let LeftMoveHit = Infinity;
  let RightMoveHit = Infinity;

  if (Moving) {
    State.Right.set(-Direction.z, 0, Direction.x).normalize();
    CenterHit = SweepCircle(State.PivotPosition, Direction, BodyRadius, Length);

    State.LeftOrigin.copy(State.PivotPosition).addScaledVector(State.Right, -MOVE_LANE_OFFSET);
    State.RightOrigin.copy(State.PivotPosition).addScaledVector(State.Right, MOVE_LANE_OFFSET);
    LeftMoveHit = SweepCircle(State.LeftOrigin, Direction, MOVE_LANE_RADIUS, Length);
    RightMoveHit = SweepCircle(State.RightOrigin, Direction, MOVE_LANE_RADIUS, Length);
  }

  const BodyRight = BodyRightDirection(Pivot);
  State.LeftDirection.copy(BodyRight).multiplyScalar(-1);
  State.RightDirection.copy(BodyRight);

  const LeftSideHit = SweepCircle(State.PivotPosition, State.LeftDirection, ARM_PROBE_RADIUS, ARM_SIDE_PROBE);
  const RightSideHit = SweepCircle(State.PivotPosition, State.RightDirection, ARM_PROBE_RADIUS, ARM_SIDE_PROBE);

  const ClosestMoveHit = Math.min(CenterHit, LeftMoveHit, RightMoveHit);
  const ForwardBlend = Moving ? BlendFromHit(ClosestMoveHit, Length, 0.08) : 0;
  const LeftMoveBlend = Moving ? BlendFromHit(LeftMoveHit, Length, 0.08) : 0;
  const RightMoveBlend = Moving ? BlendFromHit(RightMoveHit, Length, 0.08) : 0;
  const LeftSideBlend = BlendFromHit(LeftSideHit, ARM_SIDE_PROBE, 0.12);
  const RightSideBlend = BlendFromHit(RightSideHit, ARM_SIDE_PROBE, 0.12);

  const TargetLeft = Math.max(LeftMoveBlend, LeftSideBlend);
  const TargetRight = Math.max(RightMoveBlend, RightSideBlend);
  const TargetWall = Math.max(ForwardBlend, Math.max(TargetLeft, TargetRight) * 0.16);

  const WallResponse = TargetWall > State.WallBlend ? ENTER_RESPONSE : EXIT_RESPONSE;
  const LeftResponse = TargetLeft > State.LeftBlend ? ENTER_RESPONSE : EXIT_RESPONSE;
  const RightResponse = TargetRight > State.RightBlend ? ENTER_RESPONSE : EXIT_RESPONSE;

  State.WallBlend = THREE.MathUtils.lerp(State.WallBlend, TargetWall, ExpAlpha(Delta, WallResponse));
  State.LeftBlend = THREE.MathUtils.lerp(State.LeftBlend, TargetLeft, ExpAlpha(Delta, LeftResponse));
  State.RightBlend = THREE.MathUtils.lerp(State.RightBlend, TargetRight, ExpAlpha(Delta, RightResponse));
  State.HitDistance = ClosestMoveHit;
  State.LeftDistance = Math.min(LeftMoveHit, LeftSideHit);
  State.RightDistance = Math.min(RightMoveHit, RightSideHit);
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

function DampBoneToRest(Pivot, Name, Blend) {
  const Bone = Pivot.getObjectByName(Name);
  const Rest = State.RestPose.get(Name);
  if (!Bone?.isBone || !Rest || Blend <= 0) return;
  Bone.quaternion.slerp(Rest, THREE.MathUtils.clamp(Blend, 0, 0.985));
}

function ApplyCollisionPose(Pivot) {
  const ForwardBlend = THREE.MathUtils.smoothstep(State.WallBlend, 0.02, 0.96);
  const LeftBlend = THREE.MathUtils.smoothstep(State.LeftBlend, 0.02, 0.92);
  const RightBlend = THREE.MathUtils.smoothstep(State.RightBlend, 0.02, 0.92);

  if (ForwardBlend <= 0.001 && LeftBlend <= 0.001 && RightBlend <= 0.001) return;

  if (ForwardBlend > 0.001) {
    for (const [Name, Rest] of State.RestPose) {
      const Bone = Pivot.getObjectByName(Name);
      if (!Bone?.isBone) continue;
      const Weight = ForwardDampWeights.get(Name) || 0;
      Bone.quaternion.slerp(Rest, THREE.MathUtils.clamp(ForwardBlend * Weight, 0, 0.96));
    }
  }

  for (const Name of LeftArmBones) DampBoneToRest(Pivot, Name, LeftBlend * 0.97);
  for (const Name of RightArmBones) DampBoneToRest(Pivot, Name, RightBlend * 0.97);

  AddBoneRotation(Pivot, "Shoulder.L", -0.035 * LeftBlend, 0.02 * LeftBlend, 0.14 * LeftBlend);
  AddBoneRotation(Pivot, "UpperArm.L", -0.17 * LeftBlend, 0.04 * LeftBlend, 0.24 * LeftBlend);
  AddBoneRotation(Pivot, "LowerArm.L", -0.16 * LeftBlend, 0.02 * LeftBlend, 0.06 * LeftBlend);
  AddBoneRotation(Pivot, "Wrist.L", -0.05 * LeftBlend, 0, 0.04 * LeftBlend);

  AddBoneRotation(Pivot, "Shoulder.R", -0.035 * RightBlend, -0.02 * RightBlend, -0.14 * RightBlend);
  AddBoneRotation(Pivot, "UpperArm.R", -0.17 * RightBlend, -0.04 * RightBlend, -0.24 * RightBlend);
  AddBoneRotation(Pivot, "LowerArm.R", -0.16 * RightBlend, -0.02 * RightBlend, -0.06 * RightBlend);
  AddBoneRotation(Pivot, "Wrist.R", -0.05 * RightBlend, 0, -0.04 * RightBlend);

  const SideBalance = RightBlend - LeftBlend;
  AddBoneRotation(Pivot, "Chest", -0.045 * ForwardBlend, 0, SideBalance * 0.035);
  AddBoneRotation(Pivot, "Hips", 0.03 * ForwardBlend, 0, SideBalance * 0.012);
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

  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
      if (!Pivot || !BasePlayer.IsThirdPerson?.()) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      UpdateShapecast(RenderCamera, Pivot);
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
window.__STORE_LOCOMOTION_SHAPECAST_BUILD__ = "V0.12.2";
