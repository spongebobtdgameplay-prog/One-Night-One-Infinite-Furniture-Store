import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Camera || !Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.CollisionBoxes || !Game?.ChunkIndexForZ) {
  throw new Error("Game must load before stream loading cover.");
}

const Overlay = document.createElement("div");
Overlay.id = "StreamLoadingCoverR83";
Overlay.setAttribute("aria-hidden", "true");
Overlay.innerHTML = `<div class="StreamLoadingInnerR83"><strong>LOADING NEXT AISLE</strong><span>Finishing the showroom...</span><i></i></div>`;
Object.assign(Overlay.style, {
  position: "fixed",
  inset: "0",
  zIndex: "1200",
  display: "grid",
  placeItems: "center",
  background: "#171914",
  color: "#eee4cf",
  opacity: "0",
  visibility: "hidden",
  pointerEvents: "none",
  transition: "opacity 110ms linear"
});
const Style = document.createElement("style");
Style.textContent = `
.StreamLoadingInnerR83{display:flex;flex-direction:column;align-items:center;gap:10px;font-family:Arial,sans-serif;letter-spacing:.10em;text-align:center}
.StreamLoadingInnerR83 strong{font-size:.82rem;font-weight:900}.StreamLoadingInnerR83 span{font-size:.59rem;color:#9e9d91;letter-spacing:.07em}
.StreamLoadingInnerR83 i{width:132px;height:3px;margin-top:8px;background:linear-gradient(90deg,transparent,#d3b578,transparent);background-size:70% 100%;animation:StreamLoadR83 .85s linear infinite}
@keyframes StreamLoadR83{from{background-position:-180px 0}to{background-position:180px 0}}
`;
document.head.appendChild(Style);
document.body.appendChild(Overlay);

let Visible = false;
let Barrier = null;

function FindChunk(Index) {
  const Active = Game.ActiveChunks.get(Index);
  if (Active) return Active;
  for (const Chunk of Game.PreparedChunks.values()) if (Chunk?.Index === Index) return Chunk;
  return null;
}

function RemoveBarrier() {
  if (!Barrier) return;
  const Index = Game.CollisionBoxes.indexOf(Barrier);
  if (Index >= 0) Game.CollisionBoxes.splice(Index, 1);
  Barrier = null;
}

function InstallBarrier(CurrentChunk) {
  if (!CurrentChunk || Barrier?.ChunkId === CurrentChunk.Id) return;
  RemoveBarrier();
  const Z = CurrentChunk.BottomZ + 0.02;
  const Box = new THREE.Box3(new THREE.Vector3(-16.7, 0, Z - 0.08), new THREE.Vector3(16.7, 3.3, Z + 0.08));
  Barrier = {
    Box,
    OriginalBox: Box.clone(),
    ChunkId: CurrentChunk.Id,
    Type: "StreamLoadingGateR83",
    Active: true,
    StreamLoadingR83: true
  };
  Game.CollisionBoxes.push(Barrier);
}

function Show(CurrentChunk) {
  InstallBarrier(CurrentChunk);
  if (Visible) return;
  Visible = true;
  window.__STORE_STREAM_LOADING__ = true;
  window.dispatchEvent(new Event("blur"));
  Overlay.style.visibility = "visible";
  Overlay.style.opacity = "1";
  Overlay.setAttribute("aria-hidden", "false");
}

function Hide() {
  RemoveBarrier();
  if (!Visible) return;
  Visible = false;
  window.__STORE_STREAM_LOADING__ = false;
  Overlay.style.opacity = "0";
  Overlay.setAttribute("aria-hidden", "true");
  setTimeout(() => {
    if (!Visible) Overlay.style.visibility = "hidden";
  }, 120);
}

const BlockedKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "KeyE", "Space"]);
addEventListener("keydown", Event => {
  if (!Visible || !BlockedKeys.has(Event.code)) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();
}, true);
addEventListener("keyup", Event => {
  if (!Visible || !BlockedKeys.has(Event.code)) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();
}, true);

function Tick() {
  const CurrentIndex = Game.ChunkIndexForZ(Game.Camera.position.z);
  const Current = Game.ActiveChunks.get(CurrentIndex);
  const Next = FindChunk(CurrentIndex + 1);
  if (!Current) {
    Hide();
    requestAnimationFrame(Tick);
    return;
  }

  const DistanceToForwardEdge = Math.max(0, Game.Camera.position.z - Current.BottomZ);
  const NextReady = Boolean(Next?.Active || Next?.Group?.userData?.PresentationReadyR83);
  if (DistanceToForwardEdge <= 6.5 && !NextReady) Show(Current);
  else Hide();
  requestAnimationFrame(Tick);
}

requestAnimationFrame(Tick);
addEventListener("pagehide", RemoveBarrier, { once: true });

window.__STORE_STREAM_LOADING_R83__ = { Show, Hide };
window.__STORE_STREAM_LOADING_BUILD__ = "V0.22.0-R83";