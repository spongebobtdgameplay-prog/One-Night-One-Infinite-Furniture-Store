import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (
  !Game?.Camera ||
  !Game?.Scene ||
  !Game?.ActiveChunks ||
  !Game?.PreparedChunks ||
  !Game?.ChunkIndexForZ
) {
  throw new Error("Game must load before stream loading cover.");
}

const Overlay = document.createElement("div");
Overlay.id = "StreamLoadingCoverR83";
Overlay.setAttribute("aria-hidden", "true");
Overlay.innerHTML = `
  <div class="StreamLoadingInnerR83">
    <strong>DISTANT AISLE FORMING</strong>
    <span>The showroom is hidden in the haze...</span>
    <i></i>
  </div>
`;

Object.assign(Overlay.style, {
  position: "fixed",
  left: "50%",
  bottom: "74px",
  transform: "translateX(-50%)",
  zIndex: "1200",
  opacity: "0",
  visibility: "hidden",
  pointerEvents: "none",
  transition: "opacity 120ms linear"
});

const Style = document.createElement("style");
Style.textContent = `
.StreamLoadingInnerR83{
  min-width:230px;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:6px;
  padding:10px 14px 9px;
  border:1px solid rgba(211,181,120,.22);
  background:rgba(17,19,16,.84);
  box-shadow:0 12px 28px rgba(0,0,0,.24);
  font-family:Arial,sans-serif;
  letter-spacing:.09em;
  text-align:center
}
.StreamLoadingInnerR83 strong{font-size:.70rem;font-weight:900;color:#eee4cf}
.StreamLoadingInnerR83 span{font-size:.53rem;color:#9e9d91;letter-spacing:.06em}
.StreamLoadingInnerR83 i{
  width:118px;
  height:2px;
  margin-top:3px;
  background:linear-gradient(90deg,transparent,#9e9b84,transparent);
  background-size:70% 100%;
  animation:StreamLoadR83 .95s linear infinite
}
@keyframes StreamLoadR83{
  from{background-position:-160px 0}
  to{background-position:160px 0}
}
`;
document.head.appendChild(Style);
document.body.appendChild(Overlay);

const PRIORITY_DISTANCE = 48;
const NOTICE_DISTANCE = 2.75;
const NOTICE_MAX_MS = 2200;
const STRICT_AHEAD = 4;
const STRICT_BEHIND = 2;

let HazeGroup = null;
let HazeChunk = null;
let HazeActive = false;
let OverlayVisible = false;
let NoticeIndex = Number.NaN;
let NoticeStartedAt = -Infinity;
const PriorityFlights = new Map();
const HazeMaterials = [];

function FindChunk(Index) {
  const Active = Game.ActiveChunks.get(Index);
  if (Active) return Active;

  for (const Chunk of Game.PreparedChunks.values()) {
    if (Chunk?.Index === Index && !Chunk.Cancelled) return Chunk;
  }

  return null;
}

function IsTraversalReady(Chunk) {
  return Boolean(
    Chunk?.Ready &&
    !Chunk.Cancelled &&
    (
      Chunk.Group?.userData?.TraversalReadyR83 ||
      Chunk.Group?.userData?.PresentationReadyR83
    )
  );
}

function IsAlreadyVisible(Chunk) {
  if (!Chunk?.Ready || Chunk.Cancelled || !Chunk.Group) return false;
  if (!Chunk.Active) return false;
  if (Game.ActiveChunks.get(Chunk.Index) !== Chunk) return false;
  return Chunk.Group.parent === Game.Scene && Chunk.Group.visible !== false;
}

