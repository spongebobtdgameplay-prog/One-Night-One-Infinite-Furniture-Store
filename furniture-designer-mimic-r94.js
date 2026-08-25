import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Carry = window.__STORE_FURNITURE_CARRY_R94__;
if (!Game?.Scene || !Game?.Camera || !Player || !Carry) throw new Error("Game, player and furniture carry must load before designer encounter.");

const MODEL_URL = "https://raw.githubusercontent.com/euuuuuuan/fatal-funnel-public/main/packages/renderer/assets/models/quaternius-men/worker.glb";
const DESIGNER_NAME = "MASON";
const DESIGNER_HEIGHT = 1.80;
const TALK_DISTANCE = 2.35;
const CHECKIN_MIN_MS = 68_000;
const CHECKIN_MAX_MS = 100_000;
const MIMIC_SPEED = 6.45;
const MIMIC_CAPTURE_DISTANCE = 0.92;
const Loader = new GLTFLoader();
const ModelPromise = Loader.loadAsync(MODEL_URL);
const TempVector = new THREE.Vector3();
const TempVectorB = new THREE.Vector3();
const TempEuler = new THREE.Euler();
const TempQuaternion = new THREE.Quaternion();
const Npcs = new Set();

let Mason = null;
let CheckIn = null;
let RequestName = "";
let RequestsCompleted = 0;
let CheckInCount = 0;
let NextCheckInAt = Infinity;
let LastFrameAt = performance.now();
let Cutscene = null;
let Captured = false;
let GameStartedAt = 0;

const Style = document.createElement("style");
Style.id = "FurnitureStoryStyleR94";
Style.textContent = `
#MasonRequestR94{position:fixed;left:16px;bottom:96px;z-index:73;display:none;pointer-events:none;padding:9px 11px;border-left:2px solid rgba(177,127,79,.52);background:rgba(5,6,5,.78);color:rgba(224,211,189,.72);font:800 10px Arial,sans-serif;letter-spacing:.09em;text-transform:uppercase;box-shadow:0 10px 30px rgba(0,0,0,.35)}#MasonRequestR94 strong{display:block;margin-top:4px;color:#e5d7bf;font-size:12px;letter-spacing:.12em}
#DesignerCutsceneR94{position:fixed;inset:0;z-index:120;display:none;pointer-events:none}#DesignerCutsceneR94.Show{display:block}#DesignerCutsceneR94:before,#DesignerCutsceneR94:after{content:"";position:absolute;left:0;right:0;height:11vh;background:#020302;animation:DesignerBarR94 .24s ease both}#DesignerCutsceneR94:before{top:0}#DesignerCutsceneR94:after{bottom:0}.DesignerSubtitleR94{position:absolute;left:50%;bottom:13.5vh;transform:translateX(-50%);width:min(720px,calc(100vw - 36px));padding:12px 16px;background:rgba(5,6,5,.86);border:1px solid rgba(203,159,105,.24);color:#e7dbc4;text-align:center;font:650 14px/1.5 Arial,sans-serif;letter-spacing:.025em}.DesignerSubtitleR94 b{color:#bd8e5d;font-size:10px;letter-spacing:.16em;text-transform:uppercase;display:block;margin-bottom:4px}
#CaughtR94{position:fixed;inset:0;z-index:190;display:none;place-items:center;background:#030403;color:#e3d6bf;text-align:center;opacity:0}#CaughtR94.Show{display:grid;animation:CaughtFadeR94 1.1s ease forwards}.CaughtFrameR94{width:min(460px,calc(100vw - 36px));padding:26px;border:1px solid rgba(154,92,59,.42);background:#090a08;box-shadow:0 30px 100px #000}.CaughtFrameR94 small{color:#89573e;font:900 10px Arial,sans-serif;letter-spacing:.2em}.CaughtFrameR94 h2{margin:9px 0 8px;font:900 25px Arial,sans-serif;letter-spacing:.17em}.CaughtFrameR94 p{margin:0 0 18px;color:rgba(227,214,191,.48);font:650 12px/1.5 Arial,sans-serif}.CaughtFrameR94 button{width:100%;height:46px;border:1px solid rgba(225,210,183,.38);background:#d9cbb2;color:#11130f;font:900 11px Arial,sans-serif;letter-spacing:.13em;cursor:pointer}
@keyframes DesignerBarR94{from{transform:scaleY(0)}to{transform:scaleY(1)}}@keyframes CaughtFadeR94{to{opacity:1}}
`;
document.head.appendChild(Style);

