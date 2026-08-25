import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
const Carry = window.__STORE_FURNITURE_CARRY_R94__;
if (!Game?.Scene || !Game?.Camera || !Player || !Carry) throw new Error("Game, player and furniture carry must load before designer encounter.");

const Hud = document.getElementById("Hud");
const MODEL_URL = "https://raw.githubusercontent.com/euuuuuuan/fatal-funnel-public/main/packages/renderer/assets/models/quaternius-men/worker.glb";
const TALK_DISTANCE = 2.35;
const CHECKIN_MIN_MS = 68_000;
const CHECKIN_MAX_MS = 100_000;
const MIMIC_SPEED = 6.45;
const MIMIC_CAPTURE_DISTANCE = 0.92;
const FRAME_MS = 1000 / 30;
const CHASE_STEP_MS = 50;
const Loader = new GLTFLoader();
const ModelPromise = Loader.loadAsync(MODEL_URL);
const TempA = new THREE.Vector3();
const TempB = new THREE.Vector3();
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
let LastLogicAt = -Infinity;
let LastChaseAt = -Infinity;
let Cutscene = null;
let Captured = false;
let SpawnStarted = false;
let LastBadgeText = "";
let LastBadgeVisible = false;

const Style = document.createElement("style");
Style.id = "FurnitureStoryStyleR96";
Style.textContent = `
#MasonRequestR94{position:fixed;left:16px;bottom:96px;z-index:73;display:none;pointer-events:none;padding:9px 11px;border-left:2px solid rgba(177,127,79,.52);background:#080908;color:rgba(224,211,189,.72);font:800 10px Arial,sans-serif;letter-spacing:.09em;text-transform:uppercase}#MasonRequestR94 strong{display:block;margin-top:4px;color:#e5d7bf;font-size:12px;letter-spacing:.12em}
#DesignerCutsceneR94{position:fixed;inset:0;z-index:120;display:none;pointer-events:none}#DesignerCutsceneR94.Show{display:block}#DesignerCutsceneR94:before,#DesignerCutsceneR94:after{content:"";position:absolute;left:0;right:0;height:11vh;background:#020302}#DesignerCutsceneR94:before{top:0}#DesignerCutsceneR94:after{bottom:0}.DesignerSubtitleR94{position:absolute;left:50%;bottom:13.5vh;transform:translateX(-50%);width:min(720px,calc(100vw - 36px));padding:12px 16px;background:#080908;border:1px solid rgba(203,159,105,.24);color:#e7dbc4;text-align:center;font:650 14px/1.5 Arial,sans-serif}.DesignerSubtitleR94 b{color:#bd8e5d;font-size:10px;letter-spacing:.16em;text-transform:uppercase;display:block;margin-bottom:4px}
#CaughtR94{position:fixed;inset:0;z-index:190;display:none;place-items:center;background:#030403;color:#e3d6bf;text-align:center}#CaughtR94.Show{display:grid}.CaughtFrameR94{width:min(460px,calc(100vw - 36px));padding:26px;border:1px solid rgba(154,92,59,.42);background:#090a08}.CaughtFrameR94 small{color:#89573e;font:900 10px Arial,sans-serif;letter-spacing:.2em}.CaughtFrameR94 h2{margin:9px 0 8px;font:900 25px Arial,sans-serif;letter-spacing:.17em}.CaughtFrameR94 p{margin:0 0 18px;color:rgba(227,214,191,.48);font:650 12px/1.5 Arial,sans-serif}.CaughtFrameR94 button{width:100%;height:46px;border:1px solid rgba(225,210,183,.38);background:#d9cbb2;color:#11130f;font:900 11px Arial,sans-serif;letter-spacing:.13em;cursor:pointer}
`;
document.head.appendChild(Style);

const RequestBadge = document.createElement("div");
RequestBadge.id = "MasonRequestR94";
RequestBadge.innerHTML = `MASON REQUEST<strong></strong>`;
document.body.appendChild(RequestBadge);
const RequestStrong = RequestBadge.querySelector("strong");

const CutsceneLayer = document.createElement("div");
CutsceneLayer.id = "DesignerCutsceneR94";
CutsceneLayer.innerHTML = `<div class="DesignerSubtitleR94"><b data-speaker>MASON • FLOOR DESIGNER</b><span data-line></span></div>`;
document.body.appendChild(CutsceneLayer);
const Speaker = CutsceneLayer.querySelector("[data-speaker]");
const Line = CutsceneLayer.querySelector("[data-line]");

