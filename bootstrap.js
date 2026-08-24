const Cache = "20260824-90";
const Version = "0.22.2";
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
  await OptionalImport("./three-text-utility-r73.js", "3D text utility");
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
  await OptionalImport("./render-distance-lighting-r74.js", "Stable long-distance store lighting");
  await OptionalImport("./retail-showroom-r79.js", "Imported retail showroom models and light variation");
  await OptionalImport("./store-finish-r80.js", "Rear closure and merchandising walls");
  await OptionalImport("./retail-zones-r82.js", "Real cart, bag and large-rug retail zones");
  await OptionalImport("./retail-organization-r83.js", "Organized cart and bag bays");
  await OptionalImport("./shelf-stock-r83.js", "Stocked showroom shelves");
  await OptionalImport("./price-tag-authority-r83.js", "Single-version compact item prices");
  await OptionalImport("./retail-zone-collision-r82.js", "Height-aware retail-zone collision");
  await OptionalImport("./solid-object-collision-r83.js", "Finalized static object collision");
  await OptionalImport("./distance-haze-r82.js", "Stable distance haze");
  await OptionalImport("./presentation-ready-r83.js", "Stable off-screen chunk presentation gate");
  await OptionalImport("./stream-loading-cover-r83.js", "Opaque streamed-aisle loading cover");

  await import(`./movement-contact-compat-r25.js?v=${Cache}`);
  await import(`./movement-authority-r30.js?v=${Cache}`);
  await import(`./forward-wall-invariant-r31.js?v=${Cache}`);
  await import(`./final-contact-r19.js?v=${Cache}`);
  await OptionalImport("./runtime-main-menu-r83.js", "Resumable in-game main menu");
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