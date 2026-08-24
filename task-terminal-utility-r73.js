import * as THREE from "three";
import { Create3DText } from "./three-text-utility-r73.js";

const CabinetMaterial = new THREE.MeshStandardMaterial({ color: 0x727c76, roughness: 0.56, metalness: 0.48 });
const CabinetDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x56615c, roughness: 0.62, metalness: 0.44 });
const CabinetTrimMaterial = new THREE.MeshStandardMaterial({ color: 0xa3aaa1, roughness: 0.46, metalness: 0.62 });
const LabelMaterial = new THREE.MeshStandardMaterial({ color: 0xf0dfbc, roughness: 0.55, metalness: 0.03, emissive: 0x4d381c, emissiveIntensity: 0.10 });
const RedMaterial = new THREE.MeshStandardMaterial({ color: 0xb84b3b, roughness: 0.50, metalness: 0.08 });
const AmberMaterial = new THREE.MeshStandardMaterial({ color: 0xd59b43, emissive: 0x7b4b16, emissiveIntensity: 0.34, roughness: 0.48 });
const GreenMaterial = new THREE.MeshStandardMaterial({ color: 0x76b783, emissive: 0x356f43, emissiveIntensity: 0.88, roughness: 0.32 });
const ControlMaterial = new THREE.MeshStandardMaterial({ color: 0x625d52, roughness: 0.58, metalness: 0.24 });

function AddCabinetShell(Group) {
  const Plinth = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.50), CabinetDoorMaterial);
  Plinth.position.y = 0.04;
  const Upright = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.72, 0.16), CabinetTrimMaterial);
  Upright.position.y = 0.42;
  const Body = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.88, 0.28), CabinetMaterial);
  Body.position.set(0, 1.00, 0);
  const Door = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.80, 0.035), CabinetDoorMaterial);
  Door.position.set(0, 1.00, 0.158);
  const TopCap = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.07, 0.32), CabinetTrimMaterial);
  TopCap.position.set(0, 1.47, 0);
  const BottomCap = TopCap.clone();
  BottomCap.position.y = 0.53;
  Group.add(Plinth, Upright, Body, Door, TopCap, BottomCap);

  const ScrewGeometry = new THREE.CylinderGeometry(0.022, 0.022, 0.012, 10);
  for (const X of [-0.29, 0.29]) {
    for (const Y of [0.66, 1.34]) {
      const Screw = new THREE.Mesh(ScrewGeometry, CabinetTrimMaterial);
      Screw.rotation.x = Math.PI * 0.5;
      Screw.position.set(X, Y, 0.182);
      Group.add(Screw);
    }
  }
}

async function AddBreakerFace(Group) {
  const Title = await Create3DText("BREAKER", {
    MaxWidth: 0.52,
    MaxHeight: 0.105,
    Depth: 0.025,
    Material: LabelMaterial
  });
  Title.position.set(0, 1.31, 0.191);
  Group.add(Title);

  const Reset = await Create3DText("RESET", {
    MaxWidth: 0.31,
    MaxHeight: 0.065,
    Depth: 0.020,
    Material: LabelMaterial
  });
  Reset.position.set(0, 0.67, 0.191);
  Group.add(Reset);

  const Rail = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.035, 0.045), CabinetTrimMaterial);
  Rail.position.set(-0.04, 1.08, 0.202);
  Group.add(Rail);

  const ToggleGeometry = new THREE.BoxGeometry(0.075, 0.14, 0.065);
  const HandleGeometry = new THREE.BoxGeometry(0.045, 0.09, 0.05);
  for (let Index = 0; Index < 4; Index += 1) {
    const X = -0.20 + Index * 0.13;
    const Toggle = new THREE.Mesh(ToggleGeometry, ControlMaterial);
    Toggle.position.set(X, 1.08, 0.218);
    const Handle = new THREE.Mesh(HandleGeometry, CabinetTrimMaterial);
    Handle.position.set(X, 1.095, 0.268);
    Handle.rotation.x = -0.18;
    Group.add(Toggle, Handle);
  }

  const LeverPivot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.065, 12), CabinetTrimMaterial);
  LeverPivot.rotation.x = Math.PI * 0.5;
  LeverPivot.position.set(0.255, 0.85, 0.222);
  const Lever = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.29, 0.085), RedMaterial);
  Lever.position.set(0.255, 0.91, 0.265);
  Lever.rotation.z = -0.30;
  const LeverGrip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.085, 0.10), RedMaterial);
  LeverGrip.position.set(0.30, 1.04, 0.28);
  LeverGrip.rotation.z = -0.30;
  Group.add(LeverPivot, Lever, LeverGrip);

  const StatusPlate = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.075, 0.028), GreenMaterial.clone());
  StatusPlate.position.set(-0.13, 0.82, 0.191);
  const StatusText = await Create3DText("READY", {
    MaxWidth: 0.14,
    MaxHeight: 0.035,
    Depth: 0.012,
    Material: ControlMaterial
  });
  StatusText.position.set(-0.13, 0.82, 0.210);
  Group.add(StatusPlate, StatusText);
  return StatusPlate;
}

async function AddScreenTerminalFace(Group, Type) {
  const TitleText = Type === "manifest" ? "MANIFEST" : "SCANNER";
  const Title = await Create3DText(TitleText, {
    MaxWidth: 0.52,
    MaxHeight: 0.095,
    Depth: 0.024,
    Material: LabelMaterial
  });
  Title.position.set(0, 1.31, 0.191);
  Group.add(Title);

  const ScreenFrame = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.31, 0.055), CabinetTrimMaterial);
  ScreenFrame.position.set(0, 1.02, 0.194);
  const Screen = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.25, 0.035), GreenMaterial.clone());
  Screen.position.set(0, 1.02, 0.228);
  Group.add(ScreenFrame, Screen);

  const Ready = await Create3DText("READY", {
    MaxWidth: 0.24,
    MaxHeight: 0.065,
    Depth: 0.015,
    Material: ControlMaterial
  });
  Ready.position.set(0, 1.02, 0.250);
  Group.add(Ready);

  const ButtonLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.032, 12), AmberMaterial);
  ButtonLeft.rotation.x = Math.PI * 0.5;
  ButtonLeft.position.set(-0.15, 0.72, 0.194);
  const ButtonRight = ButtonLeft.clone();
  ButtonRight.material = RedMaterial;
  ButtonRight.position.x = 0.15;
  Group.add(ButtonLeft, ButtonRight);
  return Screen;
}

export async function CreateTaskTerminal3D(Type) {
  const Normalized = String(Type || "scanner").toLowerCase();
  const Group = new THREE.Group();
  Group.name = `TaskTerminal3DR73-${Normalized}`;
  AddCabinetShell(Group);

  let Screen;
  if (Normalized === "breaker") Screen = await AddBreakerFace(Group);
  else Screen = await AddScreenTerminalFace(Group, Normalized);

  Group.userData.TaskTerminalUtilityR73 = true;
  Group.userData.TaskType = Normalized;
  Group.userData.NoBeaconR83 = true;
  return { Group, Screen };
}

window.__STORE_TASK_TERMINAL_UTILITY_BUILD__ = "V0.22.0-R83";