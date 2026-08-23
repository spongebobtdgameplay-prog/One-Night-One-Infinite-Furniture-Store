import * as THREE from "three";

const Game = window.__STORE_GAME__;

if (!Game?.Scene) throw new Error("Game must load before sign upgrade.");

const FrameMaterial = new THREE.MeshStandardMaterial({
  color: 0x4b3421,
  roughness: 0.82,
  metalness: 0.03
});

const EdgeMaterial = new THREE.MeshStandardMaterial({
  color: 0x6f4b2c,
  roughness: 0.88,
  metalness: 0.01
});

function MakeFaceMaterial(Texture) {
  return new THREE.MeshStandardMaterial({
    map: Texture,
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0,
    emissive: 0x5a3b20,
    emissiveIntensity: 0.10,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
}

function UpgradeSign(Group) {
  if (!Group || Group.userData.Sign3DUpgraded) return;
  const ExistingFaces = Group.children.filter(Child => Child.isMesh && Child.geometry?.type === "PlaneGeometry");
  const Texture = ExistingFaces.find(Face => Face.material?.map)?.material?.map || null;
  if (!Texture) return;

  for (const Face of ExistingFaces) Group.remove(Face);

  const Frame = new THREE.Mesh(new THREE.BoxGeometry(4.86, 1.22, 0.16), FrameMaterial);
  Frame.name = "SectionSignFrame3D";
  Group.add(Frame);

  const Board = new THREE.Mesh(new THREE.BoxGeometry(4.66, 1.04, 0.18), EdgeMaterial);
  Board.name = "SectionSignBoard3D";
  Group.add(Board);

  const Front = new THREE.Mesh(new THREE.PlaneGeometry(4.56, 0.96), MakeFaceMaterial(Texture));
  Front.name = "SectionSignFront3D";
  Front.position.z = 0.096;
  Group.add(Front);

  const Back = new THREE.Mesh(new THREE.PlaneGeometry(4.56, 0.96), MakeFaceMaterial(Texture));
  Back.name = "SectionSignBack3D";
  Back.position.z = -0.096;
  Back.rotation.y = Math.PI;
  Group.add(Back);

  Group.userData.Sign3DUpgraded = true;
}

function UpgradeAllSigns() {
  Game.Scene.traverse(Object => {
    if (Object.name === "SectionSign") UpgradeSign(Object);
  });
  requestAnimationFrame(UpgradeAllSigns);
}

window.__STORE_SIGN_BUILD__ = "V0.15";
requestAnimationFrame(UpgradeAllSigns);