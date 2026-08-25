const Player = window.__STORE_PLAYER__;
const BootScreen = document.getElementById("BootScreen");

if (!Player || typeof Player.Render !== "function") {
  throw new Error("Player render must exist before pre-start render gate.");
}

const NativeRender = Player.Render.bind(Player);

Player.Render = function StorePrestartRenderGate(...Args) {
  if (BootScreen?.classList.contains("ScreenVisible")) return;
  return NativeRender(...Args);
};

window.__STORE_PRESTART_RENDER_GATE_R115__ = {
  IsBlocked() {
    return Boolean(BootScreen?.classList.contains("ScreenVisible"));
  }
};
window.__STORE_PRESTART_RENDER_GATE_BUILD__ = "V0.25.1-R115";
