// 3D試作: Kenney City Kit（CC0）＋人型キャラ（Quaternius Adventurer, CC0）で街を作る
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { createJapaneseCityDetails } from "./city-details.js?v=20260822l";
import { createVisualQa } from "./visual-qa.js?v=20260822u";
import { createJapaneseAtmosphere } from "./atmosphere.js?v=20260822g";
import { createBuildingDetailSystem } from "./building-details.js?v=20260822m";
import { createProceduralSurfaceMaps } from "./surface-maps.js?v=20260822l";
import { createRealisticStreetAssets } from "./realistic-street-assets.js?v=20260822r";

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 220);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
document.body.appendChild(renderer.domElement);


const atmosphereDiagnostics = createJapaneseAtmosphere({ THREE, scene, renderer });
renderer.domElement.dataset.atmosphereDiagnostics = JSON.stringify(atmosphereDiagnostics);
const surfaceMaps = createProceduralSurfaceMaps(THREE);
renderer.domElement.dataset.surfaceMapDiagnostics = JSON.stringify(window.__surfaceMapDiagnostics);

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
// モデル名の「large」は高さではなく横幅を表す場合がある。
// 人物基準で実測して10〜16mになったモデルだけを、駅前・主要道路沿いへ配置する。
const COMMERCIAL_TOWER_SLOTS = new Set([
  0, 6, 8, 9, 11, 12,
  18, 20, 21, 23, 24, 26,
  27, 29, 30, 32, 33, 35,
  38, 42, 44, 45, 47, 48,
]);
const MEASURED_TALL_BUILDINGS = [
  "skyscraperB", "skyscraperC", "skyscraperD", "skyscraperF",
];
const MEASURED_LOW_RISE_BUILDINGS = [
  "low_wideA", "low_wideB",
  "small_buildingC", "small_buildingD", "small_buildingF",
  "large_buildingC", "large_buildingD", "large_buildingE", "large_buildingG",
];

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
  if (name.startsWith("low_wide")) return 8.5;
  if (name.startsWith("small_building")) return 11.5;
  if (name.startsWith("large_building")) return 22.0;
  if (name.startsWith("skyscraper")) return 40.0;
  return 12.0;
}

const BUILDING_FACADE_SIGN_HEIGHT = 2.5;
const BUILDING_ROOF_UNIT_MARGIN = 0.8;
const BUILDING_SCALE_MULTIPLIER = 1.24;
// 全棟を同率で広げると道路・隣家へ触れるため、余白の少ない区画だけ小さく抑える。
const BUILDING_SCALE_LIMITS = new Map([[2, 1.19], [7, 1.20], [8, 1.20], [24, 1.20]]);
// 建物をXYZ同率で拡大したまま、接近する2組だけ敷地内で数十cmずらして間隔を保つ。
const BUILDING_POSITION_OFFSETS = new Map([[8, { x: 0.26, z: 0 }], [21, { x: -0.22, z: 0 }], [24, { x: 0, z: 0.12 }]]);
const BUILDING_SCALE_REVISION = "20260822-building-proportion";
const ROAD_OBSTACLE_CLEARANCE = 0.3;
const ROAD_HALF_WIDTH = (CELL_SIZE - BLOCK_SIZE) / 2;
const ROAD_CENTER_XS = Array.from(
  { length: GRID_COLS - 1 },
  (_, index) => (index + 0.5 - (GRID_COLS - 1) / 2) * CELL_SIZE
);
const ROAD_CENTER_ZS = Array.from(
  { length: GRID_ROWS - 1 },
  (_, index) => (index + 0.5 - (GRID_ROWS - 1) / 2) * CELL_SIZE
);
const roadwayClearanceDiagnostics = {
  minimumClearance: ROAD_OBSTACLE_CLEARANCE,
  obstacles: [],
  adjustments: [],
  intrusions: [],
};
window.__roadwayClearanceDiagnostics = roadwayClearanceDiagnostics;

