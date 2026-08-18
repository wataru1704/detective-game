// 3D試作: Kenney City Kit（CC0）＋人型キャラ（Quaternius Adventurer, CC0）で街を作る
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { createJapaneseCityDetails } from "./city-details.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x889ca6);
scene.fog = new THREE.Fog(0x889ca6, 38, 118);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 220);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
document.body.appendChild(renderer.domElement);


// ---------- ライト ----------
scene.add(new THREE.HemisphereLight(0xc7d8df, 0x5f594e, 2.0));
const sun = new THREE.DirectionalLight(0xffd3a0, 2.8);
sun.position.set(-38, 54, -24);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -62;
sun.shadow.camera.right = 62;
sun.shadow.camera.top = 62;
sun.shadow.camera.bottom = -62;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0015;
scene.add(sun);

// ---------- 夕方の空（自然光と大気遠近が分かる明るさ） ----------
function makeSkyGradientTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#6f8797");
  grad.addColorStop(0.55, "#9aabb1");
  grad.addColorStop(1, "#d3a47e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  return new THREE.CanvasTexture(canvas);
}
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(200, 24, 24),
  new THREE.MeshBasicMaterial({ map: makeSkyGradientTexture(), side: THREE.BackSide, fog: false })
);
scene.add(sky);

const STAR_COUNT = 0;
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
const BASE_BUILDINGS = [
  "large_buildingA", "large_buildingB", "large_buildingC", "large_buildingD",
  "large_buildingE", "large_buildingF", "large_buildingG",
  "low_buildingA", "low_buildingB", "low_buildingC", "low_buildingD",
  "low_buildingF", "low_buildingG", "low_buildingI", "low_buildingJ", "low_buildingN",
  "low_wideA", "low_wideB",
  "skyscraperA", "skyscraperB", "skyscraperC", "skyscraperD", "skyscraperE", "skyscraperF",
  "small_buildingA", "small_buildingB", "small_buildingC",
  "small_buildingD", "small_buildingE", "small_buildingF",
];
const SUBURBAN_BUILDINGS = [
  "suburban_a", "suburban_c", "suburban_f", "suburban_h",
  "suburban_k", "suburban_n", "suburban_r", "suburban_u",
];
const BUILDING_ASSETS = [...BASE_BUILDINGS, ...SUBURBAN_BUILDINGS];

// 以前は8mの敷地を6m道路が一軒ごとに囲み、街の約67%が道路だった。
// 18m四方の街区を6m道路で区切り、各街区に6つの小敷地をまとめる。
const GRID_COLS = 3;
const GRID_ROWS = 3;
const CELL_SIZE = 24;
const BLOCK_SIZE = 18;
const MIN_BUILDING_FOOTPRINT = 3.3;
const MAX_BUILDING_FOOTPRINT = 5.15;
const BUILDINGS_PER_BLOCK = 6;
const TOTAL_CITY_SLOTS = GRID_COLS * GRID_ROWS * BUILDINGS_PER_BLOCK;
// 大きな空き街区ではなく、建物1棟ぶんの月極駐車場・空地として残す。
const OPEN_LOT_INDICES = [5, 16, 25, 36, 43, 50];
// モデル本来の縦横比を保ったまま、極端に巨大化する種類だけ実寸に近い高さで止める。
function getBuildingMaxHeight(name) {
  if (name.startsWith("suburban_")) return 8.5;
  if (name.startsWith("low_building")) return 7.0;
  if (name.startsWith("low_wide")) return 7.0;
  if (name.startsWith("small_building")) return 9.0;
  if (name.startsWith("large_building")) return 16.0;
  if (name.startsWith("skyscraper")) return 30.0;
  return 12.0;
}

const BUILDING_FACADE_SIGN_HEIGHT = 2.5;
const BUILDING_ROOF_UNIT_MARGIN = 0.8;
const CITY_LAYOUT_SEED = 1704; // 再読み込みしても同じ街並みを再現するための固定値
const gridRows = GRID_ROWS;

/** 同じseedから、毎回同じ0〜1の乱数列を作る。 */
function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 1街区を道路沿いの6敷地へ分割する。
 * City Tour（MIT）の区画分割という発想を参考に、日本の小規模街区向けに独自実装。
 */
