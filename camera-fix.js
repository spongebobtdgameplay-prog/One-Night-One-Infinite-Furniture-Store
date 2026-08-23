import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;

if (!BasePlayer) throw new Error("Player controller must load before camera fix.");

const THIRD_PERSON_TARGET_HEIGHT = 1.22;
const MIN_RENDER_CAMERA_Y = 0.34;
const EYE_OFFSET = new THREE.Vector3(0, 0.045, 0.055);
const PLAYER_CAPSULE_RADIUS = 0.34;

const State = {
  Scene: null,
  Camera: null,
  Pivot: null,
  Head: null,
  TempDirection: new THREE.Vector3(),
  TempEye: new THREE.Vector3(),
  TempCorrection: new THREE.Vector3(),
  TempTarget: new THREE.Vector3(),
  SavedLogicalPosition: new THREE.Vector3()
};

function RefreshRig() {
  if (!State.Scene) return;
  if (!State.Pivot || !State.Pivot.parent) State.Pivot = State.Scene.getObjectByName("PlayerCharacterPivot") || null;
  if (State.Pivot && (!State.Head || !State.Head.parent)) State.Head = State.Pivot.getObjectByName("Head") || null;
}

function AlignFirstPersonRig() {
  RefreshRig();
  if (!State.Pivot || !State.Camera) return;

  State.Camera.getWorldDirection(State.TempDirection);
  State.TempDirection.y = 0;
  if (State.TempDirection.lengthSq() > 0.000001) {
    State.TempDirection.normalize();
    State.Pivot.rotation.y = Math.atan2(State.TempDirection.x, State.TempDirection.z);
  }

  State.Pivot.position.set(State.Camera.position.x, 0, State.Camera.position.z);
  State.Pivot.updateMatrixWorld(true);

  if (!State.Head?.isBone) return;
  State.TempEye.copy(EYE_OFFSET);
  State.Head.localToWorld(State.TempEye);
  State.TempCorrection.copy(State.Camera.position).sub(State.TempEye);
  State.Pivot.position.add(State.TempCorrection);
  State.Pivot.updateMatrixWorld(true);
}

function Attach(Context) {
  State.Scene = Context.Scene;
  State.Camera = Context.Camera;
  BasePlayer.Attach(Context);
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene;
  State.Camera = Camera;
  RefreshRig();

  if (!BasePlayer.IsThirdPerson?.()) {
    AlignFirstPersonRig();
    BasePlayer.Render(Renderer, Scene, Camera);
    return;
  }

  if (State.Pivot) State.Pivot.position.y = 0;
  State.SavedLogicalPosition.copy(Camera.position);
  State.TempTarget.set(State.SavedLogicalPosition.x, THIRD_PERSON_TARGET_HEIGHT, State.SavedLogicalPosition.z);

  const OriginalRender = Renderer.render;
  let Checked = false;
  Renderer.render = function(RenderScene, RenderCamera) {
    if (!Checked && RenderCamera === Camera) {
      Checked = true;
      if (RenderCamera.position.y < MIN_RENDER_CAMERA_Y) {
        RenderCamera.position.y = MIN_RENDER_CAMERA_Y;
        RenderCamera.lookAt(State.TempTarget);
        RenderCamera.updateMatrixWorld(true);
      }
    }
    return OriginalRender.call(Renderer, RenderScene, RenderCamera);
  };

  try {
    BasePlayer.Render(Renderer, Scene, Camera);
  } finally {
    Renderer.render = OriginalRender;
  }
}

function GetPlayerRadius() {
  return PLAYER_CAPSULE_RADIUS;
}

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render,
  GetPlayerRadius
};

window.__STORE_CAMERA_FIX_BUILD__ = "V0.11-R9";