function roadCorridorsIntersectingBox(box, clearance = ROAD_OBSTACLE_CLEARANCE) {
  const epsilon = 0.0001;
  const corridors = [];
  ROAD_CENTER_XS.forEach((center) => {
    if (
      box.max.x > center - ROAD_HALF_WIDTH - clearance + epsilon &&
      box.min.x < center + ROAD_HALF_WIDTH + clearance - epsilon
    ) corridors.push(`vertical:${center}`);
  });
  ROAD_CENTER_ZS.forEach((center) => {
    if (
      box.max.z > center - ROAD_HALF_WIDTH - clearance + epsilon &&
      box.min.z < center + ROAD_HALF_WIDTH + clearance - epsilon
    ) corridors.push(`horizontal:${center}`);
  });
  return corridors;
}

function moveObjectOutsideRoadways(object, initialBox) {
  const box = initialBox.clone();
  const movement = new THREE.Vector3();
  ROAD_CENTER_XS.forEach((center) => {
    if (roadCorridorsIntersectingBox(box).includes(`vertical:${center}`)) {
      const centerX = (box.min.x + box.max.x) / 2;
      const shiftX = centerX < center
        ? center - ROAD_HALF_WIDTH - ROAD_OBSTACLE_CLEARANCE - box.max.x
        : center + ROAD_HALF_WIDTH + ROAD_OBSTACLE_CLEARANCE - box.min.x;
      object.position.x += shiftX;
      movement.x += shiftX;
      box.translate(new THREE.Vector3(shiftX, 0, 0));
    }
  });
  ROAD_CENTER_ZS.forEach((center) => {
    if (roadCorridorsIntersectingBox(box).includes(`horizontal:${center}`)) {
      const centerZ = (box.min.z + box.max.z) / 2;
      const shiftZ = centerZ < center
        ? center - ROAD_HALF_WIDTH - ROAD_OBSTACLE_CLEARANCE - box.max.z
        : center + ROAD_HALF_WIDTH + ROAD_OBSTACLE_CLEARANCE - box.min.z;
      object.position.z += shiftZ;
      movement.z += shiftZ;
      box.translate(new THREE.Vector3(0, 0, shiftZ));
    }
  });
  object.updateMatrixWorld(true);
  return movement;
}

function recordRoadsideObstacle(label, box, movement = null) {
  const entry = {
    label,
    minX: box.min.x,
    maxX: box.max.x,
    minZ: box.min.z,
    maxZ: box.max.z,
  };
  roadwayClearanceDiagnostics.obstacles.push(entry);
  if (movement && (Math.abs(movement.x) > 0.0001 || Math.abs(movement.z) > 0.0001)) {
    roadwayClearanceDiagnostics.adjustments.push({ label, x: movement.x, z: movement.z });
  }
  const corridors = roadCorridorsIntersectingBox(box);
  if (corridors.length > 0) {
    roadwayClearanceDiagnostics.intrusions.push({ label, corridors });
    console.error("Roadside obstacle entered the roadway", { label, corridors });
  }
  renderer.domElement.dataset.roadwayClearanceDiagnostics = JSON.stringify(roadwayClearanceDiagnostics);
}
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
  const positionOffset = BUILDING_POSITION_OFFSETS.get(index) ?? { x: 0, z: 0 };
  // 建物正面を外周道路へ向け、10%だけ横向きの古い建物を混ぜる。
  const rotation = (isSouthSide ? Math.PI : 0) + (random() < 0.1 ? Math.PI / 2 : 0);

  return {
    x: blockX + localX + offsetX + positionOffset.x,
    z: blockZ + localZ + offsetZ + positionOffset.z,
    footprint,
    rotation,
    blockIndex,
    slotInBlock,
  };
}

function buildingNameForSlot(index) {
  const blockIndex = Math.floor(index / BUILDINGS_PER_BLOCK);
  if (COMMERCIAL_TOWER_SLOTS.has(index)) {
    return MEASURED_TALL_BUILDINGS[(index + blockIndex) % MEASURED_TALL_BUILDINGS.length];
  }

  // 低層側も実測3.5m未満のモデルを避け、人物より少し高いだけの建物を作らない。
  return MEASURED_LOW_RISE_BUILDINGS[(index * 5 + blockIndex) % MEASURED_LOW_RISE_BUILDINGS.length];
}

