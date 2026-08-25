import * as THREE from "three";
import { CreateDoubleSided3DText } from "./three-text-utility-r73.js";

const DepartmentFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x857d70, roughness: 0.60, metalness: 0.42 });
const DepartmentBoardMaterial = new THREE.MeshStandardMaterial({ color: 0x748175, roughness: 0.86, metalness: 0.04 });
const DepartmentInsetMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa394, roughness: 0.90, metalness: 0.02 });
const DepartmentTextMaterial = new THREE.MeshStandardMaterial({ color: 0xffe7b8, roughness: 0.42, metalness: 0.05, emissive: 0x6a4b20, emissiveIntensity: 0.13 });
const DepartmentMountMaterial = new THREE.MeshStandardMaterial({ color: 0x8e918b, roughness: 0.52, metalness: 0.58 });

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

function AddCeilingMount(Group, Width, Height, HangerLength) {
  const HangerX = Math.min(Width * 0.31, 1.72);
  const HangerCenterY = Height * 0.5 + HangerLength * 0.5;
  const TopY = Height * 0.5 + HangerLength;

  for (const X of [-HangerX, HangerX]) {
    const Rod = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, HangerLength, 10), DepartmentMountMaterial);
    Rod.name = "DepartmentSignCeilingRodR85";
    Rod.position.set(X, HangerCenterY, 0);
    Group.add(Rod);

    const CeilingPlate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.16), DepartmentMountMaterial);
    CeilingPlate.name = "DepartmentSignCeilingPlateR85";
    CeilingPlate.position.set(X, TopY + 0.0225, 0);
    Group.add(CeilingPlate);

    const BoardBracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.14), DepartmentMountMaterial);
    BoardBracket.name = "DepartmentSignBoardBracketR85";
    BoardBracket.position.set(X, Height * 0.5 + 0.04, 0);
    Group.add(BoardBracket);
  }

  Group.userData.MountTopY = TopY + 0.045;
}

export async function CreateDepartmentSign3D(Text, Options = {}) {
  const Width = Options.Width ?? 5.30;
  const Height = Options.Height ?? 0.84;
  const Depth = Options.Depth ?? 0.17;
  const HangerLength = Options.HangerLength ?? 0.70;
  const Group = new THREE.Group();
  Group.name = Options.Name || "DepartmentSign3DR73";

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(Width, Height, Depth), DepartmentFrameMaterial);
  const Board = new THREE.Mesh(new THREE.BoxGeometry(Width - 0.15, Height - 0.15, Depth + 0.016), DepartmentBoardMaterial);
  const Inset = new THREE.Mesh(new THREE.BoxGeometry(Width - 0.30, Height - 0.27, Depth + 0.025), DepartmentInsetMaterial);
  Frame.name = "DepartmentSignFrameR73";
  Board.name = "DepartmentSignBoardR73";
  Inset.name = "DepartmentSignInsetR73";
  Group.add(Frame, Board, Inset);

  const TextDepth = 0.035;
  const BoardFace = (Depth + 0.025) * 0.5;
  const TextCenter = BoardFace + TextDepth * 0.5 + 0.0015;
  const TextGroup = await CreateDoubleSided3DText(Text, {
    MaxWidth: Width - 0.48,
    MaxHeight: Height - 0.24,
    Depth: TextDepth,
    Material: DepartmentTextMaterial,
    FrontZ: TextCenter,
    BackZ: -TextCenter
  });
  TextGroup.name = "DepartmentSignTextR73";
  Group.add(TextGroup);

  AddBorderBars(Group, Width - 0.20, Height - 0.20, Depth + 0.040, DepartmentTextMaterial, 0.030);
  AddCeilingMount(Group, Width, Height, HangerLength);

  Group.userData.SignUtilityR73 = true;
  Group.userData.SignKind = "Department";
  Group.userData.CeilingMountedR85 = true;
  return Group;
}

export async function CreateStandingPriceSign3D(ItemName, Options = {}) {
  const Group = new THREE.Group();
  Group.name = "SuppressedLegacyPriceSignR83";
  Group.userData.SignUtilityR73 = true;
  Group.userData.SignKind = "SuppressedLegacyPrice";
  Group.userData.RequestedName = Options.Name || "FurniturePriceSignR73";
  Group.userData.ItemName = String(ItemName || "ITEM");
  Group.userData.Price = String(Options.Price || "$0.00");
  Group.userData.LegacyPriceSuppressedR83 = true;
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

window.__STORE_SIGN_UTILITY_BUILD__ = "V0.23.1-R85";