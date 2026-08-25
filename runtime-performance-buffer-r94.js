import * as THREE from "three";

const Game = window.__STORE_GAME__;
if (!Game?.Scene || !Game?.Camera || !Game?.Renderer || !Game?.ActiveChunks || !Game?.PreparedChunks) {
  throw new Error("Game must load before runtime performance buffer.");
}

const RootChildCounts = new WeakMap();
const Candidates = [];
const CandidateSet = new WeakSet();
const TempWorld = new THREE.Vector3();
const CameraPosition = Game.Camera.position;
const TARGET_PIXEL_RATIO = Math.min(devicePixelRatio || 1, 1.0);
const MIN_PIXEL_RATIO = 0.70;
const CULL_BATCH = 34;
let CandidateCursor = 0;
let LastCullAt = 0;
let LastFrameAt = performance.now();
let FrameAccumulator = 0;
let FrameSamples = 0;
let LastQualityChangeAt = -Infinity;
let LastDiscoveryAt = -Infinity;
let DiscoveryScheduled = false;

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

function ScanRoot(Root, Force = false) {
  if (!Root?.traverse) return;
  const ChildCount = Root.children?.length || 0;
  if (!Force && RootChildCounts.get(Root) === ChildCount) return;
  RootChildCounts.set(Root, ChildCount);
  Root.traverse(RegisterObject);
}

function ScanNewRoots() {
  ScanRoot(Game.Scene);
  for (const Chunk of Game.ActiveChunks.values()) ScanRoot(Chunk?.Group);
  for (const Chunk of Game.PreparedChunks.values()) ScanRoot(Chunk?.Group);
  LastDiscoveryAt = performance.now();
  DiscoveryScheduled = false;
}

function ScheduleDiscovery() {
  if (DiscoveryScheduled) return;
  DiscoveryScheduled = true;
  if ("requestIdleCallback" in window) requestIdleCallback(ScanNewRoots, { timeout: 900 });
  else setTimeout(ScanNewRoots, 24);
}

function DistanceLimit(Object) {
  if (Object.isPointLight || Object.userData?.PointLightR94) return 38;
  if (Object.userData?.LightGlowR94) return 62;
  if (Object.userData?.LightHousingR94) return 96;
  if (/Department|Hanging|Overhead/i.test(String(Object.parent?.name || ""))) return 78;
  return Number(Object.userData?.DistanceCullR94) || 54;
}

function SetCandidateVisible(Object, Visible) {
  if (!Object) return;
  if (Object.isPointLight) {
    const Base = Number(Object.userData.RuntimeBaseIntensityR94 ?? Object.userData.BaseIntensity ?? 1.5);
    Object.intensity = Visible ? Base : 0;
    Object.visible = Visible;
    return;
  }
  Object.visible = Visible;
}

function CullSlice() {
  if (!Candidates.length) return;
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

function AdaptPixelRatio(Now) {
  if (FrameSamples < 75 || Now - LastQualityChangeAt < 3200) return;
  const AverageMs = FrameAccumulator / FrameSamples;
  FrameAccumulator = 0;
  FrameSamples = 0;
  const Current = Game.Renderer.getPixelRatio();
  let Next = Current;
  if (AverageMs > 22.5) Next = Math.max(MIN_PIXEL_RATIO, Current - 0.08);
  else if (AverageMs < 17.0 && Current < TARGET_PIXEL_RATIO) Next = Math.min(TARGET_PIXEL_RATIO, Current + 0.05);
  if (Math.abs(Next - Current) >= 0.025) {
    Game.Renderer.setPixelRatio(Next);
    Game.Renderer.setSize(innerWidth, innerHeight, false);
    LastQualityChangeAt = Now;
  }
}

function Frame(Now) {
  const DeltaMs = Math.min(100, Math.max(0, Now - LastFrameAt));
  LastFrameAt = Now;
  FrameAccumulator += DeltaMs;
  FrameSamples += 1;
  if (Now - LastCullAt >= 100) {
    LastCullAt = Now;
    CullSlice();
  }
  if (Now - LastDiscoveryAt >= 1600) ScheduleDiscovery();
  AdaptPixelRatio(Now);
  requestAnimationFrame(Frame);
}

Game.Renderer.setPixelRatio(Math.min(Game.Renderer.getPixelRatio(), TARGET_PIXEL_RATIO));
ScheduleDiscovery();
requestAnimationFrame(Frame);

window.__STORE_PERFORMANCE_BUFFER_R94__ = {
  ScanNewRoots,
  RegisterObject,
  GetCandidateCount: () => Candidates.length,
  GetPixelRatio: () => Game.Renderer.getPixelRatio()
};
window.__STORE_PERFORMANCE_BUFFER_BUILD__ = "V0.30.0-R94";