const RequestBadge = document.createElement("div");
RequestBadge.id = "MasonRequestR94";
document.body.appendChild(RequestBadge);
const CutsceneLayer = document.createElement("div");
CutsceneLayer.id = "DesignerCutsceneR94";
CutsceneLayer.innerHTML = `<div class="DesignerSubtitleR94"><b data-speaker>MASON • FLOOR DESIGNER</b><span data-line></span></div>`;
document.body.appendChild(CutsceneLayer);
const CaughtLayer = document.createElement("section");
CaughtLayer.id = "CaughtR94";
CaughtLayer.innerHTML = `<div class="CaughtFrameR94"><small>THE AISLE WENT QUIET</small><h2>CAUGHT</h2><p>The thing wearing Mason's face reached you. The run ends here.</p><button type="button">TRY AGAIN</button></div>`;
document.body.appendChild(CaughtLayer);
CaughtLayer.querySelector("button").addEventListener("click", () => location.reload());

function GameplayVisible() {
  const Hud = document.getElementById("Hud");
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function ProfileSprite(Text, Width = 1.25) {
  const Canvas = document.createElement("canvas");
  Canvas.width = 512;
  Canvas.height = 96;
  const Context = Canvas.getContext("2d");
  Context.fillStyle = "rgba(6,8,6,.78)";
  Context.fillRect(38, 20, 436, 56);
  Context.strokeStyle = "rgba(208,173,127,.34)";
  Context.strokeRect(38, 20, 436, 56);
  Context.fillStyle = "#e2d4bb";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.font = "800 25px Arial";
  Context.fillText(Text, 256, 48);
  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  const Sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Texture, transparent: true, depthWrite: false }));
  Sprite.scale.set(Width, Width * 0.19, 1);
  Sprite.position.y = 2.08;
  return Sprite;
}

function AddDesignerAccessories(Root) {
  const Apron = new THREE.Mesh(
    new THREE.BoxGeometry(0.43, 0.54, 0.035),
    new THREE.MeshStandardMaterial({ color: 0x5e5845, roughness: 0.92 })
  );
  Apron.name = "MasonApronR94";
  Apron.position.set(0, 1.18, 0.14);
  Apron.rotation.x = -0.04;
  Root.add(Apron);

  const StrapMaterial = new THREE.MeshStandardMaterial({ color: 0xb99359, roughness: 0.75 });
  const Tape = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.018, 6, 14), StrapMaterial);
  Tape.position.set(-0.29, 1.15, 0.17);
  Tape.rotation.y = Math.PI * 0.5;
  Root.add(Tape);

  const Clipboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.27, 0.37, 0.028),
    new THREE.MeshStandardMaterial({ color: 0x8b6848, roughness: 0.86 })
  );
  Clipboard.name = "MasonClipboardR94";
  Clipboard.position.set(0.36, 1.02, 0.17);
  Clipboard.rotation.set(-0.22, 0, -0.20);
  Root.add(Clipboard);

  const GlassMaterial = new THREE.MeshStandardMaterial({ color: 0x2d302d, metalness: 0.55, roughness: 0.45 });
  for (const X of [-0.092, 0.092]) {
    const Lens = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.010, 6, 14), GlassMaterial);
    Lens.position.set(X, 1.65, 0.16);
    Root.add(Lens);
  }
  const Bridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.012), GlassMaterial);
  Bridge.position.set(0, 1.65, 0.16);
  Root.add(Bridge);
  return { Apron, Clipboard, Tape };
}

