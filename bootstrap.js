const Cache = "20260830-v03536-loadertruth1";
const Version = "0.35.36";
const FaviconVersion = "20260824-4";
const FaviconLinks = [
  { rel: "icon", type: "image/png", sizes: "32x32", href: `favicon_io/favicon-32x32.png?v=${FaviconVersion}` },
  { rel: "icon", type: "image/png", sizes: "16x16", href: `favicon_io/favicon-16x16.png?v=${FaviconVersion}` },
  { rel: "apple-touch-icon", sizes: "180x180", href: `favicon_io/apple-touch-icon.png?v=${FaviconVersion}` },
  { rel: "manifest", href: `favicon_io/site.webmanifest?v=${FaviconVersion}` }
];

document.title = "The Infinity Store";
const PromoEyebrow = document.querySelector("#BootScreen .Eyebrow");
if (PromoEyebrow) PromoEyebrow.remove();
const StoreTitle = document.querySelector("#BootScreen h1");
if (StoreTitle) StoreTitle.innerHTML = "THE INFINITY<br>STORE";

document.head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[data-store-icon="1"]').forEach(Link => Link.remove());
for (const LinkData of FaviconLinks) {
  const Link = document.createElement("link");
  Link.setAttribute("data-store-icon", "1");
  for (const [Property, Value] of Object.entries(LinkData)) Link.setAttribute(Property, Value);
  document.head.appendChild(Link);
}

const BuildVersion = document.getElementById("BuildVersion");
if (BuildVersion) BuildVersion.textContent = `BUILD V${Version}`;
window.__STORE_VERSION__ = Version;

const BootStatus = document.getElementById("BootStatus");
const BootStageLabel = document.getElementById("BootStageLabel");

function SetBootStage(Text) {
  const Value = String(Text || "");
  if (BootStatus) BootStatus.textContent = Value;
  if (BootStageLabel) BootStageLabel.textContent = Value;
  window.__STORE_BOOT_STAGE__ = Value;
  window.dispatchEvent(new CustomEvent("store-boot-stage", { detail: { stage: Value } }));
}

window.__STORE_SET_BOOT_STAGE__ = SetBootStage;
SetBootStage("Starting store services...");

async function OptionalImport(Path, Label) {
  try {
    return await import(`${Path}?v=${Cache}`);
  } catch (Error) {
    console.warn(`${Label} unavailable; continuing without it.`, Error);
    return null;
  }
}

function ShowBootError(Error) {
  const Panel = document.getElementById("ErrorPanel");
  const Text = document.getElementById("ErrorText");
  if (Text) Text.textContent = String(Error?.message || Error || "Unknown boot error.");
  if (Panel) Panel.classList.remove("Hidden");
}

let CoreReady = false;

try {
  SetBootStage("Loading account system...");
  await import(`./multiplayer.js?v=${Cache}`);
  const AccountReady = window.__STORE_MULTIPLAYER__.WaitForAccount();

  SetBootStage("Starting furniture asset warm-up...");
  await import(`./loading-prewarm-r38.js?v=${Cache}`);

  SetBootStage("Checking your saved account...");
  await AccountReady;

  SetBootStage("Loading interface and performance systems...");
  await OptionalImport("./three-text-utility-r73.js", "3D text utility");
  await import(`./idle-budget-r72.js?v=${Cache}`);
  await import(`./single-menu-pre-r24.js?v=${Cache}`);
  await OptionalImport("./world-enhancements-r13.js", "World enhancements");
  await OptionalImport("./performance-manager.js", "Settings and performance manager");

  SetBootStage("Loading collision and procedural physics...");
  await import(`./collision-utility.js?v=${Cache}`);
  await import(`./procedural-physics-utility.js?v=${Cache}`);
  await import(`./surface-contact-utility-r17.js?v=${Cache}`);

  SetBootStage("Loading player controller and animation...");
  await import(`./player-controller.js?v=${Cache}`);
  await import(`./player-system-r24.js?v=${Cache}`);
  await OptionalImport("./sprint-animation-rate-r40.js", "Sprint animation cadence");
  await import(`./animation-motion-authority-r18.js?v=${Cache}`);
  await OptionalImport("./first-person-fullbody-r32.js", "First-person full body");

  SetBootStage("Building the first playable aisle...");
  await import(`./game.js?v=${Cache}`);
  window.__STORE_VERSION__ = Version;
  window.__STORE_GAME_BUILD__ = `V${Version}`;

  SetBootStage("Connecting multiplayer to the store...");
  await window.__STORE_MULTIPLAYER__.AttachGame();

  SetBootStage("Loading aisle streaming and showroom systems...");
  await OptionalImport("./forward-generation-r78.js", "Forward-only infinite generation");
  await import(`./pointer-lock-runtime-r19.js?v=${Cache}`);
  await import(`./world-polish-r72.js?v=${Cache}`);
  await OptionalImport("./generator-integrity-r77.js", "Exact generated-object placement");
  await OptionalImport("./store-visual-stable-r83.js", "Stable 3D showroom dressing");
  await OptionalImport("./visible-materials-r77.js", "Targeted near-black material correction");
  await OptionalImport("./render-distance-lighting-r74.js", "Stable long-distance store lighting");
  await OptionalImport("./retail-showroom-r79.js", "Imported retail showroom models and light variation");
  await OptionalImport("./store-finish-r80.js", "Rear closure and merchandising walls");
  await OptionalImport("./retail-zones-r82.js", "Real cart, bag and large-rug retail zones");
  await OptionalImport("./retail-sale-displays-r84.js", "Rug-backed couches and organized sale islands");
  await OptionalImport("./retail-organization-r83.js", "Organized cart and bag bays");
  await OptionalImport("./shelf-stock-r83.js", "Stocked showroom shelves");
  await OptionalImport("./price-tag-authority-r83.js", "Single-version compact item prices");
  await OptionalImport("./surface-step-animation-r87.js", "Dedicated carpet step animation utility");
  await OptionalImport("./core-fix-authority-r86.js", "Exact furniture collision, ghost cleanup and walkable carpets");
  await OptionalImport("./distance-haze-r82.js", "Stable distance haze");
  await OptionalImport("./presentation-ready-r83.js", "Stable off-screen chunk presentation gate");
  await OptionalImport("./stream-loading-cover-r83.js", "Opaque streamed-aisle loading cover");

  SetBootStage("Finalizing movement contact and the main menu...");
  await import(`./movement-contact-compat-r25.js?v=${Cache}`);
  await OptionalImport("./final-contact-r19.js", "Final limb contact");
  await OptionalImport("./runtime-main-menu-r83.js", "Start-screen style resumable main menu");
  CoreReady = true;
} catch (Error) {
  console.error("Core store boot failed.", Error);
  ShowBootError(Error);
}

const ReadyButton = document.getElementById("StartButton");
if (ReadyButton && CoreReady) {
  ReadyButton.disabled = false;
  ReadyButton.style.opacity = "";
  ReadyButton.style.cursor = "";
  const Seed = Number(window.__STORE_WORLD_SEED__) || 0;
  SetBootStage(`Ready to enter • nearby aisles continue buffering • seed ${Seed}`);
  window.__STORE_MULTIPLAYER__?.NotifyCoreReady?.();
}

window.__STORE_BOOTSTRAP_BUILD__ = `V${Version}`;
