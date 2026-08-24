import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Camera || !Game?.Scene || !Game?.ActiveChunks || !Game?.PreparedChunks) throw new Error("Game must load before render distance lighting.");

const ProcessedObjects = new WeakSet();
const WarmGlow = 0xffe2ad;
const BrokenGlow = 0x9f865f;
const HousingColor = 0x727775;

function Brightness(Color) {
  if (!Color?.isColor) return 1;
  return Color.r + Color.g + Color.b;
}

function StabilizeGlow(Object) {
  if (!Object?.isMesh || ProcessedObjects.has(Object)) return;
  ProcessedObjects.add(Object);
  Object.frustumCulled = false;
  Object.renderOrder = Math.max(Object.renderOrder || 0, 2);
  if (Object.scale) Object.scale.z = Math.max(Object.scale.z, 1.18);

  if (Object.material) {
    Object.material = Object.material.clone();
    const Broken = Brightness(Object.material.color) < 0.95;
    Object.material.color?.setHex(Broken ? BrokenGlow : WarmGlow);
    Object.material.toneMapped = false;
    Object.material.depthWrite = true;
    Object.material.depthTest = true;
    Object.material.needsUpdate = true;
  }
}

function StabilizeHousing(Object) {
  if (!Object?.isMesh || ProcessedObjects.has(Object)) return;
  ProcessedObjects.add(Object);
  Object.frustumCulled = false;
  if (!Object.material) return;
  Object.material = Object.material.clone();
  Object.material.color?.setHex(HousingColor);
  if ("roughness" in Object.material) Object.material.roughness = Math.min(Object.material.roughness ?? 0.7, 0.62);
  Object.material.needsUpdate = true;
}

function StabilizePointLight(Object) {
  if (!Object?.isPointLight || ProcessedObjects.has(Object)) return;
  if (!Number.isFinite(Object.userData?.BaseIntensity)) return;
  ProcessedObjects.add(Object);
  Object.distance = Math.max(Object.distance || 0, 22);
  Object.decay = Math.min(Object.decay || 2, 1.75);
  Object.intensity = Math.max(Object.intensity || 0, Object.userData.BaseIntensity || 1.75);
}

function ProcessRoot(Root) {
  Root?.traverse?.(Object => {
    if (Object.name === "LightGlow") StabilizeGlow(Object);
    else if (Object.name === "LightHousing") StabilizeHousing(Object);
    else if (Object.isPointLight) StabilizePointLight(Object);
    else if (Object.isInstancedMesh && Object.parent?.userData?.StoreHorizon) {
      Object.frustumCulled = false;
      if (Object.material?.isMeshBasicMaterial) {
        if (!ProcessedObjects.has(Object)) {
          ProcessedObjects.add(Object);
          Object.material = Object.material.clone();
          Object.material.color?.setHex(WarmGlow);
          Object.material.toneMapped = false;
          Object.material.needsUpdate = true;
        }
      }
    }
  });
}

function ProcessAll() {
  Game.Camera.far = Math.max(Game.Camera.far, 420);
  Game.Camera.updateProjectionMatrix();

  if (Game.Scene.fog?.isFogExp2) {
    Game.Scene.fog.density = Math.min(Game.Scene.fog.density, 0.0048);
    Game.Scene.fog.color.setHex(0x191b18);
  }

  ProcessRoot(Game.Scene);
  for (const Chunk of Game.ActiveChunks.values()) ProcessRoot(Chunk.Group);
  for (const Chunk of Game.PreparedChunks.values()) ProcessRoot(Chunk.Group);
}

ProcessAll();
const Interval = setInterval(ProcessAll, 650);
addEventListener("pagehide", () => clearInterval(Interval), { once: true });

window.__STORE_RENDER_DISTANCE_LIGHTING__ = { ProcessAll };
window.__STORE_RENDER_DISTANCE_LIGHTING_BUILD__ = "V0.16.0-R74";