function NormalizeModel(Source) {
  const Model = SkeletonUtils.clone(Source);
  Model.updateMatrixWorld(true);
  const Initial = new THREE.Box3().setFromObject(Model);
  Initial.getSize(TempVector);
  Model.scale.setScalar(DESIGNER_HEIGHT / Math.max(TempVector.y, 0.001));
  Model.updateMatrixWorld(true);
  const Bounds = new THREE.Box3().setFromObject(Model);
  Bounds.getCenter(TempVector);
  Model.position.x -= TempVector.x;
  Model.position.z -= TempVector.z;
  Model.updateMatrixWorld(true);
  const Ground = new THREE.Box3().setFromObject(Model);
  Model.position.y -= Ground.min.y;
  Model.traverse(Object => {
    if (!Object.isMesh) return;
    Object.castShadow = false;
    Object.receiveShadow = false;
    Object.frustumCulled = true;
    if (Object.material) {
      Object.material = Object.material.clone();
      if (Object.material.color) Object.material.color.multiplyScalar(0.92);
    }
  });
  return Model;
}

function CaptureBones(Model) {
  const Names = ["Hips", "Abdomen", "Torso", "Chest", "Neck", "Head", "UpperArm.L", "UpperArm.R", "LowerArm.L", "LowerArm.R", "Wrist.L", "Wrist.R", "UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R", "Foot.L", "Foot.R"];
  const Map = new Map();
  const Base = new Map();
  for (const Name of Names) {
    const Bone = Model.getObjectByName(Name);
    if (!Bone?.isBone) continue;
    Map.set(Name, Bone);
    Base.set(Name, Bone.quaternion.clone());
  }
  return { Map, Base };
}

function BuildTeeth(Npc) {
  const Head = Npc.Bones.Map.get("Head");
  if (!Head) return null;
  const Mouth = new THREE.Group();
  Mouth.name = "MimicMouthR94";
  Mouth.position.set(0, -0.10, 0.16);
  Mouth.scale.setScalar(0.001);
  const Gum = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.12, 0.075), new THREE.MeshStandardMaterial({ color: 0x24150f, roughness: 0.9 }));
  Mouth.add(Gum);
  const ToothMaterial = new THREE.MeshStandardMaterial({ color: 0xe2d6b9, roughness: 0.72 });
  for (let Index = 0; Index < 8; Index += 1) {
    const X = -0.125 + Index * 0.036;
    const Top = new THREE.Mesh(new THREE.ConeGeometry(0.020, 0.15, 5), ToothMaterial);
    Top.position.set(X, 0.065, 0.06);
    Top.rotation.z = Math.PI;
    Mouth.add(Top);
    const Bottom = new THREE.Mesh(new THREE.ConeGeometry(0.020, 0.15, 5), ToothMaterial);
    Bottom.position.set(X, -0.065, 0.06);
    Mouth.add(Bottom);
  }
  Head.add(Mouth);
  Npc.Mouth = Mouth;
  return Mouth;
}

async function CreateNpc({ x, z, mimic = false, checkIn = false } = {}) {
  const Asset = await ModelPromise;
  const Root = new THREE.Group();
  Root.name = mimic ? "MasonMimicR94" : checkIn ? "MasonCheckInR94" : "MasonDesignerR94";
  const BodyRoot = new THREE.Group();
  const Model = NormalizeModel(Asset.scene);
  BodyRoot.add(Model);
  Root.add(BodyRoot);
  const Accessories = AddDesignerAccessories(Root);
  const Label = ProfileSprite("MASON • FLOOR DESIGNER");
  Root.add(Label);
  Root.position.set(x || 0, 0, z || 0);
  const Bones = CaptureBones(Model);
  const Npc = {
    Root, BodyRoot, Model, Bones, Accessories, Label,
    IsMimic: mimic,
    IsCheckIn: checkIn,
    State: "idle",
    SpawnedAt: performance.now(),
    TransformStartedAt: 0,
    ChaseStartedAt: 0,
    TalkUntil: 0,
    Mouth: null,
    Removed: false,
    Time: Math.random() * 10
  };
  Game.Scene.add(Root);
  Npcs.add(Npc);
  Root.lookAt(Game.Camera.position.x, 0.9, Game.Camera.position.z);
  return Npc;
}

