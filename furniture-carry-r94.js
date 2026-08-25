import * as THREE from "three";

const Game = window.__STORE_GAME__;
const Player = window.__STORE_PLAYER__;
if (!Game?.Scene || !Game?.Camera || !Game?.ActiveChunks || !Game?.PreparedChunks || !Game?.CollisionBoxes || !Player) {
  throw new Error("Game and player must load before furniture carry system.");
}

const FurnitureNames = new Set([
  "Couch_Large1", "Couch_L", "Chair_2", "Table_RoundLarge", "Bed_King", "Bed_Single",
  "NightStand_2", "Shelf_Large", "Bookshelf", "Kitchen_Cabinet1", "Kitchen_Fridge",
  "Kitchen_Oven", "Kitchen_Sink", "Bathroom_Bathtub", "Bathroom_Toilet", "Light_Floor1",
  "RetailArmchairR79", "RetailLivingShelfR79", "RetailBedroomCabinetR79", "RetailBedroomChairR79",
  "RetailStorageShelfR79", "RetailStorageCabinetR79", "RetailDisplayCabinetR79"
]);
const KnownWeights = new Map([
  ["Chair_2", 12], ["RetailBedroomChairR79", 19], ["RetailArmchairR79", 23],
  ["NightStand_2", 15], ["Table_RoundLarge", 26], ["Shelf_Large", 30], ["Bookshelf", 31],
  ["Couch_L", 37], ["Couch_Large1", 42], ["Bed_Single", 38], ["Bed_King", 48],
  ["Kitchen_Cabinet1", 31], ["Kitchen_Fridge", 54], ["Kitchen_Oven", 45], ["Kitchen_Sink", 35],
  ["Bathroom_Bathtub", 49], ["Bathroom_Toilet", 32], ["Light_Floor1", 16],
  ["RetailLivingShelfR79", 29], ["RetailBedroomCabinetR79", 34], ["RetailStorageShelfR79", 32],
  ["RetailStorageCabinetR79", 37], ["RetailDisplayCabinetR79", 39]
]);

const Hud = document.getElementById("Hud");
const TempCenter = new THREE.Vector3();
const TempSize = new THREE.Vector3();
const TempForward = new THREE.Vector3();
const TempLocal = new THREE.Vector3();
const TempEuler = new THREE.Euler();
const TempQuaternion = new THREE.Quaternion();
const TempBox = new THREE.Box3();
const InteractionProviders = new Map();
const FurnitureById = new Map();
let FurnitureRecords = [];
let IndexSignature = "";
let Held = null;
let CurrentCandidate = null;
let LastCandidateRefresh = -Infinity;
let LastIndexCheck = -Infinity;
let LastAnimationAt = performance.now();
let CarryPhase = 0;
let CarryMove = 0;
let LastCameraX = Game.Camera.position.x;
let LastCameraZ = Game.Camera.position.z;
let CarryPose = null;

const Prompt = document.createElement("div");
Prompt.id = "InteractionHintR94";
Prompt.style.cssText = "position:fixed;left:50%;bottom:17%;z-index:82;transform:translateX(-50%);display:none;pointer-events:none;padding:8px 12px;border:1px solid rgba(203,166,116,.32);background:#080a08;color:#e7dbc5;font:850 11px Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase";
document.body.appendChild(Prompt);

const CarryBadge = document.createElement("div");
CarryBadge.id = "CarryBadgeR94";
CarryBadge.style.cssText = "position:fixed;right:16px;bottom:94px;z-index:73;display:none;pointer-events:none;min-width:145px;padding:9px 11px;border:1px solid rgba(184,135,83,.22);background:#080908;color:rgba(226,214,193,.78);font:800 10px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase";
document.body.appendChild(CarryBadge);

function UiOpen() {
  return Boolean(window.__STORE_UI_MODAL_OPEN_R96__ || window.__STORE_UI_MODAL_OPEN_R95__);
}

function GameplayVisible() {
  return Boolean(Hud && !Hud.classList.contains("Hidden"));
}

