import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const StartButton = document.getElementById("StartButton");
const BootStatus = document.getElementById("BootStatus");
const BuildVersion = document.getElementById("BuildVersion");
const BootCard = document.querySelector(".BootCard");
const OriginalLoadAsync = GLTFLoader.prototype.loadAsync;
const LoadWindowMs = 120000;
const StartedAt = performance.now();

const KayKitBase = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0/main/addons/kaykit_furniture_bits/Assets/gltf/";
const KenneyBase = "https://raw.githubusercontent.com/dennisorlando/junction-2025/f78a38d01f3a47697ff144bfed0301df7f25c784/models/mini-market/GLB%20format/";
const IndustrialShelfUrl = "https://raw.githubusercontent.com/danielrosehill/storage-box-3d-models/main/models/SB1/SB1.glb";
const ReplicaCabinetUrl = "https://huggingface.co/datasets/ai-habitat/ReplicaCAD_dataset/resolve/main/objects/frl_apartment_cabinet.glb";

const AssetUrls = [
  "https://raw.githubusercontent.com/euuuuuuan/fatal-funnel-public/main/packages/renderer/assets/models/quaternius-men/worker.glb",
  "Models/LivingRoom/GLB/Couch_Large1.glb",
  "Models/LivingRoom/GLB/Couch_L.glb",
  "Models/LivingRoom/GLB/Chair_2.glb",
  "Models/LivingRoom/GLB/Table_RoundLarge.glb",
  "Models/Bedroom/GLB/Bed_King.glb",
  "Models/Bedroom/GLB/Bed_Single.glb",
  "Models/Bedroom/GLB/NightStand_2.glb",
  "Models/Kitchen/GLB/Kitchen_Fridge.glb",
  "Models/Kitchen/GLB/Kitchen_Oven.glb",
  "Models/Kitchen/GLB/Kitchen_Sink.glb",
  "Models/Bathroom/GLB/Bathroom_Bathtub.glb",
  "Models/Bathroom/GLB/Bathroom_Toilet.glb",
  "Models/Lighting/GLB/Light_Floor1.glb",
  "Models/Architecture/GLB/Door_3.glb",
  "Models/Architecture/GLB/Window_Large1.glb",
  IndustrialShelfUrl,
  ReplicaCabinetUrl,
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
  `${KenneyBase}shopping-cart.glb`,
  `${KenneyBase}shopping-basket.glb`,
  `${KenneyBase}shelf-bags.glb`,
  `${KenneyBase}shelf-boxes.glb`,
  "https://raw.githubusercontent.com/microsoft/experimental-pcf-control-assets/master/cardboard_box.glb"
];

const TrackedAssets = new Set(AssetUrls);
const AssetPromises = new Map();
let CompletedAssets = 0;
let FailedAssets = 0;
let NextAssetIndex = 0;
let SkipResolver = null;
let Finished = false;
let StopPreload = false;

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
window.__STORE_WORLD_SEED_BUILD__ = "V0.35.3-SEED";

function CreateLoaderUi() {
  if (!BootCard) return { SkipButton: null, Warning: null, Progress: null, SeedLabel: null };

  const Wrapper = document.createElement("div");
  Wrapper.id = "PreloadOptionsR38";
  Wrapper.style.marginTop = "14px";
  Wrapper.style.display = "grid";
  Wrapper.style.gap = "8px";

  const Progress = document.createElement("div");
  Progress.style.height = "7px";
  Progress.style.border = "1px solid rgba(255,255,255,.12)";
  Progress.style.background = "rgba(0,0,0,.28)";
  const Fill = document.createElement("div");
  Fill.style.width = "0%";
  Fill.style.height = "100%";
  Fill.style.background = "#b77b43";
  Fill.style.transition = "width .18s linear";
  Progress.appendChild(Fill);
  Progress.Fill = Fill;

  const Warning = document.createElement("p");
  Warning.id = "PreloadWarningR38";
  Warning.style.margin = "0";
  Warning.style.color = "#c7a889";
  Warning.style.fontSize = ".72rem";
  Warning.style.lineHeight = "1.45";
  Warning.textContent = "Preloading can take up to 2 minutes. Skipping is safe, but the first rooms may lag or furniture may pop in while models finish loading.";

  const SeedLabel = document.createElement("p");
  SeedLabel.style.margin = "0";
  SeedLabel.style.color = "#777d82";
  SeedLabel.style.fontSize = ".66rem";
  SeedLabel.style.letterSpacing = ".08em";
  SeedLabel.textContent = `WORLD SEED ${World.Seed}`;

  const SkipButton = document.createElement("button");
  SkipButton.id = "SkipLoadingButton";
  SkipButton.type = "button";
  SkipButton.textContent = "SKIP PRELOAD";
  SkipButton.style.minHeight = "42px";
  SkipButton.style.padding = "0 18px";
  SkipButton.style.border = "1px solid rgba(208,154,96,.65)";
  SkipButton.style.background = "rgba(28,22,17,.9)";
  SkipButton.style.color = "#d9b58e";
  SkipButton.style.fontWeight = "850";
  SkipButton.style.letterSpacing = ".08em";
  SkipButton.style.cursor = "pointer";

  Wrapper.append(Progress, Warning, SeedLabel, SkipButton);
  const BuildNode = BuildVersion || BootCard.lastElementChild;
  BootCard.insertBefore(Wrapper, BuildNode);
  return { Wrapper, SkipButton, Warning, Progress, SeedLabel };
}

