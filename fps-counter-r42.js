const Counter = document.createElement("div");
Counter.id = "FpsCounterR42";
Counter.innerHTML = `FPS <strong>--</strong> <span>-- ms</span>`;
document.body.appendChild(Counter);

const Samples = [];
let Last = performance.now();
let LastPaint = 0;

function Settings() {
  return window.__STORE_USER_SETTINGS__ || { ShowFps: true };
}

function ApplyVisibility() {
  Counter.classList.toggle("HiddenBySetting", !Settings().ShowFps);
}

function Frame(Now) {
  const Delta = Now - Last;
  Last = Now;
  if (Delta > 0 && Delta < 250) Samples.push(Delta);
  while (Samples.length > 90) Samples.shift();

  if (Now - LastPaint >= 350 && Samples.length) {
    LastPaint = Now;
    let Sum = 0;
    for (const Sample of Samples) Sum += Sample;
    const Average = Sum / Samples.length;
    const Fps = Math.round(1000 / Average);
    Counter.innerHTML = `FPS <strong>${Fps}</strong> <span>${Average.toFixed(1)} ms</span>`;
  }

  requestAnimationFrame(Frame);
}

addEventListener("store-settings-change", ApplyVisibility);
ApplyVisibility();
requestAnimationFrame(Frame);
window.__STORE_FPS_COUNTER_BUILD__ = "V0.11-R42";