function CreateHazeTexture() {
  const Canvas = document.createElement("canvas");
  Canvas.width = 128;
  Canvas.height = 64;
  const Context = Canvas.getContext("2d");
  const Image = Context.createImageData(Canvas.width, Canvas.height);

  for (let Y = 0; Y < Canvas.height; Y += 1) {
    for (let X = 0; X < Canvas.width; X += 1) {
      const Index = (Y * Canvas.width + X) * 4;
      const EdgeX = Math.min(1, Math.min(X, Canvas.width - 1 - X) / 11);
      const EdgeY = Math.min(1, Math.min(Y, Canvas.height - 1 - Y) / 7);
      const Edge = 0.52 + 0.48 * Math.min(EdgeX, EdgeY);
      const Noise =
        Math.sin(X * 0.91 + Y * 1.37) * 0.045 +
        Math.sin(X * 0.17 - Y * 0.63) * 0.035;
      const Alpha = THREE.MathUtils.clamp((0.78 + Noise) * Edge, 0.34, 0.88);

      Image.data[Index] = 36;
      Image.data[Index + 1] = 38;
      Image.data[Index + 2] = 31;
      Image.data[Index + 3] = Math.round(Alpha * 255);
    }
  }

  Context.putImageData(Image, 0, 0);
  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  Texture.minFilter = THREE.LinearFilter;
  Texture.magFilter = THREE.LinearFilter;
  Texture.generateMipmaps = false;
  return Texture;
}

