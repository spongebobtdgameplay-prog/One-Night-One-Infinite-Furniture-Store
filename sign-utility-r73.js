import * as THREE from "three";
import { CreateDoubleSided3DText } from "./three-text-utility-r73.js";

const DepartmentFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x857d70, roughness: 0.60, metalness: 0.42 });
const DepartmentBoardMaterial = new THREE.MeshStandardMaterial({ color: 0x748175, roughness: 0.86, metalness: 0.04 });
const DepartmentInsetMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa394, roughness: 0.90, metalness: 0.02 });
const DepartmentTextMaterial = new THREE.MeshStandardMaterial({ color: 0xffe7b8, roughness: 0.42, metalness: 0.05, emissive: 0x6a4b20, emissiveIntensity: 0.13 });

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

// Compatibility only. The old R73/R74/R80 pedestal price signs caused visible
// version swapping and sign forests. CompactPriceTagR83 is now the only retail
// price-sign authority. Returning an empty non-legacy-named group keeps old
// callers safe without generating geometry or text that will immediately be replaced.
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

window.__STORE_SIGN_UTILITY_BUILD__ = "V0.22.0-R83";