const State = { LastWidth: 0, LastHeight: 0, LastRatio: 0 };

function GetGame() {
  return window.__STORE_GAME__ || null;
}

function TargetPixelRatio() {
  const Small = innerWidth < 900 || innerHeight < 620;
  const VerySmall = innerWidth < 560 || innerHeight < 430;
  if (VerySmall) return Math.min(devicePixelRatio || 1, 0.82);
  if (Small) return Math.min(devicePixelRatio || 1, 0.92);
  return Math.min(devicePixelRatio || 1, 1.0);
}

function ApplyRendererBudget() {
  const Game = GetGame();
  if (!Game?.Renderer) return;
  const Ratio = TargetPixelRatio();
  if (State.LastWidth === innerWidth && State.LastHeight === innerHeight && Math.abs(State.LastRatio - Ratio) < 0.001) return;
  State.LastWidth = innerWidth;
  State.LastHeight = innerHeight;
  State.LastRatio = Ratio;
  Game.Renderer.setPixelRatio(Ratio);
  Game.Renderer.setSize(innerWidth, innerHeight, false);
  Game.Renderer.setScissorTest(false);
  Game.Renderer.setViewport(0, 0, innerWidth, innerHeight);
}

function CullPointLights() {
  const Game = GetGame();
  if (!Game?.Scene || !Game?.Camera) return;
  const Lights = [];
  Game.Scene.traverse(Object => {
    if (!Object.isPointLight) return;
    const Position = Object.userData.StoreLightPosition ||= Object.position.clone();
    Object.getWorldPosition(Position);
    Lights.push({ Object, Distance: Position.distanceToSquared(Game.Camera.position) });
  });
  Lights.sort((A, B) => A.Distance - B.Distance);
  const Limit = innerWidth < 900 || innerHeight < 620 ? 4 : 6;
  for (let Index = 0; Index < Lights.length; Index += 1) Lights[Index].Object.visible = Index < Limit;
}

function Tick() {
  ApplyRendererBudget();
  CullPointLights();
}

addEventListener("resize", Tick);
setInterval(Tick, 250);
setTimeout(Tick, 0);
window.__STORE_PERFORMANCE_BUILD__ = "V0.11-R7";
