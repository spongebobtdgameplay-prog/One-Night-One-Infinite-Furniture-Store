const Hud = document.getElementById("Hud");
if (!Hud) throw new Error("HUD must exist before creepy HUD styling.");

const ObjectiveCard = Hud.querySelector(".ObjectiveCard");
if (ObjectiveCard) ObjectiveCard.remove();

const Style = document.createElement("style");
Style.id = "CreepyHudStyleR94";
Style.textContent = `
#Hud.CreepyHudR94{font-family:Arial,sans-serif;--hud-paper:#d8cdb8;--hud-edge:rgba(174,126,79,.29)}
#Hud.CreepyHudR94 .HudTop{display:grid!important;grid-template-columns:auto auto!important;justify-content:space-between!important;gap:8px!important;filter:drop-shadow(0 7px 18px rgba(0,0,0,.46))}
#Hud.CreepyHudR94 .ClockCard,#Hud.CreepyHudR94 .RunStats{position:relative;overflow:hidden;border:1px solid var(--hud-edge)!important;background:linear-gradient(180deg,rgba(13,15,12,.91),rgba(5,6,5,.90))!important;box-shadow:inset 0 0 15px rgba(0,0,0,.30),0 7px 20px rgba(0,0,0,.25)!important}
#Hud.CreepyHudR94 .ClockCard:after,#Hud.CreepyHudR94 .RunStats:after{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(205,149,93,.52),transparent)}
#Hud.CreepyHudR94 .HudLabel{color:#956e4d!important;font-size:.48rem!important;letter-spacing:.17em!important}
#Hud.CreepyHudR94 #GameClock{color:var(--hud-paper)!important;letter-spacing:.08em;animation:HudClockFlickerR94 8s steps(1,end) infinite}
#Hud.CreepyHudR94 .RunStats small{color:#846044!important;letter-spacing:.12em!important}
#Hud.CreepyHudR94 .RunStats strong{color:#d8cdb8!important}
#Hud.CreepyHudR94 .StaminaHud{border:1px solid rgba(168,119,74,.21)!important;background:rgba(5,6,5,.79)!important;box-shadow:inset 0 0 14px rgba(0,0,0,.42)!important}
#Hud.CreepyHudR94 .StaminaHeader{color:rgba(216,205,184,.60)!important;font-size:.51rem!important;letter-spacing:.12em!important}
#Hud.CreepyHudR94 .StaminaTrack{background:rgba(55,45,36,.50)!important;border:1px solid rgba(164,117,72,.14)!important}
#Hud.CreepyHudR94 .StaminaFill{filter:saturate(.55) brightness(.84)}
#Hud.CreepyHudR94 .CameraMode{border:1px solid rgba(168,119,74,.14)!important;background:rgba(5,6,5,.72)!important;color:rgba(216,205,184,.35)!important;letter-spacing:.1em!important}
#Hud.CreepyHudR94 .CameraMode strong{color:rgba(216,205,184,.62)!important}
#Hud.CreepyHudR94 .ControlsHint{border-top:1px solid rgba(169,121,75,.11)!important;background:rgba(5,6,5,.45)!important;color:rgba(216,205,184,.25)!important;letter-spacing:.055em!important}
#Hud.CreepyHudR94 .InteractPrompt{border:1px solid rgba(181,130,79,.34)!important;background:rgba(5,6,5,.91)!important;color:#dfd2ba!important;box-shadow:0 0 17px rgba(0,0,0,.44),inset 0 0 12px rgba(130,83,42,.06)!important;letter-spacing:.08em!important;animation:InteractUneaseR94 3.8s ease-in-out infinite}
#Hud.CreepyHudR94 .Crosshair{opacity:.54;animation:CrosshairBreatheR94 4.8s ease-in-out infinite}
#HorrorVignetteR94{position:fixed;inset:0;z-index:38;pointer-events:none;display:none;background:radial-gradient(circle at 50% 48%,transparent 0,transparent 48%,rgba(0,0,0,.08) 70%,rgba(0,0,0,.34) 100%)}#HorrorVignetteR94.Show{display:block}
@keyframes HudClockFlickerR94{0%,94%,96%,100%{opacity:1}95%{opacity:.68}}@keyframes InteractUneaseR94{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.008)}}@keyframes CrosshairBreatheR94{0%,100%{opacity:.46}50%{opacity:.62}}
`;
document.head.appendChild(Style);

const OldVignette = document.getElementById("HorrorVignetteR93");
OldVignette?.remove();
const Vignette = document.createElement("div");
Vignette.id = "HorrorVignetteR94";
document.body.appendChild(Vignette);

function Sync() {
  const Visible = !Hud.classList.contains("Hidden");
  Hud.classList.remove("CreepyHudR93");
  Hud.classList.add("CreepyHudR94");
  Vignette.classList.toggle("Show", Visible);
}

const Observer = new MutationObserver(Sync);
Observer.observe(Hud, { attributes: true, attributeFilter: ["class"] });
Sync();

addEventListener("pagehide", () => Observer.disconnect(), { once: true });
window.__STORE_CREEPY_HUD_R94__ = { Sync };
window.__STORE_CREEPY_HUD_BUILD__ = "V0.30.0-R94";