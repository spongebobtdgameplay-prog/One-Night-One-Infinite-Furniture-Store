import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

const FontUrl = "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/fonts/helvetiker_bold.typeface.json";
const FontPromise = new FontLoader().loadAsync(FontUrl);
const GeometryCache = new Map();

function NormalizeText(Text) {
  return String(Text ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

async function GetGeometry(Text, Depth = 0.08, Bevel = true) {
  const Normalized = NormalizeText(Text) || " ";
  const Key = `${Normalized}|${Depth.toFixed(3)}|${Bevel ? 1 : 0}`;
  if (GeometryCache.has(Key)) return GeometryCache.get(Key);

  const Font = await FontPromise;
  const Geometry = new TextGeometry(Normalized, {
    font: Font,
    size: 1,
    depth: Depth,
    curveSegments: 5,
    bevelEnabled: Bevel,
    bevelThickness: Bevel ? 0.012 : 0,
    bevelSize: Bevel ? 0.010 : 0,
    bevelOffset: 0,
    bevelSegments: Bevel ? 2 : 0
  });

  Geometry.computeBoundingBox();
  const Bounds = Geometry.boundingBox;
  const Width = Math.max(0.0001, Bounds.max.x - Bounds.min.x);
  const Height = Math.max(0.0001, Bounds.max.y - Bounds.min.y);
  Geometry.translate(-(Bounds.min.x + Bounds.max.x) * 0.5, -(Bounds.min.y + Bounds.max.y) * 0.5, -Depth * 0.5);
  Geometry.computeBoundingBox();

  const Result = { Geometry, Width, Height };
  GeometryCache.set(Key, Result);
  return Result;
}

export async function Create3DText(Text, Options = {}) {
  const {
    MaxWidth = Infinity,
    MaxHeight = Infinity,
    Depth = 0.08,
    Bevel = true,
    Material = null,
    Color = 0xf2e5c5,
    Roughness = 0.5,
    Metalness = 0.05,
    Emissive = 0x000000,
    EmissiveIntensity = 0,
    CastShadow = false,
    ReceiveShadow = false
  } = Options;

  const Data = await GetGeometry(Text, Depth, Bevel);
  const WidthScale = Number.isFinite(MaxWidth) ? MaxWidth / Data.Width : Infinity;
  const HeightScale = Number.isFinite(MaxHeight) ? MaxHeight / Data.Height : Infinity;
  const Scale = Math.min(WidthScale, HeightScale, 1);

  const MeshMaterial = Material || new THREE.MeshStandardMaterial({
    color: Color,
    roughness: Roughness,
    metalness: Metalness,
    emissive: Emissive,
    emissiveIntensity: EmissiveIntensity
  });

  const Mesh = new THREE.Mesh(Data.Geometry, MeshMaterial);
  Mesh.scale.setScalar(Scale);
  Mesh.castShadow = CastShadow;
  Mesh.receiveShadow = ReceiveShadow;
  Mesh.userData.Text3DR73 = true;
  Mesh.userData.TextValue = NormalizeText(Text);
  return Mesh;
}

export async function CreateDoubleSided3DText(Text, Options = {}) {
  const {
    FrontZ = 0.12,
    BackZ = -0.12
  } = Options;

  const Front = await Create3DText(Text, Options);
  const Back = Front.clone();
  Back.material = Front.material;
  Front.position.z = FrontZ;
  Back.position.z = BackZ;
  Back.rotation.y = Math.PI;

  const Group = new THREE.Group();
  Group.name = "DoubleSided3DTextR73";
  Group.add(Front, Back);
  return Group;
}

export async function Preload3DTextFont() {
  return FontPromise;
}

export function Dispose3DTextCache() {
  for (const Value of GeometryCache.values()) Value.Geometry.dispose();
  GeometryCache.clear();
}

window.__STORE_3D_TEXT_BUILD__ = "V0.15.0-R73";