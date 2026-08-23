const BasePlayer = window.__STORE_PLAYER__;

if (!BasePlayer) throw new Error("Base player must load before animation owner bridge.");

window.__STORE_BASE_PLAYER__ = BasePlayer;

if (!BasePlayer.IsThirdPerson?.()) {
  const Event = new KeyboardEvent("keydown", {
    code: "KeyV",
    key: "v",
    bubbles: false,
    cancelable: true
  });
  window.dispatchEvent(Event);
}

window.__STORE_BASE_ANIMATION_OWNER_BUILD__ = "V0.11-R16";
