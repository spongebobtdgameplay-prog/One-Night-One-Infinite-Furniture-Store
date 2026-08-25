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

const TempCenter = new THREE.Vector3();
const TempSize = new THREE.Vector3();
const TempWorld = new THREE.Vector3();
const TempForward = new THREE.Vector3();
const TempLocal = new THREE.Vector3();
const TempEuler = new THREE.Euler();
const TempQuaternion = new THREE.Quaternion();
const InteractionProviders = new Map();
let Held = null;
let LastCandidateRefresh = -Infinity;
let CurrentCandidate = null;
let LastCameraPosition = Game.Camera.position.clone();
let CarryMove = 0;
let CarryPhase = 0;
let LastFrameAt = performance.now();

const Prompt = document.createElement("div");
Prompt.id = "InteractionHintR94";
Prompt.style.cssText = "position:fixed;left:50%;bottom:17%;z-index:82;transform:translateX(-50%);display:none;pointer-events:none;padding:8px 12px;border:1px solid rgba(203,166,116,.32);background:rgba(5,6,5,.89);color:#e7dbc5;font:850 11px Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;box-shadow:0 10px 34px rgba(0,0,0,.45)";
document.body.appendChild(Prompt);

const CarryBadge = document.createElement("div");
CarryBadge.id = "CarryBadgeR94";
CarryBadge.style.cssText = "position:fixed;right:16px;bottom:94px;z-index:73;display:none;pointer-events:none;min-width:145px;padding:9px 11px;border:1px solid rgba(184,135,83,.22);background:rgba(6,7,6,.78);color:rgba(226,214,193,.78);font:800 10px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase";
document.body.appendChild(CarryBadge);

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
  if (!Object?.isObject3D || !Object.parent || Object.userData?.DeliveredR94 || Object.userData?.CarriedR94) return false;
  if (FurnitureNames.has(Object.name)) return true;
  if (Object.userData?.RetailSellableR84) return true;
  return /^Retail(CoffeeTable|SideTable|DiningTable|BoxShelf)R84/i.test(String(Object.name || ""));
}

function FurnitureWeight(Object) {
  if (KnownWeights.has(Object?.name)) return KnownWeights.get(Object.name);
  const Bounds = new THREE.Box3().setFromObject(Object);
  if (Bounds.isEmpty()) return 20;
  Bounds.getSize(TempSize);
  const Volume = Math.max(0.1, TempSize.x * TempSize.y * TempSize.z);
  return Math.round(THREE.MathUtils.clamp(10 + Math.pow(Volume, 0.58) * 8.2, 10, 55));
}

function SpeedMultiplier(Weight) {
  return THREE.MathUtils.clamp(0.94 - Number(Weight || 0) * 0.0058, 0.62, 0.90);
}

function FurnitureRoots() {
  const Result = [];
  const Seen = new Set();
  for (const Collection of [Game.ActiveChunks, Game.PreparedChunks]) {
    for (const Chunk of Collection.values()) {
      for (const Model of Chunk?.Models || []) {
        if (!IsFurniture(Model) || Seen.has(Model.uuid)) continue;
        Seen.add(Model.uuid);
        Result.push({ Object: Model, Chunk });
      }
      for (const Object of Chunk?.Group?.children || []) {
        if (!IsFurniture(Object) || Seen.has(Object.uuid)) continue;
        Seen.add(Object.uuid);
        Result.push({ Object, Chunk });
      }
    }
  }
  return Result;
}

function DistanceToObject(Object) {
  const Bounds = new THREE.Box3().setFromObject(Object);
  if (Bounds.isEmpty()) return Infinity;
  Bounds.clampPoint(Game.Camera.position, TempWorld);
  return Math.hypot(TempWorld.x - Game.Camera.position.x, TempWorld.y - Game.Camera.position.y, TempWorld.z - Game.Camera.position.z);
}

function NearestFurniture(MaxDistance = 2.1) {
  if (Held) return null;
  let Best = null;
  let BestDistance = MaxDistance;
  for (const Record of FurnitureRoots()) {
    const Distance = DistanceToObject(Record.Object);
    if (Distance >= BestDistance) continue;
    Best = { ...Record, Distance };
    BestDistance = Distance;
  }
  return Best;
}

function IsRelatedEntry(Entry, Object) {
  if (!Entry || !Object) return false;
  return Entry.CollisionObject === Object || Entry.SourceModel === Object || Entry.Model === Object;
}

