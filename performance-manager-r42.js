import * as THREE from "three";

const State = {
  LastWidth: 0,
  LastHeight: 0,
  LastRatio: 0,
  LastQuality: "",
  TextureStamp: ""
};

function Game() {
  return window.__STORE_GAME__ || null;
}

function Settings() {
  return window.__STORE_USER_SETTINGS__ || { Graphics: "balanced", Fov: 70 };
}

function QualityProfile() {
  const Quality = Settings().Graphics;
  if (Quality === "performance") return { PixelRatio: 0.92, PointLights: 4, Anisotropy: 1 };
  if (Quality === "high") return { PixelRatio: 1.15, PointLights: 8, Anisotropy: 4 };
  return { PixelRatio: 1.0, PointLights: 6, Anisotropy: 2 };
}

function ApplyCamera() {
  const CurrentGame = Game();
  if (!CurrentGame?.Camera) return;
  const Fov = THREE.MathUtils.clamp(Number(Settings().Fov) || 70, 58, 100);
  if (Math.abs(CurrentGame.Camera.fov - Fov) > 0.001) {
    CurrentGame.Camera.fov = Fov;
    CurrentGame.Camera.updateProjectionMatrix();
  }
}

function ApplyRenderer() {
  const CurrentGame = Game();
  if (!CurrentGame?.Renderer) return;
  const Profile = QualityProfile();
  const Ratio = Math.min(devicePixelRatio || 1, Profile.PixelRatio);
  const Quality = Settings().Graphics;
  if (State.LastWidth === innerWidth && State.LastHeight === innerHeight && Math.abs(State.LastRatio - Ratio) < 0.001 && State.LastQuality === Quality) return;
  State.LastWidth = innerWidth;
  State.LastHeight = innerHeight;
  State.LastRatio = Ratio;
  State.LastQuality = Quality;
  CurrentGame.Renderer.setPixelRatio(Ratio);
  CurrentGame.Renderer.setSize(innerWidth, innerHeight, false);
  CurrentGame.Renderer.setScissorTest(false);
  CurrentGame.Renderer.setViewport(0, 0, innerWidth, innerHeight);
}

function ApplyTextureBudget() {
  const CurrentGame = Game();
  if (!CurrentGame?.Scene || !CurrentGame?.Renderer) return;
  const Profile = QualityProfile();
  const Stamp = `${Settings().Graphics}:${CurrentGame.Scene.children.length}`;
  if (Stamp === State.TextureStamp) return;
  State.TextureStamp = Stamp;
  const Max = Math.min(Profile.Anisotropy, CurrentGame.Renderer.capabilities.getMaxAnisotropy());
  CurrentGame.Scene.traverse(Object => {
    if (!Object.isMesh) return;
    const Materials = Array.isArray(Object.material) ? Object.material : [Object.material];
    for (const Material of Materials) {
      if (!Material) continue;
      for (const Key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"]) {
        const Texture = Material[Key];
        if (!Texture?.isTexture || Texture.anisotropy === Max) continue;
        Texture.anisotropy = Max;
        Texture.needsUpdate = true;
      }
    }
  });
}

function CullPointLights() {
  const CurrentGame = Game();
  if (!CurrentGame?.Scene || !CurrentGame?.Camera) return;
  const Profile = QualityProfile();
  const Lights = [];
  CurrentGame.Scene.traverse(Object => {
    if (!Object.isPointLight) return;
    const World = Object.userData.R42LightWorld ||= new THREE.Vector3();
    Object.getWorldPosition(World);
    Lights.push({ Object, Distance: World.distanceToSquared(CurrentGame.Camera.position) });
  });
  Lights.sort((A, B) => A.Distance - B.Distance);
  for (let Index = 0; Index < Lights.length; Index += 1) Lights[Index].Object.visible = Index < Profile.PointLights;
}

function ApplyAll() {
  ApplyCamera();
  ApplyRenderer();
  ApplyTextureBudget();
  CullPointLights();
}

addEventListener("resize", ApplyAll);
addEventListener("store-settings-change", () => {
  State.TextureStamp = "";
  State.LastQuality = "";
  ApplyAll();
});
setInterval(ApplyAll, 400);
setTimeout(ApplyAll, 0);
window.__STORE_PERFORMANCE_BUILD__ = "V0.11-R42";
