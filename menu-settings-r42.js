const StorageKey = "InfiniteFurnitureStoreSettingsV2";
const Defaults = {
  Sensitivity: 0.92,
  TrackpadSmoothing: 64,
  Fov: 70,
  Graphics: "balanced",
  AmbientVolume: 0.24,
  ShowFps: true
};

function Clamp(Value, Min, Max) {
  return Math.min(Max, Math.max(Min, Number(Value) || 0));
}

function LoadSettings() {
  let Saved = {};
  try {
    Saved = JSON.parse(localStorage.getItem(StorageKey) || "{}") || {};
  } catch {}
  return {
    Sensitivity: Clamp(Saved.Sensitivity ?? Defaults.Sensitivity, 0.35, 2.0),
    TrackpadSmoothing: Clamp(Saved.TrackpadSmoothing ?? Defaults.TrackpadSmoothing, 0, 100),
    Fov: Clamp(Saved.Fov ?? Defaults.Fov, 58, 100),
    Graphics: ["performance", "balanced", "high"].includes(Saved.Graphics) ? Saved.Graphics : Defaults.Graphics,
    AmbientVolume: Clamp(Saved.AmbientVolume ?? Defaults.AmbientVolume, 0, 1),
    ShowFps: Saved.ShowFps === undefined ? Defaults.ShowFps : Boolean(Saved.ShowFps)
  };
}

const Settings = LoadSettings();
window.__STORE_USER_SETTINGS__ = Settings;

function SaveSettings() {
  try { localStorage.setItem(StorageKey, JSON.stringify(Settings)); } catch {}
  window.dispatchEvent(new CustomEvent("store-settings-change", { detail: { ...Settings } }));
}

function Icon(Path) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${Path}"/></svg>`;
}

function BuildMenu() {
  const Card = document.querySelector(".BootCard");
  const StartButton = document.getElementById("StartButton");
  const BootStatus = document.getElementById("BootStatus");
  const BuildVersion = document.getElementById("BuildVersion");
  if (!Card || !StartButton || !BootStatus || !BuildVersion || Card.dataset.R42Built) return;

  Card.dataset.R42Built = "1";
  Card.className = "BootCard R42Menu";
  StartButton.remove();
  BootStatus.remove();
  BuildVersion.remove();

  const Hero = document.createElement("section");
  Hero.className = "R42Panel R42Hero";
  Hero.innerHTML = `
    <p class="R42Kicker">GREAT OLD GAMES</p>
    <h1 class="R42Title">ONE NIGHT,<br>ONE INFINITE<br>FURNITURE STORE</h1>
    <p class="R42Subtitle">The doors are locked. The aisles keep changing. Make it until morning.</p>
    <div class="R42Actions" id="R42Actions"></div>
    <svg class="R42Vector" viewBox="0 0 420 280" aria-hidden="true">
      <rect x="22" y="44" width="376" height="192" rx="2"/>
      <line x1="22" y1="92" x2="398" y2="92"/>
      <line x1="22" y1="188" x2="398" y2="188"/>
      <line x1="104" y1="44" x2="104" y2="236"/>
      <line x1="314" y1="44" x2="314" y2="236"/>
      <polyline points="128,120 165,120 165,146 128,146 128,120"/>
      <polyline points="244,116 288,116 288,150 244,150 244,116"/>
      <polyline points="127,198 171,198 171,220 127,220 127,198"/>
      <polyline points="244,198 290,198 290,220 244,220 244,198"/>
      <line x1="210" y1="92" x2="210" y2="188"/>
    </svg>`;

  const Side = document.createElement("aside");
  Side.className = "R42Panel R42Side";
  Side.innerHTML = `
    <div class="R42SideTop"><span class="R42SideLabel">STORE SYSTEM</span><span class="R42Seed" id="R42Seed">SEED ----</span></div>
    <div class="R42MiniStats">
      <div class="R42MiniCard"><span>WORLD</span><strong>DETERMINISTIC</strong></div>
      <div class="R42MiniCard"><span>STREAMING</span><strong>7 ROOMS</strong></div>
    </div>`;

  const Actions = Hero.querySelector("#R42Actions");
  StartButton.className = "R42Button R42Primary";
  StartButton.innerHTML = `${Icon("M8 5l10 7-10 7V5z")}<span>ENTER STORE</span>`;
  Actions.appendChild(StartButton);

  const SettingsButton = document.createElement("button");
  SettingsButton.type = "button";
  SettingsButton.className = "R42Button";
  SettingsButton.innerHTML = `${Icon("M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M18.4 5.6l-2.1 2.1m-8.6 8.6-2.1 2.1M12 8.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7z")}<span>SETTINGS</span>`;
  Actions.appendChild(SettingsButton);

  BootStatus.className = "R42Status";
  BootStatus.innerHTML = `<span class="R42BootPulse"></span>${BootStatus.textContent || "Preparing store..."}`;
  BuildVersion.className = "R42Build";
  Side.appendChild(BootStatus);
  Side.appendChild(BuildVersion);

  Card.replaceChildren(Hero, Side);
  SettingsButton.addEventListener("click", () => OpenSettings(true));

  const RefreshSeed = () => {
    const Seed = window.__STORE_WORLD_SEED__;
    const Node = document.getElementById("R42Seed");
    if (Node) Node.textContent = Number.isFinite(Seed) ? `SEED ${Seed >>> 0}` : "SEED ----";
  };
  RefreshSeed();
  setTimeout(RefreshSeed, 0);
}

