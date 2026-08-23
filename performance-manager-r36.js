const Game = window.__STORE_GAME__;
if (!Game?.Renderer) throw new Error("Game must load before R36 performance manager.");

const State = {
  LastTime: performance.now(),
  AverageFrameMs: 16.7,
  LastAdjust: performance.now(),
  StableSince: performance.now(),
  PixelRatio: Math.min(devicePixelRatio || 1, 1)
};

function BaseCap() {
  if (innerWidth < 700 || innerHeight < 500) return 0.82;
  if (innerWidth < 1000 || innerHeight < 650) return 0.92;
  return 1.0;
}

function ApplyRatio(Ratio) {
  const Cap = Math.min(devicePixelRatio || 1, BaseCap());
  const Next = Math.max(0.65, Math.min(Cap, Ratio));
  if (Math.abs(Next - State.PixelRatio) < 0.035) return;
  State.PixelRatio = Next;
  Game.Renderer.setPixelRatio(Next);
  Game.Renderer.setSize(innerWidth, innerHeight, false);
}

function Sample(Now) {
  const FrameMs = Math.min(100, Math.max(1, Now - State.LastTime));
  State.LastTime = Now;
  State.AverageFrameMs = State.AverageFrameMs * 0.94 + FrameMs * 0.06;

  if (Now - State.LastAdjust > 900) {
    State.LastAdjust = Now;

    if (State.AverageFrameMs > 30) {
      ApplyRatio(State.PixelRatio - 0.14);
      State.StableSince = Now;
    } else if (State.AverageFrameMs > 23) {
      ApplyRatio(State.PixelRatio - 0.08);
      State.StableSince = Now;
    } else if (State.AverageFrameMs < 18.2) {
      if (Now - State.StableSince > 3500) {
        ApplyRatio(State.PixelRatio + 0.05);
        State.StableSince = Now;
      }
    } else {
      State.StableSince = Now;
    }
  }

  requestAnimationFrame(Sample);
}

ApplyRatio(State.PixelRatio);
requestAnimationFrame(Sample);

addEventListener("resize", () => ApplyRatio(State.PixelRatio));
window.__STORE_PERFORMANCE_BUILD__ = "V0.11-R36";