const CaughtLayer = document.createElement("section");
CaughtLayer.id = "CaughtR94";
CaughtLayer.innerHTML = `<div class="CaughtFrameR94"><small>THE AISLE WENT QUIET</small><h2>CAUGHT</h2><p>The thing wearing Mason's face reached you. The run ends here.</p><button type="button">TRY AGAIN</button></div>`;
document.body.appendChild(CaughtLayer);
CaughtLayer.querySelector("button").addEventListener("click", () => location.reload());

function UiOpen() {
  return Boolean(window.__STORE_UI_MODAL_OPEN_R96__ || window.__STORE_UI_MODAL_OPEN_R95__);
}
function GameplayVisible() {
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function ProfileSprite(Text) {
  const Canvas = document.createElement("canvas");
  Canvas.width = 384;
  Canvas.height = 72;
  const Context = Canvas.getContext("2d");
  Context.fillStyle = "rgba(6,8,6,.82)";
  Context.fillRect(26, 14, 332, 44);
  Context.strokeStyle = "rgba(208,173,127,.34)";
  Context.strokeRect(26, 14, 332, 44);
  Context.fillStyle = "#e2d4bb";
  Context.textAlign = "center";
  Context.textBaseline = "middle";
  Context.font = "800 18px Arial";
  Context.fillText(Text, 192, 36);
  const Texture = new THREE.CanvasTexture(Canvas);
  Texture.colorSpace = THREE.SRGBColorSpace;
  const Sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: Texture, transparent: true, depthWrite: false }));
  Sprite.scale.set(1.05, 0.20, 1);
  Sprite.position.y = 2.02;
  return Sprite;
}

function AddDesignerAccessories(Root) {
  const Apron = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.54, 0.035), new THREE.MeshStandardMaterial({ color: 0x5e5845, roughness: 0.92 }));
  Apron.position.set(0, 1.18, 0.14);
  Root.add(Apron);
  const Clipboard = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.37, 0.028), new THREE.MeshStandardMaterial({ color: 0x8b6848, roughness: 0.86 }));
  Clipboard.position.set(0.36, 1.02, 0.17);
  Clipboard.rotation.set(-0.22, 0, -0.20);
  Root.add(Clipboard);
  const Dark = new THREE.MeshStandardMaterial({ color: 0x2d302d, metalness: 0.45, roughness: 0.5 });
  for (const X of [-0.09, 0.09]) {
    const Lens = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 5, 10), Dark);
    Lens.position.set(X, 1.65, 0.16);
    Root.add(Lens);
  }
}

function NormalizeModel(Source) {
  const Model = SkeletonUtils.clone(Source);
  Model.updateMatrixWorld(true);
  const Bounds = new THREE.Box3().setFromObject(Model);
  Bounds.getSize(TempA);
  Model.scale.setScalar(1.80 / Math.max(TempA.y, 0.001));
  Model.updateMatrixWorld(true);
  const Scaled = new THREE.Box3().setFromObject(Model);
  Scaled.getCenter(TempA);
  Model.position.x -= TempA.x;
  Model.position.z -= TempA.z;
  Model.updateMatrixWorld(true);
  const Ground = new THREE.Box3().setFromObject(Model);
  Model.position.y -= Ground.min.y;
  Model.traverse(Object => {
    if (!Object.isMesh) return;
    Object.castShadow = false;
    Object.receiveShadow = false;
    Object.frustumCulled = true;
  });
  return Model;
}

