function seededRandom(seed = 0x4a617061) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function createSky(THREE) {
  const uniforms = {
    zenithColor: { value: new THREE.Color("#536d80") },
    upperColor: { value: new THREE.Color("#8299a4") },
    horizonColor: { value: new THREE.Color("#d6b093") },
    hazeColor: { value: new THREE.Color("#aeb8b6") },
    sunColor: { value: new THREE.Color("#ffd2a1") },
    sunDirection: { value: new THREE.Vector3(-0.48, 0.42, -0.26).normalize() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDirection;
      uniform vec3 zenithColor;
      uniform vec3 upperColor;
      uniform vec3 horizonColor;
      uniform vec3 hazeColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float elevation = clamp(direction.y, -0.12, 1.0);
        float upperBlend = smoothstep(0.04, 0.82, elevation);
        vec3 sky = mix(upperColor, zenithColor, upperBlend);
        float horizonBand = 1.0 - smoothstep(-0.04, 0.24, abs(elevation));
        sky = mix(sky, horizonColor, horizonBand * 0.72);
        float lowHaze = 1.0 - smoothstep(-0.1, 0.11, elevation);
        sky = mix(sky, hazeColor, lowHaze * 0.48);
        float sunCore = pow(max(dot(direction, sunDirection), 0.0), 520.0);
        float sunGlow = pow(max(dot(direction, sunDirection), 0.0), 18.0);
        sky += sunColor * (sunGlow * 0.12 + sunCore * 0.75);
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(205, 48, 24), material);
  sky.name = "atmospheric-sky";
  sky.frustumCulled = false;
  return sky;
}

function createDistantCity(THREE) {
  const random = seededRandom();
  const palette = [0x55666b, 0x5e696c, 0x69675f, 0x4f6166, 0x686a63, 0x5d6261];
  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  const buildingMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    fog: true,
    toneMapped: false,
  });
  const perSide = 22;
  const count = perSide * 4;
  const buildings = new THREE.InstancedMesh(buildingGeometry, buildingMaterial, count);
  buildings.name = "distant-city-buildings";
  buildings.castShadow = false;
  buildings.receiveShadow = false;

  const dummy = new THREE.Object3D();
  const records = [];
  let instance = 0;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < perSide; i++) {
      const along = -80 + (160 / (perSide - 1)) * i + (random() - 0.5) * 4.5;
      const band = 88 + random() * 18;
      const width = 3.0 + random() * 3.0;
      const depth = 4.5 + random() * 5.5;
      const edgeFalloff = 1 - Math.min(0.42, Math.abs(along) / 190);
      const height = (4.5 + Math.pow(random(), 0.72) * 14) * edgeFalloff;
      let x;
      let z;
      if (side === 0) { x = band; z = along; }
      if (side === 1) { x = -band; z = along; }
      if (side === 2) { x = along; z = band; }
      if (side === 3) { x = along; z = -band; }
      dummy.position.set(x, height / 2 - 0.02, z);
      dummy.scale.set(width, height, depth);
      dummy.rotation.y = (random() - 0.5) * 0.08;
      dummy.updateMatrix();
      buildings.setMatrixAt(instance, dummy.matrix);
      const baseColor = new THREE.Color(palette[Math.floor(random() * palette.length)]);
      baseColor.offsetHSL((random() - 0.5) * 0.025, (random() - 0.5) * 0.035, (random() - 0.5) * 0.07);
      buildings.setColorAt(instance, baseColor);
      records.push({ side, x, z, width, depth, height });
      instance++;
    }
  }
  buildings.instanceMatrix.needsUpdate = true;
  buildings.instanceColor.needsUpdate = true;
  buildings.computeBoundingSphere();

  const stripCount = records.length * 3;
  const stripGeometry = new THREE.PlaneGeometry(1, 0.14);
  const stripMaterial = new THREE.MeshBasicMaterial({
    color: 0x263a40,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    fog: true,
  });
  const facadeStrips = new THREE.InstancedMesh(stripGeometry, stripMaterial, stripCount);
  facadeStrips.name = "distant-city-facade-strips";
  instance = 0;
  records.forEach((record) => {
    for (let row = 1; row <= 3; row++) {
      const y = Math.min(record.height - 0.8, 1.6 + (record.height - 2.4) * (row / 4));
      dummy.position.set(record.x, y, record.z);
      dummy.rotation.set(0, 0, 0);
      if (record.side === 0) {
        dummy.position.x -= record.width / 2 + 0.006;
        dummy.rotation.y = -Math.PI / 2;
        dummy.scale.set(record.depth * 0.68, 1, 1);
      } else if (record.side === 1) {
        dummy.position.x += record.width / 2 + 0.006;
        dummy.rotation.y = Math.PI / 2;
        dummy.scale.set(record.depth * 0.68, 1, 1);
      } else if (record.side === 2) {
        dummy.position.z -= record.depth / 2 + 0.006;
        dummy.scale.set(record.width * 0.68, 1, 1);
      } else {
        dummy.position.z += record.depth / 2 + 0.006;
        dummy.rotation.y = Math.PI;
        dummy.scale.set(record.width * 0.68, 1, 1);
      }
      dummy.updateMatrix();
      facadeStrips.setMatrixAt(instance++, dummy.matrix);
    }
  });
  facadeStrips.instanceMatrix.needsUpdate = true;
  facadeStrips.computeBoundingSphere();

  const group = new THREE.Group();
  group.name = "distant-city";
  group.add(buildings, facadeStrips);
  return { group, buildingCount: count, drawCalls: 2 };
}

export function createJapaneseAtmosphere({ THREE, scene, renderer }) {
  const hazeColor = new THREE.Color(0xaeb8b6);
  scene.background = hazeColor;
  scene.fog = new THREE.Fog(hazeColor, 55, 160);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const hemisphere = new THREE.HemisphereLight(0xd8e4e5, 0x554c43, 1.8);
  hemisphere.name = "soft-sky-fill";
  scene.add(hemisphere);
  const ambient = new THREE.AmbientLight(0xffead8, 0.3);
  ambient.name = "warm-bounce-fill";
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffc694, 2.0);
  sun.name = "late-afternoon-sun";
  sun.position.set(-38, 54, -24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -62;
  sun.shadow.camera.right = 62;
  sun.shadow.camera.top = 62;
  sun.shadow.camera.bottom = -62;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 2;
  scene.add(sun);

  scene.add(createSky(THREE));
  const distantCity = createDistantCity(THREE);
  scene.add(distantCity.group);

  const diagnostics = {
    version: 1,
    distantBuildingCount: distantCity.buildingCount,
    distantDrawCalls: distantCity.drawCalls,
    fogNear: scene.fog.near,
    fogFar: scene.fog.far,
    toneMappingExposure: renderer.toneMappingExposure,
  };
  window.__atmosphereDiagnostics = diagnostics;
  return diagnostics;
}