function FriendlyName(Object) {
  const Given = String(Object?.userData?.RetailLabel || "").trim();
  if (Given) return Given.toUpperCase();
  const Name = String(Object?.name || "FURNITURE");
  if (/Couch/i.test(Name)) return "SOFA";
  if (/Armchair|Chair/i.test(Name)) return "ARMCHAIR";
  if (/DiningTable|CoffeeTable|SideTable|Table/i.test(Name)) return "TABLE";
  if (/Bed_King/i.test(Name)) return "KING BED";
  if (/Bed/i.test(Name)) return "BED";
  if (/NightStand/i.test(Name)) return "NIGHTSTAND";
  if (/Bookshelf/i.test(Name)) return "BOOKSHELF";
  if (/Shelf/i.test(Name)) return "SHELF";
  if (/Cabinet/i.test(Name)) return "CABINET";
  if (/Fridge/i.test(Name)) return "FRIDGE";
  if (/Oven/i.test(Name)) return "OVEN";
  if (/Sink/i.test(Name)) return "SINK";
  if (/Bathtub/i.test(Name)) return "BATHTUB";
  if (/Toilet/i.test(Name)) return "TOILET";
  if (/Light/i.test(Name)) return "FLOOR LAMP";
  return Name.replace(/[_-]+/g, " ").replace(/R\d+/gi, "").trim().toUpperCase();
}

function IsFurniture(Object) {
  if (!Object?.isObject3D || !Object.parent || Object.userData?.DeliveredR94) return false;
  if (FurnitureNames.has(Object.name)) return true;
  if (Object.userData?.RetailSellableR84) return true;
  return /^Retail(CoffeeTable|SideTable|DiningTable|BoxShelf)R84/i.test(String(Object.name || ""));
}

function ComputeWeight(Object, Size) {
  if (KnownWeights.has(Object?.name)) return KnownWeights.get(Object.name);
  const Volume = Math.max(0.1, Size.x * Size.y * Size.z);
  return Math.round(THREE.MathUtils.clamp(10 + Math.pow(Volume, 0.58) * 8.2, 10, 55));
}

function SpeedMultiplier(Weight) {
  return THREE.MathUtils.clamp(0.94 - Number(Weight || 0) * 0.0058, 0.62, 0.90);
}

function MeasureRecord(Record) {
  const Object = Record.Object;
  if (!Object?.parent) return false;
  Object.updateWorldMatrix(true, true);
  TempBox.setFromObject(Object);
  if (TempBox.isEmpty()) return false;
  TempBox.getCenter(TempCenter);
  TempBox.getSize(TempSize);
  Record.MinX = TempBox.min.x;
  Record.MaxX = TempBox.max.x;
  Record.MinZ = TempBox.min.z;
  Record.MaxZ = TempBox.max.z;
  Record.CenterX = TempCenter.x;
  Record.CenterZ = TempCenter.z;
  Record.Weight = ComputeWeight(Object, TempSize);
  Record.Name = FriendlyName(Object);
  return true;
}

function AddRecord(Object, Chunk) {
  if (!IsFurniture(Object) || FurnitureById.has(Object.uuid)) return;
  const Record = { Object, Chunk, MinX: 0, MaxX: 0, MinZ: 0, MaxZ: 0, CenterX: 0, CenterZ: 0, Weight: 20, Name: "FURNITURE" };
  if (!MeasureRecord(Record)) return;
  FurnitureById.set(Object.uuid, Record);
  FurnitureRecords.push(Record);
}

function BuildIndexSignature() {
  const Parts = [];
  for (const [Id, Chunk] of Game.ActiveChunks) Parts.push(`A${Id}:${Chunk?.Models?.length || 0}:${Chunk?.Group?.children?.length || 0}`);
  for (const [Id, Chunk] of Game.PreparedChunks) Parts.push(`P${Id}:${Chunk?.Models?.length || 0}:${Chunk?.Group?.children?.length || 0}`);
  return Parts.sort().join("|");
}