function createBuildingLayout(name, index) {
  const random = createSeededRandom(CITY_LAYOUT_SEED + index * 1013);
  const blockIndex = Math.floor(index / BUILDINGS_PER_BLOCK);
  const slotInBlock = index % BUILDINGS_PER_BLOCK;
  const col = blockIndex % GRID_COLS;
  const row = Math.floor(blockIndex / GRID_COLS);
  const blockX = (col - (GRID_COLS - 1) / 2) * CELL_SIZE;
  const blockZ = (row - (gridRows - 1) / 2) * CELL_SIZE;
  const localColumns = [-5.65, 0, 5.65];
  const localX = localColumns[slotInBlock % 3];
  const isSouthSide = slotInBlock >= 3;
  const localZ = isSouthSide ? 5.35 : -5.35;

  let minimumSize = MIN_BUILDING_FOOTPRINT;
  let maximumSize = MAX_BUILDING_FOOTPRINT;
  if (name.startsWith("small_") || name.startsWith("suburban_")) maximumSize = 4.65;
  if (name.startsWith("low_wide")) minimumSize = 4.55;

  const footprint = minimumSize + random() * (maximumSize - minimumSize);
  const offsetX = (random() * 2 - 1) * 0.32;
  const offsetZ = (random() * 2 - 1) * 0.25;
  // 建物正面を外周道路へ向け、10%だけ横向きの古い建物を混ぜる。
  const rotation = (isSouthSide ? Math.PI : 0) + (random() < 0.1 ? Math.PI / 2 : 0);

  return {
    x: blockX + localX + offsetX,
    z: blockZ + localZ + offsetZ,
    footprint,
    rotation,
    blockIndex,
    slotInBlock,
  };
}

function buildingNameForSlot(index) {
  // 新旧のモデルが固まらないよう、固定seedの順番で循環させる。
  const stride = 11;
  return BUILDING_ASSETS[(index * stride + Math.floor(index / BUILDINGS_PER_BLOCK) * 3) % BUILDING_ASSETS.length];
}

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
const SIDEWALK_SIZE = BLOCK_SIZE;
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

// ---------- 街区内部の裏路地と小さな月極駐車場 ----------
const serviceAlleyMaterial = new THREE.MeshStandardMaterial({ color: 0x35383a, roughness: 0.98 });
const parkingLineMaterial = new THREE.MeshStandardMaterial({ color: 0xb9b5a4, roughness: 0.9 });
const wheelStopMaterial = new THREE.MeshStandardMaterial({ color: 0x77756f, roughness: 0.95 });

// 表通りの間に、建物の裏口・室外機へ続く2.3m幅のサービス路地を通す。
for (let row = 0; row < gridRows; row++) {
  for (let col = 0; col < GRID_COLS; col++) {
    const cx = (col - (GRID_COLS - 1) / 2) * CELL_SIZE;
    const cz = (row - (gridRows - 1) / 2) * CELL_SIZE;
    const alley = new THREE.Mesh(
      new THREE.PlaneGeometry(BLOCK_SIZE - 1.1, 2.3),
      serviceAlleyMaterial
    );
    alley.rotation.x = -Math.PI / 2;
    alley.position.set(cx, CURB_HEIGHT + 0.018, cz);
    alley.receiveShadow = true;
    scene.add(alley);
  }
}