function RemoveFurnitureCollision(Object, Chunk) {
  for (let Index = Game.CollisionBoxes.length - 1; Index >= 0; Index -= 1) {
    if (IsRelatedEntry(Game.CollisionBoxes[Index], Object)) Game.CollisionBoxes.splice(Index, 1);
  }
  if (Chunk?.CollisionEntries) {
    for (let Index = Chunk.CollisionEntries.length - 1; Index >= 0; Index -= 1) {
      if (IsRelatedEntry(Chunk.CollisionEntries[Index], Object)) Chunk.CollisionEntries.splice(Index, 1);
    }
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
    if (Object.isMesh) {
      Object.castShadow = false;
      Object.receiveShadow = false;
      Object.frustumCulled = true;
    }
  });
  VisualRoot.add(Visual);
  VisualRoot.updateMatrixWorld(true);
  const Bounds = new THREE.Box3().setFromObject(VisualRoot);
  Bounds.getCenter(TempCenter);
  Bounds.getSize(TempSize);
  Visual.position.sub(TempCenter);
  const MaxDimension = Math.max(TempSize.x, TempSize.y, TempSize.z, 0.01);
  const Scale = Math.min(1, 1.45 / MaxDimension);
  VisualRoot.scale.setScalar(Scale);
  VisualRoot.position.set(0, 1.12, 0.72);
  VisualRoot.rotation.set(-0.04, Math.PI, 0);
  return VisualRoot;
}

function PlayerPivot() {
  return Game.Scene.getObjectByName("PlayerCharacterPivot") || null;
}

function Pickup(Record) {
  if (!Record?.Object || Held) return false;
  const Pivot = PlayerPivot();
  if (!Pivot) return false;
  const Object = Record.Object;
  const Weight = FurnitureWeight(Object);
  const PriceTags = FindPriceTags(Object, Record.Chunk);
  const Visual = BuildCarryVisual(Object);
  RemoveFurnitureCollision(Object, Record.Chunk);
  SetSourceVisible(Object, false);
  Object.userData.CarriedR94 = true;
  for (const Tag of PriceTags) Tag.visible = false;
  Pivot.add(Visual);
  Held = {
    Object,
    Chunk: Record.Chunk,
    Visual,
    Weight,
    Name: FriendlyName(Object),
    PriceTags,
    Parent: Object.parent
  };
  CarryBadge.style.display = "block";
  CarryBadge.textContent = `${Held.Name} • ${Weight} KG • Q DROP`;
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
  const Pivot = PlayerPivot();
  if (!Pivot) return false;
  Pivot.getWorldDirection(TempForward);
  TempForward.y = 0;
  if (TempForward.lengthSq() < 0.001) TempForward.set(0, 0, 1);
  TempForward.normalize();
  const Position = Game.Camera.position.clone().addScaledVector(TempForward, 1.45);
  Position.y = 0;
  if (PositionBlocked(new THREE.Vector3(Position.x, Game.Camera.position.y, Position.z))) {
    ShowTransient("NO ROOM TO DROP HERE");
    return false;
  }

  const Source = Held.Object;
  const Parent = Held.Parent;
  if (!Parent) return false;
  Parent.updateWorldMatrix(true, false);
  TempLocal.copy(Position);
  Parent.worldToLocal(TempLocal);
  Source.position.x = TempLocal.x;
  Source.position.z = TempLocal.z;
  Source.userData.CarriedR94 = false;
  SetSourceVisible(Source, true);
  for (const Tag of Held.PriceTags) Tag.visible = true;
  Held.Visual.parent?.remove(Held.Visual);
  const Detail = GetHeld();
  Held = null;
  CarryBadge.style.display = "none";
  queueMicrotask(() => window.__STORE_CORE_FIX_R86__?.ProcessAll?.());
  window.dispatchEvent(new CustomEvent("store-furniture-dropped", { detail: Detail }));
  return true;
}

function ConsumeHeld(Matcher = null) {
  if (!Held) return { ok: false };
  if (Matcher && !Matcher(Held)) return { ok: false, mismatch: true, held: GetHeld() };
  const Delivered = GetHeld();
  Held.Object.userData.CarriedR94 = false;
  Held.Object.userData.DeliveredR94 = true;
  SetSourceVisible(Held.Object, false);
  for (const Tag of Held.PriceTags) Tag.visible = false;
  Held.Visual.parent?.remove(Held.Visual);
  Held = null;
  CarryBadge.style.display = "none";
  window.dispatchEvent(new CustomEvent("store-furniture-delivered", { detail: Delivered }));
  return { ok: true, delivered: Delivered };
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
  }, 1000);
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
    text: `E • PICK UP ${FriendlyName(Furniture.Object)}`,
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
  if (Now - LastCandidateRefresh < 80) return;
  LastCandidateRefresh = Now;
  CurrentCandidate = BestCandidate();
  const Hud = document.getElementById("Hud");
  const GameplayVisible = Hud && !Hud.classList.contains("Hidden");
  if (!CurrentCandidate || !GameplayVisible) {
    Prompt.style.display = "none";
    return;
  }
  Prompt.textContent = String(CurrentCandidate.text || "E • INTERACT");
  Prompt.style.display = "block";
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

