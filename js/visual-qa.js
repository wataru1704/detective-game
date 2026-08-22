const QA_VIEWS = [
  { name: "spawn-main-road", position: [-12, 2.65, 38], target: [-12, 1.25, 23] },
  { name: "central-approach", position: [-12, 3.05, 7], target: [-12, 1.25, -12] },
  { name: "residential-frontage", position: [-5, 2.5, 18], target: [6, 1.45, 18] },
  { name: "shopping-street", position: [34, 2.7, -12], target: [13, 1.35, -12] },
  { name: "parking-and-cars", position: [34.5, 2.8, 24.5], target: [29.7, 1.0, 18.5] },
  { name: "signal-crosswalk", position: [2, 6.8, -22], target: [12, 0.15, -12] },
  { name: "service-alley", position: [1.5, 2.35, 8], target: [1.5, 1.05, -7] },
  { name: "city-edge-horizon", position: [31, 3.2, 24], target: [57, 2.0, 24] },
];

function numberParam(params, name, fallback, min, max) {
  if (!params.has(name)) return fallback;
  const parsed = Number(params.get(name));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function percentileLowFps(frameTimes, percentage) {
  if (!frameTimes.length) return 0;
  const slowestCount = Math.max(1, Math.ceil(frameTimes.length * percentage));
  const slowest = [...frameTimes].sort((a, b) => b - a).slice(0, slowestCount);
  const averageSlowFrameMs = slowest.reduce((sum, value) => sum + value, 0) / slowest.length;
  return 1000 / averageSlowFrameMs;
}

export function createVisualQa({ renderer, camera }) {
  const params = new URLSearchParams(window.location.search);
  const enabled = params.get("qa") === "1";
  const viewIndex = Math.round(numberParam(params, "qaView", 0, 0, QA_VIEWS.length - 1));
  const warmupSeconds = numberParam(params, "qaWarmup", 10, 0, 60);
  const sampleSeconds = numberParam(params, "qaSeconds", 60, 5, 180);
  const selectedView = QA_VIEWS[viewIndex];
  const startedAt = performance.now();
  let previousSampleTime = null;
  let sampleStartedAt = null;
  let complete = false;
  const frameTimes = [];
  const renderCalls = [];
  const triangles = [];

  const overlay = document.createElement("div");
  overlay.id = "visual-qa";
  overlay.hidden = !enabled;
  if (enabled) {
    document.body.classList.add("visual-qa-mode");
    document.body.appendChild(overlay);
    renderer.domElement.dataset.visualQaState = "warming-up";
    renderer.domElement.dataset.visualQaView = selectedView.name;
  }

  function applyFixedCamera() {
    if (!enabled) return;
    camera.position.fromArray(selectedView.position);
    camera.lookAt(...selectedView.target);
  }

  function finish(now) {
    if (complete) return;
    complete = true;
    const elapsedSeconds = sampleStartedAt === null ? 0 : (now - sampleStartedAt) / 1000;
    const averageFps = elapsedSeconds > 0 ? frameTimes.length / elapsedSeconds : 0;
    const canvasData = renderer.domElement.dataset;
    const roadwayDiagnostics = JSON.parse(canvasData.roadwayClearanceDiagnostics || "{}");
    const metrics = {
      schemaVersion: 1,
      completedAt: new Date().toISOString(),
      view: { index: viewIndex, ...selectedView },
      timing: {
        warmupSeconds,
        requestedSampleSeconds: sampleSeconds,
        measuredSeconds: Number(elapsedSeconds.toFixed(3)),
        frames: frameTimes.length,
        averageFps: Number(averageFps.toFixed(2)),
        onePercentLowFps: Number(percentileLowFps(frameTimes, 0.01).toFixed(2)),
        worstFrameMs: Number(Math.max(...frameTimes).toFixed(2)),
      },
      render: {
        callsAverage: Number((renderCalls.reduce((sum, value) => sum + value, 0) / renderCalls.length).toFixed(2)),
        callsMax: Math.max(...renderCalls),
        trianglesAverage: Math.round(triangles.reduce((sum, value) => sum + value, 0) / triangles.length),
        trianglesMax: Math.max(...triangles),
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? null,
      },
      viewport: {
        cssWidth: window.innerWidth,
        cssHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        rendererPixelRatio: renderer.getPixelRatio(),
      },
      world: {
        unitsPerMetre: 1,
        playerTargetHeight: Number(canvasData.playerTargetHeight || 1.4),
        buildingsPlaced: Number(canvasData.buildingsPlaced || 0),
        streetAssetsPlaced: Number(canvasData.streetAssetsPlaced || 0),
        roadwayIntrusions: roadwayDiagnostics.intrusions?.length ?? null,
      },
      runtimeMs: Math.round(now - startedAt),
    };
    renderer.domElement.dataset.visualQaState = "complete";
    renderer.domElement.dataset.visualQaMetrics = JSON.stringify(metrics);
    window.__visualQaMetrics = metrics;
    overlay.textContent = `${selectedView.name} | ${metrics.timing.averageFps} fps | 1% Low ${metrics.timing.onePercentLowFps} | ${metrics.render.callsAverage} calls`;
  }

  function afterRender(now) {
    if (!enabled || complete) return;
    const elapsed = (now - startedAt) / 1000;
    if (elapsed < warmupSeconds) {
      overlay.textContent = `QA ${viewIndex + 1}/${QA_VIEWS.length} ${selectedView.name} | warm-up ${Math.ceil(warmupSeconds - elapsed)}s`;
      return;
    }
    renderer.domElement.dataset.visualQaState = "measuring";
    if (previousSampleTime === null) {
      previousSampleTime = now;
      sampleStartedAt = now;
    }
    const frameMs = now - previousSampleTime;
    previousSampleTime = now;
    if (frameMs > 0) {
      frameTimes.push(frameMs);
      renderCalls.push(renderer.info.render.calls);
      triangles.push(renderer.info.render.triangles);
    }
    const measured = sampleStartedAt === null ? 0 : (now - sampleStartedAt) / 1000;
    overlay.textContent = `QA ${viewIndex + 1}/${QA_VIEWS.length} ${selectedView.name} | ${Math.min(sampleSeconds, measured).toFixed(1)}/${sampleSeconds}s`;
    if (measured >= sampleSeconds && frameTimes.length) finish(now);
  }

  return { enabled, viewIndex, viewCount: QA_VIEWS.length, applyFixedCamera, afterRender };
}
