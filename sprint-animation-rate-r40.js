import * as THREE from "three";

const OriginalUpdate = THREE.AnimationMixer.prototype.update;
const MixerRates = new WeakMap();
const WALK_RATE = 1.0;
const SPRINT_RATE = 1.55;
const RATE_RESPONSIVENESS = 10;

function IsPlayerMixer(Mixer) {
  let Root = Mixer?.getRoot?.() || null;
  while (Root) {
    if (Root.name === "PlayerCharacterPivot") return true;
    Root = Root.parent || null;
  }
  return false;
}

THREE.AnimationMixer.prototype.update = function(Delta) {
  if (!IsPlayerMixer(this)) return OriginalUpdate.call(this, Delta);

  const SafeDelta = Math.min(Math.max(Number(Delta) || 0, 0), 0.05);
  const Sprinting = Boolean(window.__STORE_PLAYER__?.IsSprinting?.());
  const TargetRate = Sprinting ? SPRINT_RATE : WALK_RATE;
  const PreviousRate = MixerRates.get(this) ?? WALK_RATE;
  const Alpha = 1 - Math.exp(-SafeDelta * RATE_RESPONSIVENESS);
  const Rate = THREE.MathUtils.lerp(PreviousRate, TargetRate, Alpha);

  MixerRates.set(this, Rate);
  return OriginalUpdate.call(this, Delta * Rate);
};

window.__STORE_SPRINT_ANIMATION_RATE_BUILD__ = "V0.11-R40";
