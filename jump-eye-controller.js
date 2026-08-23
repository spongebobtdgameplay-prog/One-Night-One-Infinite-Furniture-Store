import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before jump and eye controller.");

const JUMP_VELOCITY = 4.65;
const GRAVITY = 15.8;
const MAX_FALL_SPEED = 11.5;
const EYE_FORWARD = 0.055;
const LAND_DIP = 0.026;
const LAND_REBOUND = 0.008;
const LAND_PITCH = THREE.MathUtils.degToRad(0.48);

const State = {
  Camera: null,
  Scene: null,
  Offset: 0,
  Velocity: 0,
  Grounded: true,
  Queued: false,
  AirTime: 0,
  LandingTime: 99,
  LandingImpact: 0,
  LastPhysicsAt: performance.now(),
  EyeYOffset: null,
  SavedPivotPosition: new THREE.Vector3(),
  SavedCameraPosition: new THREE.Vector3(),
  SavedCameraQuaternion: new THREE.Quaternion(),
  HeadPosition: new THREE.Vector3(),
  EyePosition: new THREE.Vector3(),
  Forward: new THREE.Vector3(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion(),
  SavedBones: new Map()
};

const JumpBones = [
  "Hips", "Abdomen", "Torso", "Chest",
  "Shoulder.L", "Shoulder.R", "UpperArm.L", "UpperArm.R",
  "LowerArm.L", "LowerArm.R",
  "UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R", "Foot.L", "Foot.R"
];

function Clamp01(Value) {
  return THREE.MathUtils.clamp(Value, 0, 1);
}

function Smooth(Value) {
  const T = Clamp01(Value);
  return T * T * (3 - 2 * T);
}

function GameplayActive() {
  const Hud = document.getElementById("Hud");
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function UpdatePhysics() {
  const Now = performance.now();
  const Delta = THREE.MathUtils.clamp((Now - State.LastPhysicsAt) / 1000, 0, 0.034);
  if (Delta < 0.0005) return;
  State.LastPhysicsAt = Now;

  if (State.Queued && State.Grounded && GameplayActive()) {
    State.Queued = false;
    State.Grounded = false;
    State.Velocity = JUMP_VELOCITY;
    State.AirTime = 0;
    State.LandingTime = 99;
    State.LandingImpact = 0;
  } else {
    State.Queued = false;
  }

  if (!State.Grounded) {
    State.AirTime += Delta;
    State.Velocity = Math.max(-MAX_FALL_SPEED, State.Velocity - GRAVITY * Delta);
    State.Offset += State.Velocity * Delta;
    if (State.Offset <= 0 && State.Velocity <= 0) {
      const ImpactVelocity = Math.abs(State.Velocity);
      State.Offset = 0;
      State.Velocity = 0;
      State.Grounded = true;
      State.LandingTime = 0;
      State.LandingImpact = THREE.MathUtils.clamp((ImpactVelocity - 2.4) / 5.2, 0.22, 0.82);
    }
  } else if (State.LandingTime < 99) {
    State.LandingTime += Delta;
    if (State.LandingTime > 0.48) {
      State.LandingTime = 99;
      State.LandingImpact = 0;
    }
  }

  window.__STORE_PLAYER_VERTICAL_OFFSET__ = State.Offset;
}

function SaveBone(Bone) {
  if (!Bone?.isBone || State.SavedBones.has(Bone)) return;
  State.SavedBones.set(Bone, Bone.quaternion.clone());
}

function AddRotation(Pivot, Name, X, Y, Z, Weight) {
  if (Weight <= 0.0001) return;
  const Bone = Pivot.getObjectByName(Name);
  if (!Bone?.isBone) return;
  SaveBone(Bone);
  State.TempEuler.set(X * Weight, Y * Weight, Z * Weight, "XYZ");
  State.TempQuaternion.setFromEuler(State.TempEuler);
  Bone.quaternion.multiply(State.TempQuaternion).normalize();
}

function RestoreBones(Pivot) {
  for (const [Bone, Quaternion] of State.SavedBones) Bone.quaternion.copy(Quaternion);
  State.SavedBones.clear();
  Pivot?.updateMatrixWorld(true);
}

function ApplyJumpPose(Pivot) {
  let Takeoff = 0;
  let Rise = 0;
  let Apex = 0;
  let Fall = 0;
  let Land = 0;

  if (!State.Grounded) {
    Takeoff = Smooth(1 - State.AirTime / 0.105);
    Rise = Smooth(State.Velocity / JUMP_VELOCITY);
    Apex = Smooth(1 - Math.abs(State.Velocity) / 1.8);
    Fall = Smooth(-State.Velocity / 6.8);
  } else if (State.LandingTime < 0.22) {
    Land = Smooth(1 - State.LandingTime / 0.22) * State.LandingImpact;
  }

  const Preparation = Clamp01(Takeoff + Land * 0.85);
  const AirBalance = Clamp01(Rise * 0.55 + Apex * 0.42 + Fall * 0.34);

  AddRotation(Pivot, "Hips", 0.032, 0, 0, Preparation);
  AddRotation(Pivot, "Abdomen", -0.018, 0, 0, AirBalance);
  AddRotation(Pivot, "Torso", -0.014, 0, 0, Rise + Fall * 0.22);
  AddRotation(Pivot, "Chest", 0.010, 0, 0, Apex);

  AddRotation(Pivot, "UpperLeg.L", 0.085, 0, 0.012, Preparation);
  AddRotation(Pivot, "UpperLeg.R", 0.070, 0, -0.012, Preparation);
  AddRotation(Pivot, "LowerLeg.L", -0.145, 0, 0, Preparation);
  AddRotation(Pivot, "LowerLeg.R", -0.125, 0, 0, Preparation);

  AddRotation(Pivot, "UpperLeg.L", 0.038, 0, 0, Apex);
  AddRotation(Pivot, "UpperLeg.R", -0.024, 0, 0, Apex);
  AddRotation(Pivot, "LowerLeg.L", -0.038, 0, 0, Fall);
  AddRotation(Pivot, "LowerLeg.R", -0.052, 0, 0, Fall);
  AddRotation(Pivot, "Foot.L", 0.060, 0, 0, Fall + Land * 0.38);
  AddRotation(Pivot, "Foot.R", 0.060, 0, 0, Fall + Land * 0.38);

  AddRotation(Pivot, "Shoulder.L", -0.026, 0, 0.018, AirBalance);
  AddRotation(Pivot, "Shoulder.R", -0.026, 0, -0.018, AirBalance);
  AddRotation(Pivot, "UpperArm.L", -0.050, 0, 0.030, Rise + Apex * 0.28);
  AddRotation(Pivot, "UpperArm.R", -0.042, 0, -0.030, Rise + Apex * 0.28);
  AddRotation(Pivot, "LowerArm.L", -0.030, 0, 0, AirBalance);
  AddRotation(Pivot, "LowerArm.R", -0.026, 0, 0, AirBalance);
  Pivot.updateMatrixWorld(true);
}

function ApplyEyeAnchor(Pivot, Camera) {
  const Head = Pivot.getObjectByName("Head");
  if (!Head?.isBone) return;

  Head.getWorldPosition(State.HeadPosition);
  if (State.EyeYOffset === null && State.Grounded && State.Offset <= 0.0001) {
    State.EyeYOffset = Camera.position.y - State.HeadPosition.y;
  }

  State.Forward.set(0, 0, -1).applyQuaternion(Camera.quaternion);
  State.Forward.y = 0;
  if (State.Forward.lengthSq() < 0.000001) State.Forward.set(0, 0, -1);
  State.Forward.normalize();

  State.EyePosition.copy(State.HeadPosition);
  State.EyePosition.y += State.EyeYOffset ?? 0.115;
  State.EyePosition.addScaledVector(State.Forward, EYE_FORWARD);
  Camera.position.copy(State.EyePosition);
  Camera.updateMatrixWorld(true);
}

function ApplyLandingCamera(Camera) {
  if (!State.Grounded || State.LandingTime >= 0.36 || State.LandingImpact <= 0.001) return;
  const Envelope = Math.exp(-State.LandingTime * 11.5) * State.LandingImpact;
  const Rebound = Math.sin(State.LandingTime * 28) * Math.exp(-State.LandingTime * 14) * State.LandingImpact;
  Camera.position.y += -LAND_DIP * Envelope + LAND_REBOUND * Rebound;
  Camera.rotateX(LAND_PITCH * (Envelope * 0.62 - Rebound * 0.34));
  Camera.updateMatrixWorld(true);
}

function Attach(Context) {
  State.Camera = Context?.Camera || State.Camera;
  State.Scene = Context?.Scene || State.Scene;
  BasePlayer.Attach?.(Context);
}

function GetMovementSpeed(WantsSprint, Moving) {
  UpdatePhysics();
  return BasePlayer.GetMovementSpeed?.(WantsSprint, Moving) ?? (WantsSprint && Moving ? 5.35 : 3.45);
}

function Render(Renderer, Scene, Camera) {
  UpdatePhysics();
  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
      if (!Pivot) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      State.SavedPivotPosition.copy(Pivot.position);
      State.SavedCameraPosition.copy(RenderCamera.position);
      State.SavedCameraQuaternion.copy(RenderCamera.quaternion);
      State.SavedBones.clear();
      for (const Name of JumpBones) SaveBone(Pivot.getObjectByName(Name));

      Pivot.position.y = State.SavedPivotPosition.y + State.Offset;
      Pivot.updateMatrixWorld(true);
      ApplyJumpPose(Pivot);

      const ThirdPerson = BasePlayer.IsThirdPerson?.() !== false;
      if (ThirdPerson) {
        RenderCamera.position.y += State.Offset;
        RenderCamera.updateMatrixWorld(true);
      } else {
        ApplyEyeAnchor(Pivot, RenderCamera);
        ApplyLandingCamera(RenderCamera);
      }

      try {
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RestoreBones(Pivot);
        Pivot.position.copy(State.SavedPivotPosition);
        Pivot.updateMatrixWorld(true);
        RenderCamera.position.copy(State.SavedCameraPosition);
        RenderCamera.quaternion.copy(State.SavedCameraQuaternion);
        RenderCamera.updateMatrixWorld(true);
      }
    }
  };

  BasePlayer.Render(ProxyRenderer, Scene, Camera);
}

addEventListener("keydown", Event => {
  if (Event.code !== "Space" || Event.repeat || !GameplayActive()) return;
  Event.preventDefault();
  State.Queued = true;
});

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render,
  GetMovementSpeed,
  IsJumping: () => !State.Grounded,
  IsGrounded: () => State.Grounded,
  GetJumpOffset: () => State.Offset,
  GetVerticalVelocity: () => State.Velocity,
  GetLandingImpact: () => State.LandingImpact
};

window.__STORE_JUMP_EYE_BUILD__ = "V0.12.10";