function RemoveNpc(Npc) {
  if (!Npc || Npc.Removed) return;
  Npc.Removed = true;
  Npcs.delete(Npc);
  Npc.Root.parent?.remove(Npc.Root);
  Npc.Root.traverse(Object => {
    if (Object.isSprite) {
      Object.material?.map?.dispose?.();
      Object.material?.dispose?.();
    }
  });
  if (CheckIn === Npc) CheckIn = null;
}

function ResetBones(Npc) {
  for (const [Name, Bone] of Npc.Bones.Map) {
    const Base = Npc.Bones.Base.get(Name);
    if (Base) Bone.quaternion.copy(Base);
  }
}

function Rotate(Npc, Name, X = 0, Y = 0, Z = 0) {
  const Bone = Npc.Bones.Map.get(Name);
  if (!Bone) return;
  TempEuler.set(X, Y, Z, "XYZ");
  TempQuaternion.setFromEuler(TempEuler);
  Bone.quaternion.multiply(TempQuaternion).normalize();
}

function AnimateNpc(Npc, Delta, Now) {
  if (Npc.Removed) return;
  Npc.Time += Delta;
  ResetBones(Npc);
  const Breath = Math.sin(Npc.Time * 1.45) * 0.018;
  Rotate(Npc, "Abdomen", Breath, 0, 0);
  Rotate(Npc, "Torso", -Breath * 0.45, 0, 0);

  if (Npc.State === "talk") {
    const Gesture = Math.sin(Npc.Time * 4.4);
    Rotate(Npc, "UpperArm.L", -0.28 - Gesture * 0.16, 0, 0.78);
    Rotate(Npc, "LowerArm.L", -0.52 + Gesture * 0.10, 0, 0);
    Rotate(Npc, "UpperArm.R", -0.18 + Gesture * 0.10, 0, -0.72);
    Rotate(Npc, "Head", 0, Math.sin(Npc.Time * 1.8) * 0.07, 0);
  } else if (Npc.State === "transform") {
    const T = THREE.MathUtils.smoothstep((Now - Npc.TransformStartedAt) / 1350, 0, 1);
    Npc.BodyRoot.scale.set(1 - T * 0.04, 1 + T * 0.34, 1 - T * 0.03);
    Rotate(Npc, "Torso", -0.08 - T * 0.30, 0, Math.sin(Npc.Time * 9) * T * 0.08);
    Rotate(Npc, "Neck", T * 0.20, 0, 0);
    Rotate(Npc, "Head", -T * 0.26, Math.sin(Npc.Time * 11) * T * 0.10, 0);
    Rotate(Npc, "UpperArm.L", -T * 0.82, 0, 0.85 + T * 0.25);
    Rotate(Npc, "UpperArm.R", -T * 0.82, 0, -0.85 - T * 0.25);
    Rotate(Npc, "LowerArm.L", -T * 0.35, 0, 0);
    Rotate(Npc, "LowerArm.R", -T * 0.35, 0, 0);
    if (Npc.Mouth) Npc.Mouth.scale.setScalar(Math.max(0.001, T));
    if (T >= 0.995) StartChase(Npc);
  } else if (Npc.State === "chase") {
    const Run = Math.sin(Npc.Time * 12.5);
    Rotate(Npc, "Torso", 0.18, 0, Run * 0.035);
    Rotate(Npc, "UpperLeg.L", Run * 0.72, 0, 0);
    Rotate(Npc, "UpperLeg.R", -Run * 0.72, 0, 0);
    Rotate(Npc, "LowerLeg.L", Math.max(0, -Run) * 0.52, 0, 0);
    Rotate(Npc, "LowerLeg.R", Math.max(0, Run) * 0.52, 0, 0);
    Rotate(Npc, "UpperArm.L", -Run * 0.62, 0, 0.38);
    Rotate(Npc, "UpperArm.R", Run * 0.62, 0, -0.38);
    Rotate(Npc, "LowerArm.L", -0.40, 0, 0);
    Rotate(Npc, "LowerArm.R", -0.40, 0, 0);
  } else if (Npc.State === "capture") {
    const Reach = THREE.MathUtils.clamp((Now - Npc.ChaseStartedAt) / 550, 0, 1);
    Rotate(Npc, "UpperArm.L", -1.18 * Reach, 0, 0.42);
    Rotate(Npc, "UpperArm.R", -1.18 * Reach, 0, -0.42);
    Rotate(Npc, "LowerArm.L", -0.72 * Reach, 0, 0);
    Rotate(Npc, "LowerArm.R", -0.72 * Reach, 0, 0);
  } else {
    Rotate(Npc, "UpperArm.L", -0.08, 0, 0.58);
    Rotate(Npc, "UpperArm.R", -0.13, 0, -0.62);
    Rotate(Npc, "LowerArm.R", -0.24, 0, 0);
    Rotate(Npc, "Head", 0, Math.sin(Npc.Time * 0.8) * 0.035, 0);
  }
  Npc.Model.updateMatrixWorld(true);
}

