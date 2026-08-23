import * as THREE from "three";

const BasePlayer = window.__STORE_PLAYER__;
const MAX_DISTANCE = 4.8;
const CAMERA_HEIGHT = 0.48;
const SHOULDER_OFFSET = 0.32;
const ARM_THRESHOLD = 0.72;
const PLAYER_HEIGHT = 1.78;

const State = {
  Zoom: 0,
  Ready: false,
  Pivot: null,
  Model: null,
  BodyMeshes: [],
  OldArmMeshes: [],
  NewArmMeshes: [],
  TempDirection: new THREE.Vector3(),
  TempHorizontal: new THREE.Vector3(),
  TempRight: new THREE.Vector3(),
  TempTarget: new THREE.Vector3(),
  TempDesired: new THREE.Vector3(),
  TempOffset: new THREE.Vector3(),
  SavedPosition: new THREE.Vector3(),
  SavedQuaternion: new THREE.Quaternion()
};

function BoneWeight(SkinIndex, SkinWeight, VertexIndex, BoneIndices) {
  let Total = 0;
  for (let Slot = 0; Slot < SkinIndex.itemSize; Slot += 1) {
    const BoneIndex = SkinIndex.getComponent(VertexIndex, Slot);
    if (BoneIndices.has(BoneIndex)) Total += SkinWeight.getComponent(VertexIndex, Slot) || 0;
  }
  return THREE.MathUtils.clamp(Total, 0, 1);
}

function MaterialIndexAt(Geometry, IndexOffset) {
  if (!Geometry.groups?.length) return 0;
  for (const Group of Geometry.groups) {
    if (IndexOffset >= Group.start && IndexOffset < Group.start + Group.count) return Group.materialIndex || 0;
  }
  return 0;
}

function BuildCleanArms(Object) {
  if (!Object.isSkinnedMesh || !Object.skeleton || !Object.geometry) return null;
  const Geometry = Object.geometry;
  const SkinIndex = Geometry.getAttribute("skinIndex");
  const SkinWeight = Geometry.getAttribute("skinWeight");
  const Position = Geometry.getAttribute("position");
  if (!SkinIndex || !SkinWeight || !Position) return null;

  const ArmBones = new Set();
  for (let BoneIndex = 0; BoneIndex < Object.skeleton.bones.length; BoneIndex += 1) {
    const Name = (Object.skeleton.bones[BoneIndex]?.name || "").toLowerCase();
    if (
      Name.includes("lowerarm_") || Name.includes("hand_") || Name.includes("thumb_") ||
      Name.includes("index_") || Name.includes("middle_") || Name.includes("ring_") || Name.includes("pinky_")
    ) ArmBones.add(BoneIndex);
  }
  if (!ArmBones.size) return null;

  const SourceIndex = Geometry.index;
  const TriangleCount = SourceIndex ? SourceIndex.count / 3 : Position.count / 3;
  const Buckets = new Map();
  let Kept = 0;

  for (let Triangle = 0; Triangle < TriangleCount; Triangle += 1) {
    const Offset = Triangle * 3;
    const A = SourceIndex ? SourceIndex.getX(Offset) : Offset;
    const B = SourceIndex ? SourceIndex.getX(Offset + 1) : Offset + 1;
    const C = SourceIndex ? SourceIndex.getX(Offset + 2) : Offset + 2;
    if (
      BoneWeight(SkinIndex, SkinWeight, A, ArmBones) < ARM_THRESHOLD ||
      BoneWeight(SkinIndex, SkinWeight, B, ArmBones) < ARM_THRESHOLD ||
      BoneWeight(SkinIndex, SkinWeight, C, ArmBones) < ARM_THRESHOLD
    ) continue;
    const MaterialIndex = MaterialIndexAt(Geometry, Offset);
    if (!Buckets.has(MaterialIndex)) Buckets.set(MaterialIndex, []);
    Buckets.get(MaterialIndex).push(A, B, C);
    Kept += 1;
  }

  if (Kept < 8) return null;
  const ArmGeometry = Geometry.clone();
  ArmGeometry.clearGroups();
  const Indices = [];
  for (const [MaterialIndex, Bucket] of [...Buckets.entries()].sort((A, B) => A[0] - B[0])) {
    const Start = Indices.length;
    Indices.push(...Bucket);
    ArmGeometry.addGroup(Start, Bucket.length, MaterialIndex);
  }
  ArmGeometry.setIndex(Indices);
  ArmGeometry.computeBoundingSphere();

  const SourceMaterials = Array.isArray(Object.material) ? Object.material : [Object.material];
  const Materials = SourceMaterials.map(Material => {
    const Clone = Material.clone();
    Clone.depthTest = true;
    Clone.depthWrite = true;
    Clone.side = THREE.FrontSide;
    Clone.needsUpdate = true;
    return Clone;
  });

  const Arms = new THREE.SkinnedMesh(ArmGeometry, Array.isArray(Object.material) ? Materials : Materials[0]);
  Arms.name = `${Object.name || "Player"}_CleanFirstPersonArms`;
  Arms.userData.IsCleanFirstPersonArms = true;
  Arms.bindMode = Object.bindMode;
  Arms.bind(Object.skeleton, Object.bindMatrix);
  Arms.bindMatrixInverse.copy(Object.bindMatrixInverse);
  Arms.position.copy(Object.position);
  Arms.quaternion.copy(Object.quaternion);
  Arms.scale.copy(Object.scale);
  Arms.frustumCulled = false;
  Arms.renderOrder = 4;
  return Arms;
}

