import * as THREE from "three";

const Game = window.__STORE_GAME__;

if (!Game?.Scene) throw new Error("Game must load before sign fix.");

const FrameMaterial = new THREE.MeshStandardMaterial({ color: 0x4b3421, roughness: 0.88, metalness: 0.02 });
const BoardMaterial = new THREE.MeshStandardMaterial({ color: 0xb9874f, roughness: 0.9, metalness: 0 });

function CreateLabelMaterial(Texture) {
  return new THREE.MeshStandardMaterial({
    map: Texture,
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    emissive: 0x24170d,
    emissiveIntensity: 0.05,
    side: THREE.FrontSide
  });
}

function UpgradeSign(Group) {
  if (!Group || Group.userData.SignSolid3D) return;
  const Planes = Group.children.filter(Child => Child.isMesh && Child.geometry?.type === "PlaneGeometry");
  const Texture = Planes.find(Plane => Plane.material?.map)?.material?.map;
  if (!Texture) return;

  for (const Plane of Planes) Group.remove(Plane);

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(4.92, 1.30, 0.20), FrameMaterial);
  Frame.name = "SectionSignFrame";
  Group.add(Frame);

  const Board = new THREE.Mesh(new THREE.BoxGeometry(4.70, 1.12, 0.24), BoardMaterial);
  Board.name = "SectionSignBoard";
  Group.add(Board);

  const Front = new THREE.Mesh(new THREE.PlaneGeometry(4.60, 1.02), CreateLabelMaterial(Texture));
  Front.name = "SectionSignLabelFront";
  Front.position.z = 0.122;
  Group.add(Front);

  const Back = new THREE.Mesh(new THREE.PlaneGeometry(4.60, 1.02), CreateLabelMaterial(Texture));
  Back.name = "SectionSignLabelBack";
  Back.position.z = -0.122;
  Back.rotation.y = Math.PI;
  Group.add(Back);

  Group.userData.SignSolid3D = true;
}

let FrameCounter = 0;
function ProcessSigns() {
  FrameCounter += 1;
  if (FrameCounter === 1 || FrameCounter % 20 === 0) {
    Game.Scene.traverse(Object => {
      if (Object.name === "SectionSign") UpgradeSign(Object);
    });
  }
  requestAnimationFrame(ProcessSigns);
}

requestAnimationFrame(ProcessSigns);
window.__STORE_SIGN_FIX_BUILD__ = "V0.11-R2";
