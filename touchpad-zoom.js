import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
if (!BasePlayer) throw new Error("Player controller must load before touchpad zoom.");

const THIRD_PERSON_DEFAULT = 4.0;
const THIRD_PERSON_MIN = 1.45;
const THIRD_PERSON_MAX = 5.2;
const FIRST_PERSON_SWITCH = 1.02;
const OUT_FROM_FIRST = 1.72;
const ZOOM_PIXELS_TO_DISTANCE = 0.0046;
const ZOOM_SMOOTHING = 13;
const CAMERA_TARGET_HEIGHT = 1.22;
const CAMERA_FLOOR = 0.34;
const CAMERA_PADDING = 0.10;

const State = {
  ThirdPerson: true,
  Distance: THIRD_PERSON_DEFAULT,
  TargetDistance: THIRD_PERSON_DEFAULT,
  LastRenderAt: performance.now(),
  Scene: null,
  Camera: null,
  TempTarget: new THREE.Vector3(),
  TempOffset: new THREE.Vector3(),
  TempDirection: new THREE.Vector3(),
  TempDesired: new THREE.Vector3()
};

function HudActive() {
  const Hud = document.getElementById("Hud");
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function SetBaseMode(ThirdPerson) {
  State.ThirdPerson = ThirdPerson;
  const BaseThirdPerson = Boolean(BasePlayer.IsThirdPerson?.());
  if (BaseThirdPerson === ThirdPerson) return;
  dispatchEvent(new KeyboardEvent("keydown", {
    code: "KeyV",
    key: "v",
    bubbles: true,
    cancelable: true
  }));
}

function NormalizeWheelDelta(Event) {
  let Delta = Event.deltaY;
  if (Event.deltaMode === WheelEvent.DOM_DELTA_LINE) Delta *= 16;
  else if (Event.deltaMode === WheelEvent.DOM_DELTA_PAGE) Delta *= Math.max(innerHeight, 600);
  return THREE.MathUtils.clamp(Delta, -140, 140);
}

function SegmentAabbDistance(Start, End, Bounds, Padding = CAMERA_PADDING) {
  State.TempDirection.copy(End).sub(Start);
  let Minimum = 0;
  let Maximum = 1;

  for (const Axis of ["x", "y", "z"]) {
    const Origin = Start[Axis];
    const Direction = State.TempDirection[Axis];
    const Min = Bounds.min[Axis] - Padding;
    const Max = Bounds.max[Axis] + Padding;

    if (Math.abs(Direction) < 0.0000001) {
      if (Origin < Min || Origin > Max) return null;
      continue;
    }

    let Near = (Min - Origin) / Direction;
    let Far = (Max - Origin) / Direction;
    if (Near > Far) [Near, Far] = [Far, Near];
    Minimum = Math.max(Minimum, Near);
    Maximum = Math.min(Maximum, Far);
    if (Minimum > Maximum) return null;
  }

  return Minimum;
}

function ClampCameraDistance(Target, Desired, RequestedDistance) {
  const Collisions = window.__STORE_COLLISION_BOXES__ || [];
  let Allowed = RequestedDistance;
  const SegmentLength = Math.max(Target.distanceTo(Desired), 0.001);

  for (const Entry of Collisions) {
    if (!Entry?.Type || !/Wall|Partition/i.test(Entry.Type)) continue;
    const Bounds = Entry.OriginalStructureBox || Entry.OriginalBox || Entry.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    if (![Bounds.min.x, Bounds.min.y, Bounds.min.z, Bounds.max.x, Bounds.max.y, Bounds.max.z].every(Number.isFinite)) continue;

    const Hit = SegmentAabbDistance(Target, Desired, Bounds);
    if (Hit === null) continue;
    Allowed = Math.min(Allowed, Math.max(0.55, Hit * SegmentLength - 0.12));
  }

  return Allowed;
}

function ApplyCustomThirdPersonDistance(RenderCamera) {
  if (!State.ThirdPerson || !State.Scene) return;
  const Pivot = State.Scene.getObjectByName("PlayerCharacterPivot");
  if (!Pivot) return;

  State.TempTarget.set(Pivot.position.x, CAMERA_TARGET_HEIGHT, Pivot.position.z);
  State.TempOffset.copy(RenderCamera.position).sub(State.TempTarget);
  if (State.TempOffset.lengthSq() < 0.0001) return;
  State.TempOffset.normalize();

  State.TempDesired.copy(State.TempTarget).addScaledVector(State.TempOffset, State.Distance);
  State.TempDesired.y = Math.max(CAMERA_FLOOR, State.TempDesired.y);
  const Requested = State.TempTarget.distanceTo(State.TempDesired);
  const Allowed = ClampCameraDistance(State.TempTarget, State.TempDesired, Requested);

  RenderCamera.position.copy(State.TempTarget).addScaledVector(State.TempOffset, Allowed);
  RenderCamera.position.y = Math.max(CAMERA_FLOOR, RenderCamera.position.y);
  RenderCamera.lookAt(State.TempTarget);
  RenderCamera.updateMatrixWorld(true);
}

function Attach(Context) {
  State.Scene = Context.Scene;
  State.Camera = Context.Camera;
  BasePlayer.Attach(Context);
}

function Render(Renderer, Scene, Camera) {
  State.Scene = Scene;
  State.Camera = Camera;

  const Now = performance.now();
  const Delta = Math.min((Now - State.LastRenderAt) / 1000, 0.05);
  State.LastRenderAt = Now;
  const Alpha = 1 - Math.exp(-Delta * ZOOM_SMOOTHING);
  State.Distance = THREE.MathUtils.lerp(State.Distance, State.TargetDistance, Alpha);
  if (Math.abs(State.Distance - State.TargetDistance) < 0.002) State.Distance = State.TargetDistance;

  const OriginalRender = Renderer.render;
  Renderer.render = function(RenderScene, RenderCamera) {
    if (RenderCamera === Camera) ApplyCustomThirdPersonDistance(RenderCamera);
    return OriginalRender.call(Renderer, RenderScene, RenderCamera);
  };

  try {
    BasePlayer.Render(Renderer, Scene, Camera);
  } finally {
    Renderer.render = OriginalRender;
  }
}

addEventListener("wheel", Event => {
  if (!HudActive()) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();

  const Delta = NormalizeWheelDelta(Event);
  if (Math.abs(Delta) < 0.01) return;

  if (!State.ThirdPerson) {
    if (Delta <= 0) return;
    State.TargetDistance = OUT_FROM_FIRST;
    State.Distance = Math.max(State.Distance, THIRD_PERSON_MIN);
    SetBaseMode(true);
    return;
  }

  State.TargetDistance = THREE.MathUtils.clamp(
    State.TargetDistance + Delta * ZOOM_PIXELS_TO_DISTANCE,
    0,
    THIRD_PERSON_MAX
  );

  if (State.TargetDistance <= FIRST_PERSON_SWITCH) {
    State.TargetDistance = 0;
    State.Distance = 0;
    SetBaseMode(false);
  } else {
    State.TargetDistance = Math.max(THIRD_PERSON_MIN, State.TargetDistance);
  }
}, { capture: true, passive: false });

addEventListener("keydown", Event => {
  if (Event.code !== "KeyV" || Event.repeat || !HudActive()) return;
  queueMicrotask(() => {
    const BaseThirdPerson = Boolean(BasePlayer.IsThirdPerson?.());
    State.ThirdPerson = BaseThirdPerson;
    if (BaseThirdPerson) {
      State.TargetDistance = THIRD_PERSON_DEFAULT;
      State.Distance = Math.max(State.Distance, THIRD_PERSON_MIN);
    } else {
      State.TargetDistance = 0;
      State.Distance = 0;
    }
  });
});

SetBaseMode(true);

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Attach,
  Render,
  IsThirdPerson: () => State.ThirdPerson,
  GetThirdPersonDistance: () => State.Distance
};

window.__STORE_TOUCHPAD_ZOOM_BUILD__ = "V0.11-R11";
