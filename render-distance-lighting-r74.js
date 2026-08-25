import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Camera || !Game?.Scene || !Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.Renderer) throw new Error("Game must load before render distance lighting.");

const ProcessedObjects = new WeakSet();
const ProcessedRoots = new WeakSet();
const WarmGlow = 0xffe2ad;
const BrokenGlow = 0xa49372;
const HousingColor = 0x7f8986;
let ProjectionConfigured = false;

function Brightness(Color) {
  if (!Color?.isColor) return 1;
  return Color.r + Color.g + Color.b;
}

function StabilizeGlow(Object) {
  if (!Object?.isMesh || ProcessedObjects.has(Object)) return;
  ProcessedObjects.add(Object);
  Object.frustumCulled = true;
  Object.geometry?.computeBoundingSphere?.();
  Object.userData.LightGlowR94 = true;
  Object.userData.DistanceCullR94 = 68;
  Object.scale.x *= 1.045;
  Object.scale.y *= 1.07;

  if (Object.material) {
    Object.material = Object.material.clone();
    const Broken = Brightness(Object.material.color) < 0.95;
    Object.material.color?.setHex(Broken ? BrokenGlow : WarmGlow);
    Object.material.toneMapped = false;
    Object.material.depthWrite = false;
    Object.material.depthTest = true;
    Object.material.transparent = false;
    Object.material.opacity = 1;
    Object.material.needsUpdate = true;
  }
}

function StabilizeHousing(Object) {
  if (!Object?.isMesh || ProcessedObjects.has(Object)) return;
  ProcessedObjects.add(Object);
  Object.frustumCulled = true;
  Object.geometry?.computeBoundingSphere?.();
  Object.userData.LightHousingR94 = true;
  Object.userData.DistanceCullR94 = 105;
  Object.scale.y *= 1.045;
  if (!Object.material) return;
  Object.material = Object.material.clone();
  Object.material.color?.setHex(HousingColor);
  if ("roughness" in Object.material) Object.material.roughness = 0.62;
  if ("metalness" in Object.material) Object.material.metalness = Math.min(0.48, Object.material.metalness ?? 0.35);
  Object.material.needsUpdate = true;
}

function StabilizePointLight(Object) {
  if (!Object?.isPointLight || ProcessedObjects.has(Object)) return;
  ProcessedObjects.add(Object);
  const Base = Number.isFinite(Object.userData?.BaseIntensity) ? Object.userData.BaseIntensity : Object.intensity || 1.5;
  Object.userData.BaseIntensity = Base;
  Object.userData.RuntimeBaseIntensityR94 = Base;
  Object.userData.PointLightR94 = true;
  Object.distance = THREE.MathUtils.clamp(Object.distance || 13, 9, 13.5);
  Object.decay = 2;
  Object.intensity = Base;
}

function StabilizeHorizon(Object) {
  if (!Object?.isInstancedMesh || ProcessedObjects.has(Object)) return;
  ProcessedObjects.add(Object);
  Object.frustumCulled = true;
  Object.geometry?.computeBoundingSphere?.();
  Object.userData.DistanceCullR94 = 125;
  if (!Object.material) return;
  Object.material = Object.material.clone();
  if (/HorizonLightGlow/i.test(String(Object.name || ""))) {
    Object.material.color?.setHex(WarmGlow);
    Object.material.toneMapped = false;
    Object.material.depthWrite = false;
  } else if (/HorizonLightHousing/i.test(String(Object.name || ""))) {
    Object.material.color?.setHex(HousingColor);
  }
  Object.material.needsUpdate = true;
}

function ProcessRoot(Root) {
  if (!Root?.traverse || ProcessedRoots.has(Root)) return;
  ProcessedRoots.add(Root);
  Root.traverse(Object => {
    if (Object.name === "LightGlow") StabilizeGlow(Object);
    else if (Object.name === "LightHousing") StabilizeHousing(Object);
    else if (Object.isPointLight) StabilizePointLight(Object);
    else if (Object.isInstancedMesh && Object.parent?.userData?.StoreHorizon) StabilizeHorizon(Object);
  });
}

function ConfigureProjection() {
  if (ProjectionConfigured) return;
  ProjectionConfigured = true;
  Game.Camera.far = Math.min(Game.Camera.far || 280, 280);
  Game.Camera.updateProjectionMatrix();
  Game.Renderer.setPixelRatio(Math.min(devicePixelRatio, 1.0));
}

function ConfigureAtmosphere() {
  if (Game.Scene.background?.isColor) Game.Scene.background.setHex(0x24261f);
  if (Game.Scene.fog?.isFogExp2) {
    Game.Scene.fog.color.setHex(0x24261f);
    Game.Scene.fog.density = Math.max(Game.Scene.fog.density || 0, 0.0032);
  }
}

function DiscoverNewRoots() {
  ConfigureProjection();
  ConfigureAtmosphere();
  ProcessRoot(Game.Scene);
  for (const Chunk of Game.ActiveChunks.values()) ProcessRoot(Chunk?.Group);
  for (const Chunk of Game.PreparedChunks.values()) ProcessRoot(Chunk?.Group);
}

DiscoverNewRoots();
const Interval = setInterval(DiscoverNewRoots, 1800);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_RENDER_DISTANCE_LIGHTING__ = { ProcessAll: DiscoverNewRoots, DiscoverNewRoots };
window.__STORE_RENDER_DISTANCE_LIGHTING_BUILD__ = "V0.30.0-R94";