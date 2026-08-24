import * as THREE from "three";

const Player = window.__STORE_PLAYER__;
if (!Player) throw new Error("Player must load before first-person visibility.");

const ArmWeightThreshold = 0.48;
const CloneTag = "FpsArmOnlyR20";
const CloneSuffix = "_FpsArmOnlyR20";
const CloneBySource = new WeakMap();
const Clones = new Set();
const SavedVisibility = new Map();

function IsArmBone(Name) {
  return /upperarm|lowerarm|wrist|hand|thumb|index|middle|ring|pinky/i.test(String(Name || ""));
}

function BoneWeight(SkinIndex, SkinWeight, VertexIndex, BoneIndices) {
  let Total = 0;
  for (let Slot = 0; Slot < SkinIndex.itemSize; Slot += 1) {
    const BoneIndex = SkinIndex.getComponent(VertexIndex, Slot);
    if (BoneIndices.has(BoneIndex)) Total += SkinWeight.getComponent(VertexIndex, Slot) || 0;
  }
  return THREE.MathUtils.clamp(Total, 0, 1);
}

function MaterialIndexAt(Geometry, Offset) {
  if (!Geometry.groups?.length) return 0;
  for (const Group of Geometry.groups) {
    if (Offset >= Group.start && Offset < Group.start + Group.count) return Group.materialIndex || 0;
  }
  return 0;
}

function BuildArmGeometry(Source) {
  const Geometry = Source.geometry;
  const SkinIndex = Geometry?.getAttribute?.("skinIndex");
  const SkinWeight = Geometry?.getAttribute?.("skinWeight");
  const Position = Geometry?.getAttribute?.("position");
  if (!Geometry || !SkinIndex || !SkinWeight || !Position || !Source.skeleton) return null;

  const ArmBones = new Set();
  for (let BoneIndex = 0; BoneIndex < Source.skeleton.bones.length; BoneIndex += 1) {
    if (IsArmBone(Source.skeleton.bones[BoneIndex]?.name)) ArmBones.add(BoneIndex);
  }
  if (!ArmBones.size) return null;

  const SourceIndex = Geometry.index;
  const TriangleCount = SourceIndex ? Math.floor(SourceIndex.count / 3) : Math.floor(Position.count / 3);
  const Buckets = new Map();
  let KeptTriangles = 0;

  for (let Triangle = 0; Triangle < TriangleCount; Triangle += 1) {
    const Offset = Triangle * 3;
    const A = SourceIndex ? SourceIndex.getX(Offset) : Offset;
    const B = SourceIndex ? SourceIndex.getX(Offset + 1) : Offset + 1;
    const C = SourceIndex ? SourceIndex.getX(Offset + 2) : Offset + 2;
    const WA = BoneWeight(SkinIndex, SkinWeight, A, ArmBones);
    const WB = BoneWeight(SkinIndex, SkinWeight, B, ArmBones);
    const WC = BoneWeight(SkinIndex, SkinWeight, C, ArmBones);
    if (WA < ArmWeightThreshold || WB < ArmWeightThreshold || WC < ArmWeightThreshold) continue;
    const MaterialIndex = MaterialIndexAt(Geometry, Offset);
    if (!Buckets.has(MaterialIndex)) Buckets.set(MaterialIndex, []);
    Buckets.get(MaterialIndex).push(A, B, C);
    KeptTriangles += 1;
  }

  if (KeptTriangles < 4) return null;

  const ArmGeometry = Geometry.clone();
  ArmGeometry.clearGroups();
  const Indices = [];
  for (const [MaterialIndex, Bucket] of [...Buckets.entries()].sort((Left, Right) => Left[0] - Right[0])) {
    const Start = Indices.length;
    Indices.push(...Bucket);
    ArmGeometry.addGroup(Start, Bucket.length, MaterialIndex);
  }
  ArmGeometry.setIndex(Indices);
  ArmGeometry.computeBoundingSphere();
  return ArmGeometry;
}

function BuildClone(Source) {
  if (!Source?.isSkinnedMesh || Source.userData?.[CloneTag] || CloneBySource.has(Source)) return CloneBySource.get(Source) || null;
  const Geometry = BuildArmGeometry(Source);
  if (!Geometry) return null;

  const Clone = new THREE.SkinnedMesh(Geometry, Source.material);
  Clone.name = `${Source.name || "PlayerMesh"}${CloneSuffix}`;
  Clone.bindMode = Source.bindMode;
  Clone.bind(Source.skeleton, Source.bindMatrix);
  Clone.bindMatrixInverse.copy(Source.bindMatrixInverse);
  Clone.position.copy(Source.position);
  Clone.quaternion.copy(Source.quaternion);
  Clone.scale.copy(Source.scale);
  Clone.frustumCulled = false;
  Clone.renderOrder = Math.max(4, Number(Source.renderOrder) || 0);
  Clone.visible = false;
  Clone.userData[CloneTag] = true;
  Clone.userData.SourceUuid = Source.uuid;
  Source.parent?.add(Clone);
  CloneBySource.set(Source, Clone);
  Clones.add(Clone);
  return Clone;
}

function EnsureArmClones(Pivot) {
  const Sources = [];
  Pivot.traverse(Object => {
    if (!Object?.isSkinnedMesh || Object.userData?.[CloneTag]) return;
    if (/FirstPersonArms|CameraArms|ViewModel/i.test(String(Object.name || ""))) return;
    Sources.push(Object);
  });
  for (const Source of Sources) BuildClone(Source);
}

function SaveAndMaskFirstPerson(Pivot) {
  SavedVisibility.clear();
  EnsureArmClones(Pivot);

  Pivot.traverse(Object => {
    if (!Object?.isMesh) return;
    SavedVisibility.set(Object, Object.visible);
    Object.visible = Boolean(Object.userData?.[CloneTag]);
  });
}

function RestoreVisibility(Pivot) {
  for (const [Object, Visible] of SavedVisibility) Object.visible = Visible;
  SavedVisibility.clear();
  for (const Clone of Clones) {
    if (Clone.parent) Clone.visible = false;
  }
  Pivot?.updateMatrixWorld(true);
}

const PreviousRender = Player.Render;
if (typeof PreviousRender !== "function") throw new Error("Player render is unavailable for first-person visibility.");

Player.Render = function RenderWithStableFirstPersonVisibility(Renderer, Scene, Camera) {
  const ProxyRenderer = {
    render(RenderScene, RenderCamera) {
      const Pivot = RenderScene.getObjectByName("PlayerCharacterPivot");
      if (!Pivot || Player.IsThirdPerson?.()) {
        for (const Clone of Clones) if (Clone.parent) Clone.visible = false;
        Renderer.render(RenderScene, RenderCamera);
        return;
      }

      try {
        SaveAndMaskFirstPerson(Pivot);
        Pivot.updateMatrixWorld(true);
        Renderer.render(RenderScene, RenderCamera);
      } finally {
        RestoreVisibility(Pivot);
      }
    }
  };

  return PreviousRender.call(Player, ProxyRenderer, Scene, Camera);
};

window.__STORE_FIRST_PERSON_VISIBILITY__ = {
  Clones,
  EnsureArmClones
};
window.__STORE_FIRST_PERSON_VISIBILITY_BUILD__ = "V0.12.19";
