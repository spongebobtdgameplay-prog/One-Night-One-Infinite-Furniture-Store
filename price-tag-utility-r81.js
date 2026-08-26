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

const DescriptionMaterial = new THREE.MeshStandardMaterial({
  color: 0x706457,
  roughness: 0.72,
  metalness: 0.01
});

function WrapDescription(Text, MaximumCharacters = 20) {
  const Words = String(Text || "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!Words.length) return [];
  const Lines = [""];
  for (const Word of Words) {
    const Current = Lines[Lines.length - 1];
    const Candidate = Current ? `${Current} ${Word}` : Word;
    if (Candidate.length <= MaximumCharacters || Lines.length >= 2) Lines[Lines.length - 1] = Candidate;
    else Lines.push(Word);
  }
  return Lines.slice(0, 2);
}

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

export async function CreateDescriptionPricePlacard3D(ItemName, Description, Price, Options = {}) {
  const Group = new THREE.Group();
  Group.name = Options.Name || "FurnitureItemSignR74-Description";

  const Accent = AccentMaterial(Options.AccentColor ?? 0xb77b43);
  const BoardY = 0.56;
  const Frame = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.58, 0.065), FrameMaterial);
  Frame.name = "DescriptionPriceFrameR81";
  Frame.position.y = BoardY;

  const Board = new THREE.Mesh(new THREE.BoxGeometry(0.855, 0.525, 0.077), BoardMaterial);
  Board.name = "DescriptionPriceBoardR81";
  Board.position.y = BoardY;

  const AccentBar = new THREE.Mesh(new THREE.BoxGeometry(0.825, 0.048, 0.084), Accent);
  AccentBar.name = "DescriptionPriceAccentR81";
  AccentBar.position.set(0, BoardY + 0.226, 0);

  const Post = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.30, 0.038), FrameMaterial);
  Post.name = "DescriptionPricePostR81";
  Post.position.y = 0.20;

  const Foot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.040, 0.19), FrameMaterial);
  Foot.name = "DescriptionPriceFootR81";
  Foot.position.y = 0.020;

  Group.add(Frame, Board, AccentBar, Post, Foot);

  const FaceZ = 0.050;
  const Name = await Create3DText(String(ItemName || "ITEM").toUpperCase(), {
    MaxWidth: 0.74,
    MaxHeight: 0.090,
    Depth: 0.018,
    Material: NameMaterial
  });
  Name.name = "DescriptionPriceNameR81";
  Name.position.set(0, BoardY + 0.120, FaceZ);
  Group.add(Name);

  const Lines = WrapDescription(Description);
  for (let Index = 0; Index < Lines.length; Index += 1) {
    const Line = await Create3DText(Lines[Index], {
      MaxWidth: 0.75,
      MaxHeight: 0.058,
      Depth: 0.014,
      Bevel: false,
      Material: DescriptionMaterial
    });
    Line.name = `DescriptionPriceLineR81-${Index}`;
    Line.position.set(0, BoardY + 0.015 - Index * 0.075, FaceZ);
    Group.add(Line);
  }

  const Value = await Create3DText(String(Price || "$0.00").toUpperCase(), {
    MaxWidth: 0.52,
    MaxHeight: 0.105,
    Depth: 0.021,
    Material: PriceMaterial
  });
  Value.name = "DescriptionPriceValueR81";
  Value.position.set(0, BoardY - 0.170, FaceZ);
  Group.add(Value);

  Group.userData.SignUtilityR81 = true;
  Group.userData.SignKind = "DescriptionPricePlacard";
  Group.userData.Description = String(Description || "");
  Group.userData.Price = String(Price || "$0.00");
  return Group;
}

export function FaceCompactPricePlacardTowardAisle(Sign, PositionX, PositionZ) {
  const TargetX = PositionX < 0 ? 0 : 0;
  Sign.lookAt(new THREE.Vector3(TargetX, Sign.position.y, PositionZ));
}

window.__STORE_PRICE_TAG_UTILITY_BUILD__ = "V0.27.2";