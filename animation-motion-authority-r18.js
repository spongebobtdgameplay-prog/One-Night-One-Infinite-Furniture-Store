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
    ContactPressure: 0,
    ContactIntent: 0,
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

  const Contact = window.__STORE_MOVEMENT_CONTACT__ || null;
  const ContactAge = performance.now() - Number(Contact?.LastHit ?? -Infinity);
  const FreshContact = Boolean(
    ContactAge >= 0 &&
    ContactAge <= ContactFreshMs &&
    Number(Contact?.Strength) > 0.05
  );
  const ContactIntent = THREE.MathUtils.clamp(
    Number(Contact?.IntentInward) || 0,
    0,
    1
  );
  const ContactPressure = THREE.MathUtils.clamp(
    Number(Contact?.ConstraintPressure) || 0,
    0,
    1
  );
  const Bracing = Boolean(
    FreshContact &&
    ContactIntent > 0.22
  );

  State.ContactDriven = Bracing;
  State.ContactIntent = THREE.MathUtils.lerp(
    State.ContactIntent,
    Bracing ? ContactIntent : 0,
    Alpha
  );
  State.ContactPressure = THREE.MathUtils.lerp(
    State.ContactPressure,
    Bracing ? ContactPressure : 0,
    Alpha
  );

  if (Bracing) {
    // The user is still trying to move. Keep an attempt cadence alive;
    // the procedural body reaction turns it into a brace/shuffle.
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

  const Player = window.__STORE_PLAYER__;
  const Sprinting = Boolean(Player?.IsSprinting?.());
  const FirstPerson = !Boolean(Player?.IsThirdPerson?.());
  const UseSprintClip = Sprinting && !FirstPerson && Boolean(Actions.sprint);
  const Bracing = Boolean(State?.ContactDriven);
  const Pressure = THREE.MathUtils.clamp(Number(State?.ContactPressure) || 0, 0, 1);
  const Intent = THREE.MathUtils.clamp(Number(State?.ContactIntent) || 0, 0, 1);

  const DesiredWeights = {
    idle: 0,
    walk: 0,
    sprint: 0
  };

  if (Bracing) {
    // Blend a slow attempt cycle into idle instead of either freezing or
    // letting the full walk clip stride through the obstacle.
    const AttemptWeight = THREE.MathUtils.clamp(
      0.24 + Intent * 0.18 - Pressure * 0.06,
      0.20,
      0.42
    );
    DesiredWeights.walk = Actions.walk ? AttemptWeight : 0;
    DesiredWeights.idle = Actions.idle ? 1 - DesiredWeights.walk : 0;
    if (!Actions.idle && Actions.walk) DesiredWeights.walk = 1;
    State.Target = "brace";
  } else {
    let Target = State?.Moving ? (UseSprintClip ? "sprint" : "walk") : "idle";
    if (!Actions[Target]) Target = Actions.walk ? "walk" : Actions.idle ? "idle" : "sprint";
    DesiredWeights[Target] = 1;
    if (State) State.Target = Target;
  }

  const Alpha = 1 - Math.exp(-Math.max(Delta, 0.001) * WeightResponse);
  for (const Kind of ["idle", "walk", "sprint"]) {
    const Action = Actions[Kind];
    if (!Action) continue;

    Action.enabled = true;
    Action.play();
    Action.stopFading?.();

    const CurrentWeight = THREE.MathUtils.clamp(
      Number(Action.getEffectiveWeight?.()) || 0,
      0,
      1
    );
    Action.setEffectiveWeight(
      THREE.MathUtils.lerp(
        CurrentWeight,
        DesiredWeights[Kind] || 0,
        Alpha
      )
    );

    if (typeof Action.setEffectiveTimeScale === "function") {
      const TargetScale = Bracing && Kind === "walk"
        ? THREE.MathUtils.lerp(0.72, 0.42, Pressure)
        : 1;
      const CurrentScale = Number(Action.getEffectiveTimeScale?.()) || 1;
      Action.setEffectiveTimeScale(
        THREE.MathUtils.lerp(CurrentScale, TargetScale, Alpha)
      );
    }
  }
}

THREE.AnimationMixer.prototype.update = function UpdateAnimationFromMotionAndView(Delta) {
  const SafeDelta = THREE.MathUtils.clamp(Number(Delta) || 0, 0, 0.05);
  const Pivot = FindPlayerPivot(this);
  if (!Pivot) return PreviousMixerUpdate.call(this, Delta);
  const State = UpdateMeasuredMotion(this, SafeDelta);
  ApplyAnimationWeights(this, SafeDelta, State);
  return PreviousMixerUpdate.call(this, Delta);
};

window.__STORE_ANIMATION_MOTION_AUTHORITY__ = MixerStates;
window.__STORE_ANIMATION_MOTION_AUTHORITY_BUILD__ = "V0.35.7-FORCE-BRACE";
