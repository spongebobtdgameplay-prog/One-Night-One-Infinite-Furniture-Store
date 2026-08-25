import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.Camera || !Game?.Renderer || !Game?.ActiveChunks || !Game?.PreparedChunks) {
  throw new Error("Game must load before runtime performance buffer.");
}

const Candidates = [];
const CandidateSet = new WeakSet();
const RootStamps = new WeakMap();
const SceneChildren = new WeakSet();
const TempWorld = new THREE.Vector3();
const CameraPosition = Game.Camera.position;
const TARGET_PIXEL_RATIO = Math.min(devicePixelRatio || 1, 1.0);
const CULL_BATCH = 24;
let CandidateCursor = 0;
let LastCompaction = performance.now();

function IsUiOpen() {
  return Boolean(window.__STORE_UI_MODAL_OPEN_R96__ || window.__STORE_UI_MODAL_OPEN_R95__);
}

function RegisterObject(Object) {
  if (!Object || CandidateSet.has(Object)) return;
  const IsText = Boolean(Object.userData?.Text3DR73 || Object.userData?.DistanceCullR94);
  const IsLight = Boolean(Object.isPointLight || Object.userData?.PointLightR94 || Object.userData?.LightGlowR94 || Object.userData?.LightHousingR94);
  if (!IsText && !IsLight) return;
  CandidateSet.add(Object);
  Candidates.push(Object);
  if (Object.isPointLight && !Number.isFinite(Object.userData.RuntimeBaseIntensityR94)) {
    Object.userData.RuntimeBaseIntensityR94 = Number(Object.userData.BaseIntensity ?? Object.intensity ?? 1.5);
  }
}

function RootStamp(Root) {
  return `${Root?.children?.length || 0}:${Root?.userData?.CoreFixR87 ? 1 : 0}:${Root?.userData?.PresentationReadyR83 ? 1 : 0}`;
}

function ScanRoot(Root, Force = false) {
  if (!Root?.traverse) return;
  const Stamp = RootStamp(Root);
  if (!Force && RootStamps.get(Root) === Stamp) return;
  RootStamps.set(Root, Stamp);
  Root.traverse(RegisterObject);
}

function ScanSceneChildren() {
  for (const Child of Game.Scene.children) {
    if (!Child || SceneChildren.has(Child)) continue;
    SceneChildren.add(Child);
    ScanRoot(Child, true);
  }
}

function ScanNewRoots(Force = false) {
  if (IsUiOpen() && !Force) return;
  ScanSceneChildren();
  for (const Chunk of Game.ActiveChunks.values()) ScanRoot(Chunk?.Group, Force);
  for (const Chunk of Game.PreparedChunks.values()) ScanRoot(Chunk?.Group, Force);
}

function DistanceLimit(Object) {
  if (Object.isPointLight || Object.userData?.PointLightR94) return 34;
  if (Object.userData?.LightGlowR94) return 56;
  if (Object.userData?.LightHousingR94) return 82;
  if (/Department|Hanging|Overhead/i.test(String(Object.parent?.name || ""))) return 68;
  return Number(Object.userData?.DistanceCullR94) || 48;
}

function SetCandidateVisible(Object, Visible) {
  if (!Object) return;
  if (Object.isPointLight) {
    const Base = Number.isFinite(Object.userData?.BaseIntensity)
      ? Number(Object.userData.BaseIntensity)
      : Number(Object.userData.RuntimeBaseIntensityR94 ?? 1.5);
    Object.userData.RuntimeBaseIntensityR94 = Base;
    Object.intensity = Visible ? Base : 0;
    Object.visible = Visible && Base > 0.0001;
    return;
  }
  Object.visible = Visible;
}

function CullSlice() {
  if (IsUiOpen() || document.hidden || !Candidates.length) return;
  const Count = Math.min(CULL_BATCH, Candidates.length);
  for (let Offset = 0; Offset < Count; Offset += 1) {
    if (CandidateCursor >= Candidates.length) CandidateCursor = 0;
    const Object = Candidates[CandidateCursor++];
    if (!Object?.parent) continue;
    Object.getWorldPosition(TempWorld);
    const Limit = DistanceLimit(Object);
    const DX = TempWorld.x - CameraPosition.x;
    const DY = TempWorld.y - CameraPosition.y;
    const DZ = TempWorld.z - CameraPosition.z;
    SetCandidateVisible(Object, DX * DX + DY * DY + DZ * DZ <= Limit * Limit);
  }
}

function CompactCandidates() {
  const Now = performance.now();
  if (Now - LastCompaction < 30000) return;
  LastCompaction = Now;
  let Write = 0;
  for (let Read = 0; Read < Candidates.length; Read += 1) {
    const Object = Candidates[Read];
    if (!Object?.parent) continue;
    Candidates[Write++] = Object;
  }
  Candidates.length = Write;
  if (CandidateCursor >= Candidates.length) CandidateCursor = 0;
}

Game.Renderer.setPixelRatio(Math.min(Game.Renderer.getPixelRatio(), TARGET_PIXEL_RATIO));
ScanNewRoots(true);

const CullTimer = setInterval(() => {
  CullSlice();
  CompactCandidates();
}, 150);
const DiscoveryTimer = setInterval(() => ScanNewRoots(false), 2200);
addEventListener("store-ui-performance-state", Event => {
  if (!Event.detail?.open) setTimeout(() => ScanNewRoots(false), 0);
});
addEventListener("pagehide", () => {
  clearInterval(CullTimer);
  clearInterval(DiscoveryTimer);
}, { once: true });

window.__STORE_PERFORMANCE_BUFFER_R94__ = {
  ScanNewRoots,
  RegisterObject,
  GetCandidateCount: () => Candidates.length,
  GetPixelRatio: () => Game.Renderer.getPixelRatio()
};
window.__STORE_PERFORMANCE_BUFFER_BUILD__ = "V0.30.2-R96";