const Game = window.__STORE_GAME__;
if (!Game?.Renderer) throw new Error("Game renderer must exist before UI performance authority.");

const Style = document.createElement("style");
Style.id = "FastUiStyleR95";
Style.textContent = `
html,body{scroll-behavior:auto!important}
#NetworkOverlayR93,#RuntimeMainMenuR83,#SettingsOverlayR43,#AccountGateR92{
  backdrop-filter:none!important;
  -webkit-backdrop-filter:none!important;
  transition:none!important;
  animation:none!important;
}
#NetworkOverlayR93 .NetFrameR93,#RuntimeMainMenuR83 .BootCard,#SettingsOverlayR43 .R43SettingsPanel,.AccountGateShellR92{
  backdrop-filter:none!important;
  -webkit-backdrop-filter:none!important;
  transition:none!important;
  animation:none!important;
  contain:layout paint style;
}
#NetworkOverlayR93 *,#RuntimeMainMenuR83 *,#SettingsOverlayR43 *,#AccountGateR92 *{transition-duration:0s!important}
#NetworkOverlayR93 button,#NetworkOverlayR93 input,#NetworkOverlayR93 select,
#RuntimeMainMenuR83 button,#SettingsOverlayR43 button,#SettingsOverlayR43 input,#SettingsOverlayR43 select,
#AccountGateR92 button,#AccountGateR92 input{touch-action:manipulation}
#NetworkOverlayR93.Open,#RuntimeMainMenuR83.ScreenVisible,#SettingsOverlayR43.Open,#AccountGateR92:not(.Leaving){will-change:auto!important}
#NetworkOverlayR93{background:rgba(4,5,4,.965)!important}
#RuntimeMainMenuR83{background:rgba(4,5,4,.955)!important}
#SettingsOverlayR43{background:rgba(3,4,5,.965)!important}
#OpenMainMenuR83{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;transition:none!important}
#Hud .ClockCard,#Hud .RunStats,#Hud .StaminaHud,#Hud .CameraMode,#Hud .InteractPrompt{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
#UiInstantFeedbackR95{position:fixed;left:50%;top:18px;z-index:2100;display:none;transform:translateX(-50%);padding:8px 12px;border:1px solid rgba(222,207,180,.28);background:#101310;color:#e9dec9;font:900 10px Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;pointer-events:none;box-shadow:0 10px 28px rgba(0,0,0,.32)}
#UiInstantFeedbackR95.Show{display:block}
.StoreFastPressR95{filter:brightness(1.22)!important}
`;
document.head.appendChild(Style);

const Feedback = document.createElement("div");
Feedback.id = "UiInstantFeedbackR95";
document.body.appendChild(Feedback);

const WatchTargets = [];
let UiModalOpen = false;
let LastUiRenderAt = -Infinity;
let FeedbackTimer = 0;
const UI_WORLD_FRAME_MS = 1000 / 12;
const OriginalRender = Game.Renderer.render.bind(Game.Renderer);

function ShowFeedback(Text, Duration = 1600) {
  clearTimeout(FeedbackTimer);
  Feedback.textContent = String(Text || "WORKING…");
  Feedback.classList.add("Show");
  FeedbackTimer = setTimeout(() => Feedback.classList.remove("Show"), Duration);
}

function FindTargets() {
  WatchTargets.length = 0;
  for (const Id of ["NetworkOverlayR93", "RuntimeMainMenuR83", "SettingsOverlayR43", "AccountGateR92"]) {
    const Element = document.getElementById(Id);
    if (Element) WatchTargets.push(Element);
  }
}

function ComputeOpen() {
  const Network = document.getElementById("NetworkOverlayR93");
  const MainMenu = document.getElementById("RuntimeMainMenuR83");
  const Settings = document.getElementById("SettingsOverlayR43");
  const Account = document.getElementById("AccountGateR92");
  return Boolean(
    Network?.classList.contains("Open") ||
    MainMenu?.classList.contains("ScreenVisible") ||
    Settings?.classList.contains("Open") ||
    (Account && !Account.classList.contains("Leaving") && getComputedStyle(Account).display !== "none")
  );
}

