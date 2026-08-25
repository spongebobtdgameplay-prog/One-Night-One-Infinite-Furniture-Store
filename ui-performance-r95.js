const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
if (!Game?.Renderer) throw new Error("Game renderer must exist before UI performance authority.");

const Style = document.createElement("style");
Style.id = "FastUiStyleR98";
Style.textContent = `
html,body{scroll-behavior:auto!important}
#BootScreen,#NetworkOverlayR98,#RuntimeMainMenuR83,#SettingsOverlayR43,#AccountGateR92{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;transition:none!important;animation:none!important}
#BootScreen .BootCard,#NetworkOverlayR98 .NetFrameR98,#RuntimeMainMenuR83 .BootCard,#SettingsOverlayR43 .R43SettingsPanel,.AccountGateShellR92{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;transition:none!important;animation:none!important;contain:layout paint style}
#BootScreen *,#NetworkOverlayR98 *,#RuntimeMainMenuR83 *,#SettingsOverlayR43 *,#AccountGateR92 *{transition-duration:0s!important}
#BootScreen button,#NetworkOverlayR98 button,#NetworkOverlayR98 input,#NetworkOverlayR98 select,#RuntimeMainMenuR83 button,#SettingsOverlayR43 button,#SettingsOverlayR43 input,#SettingsOverlayR43 select,#AccountGateR92 button,#AccountGateR92 input{touch-action:manipulation}
#OpenMainMenuR83,#FpsCounterR43,#Hud .ClockCard,#Hud .RunStats,#Hud .StaminaHud,#Hud .CameraMode,#Hud .InteractPrompt{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
#UiInstantFeedbackR98{position:fixed;left:50%;top:18px;z-index:2100;display:none;transform:translateX(-50%);padding:8px 12px;border:1px solid rgba(222,207,180,.28);background:#101310;color:#e9dec9;font:900 10px Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;pointer-events:none}#UiInstantFeedbackR98.Show{display:block}.StoreFastPressR98{filter:brightness(1.18)!important}
`;
document.head.appendChild(Style);

const Feedback = document.createElement("div");
Feedback.id = "UiInstantFeedbackR98";
document.body.appendChild(Feedback);

const WatchedIds = ["BootScreen", "NetworkOverlayR98", "RuntimeMainMenuR83", "SettingsOverlayR43", "AccountGateR92"];
const Observers = [];
let UiModalOpen = false;
let LastWorldRenderAt = -Infinity;
let LastPlayerRenderAt = -Infinity;
let FeedbackTimer = 0;
const UI_WORLD_FRAME_MS = 300;
const OriginalRender = Game.Renderer.render.bind(Game.Renderer);
const OriginalPlayerRender = typeof Player?.Render === "function" ? Player.Render.bind(Player) : null;

function IsElementOpen(Id, Element) {
  if (!Element) return false;
  if (Id === "BootScreen") return Element.classList.contains("ScreenVisible");
  if (Id === "NetworkOverlayR98") return Element.classList.contains("Open");
  if (Id === "RuntimeMainMenuR83") return Element.classList.contains("ScreenVisible");
  if (Id === "SettingsOverlayR43") return Element.classList.contains("Open");
  if (Id === "AccountGateR92") return Element.isConnected && !Element.classList.contains("Leaving");
  return false;
}

function ComputeOpen() {
  for (const Id of WatchedIds) if (IsElementOpen(Id, document.getElementById(Id))) return true;
  return false;
}

function SyncUiState() {
  const Next = ComputeOpen();
  if (Next === UiModalOpen) return;
  UiModalOpen = Next;
  window.__STORE_UI_MODAL_OPEN_R95__ = Next;
  window.__STORE_UI_MODAL_OPEN_R96__ = Next;
  window.__STORE_UI_MODAL_OPEN_R98__ = Next;
  document.documentElement.classList.toggle("StoreUiModalOpenR98", Next);
  if (!Next) {
    LastWorldRenderAt = -Infinity;
    LastPlayerRenderAt = -Infinity;
    Feedback.classList.remove("Show");
  }
  window.dispatchEvent(new CustomEvent("store-ui-performance-state", { detail: { open: Next } }));
}

function RebindObservers() {
  for (const Observer of Observers) Observer.disconnect();
  Observers.length = 0;
  for (const Id of WatchedIds) {
    const Element = document.getElementById(Id);
    if (!Element) continue;
    const Observer = new MutationObserver(SyncUiState);
    Observer.observe(Element, { attributes: true, attributeFilter: ["class"] });
    Observers.push(Observer);
  }
  SyncUiState();
}

