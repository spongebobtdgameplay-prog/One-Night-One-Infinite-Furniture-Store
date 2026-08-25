const NativeRaf = window.requestAnimationFrame.bind(window);
const NativeCancelRaf = window.cancelAnimationFrame.bind(window);
const NativeSetInterval = window.setInterval.bind(window);
const NativeClearInterval = window.clearInterval.bind(window);
const NativeSetTimeout = window.setTimeout.bind(window);
const NativeClearTimeout = window.clearTimeout.bind(window);
const NativeRic = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback.bind(window) : null;
const NativeCancelRic = typeof window.cancelIdleCallback === "function" ? window.cancelIdleCallback.bind(window) : null;

const CallbackInfo = new WeakMap();
const Stats = new Map();
let Enabled = true;

function SourceFor(Callback, Kind) {
  if (typeof Callback !== "function") return `${Kind}:non-function`;
  const Cached = CallbackInfo.get(Callback);
  if (Cached) return Cached;
  let Source = `${Kind}:${Callback.name || "anonymous"}`;
  try {
    const Stack = String(new Error().stack || "").split("\n");
    const Useful = Stack.find(Line => /\.js(?:\?|:)/.test(Line) && !/runtime-profiler-r114\.js/.test(Line));
    if (Useful) Source += ` @ ${Useful.trim().replace(/^at\s+/, "")}`;
  } catch {}
  CallbackInfo.set(Callback, Source);
  return Source;
}

function Record(Source, Duration) {
  if (!Enabled || !Number.isFinite(Duration)) return;
  let Entry = Stats.get(Source);
  if (!Entry) {
    Entry = { Calls: 0, Total: 0, Max: 0, Over16: 0, Over50: 0 };
    Stats.set(Source, Entry);
  }
  Entry.Calls += 1;
  Entry.Total += Duration;
  Entry.Max = Math.max(Entry.Max, Duration);
  if (Duration >= 16) Entry.Over16 += 1;
  if (Duration >= 50) Entry.Over50 += 1;
}

function Timed(Callback, Source) {
  return function StoreProfiledCallback(...Args) {
    const Start = performance.now();
    try {
      return Callback.apply(this, Args);
    } finally {
      Record(Source, performance.now() - Start);
    }
  };
}

window.requestAnimationFrame = function StoreProfiledRaf(Callback) {
  if (typeof Callback !== "function") return NativeRaf(Callback);
  const Source = SourceFor(Callback, "RAF");
  return NativeRaf(Timed(Callback, Source));
};
window.cancelAnimationFrame = NativeCancelRaf;

window.setInterval = function StoreProfiledInterval(Callback, Delay, ...Args) {
  if (typeof Callback !== "function") return NativeSetInterval(Callback, Delay, ...Args);
  const Source = `${SourceFor(Callback, "INTERVAL")} every ${Number(Delay) || 0}ms`;
  return NativeSetInterval(Timed(Callback, Source), Delay, ...Args);
};
window.clearInterval = NativeClearInterval;

window.setTimeout = function StoreProfiledTimeout(Callback, Delay, ...Args) {
  if (typeof Callback !== "function") return NativeSetTimeout(Callback, Delay, ...Args);
  const Source = `${SourceFor(Callback, "TIMEOUT")} after ${Number(Delay) || 0}ms`;
  return NativeSetTimeout(Timed(Callback, Source), Delay, ...Args);
};
window.clearTimeout = NativeClearTimeout;

if (NativeRic) {
  window.requestIdleCallback = function StoreProfiledIdle(Callback, Options) {
    if (typeof Callback !== "function") return NativeRic(Callback, Options);
    const Source = SourceFor(Callback, "IDLE");
    return NativeRic(Timed(Callback, Source), Options);
  };
  if (NativeCancelRic) window.cancelIdleCallback = NativeCancelRic;
}

const Panel = document.createElement("pre");
Panel.id = "RuntimeProfilerR114";
Object.assign(Panel.style, {
  position: "fixed",
  right: "12px",
  bottom: "12px",
  zIndex: "100000",
  width: "min(560px, calc(100vw - 24px))",
  maxHeight: "38vh",
  overflow: "auto",
  margin: "0",
  padding: "10px 12px",
  border: "1px solid rgba(255,255,255,.32)",
  background: "rgba(7,9,8,.94)",
  color: "#e9dfca",
  font: "600 11px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace",
  whiteSpace: "pre-wrap",
  pointerEvents: "none"
});
Panel.textContent = "PERF TRACE R114\ncollecting measured callback times…";
document.body.appendChild(Panel);

function RenderReport() {
  const Rows = [...Stats.entries()]
    .map(([Source, Entry]) => ({ Source, ...Entry, Average: Entry.Total / Math.max(1, Entry.Calls) }))
    .sort((A, B) => (B.Total - A.Total) || (B.Max - A.Max))
    .slice(0, 8);
  const Lines = ["PERF TRACE R114 — measured, not guessed"];
  if (!Rows.length) Lines.push("No timed callbacks recorded yet.");
  for (const Row of Rows) {
    Lines.push(`${Row.Total.toFixed(0)}ms total | ${Row.Max.toFixed(1)}ms max | ${Row.Average.toFixed(2)}ms avg | ${Row.Calls} calls | >16:${Row.Over16} >50:${Row.Over50}`);
    Lines.push(`  ${Row.Source}`);
  }
  Panel.textContent = Lines.join("\n");
}

const ReportInterval = NativeSetInterval(RenderReport, 2000);
addEventListener("pagehide", () => NativeClearInterval(ReportInterval), { once: true });

window.__STORE_RUNTIME_PROFILER_R114__ = {
  Stats,
  Report() {
    RenderReport();
    return [...Stats.entries()].map(([Source, Entry]) => ({ Source, ...Entry }));
  },
  Clear() { Stats.clear(); RenderReport(); },
  SetEnabled(Value) { Enabled = Boolean(Value); },
  NativeRaf,
  NativeSetInterval,
  NativeSetTimeout
};
window.__STORE_RUNTIME_PROFILER_BUILD__ = "V0.25.1-R114";