function RequestOptions() {
  const Names = new Set();
  for (const Record of Carry.ListFurniture()) {
    if (!Record?.Object?.visible || Record.Object.userData?.DeliveredR94) continue;
    const Name = Carry.FriendlyName(Record.Object);
    if (Name && !/FLOOR LAMP|TOILET|SINK/i.test(Name)) Names.add(Name);
  }
  return [...Names];
}

function PickRequest() {
  const Options = RequestOptions();
  if (!Options.length) return "ARMCHAIR";
  const Filtered = Options.filter(Name => Name !== RequestName);
  const Pool = Filtered.length ? Filtered : Options;
  return Pool[Math.floor(Math.random() * Pool.length)];
}

function UpdateRequestBadge() {
  if (!RequestName || Captured) {
    RequestBadge.style.display = "none";
    return;
  }
  RequestBadge.style.display = GameplayVisible() ? "block" : "none";
  RequestBadge.innerHTML = `MASON REQUEST<strong>${RequestName}</strong>`;
}

function ScheduleCheckIn() {
  NextCheckInAt = performance.now() + CHECKIN_MIN_MS + Math.random() * (CHECKIN_MAX_MS - CHECKIN_MIN_MS);
}

function SetNpcFacingPlayer(Npc) {
  if (!Npc?.Root) return;
  Npc.Root.lookAt(Game.Camera.position.x, 1.0, Game.Camera.position.z);
}

function StartDialogue(Npc, Line, Duration = 3000, OnDone = null, Speaker = "MASON • FLOOR DESIGNER") {
  if (Cutscene || Captured) return;
  window.__STORE_GAMEPLAY_LOCKED_R94__ = true;
  if (document.pointerLockElement) document.exitPointerLock?.();
  SetNpcFacingPlayer(Npc);
  Npc.State = "talk";
  Npc.TalkUntil = performance.now() + Duration;
  const CameraStartPosition = Game.Camera.position.clone();
  const CameraStartQuaternion = Game.Camera.quaternion.clone();
  const NpcPosition = Npc.Root.position.clone();
  const Direction = CameraStartPosition.clone().sub(NpcPosition).setY(0);
  if (Direction.lengthSq() < 0.01) Direction.set(0, 0, 1);
  Direction.normalize();
  const Desired = NpcPosition.clone().addScaledVector(Direction, 2.25);
  Desired.y = 1.55;
  CutsceneLayer.querySelector("[data-speaker]").textContent = Speaker;
  CutsceneLayer.querySelector("[data-line]").textContent = Line;
  CutsceneLayer.classList.add("Show");
  Cutscene = {
    Npc,
    StartedAt: performance.now(),
    EndAt: performance.now() + Duration,
    CameraStartPosition,
    CameraStartQuaternion,
    Desired,
    OnDone
  };
}

