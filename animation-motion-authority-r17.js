import * as THREE from "three";

const PreviousMixerUpdate = THREE.AnimationMixer.prototype.update;
const MixerStates = new WeakMap();
const MoveEnterSpeed = 0.18;
const MoveExitSpeed = 0.07;
const SpeedResponse = 18;
const WeightResponse = 16;
const ContactFreshMs = 120;

function FindPlayerPivot(Mixer) {
  let Root = Mixer?.getRoot?.() || null;
  while (Root) {
    if (Root.name === "PlayerCharacterPivot") return Root;
    Root = Root.parent || null;
  }
  return null;
}

function StateFor(Mixer) {
  let State = MixerStates.get(Mixer);
  if (State) return State;
  State = {
    LastPosition: new THREE.Vector3(),
    WorldPosition: new THREE.Vector3(),
    HasPosition: false,
    SmoothedSpeed: 0,
    Moving: false,
    ContactDriven: false,
    Target: "idle"
  };
  MixerStates.set(Mixer, State);
  return State;
}

function ActionKind(Action) {
  const Name = String(Action?.getClip?.()?.name || "");
  if (/idle/i.test(Name)) return "idle";
  if (/run|sprint/i.test(Name)) return "sprint";
  if (/walk|jog/i.test(Name)) return "walk";
  return "other";
}

function FindActions(Mixer) {
  const Result = { idle: null, walk: null, sprint: null };
  for (const Action of Mixer?._actions || []) {
    const Kind = ActionKind(Action);
    if (Kind !== "other" && !Result[Kind]) Result[Kind] = Action;
  }
  return Result;
}

function UpdateMeasuredMotion(Mixer, Delta) {
  const Pivot = FindPlayerPivot(Mixer);
  if (!Pivot) return null;
  const State = StateFor(Mixer);
  Pivot.getWorldPosition(State.WorldPosition);

  if (!State.HasPosition) {
    State.LastPosition.copy(State.WorldPosition);
    State.HasPosition = true;
    return State;
  }

  const SafeDelta = Math.max(Delta, 0.001);
  const Distance = Math.hypot(
    State.WorldPosition.x - State.LastPosition.x,
    State.WorldPosition.z - State.LastPosition.z
  );
  State.LastPosition.copy(State.WorldPosition);
  const RawSpeed = Distance / SafeDelta;
  const Alpha = 1 - Math.exp(-SafeDelta * SpeedResponse);
  State.SmoothedSpeed = THREE.MathUtils.lerp(State.SmoothedSpeed, RawSpeed, Alpha);

  const Contact = window.__STORE_MOVEMENT_CONTACT__;
  State.ContactDriven = Boolean(
    Contact?.Strength > 0.01 &&
    performance.now() - Contact.LastHit <= ContactFreshMs
  );

  if (State.ContactDriven) {
    State.Moving = true;
  } else if (State.Moving) {
    if (State.SmoothedSpeed < MoveExitSpeed) State.Moving = false;
  } else if (State.SmoothedSpeed > MoveEnterSpeed) {
    State.Moving = true;
  }

  return State;
}

function ApplyAnimationWeights(Mixer, Delta, State) {
  const Actions = FindActions(Mixer);
  if (!Actions.idle && !Actions.walk && !Actions.sprint) return;

  const Sprinting = Boolean(window.__STORE_PLAYER__?.IsSprinting?.());
  let Target = State?.Moving ? (Sprinting && Actions.sprint ? "sprint" : "walk") : "idle";
  if (!Actions[Target]) Target = Actions.walk ? "walk" : Actions.idle ? "idle" : "sprint";
  if (State) State.Target = Target;

  const Alpha = 1 - Math.exp(-Math.max(Delta, 0.001) * WeightResponse);
  for (const Kind of ["idle", "walk", "sprint"]) {
    const Action = Actions[Kind];
    if (!Action) continue;
    Action.enabled = true;
    Action.play();
    Action.stopFading?.();
    const CurrentWeight = THREE.MathUtils.clamp(Number(Action.getEffectiveWeight?.()) || 0, 0, 1);
    const TargetWeight = Kind === Target ? 1 : 0;
    Action.setEffectiveWeight(THREE.MathUtils.lerp(CurrentWeight, TargetWeight, Alpha));
  }
}

THREE.AnimationMixer.prototype.update = function UpdateAnimationFromMotionAndContact(Delta) {
  const SafeDelta = THREE.MathUtils.clamp(Number(Delta) || 0, 0, 0.05);
  const Pivot = FindPlayerPivot(this);
  if (!Pivot) return PreviousMixerUpdate.call(this, Delta);
  const State = UpdateMeasuredMotion(this, SafeDelta);
  ApplyAnimationWeights(this, SafeDelta, State);
  return PreviousMixerUpdate.call(this, Delta);
};

window.__STORE_ANIMATION_MOTION_AUTHORITY__ = MixerStates;
window.__STORE_ANIMATION_MOTION_AUTHORITY_BUILD__ = "V0.12.16";
