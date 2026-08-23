const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player must load before camera UI guard.");

const State = {
  Scene: null,
  Crosshair: document.querySelector(".Crosshair"),
  CameraMode: document.getElementById("CameraModeValue")
};

function ThirdPerson() {
  return Boolean(BasePlayer.IsThirdPerson?.());
}

function UpdateUi() {
  const IsThird = ThirdPerson();
  if (State.Crosshair) State.Crosshair.style.display = IsThird ? "none" : "block";
  if (State.CameraMode) State.CameraMode.textContent = IsThird ? "THIRD" : "FIRST";
}

function Attach(Context) {
  State.Scene = Context.Scene;
  BasePlayer.Attach(Context);
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene;
  UpdateUi();

  const IsThird = ThirdPerson();
  const OriginalRender = Renderer.render;
  Renderer.render = function(RenderScene, RenderCamera) {
    if (IsThird && RenderScene !== State.Scene) return;
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

window.__STORE_CAMERA_UI_GUARD_BUILD__ = "V0.11-R12";
