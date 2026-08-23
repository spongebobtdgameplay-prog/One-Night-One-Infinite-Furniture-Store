import * as THREE from "three";

const Game = window.__STORE_GAME__;

if (!Game?.Scene || !Game?.Tasks) throw new Error("Game must load before task visual fix.");

const Rebuilt = new WeakSet();
const Metal = new THREE.MeshStandardMaterial({ color: 0x77766f, roughness: 0.72, metalness: 0.30 });
const Trim = new THREE.MeshStandardMaterial({ color: 0x383733, roughness: 0.78, metalness: 0.22 });
const Plastic = new THREE.MeshStandardMaterial({ color: 0xb59b72, roughness: 0.86, metalness: 0.02 });

function RebuildTask(Task) {
  const Group = Task?.Object;
  if (!Group?.isObject3D || Rebuilt.has(Group)) return;
  Rebuilt.add(Group);

  while (Group.children.length) Group.remove(Group.children[0]);

  const Base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.30), Trim);
  Base.position.y = 0.024;
  Group.add(Base);

  const Post = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.72, 0.055), Metal);
  Post.position.y = 0.40;
  Group.add(Post);

  const Back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.36, 0.075), Plastic);
  Back.position.y = 0.80;
  Back.rotation.x = -0.10;
  Group.add(Back);

  const Header = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.055, 0.018), Trim);
  Header.position.set(0, 0.90, 0.048);
  Header.rotation.x = -0.10;
  Group.add(Header);

  const ScreenMaterial = new THREE.MeshStandardMaterial({
    color: 0x748779,
    emissive: 0x26382c,
    emissiveIntensity: 0.22,
    roughness: 0.52,
    metalness: 0.04
  });
  const Screen = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.17, 0.018), ScreenMaterial);
  Screen.position.set(0, 0.79, 0.052);
  Screen.rotation.x = -0.10;
  Group.add(Screen);

  const Scanner = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.16, 0.06), Trim);
  Scanner.position.set(0.18, 0.61, 0.03);
  Scanner.rotation.z = -0.10;
  Group.add(Scanner);

  Task.Screen = Screen;
}

function Tick() {
  for (const Task of Game.Tasks.values()) RebuildTask(Task);
  requestAnimationFrame(Tick);
}

Tick();
window.__STORE_TASK_VISUAL_BUILD__ = "V0.11-R8";