function ExposedSkinBones(Object) {
  const Result = new Set();
  if (!Object.isSkinnedMesh || !Object.skeleton) return Result;
  for (let BoneIndex = 0; BoneIndex < Object.skeleton.bones.length; BoneIndex += 1) {
    const Name = (Object.skeleton.bones[BoneIndex]?.name || "").toLowerCase();
    if (
      Name === "head" || Name.includes("neck") || Name.includes("lowerarm_") || Name.includes("hand_") ||
      Name.includes("thumb_") || Name.includes("index_") || Name.includes("middle_") ||
      Name.includes("ring_") || Name.includes("pinky_")
    ) Result.add(BoneIndex);
  }
  return Result;
}

function OutfitMaterial(Material) {
  const Clone = Material.clone();
  Clone.side = THREE.FrontSide;
  Clone.roughness = Math.max(Clone.roughness ?? 0.6, 0.68);
  const PreviousCompile = Clone.onBeforeCompile;
  Clone.onBeforeCompile = Shader => {
    if (PreviousCompile) PreviousCompile(Shader);
    Shader.vertexShader = Shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nattribute float storeSkinMask;\nvarying float vStoreSkinMask;\nvarying float vStoreWorldY;"
    );
    Shader.vertexShader = Shader.vertexShader.replace(
      "#include <project_vertex>",
      "vStoreSkinMask = storeSkinMask;\nvStoreWorldY = (modelMatrix * vec4(transformed, 1.0)).y;\n#include <project_vertex>"
    );
    Shader.fragmentShader = Shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying float vStoreSkinMask;\nvarying float vStoreWorldY;"
    );
    Shader.fragmentShader = Shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>\nfloat y = clamp(vStoreWorldY / ${PLAYER_HEIGHT.toFixed(4)}, 0.0, 1.0);\nfloat skin = smoothstep(0.44, 0.82, vStoreSkinMask);\nfloat cloth = 1.0 - skin;\nfloat shirt = smoothstep(0.43, 0.50, y) * (1.0 - smoothstep(0.79, 0.86, y));\nfloat pants = smoothstep(0.12, 0.18, y) * (1.0 - smoothstep(0.47, 0.53, y));\nfloat shoes = 1.0 - smoothstep(0.10, 0.17, y);\nvec3 shirtColor = vec3(0.09, 0.14, 0.16);\nvec3 pantsColor = vec3(0.055, 0.062, 0.070);\nvec3 shoeColor = vec3(0.025, 0.028, 0.032);\ndiffuseColor.rgb = mix(diffuseColor.rgb, shirtColor, shirt * cloth * 0.95);\ndiffuseColor.rgb = mix(diffuseColor.rgb, pantsColor, pants * cloth * 0.97);\ndiffuseColor.rgb = mix(diffuseColor.rgb, shoeColor, shoes * cloth * 0.98);`
    );
  };
  Clone.customProgramCacheKey = () => `store-uniform-v1-${Material.uuid}`;
  Clone.needsUpdate = true;
  return Clone;
}

function DressBody(Object) {
  if (!Object.isSkinnedMesh || !Object.geometry) return;
  const Geometry = Object.geometry;
  const SkinIndex = Geometry.getAttribute("skinIndex");
  const SkinWeight = Geometry.getAttribute("skinWeight");
  const Position = Geometry.getAttribute("position");
  if (!SkinIndex || !SkinWeight || !Position) return;
  const Label = `${Object.name || ""} ${(Array.isArray(Object.material) ? Object.material.map(M => M?.name || "").join(" ") : Object.material?.name || "")}`.toLowerCase();
  if (/(hair|eye|eyebrow|lash)/.test(Label)) return;

  const SkinBones = ExposedSkinBones(Object);
  const Mask = new Float32Array(Position.count);
  for (let VertexIndex = 0; VertexIndex < Position.count; VertexIndex += 1) {
    Mask[VertexIndex] = BoneWeight(SkinIndex, SkinWeight, VertexIndex, SkinBones);
  }
  Geometry.setAttribute("storeSkinMask", new THREE.Float32BufferAttribute(Mask, 1));
  const Materials = (Array.isArray(Object.material) ? Object.material : [Object.material]).map(OutfitMaterial);
  Object.material = Array.isArray(Object.material) ? Materials : Materials[0];
}

function PrepareCharacter(Scene) {
  const Pivot = Scene.getObjectByName("PlayerCharacterPivot");
  if (!Pivot || State.Ready) return Boolean(Pivot);
  State.Pivot = Pivot;
  State.Model = Pivot.children[0] || Pivot;

  State.Model.traverse(Object => {
    if (!Object.isMesh) return;
    if (Object.userData.IsFirstPersonArms || /FirstPersonArms/.test(Object.name || "")) {
      State.OldArmMeshes.push(Object);
      Object.visible = false;
      return;
    }
    State.BodyMeshes.push(Object);
    DressBody(Object);
  });

  for (const Body of State.BodyMeshes) {
    const Arms = BuildCleanArms(Body);
    if (!Arms) continue;
    Body.parent.add(Arms);
    State.NewArmMeshes.push(Arms);
  }

  State.Ready = true;
  return true;
}

function SetVisibility(FirstPerson) {
  for (const Mesh of State.OldArmMeshes) Mesh.visible = false;
  for (const Mesh of State.BodyMeshes) Mesh.visible = !FirstPerson;
  for (const Mesh of State.NewArmMeshes) Mesh.visible = FirstPerson;
}

function FixFacing(Camera) {
  if (!State.Pivot) return;
  Camera.getWorldDirection(State.TempDirection);
  State.TempDirection.y = 0;
  if (State.TempDirection.lengthSq() < 0.0001) return;
  State.TempDirection.normalize();
  State.Pivot.rotation.y = Math.atan2(State.TempDirection.x, State.TempDirection.z);
}

function SegmentAabbDistance(Start, End, Bounds, Padding = 0.08) {
  const Values = [
    [Start.x, End.x - Start.x, Bounds.min.x - Padding, Bounds.max.x + Padding],
    [Start.y, End.y - Start.y, Bounds.min.y - Padding, Bounds.max.y + Padding],
    [Start.z, End.z - Start.z, Bounds.min.z - Padding, Bounds.max.z + Padding]
  ];
  let TMin = 0;
  let TMax = 1;
  for (const [Origin, Delta, Min, Max] of Values) {
    if (Math.abs(Delta) < 1e-8) {
      if (Origin < Min || Origin > Max) return null;
      continue;
    }
    let A = (Min - Origin) / Delta;
    let B = (Max - Origin) / Delta;
    if (A > B) [A, B] = [B, A];
    TMin = Math.max(TMin, A);
    TMax = Math.min(TMax, B);
    if (TMin > TMax) return null;
  }
  return TMin;
}

function CameraDistance(Target, Desired) {
  const Collisions = window.__STORE_COLLISION_BOXES__ || [];
  let Allowed = Target.distanceTo(Desired);
  const Length = Math.max(Allowed, 0.001);
  const MinX = Math.min(Target.x, Desired.x) - 0.4;
  const MaxX = Math.max(Target.x, Desired.x) + 0.4;
  const MinZ = Math.min(Target.z, Desired.z) - 0.4;
  const MaxZ = Math.max(Target.z, Desired.z) + 0.4;

  for (const Entry of Collisions) {
    if (Entry?.Type && !/Wall|Partition/i.test(Entry.Type)) continue;
    const Bounds = Entry?.Box || Entry;
    if (!Bounds?.min || !Bounds?.max) continue;
    if (Bounds.max.x < MinX || Bounds.min.x > MaxX || Bounds.max.z < MinZ || Bounds.min.z > MaxZ) continue;
    const T = SegmentAabbDistance(Target, Desired, Bounds);
    if (T === null) continue;
    Allowed = Math.min(Allowed, Math.max(0.55, T * Length - 0.14));
  }
  return Allowed;
}

function Render(Renderer, Scene, Camera) {
  BasePlayer?.Render?.({ render() {} }, Scene, Camera);
  PrepareCharacter(Scene);
  FixFacing(Camera);

  const ThirdPerson = State.Zoom >= 0.15 && State.Ready;
  SetVisibility(!ThirdPerson);
  const Mode = document.getElementById("CameraModeValue");
  if (Mode) Mode.textContent = ThirdPerson ? "THIRD" : "FIRST";

  if (!ThirdPerson) {
    Renderer.render(Scene, Camera);
    return;
  }

  State.SavedPosition.copy(Camera.position);
  State.SavedQuaternion.copy(Camera.quaternion);
  Camera.getWorldDirection(State.TempHorizontal);
  State.TempHorizontal.y = 0;
  if (State.TempHorizontal.lengthSq() < 0.0001) State.TempHorizontal.set(0, 0, -1);
  State.TempHorizontal.normalize();
  State.TempRight.set(1, 0, 0).applyQuaternion(State.SavedQuaternion);
  State.TempRight.y = 0;
  State.TempRight.normalize();

  State.TempTarget.set(State.SavedPosition.x, 1.42, State.SavedPosition.z);
  State.TempDesired.copy(State.TempTarget)
    .addScaledVector(State.TempHorizontal, -State.Zoom)
    .addScaledVector(State.TempRight, SHOULDER_OFFSET)
    .add(new THREE.Vector3(0, CAMERA_HEIGHT + State.Zoom * 0.025, 0));

  const Allowed = CameraDistance(State.TempTarget, State.TempDesired);
  State.TempOffset.copy(State.TempDesired).sub(State.TempTarget);
  if (State.TempOffset.lengthSq() > 0.0001) State.TempOffset.normalize().multiplyScalar(Allowed);
  Camera.position.copy(State.TempTarget).add(State.TempOffset);
  Camera.lookAt(State.TempTarget.x, State.TempTarget.y + 0.06, State.TempTarget.z);
  Camera.updateMatrixWorld(true);
  Renderer.render(Scene, Camera);
  Camera.position.copy(State.SavedPosition);
  Camera.quaternion.copy(State.SavedQuaternion);
  Camera.updateMatrixWorld(true);
}

addEventListener("wheel", Event => {
  if (!document.pointerLockElement) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();
  State.Zoom = THREE.MathUtils.clamp(State.Zoom + Math.sign(Event.deltaY) * 0.6, 0, MAX_DISTANCE);
}, { capture: true, passive: false });

addEventListener("keydown", Event => {
  if (Event.code !== "KeyV" || Event.repeat) return;
  Event.preventDefault();
  Event.stopImmediatePropagation();
  State.Zoom = State.Zoom < 0.15 ? 3.6 : 0;
}, true);

window.__STORE_PLAYER__ = {
  ...BasePlayer,
  Render,
  IsThirdPerson: () => State.Zoom >= 0.15
};

window.__STORE_PLAYER_FIX_BUILD__ = "V0.09";