// ---------- 地面（車道） ----------
function makeAsphaltTexture() {
  const px = 256;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#3d4143";
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * px;
    const y = Math.random() * px;
    const v = 48 + Math.random() * 18;
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 4},0.28)`;
    ctx.fillRect(x, y, 2, 2);
  }
  // 補修跡は矩形ではなく不規則な輪郭にし、同じテクスチャの反復を目立ちにくくする。
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * px;
    const y = Math.random() * px;
    const w = 18 + Math.random() * 40;
    const h = 14 + Math.random() * 28;
    ctx.beginPath();
    for (let point = 0; point < 10; point++) {
      const angle = point / 10 * Math.PI * 2;
      const edge = 0.78 + Math.sin(i * 3.1 + point * 2.3) * 0.18;
      const px2 = x + Math.cos(angle) * w / 2 * edge;
      const py2 = y + Math.sin(angle) * h / 2 * edge;
      if (point === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(24,26,28,0.28)";
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const GROUND_TILES = 14; // 縦横に何区画ぶん敷くか（街の格子より一回り広く）
const GROUND_SIZE = CELL_SIZE * GROUND_TILES;
const asphaltTex = makeAsphaltTexture();
asphaltTex.repeat.set(GROUND_TILES * 3, GROUND_TILES * 3); // 目を細かくして繰り返しを目立ちにくくする
const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
const groundMat = new THREE.MeshStandardMaterial({
  map: asphaltTex,
  normalMap: surfaceMaps.asphalt.normalMap,
  roughnessMap: surfaceMaps.asphalt.roughnessMap,
  normalScale: new THREE.Vector2(0.16, 0.16),
  roughness: 0.96,
});
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
  ctx.fillStyle = "#7b786f";
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
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const CURB_HEIGHT = 0.14;
const SIDEWALK_SIZE = BLOCK_SIZE;
const sidewalkNormalMap = surfaceMaps.concrete.normalMap.clone();
const sidewalkRoughnessMap = surfaceMaps.concrete.roughnessMap.clone();
sidewalkNormalMap.repeat.set(12, 12);
sidewalkRoughnessMap.repeat.copy(sidewalkNormalMap.repeat);
const sidewalkTopMat = new THREE.MeshStandardMaterial({
  map: makeSidewalkTexture(),
  normalMap: sidewalkNormalMap,
  roughnessMap: sidewalkRoughnessMap,
  normalScale: new THREE.Vector2(0.1, 0.1),
  roughness: 0.96,
});
const curbSideMat = new THREE.MeshStandardMaterial({
  color: 0x77736a,
  normalMap: surfaceMaps.concrete.normalMap,
  roughnessMap: surfaceMaps.concrete.roughnessMap,
  normalScale: new THREE.Vector2(0.08, 0.08),
  roughness: 0.9,
});

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
const parkingVehicleSpots = [];
const curatedPropSpots = [];
OPEN_LOT_INDICES.forEach((index, order) => {
  const name = buildingNameForSlot(index);
  const layout = createBuildingLayout(name, index);
  const isVacant = order % 3 === 1;
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(5.05, 5.0),
    isVacant ? sidewalkTopMat : serviceAlleyMaterial
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(layout.x, CURB_HEIGHT + 0.022, layout.z);
  pad.receiveShadow = true;
  scene.add(pad);

  if (!isVacant) {
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
    parkingVehicleSpots.push({
      asset: order % 2 === 0 ? "car_sedan" : "car_van",
      x: layout.x,
      z: layout.z,
      rotation: layout.slotInBlock < 3 ? Math.PI : 0,
    });
    curatedPropSpots.push({
      asset: "suburban_planter",
      x: layout.x + (order % 2 === 0 ? 1.92 : -1.92),
      z: layout.z + (layout.slotInBlock < 3 ? 1.82 : -1.82),
      rotation: order * 0.63,
    });
  } else {
    const front = layout.slotInBlock < 3 ? -1 : 1;
    curatedPropSpots.push(
      { asset: "road_dumpster", x: layout.x + 1.35, z: layout.z - front * 0.82, rotation: Math.PI / 2 },
      { asset: "road_barrier", x: layout.x - 0.65, z: layout.z + front * 1.72, rotation: 0 },
      { asset: "suburban_fence_low", x: layout.x - 1.85, z: layout.z - front * 0.5, rotation: Math.PI / 2 }
    );
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
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 7; i++) {
    const x = (i * 17 + (alongV ? 3 : 11)) % w;
    const y = (i * 29 + (alongV ? 13 : 5)) % h;
    ctx.fillStyle = `rgba(0,0,0,${0.12 + (i % 3) * 0.08})`;
    ctx.fillRect(x, y, 2 + (i % 2) * 3, 2 + ((i + 1) % 2) * 4);
  }
  ctx.globalCompositeOperation = "source-over";
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
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
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 22; i++) {
    const x = (i * 23 + (alongV ? 9 : 3)) % size;
    const y = (i * 37 + (alongV ? 5 : 17)) % size;
    ctx.fillStyle = `rgba(0,0,0,${0.1 + (i % 4) * 0.05})`;
    ctx.fillRect(x, y, 2 + (i % 4), 1 + ((i + 2) % 4));
  }
  ctx.globalCompositeOperation = "source-over";
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const crosswalkTexH = makeCrosswalkTexture(false);
const crosswalkTexV = makeCrosswalkTexture(true);
const crosswalkSize = CELL_SIZE - SIDEWALK_SIZE; // 通りの幅
const CROSSWALK_DEPTH = Math.min(1.1, crosswalkSize * 0.8); // 横断歩道帯の奥行き
// 縞を車道のほぼ端まで伸ばし、4方向の帯は交差点の外側へ離して重なりを防ぐ
// 歩道との間にはわずかな余白を残す
const CROSSWALK_LENGTH = crosswalkSize - 0.28;
const crosswalkDiagnostics = [];

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
      crosswalkDiagnostics.push({ direction: "east-west", x, z: z + sign * half, length: CROSSWALK_LENGTH });
    });

    // 東西の通り（X方向）を、南北に渡る横断歩道。交差点の東西の入口2箇所に配置
    [-1, 1].forEach((sign) => {
      const mat = new THREE.MeshStandardMaterial({ map: crosswalkTexV, transparent: true, depthWrite: false, roughness: 0.9 });
      const cw = new THREE.Mesh(new THREE.PlaneGeometry(CROSSWALK_DEPTH, CROSSWALK_LENGTH), mat);
      cw.rotation.x = -Math.PI / 2;
      cw.position.set(x + sign * half, 0.02, z);
      scene.add(cw);
      crosswalkDiagnostics.push({ direction: "north-south", x: x + sign * half, z, length: CROSSWALK_LENGTH });
    });
  }
}

window.__crosswalkDiagnostics = crosswalkDiagnostics;
renderer.domElement.dataset.crosswalkDiagnostics = JSON.stringify(crosswalkDiagnostics);

const loader = new GLTFLoader();
const buildingBoxes = []; // 当たり判定用（world座標のAABB）
const cameraOccluderBoxes = []; // 追従カメラを壁の手前へ止める建物専用AABB

const streetAssetDiagnostics = {
  expected: parkingVehicleSpots.length + curatedPropSpots.length,
  placed: 0,
  failed: [],
};
window.__streetAssetDiagnostics = streetAssetDiagnostics;
renderer.domElement.dataset.streetAssetsExpected = String(streetAssetDiagnostics.expected);
renderer.domElement.dataset.streetAssetsPlaced = "0";
renderer.domElement.dataset.streetAssetsFailed = "0";

const realisticStreetAssets = createRealisticStreetAssets({
  THREE,
  scene,
  vehiclePlacements: parkingVehicleSpots,
  vegetationPlacements: curatedPropSpots.filter((spot) => spot.asset === "suburban_planter"),
  groundY: CURB_HEIGHT,
});
renderer.domElement.dataset.realisticStreetAssets = JSON.stringify(realisticStreetAssets.diagnostics);
streetAssetDiagnostics.placed = realisticStreetAssets.diagnostics.vehicles + realisticStreetAssets.diagnostics.vegetation;
renderer.domElement.dataset.streetAssetsPlaced = String(streetAssetDiagnostics.placed);
realisticStreetAssets.vehicleBounds.forEach((bounds, index) => {
  const box = new THREE.Box3(
    new THREE.Vector3(bounds.minX, bounds.minY, bounds.minZ),
    new THREE.Vector3(bounds.maxX, bounds.maxY, bounds.maxZ)
  );
  recordRoadsideObstacle(`detailed-vehicle:${bounds.type}:${index}`, box, new THREE.Vector3());
  buildingBoxes.push({ minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ });
});
realisticStreetAssets.vegetationBounds.forEach((bounds, index) => {
  const box = new THREE.Box3(
    new THREE.Vector3(bounds.minX, bounds.minY, bounds.minZ),
    new THREE.Vector3(bounds.maxX, bounds.maxY, bounds.maxZ)
  );
  recordRoadsideObstacle(`urban-vegetation:${index}`, box, new THREE.Vector3());
});

function loadPlacedAsset(assetName, placements, targetSize, fitAxis = "horizontal", collidable = false, targetDimensions = null) {
  if (placements.length === 0) return;
  loader.load(
    "assets/" + assetName + ".glb",
    (gltf) => {
      const source = gltf.scene;
      const rawBox = new THREE.Box3().setFromObject(source);
      const rawSize = new THREE.Vector3();
      rawBox.getSize(rawSize);
      if (targetDimensions) {
        source.scale.set(
          targetDimensions.x / rawSize.x,
          targetDimensions.y / rawSize.y,
          targetDimensions.z / rawSize.z
        );
      } else {
        const fitDimension = fitAxis === "height" ? rawSize.y : Math.max(rawSize.x, rawSize.z);
        if (!Number.isFinite(fitDimension) || fitDimension <= 0) {
          streetAssetDiagnostics.failed.push(assetName);
          return;
        }
        source.scale.setScalar(targetSize / fitDimension);
      }
      source.updateMatrixWorld(true);

      placements.forEach((placement, index) => {
        const model = source.clone(true);
        model.name = "StreetAsset:" + assetName + ":" + index;
        model.rotation.y = placement.rotation || 0;
        model.updateMatrixWorld(true);

        const rotatedBox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        rotatedBox.getCenter(center);
        model.position.set(
          placement.x - center.x,
          CURB_HEIGHT - rotatedBox.min.y,
          placement.z - center.z
        );
        model.updateMatrixWorld(true);
        model.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = assetName.startsWith("car_");
          object.receiveShadow = true;
        });
        let finalBox = new THREE.Box3().setFromObject(model);
        const movement = roadCorridorsIntersectingBox(finalBox).length > 0
          ? moveObjectOutsideRoadways(model, finalBox)
          : new THREE.Vector3();
        finalBox = new THREE.Box3().setFromObject(model);
        recordRoadsideObstacle(`street-asset:${assetName}:${index}`, finalBox, movement);
        scene.add(model);

        if (collidable) {
          buildingBoxes.push({
            minX: finalBox.min.x,
            maxX: finalBox.max.x,
            minZ: finalBox.min.z,
            maxZ: finalBox.max.z,
          });
        }
        streetAssetDiagnostics.placed += 1;
        renderer.domElement.dataset.streetAssetsPlaced = String(streetAssetDiagnostics.placed);
      });
    },
    undefined,
    (error) => {
      streetAssetDiagnostics.failed.push(assetName);
      renderer.domElement.dataset.streetAssetsFailed = String(streetAssetDiagnostics.failed.length);
      console.warn("Street asset load failed: " + assetName, error);
    }
  );
}


[
  { name: "road_dumpster", target: 1.55, fit: "horizontal" },
  { name: "road_barrier", target: 1.5, fit: "horizontal" },
  { name: "suburban_fence_low", target: 2.6, fit: "horizontal" },
].forEach((spec) => {
  loadPlacedAsset(
    spec.name,
    curatedPropSpots.filter((spot) => spot.asset === spec.name),
    spec.target,
    spec.fit
  );
});

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
  const poleRadius = 0.075;
  recordRoadsideObstacle(
    `streetlight:${x}:${z}`,
    new THREE.Box3(
      new THREE.Vector3(x - poleRadius, CURB_HEIGHT, z - poleRadius),
      new THREE.Vector3(x + poleRadius, CURB_HEIGHT + STREETLIGHT_HEIGHT, z + poleRadius)
    )
  );
}

for (let row = 0; row < gridRows; row++) {
  for (let col = 0; col < GRID_COLS; col++) {
    const index = row * GRID_COLS + col;
    const lotX = (col - (GRID_COLS - 1) / 2) * CELL_SIZE;
    const lotZ = (row - (gridRows - 1) / 2) * CELL_SIZE;
    const side = index % 2 === 0 ? 1 : -1;
    const poleCenterInset = ROAD_OBSTACLE_CLEARANCE + 0.075;
    const x = lotX + side * (BLOCK_SIZE / 2 - poleCenterInset);
    const z = lotZ + ((row + col) % 2 === 0 ? 1 : -1) * (BLOCK_SIZE / 2 - poleCenterInset);
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
  surfaceMaps,
});


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
  tex.colorSpace = THREE.SRGBColorSpace;
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
  tex.needsUpdate = true;
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
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 6);
  for (let i = 0; i < 35; i++) {
    ctx.fillStyle = `rgba(55,45,38,${0.03 + Math.random() * 0.09})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 8 + Math.random() * 30, 3 + Math.random() * 12);
  }
  tex.needsUpdate = true;
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
  tex.colorSpace = THREE.SRGBColorSpace;
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
const MAX_ROOFTOP_UNITS = (TOTAL_CITY_SLOTS - OPEN_LOT_INDICES.length) * 2;
const rooftopUnitInstances = new THREE.InstancedMesh(rooftopUnitGeometry, rooftopUnitMaterial, MAX_ROOFTOP_UNITS);
rooftopUnitInstances.name = "RooftopEquipment:instanced";
rooftopUnitInstances.count = 0;
rooftopUnitInstances.castShadow = false;
rooftopUnitInstances.receiveShadow = true;
scene.add(rooftopUnitInstances);
let rooftopUnitCount = 0;

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
const buildingDiagnostics = [];
const facadeSignDiagnostics = [];
window.__buildingDiagnostics = buildingDiagnostics;
renderer.domElement.dataset.buildingsExpected = String(TOTAL_CITY_SLOTS - OPEN_LOT_INDICES.length);
renderer.domElement.dataset.buildingsPlaced = "0";
renderer.domElement.dataset.buildingScaleMultiplier = String(BUILDING_SCALE_MULTIPLIER);
renderer.domElement.dataset.buildingScaleRevision = BUILDING_SCALE_REVISION;
renderer.domElement.dataset.buildingPositionOffsets = JSON.stringify(Object.fromEntries(BUILDING_POSITION_OFFSETS));
renderer.domElement.dataset.buildingScaleLimits = JSON.stringify(Object.fromEntries(BUILDING_SCALE_LIMITS));
renderer.domElement.dataset.facadeSignsPlaced = "0";
const buildingDetailSystem = createBuildingDetailSystem({
  THREE,
  scene,
  curbHeight: CURB_HEIGHT,
  maxBuildings: TOTAL_CITY_SLOTS - OPEN_LOT_INDICES.length,
  recordObstacle: recordRoadsideObstacle,
  isRoadwayClear: (box) => roadCorridorsIntersectingBox(box).length === 0,
  surfaceMaps,
});
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
  cameraOccluderBoxes.push(boxEntry);

  loader.load(
    `assets/${name}.glb`,
    (gltf) => {
      const model = gltf.scene;

      const rawBox = new THREE.Box3().setFromObject(model);
      const rawSize = new THREE.Vector3();
      rawBox.getSize(rawSize);
      const footprintScale = layout.footprint / Math.max(rawSize.x, rawSize.z);
      const heightScale = getBuildingMaxHeight(name) / rawSize.y;
      const slotScaleMultiplier = BUILDING_SCALE_LIMITS.get(idx) ?? BUILDING_SCALE_MULTIPLIER;
      const scaleFactor = Math.min(footprintScale, heightScale) * slotScaleMultiplier;
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
            o.material.roughness = 0.34;
            o.material.metalness = 0.08;
          } else if (matName === "door") {
            o.material.color.setHex(preset.door);
            o.material.normalMap = surfaceMaps.metal.normalMap;
            o.material.roughnessMap = surfaceMaps.metal.roughnessMap;
            o.material.normalScale.set(0.12, 0.12);
            o.material.roughness = 0.58;
            o.material.metalness = 0.32;
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
            o.material.normalMap = surfaceMaps.facade.normalMap;
            o.material.roughnessMap = surfaceMaps.facade.roughnessMap;
            o.material.normalScale.set(bodyTexture ? 0.055 : 0.025, bodyTexture ? 0.055 : 0.025);
            o.material.roughness = bodyTexture ? 0.9 : 0.78;
          }
          o.material.needsUpdate = true;
        }
      });
      scene.add(model);

      const finalBox = new THREE.Box3().setFromObject(model);
      boxEntry.minX = finalBox.min.x;
      boxEntry.maxX = finalBox.max.x;
      boxEntry.minZ = finalBox.min.z;
      boxEntry.maxZ = finalBox.max.z;
      const finalSize = new THREE.Vector3();
      finalBox.getSize(finalSize);
      buildingDiagnostics.push({
        index: idx,
        name,
        zone: COMMERCIAL_TOWER_SLOTS.has(idx) ? "commercial" : "low-rise",
        width: finalSize.x,
        height: finalSize.y,
        depth: finalSize.z,
        minX: finalBox.min.x,
        maxX: finalBox.max.x,
        minZ: finalBox.min.z,
        maxZ: finalBox.max.z,
        scaleMultiplier: slotScaleMultiplier,
      });
      recordRoadsideObstacle(`building:${idx}`, finalBox);
      renderer.domElement.dataset.buildingsPlaced = String(buildingDiagnostics.length);
      renderer.domElement.dataset.buildingDimensions = JSON.stringify(buildingDiagnostics);

      const detailRandom = createSeededRandom(CITY_LAYOUT_SEED + idx * 4099 + 120000);
      const detailDiagnostics = buildingDetailSystem.addBuilding({
        index: idx,
        box: finalBox,
        rotation: layout.rotation,
        commercial: COMMERCIAL_TOWER_SLOTS.has(idx),
        random: detailRandom,
      });
      renderer.domElement.dataset.buildingDetailDiagnostics = JSON.stringify(detailDiagnostics);

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
          const rooftopUnitPosition = new THREE.Vector3(
            buildingCenterX + (decorRandom() * 2 - 1) * roofOffsetX,
            topY + 0.15,
            buildingCenterZ + (decorRandom() * 2 - 1) * roofOffsetZ
          );
          const rooftopUnitRotation = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, decorRandom() * Math.PI, 0)
          );
          const rooftopUnitMatrix = new THREE.Matrix4().compose(
            rooftopUnitPosition,
            rooftopUnitRotation,
            new THREE.Vector3(1, 1, 1)
          );
          rooftopUnitInstances.setMatrixAt(rooftopUnitCount, rooftopUnitMatrix);
          rooftopUnitCount += 1;
          rooftopUnitInstances.count = rooftopUnitCount;
          rooftopUnitInstances.instanceMatrix.needsUpdate = true;
          renderer.domElement.dataset.rooftopUnits = String(rooftopUnitCount);
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
          buildingCenterX + front.x * (facadeOffset - 0.02),
          Math.min(topY - 0.3, CURB_HEIGHT + BUILDING_FACADE_SIGN_HEIGHT),
          buildingCenterZ + front.z * (facadeOffset - 0.02)
        );
        neon.rotation.y = layout.rotation + Math.PI;
        scene.add(neon);
        neon.updateMatrixWorld(true);
        const signBox = new THREE.Box3().setFromObject(neon);
        facadeSignDiagnostics.push({
          index: idx,
          blockIndex: layout.blockIndex,
          minX: signBox.min.x,
          maxX: signBox.max.x,
          minZ: signBox.min.z,
          maxZ: signBox.max.z,
        });
        recordRoadsideObstacle(`facade-sign:${idx}`, signBox);
        renderer.domElement.dataset.facadeSignsPlaced = String(facadeSignDiagnostics.length);
        renderer.domElement.dataset.facadeSignDimensions = JSON.stringify(facadeSignDiagnostics);
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

    // 入口・車・街路設備との画面上の比率を優先し、従来1.75mの80%へ縮小する。
    const PLAYER_TARGET_HEIGHT = 1.4;
    const ADVENTURER_RIG_HEIGHT = 1.8085184492;
    const CHAR_SCALE = PLAYER_TARGET_HEIGHT / ADVENTURER_RIG_HEIGHT;
    renderer.domElement.dataset.playerTargetHeight = String(PLAYER_TARGET_HEIGHT);
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
const CAMERA_TARGET_HEIGHT = 0.84;
const CAMERA_COLLISION_PADDING = 0.12;
const CAMERA_WALL_GAP = 0.16;
const CAMERA_MIN_DIST = 0.85;
let currentCameraDistance = CAMERA_DIST;

