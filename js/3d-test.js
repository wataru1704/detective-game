// 3D試作: Kenney City Kit（CC0）＋人型キャラ（Quaternius Adventurer, CC0）で街を作る
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.Fog(0x05060a, 20, 60);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 150);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

// ---------- ポストプロセス（ネオンのグロー効果） ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.0, // strength
  0.5, // radius
  0.3  // threshold（これを超えた明るさの部分だけ光る）
);
composer.addPass(bloomPass);

// ---------- ライト ----------
scene.add(new THREE.AmbientLight(0x8890b0, 2.2));
const moon = new THREE.DirectionalLight(0xaabbff, 1.5);
moon.position.set(-5, 18, -8);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -35;
moon.shadow.camera.right = 35;
moon.shadow.camera.top = 35;
moon.shadow.camera.bottom = -35;
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 60;
moon.shadow.bias = -0.002;
scene.add(moon);

// ---------- 夜空（グラデーション＋星） ----------
function makeSkyGradientTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#02030a");
  grad.addColorStop(0.55, "#0a0e1f");
  grad.addColorStop(1, "#2a1f3d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  return new THREE.CanvasTexture(canvas);
}
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(200, 24, 24),
  new THREE.MeshBasicMaterial({ map: makeSkyGradientTexture(), side: THREE.BackSide, fog: false })
);
scene.add(sky);

const STAR_COUNT = 600;
const starPositions = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  const r = 180;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.random() * Math.PI * 0.5; // 上半分のみ
  starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = r * Math.cos(phi) + 15;
  starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })
);
scene.add(stars);

// ---------- 地面（street、アスファルト風テクスチャ＋道路の白線） ----------
function makeRoadTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1c1f27";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = 15 + Math.random() * 12;
    ctx.fillStyle = `rgba(${v + 10},${v + 12},${v + 18},0.18)`;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.strokeStyle = "rgba(225,215,175,0.55)";
  ctx.lineWidth = 4;
  ctx.setLineDash([22, 18]);
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  return tex;
}
const groundGeo = new THREE.PlaneGeometry(90, 90);
const groundMat = new THREE.MeshStandardMaterial({ map: makeRoadTexture(), roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();
const buildingBoxes = []; // 当たり判定用（world座標のAABB）
const neonColors = [0xff3366, 0x33e0ff, 0xffcc33, 0x66ff99, 0xff66ff, 0xff9933];
// 建物ごとに色を変える（本体色）。窓は別扱いで暖色に光らせる
const buildingPalette = [
  0xc9506b, 0x4f8fc9, 0x6bc98f, 0xc9a24f,
  0x8f6bc9, 0xc96b8f, 0x4fc9c0, 0xc98850,
];

// ---------- 街のレイアウト（Kenney City Kitの建物30種を格子状に配置） ----------
const ALL_BUILDINGS = [
  "large_buildingA", "large_buildingB", "large_buildingC", "large_buildingD",
  "large_buildingE", "large_buildingF", "large_buildingG",
  "low_buildingA", "low_buildingB", "low_buildingC", "low_buildingD",
  "low_buildingF", "low_buildingG", "low_buildingI", "low_buildingJ", "low_buildingN",
  "low_wideA", "low_wideB",
  "skyscraperA", "skyscraperB", "skyscraperC", "skyscraperD", "skyscraperE", "skyscraperF",
  "small_buildingA", "small_buildingB", "small_buildingC",
  "small_buildingD", "small_buildingE", "small_buildingF",
];

const GRID_COLS = 6;
const CELL_SIZE = 7; // 区画の間隔（通り幅込み）
const FOOTPRINT = 3.4; // 各区画で建物が占める大きさ（正方形近似）
const HEIGHT_BOOST = 1.8; // 建物の高さを誇張して見上げる感じを出す

const gridRows = Math.ceil(ALL_BUILDINGS.length / GRID_COLS);

ALL_BUILDINGS.forEach((name, idx) => {
  const col = idx % GRID_COLS;
  const row = Math.floor(idx / GRID_COLS);
  const cx = (col - (GRID_COLS - 1) / 2) * CELL_SIZE;
  const cz = (row - (gridRows - 1) / 2) * CELL_SIZE;
  const w = FOOTPRINT;
  const d = FOOTPRINT;

  // モデル読み込み中でも当たり判定は成立するよう、まず概算のAABBを入れておく
  const boxEntry = {
    minX: cx - w / 2, maxX: cx + w / 2,
    minZ: cz - d / 2, maxZ: cz + d / 2,
  };
  buildingBoxes.push(boxEntry);

  loader.load(
    `assets/${name}.glb`,
    (gltf) => {
      const model = gltf.scene;

      const rawBox = new THREE.Box3().setFromObject(model);
      const rawSize = new THREE.Vector3();
      rawBox.getSize(rawSize);
      const scaleFactor = Math.max(w, d) / Math.max(rawSize.x, rawSize.z);
      model.scale.set(scaleFactor, scaleFactor * HEIGHT_BOOST, scaleFactor);

      const scaledBox = new THREE.Box3().setFromObject(model);
      const centerX = (scaledBox.min.x + scaledBox.max.x) / 2;
      const centerZ = (scaledBox.min.z + scaledBox.max.z) / 2;
      model.position.set(cx - centerX, -scaledBox.min.y, cz - centerZ);
      const bodyColor = new THREE.Color(buildingPalette[idx % buildingPalette.length]);
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          const matName = (o.material && o.material.name) || "";
          o.material = o.material.clone();
          if (matName === "window" || matName === "trim") {
            // 窓は暖色に光らせる（ブルームでほんのり灯りっぽく見える）
            o.material.color.setHex(0xffcc77);
            o.material.emissive = new THREE.Color(0xffaa44);
            o.material.emissiveIntensity = 1.3;
          } else {
            o.material.color.copy(bodyColor);
          }
        }
      });
      scene.add(model);

      const finalBox = new THREE.Box3().setFromObject(model);
      boxEntry.minX = finalBox.min.x;
      boxEntry.maxX = finalBox.max.x;
      boxEntry.minZ = finalBox.min.z;
      boxEntry.maxZ = finalBox.max.z;

      // ネオン看板（明るさを1.0以上にして、ブルームで光らせる）
      const topY = finalBox.max.y;
      const neonMat = new THREE.MeshBasicMaterial({ color: neonColors[idx % neonColors.length] });
      neonMat.color.multiplyScalar(2.5);
      const neon = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.5), neonMat);
      neon.position.set(cx, topY + 0.35, cz - d / 2 - 0.01);
      scene.add(neon);
    },
    undefined,
    (err) => console.error(`モデル読み込み失敗: ${name}`, err)
  );
});

