// 事件ファイル001 ゲームロジック（試作版）
// 画面遷移: start -> investigate -> suspects -> (confront ->) ending

const state = {
  percent: 0,
  visitedSpotIds: new Set(),
  selectedSuspectId: null,
  confrontRound: 0,
  confrontSuccess: 0,
  markerAnimId: null,
  markerStartTime: 0,
  player: { x: MAP_CONFIG.playerStart.x, y: MAP_CONFIG.playerStart.y },
  keys: {},
  mapAnimId: null,
  mapLastTime: 0,
  nearSpotId: null,
};

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function updateMeter() {
  document.getElementById("meter-fill").style.width = state.percent + "%";
  document.getElementById("meter-value").textContent = state.percent + "%";
}

// ---------- 捜査画面（見下ろしマップ） ----------
const mapCanvas = document.getElementById("map-canvas");
const mapCtx = mapCanvas.getContext("2d");

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function isBlocked(x, y) {
  const size = MAP_CONFIG.playerSize;
  if (x < 0 || y < 0 || x + size > MAP_CONFIG.width || y + size > MAP_CONFIG.height) {
    return true;
  }
  const box = { x, y, w: size, h: size };
  return MAP_CONFIG.buildings.some((b) => rectsOverlap(box, b));
}

function updatePlayer(dt) {
  const speed = MAP_CONFIG.playerSpeed * dt;
  let dx = 0;
  let dy = 0;
  if (state.keys["ArrowUp"] || state.keys["w"]) dy -= speed;
  if (state.keys["ArrowDown"] || state.keys["s"]) dy += speed;
  if (state.keys["ArrowLeft"] || state.keys["a"]) dx -= speed;
  if (state.keys["ArrowRight"] || state.keys["d"]) dx += speed;

  const p = state.player;
  if (dx !== 0 && !isBlocked(p.x + dx, p.y)) p.x += dx;
  if (dy !== 0 && !isBlocked(p.x, p.y + dy)) p.y += dy;
}

function updateNearSpot() {
  const size = MAP_CONFIG.playerSize;
  const cx = state.player.x + size / 2;
  const cy = state.player.y + size / 2;
  let found = null;
  SPOTS.forEach((spot) => {
    if (state.visitedSpotIds.has(spot.id)) return;
    const dist = Math.hypot(cx - spot.x, cy - spot.y);
    if (dist <= MAP_CONFIG.interactRadius) found = spot;
  });
  state.nearSpotId = found ? found.id : null;

  const prompt = document.getElementById("map-prompt");
  prompt.textContent = found ? `Zキーで「${found.label}」を調べる` : "";
}

function drawMap() {
  const ctx = mapCtx;
  ctx.clearRect(0, 0, MAP_CONFIG.width, MAP_CONFIG.height);

  // 地面
  ctx.fillStyle = "#2a2e38";
  ctx.fillRect(0, 0, MAP_CONFIG.width, MAP_CONFIG.height);

  // 建物
  ctx.fillStyle = "#3d4250";
  MAP_CONFIG.buildings.forEach((b) => ctx.fillRect(b.x, b.y, b.w, b.h));

  // 調査地点
  SPOTS.forEach((spot) => {
    const visited = state.visitedSpotIds.has(spot.id);
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = visited ? "#5c5f66" : "#f0c14b";
    ctx.fill();

    ctx.fillStyle = visited ? "#7d7b74" : "#e8e6df";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(spot.label, spot.x, spot.y - 14);
  });

  // プレイヤー
  const p = state.player;
  const size = MAP_CONFIG.playerSize;
  ctx.fillStyle = "#c94f4f";
  ctx.fillRect(p.x, p.y, size, size);
}

function mapLoop(now) {
  if (!state.mapLastTime) state.mapLastTime = now;
  const dt = Math.min(0.05, (now - state.mapLastTime) / 1000);
  state.mapLastTime = now;

  updatePlayer(dt);
  updateNearSpot();
  drawMap();

  state.mapAnimId = requestAnimationFrame(mapLoop);
}