function segmentBoxEntryTime(startX, startZ, endX, endZ, box, padding) {
  let entry = 0;
  let exit = 1;
  const axes = [
    [startX, endX - startX, box.minX - padding, box.maxX + padding],
    [startZ, endZ - startZ, box.minZ - padding, box.maxZ + padding],
  ];

  for (const [start, delta, minimum, maximum] of axes) {
    if (Math.abs(delta) < 1e-6) {
      if (start < minimum || start > maximum) return null;
      continue;
    }
    let near = (minimum - start) / delta;
    let far = (maximum - start) / delta;
    if (near > far) [near, far] = [far, near];
    entry = Math.max(entry, near);
    exit = Math.min(exit, far);
    if (entry > exit) return null;
  }
  return entry >= 0 && entry <= 1 ? entry : null;
}

function allowedCameraDistance(playerPosition, directionX, directionZ) {
  const desiredX = playerPosition.x + directionX * CAMERA_DIST;
  const desiredZ = playerPosition.z + directionZ * CAMERA_DIST;
  let nearestEntry = 1;

  cameraOccluderBoxes.forEach((box) => {
    const entry = segmentBoxEntryTime(
      playerPosition.x,
      playerPosition.z,
      desiredX,
      desiredZ,
      box,
      CAMERA_COLLISION_PADDING
    );
    if (entry !== null && entry < nearestEntry) nearestEntry = entry;
  });

  return Math.max(CAMERA_MIN_DIST, CAMERA_DIST * nearestEntry - CAMERA_WALL_GAP);
}

