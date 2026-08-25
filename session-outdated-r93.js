const IDLE_LIMIT_MS = 20 * 60 * 1000;
const RECONNECT_LIMIT_MS = 90 * 1000;

let LastActivityAt = Date.now();
let HiddenAt = 0;
let ReconnectStartedAt = 0;
let Visible = false;

const Style = document.createElement("style");
Style.id = "SessionOutdatedStyleR93";
Style.textContent = `
#SessionOutdatedR93{position:fixed;inset:0;z-index:20000;display:grid;place-items:center;padding:24px;background:rgba(3,4,3,.93);backdrop-filter:blur(12px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease}#SessionOutdatedR93.Show{opacity:1;visibility:visible;pointer-events:auto}.SessionFrameR93{position:relative;width:min(500px,calc(100vw - 32px));padding:28px;border:1px solid rgba(193,128,74,.60);background:linear-gradient(180deg,#1a1713,#0d0e0c);box-shadow:0 0 0 1px rgba(255,255,255,.02),0 30px 100px rgba(0,0,0,.75);transform:translateY(16px) scale(.98);animation:SessionFrameInR93 .28s ease forwards,SessionFramePulseR93 3.6s steps(1,end) infinite}.SessionFrameR93:before,.SessionFrameR93:after{content:"";position:absolute;pointer-events:none}.SessionFrameR93:before{inset:7px;border:1px solid rgba(193,128,74,.15)}.SessionFrameR93:after{left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,transparent,rgba(216,155,95,.75),transparent);animation:SessionScanR93 2.8s linear infinite}.SessionFrameR93 small{display:block;color:#a87448;font:900 .53rem Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase}.SessionFrameR93 h2{margin:9px 0 8px;color:#eee1ca;font:900 1.45rem Arial,sans-serif;letter-spacing:.13em}.SessionFrameR93 p{margin:0 0 20px;color:rgba(238,225,202,.55);font:650 .72rem/1.55 Arial,sans-serif}.SessionFrameR93 button{width:100%;min-height:48px;border:1px solid rgba(232,218,194,.46);background:#ddd0b8;color:#141512;font:900 .64rem Arial,sans-serif;letter-spacing:.13em;text-transform:uppercase;cursor:pointer}.SessionFrameR93 button:hover{background:#f2e6cf}.SessionReasonR93{margin-top:12px;color:rgba(238,225,202,.30);font:850 .49rem Arial,sans-serif;letter-spacing:.10em;text-transform:uppercase}@keyframes SessionFrameInR93{to{transform:none}}@keyframes SessionFramePulseR93{0%,92%,100%{filter:none}93%{filter:brightness(.82)}94%{filter:brightness(1.16)}95%{filter:none}}@keyframes SessionScanR93{0%{transform:translateY(0);opacity:.1}50%{opacity:.75}100%{transform:translateY(184px);opacity:.05}}
`;
document.head.appendChild(Style);

const Overlay = document.createElement("section");
Overlay.id = "SessionOutdatedR93";
Overlay.setAttribute("aria-hidden", "true");
Overlay.innerHTML = `
  <div class="SessionFrameR93" role="dialog" aria-modal="true" aria-label="Session outdated">
    <small>THE INFINITY STORE NETWORK</small>
    <h2>SESSION OUTDATED</h2>
    <p>This game session has been inactive or disconnected for too long. Your saved account stays on this device. Refresh the page to rebuild a clean connection.</p>
    <button type="button" data-refresh>REFRESH PAGE</button>
    <div class="SessionReasonR93" data-reason>STALE SESSION</div>
  </div>`;
document.body.appendChild(Overlay);

Overlay.querySelector("[data-refresh]").addEventListener("click", () => location.reload());

function RuntimeExists() {
  return Boolean(window.__STORE_BOOTSTRAP_BUILD__ || window.__STORE_GAME__ || document.getElementById("Hud"));
}

function Show(Reason = "STALE SESSION") {
  if (Visible || !RuntimeExists()) return;
  Visible = true;
  if (document.pointerLockElement) document.exitPointerLock?.();
  const ReasonElement = Overlay.querySelector("[data-reason]");
  if (ReasonElement) ReasonElement.textContent = String(Reason || "STALE SESSION").toUpperCase();
  Overlay.classList.add("Show");
  Overlay.setAttribute("aria-hidden", "false");
  window.dispatchEvent(new Event("blur"));
}

function TouchActivity() {
  if (!Visible) LastActivityAt = Date.now();
}

for (const EventName of ["keydown", "mousedown", "pointerdown", "touchstart", "wheel"]) {
  addEventListener(EventName, TouchActivity, { passive: true, capture: true });
}

addEventListener("visibilitychange", () => {
  if (document.hidden) {
    HiddenAt = Date.now();
    return;
  }
  const AwayFor = HiddenAt ? Date.now() - HiddenAt : 0;
  HiddenAt = 0;
  if (AwayFor >= IDLE_LIMIT_MS) Show("AFK TOO LONG — REFRESH REQUIRED");
  else TouchActivity();
});

addEventListener("store-network-change", () => {
  const State = window.__STORE_MULTIPLAYER_R88__?.GetState?.();
  if (!State?.account) {
    ReconnectStartedAt = 0;
    return;
  }
  if (State.status === "reconnecting") {
    if (!ReconnectStartedAt) ReconnectStartedAt = Date.now();
  } else if (State.connected || State.status === "online") {
    ReconnectStartedAt = 0;
  }
});

addEventListener("store-session-outdated", Event => Show(Event.detail?.reason || "SESSION STATE CHANGED"));

setInterval(() => {
  if (Visible || document.hidden) return;
  const Now = Date.now();
  const Hud = document.getElementById("Hud");
  const InRuntime = Hud && !Hud.classList.contains("Hidden");
  if (InRuntime && Now - LastActivityAt >= IDLE_LIMIT_MS) {
    Show("AFK TOO LONG — REFRESH REQUIRED");
    return;
  }
  if (ReconnectStartedAt && Now - ReconnectStartedAt >= RECONNECT_LIMIT_MS) Show("NETWORK STALE — REFRESH REQUIRED");
}, 30_000);

window.__STORE_SESSION_OUTDATED_R93__ = { Show };
window.__STORE_SESSION_OUTDATED_BUILD__ = "V0.28.0-R93";
