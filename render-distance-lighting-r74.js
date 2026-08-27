import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Camera || !Game?.Scene || !Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.Renderer) throw new Error("Game must load before render distance lighting.");

const ProcessedObjects = new WeakSet();
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
  Object.renderOrder = 1;
  Object.geometry?.computeBoundingSphere?.();

  if (Object.material) {
    Object.material = Object.material.clone();
    const Broken = Brightness(Object.material.color) < 0.95;
    Object.material.color?.setHex(Broken ? BrokenGlow : WarmGlow);
    Object.material.toneMapped = false;
    Object.material.depthWrite = false;
    Object.material.depthTest = true;
    Object.material.transparent = false;
    Object.material.opacity = 1;
    Object.material.polygonOffset = true;
    Object.material.polygonOffsetFactor = -1;
    Object.material.polygonOffsetUnits = -1;
    Object.material.needsUpdate = true;
  }
}

function StabilizeHousing(Object) {
  if (!Object?.isMesh || ProcessedObjects.has(Object)) return;
  ProcessedObjects.add(Object);
  Object.geometry?.computeBoundingSphere?.();
  if (!Object.material) return;
  Object.material = Object.material.clone();
  Object.material.color?.setHex(HousingColor);
  if ("roughness" in Object.material) Object.material.roughness = 0.62;
  if ("metalness" in Object.material) Object.material.metalness = Math.min(0.48, Object.material.metalness ?? 0.35);
  Object.material.needsUpdate = true;
}

function StabilizePointLight(Object) {
  if (!Object?.isPointLight || ProcessedObjects.has(Object)) return;
  if (!Number.isFinite(Object.userData?.BaseIntensity)) return;
  ProcessedObjects.add(Object);
  Object.distance = Math.max(Object.distance || 0, 20);
  Object.decay = 2;
  Object.intensity = Math.max(Object.intensity || 0, Object.userData.BaseIntensity || 1.75);
}

function StabilizeHorizon(Object) {
  if (!Object?.isInstancedMesh || ProcessedObjects.has(Object)) return;
  ProcessedObjects.add(Object);
  Object.frustumCulled = true;
  if (!Object.material) return;

  Object.material = Object.material.clone();
  if (/HorizonLightGlow/i.test(String(Object.name || ""))) {
    Object.material.color?.setHex(WarmGlow);
    Object.material.toneMapped = false;
    Object.material.depthWrite = false;
    Object.material.depthTest = true;
    Object.material.transparent = false;
    Object.material.opacity = 1;
    Object.material.polygonOffset = true;
    Object.material.polygonOffsetFactor = -1;
    Object.material.polygonOffsetUnits = -1;
  } else if (/HorizonLightHousing/i.test(String(Object.name || ""))) {
    Object.material.color?.setHex(HousingColor);
  }
  Object.material.needsUpdate = true;
}

function ProcessRoot(Root) {
  Root?.traverse?.(Object => {
    if (Object.name === "LightGlow") StabilizeGlow(Object);
    else if (Object.name === "LightHousing") StabilizeHousing(Object);
    else if (Object.isPointLight) StabilizePointLight(Object);
    else if (Object.isInstancedMesh && Object.parent?.userData?.StoreHorizon) StabilizeHorizon(Object);
  });
}

function ConfigureProjection() {
  if (ProjectionConfigured) return;
  ProjectionConfigured = true;
  Game.Camera.far = 140;
  Game.Camera.updateProjectionMatrix();
  Game.Renderer.setPixelRatio(Math.min(devicePixelRatio, 1.15));
}

function ConfigureAtmosphere() {
  if (Game.Scene.background?.isColor) Game.Scene.background.setHex(0x24261f);
  if (Game.Scene.fog?.isFogExp2) {
    Game.Scene.fog.color.setHex(0x24261f);
    Game.Scene.fog.density = 0.0062;
  }
}

function ProcessAll() {
  ConfigureProjection();
  ConfigureAtmosphere();
  // Active chunks are already descendants of Scene. Prepared chunks are intentionally
  // kept out of Scene, so do not traverse or style invisible buffered geometry here.
  ProcessRoot(Game.Scene);
}

ProcessAll();
const Interval = setInterval(ProcessAll, 1200);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_RENDER_DISTANCE_LIGHTING__ = { ProcessAll };
window.__STORE_RENDER_DISTANCE_LIGHTING_BUILD__ = "V0.27.6";
