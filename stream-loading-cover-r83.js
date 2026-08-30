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
    <strong>BUFFERING NEXT AISLE</strong>
    <span>Preparing nearby furniture...</span>
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
  border:1px solid rgba(211,181,120,.28);
  background:rgba(17,19,16,.90);
  box-shadow:0 12px 28px rgba(0,0,0,.28);
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
  background:linear-gradient(90deg,transparent,#d3b578,transparent);
  background-size:70% 100%;
  animation:StreamLoadR83 .85s linear infinite
}
@keyframes StreamLoadR83{
  from{background-position:-160px 0}
  to{background-position:160px 0}
}
`;
document.head.appendChild(Style);
document.body.appendChild(Overlay);

const PRIORITY_DISTANCE = 18;
const GATE_DISTANCE = 4.0;
const NOTICE_DISTANCE = 1.85;
const NOTICE_MAX_MS = 2200;

let Barrier = null;
let BarrierChunk = null;
let GateActive = false;
let OverlayVisible = false;
let NoticeIndex = Number.NaN;
let NoticeStartedAt = -Infinity;
let PriorityIndex = Number.NaN;
let PriorityFlight = null;

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

function RemoveBarrier() {
  if (!Barrier) return;

  if (BarrierChunk?.ExternalObjects) {
    BarrierChunk.ExternalObjects =
      BarrierChunk.ExternalObjects.filter(Object => Object !== Barrier);
  }

  Barrier.parent?.remove(Barrier);
  Barrier.geometry?.dispose?.();

  if (Array.isArray(Barrier.material)) {
    for (const Material of Barrier.material) Material?.dispose?.();
  } else {
    Barrier.material?.dispose?.();
  }

  Barrier = null;
  BarrierChunk = null;
}

function InstallBarrier(CurrentChunk) {
  if (!CurrentChunk) return;
  if (Barrier && BarrierChunk === CurrentChunk) return;

  RemoveBarrier();

  const Material = new THREE.MeshBasicMaterial({
    color: 0x2b2d27,
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide
  });

  Barrier = new THREE.Mesh(
    new THREE.BoxGeometry(33.4, 3.4, 0.14),
    Material
  );

  Barrier.name = "StreamLoadingGateR83";
  Barrier.position.set(0, 1.70, CurrentChunk.BottomZ + 0.02);
  Barrier.userData.ChunkId = CurrentChunk.Id;
  Barrier.userData.StreamLoadingR83 = true;
  Barrier.userData.RayCollisionSolidR35 = true;
  Barrier.frustumCulled = false;

  BarrierChunk = CurrentChunk;
  Game.Scene.add(Barrier);

  if (!Array.isArray(CurrentChunk.ExternalObjects)) {
    CurrentChunk.ExternalObjects = [];
  }
  if (!CurrentChunk.ExternalObjects.includes(Barrier)) {
    CurrentChunk.ExternalObjects.push(Barrier);
  }

  Barrier.updateWorldMatrix(true, true);
}

function SetOverlayVisible(Value) {
  const Next = Boolean(Value);
  if (OverlayVisible === Next) return;
  OverlayVisible = Next;

  Overlay.style.opacity = Next ? "1" : "0";
  Overlay.style.visibility = Next ? "visible" : "hidden";
  Overlay.setAttribute("aria-hidden", Next ? "false" : "true");
}

function SetGateActive(Value, CurrentChunk = null) {
  const Next = Boolean(Value);

  if (Next) {
    InstallBarrier(CurrentChunk);
  } else {
    RemoveBarrier();
    SetOverlayVisible(false);
  }

  GateActive = Next;
  window.__STORE_STREAM_LOADING__ = Next;
}

function PrioritizeNext(Index) {
  if (!Number.isInteger(Index)) return;
  if (PriorityFlight && PriorityIndex === Index) return;

  const Existing = FindChunk(Index);
  if (IsTraversalReady(Existing)) return;

  PriorityIndex = Index;

  const Source = Existing
    ? Promise.resolve(Existing)
    : Promise.resolve(Game.PrepareChunk?.(Index));

  PriorityFlight = Source
    .then(Chunk => {
      if (!Chunk || Chunk.Cancelled) return false;
      const Presentation = window.__STORE_PRESENTATION_READY_R83__;
      return Presentation?.FinalizeChunk?.(Chunk) ?? false;
    })
    .catch(Error => {
      console.warn(`Priority stream preparation failed for chunk ${Index}`, Error);
      return false;
    })
    .finally(() => {
      PriorityFlight = null;
      PriorityIndex = Number.NaN;
    });
}

function Show(CurrentChunk) {
  SetGateActive(true, CurrentChunk);
  SetOverlayVisible(true);
}

function Hide() {
  SetGateActive(false);
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

  const NextIndex = CurrentIndex + 1;
  const Next = FindChunk(NextIndex);
  const NextReady = IsTraversalReady(Next);

  const DistanceToForwardEdge = Math.max(
    0,
    Game.Camera.position.z - Current.BottomZ
  );

  if (!NextReady && DistanceToForwardEdge <= PRIORITY_DISTANCE) {
    PrioritizeNext(NextIndex);
  }

  if (NextReady) {
    Hide();
    requestAnimationFrame(Tick);
    return;
  }

  const ShouldGate = DistanceToForwardEdge <= GATE_DISTANCE;
  SetGateActive(ShouldGate, Current);

  if (ShouldGate && DistanceToForwardEdge <= NOTICE_DISTANCE) {
    if (NoticeIndex !== NextIndex) {
      NoticeIndex = NextIndex;
      NoticeStartedAt = performance.now();
    }

    const NoticeAge = performance.now() - NoticeStartedAt;
    SetOverlayVisible(NoticeAge <= NOTICE_MAX_MS);
  } else {
    SetOverlayVisible(false);

    // Leaving the frontier lets the short notice show again next approach.
    if (DistanceToForwardEdge > NOTICE_DISTANCE + 1.0) {
      NoticeIndex = Number.NaN;
      NoticeStartedAt = -Infinity;
    }
  }

  requestAnimationFrame(Tick);
}

requestAnimationFrame(Tick);

addEventListener("pagehide", () => {
  RemoveBarrier();
  SetOverlayVisible(false);
}, { once: true });

window.__STORE_STREAM_LOADING_R83__ = {
  Show,
  Hide,
  PrioritizeNext,
  IsTraversalReady
};
window.__STORE_STREAM_LOADING_BUILD__ = "V0.35.15-FRONTIER";