function SettingRow(Title, Control, Description, Wide = false) {
  const Row = document.createElement("div");
  Row.className = `R42Setting${Wide ? " R42SettingWide" : ""}`;
  const Top = document.createElement("div");
  Top.className = "R42SettingTop";
  const Label = document.createElement("label");
  Label.textContent = Title;
  Top.append(Label, Control.Output || document.createElement("span"));
  Row.append(Top, Control.Element);
  if (Control.Ticks) Row.appendChild(Control.Ticks);
  const Text = document.createElement("p");
  Text.textContent = Description;
  Row.appendChild(Text);
  return Row;
}

function RangeControl(Min, Max, Step, Value, Format, OnChange) {
  const Element = document.createElement("input");
  Element.type = "range";
  Element.min = String(Min);
  Element.max = String(Max);
  Element.step = String(Step);
  Element.value = String(Value);
  const Output = document.createElement("output");
  const Update = () => {
    const NumberValue = Number(Element.value);
    Output.textContent = Format(NumberValue);
    OnChange(NumberValue);
  };
  Element.addEventListener("input", Update);
  Update();
  return { Element, Output };
}

function BuildSettingsOverlay() {
  if (document.getElementById("SettingsOverlayR42")) return;
  const Overlay = document.createElement("section");
  Overlay.id = "SettingsOverlayR42";
  Overlay.className = "R42SettingsOverlay";
  Overlay.setAttribute("aria-hidden", "true");

  const Panel = document.createElement("div");
  Panel.className = "R42SettingsPanel";
  Panel.setAttribute("role", "dialog");
  Panel.setAttribute("aria-modal", "true");
  Panel.setAttribute("aria-labelledby", "R42SettingsTitle");

  const Head = document.createElement("div");
  Head.className = "R42SettingsHead";
  Head.innerHTML = `<h2 id="R42SettingsTitle">SETTINGS</h2>`;
  const Close = document.createElement("button");
  Close.type = "button";
  Close.className = "R42Close";
  Close.setAttribute("aria-label", "Close settings");
  Close.textContent = "×";
  Head.appendChild(Close);

  const Body = document.createElement("div");
  Body.className = "R42SettingsBody";

  const Sensitivity = RangeControl(0.35, 2, 0.05, Settings.Sensitivity, Value => `${Value.toFixed(2)}×`, Value => { Settings.Sensitivity = Value; SaveSettings(); });
  Body.appendChild(SettingRow("LOOK SENSITIVITY", Sensitivity, "Controls first-person mouse sensitivity and third-person RMB orbit speed."));

  const Smoothing = RangeControl(0, 100, 1, Settings.TrackpadSmoothing, Value => `${Math.round(Value)}%`, Value => { Settings.TrackpadSmoothing = Value; SaveSettings(); });
  Body.appendChild(SettingRow("TRACKPAD SMOOTHING", Smoothing, "Filters tiny touchpad jumps while keeping the camera responsive."));

  const Fov = RangeControl(58, 100, 1, Settings.Fov, Value => `${Math.round(Value)}°`, Value => { Settings.Fov = Value; SaveSettings(); });
  Body.appendChild(SettingRow("FIELD OF VIEW", Fov, "Changes the gameplay camera FOV without changing character movement."));

  const GraphicsSelect = document.createElement("select");
  for (const [Value, Label] of [["performance", "PERFORMANCE"], ["balanced", "BALANCED"], ["high", "HIGH"]]) {
    const Option = document.createElement("option");
    Option.value = Value;
    Option.textContent = Label;
    GraphicsSelect.appendChild(Option);
  }
  GraphicsSelect.value = Settings.Graphics;
  GraphicsSelect.addEventListener("change", () => { Settings.Graphics = GraphicsSelect.value; SaveSettings(); });
  Body.appendChild(SettingRow("GRAPHICS", { Element: GraphicsSelect }, "Changes renderer resolution budget, light budget and texture filtering. Furniture and collision density stay unchanged."));

  const Ambient = RangeControl(0, 1, 0.01, Settings.AmbientVolume, Value => `${Math.round(Value * 100)}%`, Value => { Settings.AmbientVolume = Value; SaveSettings(); UpdateAmbientGain(); });
  Body.appendChild(SettingRow("STORE AMBIENT", Ambient, "HVAC and electrical room tone. Starts only after entering the store."));

  const ToggleWrap = document.createElement("label");
  ToggleWrap.className = "R42Toggle";
  const ToggleText = document.createElement("span");
  ToggleText.textContent = Settings.ShowFps ? "VISIBLE" : "HIDDEN";
  const Toggle = document.createElement("input");
  Toggle.type = "checkbox";
  Toggle.checked = Settings.ShowFps;
  Toggle.addEventListener("change", () => {
    Settings.ShowFps = Toggle.checked;
    ToggleText.textContent = Settings.ShowFps ? "VISIBLE" : "HIDDEN";
    SaveSettings();
  });
  ToggleWrap.append(ToggleText, Toggle);
  Body.appendChild(SettingRow("FPS COUNTER", { Element: ToggleWrap }, "Shows measured frames per second and moving-average frame time."));

  const Foot = document.createElement("div");
  Foot.className = "R42SettingsFoot";
  const Reset = document.createElement("button");
  Reset.type = "button";
  Reset.className = "R42Button";
  Reset.textContent = "RESET DEFAULTS";
  Reset.addEventListener("click", () => {
    Object.assign(Settings, Defaults);
    SaveSettings();
    location.reload();
  });
  const Done = document.createElement("button");
  Done.type = "button";
  Done.className = "R42Button R42Primary";
  Done.textContent = "DONE";
  Done.addEventListener("click", () => OpenSettings(false));
  Foot.append(Reset, Done);

  Panel.append(Head, Body, Foot);
  Overlay.appendChild(Panel);
  document.body.appendChild(Overlay);
  Close.addEventListener("click", () => OpenSettings(false));
  Overlay.addEventListener("mousedown", Event => { if (Event.target === Overlay) OpenSettings(false); });
}

