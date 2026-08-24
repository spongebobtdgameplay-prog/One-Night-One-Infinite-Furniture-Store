const Cache = "20260823-56";
const Version = "0.12.20";
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
  await OptionalImport("./world-enhancements-r13.js", "World enhancements");
  await OptionalImport("./performance-manager.js", "Settings and performance manager");
  await OptionalImport("./menu-visuals.js", "Main menu illustration");
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

  await OptionalImport("./task-visual-fix.js", "Task visual fix");
  await OptionalImport("./runtime-fixes.js", "Runtime collision and camera fixes");
  await OptionalImport("./precision-collision-v2.js", "Precise collision");
  await OptionalImport("./collision-cleanup.js", "Collision cleanup");
  await OptionalImport("./sign-fix.js", "Section sign upgrade");
  await OptionalImport("./price-signs.js", "Price signs");
  await import(`./post-animation-nerve-runtime-r17.js?v=${Cache}`);
  await import(`./movement-authority-r19.js?v=${Cache}`);
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