// ---------- プレイヤー（見た目は人型モデル、当たり判定・移動はplayer自体で扱う） ----------
const player = new THREE.Object3D();
const spawnZ = ((gridRows - 1) / 2) * CELL_SIZE + CELL_SIZE * 0.8;
player.position.set(0, 0, spawnZ);
scene.add(player);

let PLAYER_RADIUS = 0.3; // モデル読み込み後に実測値へ更新
const PLAYER_SPEED = 4.5; // units/秒
const PLAYER_ROTATION_OFFSET = 0; // モデルの正面とatan2の基準がズレていたら調整

let mixer = null;
let idleAction = null;
let walkAction = null;
let currentAction = null;

loader.load(
  "assets/adventurer.glb",
  (gltf) => {
    const model = gltf.scene;

    // このモデルはスキン付き（骨で変形するタイプ）で、Box3による自動サイズ測定が
    // 正しく効かない（骨のワールド座標は正常だが、ジオメトリ側の見かけ上のバウンディングが
    // 実際のスキン変形後のサイズと一致しない）。そのため、実際にレンダリングして
    // 確認した見た目のバランスをもとに、スケールを直接指定する。
    const CHAR_SCALE = 0.55;
    model.scale.setScalar(CHAR_SCALE);
    model.position.set(0, 0, 0); // Rootボーンが既に接地面(y=0)にある

    // スキン付きメッシュはフラスタムカリングの判定を誤ることがあるため無効化しておく
    model.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        o.castShadow = true;
      }
    });

    player.add(model);

    PLAYER_RADIUS = 0.22 * CHAR_SCALE * 2; // 肩幅目安（見た目に合わせて後で微調整可）

    mixer = new THREE.AnimationMixer(model);
    const clips = gltf.animations;
    const walkClip = THREE.AnimationClip.findByName(clips, "CharacterArmature|Walk");
    const idleClip = THREE.AnimationClip.findByName(clips, "CharacterArmature|Idle");
    walkAction = mixer.clipAction(walkClip);
    idleAction = mixer.clipAction(idleClip);
    currentAction = idleAction;
    idleAction.play();
  },
  undefined,
  (err) => console.error("人型モデル読み込み失敗", err)
);