const LoaderUi = CreateLoaderUi();

if (StartButton) {
  StartButton.disabled = true;
  StartButton.style.opacity = ".42";
  StartButton.style.cursor = "wait";
}

function UpdateStatus() {
  const Elapsed = performance.now() - StartedAt;
  const RemainingMs = Math.max(0, LoadWindowMs - Elapsed);
  const RemainingSeconds = Math.ceil(RemainingMs / 1000);
  const Minutes = Math.floor(RemainingSeconds / 60);
  const Seconds = RemainingSeconds % 60;
  const Loaded = CompletedAssets + FailedAssets;
  const Percent = AssetUrls.length ? Loaded / AssetUrls.length : 1;
  if (LoaderUi.Progress?.Fill) LoaderUi.Progress.Fill.style.width = `${(Percent * 100).toFixed(1)}%`;
  if (BootStatus && !Finished) {
    BootStatus.textContent = `Preloading store ${Loaded}/${AssetUrls.length} • ${Minutes}:${String(Seconds).padStart(2, "0")} maximum`;
  }
}

function GetOrStartAsset(Url, Loader, Args = []) {
  if (AssetPromises.has(Url)) return AssetPromises.get(Url);

  const PromiseValue = OriginalLoadAsync.call(Loader, Url, ...Args)
    .then(Result => {
      CompletedAssets += 1;
      UpdateStatus();
      return Result;
    })
    .catch(Error => {
      FailedAssets += 1;
      UpdateStatus();
      console.warn(`Preload failed for ${Url}`, Error);
      throw Error;
    });

  AssetPromises.set(Url, PromiseValue);
  return PromiseValue;
}

GLTFLoader.prototype.loadAsync = function(Url, ...Args) {
  if (!TrackedAssets.has(Url)) return OriginalLoadAsync.call(this, Url, ...Args);
  return GetOrStartAsset(Url, this, Args);
};

async function Worker() {
  const Loader = new GLTFLoader();
  while (!StopPreload && NextAssetIndex < AssetUrls.length) {
    const AssetIndex = NextAssetIndex;
    NextAssetIndex += 1;
    try {
      await GetOrStartAsset(AssetUrls[AssetIndex], Loader);
    } catch {}
  }
}

const WorkersDone = Promise.all([Worker(), Worker(), Worker()]);
const SkipPromise = new Promise(Resolve => { SkipResolver = Resolve; });
const TimeoutPromise = new Promise(Resolve => setTimeout(() => Resolve("timeout"), LoadWindowMs));

LoaderUi.SkipButton?.addEventListener("click", () => {
  LoaderUi.SkipButton.disabled = true;
  LoaderUi.SkipButton.textContent = "SKIPPING...";
  StopPreload = true;
  SkipResolver?.("skip");
}, { once: true });

const Timer = setInterval(UpdateStatus, 250);
UpdateStatus();

const Result = await Promise.race([
  WorkersDone.then(() => "ready"),
  SkipPromise,
  TimeoutPromise
]);

Finished = true;
if (Result !== "ready") StopPreload = true;
clearInterval(Timer);

if (BootStatus) {
  if (Result === "ready") BootStatus.textContent = `Assets warmed • world seed ${World.Seed} • building store...`;
  else if (Result === "skip") BootStatus.textContent = `Preload skipped • world seed ${World.Seed} • gameplay loading will continue only as needed...`;
  else BootStatus.textContent = `2 minute preload limit reached • world seed ${World.Seed} • continuing...`;
}

if (LoaderUi.SkipButton) LoaderUi.SkipButton.style.display = "none";
LoaderUi.Wrapper?.remove();

window.__STORE_PRELOAD_PROMISES__ = AssetPromises;
window.__STORE_PRELOAD_RESULT__ = Result;
window.__STORE_PRELOAD_BUILD__ = "V0.35.3-CORNER";