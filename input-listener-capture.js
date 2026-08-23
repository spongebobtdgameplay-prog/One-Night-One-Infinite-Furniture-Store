const OriginalAddEventListener = window.addEventListener;
const WheelListeners = [];

window.addEventListener = function CapturedAddEventListener(Type, Listener, Options) {
  if (Type === "wheel" && typeof Listener === "function") WheelListeners.push({ Listener, Options });
  return OriginalAddEventListener.call(this, Type, Listener, Options);
};

window.__STORE_INPUT_LISTENER_CAPTURE__ = {
  WheelListeners,
  Restore() {
    if (window.addEventListener !== OriginalAddEventListener) window.addEventListener = OriginalAddEventListener;
  }
};

window.__STORE_INPUT_LISTENER_CAPTURE_BUILD__ = "V0.12.6";
