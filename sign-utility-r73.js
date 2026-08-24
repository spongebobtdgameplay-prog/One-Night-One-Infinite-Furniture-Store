import * as THREE from "three";
import { Create3DText, CreateDoubleSided3DText } from "./three-text-utility-r73.js";

const DepartmentFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x777064, roughness: 0.60, metalness: 0.46 });
const DepartmentBoardMaterial = new THREE.MeshStandardMaterial({ color: 0x667268, roughness: 0.86, metalness: 0.04 });
const DepartmentInsetMaterial = new THREE.MeshStandardMaterial({ color: 0x879184, roughness: 0.90, metalness: 0.02 });
const DepartmentTextMaterial = new THREE.MeshStandardMaterial({ color: 0xf1dfb8, roughness: 0.46, metalness: 0.06, emissive: 0x56411f, emissiveIntensity: 0.16 });
const PriceFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x7b7468, roughness: 0.68, metalness: 0.30 });
const PriceBoardMaterial = new THREE.MeshStandardMaterial({ color: 0xd9cbaa, roughness: 0.92, metalness: 0.01 });
const PriceTextMaterial = new THREE.MeshStandardMaterial({ color: 0x594735, roughness: 0.54, metalness: 0.02 });
const PriceLightTextMaterial = new THREE.MeshStandardMaterial({ color: 0xffefcc, roughness: 0.50, metalness: 0.02, emissive: 0x5b3f22, emissiveIntensity: 0.10 });

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
    const LeftPole = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.58, 0.045), PriceFrameMaterial);
    LeftPole.position.set(-0.18, 0.31, 0);
    const RightPole = LeftPole.clone();
    RightPole.position.x = 0.18;
    const Foot = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.055, 0.32), PriceFrameMaterial);
    Foot.position.y = 0.028;
    Group.add(LeftPole, RightPole, Foot);
    return;
  }

  if (Style % 3 === 2) {
    const Pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.13, 0.56, 10), PriceFrameMaterial);
    Pedestal.position.y = 0.31;
    const Foot = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.31, 0.055, 12), PriceFrameMaterial);
    Foot.position.y = 0.028;
    Group.add(Pedestal, Foot);
    return;
  }

  const Pole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.040, 0.60, 10), PriceFrameMaterial);
  Pole.position.y = 0.32;
  const Foot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.055, 14), PriceFrameMaterial);
  Foot.position.y = 0.028;
  Group.add(Pole, Foot);
}

export async function CreateDepartmentSign3D(Text, Options = {}) {
  const Width = Options.Width ?? 6.25;
  const Height = Options.Height ?? 0.96;
  const Depth = Options.Depth ?? 0.20;
  const Group = new THREE.Group();
  Group.name = Options.Name || "DepartmentSign3DR73";

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(Width, Height, Depth), DepartmentFrameMaterial);
  const Board = new THREE.Mesh(new THREE.BoxGeometry(Width - 0.17, Height - 0.17, Depth + 0.018), DepartmentBoardMaterial);
  const Inset = new THREE.Mesh(new THREE.BoxGeometry(Width - 0.38, Height - 0.34, Depth + 0.028), DepartmentInsetMaterial);
  Frame.name = "DepartmentSignFrameR73";
  Board.name = "DepartmentSignBoardR73";
  Inset.name = "DepartmentSignInsetR73";
  Group.add(Frame, Board, Inset);

  const TextGroup = await CreateDoubleSided3DText(Text, {
    MaxWidth: Width - 0.82,
    MaxHeight: Height - 0.43,
    Depth: 0.075,
    Material: DepartmentTextMaterial,
    FrontZ: Depth * 0.5 + 0.055,
    BackZ: -Depth * 0.5 - 0.055
  });
  TextGroup.name = "DepartmentSignTextR73";
  Group.add(TextGroup);

  AddBorderBars(Group, Width - 0.24, Height - 0.24, Depth + 0.06, DepartmentTextMaterial, 0.035);

  const HangerLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.54, 8), DepartmentFrameMaterial);
  HangerLeft.position.set(-2.0, Height * 0.5 + 0.27, 0);
  const HangerRight = HangerLeft.clone();
  HangerRight.position.x = 2.0;
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

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.65, 0.09), PriceFrameMaterial);
  Frame.position.y = 0.80;
  const Board = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.57, 0.11), PriceBoardMaterial);
  Board.position.y = 0.80;
  const AccentBar = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.12, 0.125), Accent);
  AccentBar.position.set(0, 1.015, 0);
  Group.add(Frame, Board, AccentBar);
  AddPedestal(Group, Style);

  const DisplayTextFront = await Create3DText("DISPLAY", {
    MaxWidth: 0.60,
    MaxHeight: 0.075,
    Depth: 0.025,
    Material: PriceLightTextMaterial
  });
  DisplayTextFront.position.set(0, 1.015, 0.073);
  const DisplayTextBack = DisplayTextFront.clone();
  DisplayTextBack.position.z = -0.073;
  DisplayTextBack.rotation.y = Math.PI;
  Group.add(DisplayTextFront, DisplayTextBack);

  const NameTextFront = await Create3DText(ItemName, {
    MaxWidth: 0.66,
    MaxHeight: 0.17,
    Depth: 0.032,
    Material: PriceTextMaterial
  });
  NameTextFront.position.set(0, 0.81, 0.073);
  const NameTextBack = NameTextFront.clone();
  NameTextBack.position.z = -0.073;
  NameTextBack.rotation.y = Math.PI;
  Group.add(NameTextFront, NameTextBack);

  const AisleTextFront = await Create3DText(AisleLabel, {
    MaxWidth: 0.50,
    MaxHeight: 0.07,
    Depth: 0.022,
    Material: PriceTextMaterial
  });
  AisleTextFront.position.set(0, 0.62, 0.073);
  const AisleTextBack = AisleTextFront.clone();
  AisleTextBack.position.z = -0.073;
  AisleTextBack.rotation.y = Math.PI;
  Group.add(AisleTextFront, AisleTextBack);

  Group.userData.SignUtilityR73 = true;
  Group.userData.SignKind = "Price";
  Group.userData.SignStyle = Style;
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

window.__STORE_SIGN_UTILITY_BUILD__ = "V0.16.0-R74";