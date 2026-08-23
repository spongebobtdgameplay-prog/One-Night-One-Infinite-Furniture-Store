import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;

if (!BasePlayer) throw new Error("Player controller must load before view transition.");

const TRANSITION_DURATION = 0.30;
const MIN_VISIBLE_OPACITY = 0.015;

const State = {
  Scene: null,
  Camera: null,
  Pivot: null,
  BodyMeshes: [],
  ArmMeshes: [],
  MeshCount: -1,
  LastModeThirdPerson: null,
  TransitionActive: false,
  TransitionStartedAt: 0,
  FromPosition: new THREE.Vector3(),
  FromQuaternion: new THREE.Quaternion(),
  LastRenderedPosition: new THREE.Vector3(),
  LastRenderedQuaternion: new THREE.Quaternion(),
  HasRenderedCamera: false,
  BodyOpacity: 0,
  ArmOpacity: 1,
  FromBodyOpacity: 0,
  FromArmOpacity: 1,
  TempQuaternion: new THREE.Quaternion()
};

function Ease(Value) {
  const Clamped = THREE.MathUtils.clamp(Value, 0, 1);
  return Clamped * Clamped * (3 - 2 * Clamped);
}

function PrepareMeshMaterials(Mesh) {
  if (Mesh.userData.ViewTransitionMaterialsReady) return;
  const Source = Array.isArray(Mesh.material) ? Mesh.material : [Mesh.material];
  const Clones = Source.map(Material => {
    const Clone = Material.clone();
    Clone.opacity = 1;
    Clone.transparent = false;
    Clone.depthWrite = true;
    Clone.needsUpdate = true;
    return Clone;
  });
  Mesh.material = Array.isArray(Mesh.material) ? Clones : Clones[0];
  Mesh.userData.ViewTransitionMaterialsReady = true;
}

function SetMeshOpacity(Mesh, Opacity) {
  const Value = THREE.MathUtils.clamp(Opacity, 0, 1);
  Mesh.visible = Value > MIN_VISIBLE_OPACITY;
  if (!Mesh.visible) return;
  PrepareMeshMaterials(Mesh);
  const Materials = Array.isArray(Mesh.material) ? Mesh.material : [Mesh.material];
  for (const Material of Materials) {
    if (!Material) continue;
    const WantsTransparent = Value < 0.995;
    const WantsDepthWrite = Value > 0.94;
    if (Material.transparent !== WantsTransparent || Material.depthWrite !== WantsDepthWrite) {
      Material.transparent = WantsTransparent;
      Material.depthWrite = WantsDepthWrite;
      Material.needsUpdate = true;
    }
    Material.opacity = Value;
  }
}

function RefreshRig() {
  if (!State.Scene) return;
  const Pivot = State.Scene.getObjectByName("PlayerCharacterPivot") || null;
  if (!Pivot) {
    State.Pivot = null;
    State.BodyMeshes.length = 0;
    State.ArmMeshes.length = 0;
    State.MeshCount = -1;
    return;
  }

  let Count = 0;
  Pivot.traverse(Object => {
    if (Object.isMesh) Count += 1;
  });

  if (Pivot === State.Pivot && Count === State.MeshCount) return;
  State.Pivot = Pivot;
  State.MeshCount = Count;
  State.BodyMeshes.length = 0;
  State.ArmMeshes.length = 0;

  Pivot.traverse(Object => {
    if (!Object.isMesh) return;
    if ((Object.name || "").endsWith("_FirstPersonArms")) State.ArmMeshes.push(Object);
    else State.BodyMeshes.push(Object);
  });
}

function ApplyViewOpacity() {
  RefreshRig();
  for (const Mesh of State.BodyMeshes) SetMeshOpacity(Mesh, State.BodyOpacity);
  for (const Mesh of State.ArmMeshes) SetMeshOpacity(Mesh, State.ArmOpacity);
}

function BeginTransition(ThirdPerson, Now) {
  State.TransitionActive = true;
  State.TransitionStartedAt = Now;
  State.FromBodyOpacity = State.BodyOpacity;
  State.FromArmOpacity = State.ArmOpacity;

  if (State.HasRenderedCamera) {
    State.FromPosition.copy(State.LastRenderedPosition);
    State.FromQuaternion.copy(State.LastRenderedQuaternion);
  } else if (State.Camera) {
    State.FromPosition.copy(State.Camera.position);
    State.FromQuaternion.copy(State.Camera.quaternion);
  }

  State.LastModeThirdPerson = ThirdPerson;
}

function UpdateTransition(ThirdPerson, Now) {
  if (State.LastModeThirdPerson === null) {
    State.LastModeThirdPerson = ThirdPerson;
    State.BodyOpacity = ThirdPerson ? 1 : 0;
    State.ArmOpacity = ThirdPerson ? 0 : 1;
    return 1;
  }

  if (ThirdPerson !== State.LastModeThirdPerson) BeginTransition(ThirdPerson, Now);
  if (!State.TransitionActive) {
    State.BodyOpacity = ThirdPerson ? 1 : 0;
    State.ArmOpacity = ThirdPerson ? 0 : 1;
    return 1;
  }

  const Raw = (Now - State.TransitionStartedAt) / (TRANSITION_DURATION * 1000);
  const Blend = Ease(Raw);
  const TargetBody = ThirdPerson ? 1 : 0;
  const TargetArms = ThirdPerson ? 0 : 1;
  State.BodyOpacity = THREE.MathUtils.lerp(State.FromBodyOpacity, TargetBody, Blend);
  State.ArmOpacity = THREE.MathUtils.lerp(State.FromArmOpacity, TargetArms, Blend);

  if (Raw >= 1) {
    State.TransitionActive = false;
    State.BodyOpacity = TargetBody;
    State.ArmOpacity = TargetArms;
    return 1;
  }

  return Blend;
}

function Attach(Context) {
  State.Scene = Context.Scene;
  State.Camera = Context.Camera;
  BasePlayer.Attach(Context);
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene;
  State.Camera = Camera;
  const Now = performance.now();
  const ThirdPerson = Boolean(BasePlayer.IsThirdPerson?.());
  const Blend = UpdateTransition(ThirdPerson, Now);
  const OriginalRender = Renderer.render;

  Renderer.render = function(RenderScene, RenderCamera) {
    if (RenderCamera !== Camera) return OriginalRender.call(Renderer, RenderScene, RenderCamera);

    const DesiredPosition = RenderCamera.position.clone();
    const DesiredQuaternion = RenderCamera.quaternion.clone();

    if (State.TransitionActive) {
      RenderCamera.position.lerpVectors(State.FromPosition, DesiredPosition, Blend);
      State.TempQuaternion.copy(State.FromQuaternion).slerp(DesiredQuaternion, Blend);
      RenderCamera.quaternion.copy(State.TempQuaternion);
      RenderCamera.updateMatrixWorld(true);
    }

    ApplyViewOpacity();
    State.LastRenderedPosition.copy(RenderCamera.position);
    State.LastRenderedQuaternion.copy(RenderCamera.quaternion);
    State.HasRenderedCamera = true;

    const Result = OriginalRender.call(Renderer, RenderScene, RenderCamera);
    RenderCamera.position.copy(DesiredPosition);
    RenderCamera.quaternion.copy(DesiredQuaternion);
    RenderCamera.updateMatrixWorld(true);
    return Result;
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

window.__STORE_VIEW_TRANSITION_BUILD__ = "V0.11-R4";