function setAction(action) {
  if (!action || currentAction === action) return;
  if (currentAction) currentAction.fadeOut(0.2);
  action.reset().fadeIn(0.2).play();
  currentAction = action;
}

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

// ---------- スマホ用バーチャルスティック ----------
const joyBase = document.getElementById("joystick-base");
const joyKnob = document.getElementById("joystick-knob");
const joyState = { active: false, pointerId: null, x: 0, z: 0 }; // x:-1〜1(右+), z:-1〜1(前+)
const JOY_MAX_PX = 40; // ノブが動ける最大距離(px)

function joyUpdateFromEvent(e) {
  const rect = joyBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const dist = Math.hypot(dx, dy);
  if (dist > JOY_MAX_PX) {
    dx = (dx / dist) * JOY_MAX_PX;
    dy = (dy / dist) * JOY_MAX_PX;
  }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joyState.x = dx / JOY_MAX_PX;
  joyState.z = -dy / JOY_MAX_PX; // 画面上方向へのドラッグ＝前進(+)
}

function joyReset() {
  joyState.active = false;
  joyState.pointerId = null;
  joyState.x = 0;
  joyState.z = 0;
  joyKnob.style.transform = "translate(0px, 0px)";
}

joyBase.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  joyState.active = true;
  joyState.pointerId = e.pointerId;
  joyUpdateFromEvent(e);
});
window.addEventListener("pointermove", (e) => {
  if (!joyState.active || e.pointerId !== joyState.pointerId) return;
  joyUpdateFromEvent(e);
});
window.addEventListener("pointerup", (e) => {
  if (e.pointerId === joyState.pointerId) joyReset();
});
window.addEventListener("pointercancel", (e) => {
  if (e.pointerId === joyState.pointerId) joyReset();
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

const JOY_DEAD_ZONE = 0.15;

function updatePlayer(dt) {
  // 「上」＝画面奥（カメラが向いている方向）、「右」＝画面右、になるよう
  // 入力(forward/strafe)を、視点の回転(cameraYaw)に合わせてワールド座標に変換する
  let forwardInput = 0;
  let strafeInput = 0;
  if (keys["ArrowUp"] || keys["w"]) forwardInput += 1;
  if (keys["ArrowDown"] || keys["s"]) forwardInput -= 1;
  if (keys["ArrowRight"] || keys["d"]) strafeInput += 1;
  if (keys["ArrowLeft"] || keys["a"]) strafeInput -= 1;

  if (Math.hypot(joyState.x, joyState.z) > JOY_DEAD_ZONE) {
    forwardInput += joyState.z;
    strafeInput += joyState.x;
  }

  if (forwardInput === 0 && strafeInput === 0) {
    setAction(idleAction);
    return;
  }

  const forwardX = -Math.sin(cameraYaw);
  const forwardZ = -Math.cos(cameraYaw);
  const rightX = Math.cos(cameraYaw);
  const rightZ = -Math.sin(cameraYaw);

  let dx = forwardX * forwardInput + rightX * strafeInput;
  let dz = forwardZ * forwardInput + rightZ * strafeInput;

  // 大きさは最大1に制限（アナログスティックの傾き具合を速度に反映する）
  const len = Math.hypot(dx, dz);
  if (len > 1) {
    dx /= len;
    dz /= len;
  }
  dx *= PLAYER_SPEED * dt;
  dz *= PLAYER_SPEED * dt;

  const p = player.position;
  let moved = false;
  if (!isBlocked(p.x + dx, p.z)) { p.x += dx; moved = true; }
  if (!isBlocked(p.x, p.z + dz)) { p.z += dz; moved = true; }

  if (moved) {
    player.rotation.y = Math.atan2(dx, dz) + PLAYER_ROTATION_OFFSET;
    setAction(walkAction);
  } else {
    setAction(idleAction);
  }
}

// ---------- 追従カメラ（画面ドラッグで自機の周りを回転） ----------
const CAMERA_DIST = 4.5;
const CAMERA_HEIGHT = 2.6;
function updateCamera() {
  const p = player.position;
  const offsetX = Math.sin(cameraYaw) * CAMERA_DIST;
  const offsetZ = Math.cos(cameraYaw) * CAMERA_DIST;
  camera.position.set(p.x + offsetX, p.y + CAMERA_HEIGHT, p.z + offsetZ);
  camera.lookAt(p.x, p.y + 0.6, p.z);
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
  if (mixer) mixer.update(dt);
  composer.render();

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
  composer.setSize(window.innerWidth, window.innerHeight);
});