// 空き地は一街区を丸ごと空けず、建物1棟ぶんの月極駐車場にする。
OPEN_LOT_INDICES.forEach((index, order) => {
  const name = buildingNameForSlot(index);
  const layout = createBuildingLayout(name, index);
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(5.05, 5.0),
    order % 3 === 1 ? sidewalkTopMat : serviceAlleyMaterial
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(layout.x, CURB_HEIGHT + 0.022, layout.z);
  pad.receiveShadow = true;
  scene.add(pad);

  if (order % 3 !== 1) {
    [-1, 1].forEach((side) => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 3.7), parkingLineMaterial);
      line.position.set(layout.x + side * 1.33, CURB_HEIGHT + 0.035, layout.z);
      scene.add(line);
    });
    [-1.25, 0, 1.25].forEach((offset) => {
      const stop = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.16), wheelStopMaterial);
      stop.position.set(layout.x + offset, CURB_HEIGHT + 0.09, layout.z + (layout.slotInBlock < 3 ? 1.35 : -1.35));
      stop.castShadow = true;
      scene.add(stop);
    });
  }
});

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
const MAIN_ROAD_CORRIDOR = Math.floor((GRID_COLS - 1) / 2);
const SHOPPING_STREET_CORRIDOR = Math.floor(gridRows / 2);
for (let c = 0; c < GRID_COLS - 1; c++) {
  const x = (c + 0.5 - (GRID_COLS - 1) / 2) * CELL_SIZE;
  if (c !== MAIN_ROAD_CORRIDOR) continue;
  addVerticalStreetDashes(x, -streetZExtent, streetZExtent);
}
const streetXExtent = ((GRID_COLS - 1) / 2 + 0.5) * CELL_SIZE + CELL_SIZE * 1.2;
for (let r = 0; r < gridRows - 1; r++) {
  const z = (r + 0.5 - (gridRows - 1) / 2) * CELL_SIZE;
  if (r !== SHOPPING_STREET_CORRIDOR) continue;
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
  ctx.fillStyle = "rgba(215,212,200,0.78)";
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
// 縞を車道のほぼ端まで伸ばし、4方向の帯は交差点の外側へ離して重なりを防ぐ
// 歩道との間にはわずかな余白を残す
const CROSSWALK_LENGTH = crosswalkSize - 0.28;

for (let c = 0; c < GRID_COLS - 1; c++) {
  if (c !== MAIN_ROAD_CORRIDOR) continue;
  for (let r = 0; r < gridRows - 1; r++) {
    const x = (c + 0.5 - (GRID_COLS - 1) / 2) * CELL_SIZE;
    const z = (r + 0.5 - (gridRows - 1) / 2) * CELL_SIZE;
    const half = crosswalkSize / 2 + CROSSWALK_DEPTH / 2 + 0.12;

    // 南北の通り（Z方向）を、東西に渡る横断歩道。交差点の南北の入口2箇所に配置
    [-1, 1].forEach((sign) => {
      const mat = new THREE.MeshStandardMaterial({ map: crosswalkTexH, transparent: true, depthWrite: false, roughness: 0.9 });
      const cw = new THREE.Mesh(new THREE.PlaneGeometry(CROSSWALK_LENGTH, CROSSWALK_DEPTH), mat);
      cw.rotation.x = -Math.PI / 2;
      cw.position.set(x, 0.02, z + sign * half);
      scene.add(cw);
    });

    // 東西の通り（X方向）を、南北に渡る横断歩道。交差点の東西の入口2箇所に配置
    [-1, 1].forEach((sign) => {
      const mat = new THREE.MeshStandardMaterial({ map: crosswalkTexV, transparent: true, depthWrite: false, roughness: 0.9 });
      const cw = new THREE.Mesh(new THREE.PlaneGeometry(CROSSWALK_DEPTH, CROSSWALK_LENGTH), mat);
      cw.rotation.x = -Math.PI / 2;
      cw.position.set(x + sign * half, 0.02, z);
      scene.add(cw);
    });
  }
}

const loader = new GLTFLoader();
// ---------- 街灯（車道灯として現実的な高さにそろえる） ----------
const STREETLIGHT_HEIGHT = 5.2;
const streetlightPoleGeometry = new THREE.CylinderGeometry(0.055, 0.075, STREETLIGHT_HEIGHT, 8);
const streetlightArmGeometry = new THREE.BoxGeometry(0.5, 0.055, 0.055);
const streetlightLampGeometry = new THREE.BoxGeometry(0.22, 0.1, 0.16);
const streetlightPoleMaterial = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.55, metalness: 0.7 });
const streetlightLampMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd89a,
  emissive: 0xffb75c,
  emissiveIntensity: 2.3,
  roughness: 0.35,
});