function CaptureBones(Model) {
  const Names = ["Abdomen", "Torso", "Chest", "Neck", "Head", "UpperArm.L", "UpperArm.R", "LowerArm.L", "LowerArm.R", "UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R"];
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

function Rotate(Npc, Name, X = 0, Y = 0, Z = 0) {
  const Bone = Npc.Bones.Map.get(Name);
  if (!Bone) return;
  TempEuler.set(X, Y, Z, "XYZ");
  TempQuaternion.setFromEuler(TempEuler);
  Bone.quaternion.multiply(TempQuaternion).normalize();
}
function ResetBones(Npc) {
  for (const [Name, Bone] of Npc.Bones.Map) Bone.quaternion.copy(Npc.Bones.Base.get(Name));
}

function BuildTeeth(Npc) {
  if (Npc.Mouth) return Npc.Mouth;
  const Head = Npc.Bones.Map.get("Head");
  if (!Head) return null;
  const Mouth = new THREE.Group();
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

async function CreateNpc({ x = 0, z = 0, mimic = false, checkIn = false } = {}) {
  const Asset = await ModelPromise;
  const Root = new THREE.Group();
  Root.name = mimic ? "MasonMimicR94" : checkIn ? "MasonCheckInR94" : "MasonDesignerR94";
  const BodyRoot = new THREE.Group();
  const Model = NormalizeModel(Asset.scene);
  BodyRoot.add(Model);
  Root.add(BodyRoot);
  AddDesignerAccessories(Root);
  const Label = ProfileSprite("MASON • FLOOR DESIGNER");
  Root.add(Label);
  Root.position.set(x, 0, z);
  const Npc = { Root, BodyRoot, Model, Label, Bones: CaptureBones(Model), IsMimic: mimic, IsCheckIn: checkIn, State: "idle", Time: Math.random() * 8, TransformStartedAt: 0, Removed: false, Mouth: null };
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
    const T = THREE.MathUtils.clamp((Now - Npc.TransformStartedAt) / 1350, 0, 1);
    Npc.BodyRoot.scale.set(0.96, 1 + T * 0.34, 0.97);
    Rotate(Npc, "Torso", -0.08 - T * 0.30, 0, Math.sin(Npc.Time * 9) * T * 0.08);
    Rotate(Npc, "Head", -T * 0.26, Math.sin(Npc.Time * 11) * T * 0.10, 0);
    Rotate(Npc, "UpperArm.L", -T * 0.82, 0, 0.85 + T * 0.25);
    Rotate(Npc, "UpperArm.R", -T * 0.82, 0, -0.85 - T * 0.25);
    if (Npc.Mouth) Npc.Mouth.scale.setScalar(Math.max(0.001, T));
    if (T >= 1) StartChase(Npc);
  } else if (Npc.State === "chase") {
    const Run = Math.sin(Npc.Time * 12.5);
    Rotate(Npc, "Torso", 0.18, 0, Run * 0.035);
    Rotate(Npc, "UpperLeg.L", Run * 0.72, 0, 0);
    Rotate(Npc, "UpperLeg.R", -Run * 0.72, 0, 0);
    Rotate(Npc, "LowerLeg.L", Math.max(0, -Run) * 0.52, 0, 0);
    Rotate(Npc, "LowerLeg.R", Math.max(0, Run) * 0.52, 0, 0);
    Rotate(Npc, "UpperArm.L", -Run * 0.62, 0, 0.38);
    Rotate(Npc, "UpperArm.R", Run * 0.62, 0, -0.38);
  } else if (Npc.State === "capture") {
    Rotate(Npc, "UpperArm.L", -1.12, 0, 0.42);
    Rotate(Npc, "UpperArm.R", -1.12, 0, -0.42);
    Rotate(Npc, "LowerArm.L", -0.68, 0, 0);
    Rotate(Npc, "LowerArm.R", -0.68, 0, 0);
  } else {
    Rotate(Npc, "UpperArm.L", -0.08, 0, 0.58);
    Rotate(Npc, "UpperArm.R", -0.13, 0, -0.62);
    Rotate(Npc, "Head", 0, Math.sin(Npc.Time * 0.8) * 0.035, 0);
  }
  Npc.Model.updateMatrixWorld(true);
}

function RequestOptions() {
  const Names = new Set();
  for (const Record of Carry.ListFurniture()) {
    if (!Record?.Object?.parent || Record.Object.userData?.DeliveredR94) continue;
    const Name = Record.Name || Carry.FriendlyName(Record.Object);
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

function UpdateRequestBadge(Force = false) {
  const Visible = Boolean(RequestName && !Captured && GameplayVisible() && !UiOpen());
  if (Force || RequestName !== LastBadgeText) {
    LastBadgeText = RequestName;
    RequestStrong.textContent = RequestName;
  }
  if (Force || Visible !== LastBadgeVisible) {
    LastBadgeVisible = Visible;
    RequestBadge.style.display = Visible ? "block" : "none";
  }
}
function ScheduleCheckIn() {
  NextCheckInAt = performance.now() + CHECKIN_MIN_MS + Math.random() * (CHECKIN_MAX_MS - CHECKIN_MIN_MS);
}
function FacePlayer(Npc) {
  Npc?.Root?.lookAt(Game.Camera.position.x, 1.0, Game.Camera.position.z);
}

function StartDialogue(Npc, Text, Duration = 2800, OnDone = null, SpeakerName = "MASON • FLOOR DESIGNER") {
  if (Cutscene || Captured || !Npc) return;
  window.__STORE_GAMEPLAY_LOCKED_R94__ = true;
  if (document.pointerLockElement) document.exitPointerLock?.();
  FacePlayer(Npc);
  Npc.State = "talk";
  Speaker.textContent = SpeakerName;
  Line.textContent = Text;
  CutsceneLayer.classList.add("Show");
  const StartPosition = Game.Camera.position.clone();
  TempA.copy(StartPosition).sub(Npc.Root.position).setY(0);
  if (TempA.lengthSq() < 0.01) TempA.set(0, 0, 1);
  TempA.normalize();
  const Desired = Npc.Root.position.clone().addScaledVector(TempA, 2.25);
  Desired.y = 1.55;
  const Now = performance.now();
  Cutscene = { Npc, StartAt: Now, EndAt: Now + Duration, StartPosition, Desired, OnDone };
}

function UpdateCutscene(Now) {
  if (!Cutscene) return;
  const Record = Cutscene;
  const T = THREE.MathUtils.clamp((Now - Record.StartAt) / 600, 0, 1);
  const Smooth = T * T * (3 - 2 * T);
  Game.Camera.position.lerpVectors(Record.StartPosition, Record.Desired, Smooth);
  TempA.copy(Record.Npc.Root.position);
  TempA.y += 1.38;
  Game.Camera.lookAt(TempA);
  if (Now < Record.EndAt) return;
  CutsceneLayer.classList.remove("Show");
  if (Record.Npc.State === "talk") Record.Npc.State = "idle";
  Cutscene = null;
  window.__STORE_GAMEPLAY_LOCKED_R94__ = false;
  Record.OnDone?.();
}

function HandleMasonTalk(Npc) {
  if (Cutscene || Captured) return;
  const Held = Carry.GetHeld();
  if (!RequestName) {
    RequestName = PickRequest();
    UpdateRequestBadge(true);
    ScheduleCheckIn();
    StartDialogue(Npc, `I handle the floor displays. Bring me a ${RequestName}. Pick it up and carry it back here.`, 4000);
    return;
  }
  if (Held?.name === RequestName) {
    const Result = Carry.ConsumeHeld(Item => Item.name === RequestName);
    if (Result.ok) {
      const Finished = RequestName;
      RequestsCompleted += 1;
      RequestName = "";
      UpdateRequestBadge(true);
      StartDialogue(Npc, `That's the ${Finished}. Good. I'll work out what I need next.`, 3000, () => {
        setTimeout(() => {
          if (Captured || RequestName) return;
          RequestName = PickRequest();
          UpdateRequestBadge(true);
          Carry.ShowTransient(`NEW REQUEST • ${RequestName}`);
          ScheduleCheckIn();
        }, 12000);
      });
      return;
    }
  }
  if (Held) StartDialogue(Npc, `That's not it. I still need a ${RequestName}.`, 2400);
  else StartDialogue(Npc, `I'm still waiting on the ${RequestName}.`, 2200);
}

function BeginMimicReveal(Npc) {
  if (!Npc?.IsMimic || Captured || Npc.State === "transform" || Npc.State === "chase") return;
  window.__STORE_GAMEPLAY_LOCKED_R94__ = true;
  FacePlayer(Npc);
  Npc.State = "transform";
  Npc.TransformStartedAt = performance.now();
  Npc.Label.visible = false;
  BuildTeeth(Npc);
  Speaker.textContent = "MASON?";
  Line.textContent = "You brought it all this way...";
  CutsceneLayer.classList.add("Show");
  if (document.pointerLockElement) document.exitPointerLock?.();
  const Now = performance.now();
  Cutscene = {
    Npc,
    StartAt: Now,
    EndAt: Now + 1380,
    StartPosition: Game.Camera.position.clone(),
    Desired: Game.Camera.position.clone(),
    OnDone: () => StartChase(Npc)
  };
}

function HandleCheckInTalk(Npc) {
  if (Npc.IsMimic) {
    StartDialogue(Npc, "Hey. Come closer. I wanted to check what you found.", 1350, () => BeginMimicReveal(Npc));
    return;
  }
  const Held = Carry.GetHeld();
  if (Held?.name === RequestName) {
    HandleMasonTalk(Npc);
    setTimeout(() => { if (!Npc.Removed && Npc.State === "idle") RemoveNpc(Npc); }, 4200);
    return;
  }
  StartDialogue(Npc, RequestName ? `Just checking in. I'm still waiting on the ${RequestName}.` : "Keep going. I'll check the next section.", 2300, () => RemoveNpc(Npc));
}

function InteractionCandidate() {
  if (!GameplayVisible() || UiOpen() || Cutscene || Captured) return null;
  let BestNpc = null;
  let BestDistance = TALK_DISTANCE;
  for (const Npc of Npcs) {
    if (Npc.Removed || ["transform", "chase", "capture"].includes(Npc.State)) continue;
    const DX = Npc.Root.position.x - Game.Camera.position.x;
    const DZ = Npc.Root.position.z - Game.Camera.position.z;
    const Distance = Math.hypot(DX, DZ);
    if (Distance >= BestDistance) continue;
    BestNpc = Npc;
    BestDistance = Distance;
  }
  if (!BestNpc) return null;
  const Held = Carry.GetHeld();
  return {
    priority: 100,
    distance: BestDistance,
    text: !BestNpc.IsMimic && Held?.name === RequestName ? `E • GIVE ${Held.name} TO MASON` : "E • TALK TO MASON",
    activate: () => BestNpc.IsCheckIn ? HandleCheckInTalk(BestNpc) : HandleMasonTalk(BestNpc)
  };
}
Carry.RegisterInteraction("mason-r96", InteractionCandidate);

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
  TempA.set(Game.Camera.position.x - Npc.Root.position.x, 0, Game.Camera.position.z - Npc.Root.position.z);
  const Distance = TempA.length();
  if (Distance <= MIMIC_CAPTURE_DISTANCE) return CapturePlayer(Npc);
  if (Distance < 0.001) return;
  TempA.normalize();
  const Step = MIMIC_SPEED * Delta;
  const BaseX = Npc.Root.position.x;
  const BaseZ = Npc.Root.position.z;
  for (const Angle of [0, 0.48, -0.48, 0.90, -0.90]) {
    const C = Math.cos(Angle), S = Math.sin(Angle);
    const X = TempA.x * C - TempA.z * S;
    const Z = TempA.x * S + TempA.z * C;
    TempB.set(BaseX + X * Step, 1.68, BaseZ + Z * Step);
    if (EntryBlocks(TempB, 0.34)) continue;
    Npc.Root.position.x = TempB.x;
    Npc.Root.position.z = TempB.z;
    Npc.Root.lookAt(Game.Camera.position.x, 0.9, Game.Camera.position.z);
    return;
  }
}

function StartChase(Npc) {
  if (!Npc || Npc.Removed || Captured || Npc.State === "chase") return;
  Npc.State = "chase";
  Npc.BodyRoot.scale.set(0.96, 1.34, 0.97);
  if (Npc.Mouth) Npc.Mouth.scale.setScalar(1);
  CutsceneLayer.classList.remove("Show");
  Cutscene = null;
  window.__STORE_GAMEPLAY_LOCKED_R94__ = false;
  Carry.ShowTransient("RUN");
}

function CapturePlayer(Npc) {
  if (Captured) return;
  Captured = true;
  Npc.State = "capture";
  window.__STORE_GAMEPLAY_LOCKED_R94__ = true;
  if (document.pointerLockElement) document.exitPointerLock?.();
  UpdateRequestBadge(true);
  const StartAt = performance.now();
  const StartPosition = Game.Camera.position.clone();
  const Update = Now => {
    const T = THREE.MathUtils.clamp((Now - StartAt) / 800, 0, 1);
    TempA.copy(Npc.Root.position);
    TempA.y += 1.38;
    Game.Camera.position.x = THREE.MathUtils.lerp(StartPosition.x, Npc.Root.position.x, T * 0.20);
    Game.Camera.position.z = THREE.MathUtils.lerp(StartPosition.z, Npc.Root.position.z, T * 0.20);
    Game.Camera.lookAt(TempA);
    if (T < 1) requestAnimationFrame(Update);
    else CaughtLayer.classList.add("Show");
  };
  requestAnimationFrame(Update);
}

async function SpawnInitialMason() {
  if (Mason || SpawnStarted || Captured) return;
  SpawnStarted = true;
  try {
    Mason = await CreateNpc({ x: -6.4, z: 3.6 });
    Mason.Root.lookAt(0, 1.0, 7.2);
  } finally {
    SpawnStarted = false;
  }
}

async function SpawnCheckIn() {
  if (CheckIn || Captured || !RequestName || !GameplayVisible() || UiOpen() || Cutscene) return;
  const Mimic = CheckInCount >= 2 && Math.random() < 0.28;
  CheckInCount += 1;
  const SideChoices = [-9.8, 9.8, -6.8, 6.8];
  let X = SideChoices[Math.floor(Math.random() * SideChoices.length)];
  const Z = Game.Camera.position.z - 14 - Math.random() * 5;
  for (const CandidateX of SideChoices) {
    TempA.set(CandidateX, 1.68, Z);
    if (!EntryBlocks(TempA, 0.42)) { X = CandidateX; break; }
  }
  CheckIn = await CreateNpc({ x: X, z: Z, mimic: Mimic, checkIn: true });
  FacePlayer(CheckIn);
  ScheduleCheckIn();
}

function LogicTick(Now) {
  if (Now - LastLogicAt < 500) return;
  LastLogicAt = Now;
  if (GameplayVisible() && !Mason) SpawnInitialMason().catch(Error => console.warn("Mason failed to load", Error));
  if (Now >= NextCheckInAt && !CheckIn) SpawnCheckIn().catch(Error => console.warn("Designer check-in failed", Error));
  if (CheckIn && !["chase", "transform", "capture"].includes(CheckIn.State) && Cutscene?.Npc !== CheckIn) {
    const Distance = Math.hypot(CheckIn.Root.position.x - Game.Camera.position.x, CheckIn.Root.position.z - Game.Camera.position.z);
    if (Distance > 42 || Game.Camera.position.z < CheckIn.Root.position.z - 11) RemoveNpc(CheckIn);
  }
  UpdateRequestBadge();
}

function Frame(Now) {
  requestAnimationFrame(Frame);
  if (UiOpen() && !Cutscene) {
    LastFrameAt = Now;
    UpdateRequestBadge();
    return;
  }
  if (Now - LastFrameAt < FRAME_MS) return;
  const Delta = Math.min(0.05, Math.max(0.001, (Now - LastFrameAt) / 1000));
  LastFrameAt = Now;
  LogicTick(Now);
  if (!GameplayVisible() && !Cutscene) return;
  for (const Npc of Npcs) {
    const DistanceSq = (Npc.Root.position.x - Game.Camera.position.x) ** 2 + (Npc.Root.position.z - Game.Camera.position.z) ** 2;
    if (DistanceSq < 2500 || Npc.State === "chase" || Cutscene?.Npc === Npc) AnimateNpc(Npc, Delta, Now);
    if (Npc.State === "chase" && !Captured && Now - LastChaseAt >= CHASE_STEP_MS) TryChaseStep(Npc, Math.min(0.08, (Now - LastChaseAt) / 1000 || 0.05));
  }
  if (Now - LastChaseAt >= CHASE_STEP_MS) LastChaseAt = Now;
  UpdateCutscene(Now);
}

requestAnimationFrame(Frame);
window.__STORE_FURNITURE_STORY_R94__ = {
  GetRequest: () => RequestName,
  GetDesigner: () => Mason,
  GetCheckIn: () => CheckIn,
  ForceCheckIn: () => { NextCheckInAt = performance.now(); },
  GetCompletedRequests: () => RequestsCompleted
};
window.__STORE_FURNITURE_STORY_BUILD__ = "V0.30.2-R96";