function startMap() {
  state.player = { x: MAP_CONFIG.playerStart.x, y: MAP_CONFIG.playerStart.y };
  state.mapLastTime = 0;
  document.getElementById("clue-log").innerHTML = "";
  document.getElementById("map-prompt").textContent = "";
  if (state.mapAnimId) cancelAnimationFrame(state.mapAnimId);
  state.mapAnimId = requestAnimationFrame(mapLoop);
}

function stopMap() {
  if (state.mapAnimId) {
    cancelAnimationFrame(state.mapAnimId);
    state.mapAnimId = null;
  }
}

function collectClue(spot) {
  state.visitedSpotIds.add(spot.id);
  state.percent = Math.min(100, state.percent + spot.percent);
  updateMeter();

  const log = document.getElementById("clue-log");
  const line = document.createElement("p");
  line.className = "spot-result";
  line.textContent = `【${spot.label}】${spot.result}`;
  log.appendChild(line);
}

function tryInteract() {
  if (state.nearSpotId) {
    const spot = SPOTS.find((s) => s.id === state.nearSpotId);
    collectClue(spot);
  }
}

document.addEventListener("keydown", (e) => {
  state.keys[e.key] = true;
  if (e.key === "z" || e.key === "Z" || e.key === "Enter") {
    tryInteract();
  }
});
document.addEventListener("keyup", (e) => {
  state.keys[e.key] = false;
});

// ---------- スマホ用タッチ操作 ----------
document.querySelectorAll(".btn-touch[data-key]").forEach((btn) => {
  const key = btn.dataset.key;
  const press = (e) => {
    e.preventDefault();
    state.keys[key] = true;
  };
  const release = (e) => {
    e.preventDefault();
    state.keys[key] = false;
  };
  btn.addEventListener("touchstart", press, { passive: false });
  btn.addEventListener("touchend", release, { passive: false });
  btn.addEventListener("touchcancel", release, { passive: false });
  // PCでのマウス操作でも一応動くようにしておく
  btn.addEventListener("mousedown", press);
  btn.addEventListener("mouseup", release);
  btn.addEventListener("mouseleave", release);
});

document.getElementById("btn-touch-interact").addEventListener("touchstart", (e) => {
  e.preventDefault();
  tryInteract();
});
document.getElementById("btn-touch-interact").addEventListener("click", tryInteract);

// ---------- 容疑者選択画面 ----------
function renderSuspects() {
  const list = document.getElementById("suspect-list");
  list.innerHTML = "";
  SUSPECTS.forEach((suspect) => {
    const item = document.createElement("div");
    item.className = "suspect-item";
    item.innerHTML = `<h3>${suspect.name}</h3><p>${suspect.desc}</p>`;

    const btn = document.createElement("button");
    btn.className = "btn-primary";
    btn.textContent = "この人物を確保する";
    btn.addEventListener("click", () => onSuspectSelect(suspect));
    item.appendChild(btn);

    list.appendChild(item);
  });
}

function onSuspectSelect(suspect) {
  state.selectedSuspectId = suspect.id;
  if (!suspect.correct) {
    showEnding(
      "誤認逮捕",
      `${suspect.name}を確保したが、供述と物証が食い違う。人違いだった——真犯人は今も野放しのままだ。\n\n数日後、街の別の場所で新たな爆破事件が発生したという一報が入る。（つづく）`
    );
    return;
  }
  startConfront(suspect);
}

// ---------- 対決画面（タイミングクリック） ----------
function startConfront(suspect) {
  state.confrontRound = 0;
  state.confrontSuccess = 0;
  document.getElementById("confront-title").textContent = "対決：" + suspect.name;
  document.getElementById("confront-desc").textContent =
    "路地裏に追い詰めた。マーカーが緑のゾーンに入った瞬間にボタンを押して確保しろ。";
  document.getElementById("round-result").textContent = "";
  showScreen("screen-confront");
  setupTimingZone();
  startMarkerLoop();

  const btn = document.getElementById("btn-timing");
  btn.onclick = onTimingClick;
}

