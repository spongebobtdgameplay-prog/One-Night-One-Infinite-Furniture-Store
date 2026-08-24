import * as THREE from "three";
import { Create3DText, CreateDoubleSided3DText } from "./three-text-utility-r73.js";

const DepartmentFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x857d70, roughness: 0.60, metalness: 0.42 });
const DepartmentBoardMaterial = new THREE.MeshStandardMaterial({ color: 0x748175, roughness: 0.86, metalness: 0.04 });
const DepartmentInsetMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa394, roughness: 0.90, metalness: 0.02 });
const DepartmentTextMaterial = new THREE.MeshStandardMaterial({ color: 0xffe7b8, roughness: 0.42, metalness: 0.05, emissive: 0x6a4b20, emissiveIntensity: 0.13 });
const PriceFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x8a8173, roughness: 0.68, metalness: 0.28 });
const PriceBoardMaterial = new THREE.MeshStandardMaterial({ color: 0xe7d9b8, roughness: 0.92, metalness: 0.01 });
const PriceTextMaterial = new THREE.MeshStandardMaterial({ color: 0x594735, roughness: 0.52, metalness: 0.02 });
const PriceValueMaterial = new THREE.MeshStandardMaterial({ color: 0x9b3f31, roughness: 0.48, metalness: 0.02, emissive: 0x4a160f, emissiveIntensity: 0.05 });
const PriceLightTextMaterial = new THREE.MeshStandardMaterial({ color: 0xfff0cf, roughness: 0.48, metalness: 0.02, emissive: 0x664523, emissiveIntensity: 0.10 });

function AddBorderBars(Group, Width, Height, Depth, Material, Thickness = 0.055) {
  const Top = new THREE.Mesh(new THREE.BoxGeometry(Width, Thickness, Depth), Material);
  Top.position.y = Height * 0.5 - Thickness * 0.5;
  const Bottom = Top.clone();
  Bottom.position.y = -Top.position.y;
  const Left = new THREE.Mesh(new THREE.BoxGeometry(Thickness, Height - Thickness * 2, Depth), Material);
  Left.position.x = -Width * 0.5 + Thickness * 0.5;
  const Right = Left.clone();
  Right.position.x = -Left.position.x;
  Group.add(Top, Bottom, Left, Right);
}

function AccentMaterial(Color) {
  return new THREE.MeshStandardMaterial({ color: Color, roughness: 0.68, metalness: 0.05, emissive: Color, emissiveIntensity: 0.025 });
}

function AddPedestal(Group, Style) {
  if (Style % 3 === 1) {
    const LeftPole = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.62, 0.045), PriceFrameMaterial);
    LeftPole.position.set(-0.20, 0.33, 0);
    const RightPole = LeftPole.clone();
    RightPole.position.x = 0.20;
    const Foot = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.055, 0.34), PriceFrameMaterial);
    Foot.position.y = 0.028;
    Group.add(LeftPole, RightPole, Foot);
    return;
  }

  if (Style % 3 === 2) {
    const Pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.62, 10), PriceFrameMaterial);
    Pedestal.position.y = 0.33;
    const Foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.055, 12), PriceFrameMaterial);
    Foot.position.y = 0.028;
    Group.add(Pedestal, Foot);
    return;
  }

  const Pole = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.042, 0.64, 10), PriceFrameMaterial);
  Pole.position.y = 0.34;
  const Foot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.29, 0.055, 14), PriceFrameMaterial);
  Foot.position.y = 0.028;
  Group.add(Pole, Foot);
}

async function AddDoubleSidedText(Group, Text, Options) {
  const Front = await Create3DText(Text, Options);
  Front.position.set(Options.X || 0, Options.Y || 0, Options.FrontZ);
  const Back = Front.clone();
  Back.position.z = Options.BackZ;
  Back.rotation.y = Math.PI;
  Group.add(Front, Back);
  return { Front, Back };
}