const FastUiRender = function FastUiRender(Scene, Camera) {
  if (!UiModalOpen) return OriginalRender(Scene, Camera);
  const Now = performance.now();
  if (Now - LastWorldRenderAt < UI_WORLD_FRAME_MS) return;
  LastWorldRenderAt = Now;
  return OriginalRender(Scene, Camera);
};
Game.Renderer.render = FastUiRender;

const FastUiPlayerRender = OriginalPlayerRender ? function FastUiPlayerRender(Renderer, Scene, Camera) {
  if (!UiModalOpen) return OriginalPlayerRender(Renderer, Scene, Camera);
  const Now = performance.now();
  if (Now - LastPlayerRenderAt < UI_WORLD_FRAME_MS) return;
  LastPlayerRenderAt = Now;
  return OriginalPlayerRender(Renderer, Scene, Camera);
} : null;
if (FastUiPlayerRender) Player.Render = FastUiPlayerRender;

function ShowFeedback(Text, Duration = 1200) {
  clearTimeout(FeedbackTimer);
  Feedback.textContent = String(Text || "WORKING…");
  Feedback.classList.add("Show");
  FeedbackTimer = setTimeout(() => Feedback.classList.remove("Show"), Duration);
}

function ActionFeedback(Target) {
  if (!Target?.closest?.("#NetworkOverlayR98")) return "";
  if (Target.closest("[data-random]")) return "JOINING SERVER…";
  if (Target.closest("[data-start]")) return "STARTING GAME…";
  if (Target.closest("[data-leave]")) return "LEAVING LOBBY…";
  if (Target.closest("[data-refresh]")) return "REFRESHING SERVERS…";
  if (Target.closest("[data-logout]")) return "LOGGING OUT…";
  return "";
}

function FormFeedback(Form) {
  if (!Form?.closest?.("#NetworkOverlayR98")) return "";
  if (Form.matches("[data-login]")) return "LOGGING IN…";
  if (Form.matches("[data-create-account]")) return "CREATING ACCOUNT…";
  if (Form.matches("[data-join]")) return "JOINING GAME…";
  if (Form.matches("[data-create-game-form]")) return "CREATING LOBBY…";
  if (Form.matches("[data-settings]")) return "SAVING SETTINGS…";
  return "";
}

addEventListener("pointerdown", Event => {
  const Control = Event.target?.closest?.("button,[role=button]");
  if (!Control) return;
  Control.classList.add("StoreFastPressR98");
  const Text = ActionFeedback(Control);
  if (Text) ShowFeedback(Text);
}, { capture: true, passive: true });
for (const Name of ["pointerup", "pointercancel"]) addEventListener(Name, Event => Event.target?.closest?.("button,[role=button]")?.classList.remove("StoreFastPressR98"), { capture: true, passive: true });
addEventListener("submit", Event => { const Text = FormFeedback(Event.target); if (Text) ShowFeedback(Text); }, true);
for (const EventName of ["store-account-change", "store-room-change", "store-multiplayer-start"]) addEventListener(EventName, () => Feedback.classList.remove("Show"));

const BodyObserver = new MutationObserver(() => {
  const Expected = WatchedIds.reduce((Count, Id) => Count + (document.getElementById(Id) ? 1 : 0), 0);
  if (Expected !== Observers.length) RebindObservers();
});
BodyObserver.observe(document.body, { childList: true });

RebindObservers();
addEventListener("pagehide", () => {
  BodyObserver.disconnect();
  for (const Observer of Observers) Observer.disconnect();
  clearTimeout(FeedbackTimer);
  if (Game.Renderer.render === FastUiRender) Game.Renderer.render = OriginalRender;
  if (FastUiPlayerRender && Player.Render === FastUiPlayerRender) Player.Render = OriginalPlayerRender;
}, { once: true });

window.__STORE_UI_PERFORMANCE_R95__ = { SyncUiState, ShowFeedback, IsOpen: () => UiModalOpen, GetWorldUiFps: () => 3.3 };
window.__STORE_UI_PERFORMANCE_R96__ = window.__STORE_UI_PERFORMANCE_R95__;
window.__STORE_UI_PERFORMANCE_R98__ = window.__STORE_UI_PERFORMANCE_R95__;
window.__STORE_UI_PERFORMANCE_BUILD__ = "V0.30.5-R98";