function RefreshFurnitureIndex(Force = false) {
  if (UiOpen() && !Force) return FurnitureRecords;
  const Signature = BuildIndexSignature();
  if (!Force && Signature === IndexSignature) return FurnitureRecords;
  IndexSignature = Signature;
  for (const Collection of [Game.ActiveChunks, Game.PreparedChunks]) {
    for (const Chunk of Collection.values()) {
      for (const Model of Chunk?.Models || []) AddRecord(Model, Chunk);
      for (const Object of Chunk?.Group?.children || []) AddRecord(Object, Chunk);
    }
  }
  FurnitureRecords = FurnitureRecords.filter(Record => {
    if (Record.Object?.parent && !Record.Object.userData?.DeliveredR94) return true;
    FurnitureById.delete(Record.Object?.uuid);
    return false;
  });
  return FurnitureRecords;
}

function DistanceToCachedBounds(Record) {
  const X = Game.Camera.position.x;
  const Z = Game.Camera.position.z;
  const DX = X < Record.MinX ? Record.MinX - X : X > Record.MaxX ? X - Record.MaxX : 0;
  const DZ = Z < Record.MinZ ? Record.MinZ - Z : Z > Record.MaxZ ? Z - Record.MaxZ : 0;
  return Math.hypot(DX, DZ);
}

function NearestFurniture(MaxDistance = 2.15) {
  if (Held) return null;
  let Best = null;
  let BestDistance = MaxDistance;
  const X = Game.Camera.position.x;
  const Z = Game.Camera.position.z;
  for (const Record of FurnitureRecords) {
    const Object = Record.Object;
    if (!Object?.parent || Object.userData?.CarriedR94 || Object.userData?.DeliveredR94) continue;
    const RoughDX = Record.CenterX - X;
    const RoughDZ = Record.CenterZ - Z;
    if (RoughDX * RoughDX + RoughDZ * RoughDZ > 36) continue;
    const Distance = DistanceToCachedBounds(Record);
    if (Distance >= BestDistance) continue;
    Best = Record;
    BestDistance = Distance;
  }
  return Best ? { Record: Best, Distance: BestDistance, Object: Best.Object, Chunk: Best.Chunk, Name: Best.Name, Weight: Best.Weight } : null;
}

function IsRelatedEntry(Entry, Object) {
  return Boolean(Entry && Object && (Entry.CollisionObject === Object || Entry.SourceModel === Object || Entry.Model === Object));
}

function RemoveFurnitureCollision(Object, Chunk) {
  for (let Index = Game.CollisionBoxes.length - 1; Index >= 0; Index -= 1) {
    if (IsRelatedEntry(Game.CollisionBoxes[Index], Object)) Game.CollisionBoxes.splice(Index, 1);
  }
  if (!Chunk?.CollisionEntries) return;
  for (let Index = Chunk.CollisionEntries.length - 1; Index >= 0; Index -= 1) {
    if (IsRelatedEntry(Chunk.CollisionEntries[Index], Object)) Chunk.CollisionEntries.splice(Index, 1);
  }
}

function SetSourceVisible(Object, Visible) {
  Object.visible = Visible;
  Object.traverse(Child => {
    if (Child.isMesh || Child.isSprite) Child.visible = Visible;
  });
}

function FindPriceTags(Object, Chunk) {
  const Result = [];
  Chunk?.Group?.traverse?.(Item => {
    if (Item.userData?.SourceModel === Object) Result.push(Item);
  });
  return Result;
}

function BuildCarryVisual(Source) {
  const VisualRoot = new THREE.Group();
  VisualRoot.name = "HeldFurnitureR94";
  const Visual = Source.clone(true);
  Visual.position.set(0, 0, 0);
  Visual.quaternion.identity();
  Visual.traverse(Object => {
    if (!Object.isMesh) return;
    Object.castShadow = false;
    Object.receiveShadow = false;
    Object.frustumCulled = true;
  });
  VisualRoot.add(Visual);
  VisualRoot.updateMatrixWorld(true);
  TempBox.setFromObject(VisualRoot);
  TempBox.getCenter(TempCenter);
  TempBox.getSize(TempSize);
  Visual.position.sub(TempCenter);
  const Scale = Math.min(1, 1.45 / Math.max(TempSize.x, TempSize.y, TempSize.z, 0.01));
  VisualRoot.scale.setScalar(Scale);
  VisualRoot.position.set(0, 1.12, 0.72);
  VisualRoot.rotation.set(-0.04, Math.PI, 0);
  return VisualRoot;
}