function UpdateCutscene(Now) {
  if (!Cutscene) return;
  const Record = Cutscene;
  const T = THREE.MathUtils.clamp((Now - Record.StartedAt) / 650, 0, 1);
  const Smooth = T * T * (3 - 2 * T);
  Game.Camera.position.lerpVectors(Record.CameraStartPosition, Record.Desired, Smooth);
  TempVector.copy(Record.Npc.Root.position).add(new THREE.Vector3(0, 1.38, 0));
  Game.Camera.lookAt(TempVector);
  if (Now < Record.EndAt) return;
  CutsceneLayer.classList.remove("Show");
  Record.Npc.State = Record.Npc.State === "talk" ? "idle" : Record.Npc.State;
  Cutscene = null;
  window.__STORE_GAMEPLAY_LOCKED_R94__ = false;
  Record.OnDone?.();
}

function HandleMasonTalk(Npc) {
  if (Cutscene || Captured) return;
  const Held = Carry.GetHeld();
  if (!RequestName) {
    RequestName = PickRequest();
    UpdateRequestBadge();
    ScheduleCheckIn();
    StartDialogue(Npc, `I keep the display floor from falling apart. Bring me a ${RequestName}. Pick it up in the showroom and carry it back to me.`, 4300);
    return;
  }

  if (Held) {
    if (Held.name === RequestName) {
      const Delivered = Carry.ConsumeHeld(Item => Item.name === RequestName);
      if (Delivered.ok) {
        const Finished = RequestName;
        RequestsCompleted += 1;
        RequestName = "";
        UpdateRequestBadge();
        StartDialogue(Npc, `That's the ${Finished}. Good. Give me a moment and I'll figure out what this place needs next.`, 3300, () => {
          setTimeout(() => {
            if (Captured || RequestName) return;
            RequestName = PickRequest();
            UpdateRequestBadge();
            Carry.ShowTransient(`NEW REQUEST • ${RequestName}`);
            ScheduleCheckIn();
          }, 12_000);
        });
        return;
      }
    }
    StartDialogue(Npc, `That's not the piece I asked for. I'm still looking for a ${RequestName}.`, 2600);
    return;
  }

  StartDialogue(Npc, RequestsCompleted ? `Still need that ${RequestName}. Don't drag it. Carry it back here.` : `Find me a ${RequestName}. I'll be here checking the floor plan.`, 2700);
}

function BeginMimicReveal(Npc) {
  if (!Npc?.IsMimic || Npc.State === "transform" || Npc.State === "chase" || Captured) return;
  window.__STORE_GAMEPLAY_LOCKED_R94__ = true;
  SetNpcFacingPlayer(Npc);
  Npc.State = "transform";
  Npc.TransformStartedAt = performance.now();
  Npc.Label.visible = false;
  BuildTeeth(Npc);
  CutsceneLayer.querySelector("[data-speaker]").textContent = "MASON?";
  CutsceneLayer.querySelector("[data-line]").textContent = "You brought it all this way...";
  CutsceneLayer.classList.add("Show");
  if (document.pointerLockElement) document.exitPointerLock?.();
  Cutscene = {
    Npc,
    StartedAt: performance.now(),
    EndAt: performance.now() + 1380,
    CameraStartPosition: Game.Camera.position.clone(),
    CameraStartQuaternion: Game.Camera.quaternion.clone(),
    Desired: Game.Camera.position.clone(),
    OnDone: () => {
      window.__STORE_GAMEPLAY_LOCKED_R94__ = false;
      StartChase(Npc);
    }
  };
}

function HandleCheckInTalk(Npc) {
  if (Npc.IsMimic) {
    StartDialogue(Npc, "Hey. Come closer. I wanted to check what you found.", 1450, () => BeginMimicReveal(Npc));
    return;
  }
  const Held = Carry.GetHeld();
  if (Held?.name === RequestName) {
    HandleMasonTalk(Npc);
    setTimeout(() => { if (!Npc.Removed && Npc.State === "idle") RemoveNpc(Npc); }, 4500);
    return;
  }
  StartDialogue(Npc, RequestName ? `Just checking in. I'm still waiting on the ${RequestName}. Keep moving.` : "Good. Keep going. I'll check the next section.", 2600, () => RemoveNpc(Npc));
}

