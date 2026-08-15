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
};

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function updateMeter() {
  document.getElementById("meter-fill").style.width = state.percent + "%";
  document.getElementById("meter-value").textContent = state.percent + "%";
}

// ---------- 捜査画面 ----------
function renderSpots() {
  const list = document.getElementById("spot-list");
  list.innerHTML = "";
  SPOTS.forEach((spot) => {
    const visited = state.visitedSpotIds.has(spot.id);
    const item = document.createElement("div");
    item.className = "spot-item" + (visited ? " visited" : "");

    const btn = document.createElement("button");
    btn.className = "btn-spot";
    btn.textContent = spot.label + (visited ? "（調査済み）" : "");
    btn.disabled = visited;
    btn.addEventListener("click", () => onSpotClick(spot));
    item.appendChild(btn);

    if (visited) {
      const resultText = document.createElement("p");
      resultText.className = "spot-result";
      resultText.textContent = spot.result;
      item.appendChild(resultText);
    }

    list.appendChild(item);
  });
}

function onSpotClick(spot) {
  state.visitedSpotIds.add(spot.id);
  state.percent = Math.min(100, state.percent + spot.percent);
  updateMeter();
  renderSpots();
}

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
  updateMeter();
  renderSpots();
  showScreen("screen-start");
}

document.getElementById("btn-start").addEventListener("click", () => {
  showScreen("screen-investigate");
  renderSpots();
  updateMeter();
});

document.getElementById("btn-to-suspects").addEventListener("click", () => {
  renderSuspects();
  showScreen("screen-suspects");
});

document.getElementById("btn-restart").addEventListener("click", resetGame);

resetGame();
