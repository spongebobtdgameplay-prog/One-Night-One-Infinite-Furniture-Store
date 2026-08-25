const AccountGatePromise = window.__STORE_ACCOUNT_GATE_PROMISE__;
if (AccountGatePromise) {
  const WaitingStatus = document.getElementById("BootStatus");
  if (WaitingStatus) WaitingStatus.textContent = "Waiting for account selection...";
  window.__STORE_ACCOUNT_GATE_RESULT__ = await AccountGatePromise;
  if (WaitingStatus) WaitingStatus.textContent = "Preparing store...";
}

const Cache = "20260825-105";
const Version = "0.30.2";
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
  await import("./loading-prewarm-r38.js?v=20260823-33");
  await OptionalImport("./three-text-utility-r73.js", "Optimized 3D text utility");
  await import(`./idle-budget-r72.js?v=${Cache}`);
  await import(`./single-menu-pre-r24.js?v=${Cache}`);
  await OptionalImport("./world-enhancements-r13.js", "World enhancements");
  await OptionalImport("./performance-manager.js", "Settings and performance manager");
  await import(`./collision-utility.js?v=${Cache}`);
  await import(`./surface-contact-utility-r17.js?v=${Cache}`);

  await import("./player-controller.js?v=20260823-33");
  await import("./player-system-r24.js?v=20260823-33");
  await OptionalImport("./sprint-animation-rate-r40.js", "Sprint animation cadence");
  await import(`./animation-motion-authority-r18.js?v=${Cache}`);
  await OptionalImport("./first-person-fullbody-r32.js", "First-person full body");
  await import(`./game.js?v=${Cache}`);
  window.__STORE_VERSION__ = Version;
  window.__STORE_GAME_BUILD__ = `V${Version}`;

  await OptionalImport("./runtime-performance-buffer-r94.js", "Incremental distance and frame performance buffer");
  await OptionalImport("./multiplayer-client-r88.js", "Authenticated multiplayer client");
  await OptionalImport("./player-nameplate-r94.js", "Compact account player nameplates");
  await OptionalImport("./session-outdated-r93.js", "Stale-session refresh guard");
  await OptionalImport("./multiplayer-ui-r93.js", "Stable account, server browser and multiplayer lobby UI");
  await OptionalImport("./multiplayer-authority-r89.js", "Started-game multiplayer task, clock and correction authority");
  await OptionalImport("./forward-generation-r78.js", "Forward-only infinite generation");
  await import(`./pointer-lock-runtime-r19.js?v=${Cache}`);
  await OptionalImport("./runtime-fixes.js", "Runtime collision and camera fixes");
  await OptionalImport("./precision-collision-v2.js", "Precise collision");
  await import(`./precise-collision-authority-r27.js?v=${Cache}`);
  await import(`./world-polish-r72.js?v=${Cache}`);
  await OptionalImport("./generator-integrity-r77.js", "Exact generated-object placement");
  await OptionalImport("./store-visual-stable-r83.js", "Stable 3D showroom dressing");
  await OptionalImport("./collision-ghost-cleanup-r75.js", "Obsolete collision cleanup");
  await OptionalImport("./visible-materials-r77.js", "Targeted near-black material correction");
  await OptionalImport("./render-distance-lighting-r74.js", "Culled bounded-distance store lighting");
  await OptionalImport("./retail-showroom-r79.js", "Imported retail showroom models and light variation");
  await OptionalImport("./store-finish-r80.js", "Rear closure and merchandising walls");
  await OptionalImport("./retail-zones-r82.js", "Real cart, bag and large-rug retail zones");
  await OptionalImport("./retail-sale-displays-r84.js", "Rug-backed couches and organized sale islands");
  await OptionalImport("./retail-organization-r83.js", "Organized cart and bag bays");
  await OptionalImport("./shelf-stock-r83.js", "Stocked showroom shelves");
  await OptionalImport("./price-tag-authority-r83.js", "Single-version compact item prices");
  await OptionalImport("./retail-zone-collision-r82.js", "Height-aware retail-zone collision");
  await OptionalImport("./solid-object-collision-r83.js", "Finalized static object collision");
  await OptionalImport("./surface-step-animation-r87.js", "Procedural carpet edge step-over animation");
  await OptionalImport("./core-fix-authority-r86.js", "Exact furniture collision, ghost cleanup and walkable carpets");
  await OptionalImport("./distance-haze-r82.js", "Stable distance haze");
  await OptionalImport("./presentation-ready-r83.js", "Stable off-screen chunk presentation gate");
  await OptionalImport("./stream-loading-cover-r83.js", "Opaque streamed-aisle loading cover");

  await import(`./movement-contact-compat-r25.js?v=${Cache}`);
  await import(`./movement-authority-r30.js?v=${Cache}`);
  await import(`./forward-wall-invariant-r31.js?v=${Cache}`);
  await import(`./final-contact-r19.js?v=${Cache}`);
  await OptionalImport("./creepy-hud-r93.js", "Lean creepy in-game HUD presentation");
  await OptionalImport("./furniture-carry-r94.js", "Cached furniture carrying and weight authority");
  await OptionalImport("./furniture-designer-mimic-r94.js", "Event-driven Mason requests, check-ins and mimic encounters");
  await OptionalImport("./runtime-main-menu-r83.js", "Start-screen style resumable main menu");
  await OptionalImport("./ui-performance-r95.js", "R96 UI idle and low-latency authority");
  window.__STORE_PERFORMANCE_BUFFER_R94__?.ScanNewRoots?.(true);
  window.__STORE_FURNITURE_CARRY_R94__?.RefreshIndex?.(true);
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
}

window.__STORE_BOOTSTRAP_BUILD__ = `V${Version}`;
window.__STORE_MULTIPLAYER_UI_R93__?.Render?.();