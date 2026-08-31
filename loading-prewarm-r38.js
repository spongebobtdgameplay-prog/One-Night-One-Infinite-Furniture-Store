import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const OriginalLoadAsync = GLTFLoader.prototype.loadAsync;
const AssetTimeoutMs = 9000;

const KayKitBase = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/";
const KayKitRestaurantBase = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0/main/addons/kaykit_restaurant_bits/Assets/gltf/";
const KhronosSampleBase = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/";
const KenneyBase = "https://raw.githubusercontent.com/dennisorlando/junction-2025/f78a38d01f3a47697ff144bfed0301df7f25c784/models/mini-market/GLB%20format/";
const IndustrialShelfUrl = "https://raw.githubusercontent.com/danielrosehill/storage-box-3d-models/main/models/SB1/SB1.glb";

const AssetUrls = [
  "https://raw.githubusercontent.com/euuuuuuan/fatal-funnel-public/main/packages/renderer/assets/models/quaternius-men/worker.glb",
  `${KhronosSampleBase}GlamVelvetSofa/glTF-Binary/GlamVelvetSofa.glb`,
  `${KhronosSampleBase}ChairDamaskPurplegold/glTF-Binary/ChairDamaskPurplegold.glb`,
  `${KayKitBase}table_medium.gltf`,
  "Models/Bedroom/GLB/Bed_King.glb",
  "Models/Bedroom/GLB/Bed_Single.glb",
  "Models/Bedroom/GLB/NightStand_2.glb",
  "Models/Kitchen/GLB/Kitchen_Cabinet1.glb",
  "Models/Kitchen/GLB/Kitchen_Fridge.glb",
  `${KayKitRestaurantBase}stove_multi_decorated.gltf`,
  `${KayKitRestaurantBase}kitchencounter_sink.gltf`,
  `${KayKitRestaurantBase}kitchentable_sink.gltf`,
  "Models/Bathroom/GLB/Bathroom_Bathtub.glb",
  "Models/Bathroom/GLB/Bathroom_Toilet.glb",
  "Models/Lighting/GLB/Light_Floor1.glb",
  "Models/Architecture/GLB/Door_3.glb",
  "Models/Architecture/GLB/Window_Large1.glb",
  IndustrialShelfUrl,
  `${KayKitBase}cabinet_medium.gltf`,
  `${KayKitBase}armchair_pillows.gltf`,
  `${KayKitBase}table_low.gltf`,
  `${KayKitBase}table_small.gltf`,
  `${KayKitBase}table_medium_long.gltf`,
  `${KayKitBase}rug_rectangle_stripes_A.gltf`,
  `${KayKitBase}rug_oval_A.gltf`,
  `${KayKitBase}book_set.gltf`,
  `${KayKitBase}book_single.gltf`,
  `${KayKitBase}pillow_A.gltf`,
  `${KayKitBase}pillow_B.gltf`,
  `${KayKitBase}lamp_standing.gltf`,
  `${KayKitBase}cabinet_small_decorated.gltf`,
  `${KenneyBase}shopping-cart.glb`,
  `${KenneyBase}shopping-basket.glb`,
  `${KenneyBase}shelf-bags.glb`,
  `${KenneyBase}shelf-boxes.glb`
];

const TrackedAssets = new Set(AssetUrls);
const AssetPromises = new Map();
const AssetStates = new Map();
let NextAssetIndex = 0;

function Mix32(Value) {
  let NumberValue = Value >>> 0;
  NumberValue ^= NumberValue >>> 16;
  NumberValue = Math.imul(NumberValue, 0x7feb352d);
  NumberValue ^= NumberValue >>> 15;
  NumberValue = Math.imul(NumberValue, 0x846ca68b);
  NumberValue ^= NumberValue >>> 16;
  return NumberValue >>> 0;
}

function HashText(Text) {
  let Hash = 2166136261 >>> 0;
  for (let Index = 0; Index < Text.length; Index += 1) {
    Hash ^= Text.charCodeAt(Index);
    Hash = Math.imul(Hash, 16777619);
  }
  return Mix32(Hash);
}

