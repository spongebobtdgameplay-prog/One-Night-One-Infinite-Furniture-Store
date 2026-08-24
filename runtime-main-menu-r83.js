const Hud = document.getElementById("Hud");
const SettingsOverlay = document.getElementById("SettingsOverlayR43");

const Button = document.createElement("button");
Button.id = "OpenMainMenuR83";
Button.type = "button";
Button.textContent = "MAIN MENU";
Object.assign(Button.style, {
  position: "fixed",
  right: "16px",
  bottom: "62px",
  zIndex: "80",
  minHeight: "36px",
  padding: "0 12px",
  border: "1px solid rgba(238,228,207,.45)",
  background: "rgba(39,43,39,.90)",
  color: "#eee4cf",
  font: "800 .58rem Arial,sans-serif",
  letterSpacing: ".10em",
  cursor: "pointer",
  display: "none"
});
document.body.appendChild(Button);

const Overlay = document.createElement("div");
Overlay.id = "RuntimeMainMenuR83";
Overlay.setAttribute("aria-hidden", "true");
Overlay.innerHTML = `
  <div class="RuntimeMenuCardR83">
    <small>THE INFINITY STORE</small>
    <h2>MAIN MENU</h2>
    <p>Your current run stays exactly where it is.</p>
    <button type="button" data-menu-action="resume">RESUME</button>
    <button type="button" data-menu-action="settings">SETTINGS</button>
  </div>
`;
Object.assign(Overlay.style, {
  position: "fixed",
  inset: "0",
  zIndex: "1100",
  display: "grid",
  placeItems: "center",
  background: "rgba(20,22,19,.94)",
  backdropFilter: "blur(8px)",
  opacity: "0",
  visibility: "hidden",
  pointerEvents: "none",
  transition: "opacity 130ms ease"
});
const Style = document.createElement("style");
Style.textContent = `
.RuntimeMenuCardR83{width:min(420px,calc(100vw - 36px));padding:28px;border:1px solid #87887d;background:#292e29;color:#eee4cf;box-shadow:0 24px 80px rgba(0,0,0,.48);font-family:Arial,sans-serif}
.RuntimeMenuCardR83 small{font-size:.55rem;font-weight:800;letter-spacing:.18em;color:#aaa796}.RuntimeMenuCardR83 h2{margin:7px 0 8px;font-size:1.15rem;letter-spacing:.11em}.RuntimeMenuCardR83 p{margin:0 0 22px;color:#aaa99e;font-size:.7rem;line-height:1.45}
.RuntimeMenuCardR83 button{display:block;width:100%;min-height:46px;margin-top:8px;border:1px solid #9b9a8e;background:#3a423b;color:#f0e6d0;font-size:.66rem;font-weight:900;letter-spacing:.11em;cursor:pointer}.RuntimeMenuCardR83 button:hover{background:#e7ddc8;color:#30352f}
`;
document.head.appendChild(Style);
document.body.appendChild(Overlay);

let Open = false;
const BlockedKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "KeyE", "Space"]);

function HudVisible() {
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function SyncButton() {
  Button.style.display = HudVisible() && !Open ? "block" : "none";
}

function OpenMenu() {
  if (Open || !HudVisible() || window.__STORE_STREAM_LOADING__) return;
  Open = true;
  window.__STORE_MAIN_MENU_OPEN__ = true;
  window.dispatchEvent(new Event("blur"));
  if (document.pointerLockElement) document.exitPointerLock?.();
  Overlay.style.visibility = "visible";
  Overlay.style.opacity = "1";
  Overlay.style.pointerEvents = "auto";
  Overlay.setAttribute("aria-hidden", "false");
  SyncButton();
}

function CloseMenu() {
  if (!Open) return;
  Open = false;
  window.__STORE_MAIN_MENU_OPEN__ = false;
  Overlay.style.opacity = "0";
  Overlay.style.pointerEvents = "none";
  Overlay.setAttribute("aria-hidden", "true");
  setTimeout(() => {
    if (!Open) Overlay.style.visibility = "hidden";
  }, 140);
  SyncButton();
  setTimeout(() => window.__STORE_POINTER_LOCK_RUNTIME__?.RequestFirstPersonLock?.(), 40);
}

Button.addEventListener("click", OpenMenu);
Overlay.querySelector('[data-menu-action="resume"]')?.addEventListener("click", CloseMenu);
Overlay.querySelector('[data-menu-action="settings"]')?.addEventListener("click", () => {
  if (!SettingsOverlay) return;
  SettingsOverlay.classList.add("Open");
  SettingsOverlay.setAttribute("aria-hidden", "false");
});

addEventListener("keydown", Event => {
  if (Event.code === "Escape") {
    if (SettingsOverlay?.classList.contains("Open")) return;
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

const Observer = new MutationObserver(SyncButton);
if (Hud) Observer.observe(Hud, { attributes: true, attributeFilter: ["class"] });
SyncButton();
addEventListener("pagehide", () => Observer.disconnect(), { once: true });

window.__STORE_RUNTIME_MAIN_MENU_R83__ = { OpenMenu, CloseMenu };
window.__STORE_RUNTIME_MAIN_MENU_BUILD__ = "V0.22.0-R83";