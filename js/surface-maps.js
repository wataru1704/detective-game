function fract(value) {
  return value - Math.floor(value);
}

function noise2d(x, y, seed) {
  return fract(Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453);
}

function makeSurfacePair(THREE, { seed, size, normalStrength, roughnessBase, roughnessVariation }) {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fine = noise2d(x, y, seed);
      const medium = noise2d(Math.floor(x / 3), Math.floor(y / 3), seed + 11);
      const broad = noise2d(Math.floor(x / 11), Math.floor(y / 11), seed + 29);
      height[y * size + x] = fine * 0.28 + medium * 0.42 + broad * 0.3;
    }
  }

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalContext = normalCanvas.getContext("2d");
  const normalImage = normalContext.createImageData(size, size);
  const roughnessCanvas = document.createElement("canvas");
  roughnessCanvas.width = size;
  roughnessCanvas.height = size;
  const roughnessContext = roughnessCanvas.getContext("2d");
  const roughnessImage = roughnessContext.createImageData(size, size);

  const sample = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = sample(x - 1, y);
      const right = sample(x + 1, y);
      const down = sample(x, y - 1);
      const up = sample(x, y + 1);
      let nx = (left - right) * normalStrength;
      let ny = (down - up) * normalStrength;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz);
      nx /= length;
      ny /= length;
      nz /= length;
      const offset = (y * size + x) * 4;
      normalImage.data[offset] = Math.round((nx * 0.5 + 0.5) * 255);
      normalImage.data[offset + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalImage.data[offset + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalImage.data[offset + 3] = 255;

      const roughness = Math.min(1, Math.max(0, roughnessBase + (height[y * size + x] - 0.5) * roughnessVariation));
      const value = Math.round(roughness * 255);
      roughnessImage.data[offset] = value;
      roughnessImage.data[offset + 1] = value;
      roughnessImage.data[offset + 2] = value;
      roughnessImage.data[offset + 3] = 255;
    }
  }
  normalContext.putImageData(normalImage, 0, 0);
  roughnessContext.putImageData(roughnessImage, 0, 0);

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
  [normalMap, roughnessMap].forEach((texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.NoColorSpace;
  });
  return { normalMap, roughnessMap };
}

export function createProceduralSurfaceMaps(THREE) {
  const asphalt = makeSurfacePair(THREE, {
    seed: 1704,
    size: 128,
    normalStrength: 1.9,
    roughnessBase: 0.91,
    roughnessVariation: 0.14,
  });
  asphalt.normalMap.repeat.set(96, 96);
  asphalt.roughnessMap.repeat.copy(asphalt.normalMap.repeat);

  const concrete = makeSurfacePair(THREE, {
    seed: 3307,
    size: 128,
    normalStrength: 0.72,
    roughnessBase: 0.86,
    roughnessVariation: 0.2,
  });
  concrete.normalMap.repeat.set(4, 4);
  concrete.roughnessMap.repeat.copy(concrete.normalMap.repeat);

  const facade = makeSurfacePair(THREE, {
    seed: 9011,
    size: 128,
    normalStrength: 0.25,
    roughnessBase: 0.8,
    roughnessVariation: 0.22,
  });
  facade.normalMap.repeat.set(2, 6);
  facade.roughnessMap.repeat.copy(facade.normalMap.repeat);

  const metal = makeSurfacePair(THREE, {
    seed: 15013,
    size: 64,
    normalStrength: 0.34,
    roughnessBase: 0.62,
    roughnessVariation: 0.28,
  });
  metal.normalMap.repeat.set(3, 3);
  metal.roughnessMap.repeat.copy(metal.normalMap.repeat);

  const maps = { asphalt, concrete, facade, metal };
  window.__surfaceMapDiagnostics = {
    version: 1,
    textureCount: 8,
    largestDimension: 128,
    generatedBytesApprox: (6 * 128 * 128 + 2 * 64 * 64) * 4,
  };
  return maps;
}