function SyncUiState() {
  const Next = ComputeOpen();
  if (Next === UiModalOpen) return;
  UiModalOpen = Next;
  window.__STORE_UI_MODAL_OPEN_R95__ = UiModalOpen;
  document.documentElement.classList.toggle("StoreUiModalOpenR95", UiModalOpen);
  if (!UiModalOpen) {
    LastUiRenderAt = -Infinity;
    Feedback.classList.remove("Show");
  }
  window.dispatchEvent(new CustomEvent("store-ui-performance-state", { detail: { open: UiModalOpen } }));
}

const Observers = [];
function BindObservers() {
  for (const Observer of Observers) Observer.disconnect();
  Observers.length = 0;
  FindTargets();
  for (const Target of WatchTargets) {
    const Observer = new MutationObserver(SyncUiState);
    Observer.observe(Target, { attributes: true, attributeFilter: ["class", "style"] });
    Observers.push(Observer);
  }
  SyncUiState();
}

const FastUiRender = function FastUiRender(Scene, Camera) {
  if (!UiModalOpen) return OriginalRender(Scene, Camera);
  const Now = performance.now();
  if (Now - LastUiRenderAt < UI_WORLD_FRAME_MS) return;
  LastUiRenderAt = Now;
  return OriginalRender(Scene, Camera);
};
Game.Renderer.render = FastUiRender;

function ActionFeedback(Target) {
  if (!Target?.closest?.("#NetworkOverlayR93")) return "";
  if (Target.closest("[data-random]")) return "JOINING SERVER…";
  if (Target.closest("[data-start-game]")) return "STARTING GAME…";
  if (Target.closest("[data-leave-lobby]")) return "LEAVING LOBBY…";
  if (Target.closest("[data-switch-account]")) return "CHECKING ACCOUNT…";
  if (Target.closest("[data-logout]")) return "LOGGING OUT…";
  return "";
}

function FormFeedback(Form) {
  if (!Form?.closest?.("#NetworkOverlayR93")) return "";
  if (Form.matches("[data-login-form]")) return "LOGGING IN…";
  if (Form.matches("[data-create-form]")) return "CREATING ACCOUNT…";
  if (Form.matches("[data-join-form]")) return "JOINING GAME…";
  if (Form.matches("[data-create-game-form]")) return "CREATING LOBBY…";
  if (Form.matches("[data-lobby-settings]")) return "SAVING SETTINGS…";
  return "";
}

addEventListener("pointerdown", Event => {
  const Control = Event.target?.closest?.("button,[role=button]");
  if (!Control) return;
  Control.classList.add("StoreFastPressR95");
  const Text = ActionFeedback(Control);
  if (Text) ShowFeedback(Text);
}, { capture: true, passive: true });

for (const Name of ["pointerup", "pointercancel"]) {
  addEventListener(Name, Event => Event.target?.closest?.("button,[role=button]")?.classList.remove("StoreFastPressR95"), { capture: true, passive: true });
}

addEventListener("submit", Event => {
  const Text = FormFeedback(Event.target);
  if (Text) ShowFeedback(Text);
}, true);

for (const EventName of ["store-account-change", "store-room-change", "store-multiplayer-start"]) {
  addEventListener(EventName, () => Feedback.classList.remove("Show"));
}

const BodyObserver = new MutationObserver(() => {
  const KnownCount = WatchTargets.filter(Element => Element?.isConnected).length;
  const CurrentCount = ["NetworkOverlayR93", "RuntimeMainMenuR83", "SettingsOverlayR43", "AccountGateR92"]
    .reduce((Count, Id) => Count + (document.getElementById(Id) ? 1 : 0), 0);
  if (KnownCount !== CurrentCount) BindObservers();
});
BodyObserver.observe(document.body, { childList: true });

BindObservers();
addEventListener("pagehide", () => {
  BodyObserver.disconnect();
  for (const Observer of Observers) Observer.disconnect();
  clearTimeout(FeedbackTimer);
  if (Game.Renderer.render === FastUiRender) Game.Renderer.render = OriginalRender;
}, { once: true });

window.__STORE_UI_PERFORMANCE_R95__ = {
  SyncUiState,
  ShowFeedback,
  IsOpen: () => UiModalOpen,
  GetWorldUiFps: () => 12
};
window.__STORE_UI_PERFORMANCE_BUILD__ = "V0.30.1-R95";
