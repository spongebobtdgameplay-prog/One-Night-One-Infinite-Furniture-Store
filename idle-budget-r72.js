const NativeRequestIdleCallback = typeof window.requestIdleCallback === "function"
  ? window.requestIdleCallback.bind(window)
  : null;

if (NativeRequestIdleCallback && !window.__STORE_IDLE_BUDGET_R72__) {
  window.requestIdleCallback = (Callback, Options = {}) => {
    const RequestedTimeout = Number(Options?.timeout);
    const Timeout = Number.isFinite(RequestedTimeout) ? Math.max(240, RequestedTimeout) : 240;
    return NativeRequestIdleCallback(Callback, { ...Options, timeout: Timeout });
  };
  window.__STORE_IDLE_BUDGET_R72__ = true;
}

window.__STORE_IDLE_BUDGET_BUILD__ = "V0.14.0-R72";