function addStreetlight(x, z, rotation, addLocalLight) {
  const streetlight = new THREE.Group();
  const pole = new THREE.Mesh(streetlightPoleGeometry, streetlightPoleMaterial);
  pole.position.y = STREETLIGHT_HEIGHT / 2;
  pole.castShadow = true;
  streetlight.add(pole);

  const arm = new THREE.Mesh(streetlightArmGeometry, streetlightPoleMaterial);
  arm.position.set(0.2, STREETLIGHT_HEIGHT - 0.08, 0);
  streetlight.add(arm);

  const lamp = new THREE.Mesh(streetlightLampGeometry, streetlightLampMaterial);
  lamp.position.set(0.43, STREETLIGHT_HEIGHT - 0.13, 0);
  streetlight.add(lamp);

  if (addLocalLight) {
    const light = new THREE.PointLight(0xffc06b, 0.8, 6, 2);
    light.position.set(0.43, STREETLIGHT_HEIGHT - 0.2, 0);
    streetlight.add(light);
  }

  streetlight.position.set(x, CURB_HEIGHT, z);
  streetlight.rotation.y = rotation;
  scene.add(streetlight);
}

for (let row = 0; row < gridRows; row++) {
  for (let col = 0; col < GRID_COLS; col++) {
    const index = row * GRID_COLS + col;
    const lotX = (col - (GRID_COLS - 1) / 2) * CELL_SIZE;
    const lotZ = (row - (gridRows - 1) / 2) * CELL_SIZE;
    const side = index % 2 === 0 ? 1 : -1;
    const x = lotX + side * (BLOCK_SIZE / 2 - 0.1);
    const z = lotZ + ((row + col) % 2 === 0 ? 1 : -1) * (BLOCK_SIZE / 2 - 0.1);
    addStreetlight(x, z, side > 0 ? Math.PI : 0, index % 9 === 0);
  }
}
createJapaneseCityDetails({
  THREE,
  scene,
  gridCols: GRID_COLS,
  gridRows,
  cellSize: CELL_SIZE,
  blockSize: BLOCK_SIZE,
  curbHeight: CURB_HEIGHT,
  openLotIndices: [],
});

