const Cache = "20260824-73";
const Version = "0.14.0";
const FaviconVersion = "20260824-2";
const FaviconLinks = [
  {
    rel: "icon",
    type: "image/x-icon",
    href: `favicon_io/favicon.ico?v=${FaviconVersion}`
  },
  {
    rel: "icon",
    type: "image/png",
    sizes: "32x32",
    href: `favicon_io/favicon-32x32.png?v=${FaviconVersion}`
  },
  {
    rel: "icon",
    type: "image/png",
    sizes: "16x16",
    href: `favicon_io/favicon-16x16.png?v=${FaviconVersion}`
  },
  {
    rel: "apple-touch-icon",
    sizes: "180x180",
    href: `favicon_io/apple-touch-icon.png?v=${FaviconVersion}`
  },
  {
    rel: "manifest",
    href: `favicon_io/site.webmanifest?v=${FaviconVersion}`
  }
];

document.head.querySelectorAll('link[data-store-icon="1"]').forEach(Link => Link.remove());

for (const LinkData of FaviconLinks) {
  const Link = document.createElement("link");
  Link.setAttribute("data-store-icon", "1");

  for (const [Property, Value] of Object.entries(LinkData)) {
    Link.setAttribute(Property, Value);
  }

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

  await import(`./pointer-lock-runtime-r19.js?v=${Cache}`);
  await OptionalImport("./runtime-fixes.js", "Runtime collision and camera fixes");
  await OptionalImport("./precision-collision-v2.js", "Precise collision");
  await import(`./precise-collision-authority-r27.js?v=${Cache}`);
  await import(`./world-polish-r72.js?v=${Cache}`);
  await import(`./movement-contact-compat-r25.js?v=${Cache}`);
  await import(`./movement-authority-r30.js?v=${Cache}`);
  await import(`./forward-wall-invariant-r31.js?v=${Cache}`);
  await import(`./final-contact-r19.js?v=${Cache}`);
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