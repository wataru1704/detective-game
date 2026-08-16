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

// ---------- 街のレイアウト定数（建物・地面の両方で使うので先に定義） ----------
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
const CELL_SIZE = 6; // 区画の間隔（通り幅込み）。建物間を詰めるため7→6に短縮
const FOOTPRINT = 3.4; // 各区画で建物が占める大きさ（正方形近似）
const HEIGHT_BOOST = 1.8; // 建物の高さを誇張して見上げる感じを出す
const gridRows = Math.ceil(ALL_BUILDINGS.length / GRID_COLS);

// ---------- 地面（車道） ----------
function makeAsphaltTexture() {
  const px = 256;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1c1f27";
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * px;
    const y = Math.random() * px;
    const v = 14 + Math.random() * 10;
    ctx.fillStyle = `rgba(${v + 10},${v + 12},${v + 18},0.16)`;
    ctx.fillRect(x, y, 2, 2);
  }
  // 補修跡っぽいまだらなパッチを少し混ぜて、繰り返しが目立ちにくいようにする
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * px;
    const y = Math.random() * px;
    const w = 18 + Math.random() * 40;
    const h = 14 + Math.random() * 28;
    ctx.fillStyle = "rgba(40,42,50,0.22)";
    ctx.fillRect(x, y, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const GROUND_TILES = 14; // 縦横に何区画ぶん敷くか（街の格子より一回り広く）
const GROUND_SIZE = CELL_SIZE * GROUND_TILES;
const asphaltTex = makeAsphaltTexture();
asphaltTex.repeat.set(GROUND_TILES * 3, GROUND_TILES * 3); // 目を細かくして繰り返しを目立ちにくくする
const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
const groundMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- 歩道（縁石つきの立体にして、道路より一段高くする） ----------
function makeSidewalkTexture() {
  const px = 128;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#57544c";
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 350; i++) {
    const x = Math.random() * px;
    const y = Math.random() * px;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1.5;
  const seams = 4;
  for (let i = 1; i < seams; i++) {
    const p = (px / seams) * i;
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(px, p); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, px); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const CURB_HEIGHT = 0.14;
const SIDEWALK_SIZE = FOOTPRINT + 0.5;
const sidewalkTopMat = new THREE.MeshStandardMaterial({ map: makeSidewalkTexture(), roughness: 0.95 });
const curbSideMat = new THREE.MeshStandardMaterial({ color: 0x6a6558, roughness: 0.85 });

for (let row = 0; row < gridRows; row++) {
  for (let col = 0; col < GRID_COLS; col++) {
    const cx = (col - (GRID_COLS - 1) / 2) * CELL_SIZE;
    const cz = (row - (gridRows - 1) / 2) * CELL_SIZE;
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(SIDEWALK_SIZE, CURB_HEIGHT, SIDEWALK_SIZE),
      [curbSideMat, curbSideMat, sidewalkTopMat, curbSideMat, curbSideMat, curbSideMat]
    );
    curb.position.set(cx, CURB_HEIGHT / 2, cz);
    curb.receiveShadow = true;
    curb.castShadow = true;
    scene.add(curb);
  }
}

// ---------- 車道のセンターライン（通り沿いに実際に配置。地面全体に模様を敷き詰めない） ----------
function makeDashTexture(alongV) {
  const w = alongV ? 16 : 64;
  const h = alongV ? 64 : 16;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // ブルームで異常に光って膨張しないよう、明るさは控えめにしておく
  ctx.fillStyle = "rgba(180,172,150,0.6)";
  if (alongV) {
    ctx.fillRect(4, 10, w - 8, 26);
  } else {
    ctx.fillRect(10, 4, 26, h - 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const dashTexV = makeDashTexture(true);
const dashTexH = makeDashTexture(false);
const DASH_PERIOD = 1.4; // ダッシュ1つぶんが実寸でどれくらいの長さになるか
const DASH_WIDTH = 0.3;

function addVerticalStreetDashes(x, zFrom, zTo) {
  const length = Math.abs(zTo - zFrom);
  const tex = dashTexV.clone();
  tex.needsUpdate = true;
  tex.repeat.set(1, length / DASH_PERIOD);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(DASH_WIDTH, length), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.015, (zFrom + zTo) / 2);
  scene.add(mesh);
}
function addHorizontalStreetDashes(z, xFrom, xTo) {
  const length = Math.abs(xTo - xFrom);
  const tex = dashTexH.clone();
  tex.needsUpdate = true;
  tex.repeat.set(length / DASH_PERIOD, 1);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, DASH_WIDTH), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((xFrom + xTo) / 2, 0.015, z);
  scene.add(mesh);
}

const streetZExtent = ((gridRows - 1) / 2 + 0.5) * CELL_SIZE + CELL_SIZE * 1.2;
for (let c = 0; c < GRID_COLS - 1; c++) {
  const x = (c + 0.5 - (GRID_COLS - 1) / 2) * CELL_SIZE;
  addVerticalStreetDashes(x, -streetZExtent, streetZExtent);
}
const streetXExtent = ((GRID_COLS - 1) / 2 + 0.5) * CELL_SIZE + CELL_SIZE * 1.2;
for (let r = 0; r < gridRows - 1; r++) {
  const z = (r + 0.5 - (gridRows - 1) / 2) * CELL_SIZE;
  addHorizontalStreetDashes(z, -streetXExtent, streetXExtent);
}

// ---------- 横断歩道（交差点の4辺それぞれに、渡る向きに合わせたしま模様で配置） ----------
// alongV=false: しまがX方向に並ぶ（南北の通りを、東西に渡る用）
// alongV=true : しまがZ方向に並ぶ（東西の通りを、南北に渡る用）
function makeCrosswalkTexture(alongV) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "rgba(180,172,150,0.55)";
  const stripes = 5;
  const stripeW = size / (stripes * 2);
  for (let i = 0; i < stripes; i++) {
    if (alongV) {
      ctx.fillRect(0, i * stripeW * 2, size, stripeW);
    } else {
      ctx.fillRect(i * stripeW * 2, 0, stripeW, size);
    }
  }
  return new THREE.CanvasTexture(canvas);
}
const crosswalkTexH = makeCrosswalkTexture(false);
const crosswalkTexV = makeCrosswalkTexture(true);
const crosswalkSize = CELL_SIZE - SIDEWALK_SIZE; // 通りの幅
const CROSSWALK_DEPTH = Math.min(1.1, crosswalkSize * 0.8); // 横断歩道帯の奥行き

for (let c = 0; c < GRID_COLS - 1; c++) {
  for (let r = 0; r < gridRows - 1; r++) {
    const x = (c + 0.5 - (GRID_COLS - 1) / 2) * CELL_SIZE;
    const z = (r + 0.5 - (gridRows - 1) / 2) * CELL_SIZE;
    const half = crosswalkSize / 2 - CROSSWALK_DEPTH / 2;

    // 南北の通り（Z方向）を、東西に渡る横断歩道。交差点の南北の入口2箇所に配置
    [-1, 1].forEach((sign) => {
      const mat = new THREE.MeshStandardMaterial({ map: crosswalkTexH, transparent: true, depthWrite: false, roughness: 0.9 });
      const cw = new THREE.Mesh(new THREE.PlaneGeometry(crosswalkSize, CROSSWALK_DEPTH), mat);
      cw.rotation.x = -Math.PI / 2;
      cw.position.set(x, 0.02, z + sign * half);
      scene.add(cw);
    });

    // 東西の通り（X方向）を、南北に渡る横断歩道。交差点の東西の入口2箇所に配置
    [-1, 1].forEach((sign) => {
      const mat = new THREE.MeshStandardMaterial({ map: crosswalkTexV, transparent: true, depthWrite: false, roughness: 0.9 });
      const cw = new THREE.Mesh(new THREE.PlaneGeometry(CROSSWALK_DEPTH, crosswalkSize), mat);
      cw.rotation.x = -Math.PI / 2;
      cw.position.set(x + sign * half, 0.02, z);
      scene.add(cw);
    });
  }
}

const loader = new GLTFLoader();
const buildingBoxes = []; // 当たり判定用（world座標のAABB）
const neonColors = [0xff3366, 0x33e0ff, 0xffcc33, 0x66ff99, 0xff66ff, 0xff9933];
// 建物の素材プリセット（ガラス/レンガ/コンクリート/スティール/石材/銅板風など）。
// 部位（本体・トリム・ドア）ごとに色を変え、同じ建物の中でも単色べったりにしない
// tex: "glass"(模様なし) / "brick"(レンガ目地) / "panel"(コンクリートパネルの継ぎ目)
const materialPresets = [
  { base: 0x2e333d, trim: 0x363c46, door: 0x181a20, tex: "glass" }, // ガラスカーテンウォール（青灰）
  { base: 0x233b3f, trim: 0x2c464b, door: 0x141f21, tex: "glass" }, // 深緑がかったガラス
  { base: 0x4a4038, trim: 0x544a3c, door: 0x2a221c, tex: "brick" }, // 赤茶レンガ
  { base: 0x5a3f30, trim: 0x654838, door: 0x321f17, tex: "brick" }, // テラコッタ
  { base: 0x3a3d42, trim: 0x42474e, door: 0x1c1e21, tex: "panel" }, // チャコールコンクリート
  { base: 0x4f473a, trim: 0x584f40, door: 0x2e2a22, tex: "panel" }, // 暖色コンクリート
  { base: 0x5c5648, trim: 0x67604f, door: 0x37331f, tex: "panel" }, // クリーム石材
  { base: 0x33383f, trim: 0x3b4149, door: 0x1a1d21, tex: "glass" }, // スティールブルーグレー
  { base: 0x453e33, trim: 0x4e463a, door: 0x28231c, tex: "panel" }, // タウプ石材
  { base: 0x2c4038, trim: 0x33473e, door: 0x18231e, tex: "panel" }, // 緑青（銅板風）
  { base: 0x1f242c, trim: 0x262c35, door: 0x121519, tex: "glass" }, // ダークブロンズガラス
];
// 窓が点灯している場合の色（暖色メイン、たまに白っぽい/やや寒色も混ぜる）
const windowLitColors = ["#ffcc77", "#ffd9a0", "#fff0c8", "#cfe0ff"];

// ---------- 建物のテクスチャ生成（PS2〜PSP時代のGTAのような、模様のある壁を再現） ----------
function makePanelTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  const rows = 6;
  const cols = 4;
  for (let r = 1; r < rows; r++) {
    const y = (size / rows) * r;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  for (let c = 1; c < cols; c++) {
    const x = (size / cols) * c;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
  }
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
    ctx.fillRect(x, y, 3, 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  return tex;
}

function makeBrickTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 2;
  const brickH = 20;
  const brickW = 44;
  let row = 0;
  for (let y = 0; y < size; y += brickH) {
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    for (let x = -offset; x < size; x += brickW) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + brickH); ctx.stroke();
    }
    row++;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 6);
  return tex;
}

