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
#NetworkOverlayR93 *,#RuntimeMainMenuR83 *,#SettingsOverlayR43 *,#AccountGateR92 *{
  transition-duration:0s!important;
}
#NetworkOverlayR93 button,#NetworkOverlayR93 input,#NetworkOverlayR93 select,
#RuntimeMainMenuR83 button,#SettingsOverlayR43 button,#SettingsOverlayR43 input,#SettingsOverlayR43 select,
#AccountGateR92 button,#AccountGateR92 input{
  touch-action:manipulation;
}
#NetworkOverlayR93.Open,#RuntimeMainMenuR83.ScreenVisible,#SettingsOverlayR43.Open,#AccountGateR92:not(.Leaving){
  will-change:auto!important;
}
#NetworkOverlayR93{background:rgba(4,5,4,.965)!important}
#RuntimeMainMenuR83{background:rgba(4,5,4,.955)!important}
#SettingsOverlayR43{background:rgba(3,4,5,.965)!important}
#OpenMainMenuR83{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;transition:none!important}
#Hud .ClockCard,#Hud .RunStats,#Hud .StaminaHud,#Hud .CameraMode,#Hud .InteractPrompt{
  backdrop-filter:none!important;
  -webkit-backdrop-filter:none!important;
}
`;
document.head.appendChild(Style);

const WatchTargets = [];
let UiModalOpen = false;
let LastUiRenderAt = -Infinity;
const UI_WORLD_FRAME_MS = 1000 / 12;
const OriginalRender = Game.Renderer.render.bind(Game.Renderer);

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
  if (!UiModalOpen) LastUiRenderAt = -Infinity;
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
  if (Game.Renderer.render === FastUiRender) Game.Renderer.render = OriginalRender;
}, { once: true });

window.__STORE_UI_PERFORMANCE_R95__ = {
  SyncUiState,
  IsOpen: () => UiModalOpen,
  GetWorldUiFps: () => 12
};
window.__STORE_UI_PERFORMANCE_BUILD__ = "V0.30.1-R95";
