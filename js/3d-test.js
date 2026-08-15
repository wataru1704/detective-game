// 3D試作: 箱だけの街を動き回れるかの検証用（見た目のリアルさはまだ作り込まない）
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.Fog(0x05060a, 15, 45);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// ---------- ライト ----------
scene.add(new THREE.AmbientLight(0x8890b0, 2.2));
const moon = new THREE.DirectionalLight(0xaabbff, 1.5);
moon.position.set(-5, 10, -5);
scene.add(moon);

// ---------- 地面（street） ----------
const groundGeo = new THREE.PlaneGeometry(60, 40);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x1c1f27, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---------- 建物（2D版と同じレイアウトを3D箱に変換） ----------
// 2D版のcanvas座標(px)を、3D空間の(x, z)に変換するスケール
const SCALE = 1 / 26; // 520px -> 20units 相当
function toWorldX(px) { return (px - 260) * SCALE; }
function toWorldZ(py) { return (py - 180) * SCALE; }

const BUILDINGS_2D = [
  { x: 60, y: 60, w: 100, h: 80 },
  { x: 220, y: 40, w: 120, h: 60 },
  { x: 400, y: 60, w: 100, h: 100 },
  { x: 60, y: 220, w: 90, h: 90 },
  { x: 220, y: 200, w: 100, h: 70 },
  { x: 380, y: 220, w: 100, h: 100 },
];

const buildingBoxes = []; // 当たり判定用（world座標のAABB）
const neonColors = [0xff3366, 0x33e0ff, 0xffcc33, 0x66ff99, 0xff66ff];

BUILDINGS_2D.forEach((b, i) => {
  const w = b.w * SCALE;
  const d = b.h * SCALE;
  const height = 2 + Math.random() * 4;
  const cx = toWorldX(b.x + b.w / 2);
  const cz = toWorldZ(b.y + b.h / 2);

  const mat = new THREE.MeshStandardMaterial({ color: 0x2c303b, roughness: 0.7 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat);
  mesh.position.set(cx, height / 2, cz);
  scene.add(mesh);

  // ネオン看板っぽい発光パネル（プレースホルダー）
  const neonMat = new THREE.MeshBasicMaterial({ color: neonColors[i % neonColors.length] });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, 0.4), neonMat);
  neon.position.set(cx, height + 0.05, cz - d / 2 - 0.01);
  scene.add(neon);

  buildingBoxes.push({
    minX: cx - w / 2, maxX: cx + w / 2,
    minZ: cz - d / 2, maxZ: cz + d / 2,
  });
});

// ---------- プレイヤー ----------
const player = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.35, 0.7, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0xc94f4f })
);
player.position.set(toWorldX(30), 0.9, toWorldZ(30));
scene.add(player);

const PLAYER_RADIUS = 0.35;
const PLAYER_SPEED = 4.5; // units/秒

function isBlocked(x, z) {
  return buildingBoxes.some(
    (b) =>
      x + PLAYER_RADIUS > b.minX &&
      x - PLAYER_RADIUS < b.maxX &&
      z + PLAYER_RADIUS > b.minZ &&
      z - PLAYER_RADIUS < b.maxZ
  );
}

// ---------- 入力 ----------
const keys = {};
document.addEventListener("keydown", (e) => (keys[e.key] = true));
document.addEventListener("keyup", (e) => (keys[e.key] = false));

// スマホ用タッチボタン
document.querySelectorAll(".btn3d[data-key]").forEach((btn) => {
  const key = btn.dataset.key;
  const press = (e) => { e.preventDefault(); keys[key] = true; };
  const release = (e) => { e.preventDefault(); keys[key] = false; };
  btn.addEventListener("touchstart", press, { passive: false });
  btn.addEventListener("touchend", release, { passive: false });
  btn.addEventListener("touchcancel", release, { passive: false });
  btn.addEventListener("mousedown", press);
  btn.addEventListener("mouseup", release);
  btn.addEventListener("mouseleave", release);
});

// ---------- 視点回転（画面ドラッグ、ボタン部分は除く） ----------
let cameraYaw = 0;
const YAW_SENSITIVITY = 0.008;
let dragging = false;
let lastPointerX = 0;

renderer.domElement.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastPointerX = e.clientX;
});
window.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const deltaX = e.clientX - lastPointerX;
  lastPointerX = e.clientX;
  cameraYaw -= deltaX * YAW_SENSITIVITY;
});
window.addEventListener("pointerup", () => { dragging = false; });
window.addEventListener("pointercancel", () => { dragging = false; });

function updatePlayer(dt) {
  // 「上」＝画面奥（カメラが向いている方向）、「右」＝画面右、になるよう
  // 入力(forward/strafe)を、視点の回転(cameraYaw)に合わせてワールド座標に変換する
  let forwardInput = 0;
  let strafeInput = 0;
  if (keys["ArrowUp"] || keys["w"]) forwardInput += 1;
  if (keys["ArrowDown"] || keys["s"]) forwardInput -= 1;
  if (keys["ArrowRight"] || keys["d"]) strafeInput += 1;
  if (keys["ArrowLeft"] || keys["a"]) strafeInput -= 1;

  if (forwardInput === 0 && strafeInput === 0) return;

  const forwardX = -Math.sin(cameraYaw);
  const forwardZ = -Math.cos(cameraYaw);
  const rightX = Math.cos(cameraYaw);
  const rightZ = -Math.sin(cameraYaw);

  let dx = forwardX * forwardInput + rightX * strafeInput;
  let dz = forwardZ * forwardInput + rightZ * strafeInput;

  const len = Math.hypot(dx, dz);
  dx = (dx / len) * PLAYER_SPEED * dt;
  dz = (dz / len) * PLAYER_SPEED * dt;

  const p = player.position;
  if (!isBlocked(p.x + dx, p.z)) p.x += dx;
  if (!isBlocked(p.x, p.z + dz)) p.z += dz;

  // 進んでいる方向にキャラを向ける
  player.rotation.y = Math.atan2(dx, dz);
}

// ---------- 追従カメラ（画面ドラッグで自機の周りを回転） ----------
const CAMERA_DIST = 9;
const CAMERA_HEIGHT = 6;
function updateCamera() {
  const p = player.position;
  const offsetX = Math.sin(cameraYaw) * CAMERA_DIST;
  const offsetZ = Math.cos(cameraYaw) * CAMERA_DIST;
  camera.position.set(p.x + offsetX, p.y + CAMERA_HEIGHT, p.z + offsetZ);
  camera.lookAt(p.x, p.y, p.z);
}

// ---------- FPS表示 ----------
const fpsEl = document.getElementById("fps");
let frameCount = 0;
let fpsAccum = 0;

// ---------- ループ ----------
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  updatePlayer(dt);
  updateCamera();
  renderer.render(scene, camera);

  frameCount++;
  fpsAccum += dt;
  if (fpsAccum >= 0.5) {
    fpsEl.textContent = Math.round(frameCount / fpsAccum) + " fps";
    frameCount = 0;
    fpsAccum = 0;
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