if (!Player.__FurnitureCarryR94Wrapped) {
  const OriginalSpeed = Player.GetMovementSpeed.bind(Player);
  Player.GetMovementSpeed = function FurnitureWeightedSpeed(...Args) {
    const Base = OriginalSpeed(...Args);
    if (window.__STORE_GAMEPLAY_LOCKED_R94__) return 0;
    return Held ? Base * SpeedMultiplier(Held.Weight) : Base;
  };

  const OriginalRender = Player.Render.bind(Player);
  Player.Render = function FurnitureCarryRender(Renderer, Scene, Camera) {
    if (!Held) return OriginalRender(Renderer, Scene, Camera);
    const Root = PlayerPivot();
    if (!Root) return OriginalRender(Renderer, Scene, Camera);
    const Names = ["Torso", "Chest", "UpperArm.L", "UpperArm.R", "LowerArm.L", "LowerArm.R", "Wrist.L", "Wrist.R"];
    const Bones = Names.map(Name => Bone(Root, Name)).filter(Boolean);
    const Saved = Bones.map(Item => Item.quaternion.clone());
    const Load = THREE.MathUtils.clamp(Held.Weight / 55, 0, 1);
    RotateBone(Bone(Root, "Torso"), 0.08 + Load * 0.09, 0, 0);
    RotateBone(Bone(Root, "Chest"), -0.03, 0, 0);
    RotateBone(Bone(Root, "UpperArm.L"), -0.80 - Load * 0.08, 0.06, 0.78);
    RotateBone(Bone(Root, "UpperArm.R"), -0.80 - Load * 0.08, -0.06, -0.78);
    RotateBone(Bone(Root, "LowerArm.L"), -0.76, 0, -0.10);
    RotateBone(Bone(Root, "LowerArm.R"), -0.76, 0, 0.10);
    RotateBone(Bone(Root, "Wrist.L"), 0.18, 0, 0);
    RotateBone(Bone(Root, "Wrist.R"), 0.18, 0, 0);
    Root.updateMatrixWorld(true);
    try { return OriginalRender(Renderer, Scene, Camera); }
    finally {
      for (let Index = 0; Index < Bones.length; Index += 1) Bones[Index].quaternion.copy(Saved[Index]);
      Root.updateMatrixWorld(true);
    }
  };
  Player.__FurnitureCarryR94Wrapped = true;
}

addEventListener("keydown", Event => {
  if (Event.repeat) return;
  if (Event.code === "KeyQ" && Held && !window.__STORE_GAMEPLAY_LOCKED_R94__) {
    Event.preventDefault();
    Event.stopImmediatePropagation();
    Drop();
    return;
  }
  if (Event.code !== "KeyE" || window.__STORE_GAMEPLAY_LOCKED_R94__) return;
  const Candidate = BestCandidate();
  if (!Candidate?.activate) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();
  Candidate.activate();
}, true);

function Frame(Now) {
  const Delta = Math.min(0.05, Math.max(0.001, (Now - LastFrameAt) / 1000));
  LastFrameAt = Now;
  const Distance = Math.hypot(Game.Camera.position.x - LastCameraPosition.x, Game.Camera.position.z - LastCameraPosition.z);
  LastCameraPosition.copy(Game.Camera.position);
  CarryMove = THREE.MathUtils.lerp(CarryMove, THREE.MathUtils.clamp(Distance / Math.max(Delta * 3.45, 0.001), 0, 1), 1 - Math.exp(-Delta * 8));
  CarryPhase += Delta * (4.3 + CarryMove * 3.2);
  if (Held?.Visual) {
    const Load = THREE.MathUtils.clamp(Held.Weight / 55, 0, 1);
    Held.Visual.position.y = 1.12 + Math.sin(CarryPhase * 2) * 0.015 * CarryMove;
    Held.Visual.rotation.z = Math.sin(CarryPhase) * 0.018 * CarryMove * (1 + Load * 0.4);
  }
  RefreshPrompt(Now);
  requestAnimationFrame(Frame);
}
requestAnimationFrame(Frame);

window.__STORE_FURNITURE_CARRY_R94__ = {
  GetHeld,
  Drop,
  ConsumeHeld,
  RegisterInteraction,
  FriendlyName,
  FurnitureWeight,
  SpeedMultiplier,
  ListFurniture: FurnitureRoots,
  ShowTransient
};
window.__STORE_FURNITURE_CARRY_BUILD__ = "V0.30.0-R94";