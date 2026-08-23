import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const StartButton = document.getElementById("StartButton");
const BootStatus = document.getElementById("BootStatus");

const ModelUrls = [
  "Models/LivingRoom/GLB/Couch_Large1.glb",
  "Models/LivingRoom/GLB/Couch_L.glb",
  "Models/LivingRoom/GLB/Chair_2.glb",
  "Models/LivingRoom/GLB/Table_RoundLarge.glb",
  "Models/Bedroom/GLB/Bed_King.glb",
  "Models/Bedroom/GLB/Bed_Single.glb",
  "Models/Bedroom/GLB/NightStand_2.glb",
  "Models/Storage/GLB/Shelf_Large.glb",
  "Models/Storage/GLB/Bookshelf.glb",
  "Models/Kitchen/GLB/Kitchen_Cabinet1.glb",
  "Models/Kitchen/GLB/Kitchen_Fridge.glb",
  "Models/Kitchen/GLB/Kitchen_Oven.glb",
  "Models/Kitchen/GLB/Kitchen_Sink.glb",
  "Models/Bathroom/GLB/Bathroom_Bathtub.glb",
  "Models/Bathroom/GLB/Bathroom_Toilet.glb",
  "Models/Lighting/GLB/Light_Floor1.glb",
  "Models/Architecture/GLB/Door_3.glb",
  "Models/Architecture/GLB/Window_Large1.glb"
];

const ParsedModels = new Map();
const OriginalLoadAsync = GLTFLoader.prototype.loadAsync;
const Loader = new GLTFLoader();
let Completed = 0;

if (StartButton) StartButton.disabled = true;
if (BootStatus) BootStatus.textContent = "Loading furniture 0 / 18...";

async function LoadOne(Url) {
  try {
    const Gltf = await OriginalLoadAsync.call(Loader, Url);
    ParsedModels.set(Url, Gltf);
  } catch (Error) {
    console.warn(`Could not preload ${Url}`, Error);
  } finally {
    Completed += 1;
    if (BootStatus) BootStatus.textContent = `Loading furniture ${Completed} / ${ModelUrls.length}...`;
  }
}

let NextIndex = 0;
async function Worker() {
  while (NextIndex < ModelUrls.length) {
    const Index = NextIndex;
    NextIndex += 1;
    await LoadOne(ModelUrls[Index]);
  }
}

await Promise.all([Worker(), Worker(), Worker()]);

GLTFLoader.prototype.loadAsync = function(Url, ...Args) {
  const Cached = ParsedModels.get(Url);
  if (Cached) return Promise.resolve(Cached);
  return OriginalLoadAsync.call(this, Url, ...Args);
};

window.__STORE_PARSED_MODEL_CACHE__ = ParsedModels;
window.__STORE_INVENTORY_PRELOAD_BUILD__ = "V0.11-R35";

if (BootStatus) BootStatus.textContent = "Furniture loaded — building nearby rooms...";