function ResolveWorldSeed() {
  const Parameters = new URLSearchParams(location.search);
  const RequestedSeed = Parameters.get("seed");

  if (RequestedSeed !== null && RequestedSeed.trim() !== "") {
    const Trimmed = RequestedSeed.trim();
    const Numeric = Number(Trimmed);
    const Seed = Number.isSafeInteger(Numeric) ? Mix32(Numeric) : HashText(Trimmed);
    return { Seed: Seed || 1, Source: "URL" };
  }

  const Preset = Number(window.__STORE_WORLD_SEED__);
  if (Number.isSafeInteger(Preset) && Preset > 0) {
    return {
      Seed: Preset >>> 0,
      Source: String(window.__STORE_WORLD_SEED_SOURCE__ || "PRESET")
    };
  }

  const Values = new Uint32Array(1);
  crypto.getRandomValues(Values);
  return { Seed: (Values[0] >>> 0) || 1, Source: "SOLO_RANDOM" };
}

const World = ResolveWorldSeed();
window.__STORE_WORLD_SEED__ = World.Seed;
window.__STORE_WORLD_SEED_SOURCE__ = World.Source;
window.__STORE_WORLD_SEED_BUILD__ = "V0.35.35-SEED";

function DispatchProgress() {
  let Loaded = 0;
  let Failed = 0;
  for (const State of AssetStates.values()) {
    if (State === "loaded") Loaded += 1;
    else if (State === "failed") Failed += 1;
  }

  const Detail = {
    loaded: Loaded,
    failed: Failed,
    settled: Loaded + Failed,
    total: AssetUrls.length,
    background: true
  };

  window.__STORE_PRELOAD_PROGRESS__ = Detail;
  window.dispatchEvent(new CustomEvent("store-preload-progress", { detail: Detail }));
}

function LoadWithTimeout(Url, Loader, Args) {
  const SourcePromise = OriginalLoadAsync.call(Loader, Url, ...Args);
  let TimeoutId = 0;

  const TimeoutPromise = new Promise((_, Reject) => {
    TimeoutId = setTimeout(() => {
      Reject(new Error(`Asset load timed out after ${AssetTimeoutMs}ms: ${Url}`));
    }, AssetTimeoutMs);
  });

  return Promise.race([SourcePromise, TimeoutPromise]).finally(() => {
    clearTimeout(TimeoutId);
  });
}

function GetOrStartAsset(Url, Loader, Args = []) {
  if (AssetPromises.has(Url)) return AssetPromises.get(Url);

  AssetStates.set(Url, "loading");
  DispatchProgress();

  const PromiseValue = LoadWithTimeout(Url, Loader, Args)
    .then(Result => {
      AssetStates.set(Url, "loaded");
      DispatchProgress();
      return Result;
    })
    .catch(Error => {
      AssetStates.set(Url, "failed");
      AssetPromises.delete(Url);
      DispatchProgress();
      console.warn(`Background warm-up skipped ${Url}`, Error);
      throw Error;
    });

  AssetPromises.set(Url, PromiseValue);
  return PromiseValue;
}

GLTFLoader.prototype.loadAsync = function(Url, ...Args) {
  if (!TrackedAssets.has(Url)) return OriginalLoadAsync.call(this, Url, ...Args);
  return GetOrStartAsset(Url, this, Args);
};

function BackgroundYield() {
  return new Promise(Resolve => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => Resolve(), { timeout: 350 });
    } else {
      setTimeout(Resolve, 40);
    }
  });
}

async function BackgroundWorker() {
  const Loader = new GLTFLoader();

  while (NextAssetIndex < AssetUrls.length) {
    await BackgroundYield();
    const AssetIndex = NextAssetIndex;
    NextAssetIndex += 1;

    try {
      await GetOrStartAsset(AssetUrls[AssetIndex], Loader);
    } catch {}
  }

  window.__STORE_PRELOAD_RESULT__ = "finished";
}

window.__STORE_PRELOAD_PROMISES__ = AssetPromises;
window.__STORE_PRELOAD_RESULT__ = "background";
window.__STORE_PRELOAD_BUILD__ = "V0.35.35-NONBLOCKING";
DispatchProgress();
BackgroundWorker().catch(() => {});