function InteractionCandidate() {
  if (!GameplayVisible() || Cutscene || Captured) return null;
  let Best = null;
  for (const Npc of Npcs) {
    if (Npc.Removed || Npc.State === "transform" || Npc.State === "chase" || Npc.State === "capture") continue;
    const Distance = Math.hypot(Npc.Root.position.x - Game.Camera.position.x, Npc.Root.position.z - Game.Camera.position.z);
    if (Distance > TALK_DISTANCE || (Best && Distance >= Best.Distance)) continue;
    Best = { Npc, Distance };
  }
  if (!Best) return null;
  const Held = Carry.GetHeld();
  const Text = !Best.Npc.IsMimic && Held?.name === RequestName ? `E • GIVE ${Held.name} TO MASON` : `E • TALK TO MASON`;
  return {
    priority: 100,
    distance: Best.Distance,
    text,
    activate: () => Best.Npc.IsCheckIn ? HandleCheckInTalk(Best.Npc) : HandleMasonTalk(Best.Npc)
  };
}
Carry.RegisterInteraction("mason-r94", InteractionCandidate);

function EntryBlocks(Position, Radius = 0.38) {
  for (const Entry of Game.CollisionBoxes) {
    if (!Entry) continue;
    if (typeof Entry.TestPlayerCollision === "function") {
      try { if (Entry.TestPlayerCollision(Position, Radius)) return true; } catch {}
      continue;
    }
    const Box = Entry.Box || Entry;
    if (!Box?.min || !Box?.max) continue;
    if (Position.x + Radius > Box.min.x && Position.x - Radius < Box.max.x && Position.z + Radius > Box.min.z && Position.z - Radius < Box.max.z) return true;
  }
  return false;
}

function TryChaseStep(Npc, Delta) {
  TempVector.set(Game.Camera.position.x - Npc.Root.position.x, 0, Game.Camera.position.z - Npc.Root.position.z);
  const Distance = TempVector.length();
  if (Distance <= MIMIC_CAPTURE_DISTANCE) {
    CapturePlayer(Npc);
    return;
  }
  if (Distance < 0.001) return;
  TempVector.normalize();
  const Step = MIMIC_SPEED * Delta;
  const BaseX = Npc.Root.position.x;
  const BaseZ = Npc.Root.position.z;
  const Angles = [0, 0.48, -0.48, 0.90, -0.90, 1.35, -1.35];
  let Moved = false;
  for (const Angle of Angles) {
    const C = Math.cos(Angle);
    const S = Math.sin(Angle);
    const X = TempVector.x * C - TempVector.z * S;
    const Z = TempVector.x * S + TempVector.z * C;
    TempVectorB.set(BaseX + X * Step, 1.68, BaseZ + Z * Step);
    if (EntryBlocks(TempVectorB, 0.34)) continue;
    Npc.Root.position.x = TempVectorB.x;
    Npc.Root.position.z = TempVectorB.z;
    Moved = true;
    break;
  }
  if (Moved) Npc.Root.lookAt(Game.Camera.position.x, 0.9, Game.Camera.position.z);
}

function StartChase(Npc) {
  if (!Npc || Npc.Removed || Captured || Npc.State === "chase") return;
  if (Cutscene?.Npc === Npc) return;
  Npc.State = "chase";
  Npc.ChaseStartedAt = performance.now();
  Npc.BodyRoot.scale.set(0.96, 1.34, 0.97);
  if (Npc.Mouth) Npc.Mouth.scale.setScalar(1);
  window.__STORE_GAMEPLAY_LOCKED_R94__ = false;
  Carry.ShowTransient("RUN");
}

