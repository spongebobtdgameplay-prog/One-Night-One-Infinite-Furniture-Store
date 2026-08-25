const Hud = document.getElementById("Hud");
const SettingsOverlay = document.getElementById("SettingsOverlayR43");
const AisleCounter = document.getElementById("AisleCounter");

for (const Id of ["OpenMainMenuR83", "RuntimeMainMenuR83", "RuntimeMainMenuStyleR84"]) {
  document.getElementById(Id)?.remove();
}

const Style = document.createElement("style");
Style.id = "RuntimeMainMenuStyleR84";
Style.textContent = `
#OpenMainMenuR83{
  position:fixed;right:16px;top:62px;z-index:85;display:none;align-items:center;gap:12px;
  min-width:126px;min-height:42px;padding:0 12px;border:1px solid rgba(255,255,255,.13);
  background:rgba(7,8,10,.78);box-shadow:0 10px 35px rgba(0,0,0,.22);backdrop-filter:blur(8px);
  color:#f4efe6;cursor:pointer;text-align:left;transition:transform .14s ease,border-color .14s ease,background .14s ease
}
#OpenMainMenuR83:hover{transform:translateY(-1px);border-color:rgba(208,154,96,.62);background:rgba(17,18,19,.92)}
#OpenMainMenuR83:active{transform:translateY(1px)}
#OpenMainMenuR83 span{font-size:.62rem;font-weight:900;letter-spacing:.15em}
#OpenMainMenuR83 small{margin-left:auto;color:#a67b50;font-size:.48rem;font-weight:900;letter-spacing:.10em}
#RuntimeMainMenuR83{z-index:1100;transition:opacity .20s ease}
#RuntimeMainMenuR83 .RuntimeMenuActionsR84{display:flex;gap:9px;flex-wrap:wrap;align-items:center}
#RuntimeMainMenuR83 .RuntimeMenuActionsR84 .PrimaryButton{min-width:154px}
#RuntimeMainMenuR83 .RuntimeMenuActionsR84 .R43Button{min-width:142px}
#RuntimeMainMenuR83 .RuntimeMenuRunStatusR84{margin-top:14px}
@media(max-width:620px){
  #OpenMainMenuR83{right:10px;top:auto;bottom:76px;min-width:104px;min-height:38px}
  #RuntimeMainMenuR83 .RuntimeMenuActionsR84{display:grid;grid-template-columns:1fr;width:100%}
  #RuntimeMainMenuR83 .RuntimeMenuActionsR84 button{width:100%}
}
`;
document.head.appendChild(Style);

const Button = document.createElement("button");
Button.id = "OpenMainMenuR83";
Button.type = "button";
Button.setAttribute("aria-label", "Open main menu");
Button.innerHTML = `<span>MENU</span><small>ESC</small>`;
document.body.appendChild(Button);

const Overlay = document.createElement("section");
Overlay.id = "RuntimeMainMenuR83";
Overlay.className = "Overlay";
Overlay.setAttribute("aria-hidden", "true");
Overlay.innerHTML = `
  <div class="BootCard">
    <h1>THE INFINITY<br>STORE</h1>
    <p class="Tagline">Your current run is paused. Resume from the exact same place whenever you are ready.</p>
    <div class="RuntimeMenuActionsR84">
      <button type="button" class="PrimaryButton" data-menu-action="resume">RESUME</button>
      <button type="button" class="R43Button" data-menu-action="settings">SETTINGS</button>
    </div>
    <p class="BootStatus RuntimeMenuRunStatusR84">RUN PAUSED</p>
  </div>
`;
document.body.appendChild(Overlay);

const RunStatus = Overlay.querySelector(".RuntimeMenuRunStatusR84");
let Open = false;
let HiddenForSettings = false;
const BlockedKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "KeyE", "Space"]);

function HudVisible() {
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function UpdateRunStatus() {
  if (!RunStatus) return;
  const Aisle = String(AisleCounter?.textContent || "").trim();
  RunStatus.textContent = Aisle ? `RUN PAUSED • AISLE ${Aisle}` : "RUN PAUSED";
}

function SyncButton() {
  Button.style.display = HudVisible() && !Open && !window.__STORE_STREAM_LOADING__ ? "flex" : "none";
}

function ShowOverlay() {
  if (!Open || HiddenForSettings) return;
  Overlay.classList.add("ScreenVisible");
  Overlay.setAttribute("aria-hidden", "false");
}

function HideOverlay() {
  Overlay.classList.remove("ScreenVisible");
  Overlay.setAttribute("aria-hidden", "true");
}

function OpenMenu() {
  if (Open || !HudVisible() || window.__STORE_STREAM_LOADING__) return;
  Open = true;
  HiddenForSettings = false;
  window.__STORE_MAIN_MENU_OPEN__ = true;
  UpdateRunStatus();
  window.dispatchEvent(new Event("blur"));
  if (document.pointerLockElement) document.exitPointerLock?.();
  ShowOverlay();
  SyncButton();
}

function CloseMenu() {
  if (!Open) return;
  Open = false;
  HiddenForSettings = false;
  window.__STORE_MAIN_MENU_OPEN__ = false;
  HideOverlay();
  SyncButton();
  setTimeout(() => window.__STORE_POINTER_LOCK_RUNTIME__?.RequestFirstPersonLock?.(), 45);
}

function OpenSettings() {
  if (!Open || !SettingsOverlay) return;
  HiddenForSettings = true;
  HideOverlay();
  SettingsOverlay.classList.add("Open");
  SettingsOverlay.setAttribute("aria-hidden", "false");
}

Button.addEventListener("click", OpenMenu);
Overlay.querySelector('[data-menu-action="resume"]')?.addEventListener("click", CloseMenu);
Overlay.querySelector('[data-menu-action="settings"]')?.addEventListener("click", OpenSettings);

addEventListener("keydown", Event => {
  if (SettingsOverlay?.classList.contains("Open")) return;
  if (Event.code === "Escape") {
    Event.preventDefault();
    Event.stopImmediatePropagation();
    if (Open) CloseMenu();
    else OpenMenu();
    return;
  }
  if (!Open || !BlockedKeys.has(Event.code)) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();
}, true);

addEventListener("keyup", Event => {
  if (!Open || !BlockedKeys.has(Event.code)) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();
}, true);

const HudObserver = new MutationObserver(SyncButton);
if (Hud) HudObserver.observe(Hud, { attributes: true, attributeFilter: ["class"] });

const SettingsObserver = SettingsOverlay ? new MutationObserver(() => {
  if (!Open || !HiddenForSettings || SettingsOverlay.classList.contains("Open")) return;
  HiddenForSettings = false;
  ShowOverlay();
}) : null;
if (SettingsOverlay && SettingsObserver) SettingsObserver.observe(SettingsOverlay, { attributes: true, attributeFilter: ["class"] });

SyncButton();
addEventListener("pagehide", () => {
  HudObserver.disconnect();
  SettingsObserver?.disconnect();
}, { once: true });

window.__STORE_RUNTIME_MAIN_MENU_R83__ = { OpenMenu, CloseMenu };
window.__STORE_RUNTIME_MAIN_MENU_BUILD__ = "V0.23.0-R84";