export async function CreateDepartmentSign3D(Text, Options = {}) {
  const Width = Options.Width ?? 6.55;
  const Height = Options.Height ?? 1.06;
  const Depth = Options.Depth ?? 0.20;
  const Group = new THREE.Group();
  Group.name = Options.Name || "DepartmentSign3DR73";

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(Width, Height, Depth), DepartmentFrameMaterial);
  const Board = new THREE.Mesh(new THREE.BoxGeometry(Width - 0.17, Height - 0.17, Depth + 0.018), DepartmentBoardMaterial);
  const Inset = new THREE.Mesh(new THREE.BoxGeometry(Width - 0.34, Height - 0.31, Depth + 0.028), DepartmentInsetMaterial);
  Frame.name = "DepartmentSignFrameR73";
  Board.name = "DepartmentSignBoardR73";
  Inset.name = "DepartmentSignInsetR73";
  Group.add(Frame, Board, Inset);

  const TextDepth = 0.04;
  const BoardFace = (Depth + 0.028) * 0.5;
  const TextCenter = BoardFace + TextDepth * 0.5 + 0.0015;
  const TextGroup = await CreateDoubleSided3DText(Text, {
    MaxWidth: Width - 0.43,
    MaxHeight: Height - 0.23,
    Depth: TextDepth,
    Material: DepartmentTextMaterial,
    FrontZ: TextCenter,
    BackZ: -TextCenter
  });
  TextGroup.name = "DepartmentSignTextR73";
  Group.add(TextGroup);

  AddBorderBars(Group, Width - 0.22, Height - 0.22, Depth + 0.045, DepartmentTextMaterial, 0.032);

  const HangerLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.50, 8), DepartmentFrameMaterial);
  HangerLeft.position.set(-2.12, Height * 0.5 + 0.25, 0);
  const HangerRight = HangerLeft.clone();
  HangerRight.position.x = 2.12;
  Group.add(HangerLeft, HangerRight);

  Group.userData.SignUtilityR73 = true;
  Group.userData.SignKind = "Department";
  return Group;
}

export async function CreateStandingPriceSign3D(ItemName, Options = {}) {
  const Group = new THREE.Group();
  Group.name = Options.Name || "FurniturePriceSignR73";
  const Style = Math.abs(Options.Style ?? 0) % 3;
  const Accent = AccentMaterial(Options.AccentColor ?? 0xb55f45);
  const AisleLabel = String(Options.AisleLabel || "AISLE TAG").toUpperCase();
  const Price = String(Options.Price || "$0.00").toUpperCase();

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.76, 0.09), PriceFrameMaterial);
  Frame.position.y = 0.86;
  const Board = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.68, 0.11), PriceBoardMaterial);
  Board.position.y = 0.86;
  const AccentBar = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.13, 0.125), Accent);
  AccentBar.position.set(0, 1.105, 0);
  Group.add(Frame, Board, AccentBar);
  AddPedestal(Group, Style);

  const BoardTextDepth = 0.022;
  const BoardTextZ = 0.055 + BoardTextDepth * 0.5 + 0.001;
  const AccentTextDepth = 0.018;
  const AccentTextZ = 0.0625 + AccentTextDepth * 0.5 + 0.001;

  await AddDoubleSidedText(Group, "DISPLAY", {
    MaxWidth: 0.67,
    MaxHeight: 0.085,
    Depth: AccentTextDepth,
    Material: PriceLightTextMaterial,
    Y: 1.105,
    FrontZ: AccentTextZ,
    BackZ: -AccentTextZ
  });

  await AddDoubleSidedText(Group, ItemName, {
    MaxWidth: 0.74,
    MaxHeight: 0.195,
    Depth: BoardTextDepth,
    Material: PriceTextMaterial,
    Y: 0.91,
    FrontZ: BoardTextZ,
    BackZ: -BoardTextZ
  });

  await AddDoubleSidedText(Group, Price, {
    MaxWidth: 0.64,
    MaxHeight: 0.145,
    Depth: 0.026,
    Material: PriceValueMaterial,
    Y: 0.73,
    FrontZ: 0.069,
    BackZ: -0.069
  });

  await AddDoubleSidedText(Group, AisleLabel, {
    MaxWidth: 0.56,
    MaxHeight: 0.072,
    Depth: BoardTextDepth,
    Material: PriceTextMaterial,
    Y: 0.59,
    FrontZ: BoardTextZ,
    BackZ: -BoardTextZ
  });

  Group.userData.SignUtilityR73 = true;
  Group.userData.SignKind = "Price";
  Group.userData.SignStyle = Style;
  Group.userData.Price = Price;
  return Group;
}

export function GetSignBounds(Sign) {
  Sign.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(Sign);
}

export function FaceSignTowardAisle(Sign, PositionX, PositionZ) {
  const TargetX = Math.abs(PositionX) > 1.0 ? 0 : PositionX;
  const TargetZ = Math.abs(PositionX) > 1.0 ? PositionZ : PositionZ + 1;
  Sign.lookAt(new THREE.Vector3(TargetX, Sign.position.y, TargetZ));
}

window.__STORE_SIGN_UTILITY_BUILD__ = "V0.17.0-R75";