function CapturePlayer(Npc) {
  if (Captured) return;
  Captured = true;
  Npc.State = "capture";
  Npc.ChaseStartedAt = performance.now();
  window.__STORE_GAMEPLAY_LOCKED_R94__ = true;
  if (document.pointerLockElement) document.exitPointerLock?.();
  let Start = performance.now();
  const StartCamera = Game.Camera.position.clone();
  const Update = Now => {
    const T = THREE.MathUtils.clamp((Now - Start) / 900, 0, 1);
    const Target = Npc.Root.position.clone().add(new THREE.Vector3(0, 1.38, 0));
    Game.Camera.position.x = THREE.MathUtils.lerp(StartCamera.x, Npc.Root.position.x, T * 0.22);
    Game.Camera.position.z = THREE.MathUtils.lerp(StartCamera.z, Npc.Root.position.z, T * 0.22);
    Game.Camera.position.y = StartCamera.y + Math.sin(T * Math.PI * 7) * 0.018 * (1 - T);
    Game.Camera.lookAt(Target);
    if (T < 1) requestAnimationFrame(Update);
    else CaughtLayer.classList.add("Show");
  };
  requestAnimationFrame(Update);
}

async function SpawnInitialMason() {
  if (Mason || Captured) return;
  Mason = await CreateNpc({ x: -6.4, z: 3.6, mimic: false, checkIn: false });
  Mason.Root.lookAt(0, 1.0, 7.2);
}

async function SpawnCheckIn() {
  if (CheckIn || Captured || !RequestName || !GameplayVisible() || Cutscene) return;
  const Mimic = CheckInCount >= 2 && Math.random() < 0.28;
  CheckInCount += 1;
  const SideChoices = [-9.8, 9.8, -6.8, 6.8];
  let X = SideChoices[Math.floor(Math.random() * SideChoices.length)];
  const Z = Game.Camera.position.z - 14 - Math.random() * 5;
  for (const CandidateX of SideChoices) {
    TempVector.set(CandidateX, 1.68, Z);
    if (!EntryBlocks(TempVector, 0.42)) { X = CandidateX; break; }
  }
  CheckIn = await CreateNpc({ x: X, z: Z, mimic: Mimic, checkIn: true });
  CheckIn.Root.lookAt(Game.Camera.position.x, 1.0, Game.Camera.position.z);
  ScheduleCheckIn();
}

function ManageCheckIn(Now) {
  if (Now >= NextCheckInAt && !CheckIn) SpawnCheckIn().catch(Error => console.warn("Designer check-in failed", Error));
  if (!CheckIn || CheckIn.State === "chase" || CheckIn.State === "transform" || CheckIn.State === "capture" || Cutscene?.Npc === CheckIn) return;
  const Distance = Math.hypot(CheckIn.Root.position.x - Game.Camera.position.x, CheckIn.Root.position.z - Game.Camera.position.z);
  if (Distance > 42 || Game.Camera.position.z < CheckIn.Root.position.z - 11) RemoveNpc(CheckIn);
}

function Frame(Now) {
  const Delta = Math.min(0.05, Math.max(0.001, (Now - LastFrameAt) / 1000));
  LastFrameAt = Now;
  if (GameplayVisible() && !GameStartedAt) {
    GameStartedAt = Now;
    SpawnInitialMason().catch(Error => console.warn("Mason failed to load", Error));
  }
  for (const Npc of Npcs) {
    AnimateNpc(Npc, Delta, Now);
    if (Npc.State === "chase" && !Captured) TryChaseStep(Npc, Delta);
  }
  UpdateCutscene(Now);
  ManageCheckIn(Now);
  UpdateRequestBadge();
  requestAnimationFrame(Frame);
}
requestAnimationFrame(Frame);

window.__STORE_FURNITURE_STORY_R94__ = {
  GetRequest: () => RequestName,
  GetDesigner: () => Mason,
  GetCheckIn: () => CheckIn,
  ForceCheckIn: () => { NextCheckInAt = performance.now(); },
  GetCompletedRequests: () => RequestsCompleted
};
window.__STORE_FURNITURE_STORY_BUILD__ = "V0.30.0-R94";