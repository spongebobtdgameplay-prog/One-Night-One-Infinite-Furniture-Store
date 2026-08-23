import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;

if (!BasePlayer) throw new Error("Player system must load before stable eye camera.");

const EYE_OFFSET = new THREE.Vector3(0, 0.035, 0.065);

const State = {
  Scene: null,
  Pivot: null,
  Head: null,
  EyeAnchorLocal: new THREE.Vector3(),
  TempEye: new THREE.Vector3(),
  SavedCameraPosition: new THREE.Vector3(),
  AnchorReady: false
};

function RefreshRig() {
  if (!State.Scene) return false;

  const Pivot = State.Scene.getObjectByName("PlayerCharacterPivot") || null;
  if (!Pivot) {
    State.Pivot = null;
    State.Head = null;
    State.AnchorReady = false;
    return false;
  }

  if (Pivot !== State.Pivot) {
    State.Pivot = Pivot;
    State.Head = null;
    State.AnchorReady = false;
  }

  if (!State.Head || !State.Head.parent) State.Head = Pivot.getObjectByName("Head") || null;
  if (!State.Head?.isBone) return false;

  if (!State.AnchorReady) {
    State.Pivot.updateMatrixWorld(true);
    State.TempEye.copy(EYE_OFFSET);
    State.Head.localToWorld(State.TempEye);
    State.EyeAnchorLocal.copy(State.TempEye);
    State.Pivot.worldToLocal(State.EyeAnchorLocal);
    State.AnchorReady = true;
  }

  return true;
}

function Attach(Context) {
  State.Scene = Context.Scene;
  BasePlayer.Attach(Context);
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene;
  RefreshRig();

  const OriginalRender = Renderer.render;
  Renderer.render = function(RenderScene, RenderCamera) {
    if (
      RenderScene === Scene &&
      RenderCamera === Camera &&
      !BasePlayer.IsThirdPerson?.() &&
      RefreshRig() &&
      State.AnchorReady
    ) {
      State.SavedCameraPosition.copy(RenderCamera.position);
      State.TempEye.copy(State.EyeAnchorLocal);
      State.Pivot.localToWorld(State.TempEye);
      RenderCamera.position.copy(State.TempEye);
      RenderCamera.updateMatrixWorld(true);

      try {
        return OriginalRender.call(Renderer, RenderScene, RenderCamera);
      } finally {
        RenderCamera.position.copy(State.SavedCameraPosition);
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

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render
};

window.__STORE_STABLE_EYE_CAMERA_BUILD__ = "V0.11-R18";
