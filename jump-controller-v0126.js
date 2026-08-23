import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before jump controller.");

const JUMP_VELOCITY = 4.9;
const GRAVITY = 16.4;
const MAX_FALL_SPEED = 12.0;
const TAKEOFF_TIME = 0.16;
const LAND_POSE_TIME = 0.30;
const FIRST_PERSON_LAND_DIP = 0.036;
const FIRST_PERSON_LAND_REBOUND = 0.010;
const FIRST_PERSON_LAND_PITCH = THREE.MathUtils.degToRad(0.75);

const State = {
  Offset: 0,
  Velocity: 0,
  Grounded: true,
  Queued: false,
  AirTime: 0,
  LandingTime: 999,
  LandingImpact: 0,
  LastTime: performance.now(),
  GroundCameraY: null,
  SavedPivotY: 0,
  SavedBones: new Map(),
  TempEuler: new THREE.Euler(),
  TempQuaternion: new THREE.Quaternion(),
  SavedRenderPosition: new THREE.Vector3(),
  SavedRenderQuaternion: new THREE.Quaternion()
};

function HudActive() {
  const Hud = document.getElementById("Hud");
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function ControlsActive() {
  const Controls = window.__STORE_POINTER_CONTROLS__;
  return Boolean(Controls?.isLocked);
}

function Clamp01(Value) {
  return THREE.MathUtils.clamp(Value, 0, 1);
}

function Smooth(Value) {
  return Value * Value * (3 - 2 * Value);
}

function UpdateJump() {
  const Now = performance.now();
  const Delta = THREE.MathUtils.clamp((Now - State.LastTime) / 1000, 0.001, 0.05);
  State.LastTime = Now;

  if (State.Queued && State.Grounded && HudActive() && ControlsActive()) {
    State.Velocity = JUMP_VELOCITY;
    State.Grounded = false;
    State.AirTime = 0;
    State.LandingTime = 999;
    State.LandingImpact = 0;
  }
  State.Queued = false;

  if (!State.Grounded) {
    State.AirTime += Delta;
    State.Velocity = Math.max(-MAX_FALL_SPEED, State.Velocity - GRAVITY * Delta);
    State.Offset += State.Velocity * Delta;

    if (State.Offset <= 0 && State.Velocity <= 0) {
      const ImpactSpeed = Math.abs(State.Velocity);
      State.Offset = 0;
      State.Velocity = 0;
      State.Grounded = true;
      State.LandingTime = 0;
      State.LandingImpact = Clamp01((ImpactSpeed - 2.2) / 4.8) * 0.78 + 0.22;
    }
  } else if (State.LandingTime < 999) {
    State.LandingTime += Delta;
    if (State.LandingTime > 0.75) {
      State.LandingTime = 999;
      State.LandingImpact = 0;
    }
  }

  window.__STORE_PLAYER_VERTICAL_OFFSET__ = State.Offset;
}

function SaveBone(Bone) {
  if (!Bone?.isBone || State.SavedBones.has(Bone)) return;
  State.SavedBones.set(Bone, Bone.quaternion.clone());
}

function RotateBone(Pivot, Name, X, Y, Z, Weight = 1) {
  const Bone = Pivot.getObjectByName(Name);
  if (!Bone?.isBone || Weight <= 0.0001) return;
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

function JumpPoseWeights() {
  if (!State.Grounded) {
    const Takeoff = Smooth(Clamp01(1 - State.AirTime / TAKEOFF_TIME));
    const Upward = Clamp01(State.Velocity / JUMP_VELOCITY);
    const Falling = Clamp01(-State.Velocity / 6.5);
    const Apex = Clamp01(1 - Math.abs(State.Velocity) / 2.4);
    return { Takeoff, Upward, Apex, Falling, Landing: 0 };
  }

  const Landing = State.LandingTime < LAND_POSE_TIME
    ? Smooth(Clamp01(1 - State.LandingTime / LAND_POSE_TIME)) * State.LandingImpact
    : 0;
  return { Takeoff: 0, Upward: 0, Apex: 0, Falling: 0, Landing };
}

function ApplyProceduralJumpPose(Pivot) {
  const Weight = JumpPoseWeights();
  const Air = Clamp01(Weight.Upward * 0.65 + Weight.Apex + Weight.Falling * 0.75);
  const KneeTuck = Clamp01(Weight.Takeoff * 0.55 + Weight.Apex * 0.72 + Weight.Falling * 0.32 + Weight.Landing * 0.90);

  RotateBone(Pivot, "Hips", 0.10, 0, 0, Weight.Takeoff + Weight.Landing * 0.75);
  RotateBone(Pivot, "Abdomen", -0.055, 0, 0, Air + Weight.Landing * 0.55);
  RotateBone(Pivot, "Torso", -0.035, 0, 0, Weight.Upward + Weight.Falling * 0.45);
  RotateBone(Pivot, "Chest", 0.025, 0, 0, Weight.Apex + Weight.Falling * 0.40);

  RotateBone(Pivot, "UpperLeg.L", 0.34, 0, 0.035, KneeTuck);
  RotateBone(Pivot, "UpperLeg.R", 0.34, 0, -0.035, KneeTuck);
  RotateBone(Pivot, "LowerLeg.L", -0.56, 0, 0, KneeTuck);
  RotateBone(Pivot, "LowerLeg.R", -0.56, 0, 0, KneeTuck);
  RotateBone(Pivot, "Foot.L", 0.14, 0, 0, Weight.Falling + Weight.Landing * 0.45);
  RotateBone(Pivot, "Foot.R", 0.14, 0, 0, Weight.Falling + Weight.Landing * 0.45);

  RotateBone(Pivot, "Shoulder.L", -0.10, 0, 0.04, Air);
  RotateBone(Pivot, "Shoulder.R", -0.10, 0, -0.04, Air);
  RotateBone(Pivot, "UpperArm.L", -0.16, 0, 0.10, Weight.Upward + Weight.Apex * 0.55);
  RotateBone(Pivot, "UpperArm.R", -0.16, 0, -0.10, Weight.Upward + Weight.Apex * 0.55);
  RotateBone(Pivot, "LowerArm.L", -0.10, 0, 0, Weight.Apex + Weight.Falling * 0.45);
  RotateBone(Pivot, "LowerArm.R", -0.10, 0, 0, Weight.Apex + Weight.Falling * 0.45);

  if (Weight.Landing > 0) {
    RotateBone(Pivot, "UpperArm.L", 0.08, 0, -0.04, Weight.Landing);
    RotateBone(Pivot, "UpperArm.R", 0.08, 0, 0.04, Weight.Landing);
    RotateBone(Pivot, "Neck", -0.035, 0, 0, Weight.Landing);
  }

  Pivot.updateMatrixWorld(true);
}

function ApplyFirstPersonLandingCamera(RenderCamera) {
  if (!State.Grounded || State.LandingTime >= 0.42 || State.LandingImpact <= 0.001) return false;

  const Time = State.LandingTime;
  const Envelope = Math.exp(-Time * 10.5) * State.LandingImpact;
  const Rebound = Math.sin(Time * 27) * Math.exp(-Time * 13) * State.LandingImpact;
  const Dip = -FIRST_PERSON_LAND_DIP * Envelope + FIRST_PERSON_LAND_REBOUND * Rebound;
  const Pitch = FIRST_PERSON_LAND_PITCH * (Envelope * 0.65 - Rebound * 0.40);

  State.SavedRenderPosition.copy(RenderCamera.position);
  State.SavedRenderQuaternion.copy(RenderCamera.quaternion);
  RenderCamera.position.y += Dip;
  RenderCamera.rotateX(Pitch);
  RenderCamera.updateMatrixWorld(true);
  return true;
}

function RestoreFirstPersonLandingCamera(RenderCamera) {
  RenderCamera.position.copy(State.SavedRenderPosition);
  RenderCamera.quaternion.copy(State.SavedRenderQuaternion);
  RenderCamera.updateMatrixWorld(true);
}

function Attach(Context) {
  if (Context?.Camera && State.GroundCameraY === null) State.GroundCameraY = Context.Camera.position.y;
  BasePlayer.Attach?.(Context);
}

function Render(Renderer, Scene, Camera) {
  UpdateJump();

  if (State.GroundCameraY === null || State.Grounded && State.Offset <= 0.0001) {
    State.GroundCameraY = Camera.position.y;
  }

  Camera.position.y = State.GroundCameraY + State.Offset;
  Camera.updateMatrixWorld(true);

  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
      const ThirdPerson = BasePlayer.IsThirdPerson?.() !== false;
      let PivotRaised = false;
      let ThirdPersonCameraRaised = false;
      let LandingCameraApplied = false;
      const SavedThirdPersonCameraY = RenderCamera.position.y;

      if (Pivot) {
        if (State.Offset > 0) {
          State.SavedPivotY = Pivot.position.y;
          Pivot.position.y = State.SavedPivotY + State.Offset;
          PivotRaised = true;
          Pivot.updateMatrixWorld(true);
        }
        ApplyProceduralJumpPose(Pivot);
      }

      if (ThirdPerson && State.Offset > 0) {
        RenderCamera.position.y = SavedThirdPersonCameraY + State.Offset;
        RenderCamera.updateMatrixWorld(true);
        ThirdPersonCameraRaised = true;
      } else if (!ThirdPerson) {
        LandingCameraApplied = ApplyFirstPersonLandingCamera(RenderCamera);
      }

      try {
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        if (LandingCameraApplied) RestoreFirstPersonLandingCamera(RenderCamera);
        if (ThirdPersonCameraRaised) {
          RenderCamera.position.y = SavedThirdPersonCameraY;
          RenderCamera.updateMatrixWorld(true);
        }
        if (Pivot) {
          RestoreBones(Pivot);
          if (PivotRaised) {
            Pivot.position.y = State.SavedPivotY;
            Pivot.updateMatrixWorld(true);
          }
        }
      }
    }
  };

  BasePlayer.Render(ProxyRenderer, Scene, Camera);
}

addEventListener("keydown", Event => {
  if (Event.code !== "Space" || Event.repeat || !HudActive() || !ControlsActive()) return;
  Event.preventDefault();
  State.Queued = true;
});

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render,
  IsJumping: () => !State.Grounded,
  IsGrounded: () => State.Grounded,
  GetJumpOffset: () => State.Offset,
  GetVerticalVelocity: () => State.Velocity,
  GetLandingImpact: () => State.LandingImpact
};

window.__STORE_JUMP_STATE__ = State;
window.__STORE_JUMP_CONTROLLER_BUILD__ = "V0.12.9";
