const Game = window.__STORE_GAME__;
if (!Game?.Renderer) throw new Error("Game renderer must load before menu render idle authority.");

const Renderer = Game.Renderer;
const Player = window.__STORE_PLAYER__ || null;
const BootScreen = document.getElementById("BootScreen");
const NativeRendererRender = Renderer.render.bind(Renderer);
const NativePlayerRender = typeof Player?.Render === "function" ? Player.Render.bind(Player) : null;

function IsOpen(Element, ClassName = "Open") {
  return Boolean(Element && Element.classList.contains(ClassName));
}

function UiBlocksWorld() {
  if (BootScreen?.classList.contains("ScreenVisible")) return true;
  if (IsOpen(document.getElementById("SettingsOverlayR43"))) return true;
  if (IsOpen(document.getElementById("MultiplayerOverlayR88"))) return true;
  if (IsOpen(document.getElementById("RuntimeMainMenuR83"))) return true;
  if (IsOpen(document.getElementById("RuntimeMainMenuR84"))) return true;
  return false;
}

function SyncFpsCounter() {
  const Counter = document.getElementById("FpsCounterR43");
  if (!Counter) return;
  Counter.style.visibility = UiBlocksWorld() ? "hidden" : "";
}

Renderer.render = function StoreMenuAwareRender(...Args) {
  if (UiBlocksWorld()) return;
  return NativeRendererRender(...Args);
};

if (NativePlayerRender) {
  Player.Render = function StoreMenuAwarePlayerRender(...Args) {
    if (UiBlocksWorld()) return;
    return NativePlayerRender(...Args);
  };
}

function ObserveOverlay(Element) {
  if (!Element || typeof MutationObserver !== "function") return;
  const Observer = new MutationObserver(SyncFpsCounter);
  Observer.observe(Element, { attributes: true, attributeFilter: ["class"] });
  addEventListener("pagehide", () => Observer.disconnect(), { once: true });
}

ObserveOverlay(BootScreen);
ObserveOverlay(document.getElementById("SettingsOverlayR43"));
ObserveOverlay(document.getElementById("MultiplayerOverlayR88"));

addEventListener("store-settings-change", SyncFpsCounter);
addEventListener("store-network-state", SyncFpsCounter);
addEventListener("pointerlockchange", SyncFpsCounter);
SyncFpsCounter();

window.__STORE_MENU_RENDER_IDLE_R113__ = {
  UiBlocksWorld,
  SyncFpsCounter
};
window.__STORE_MENU_RENDER_IDLE_BUILD__ = "V0.25.1-PERF3";