function EnsureHaze() {
  if (HazeGroup) return HazeGroup;

  const Texture = CreateHazeTexture();
  HazeGroup = new THREE.Group();
  HazeGroup.name = "StreamDistanceHazeR101";
  HazeGroup.userData.StreamAmbientR101 = true;
  HazeGroup.userData.DecorationNoCollision = true;

  const Layers = [
    { Z: 0.0, Opacity: 0.58, Scale: 1.00 },
    { Z: -1.3, Opacity: 0.42, Scale: 1.02 },
    { Z: -3.0, Opacity: 0.31, Scale: 1.04 },
    { Z: -5.2, Opacity: 0.24, Scale: 1.07 }
  ];

  for (const Layer of Layers) {
    const Material = new THREE.MeshBasicMaterial({
      map: Texture,
      color: 0xffffff,
      transparent: true,
      opacity: Layer.Opacity,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    Material.userData.StreamBaseOpacityR101 = Layer.Opacity;
    HazeMaterials.push(Material);

    const Plane = new THREE.Mesh(
      new THREE.PlaneGeometry(34.6 * Layer.Scale, 3.95 * Layer.Scale),
      Material
    );
    Plane.position.set(0, 1.88, Layer.Z);
    Plane.frustumCulled = true;
    Plane.userData.StreamAmbientR101 = true;
    Plane.userData.DecorationNoCollision = true;
    HazeGroup.add(Plane);
  }

  HazeGroup.visible = false;
  Game.Scene.add(HazeGroup);
  return HazeGroup;
}

function PositionHaze(CurrentChunk) {
  if (!CurrentChunk) return;
  const Group = EnsureHaze();
  if (HazeChunk !== CurrentChunk) {
    HazeChunk = CurrentChunk;
    Group.position.set(0, 0, CurrentChunk.BottomZ - 0.35);
    Group.updateWorldMatrix(true, true);
  }
}

function SetHazeStrength(DistanceToEdge) {
  const Strength = THREE.MathUtils.clamp(
    0.82 + (30 - Math.min(30, DistanceToEdge)) * 0.004,
    0.82,
    0.94
  );

  for (const Material of HazeMaterials) {
    const Base = Number(Material.userData.StreamBaseOpacityR101) || 0.3;
    Material.opacity = Base * Strength;
  }
}

function SetHazeActive(Value, CurrentChunk = null, DistanceToEdge = 30) {
  const Next = Boolean(Value);
  if (Next) {
    PositionHaze(CurrentChunk);
    SetHazeStrength(DistanceToEdge);
    HazeGroup.visible = true;
  } else if (HazeGroup) {
    HazeGroup.visible = false;
  }

  HazeActive = Next;
  window.__STORE_STREAM_LOADING__ = Next;
}

function SetOverlayVisible(Value) {
  const Next = Boolean(Value);
  if (OverlayVisible === Next) return;
  OverlayVisible = Next;
  Overlay.style.opacity = Next ? "1" : "0";
  Overlay.style.visibility = Next ? "visible" : "hidden";
  Overlay.setAttribute("aria-hidden", Next ? "false" : "true");
}

function PrioritizeIndex(Index) {
  if (!Number.isInteger(Index) || Index < 0) return null;

  const Existing = FindChunk(Index);
  if (IsTraversalReady(Existing)) return Promise.resolve(true);
  if (PriorityFlights.has(Index)) return PriorityFlights.get(Index);

  const Source = Existing
    ? Promise.resolve(Existing)
    : Promise.resolve(Game.PrepareChunk?.(Index));

  const Flight = Source
    .then(Chunk => {
      if (!Chunk || Chunk.Cancelled) return false;
      const Presentation = window.__STORE_PRESENTATION_READY_R83__;
      return Presentation?.FinalizeChunk?.(Chunk) ?? false;
    })
    .catch(Error => {
      console.warn(`Strict stream preparation failed for chunk ${Index}`, Error);
      return false;
    })
    .finally(() => {
      PriorityFlights.delete(Index);
    });

  PriorityFlights.set(Index, Flight);
  return Flight;
}

function EnsureStrictBuffer(CurrentIndex) {
  const Order = [];
  for (let Offset = 1; Offset <= STRICT_AHEAD; Offset += 1) {
    Order.push(CurrentIndex + Offset);
  }

  Order.push(CurrentIndex);

  for (let Offset = 1; Offset <= STRICT_BEHIND; Offset += 1) {
    const Index = CurrentIndex - Offset;
    if (Index >= 0) Order.push(Index);
  }

  for (const Index of Order) {
    const Chunk = FindChunk(Index);
    if (!IsTraversalReady(Chunk)) PrioritizeIndex(Index);
  }
}

function Show(CurrentChunk) {
  if (!CurrentChunk) return;
  const DistanceToEdge = Math.max(
    0,
    Game.Camera.position.z - CurrentChunk.BottomZ
  );
  SetHazeActive(true, CurrentChunk, DistanceToEdge);
  SetOverlayVisible(true);
}

function Hide() {
  SetHazeActive(false);
  SetOverlayVisible(false);
  NoticeIndex = Number.NaN;
  NoticeStartedAt = -Infinity;
}

function Tick() {
  const CurrentIndex = Math.max(
    0,
    Game.ChunkIndexForZ(Game.Camera.position.z)
  );
  const Current = Game.ActiveChunks.get(CurrentIndex);

  if (!Current) {
    Hide();
    requestAnimationFrame(Tick);
    return;
  }

  EnsureStrictBuffer(CurrentIndex);

  const NextIndex = CurrentIndex + 1;
  let Next = FindChunk(NextIndex);
  let NextReady = IsTraversalReady(Next);
  let NextVisible = IsAlreadyVisible(Next);

  const DistanceToForwardEdge = Math.max(
    0,
    Game.Camera.position.z - Current.BottomZ
  );

  if (!NextReady && DistanceToForwardEdge <= PRIORITY_DISTANCE) {
    PrioritizeIndex(NextIndex);
  }

  if (NextReady && !NextVisible) {
    Game.TryActivateIndex?.(NextIndex);
    Next = FindChunk(NextIndex);
    NextVisible = IsAlreadyVisible(Next);
  }

  if (NextVisible) {
    if (!NextReady) PrioritizeIndex(NextIndex);
    Hide();
    requestAnimationFrame(Tick);
    return;
  }

  SetHazeActive(true, Current, DistanceToForwardEdge);

  if (DistanceToForwardEdge <= NOTICE_DISTANCE) {
    if (NoticeIndex !== NextIndex) {
      NoticeIndex = NextIndex;
      NoticeStartedAt = performance.now();
    }

    const NoticeAge = performance.now() - NoticeStartedAt;
    SetOverlayVisible(NoticeAge <= NOTICE_MAX_MS);
  } else {
    SetOverlayVisible(false);
    NoticeIndex = Number.NaN;
    NoticeStartedAt = -Infinity;
  }

  requestAnimationFrame(Tick);
}

EnsureHaze();
requestAnimationFrame(Tick);

addEventListener("pagehide", () => {
  SetHazeActive(false);
  SetOverlayVisible(false);
}, { once: true });

window.__STORE_STREAM_LOADING_R83__ = {
  Show,
  Hide,
  PrioritizeNext: PrioritizeIndex,
  PrioritizeIndex,
  EnsureStrictBuffer,
  IsTraversalReady,
  IsAlreadyVisible
};
window.__STORE_STREAM_LOADING_BUILD__ = "V0.35.21-DISTANT-HAZE";