function updateCamera(dt) {
  const p = player.position;
  const directionX = Math.sin(cameraYaw);
  const directionZ = Math.cos(cameraYaw);
  const allowedDistance = allowedCameraDistance(p, directionX, directionZ);
  currentCameraDistance = allowedDistance < currentCameraDistance
    ? allowedDistance
    : THREE.MathUtils.damp(currentCameraDistance, allowedDistance, 7, dt);
  const offsetX = directionX * currentCameraDistance;
  const offsetZ = directionZ * currentCameraDistance;
  camera.position.set(p.x + offsetX, p.y + CAMERA_HEIGHT, p.z + offsetZ);
  camera.lookAt(p.x, p.y + CAMERA_TARGET_HEIGHT, p.z);
  renderer.domElement.dataset.cameraDistance = currentCameraDistance.toFixed(3);
  renderer.domElement.dataset.cameraCollisionActive = String(currentCameraDistance < CAMERA_DIST - 0.01);
}

// ---------- FPS表示 ----------
const fpsEl = document.getElementById("fps");
let frameCount = 0;
let fpsAccum = 0;
const visualQa = createVisualQa({ renderer, camera });

// ---------- ループ ----------
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (!visualQa.enabled) {
    updatePlayer(dt);
    updateCamera(dt);
  } else {
    visualQa.applyFixedCamera();
  }
  if (mixer) mixer.update(dt);
  renderer.render(scene, camera);
  visualQa.afterRender(now);

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
