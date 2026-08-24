import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Camera || !Game?.Scene || !Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.Renderer) throw new Error("Game must load before render distance lighting.");

const ProcessedObjects = new WeakSet();
const WarmGlow = 0xffe6b8;
const BrokenGlow = 0x9f8d6c;
const HousingColor = 0x777b76;
let ProjectionConfigured = false;

function Brightness(Color) {
  if (!Color?.isColor) return 1;
  return Color.r + Color.g + Color.b;
}

function StabilizeGlow(Object) {
  if (!Object?.isMesh || ProcessedObjects.has(Object)) return;
  ProcessedObjects.add(Object);
  Object.frustumCulled = false;
  Object.renderOrder = 0;
  Object.geometry?.computeBoundingSphere?.();

  if (Object.material) {
    Object.material = Object.material.clone();
    const Broken = Brightness(Object.material.color) < 0.95;
    Object.material.color?.setHex(Broken ? BrokenGlow : WarmGlow);
    Object.material.toneMapped = true;
    Object.material.depthWrite = true;
    Object.material.depthTest = true;
    Object.material.transparent = false;
    Object.material.opacity = 1;
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
  if ("roughness" in Object.material) Object.material.roughness = 0.64;
  Object.material.needsUpdate = true;
}

function StabilizePointLight(Object) {
  if (!Object?.isPointLight || ProcessedObjects.has(Object)) return;
  if (!Number.isFinite(Object.userData?.BaseIntensity)) return;
  ProcessedObjects.add(Object);
  Object.distance = Math.max(Object.distance || 0, 18);
  Object.decay = 2;
  Object.intensity = Math.max(Object.intensity || 0, Object.userData.BaseIntensity || 1.75);
}

function StabilizeHorizon(Object) {
  if (!Object?.isInstancedMesh || ProcessedObjects.has(Object)) return;
  ProcessedObjects.add(Object);
  Object.frustumCulled = false;
  if (!/HorizonLightGlow/i.test(String(Object.name || "")) || !Object.material) return;
  Object.material = Object.material.clone();
  Object.material.color?.setHex(WarmGlow);
  Object.material.toneMapped = true;
  Object.material.depthWrite = true;
  Object.material.depthTest = true;
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
  Game.Camera.far = 520;
  Game.Camera.updateProjectionMatrix();
  Game.Renderer.setPixelRatio(Math.min(devicePixelRatio, 1.22));
}

function ConfigureAtmosphere() {
  if (Game.Scene.background?.isColor) Game.Scene.background.setHex(0x24261f);
  if (Game.Scene.fog?.isFogExp2) {
    Game.Scene.fog.color.setHex(0x24261f);
    Game.Scene.fog.density = 0.0027;
  }
}

function ProcessAll() {
  ConfigureProjection();
  ConfigureAtmosphere();
  ProcessRoot(Game.Scene);
  for (const Chunk of Game.ActiveChunks.values()) ProcessRoot(Chunk.Group);
  for (const Chunk of Game.PreparedChunks.values()) ProcessRoot(Chunk.Group);
}

ProcessAll();
const Interval = setInterval(ProcessAll, 700);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_RENDER_DISTANCE_LIGHTING__ = { ProcessAll };
window.__STORE_RENDER_DISTANCE_LIGHTING_BUILD__ = "V0.17.0-R75";