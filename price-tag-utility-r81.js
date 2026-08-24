import * as THREE from "three";
import { Create3DText } from "./three-text-utility-r73.js";

const FrameMaterial = new THREE.MeshStandardMaterial({
  color: 0x8f8779,
  roughness: 0.68,
  metalness: 0.24
});
const BoardMaterial = new THREE.MeshStandardMaterial({
  color: 0xeadfca,
  roughness: 0.94,
  metalness: 0.01
});
const NameMaterial = new THREE.MeshStandardMaterial({
  color: 0x56483b,
  roughness: 0.55,
  metalness: 0.01
});
const PriceMaterial = new THREE.MeshStandardMaterial({
  color: 0xa74434,
  roughness: 0.50,
  metalness: 0.01,
  emissive: 0x3d120c,
  emissiveIntensity: 0.035
});

function AccentMaterial(Color) {
  return new THREE.MeshStandardMaterial({
    color: Color,
    roughness: 0.72,
    metalness: 0.03
  });
}

export async function CreateCompactPricePlacard3D(ItemName, Price, Options = {}) {
  const Group = new THREE.Group();
  Group.name = Options.Name || "FurnitureItemSignR74-Compact";

  const Accent = AccentMaterial(Options.AccentColor ?? 0x708c72);
  const BoardY = 0.45;

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.40, 0.060), FrameMaterial);
  Frame.name = "CompactPriceFrameR81";
  Frame.position.y = BoardY;

  const Board = new THREE.Mesh(new THREE.BoxGeometry(0.585, 0.345, 0.072), BoardMaterial);
  Board.name = "CompactPriceBoardR81";
  Board.position.y = BoardY;

  const AccentBar = new THREE.Mesh(new THREE.BoxGeometry(0.555, 0.045, 0.080), Accent);
  AccentBar.name = "CompactPriceAccentR81";
  AccentBar.position.set(0, BoardY + 0.139, 0);

  const Post = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.245, 0.035), FrameMaterial);
  Post.name = "CompactPricePostR81";
  Post.position.y = 0.165;

  const Foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.038, 0.16), FrameMaterial);
  Foot.name = "CompactPriceFootR81";
  Foot.position.y = 0.019;

  Group.add(Frame, Board, AccentBar, Post, Foot);

  const FaceZ = 0.036 + 0.0105;
  const Name = await Create3DText(String(ItemName || "ITEM").toUpperCase(), {
    MaxWidth: 0.49,
    MaxHeight: 0.090,
    Depth: 0.018,
    Material: NameMaterial
  });
  Name.name = "CompactPriceNameR81";
  Name.position.set(0, BoardY + 0.035, FaceZ);
  Group.add(Name);

  const Value = await Create3DText(String(Price || "$0.00").toUpperCase(), {
    MaxWidth: 0.43,
    MaxHeight: 0.105,
    Depth: 0.021,
    Material: PriceMaterial
  });
  Value.name = "CompactPriceValueR81";
  Value.position.set(0, BoardY - 0.095, 0.036 + 0.012);
  Group.add(Value);

  Group.userData.SignUtilityR81 = true;
  Group.userData.SignKind = "CompactPricePlacard";
  Group.userData.Price = String(Price || "$0.00");
  return Group;
}

export function FaceCompactPricePlacardTowardAisle(Sign, PositionX, PositionZ) {
  const TargetX = PositionX < 0 ? 0 : 0;
  Sign.lookAt(new THREE.Vector3(TargetX, Sign.position.y, PositionZ));
}

window.__STORE_PRICE_TAG_UTILITY_BUILD__ = "V0.20.2-R81";