// 建物ごとに毎回新規生成（1枚ずつ違う窓の点灯パターンにするため）
function makeWindowGridTexture() {
  const cols = 6;
  const rows = 10;
  const cell = 24;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#14161c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell;
      const y = r * cell;
      const roll = Math.random();
      ctx.fillStyle = roll < 0.5 ? "#14161c" : windowLitColors[Math.floor(Math.random() * windowLitColors.length)];
      ctx.fillRect(x + 3, y + 3, cell - 6, cell - 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const panelTexture = makePanelTexture();
const brickTexture = makeBrickTexture();

// ---------- 街のレイアウト（Kenney City Kitの建物30種を格子状に配置） ----------
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
      // 周期的にならないよう、建物ごとにプリセットをランダムに選ぶ（idxの余りだと同じ並びが繰り返されて単調になる）
      const preset = materialPresets[Math.floor(Math.random() * materialPresets.length)];
      const windowsLit = Math.random() < 0.7; // 7割くらいの建物は点灯、残りは消灯で暗いまま
      const windowColor = windowLitColors[Math.floor(Math.random() * windowLitColors.length)];

      const bodyTexture = preset.tex === "brick" ? brickTexture : preset.tex === "panel" ? panelTexture : null;

      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          const matName = (o.material && o.material.name) || "";
          o.material = o.material.clone();

          if (matName === "window" || matName === "trim") {
            // 窓は1棟ごとに個別の点灯パターンをテクスチャで持たせる（マスごとに点灯/消灯がバラバラになる）
            const winTex = makeWindowGridTexture();
            o.material.map = winTex;
            o.material.emissiveMap = winTex;
            o.material.color.set(0xffffff);
            o.material.emissive = new THREE.Color(0xffffff);
            o.material.emissiveIntensity = windowsLit ? 1.1 : 0.15;
          } else if (matName === "door") {
            o.material.color.setHex(preset.door);
          } else {
            // 本体（border, _defaultMat等）: プリセット色＋テクスチャ（レンガ/パネル目地）＋
            // メッシュごとの色相・彩度・明るさのばらつきで、のっぺりした単色を避ける
            const base = matName === "border" ? preset.trim : preset.base;
            const c = new THREE.Color(base);
            c.offsetHSL(
              (Math.random() - 0.5) * 0.04,
              (Math.random() - 0.5) * 0.15,
              (Math.random() - 0.5) * 0.14
            );
            o.material.color.copy(c);
            if (bodyTexture) o.material.map = bodyTexture;
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
