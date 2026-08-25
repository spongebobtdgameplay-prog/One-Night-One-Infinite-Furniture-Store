const Hud = document.getElementById("Hud");
if (!Hud) throw new Error("HUD must exist before creepy HUD styling.");

const Style = document.createElement("style");
Style.id = "CreepyHudStyleR93";
Style.textContent = `
#Hud.CreepyHudR93{font-family:Arial,sans-serif;--hud-paper:#d8cdb8;--hud-dim:rgba(216,205,184,.49);--hud-edge:rgba(187,144,94,.28);--hud-dark:rgba(7,8,7,.82)}
#Hud.CreepyHudR93 .HudTop{gap:8px;filter:drop-shadow(0 8px 24px rgba(0,0,0,.48))}
#Hud.CreepyHudR93 .ClockCard,#Hud.CreepyHudR93 .ObjectiveCard,#Hud.CreepyHudR93 .RunStats{position:relative;overflow:hidden;border:1px solid var(--hud-edge)!important;background:linear-gradient(180deg,rgba(15,17,14,.90),rgba(5,6,5,.84))!important;box-shadow:inset 0 0 22px rgba(0,0,0,.30),0 8px 28px rgba(0,0,0,.28)!important;backdrop-filter:blur(5px)}
#Hud.CreepyHudR93 .ClockCard:before,#Hud.CreepyHudR93 .ObjectiveCard:before,#Hud.CreepyHudR93 .RunStats:before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0,transparent 3px,rgba(255,255,255,.012) 4px);mix-blend-mode:screen}
#Hud.CreepyHudR93 .ClockCard:after,#Hud.CreepyHudR93 .ObjectiveCard:after,#Hud.CreepyHudR93 .RunStats:after{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(206,155,99,.56),transparent);opacity:.65}
#Hud.CreepyHudR93 .HudLabel{color:#9f7955!important;font-size:.5rem!important;letter-spacing:.17em!important;text-shadow:0 0 10px rgba(171,117,66,.18)}
#Hud.CreepyHudR93 #GameClock{color:var(--hud-paper)!important;letter-spacing:.08em;text-shadow:0 0 9px rgba(216,205,184,.09);animation:HudClockFlickerR93 7s steps(1,end) infinite}
#Hud.CreepyHudR93 #ObjectiveText{color:rgba(225,215,196,.78)!important;font-weight:760!important;letter-spacing:.025em;text-shadow:0 1px 0 #000}
#Hud.CreepyHudR93 .RunStats small{color:#8e6b4d!important;letter-spacing:.12em!important}
#Hud.CreepyHudR93 .RunStats strong{color:#d8cdb8!important;text-shadow:0 0 8px rgba(216,205,184,.08)}
#Hud.CreepyHudR93 .StaminaHud{border:1px solid rgba(178,132,82,.20)!important;background:rgba(6,7,6,.72)!important;box-shadow:inset 0 0 18px rgba(0,0,0,.45)!important;backdrop-filter:blur(5px)}
#Hud.CreepyHudR93 .StaminaHeader{color:rgba(216,205,184,.62)!important;font-size:.53rem!important;letter-spacing:.12em!important}
#Hud.CreepyHudR93 .StaminaTrack{background:rgba(60,50,40,.45)!important;border:1px solid rgba(173,128,80,.15)!important}
#Hud.CreepyHudR93 .StaminaFill{filter:saturate(.58) brightness(.86);box-shadow:0 0 8px rgba(177,131,80,.14)}
#Hud.CreepyHudR93 .CameraMode{border:1px solid rgba(178,132,82,.15)!important;background:rgba(5,6,5,.62)!important;color:rgba(216,205,184,.38)!important;letter-spacing:.1em!important}
#Hud.CreepyHudR93 .CameraMode strong{color:rgba(216,205,184,.66)!important}
#Hud.CreepyHudR93 .ControlsHint{border-top:1px solid rgba(181,136,87,.13)!important;background:linear-gradient(90deg,transparent,rgba(5,6,5,.62),transparent)!important;color:rgba(216,205,184,.29)!important;text-shadow:0 1px 0 #000;letter-spacing:.06em!important}
#Hud.CreepyHudR93 .InteractPrompt{border:1px solid rgba(191,143,91,.34)!important;background:rgba(7,8,7,.86)!important;color:#dfd2ba!important;box-shadow:0 0 25px rgba(0,0,0,.48),inset 0 0 18px rgba(141,92,47,.07)!important;letter-spacing:.08em!important;animation:InteractUneaseR93 3.4s ease-in-out infinite}
#Hud.CreepyHudR93 .Crosshair{filter:drop-shadow(0 0 4px rgba(190,150,102,.22));opacity:.58;animation:CrosshairBreatheR93 4.2s ease-in-out infinite}
#HorrorVignetteR93{position:fixed;inset:0;z-index:38;pointer-events:none;display:none;background:radial-gradient(circle at 50% 48%,transparent 0,transparent 44%,rgba(0,0,0,.09) 65%,rgba(0,0,0,.38) 100%);mix-blend-mode:multiply}#HorrorVignetteR93.Show{display:block}#HorrorVignetteR93:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.006) 0,rgba(255,255,255,.006) 1px,transparent 2px,transparent 4px);opacity:.25;animation:HudNoiseDriftR93 9s linear infinite}
@keyframes HudClockFlickerR93{0%,92%,94%,100%{opacity:1}93%{opacity:.64}93.4%{opacity:.9}}@keyframes InteractUneaseR93{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.012)}}@keyframes CrosshairBreatheR93{0%,100%{opacity:.48}50%{opacity:.70}}@keyframes HudNoiseDriftR93{0%{transform:translateY(0)}100%{transform:translateY(8px)}}
`;
document.head.appendChild(Style);

const Vignette = document.createElement("div");
Vignette.id = "HorrorVignetteR93";
document.body.appendChild(Vignette);

function Sync() {
  const Visible = !Hud.classList.contains("Hidden");
  Hud.classList.toggle("CreepyHudR93", true);
  Vignette.classList.toggle("Show", Visible);
}

const Observer = new MutationObserver(Sync);
Observer.observe(Hud, { attributes: true, attributeFilter: ["class"] });
Sync();

addEventListener("pagehide", () => Observer.disconnect(), { once: true });
window.__STORE_CREEPY_HUD_R93__ = { Sync };
window.__STORE_CREEPY_HUD_BUILD__ = "V0.28.0-R93";
