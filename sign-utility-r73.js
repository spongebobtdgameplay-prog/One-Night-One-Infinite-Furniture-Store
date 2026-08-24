import * as THREE from "three";
import { Create3DText, CreateDoubleSided3DText } from "./three-text-utility-r73.js";

const DepartmentFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x171916, roughness: 0.62, metalness: 0.58 });
const DepartmentBoardMaterial = new THREE.MeshStandardMaterial({ color: 0x34372f, roughness: 0.88, metalness: 0.05 });
const DepartmentInsetMaterial = new THREE.MeshStandardMaterial({ color: 0x4a493f, roughness: 0.90, metalness: 0.02 });
const DepartmentTextMaterial = new THREE.MeshStandardMaterial({ color: 0xeadbb7, roughness: 0.48, metalness: 0.08, emissive: 0x1d170c, emissiveIntensity: 0.08 });
const PriceFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x292925, roughness: 0.70, metalness: 0.34 });
const PriceBoardMaterial = new THREE.MeshStandardMaterial({ color: 0xd5c9ac, roughness: 0.92, metalness: 0.01 });
const PriceAccentMaterial = new THREE.MeshStandardMaterial({ color: 0x8b3024, roughness: 0.72, metalness: 0.05 });
const PriceTextMaterial = new THREE.MeshStandardMaterial({ color: 0x24251f, roughness: 0.55, metalness: 0.02 });
const PriceLightTextMaterial = new THREE.MeshStandardMaterial({ color: 0xf2e8cf, roughness: 0.55, metalness: 0.02 });

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

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.63, 0.09), PriceFrameMaterial);
  Frame.position.y = 0.78;
  const Board = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.55, 0.11), PriceBoardMaterial);
  Board.position.y = 0.78;
  const Accent = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.125), PriceAccentMaterial);
  Accent.position.set(0, 0.985, 0);
  const Pole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.60, 10), PriceFrameMaterial);
  Pole.position.y = 0.32;
  const Foot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.055, 14), PriceFrameMaterial);
  Foot.position.y = 0.028;
  Group.add(Frame, Board, Accent, Pole, Foot);

  const DisplayTextFront = await Create3DText("DISPLAY", {
    MaxWidth: 0.57,
    MaxHeight: 0.075,
    Depth: 0.025,
    Material: PriceLightTextMaterial
  });
  DisplayTextFront.position.set(0, 0.985, 0.072);
  const DisplayTextBack = DisplayTextFront.clone();
  DisplayTextBack.position.z = -0.072;
  DisplayTextBack.rotation.y = Math.PI;
  Group.add(DisplayTextFront, DisplayTextBack);

  const NameTextFront = await Create3DText(ItemName, {
    MaxWidth: 0.60,
    MaxHeight: 0.16,
    Depth: 0.032,
    Material: PriceTextMaterial
  });
  NameTextFront.position.set(0, 0.79, 0.072);
  const NameTextBack = NameTextFront.clone();
  NameTextBack.position.z = -0.072;
  NameTextBack.rotation.y = Math.PI;
  Group.add(NameTextFront, NameTextBack);

  const AisleTextFront = await Create3DText("AISLE TAG", {
    MaxWidth: 0.45,
    MaxHeight: 0.07,
    Depth: 0.022,
    Material: PriceTextMaterial
  });
  AisleTextFront.position.set(0, 0.61, 0.072);
  const AisleTextBack = AisleTextFront.clone();
  AisleTextBack.position.z = -0.072;
  AisleTextBack.rotation.y = Math.PI;
  Group.add(AisleTextFront, AisleTextBack);

  Group.userData.SignUtilityR73 = true;
  Group.userData.SignKind = "Price";
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

window.__STORE_SIGN_UTILITY_BUILD__ = "V0.15.0-R73";