const buildingBoxes = []; // 当たり判定用（world座標のAABB）
const neonColors = [0xff3366, 0x33e0ff, 0xffcc33, 0x66ff99, 0xff66ff, 0xff9933];
// 建物の素材プリセット（ガラス/レンガ/コンクリート/スティール/石材/銅板風など）。
// 部位（本体・トリム・ドア）ごとに色を変え、同じ建物の中でも単色べったりにしない
// tex: "glass"(模様なし) / "brick"(レンガ目地) / "panel"(コンクリートパネルの継ぎ目)
const materialPresets = [
  { base: 0x68737b, trim: 0x7b858a, door: 0x30383d, tex: "glass" }, // 古い青灰色の雑居ビル
  { base: 0x667e7d, trim: 0x829291, door: 0x304443, tex: "glass" }, // 緑がかったタイル
  { base: 0x80695b, trim: 0x9a8170, door: 0x4e3a30, tex: "brick" }, // 色褪せた赤茶レンガ
  { base: 0x936958, trim: 0xa67d69, door: 0x56382e, tex: "brick" }, // 古いテラコッタ
  { base: 0x707277, trim: 0x85878a, door: 0x383a3d, tex: "panel" }, // 打放しコンクリート
  { base: 0x8d8271, trim: 0xa09583, door: 0x544b3f, tex: "panel" }, // 昭和期の暖色外壁
  { base: 0xa39b82, trim: 0xb7ae94, door: 0x5e5848, tex: "panel" }, // クリーム色マンション
  { base: 0x69747c, trim: 0x828b91, door: 0x343b40, tex: "glass" }, // スティール外装
  { base: 0x817668, trim: 0x95897a, door: 0x4b4238, tex: "panel" }, // 汚れた石材
  { base: 0x61796d, trim: 0x789084, door: 0x344a40, tex: "panel" }, // 緑青の金属板
  { base: 0x5c646c, trim: 0x737b83, door: 0x30363d, tex: "glass" }, // ダークガラス
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
  // 雨だれと地面付近の黒ずみを足し、均一に新品へ見えるのを避ける。
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * size;
    const width = 2 + Math.random() * 8;
    const streak = ctx.createLinearGradient(0, 0, 0, size);
    streak.addColorStop(0, "rgba(55,55,50,0)");
    streak.addColorStop(0.45, "rgba(55,55,50,0.04)");
    streak.addColorStop(1, "rgba(40,42,38,0.18)");
    ctx.fillStyle = streak;
    ctx.fillRect(x, 30 + Math.random() * 80, width, size);
  }
  const groundGrime = ctx.createLinearGradient(0, size * 0.72, 0, size);
  groundGrime.addColorStop(0, "rgba(35,38,34,0)");
  groundGrime.addColorStop(1, "rgba(35,38,34,0.25)");
  ctx.fillStyle = groundGrime;
  ctx.fillRect(0, size * 0.72, size, size * 0.28);
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
  for (let i = 0; i < 35; i++) {
    ctx.fillStyle = `rgba(55,45,38,${0.03 + Math.random() * 0.09})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 8 + Math.random() * 30, 3 + Math.random() * 12);
  }
  return tex;
}

// 建物ごとに毎回新規生成（1枚ずつ違う窓の点灯パターンにするため）
function makeWindowGridTexture(random) {
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
      const roll = random();
      ctx.fillStyle = roll < 0.5 ? "#14161c" : windowLitColors[Math.floor(random() * windowLitColors.length)];
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
// 点灯窓は8パターンを共有し、建物数を増やしてもテクスチャ数が膨らまないようにする。
const windowTextureCache = Array.from({ length: 8 }, (_, index) =>
  makeWindowGridTexture(createSeededRandom(CITY_LAYOUT_SEED + 700000 + index * 7919))
);
const rooftopUnitGeometry = new THREE.BoxGeometry(0.65, 0.3, 0.5);
const rooftopUnitMaterial = new THREE.MeshStandardMaterial({ color: 0x42474d, roughness: 0.8, metalness: 0.35 });

const storefrontLabels = ["山田商店", "喫茶みなと", "中華そば", "青葉薬局", "クリーニング", "大衆酒場"];
const storefrontColors = ["#8c4036", "#345d6b", "#a07835", "#47705d", "#786b52", "#6e3f45"];

function makeJapaneseFacadeSignTexture(index) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = storefrontColors[index % storefrontColors.length];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 9; i++) ctx.fillRect(i * 51, (i * 23) % 80, 28, 3);
  ctx.strokeStyle = "rgba(35,30,25,0.55)";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  ctx.fillStyle = "#eee8d2";
  ctx.font = "bold 42px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(storefrontLabels[index % storefrontLabels.length], canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ---------- 街のレイアウト（建物・月極駐車場・空き地を混在させる） ----------
Array.from({ length: TOTAL_CITY_SLOTS }, (_, index) => index).forEach((idx) => {
  const name = buildingNameForSlot(idx);
  if (OPEN_LOT_INDICES.includes(idx)) return;
  const layout = createBuildingLayout(name, idx);
  const styleRandom = createSeededRandom(CITY_LAYOUT_SEED + idx * 2027 + 50000);
  const w = layout.footprint;
  const d = layout.footprint;

  // モデル読み込み中でも当たり判定は成立するよう、まず概算のAABBを入れておく
  const boxEntry = {
    minX: layout.x - w / 2, maxX: layout.x + w / 2,
    minZ: layout.z - d / 2, maxZ: layout.z + d / 2,
  };
  buildingBoxes.push(boxEntry);

  loader.load(
    `assets/${name}.glb`,
    (gltf) => {
      const model = gltf.scene;

      const rawBox = new THREE.Box3().setFromObject(model);
      const rawSize = new THREE.Vector3();
      rawBox.getSize(rawSize);
      const footprintScale = layout.footprint / Math.max(rawSize.x, rawSize.z);
      const heightScale = getBuildingMaxHeight(name) / rawSize.y;
      const scaleFactor = Math.min(footprintScale, heightScale);
      // XYZを同じ倍率にして、扉・窓・階高の形を変形させない。
      model.scale.setScalar(scaleFactor);
      model.rotation.y = layout.rotation;

      const transformedBox = new THREE.Box3().setFromObject(model);
      const centerX = (transformedBox.min.x + transformedBox.max.x) / 2;
      const centerZ = (transformedBox.min.z + transformedBox.max.z) / 2;
      model.position.set(layout.x - centerX, CURB_HEIGHT - transformedBox.min.y, layout.z - centerZ);
      // 周期的にならないよう、建物ごとにプリセットをランダムに選ぶ（idxの余りだと同じ並びが繰り返されて単調になる）
      const preset = materialPresets[Math.floor(styleRandom() * materialPresets.length)];
      const windowsLit = styleRandom() < 0.7; // 7割くらいの建物は点灯、残りは消灯で暗いまま

      const bodyTexture = preset.tex === "brick" ? brickTexture : preset.tex === "panel" ? panelTexture : null;

      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = layout.blockIndex >= 6 || layout.blockIndex === 4;
          o.receiveShadow = true;
          const matName = (o.material && o.material.name) || "";
          o.material = o.material.clone();

          if (matName === "window" || matName === "trim") {
            // 窓は1棟ごとに個別の点灯パターンをテクスチャで持たせる（マスごとに点灯/消灯がバラバラになる）
            const winTex = windowTextureCache[(idx + Math.floor(styleRandom() * windowTextureCache.length)) % windowTextureCache.length];
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
              (styleRandom() - 0.5) * 0.04,
              (styleRandom() - 0.5) * 0.15,
              (styleRandom() - 0.5) * 0.14
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

      const topY = finalBox.max.y;
      const buildingCenterX = (finalBox.min.x + finalBox.max.x) / 2;
      const buildingCenterZ = (finalBox.min.z + finalBox.max.z) / 2;
      const decorRandom = createSeededRandom(CITY_LAYOUT_SEED + idx * 3037 + 90000);
      const roofOffsetX = Math.max(0, (finalBox.max.x - finalBox.min.x - BUILDING_ROOF_UNIT_MARGIN) / 2);
      const roofOffsetZ = Math.max(0, (finalBox.max.z - finalBox.min.z - BUILDING_ROOF_UNIT_MARGIN) / 2);

      // 室外機や換気設備に見える箱を屋上へ置き、輪郭の単調さを崩す。
      if (decorRandom() < 0.78) {
        const unitCount = decorRandom() < 0.35 ? 2 : 1;
        for (let unitIndex = 0; unitIndex < unitCount; unitIndex++) {
          const rooftopUnit = new THREE.Mesh(rooftopUnitGeometry, rooftopUnitMaterial);
          rooftopUnit.position.set(
            buildingCenterX + (decorRandom() * 2 - 1) * roofOffsetX,
            topY + 0.15,
            buildingCenterZ + (decorRandom() * 2 - 1) * roofOffsetZ
          );
          rooftopUnit.rotation.y = decorRandom() * Math.PI;
          rooftopUnit.castShadow = true;
          scene.add(rooftopUnit);
        }
      }

      // 看板は屋上に浮かせず、モデル正面の地上階付近へ置く。
      if (decorRandom() < 0.58 && topY > CURB_HEIGHT + 1.2) {
        const signTexture = makeJapaneseFacadeSignTexture(idx);
        const neonMat = new THREE.MeshStandardMaterial({
          map: signTexture,
          emissiveMap: signTexture,
          emissive: new THREE.Color(neonColors[idx % neonColors.length]),
          emissiveIntensity: 0.28,
          side: THREE.DoubleSide,
          roughness: 0.72,
        });
        const front = new THREE.Vector3(0, 0, -1).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          layout.rotation
        );
        const buildingWidth = finalBox.max.x - finalBox.min.x;
        const buildingDepth = finalBox.max.z - finalBox.min.z;
        const facadeWidth = Math.abs(front.z) > 0.5 ? buildingWidth : buildingDepth;
        const facadeOffset = Math.abs(front.x) * buildingWidth / 2 + Math.abs(front.z) * buildingDepth / 2;
        const neonWidth = facadeWidth * 0.55;
        const neon = new THREE.Mesh(new THREE.PlaneGeometry(neonWidth, 0.48), neonMat);
        neon.position.set(
          buildingCenterX + front.x * (facadeOffset + 0.015),
          Math.min(topY - 0.3, CURB_HEIGHT + BUILDING_FACADE_SIGN_HEIGHT),
          buildingCenterZ + front.z * (facadeOffset + 0.015)
        );
        neon.rotation.y = layout.rotation + Math.PI;
        scene.add(neon);
      }
    },
    undefined,
    (err) => console.error(`モデル読み込み失敗: ${name}`, err)
  );
});

// ---------- プレイヤー（見た目は人型モデル、当たり判定・移動はplayer自体で扱う） ----------
const player = new THREE.Object3D();
const spawnX = -CELL_SIZE / 2;
const spawnZ = ((gridRows - 1) / 2) * CELL_SIZE + 3.0;
player.position.set(spawnX, 0, spawnZ);
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
