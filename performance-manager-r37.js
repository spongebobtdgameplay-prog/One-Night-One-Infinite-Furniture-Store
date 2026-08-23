const Game = window.__STORE_GAME__;
if (!Game?.Renderer) throw new Error("Game must load before R37 performance manager.");

const FIXED_PIXEL_RATIO = Math.min(devicePixelRatio || 1, 1.0);
const State = {
  LastTime: performance.now(),
  AverageFrameMs: 16.7,
  Fps: 60
};

function ApplyResolution() {
  Game.Renderer.setPixelRatio(FIXED_PIXEL_RATIO);
  Game.Renderer.setSize(innerWidth, innerHeight, false);
}

function Sample(Now) {
  const FrameMs = Math.min(100, Math.max(1, Now - State.LastTime));
  State.LastTime = Now;
  State.AverageFrameMs = State.AverageFrameMs * 0.92 + FrameMs * 0.08;
  State.Fps = Math.round(1000 / Math.max(1, State.AverageFrameMs));
  window.__STORE_PERFORMANCE_STATS__ = {
    Fps: State.Fps,
    FrameMs: Number(State.AverageFrameMs.toFixed(2)),
    PixelRatio: FIXED_PIXEL_RATIO
  };
  requestAnimationFrame(Sample);
}

ApplyResolution();
requestAnimationFrame(Sample);
addEventListener("resize", ApplyResolution);

window.__STORE_PERFORMANCE_BUILD__ = "V0.11-R37";
