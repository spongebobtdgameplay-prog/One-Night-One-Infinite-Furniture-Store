const BasePlayer = window.__STORE_PLAYER__;

if (!BasePlayer) throw new Error("Player controller must load before real first-person body.");

const State = {
  Scene: null,
  Pivot: null,
  BodyMeshes: [],
  RemovedLegacyArms: false
};

function IsLegacyArmObject(Object) {
  const Name = Object?.name || "";
  return Name.endsWith("_FirstPersonArms") || Name.endsWith("_CameraArms") || Name === "GuaranteedFirstPersonArms" || Name === "RealFirstPersonWorkerArms" || Name === "FirstPersonViewModelRoot";
}

function RefreshRig() {
  if (!State.Scene) return;
  const Pivot = State.Scene.getObjectByName("PlayerCharacterPivot") || null;
  if (!Pivot) {
    State.Pivot = null;
    State.BodyMeshes.length = 0;
    return;
  }

  if (Pivot !== State.Pivot) {
    State.Pivot = Pivot;
    State.BodyMeshes.length = 0;
    State.RemovedLegacyArms = false;
  }

  if (!State.RemovedLegacyArms) {
    const Remove = [];
    Pivot.traverse(Object => {
      if (IsLegacyArmObject(Object)) Remove.push(Object);
    });
    for (const Object of Remove) {
      if (Object.parent) Object.parent.remove(Object);
    }
    State.RemovedLegacyArms = true;
  }

  State.BodyMeshes.length = 0;
  Pivot.traverse(Object => {
    if (!Object.isMesh || IsLegacyArmObject(Object)) return;
    State.BodyMeshes.push(Object);
  });
}

function ForceRealBodyVisible() {
  RefreshRig();
  for (const Mesh of State.BodyMeshes) {
    if (!Mesh.parent) continue;
    Mesh.visible = true;
    Mesh.frustumCulled = false;
  }
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
    if (RenderScene === Scene && RenderCamera === Camera) ForceRealBodyVisible();
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

window.__STORE_REAL_FIRST_PERSON_BODY_BUILD__ = "V0.11-R14";