function setupTimingZone() {
  const width =
    CONFRONT_CONFIG.baseZoneWidthPercent +
    (state.percent / 100) *
      (CONFRONT_CONFIG.maxZoneWidthPercent - CONFRONT_CONFIG.baseZoneWidthPercent);
  const zone = document.getElementById("timing-zone");
  zone.style.width = width + "%";
  zone.style.left = (50 - width / 2) + "%";
  zone.dataset.left = 50 - width / 2;
  zone.dataset.right = 50 + width / 2;
}

function markerPositionAt(elapsedMs) {
  const period = CONFRONT_CONFIG.markerPeriodMs;
  const t = (elapsedMs % period) / period;
  return t < 0.5 ? t * 2 * 100 : (1 - t) * 2 * 100;
}

function startMarkerLoop() {
  state.markerStartTime = performance.now();
  const marker = document.getElementById("timing-marker");

  function frame(now) {
    const elapsed = now - state.markerStartTime;
    const pos = markerPositionAt(elapsed);
    marker.style.left = pos + "%";
    state.markerAnimId = requestAnimationFrame(frame);
  }
  state.markerAnimId = requestAnimationFrame(frame);
}

function stopMarkerLoop() {
  if (state.markerAnimId) {
    cancelAnimationFrame(state.markerAnimId);
    state.markerAnimId = null;
  }
}

function onTimingClick() {
  const elapsed = performance.now() - state.markerStartTime;
  const pos = markerPositionAt(elapsed);
  const zone = document.getElementById("timing-zone");
  const left = parseFloat(zone.dataset.left);
  const right = parseFloat(zone.dataset.right);
  const hit = pos >= left && pos <= right;

  state.confrontRound += 1;
  if (hit) state.confrontSuccess += 1;

  const resultEl = document.getElementById("round-result");
  resultEl.textContent =
    `${state.confrontRound}投目: ` + (hit ? "成功！" : "外れ…") +
    `（${state.confrontSuccess}/${state.confrontRound}）`;

  if (state.confrontRound >= CONFRONT_CONFIG.totalRounds) {
    stopMarkerLoop();
    setTimeout(finishConfront, 600);
  }
}

function finishConfront() {
  const suspect = SUSPECTS.find((s) => s.id === state.selectedSuspectId);
  if (state.confrontSuccess >= CONFRONT_CONFIG.roundsNeeded) {
    showEnding(
      "逮捕成功",
      `もみ合いの末、${suspect.name}の身柄を確保した。\n\n証拠と証言が一致し、これが事件の真犯人であることが確定した。事件ファイル001は解決した。`
    );
  } else {
    showEnding(
      "取り逃がし",
      `真犯人は${suspect.name}で間違いなかった。しかし、もみ合いの末に逃げられてしまった。\n\n奴は姿を消し、次の犯行の準備を始めるだろう。（つづく）`
    );
  }
}

// ---------- エンディング画面 ----------
function showEnding(title, text) {
  document.getElementById("ending-title").textContent = title;
  document.getElementById("ending-text").textContent = text;
  showScreen("screen-ending");
}

// ---------- 初期化 ----------
function resetGame() {
  state.percent = 0;
  state.visitedSpotIds = new Set();
  state.selectedSuspectId = null;
  state.confrontRound = 0;
  state.confrontSuccess = 0;
  stopMarkerLoop();
  stopMap();
  updateMeter();
  showScreen("screen-start");
}

document.getElementById("btn-start").addEventListener("click", () => {
  showScreen("screen-investigate");
  updateMeter();
  startMap();
});

document.getElementById("btn-to-suspects").addEventListener("click", () => {
  stopMap();
  renderSuspects();
  showScreen("screen-suspects");
});

document.getElementById("btn-restart").addEventListener("click", resetGame);

resetGame();
