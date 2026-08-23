import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player system must load before first-person walk bob.");

const WALK_SPEED_REFERENCE = 3.45;
const MAX_VERTICAL_BOB = 0.0065;
const MAX_SIDE_BOB = 0.0035;
const MAX_ROLL = THREE.MathUtils.degToRad(0.22);
const MIN_CADENCE = 6.8;
const MAX_CADENCE = 8.6;

const State = {
  LastCameraPosition: new THREE.Vector3(),
  SavedCameraPosition: new THREE.Vector3(),
  SavedCameraQuaternion: new THREE.Quaternion(),
  Right: new THREE.Vector3(),
  Up: new THREE.Vector3(),
  LastTime: performance.now(),
  HasPosition: false,
  MoveBlend: 0,
  Phase: 0
};

function ExpAlpha(Delta, Responsiveness) {
  return 1 - Math.exp(-Delta * Responsiveness);
}

function Jumping() {
  return Boolean(window.__STORE_JUMP_STATE__ && !window.__STORE_JUMP_STATE__.Grounded);
}

function UpdateMotion(Camera) {
  const Now = performance.now();
  const Delta = Math.min(Math.max((Now - State.LastTime) / 1000, 0.001), 0.05);
  State.LastTime = Now;

  if (!State.HasPosition) {
    State.LastCameraPosition.copy(Camera.position);
    State.HasPosition = true;
    return;
  }

  const DX = Camera.position.x - State.LastCameraPosition.x;
  const DZ = Camera.position.z - State.LastCameraPosition.z;
  State.LastCameraPosition.copy(Camera.position);

  const Speed = Math.hypot(DX, DZ) / Delta;
  const Target = Jumping() ? 0 : THREE.MathUtils.clamp(Speed / WALK_SPEED_REFERENCE, 0, 1);
  State.MoveBlend = THREE.MathUtils.lerp(State.MoveBlend, Target, ExpAlpha(Delta, Jumping() ? 20 : 12));

  if (State.MoveBlend > 0.005 && !Jumping()) {
    State.Phase += Delta * THREE.MathUtils.lerp(MIN_CADENCE, MAX_CADENCE, State.MoveBlend);
  }
}

function Render(Renderer, Scene, Camera) {
  UpdateMotion(Camera);

  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      if (BasePlayer.IsThirdPerson?.() || Jumping() || State.MoveBlend < 0.003) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      const Amount = THREE.MathUtils.smoothstep(State.MoveBlend, 0.03, 0.9);
      if (Amount <= 0.0001) {
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      State.SavedCameraPosition.copy(RenderCamera.position);
      State.SavedCameraQuaternion.copy(RenderCamera.quaternion);

      State.Right.set(1, 0, 0).applyQuaternion(RenderCamera.quaternion).normalize();
      State.Up.set(0, 1, 0).applyQuaternion(RenderCamera.quaternion).normalize();

      const Vertical = Math.sin(State.Phase * 2) * MAX_VERTICAL_BOB * Amount;
      const Side = Math.sin(State.Phase) * MAX_SIDE_BOB * Amount;
      const Roll = Math.sin(State.Phase) * MAX_ROLL * Amount;

      RenderCamera.position.addScaledVector(State.Up, Vertical);
      RenderCamera.position.addScaledVector(State.Right, Side);
      RenderCamera.rotateZ(Roll);
      RenderCamera.updateMatrixWorld(true);

      try {
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RenderCamera.position.copy(State.SavedCameraPosition);
        RenderCamera.quaternion.copy(State.SavedCameraQuaternion);
        RenderCamera.updateMatrixWorld(true);
      }
    }
  };

  BasePlayer.Render(ProxyRenderer, Scene, Camera);
}

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Render
};

window.__STORE_FIRST_PERSON_WALK_BOB_BUILD__ = "V0.12.7";