function OpenSettings(Open) {
  const Overlay = document.getElementById("SettingsOverlayR42");
  if (!Overlay) return;
  Overlay.classList.toggle("Open", Boolean(Open));
  Overlay.setAttribute("aria-hidden", Open ? "false" : "true");
}

let Ambient = null;
function StartAmbient() {
  if (Ambient) return;
  const ContextClass = window.AudioContext || window.webkitAudioContext;
  if (!ContextClass) return;
  const Context = new ContextClass();
  const Master = Context.createGain();
  Master.gain.value = 0.016 * Settings.AmbientVolume;
  Master.connect(Context.destination);

  const Filter = Context.createBiquadFilter();
  Filter.type = "lowpass";
  Filter.frequency.value = 240;
  Filter.Q.value = 0.55;
  Filter.connect(Master);

  const A = Context.createOscillator();
  const AGain = Context.createGain();
  A.type = "sine";
  A.frequency.value = 57.5;
  AGain.gain.value = 0.78;
  A.connect(AGain).connect(Filter);

  const B = Context.createOscillator();
  const BGain = Context.createGain();
  B.type = "triangle";
  B.frequency.value = 115;
  BGain.gain.value = 0.11;
  B.connect(BGain).connect(Filter);

  const Lfo = Context.createOscillator();
  const LfoGain = Context.createGain();
  Lfo.type = "sine";
  Lfo.frequency.value = 0.07;
  LfoGain.gain.value = 5.5;
  Lfo.connect(LfoGain).connect(Filter.frequency);

  A.start();
  B.start();
  Lfo.start();
  Context.resume().catch(() => {});
  Ambient = { Context, Master, A, B, Lfo };
  window.__STORE_AMBIENT_AUDIO__ = Ambient;
}

function UpdateAmbientGain() {
  if (!Ambient) return;
  Ambient.Master.gain.setTargetAtTime(0.016 * Settings.AmbientVolume, Ambient.Context.currentTime, 0.04);
}

BuildMenu();
BuildSettingsOverlay();
document.getElementById("StartButton")?.addEventListener("click", StartAmbient, { once: true });
window.__STORE_MENU_SETTINGS_BUILD__ = "V0.11-R42";
