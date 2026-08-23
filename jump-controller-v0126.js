import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before jump controller.");

const JUMP_VELOCITY = 4.7;
const GRAVITY = 15.8;
const MAX_FALL_SPEED = 12.0;
const LAND_EPSILON = 0.001;

const State = {
  Offset: 0,
  Velocity: 0,
  Grounded: true,
  Queued: false,
  LastTime: performance.now(),
  SavedCameraY: 0,
  SavedPivotY: 0,
  SavedBones: new Map()
};

function HudActive() {
  const Hud = document.getElementById("Hud");
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function ControlsActive() {
  const Controls = window.__STORE_POINTER_CONTROLS__;
  return Boolean(Controls?.isLocked);
}

function UpdateJump() {
  const Now = performance.now();
  const Delta = THREE.MathUtils.clamp((Now - State.LastTime) / 1000, 0.001, 0.05);
  State.LastTime = Now;

  if (State.Queued && State.Grounded && HudActive() && ControlsActive()) {
    State.Velocity = JUMP_VELOCITY;
    State.Grounded = false;
  }
  State.Queued = false;

  if (!State.Grounded) {
    State.Velocity = Math.max(-MAX_FALL_SPEED, State.Velocity - GRAVITY * Delta);
    State.Offset += State.Velocity * Delta;
    if (State.Offset <= LAND_EPSILON && State.Velocity <= 0) {
      State.Offset = 0;
      State.Velocity = 0;
      State.Grounded = true;
    }
  } else {
    State.Offset = 0;
    State.Velocity = 0;
  }

  window.__STORE_PLAYER_VERTICAL_OFFSET__ = State.Offset;
}

function SaveBone(Bone) {
  if (!Bone?.isBone || State.SavedBones.has(Bone)) return;
  State.SavedBones.set(Bone, Bone.quaternion.clone());
}

function RotateBone(Bone, X, Y, Z) {
  if (!Bone?.isBone) return;
  SaveBone(Bone);
  const Rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(X, Y, Z, "XYZ"));
  Bone.quaternion.multiply(Rotation).normalize();
}

function ApplyAirPose(Pivot) {
  if (State.Grounded || State.Offset <= 0.015) return;
  const Rise = THREE.MathUtils.clamp(Math.abs(State.Velocity) / JUMP_VELOCITY, 0, 1);
  const Tuck = THREE.MathUtils.lerp(0.13, 0.23, 1 - Rise);
  RotateBone(Pivot.getObjectByName("UpperLeg.L"), Tuck, 0, 0.025);
  RotateBone(Pivot.getObjectByName("UpperLeg.R"), Tuck, 0, -0.025);
  RotateBone(Pivot.getObjectByName("LowerLeg.L"), -Tuck * 1.35, 0, 0);
  RotateBone(Pivot.getObjectByName("LowerLeg.R"), -Tuck * 1.35, 0, 0);
  RotateBone(Pivot.getObjectByName("UpperArm.L"), -0.05, 0, 0.04);
  RotateBone(Pivot.getObjectByName("UpperArm.R"), -0.05, 0, -0.04);
  Pivot.updateMatrixWorld(true);
}

function RestoreBones(Pivot) {
  for (const [Bone, Quaternion] of State.SavedBones) Bone.quaternion.copy(Quaternion);
  State.SavedBones.clear();
  Pivot?.updateMatrixWorld(true);
}

function Attach(Context) {
  BasePlayer.Attach?.(Context);
}

function Render(Renderer, Scene, Camera) {
  UpdateJump();
  State.SavedCameraY = Camera.position.y;
  Camera.position.y = State.SavedCameraY + State.Offset;
  Camera.updateMatrixWorld(true);

  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
      const ThirdPerson = BasePlayer.IsThirdPerson?.() !== false;

      if (Pivot && ThirdPerson && State.Offset > 0) {
        State.SavedPivotY = Pivot.position.y;
        Pivot.position.y = State.SavedPivotY + State.Offset;
        Pivot.updateMatrixWorld(true);
        ApplyAirPose(Pivot);
      }

      try {
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        if (Pivot && ThirdPerson && State.Offset > 0) {
          RestoreBones(Pivot);
          Pivot.position.y = State.SavedPivotY;
          Pivot.updateMatrixWorld(true);
        }
      }
    }
  };

  try {
    BasePlayer.Render(ProxyRenderer, Scene, Camera);
  } finally {
    Camera.position.y = State.SavedCameraY;
    Camera.updateMatrixWorld(true);
  }
}

addEventListener("keydown", Event => {
  if (Event.code !== "Space" || Event.repeat || !HudActive() || !ControlsActive()) return;
  Event.preventDefault();
  State.Queued = true;
});

const ControlsHint = document.querySelector(".ControlsHint");
if (ControlsHint && !ControlsHint.querySelector("[data-jump-hint]")) {
  const Hint = document.createElement("span");
  Hint.dataset.jumpHint = "1";
  Hint.textContent = "SPACE JUMP";
  ControlsHint.insertBefore(Hint, ControlsHint.children[2] || null);
}

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render,
  IsJumping: () => !State.Grounded,
  GetJumpOffset: () => State.Offset,
  GetVerticalVelocity: () => State.Velocity
};

window.__STORE_JUMP_STATE__ = State;
window.__STORE_JUMP_CONTROLLER_BUILD__ = "V0.12.6";