function PlayerPivot() {
  return Game.Scene.getObjectByName("PlayerCharacterPivot") || null;
}

function Pickup(Candidate) {
  if (!Candidate?.Object || Held) return false;
  const Pivot = PlayerPivot();
  if (!Pivot) return false;
  const Record = Candidate.Record || FurnitureById.get(Candidate.Object.uuid) || Candidate;
  const Object = Record.Object;
  const PriceTags = FindPriceTags(Object, Record.Chunk);
  const Visual = BuildCarryVisual(Object);
  RemoveFurnitureCollision(Object, Record.Chunk);
  SetSourceVisible(Object, false);
  Object.userData.CarriedR94 = true;
  for (const Tag of PriceTags) Tag.visible = false;
  Pivot.add(Visual);
  Held = {
    Record,
    Object,
    Chunk: Record.Chunk,
    Visual,
    PriceTags,
    Parent: Object.parent,
    Weight: Record.Weight,
    Name: Record.Name
  };
  CarryBadge.style.display = "block";
  CarryBadge.textContent = `${Held.Name} • ${Held.Weight} KG • Q DROP`;
  window.dispatchEvent(new CustomEvent("store-furniture-picked", { detail: GetHeld() }));
  return true;
}

function PositionBlocked(Position) {
  const Radius = 0.48;
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

function Drop() {
  if (!Held) return false;
  Game.Camera.getWorldDirection(TempForward);
  TempForward.y = 0;
  if (TempForward.lengthSq() < 0.001) TempForward.set(0, 0, -1);
  TempForward.normalize();
  const Position = TempCenter.copy(Game.Camera.position).addScaledVector(TempForward, 1.55);
  if (PositionBlocked(Position)) {
    ShowTransient("NO ROOM TO DROP HERE");
    return false;
  }
  const State = Held;
  const Record = State.Record;
  const Source = State.Object;
  const Parent = State.Parent;
  if (!Parent || !Record) return false;
  TempLocal.copy(Position);
  Parent.worldToLocal(TempLocal);
  Source.position.x = TempLocal.x;
  Source.position.z = TempLocal.z;
  Source.userData.CarriedR94 = false;
  SetSourceVisible(Source, true);
  for (const Tag of State.PriceTags) Tag.visible = true;
  State.Visual.parent?.remove(State.Visual);
  Held = null;
  CarryBadge.style.display = "none";
  MeasureRecord(Record);
  queueMicrotask(() => window.__STORE_CORE_FIX_R86__?.ProcessChunk?.(Record.Chunk));
  window.dispatchEvent(new CustomEvent("store-furniture-dropped", { detail: { object: Source, name: Record.Name, weight: Record.Weight } }));
  return true;
}

function ConsumeHeld(Matcher = null) {
  if (!Held) return { ok: false };
  const PublicHeld = GetHeld();
  if (Matcher && !Matcher(PublicHeld)) return { ok: false, mismatch: true, held: PublicHeld };
  const State = Held;
  const Record = State.Record;
  if (!Record) return { ok: false };
  Record.Object.userData.CarriedR94 = false;
  Record.Object.userData.DeliveredR94 = true;
  SetSourceVisible(Record.Object, false);
  for (const Tag of State.PriceTags) Tag.visible = false;
  State.Visual.parent?.remove(State.Visual);
  FurnitureById.delete(Record.Object.uuid);
  FurnitureRecords = FurnitureRecords.filter(Item => Item !== Record);
  Held = null;
  CarryBadge.style.display = "none";
  window.dispatchEvent(new CustomEvent("store-furniture-delivered", { detail: PublicHeld }));
  return { ok: true, delivered: PublicHeld };
}

function GetHeld() {
  if (!Held) return null;
  return { object: Held.Object, name: Held.Name, weight: Held.Weight, speedMultiplier: SpeedMultiplier(Held.Weight) };
}

function ShowTransient(Text) {
  Prompt.textContent = Text;
  Prompt.style.display = "block";
  clearTimeout(ShowTransient.Timer);
  ShowTransient.Timer = setTimeout(() => {
    if (!CurrentCandidate) Prompt.style.display = "none";
  }, 900);
}

function RegisterInteraction(Id, Provider) {
  InteractionProviders.set(String(Id), Provider);
  return () => InteractionProviders.delete(String(Id));
}

function BuiltInCarryCandidate() {
  if (window.__STORE_GAMEPLAY_LOCKED_R94__) return null;
  const Furniture = NearestFurniture();
  if (!Furniture) return null;
  return {
    id: "pickup",
    priority: 10,
    distance: Furniture.Distance,
    text: `E • PICK UP ${Furniture.Name}`,
    activate: () => Pickup(Furniture)
  };
}

function BestCandidate() {
  let Best = BuiltInCarryCandidate();
  for (const [Id, Provider] of InteractionProviders) {
    let Candidate = null;
    try { Candidate = typeof Provider === "function" ? Provider() : Provider?.GetCandidate?.(); } catch {}
    if (!Candidate) continue;
    Candidate.id ||= Id;
    const AP = Number(Candidate.priority || 0);
    const BP = Number(Best?.priority || 0);
    if (!Best || AP > BP || (AP === BP && Number(Candidate.distance || Infinity) < Number(Best.distance || Infinity))) Best = Candidate;
  }
  return Best;
}

function RefreshPrompt(Now = performance.now()) {
  if (UiOpen() || !GameplayVisible()) {
    CurrentCandidate = null;
    Prompt.style.display = "none";
    return;
  }
  if (Now - LastIndexCheck >= 1000) {
    LastIndexCheck = Now;
    RefreshFurnitureIndex(false);
  }
  if (Now - LastCandidateRefresh < 125) return;
  LastCandidateRefresh = Now;
  CurrentCandidate = BestCandidate();
  if (!CurrentCandidate) {
    Prompt.style.display = "none";
    return;
  }
  const Text = String(CurrentCandidate.text || "E • INTERACT");
  if (Prompt.textContent !== Text) Prompt.textContent = Text;
  if (Prompt.style.display !== "block") Prompt.style.display = "block";
}

function Bone(Root, Name) {
  const Object = Root?.getObjectByName?.(Name);
  return Object?.isBone ? Object : null;
}

function RotateBone(Object, X = 0, Y = 0, Z = 0) {
  if (!Object) return;
  TempEuler.set(X, Y, Z, "XYZ");
  TempQuaternion.setFromEuler(TempEuler);
  Object.quaternion.multiply(TempQuaternion).normalize();
}

function EnsureCarryPose(Root) {
  if (CarryPose?.Root === Root) return CarryPose;
  const Names = ["Torso", "Chest", "UpperArm.L", "UpperArm.R", "LowerArm.L", "LowerArm.R", "Wrist.L", "Wrist.R"];
  const Bones = Names.map(Name => Bone(Root, Name)).filter(Boolean);
  CarryPose = { Root, Bones, Saved: Bones.map(() => new THREE.Quaternion()) };
  return CarryPose;
}

if (!Player.__FurnitureCarryR96Wrapped) {
  const OriginalSpeed = Player.GetMovementSpeed.bind(Player);
  Player.GetMovementSpeed = function FurnitureWeightedSpeed(...Args) {
    const Base = OriginalSpeed(...Args);
    if (window.__STORE_GAMEPLAY_LOCKED_R94__) return 0;
    return Held ? Base * SpeedMultiplier(Held.Weight) : Base;
  };

  const OriginalRender = Player.Render.bind(Player);
  Player.Render = function FurnitureCarryRender(Renderer, Scene, Camera) {
    if (!Held || UiOpen()) return OriginalRender(Renderer, Scene, Camera);
    const Root = PlayerPivot();
    if (!Root) return OriginalRender(Renderer, Scene, Camera);
    const Pose = EnsureCarryPose(Root);
    for (let Index = 0; Index < Pose.Bones.length; Index += 1) Pose.Saved[Index].copy(Pose.Bones[Index].quaternion);
    const Load = THREE.MathUtils.clamp(Held.Weight / 55, 0, 1);
    RotateBone(Bone(Root, "Torso"), 0.08 + Load * 0.09, 0, 0);
    RotateBone(Bone(Root, "Chest"), -0.03, 0, 0);
    RotateBone(Bone(Root, "UpperArm.L"), -0.80 - Load * 0.08, 0.06, 0.78);
    RotateBone(Bone(Root, "UpperArm.R"), -0.80 - Load * 0.08, -0.06, -0.78);
    RotateBone(Bone(Root, "LowerArm.L"), -0.76, 0, -0.10);
    RotateBone(Bone(Root, "LowerArm.R"), -0.76, 0, 0.10);
    Root.updateMatrixWorld(true);
    try { return OriginalRender(Renderer, Scene, Camera); }
    finally {
      for (let Index = 0; Index < Pose.Bones.length; Index += 1) Pose.Bones[Index].quaternion.copy(Pose.Saved[Index]);
      Root.updateMatrixWorld(true);
    }
  };
  Player.__FurnitureCarryR96Wrapped = true;
}

addEventListener("keydown", Event => {
  if (Event.repeat || UiOpen()) return;
  if (Event.code === "KeyQ" && Held && !window.__STORE_GAMEPLAY_LOCKED_R94__) {
    Event.preventDefault();
    Event.stopImmediatePropagation();
    Drop();
    return;
  }
  if (Event.code !== "KeyE" || window.__STORE_GAMEPLAY_LOCKED_R94__) return;
  const Candidate = CurrentCandidate || BestCandidate();
  if (!Candidate?.activate) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();
  Candidate.activate();
}, true);

function Frame(Now) {
  requestAnimationFrame(Frame);
  if (UiOpen()) {
    Prompt.style.display = "none";
    LastAnimationAt = Now;
    return;
  }
  RefreshPrompt(Now);
  if (!Held || Now - LastAnimationAt < 33) return;
  const Delta = Math.min(0.05, Math.max(0.001, (Now - LastAnimationAt) / 1000));
  LastAnimationAt = Now;
  const DX = Game.Camera.position.x - LastCameraX;
  const DZ = Game.Camera.position.z - LastCameraZ;
  LastCameraX = Game.Camera.position.x;
  LastCameraZ = Game.Camera.position.z;
  const Distance = Math.hypot(DX, DZ);
  CarryMove = THREE.MathUtils.lerp(CarryMove, THREE.MathUtils.clamp(Distance / Math.max(Delta * 3.45, 0.001), 0, 1), 1 - Math.exp(-Delta * 8));
  CarryPhase += Delta * (4.3 + CarryMove * 3.2);
  const Load = THREE.MathUtils.clamp(Held.Weight / 55, 0, 1);
  Held.Visual.position.y = 1.12 + Math.sin(CarryPhase * 2) * 0.015 * CarryMove;
  Held.Visual.rotation.z = Math.sin(CarryPhase) * 0.018 * CarryMove * (1 + Load * 0.4);
}

RefreshFurnitureIndex(true);
requestAnimationFrame(Frame);

window.__STORE_FURNITURE_CARRY_R94__ = {
  GetHeld,
  Drop,
  ConsumeHeld,
  RegisterInteraction,
  FriendlyName,
  FurnitureWeight: Object => FurnitureById.get(Object?.uuid)?.Weight || 20,
  SpeedMultiplier,
  ListFurniture: () => RefreshFurnitureIndex(false).map(Record => ({ Object: Record.Object, Chunk: Record.Chunk, Name: Record.Name, Weight: Record.Weight })),
  RefreshIndex: RefreshFurnitureIndex,
  ShowTransient
};
window.__STORE_FURNITURE_CARRY_BUILD__ = "V0.30.3-R96";