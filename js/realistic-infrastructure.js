function configureBatch(mesh, name, castShadow = false) {
  mesh.name = name;
  mesh.count = 0;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(35048);
  return mesh;
}

function setInstance(THREE, mesh, index, position, quaternion, scale = new THREE.Vector3(1, 1, 1)) {
  const matrix = new THREE.Matrix4().compose(position, quaternion, scale);
  mesh.setMatrixAt(index, matrix);
  mesh.count = index + 1;
  mesh.instanceMatrix.needsUpdate = true;
}

function rotatedOffset(THREE, x, y, z, rotationY) {
  return new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
}

export function createRealisticStreetlightSystem({ THREE, scene, capacity, height, groundY }) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x555b60, roughness: 0.48, metalness: 0.76 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2d3236, roughness: 0.62, metalness: 0.64 });
  const lens = new THREE.MeshPhysicalMaterial({
    color: 0xffe1ad,
    emissive: 0xffb75c,
    emissiveIntensity: 1.8,
    roughness: 0.2,
    clearcoat: 0.45,
    side: THREE.DoubleSide,
  });

  const poleGeometry = new THREE.CylinderGeometry(0.052, 0.078, height, 12);
  const baseGeometry = new THREE.CylinderGeometry(0.12, 0.15, 0.18, 12);
  const armGeometry = new THREE.CylinderGeometry(0.038, 0.045, 0.68, 10);
  const housingGeometry = new THREE.CapsuleGeometry(0.095, 0.22, 2, 8);
  const lensGeometry = new THREE.PlaneGeometry(0.28, 0.1);
  lensGeometry.rotateX(Math.PI / 2);

  const poleBatch = configureBatch(new THREE.InstancedMesh(poleGeometry, metal, capacity), "Streetlight:poles", true);
  const baseBatch = configureBatch(new THREE.InstancedMesh(baseGeometry, darkMetal, capacity), "Streetlight:bases");
  const armBatch = configureBatch(new THREE.InstancedMesh(armGeometry, metal, capacity), "Streetlight:arms");
  const housingBatch = configureBatch(new THREE.InstancedMesh(housingGeometry, darkMetal, capacity), "Streetlight:housings");
  const lensBatch = configureBatch(new THREE.InstancedMesh(lensGeometry, lens, capacity), "Streetlight:lenses");
  [poleBatch, baseBatch, armBatch, housingBatch, lensBatch].forEach((mesh) => scene.add(mesh));

  const yAxis = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  let count = 0;

  function add({ x, z, rotationY, addLocalLight }) {
    const index = count;
    const basePosition = new THREE.Vector3(x, groundY, z);
    const yRotation = new THREE.Quaternion().setFromAxisAngle(yAxis, rotationY);
    const armRotation = yRotation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, Math.PI / 2 - 0.12));
    const housingRotation = yRotation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, Math.PI / 2));

    setInstance(THREE, poleBatch, index, basePosition.clone().add(new THREE.Vector3(0, height / 2, 0)), yRotation);
    setInstance(THREE, baseBatch, index, basePosition.clone().add(new THREE.Vector3(0, 0.09, 0)), yRotation);
    setInstance(THREE, armBatch, index, basePosition.clone().add(rotatedOffset(THREE, 0.31, height - 0.06, 0, rotationY)), armRotation);
    setInstance(THREE, housingBatch, index, basePosition.clone().add(rotatedOffset(THREE, 0.62, height - 0.12, 0, rotationY)), housingRotation);
    setInstance(THREE, lensBatch, index, basePosition.clone().add(rotatedOffset(THREE, 0.62, height - 0.215, 0, rotationY)), yRotation);

    if (addLocalLight) {
      const localLight = new THREE.PointLight(0xffc06b, 0.72, 6, 2);
      localLight.position.copy(basePosition).add(rotatedOffset(THREE, 0.62, height - 0.24, 0, rotationY));
      scene.add(localLight);
    }
    count += 1;
    return count;
  }

  return { add, get count() { return count; }, drawCalls: 5 };
}

export function createRealisticRooftopEquipmentSystem({ THREE, scene, capacity }) {
  const bodyGeometry = new THREE.BoxGeometry(0.65, 0.3, 0.5);
  const fanGeometry = new THREE.CylinderGeometry(0.135, 0.135, 0.014, 12);
  const ringGeometry = new THREE.RingGeometry(0.11, 0.15, 12);
  ringGeometry.rotateX(Math.PI / 2);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 0.73, metalness: 0.32 });
  const fanMaterial = new THREE.MeshStandardMaterial({ color: 0x252a2d, roughness: 0.58, metalness: 0.58 });
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa0a1, roughness: 0.55, metalness: 0.62 });
  const bodyBatch = configureBatch(new THREE.InstancedMesh(bodyGeometry, bodyMaterial, capacity), "RooftopEquipment:bodies");
  const fanBatch = configureBatch(new THREE.InstancedMesh(fanGeometry, fanMaterial, capacity), "RooftopEquipment:fans");
  const ringBatch = configureBatch(new THREE.InstancedMesh(ringGeometry, ringMaterial, capacity), "RooftopEquipment:grilles");
  [bodyBatch, fanBatch, ringBatch].forEach((mesh) => scene.add(mesh));
  let count = 0;

  function add({ position, rotationY }) {
    const index = count;
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0));
    setInstance(THREE, bodyBatch, index, position, rotation);
    setInstance(THREE, fanBatch, index, position.clone().add(new THREE.Vector3(0, 0.158, 0)), rotation);
    setInstance(THREE, ringBatch, index, position.clone().add(new THREE.Vector3(0, 0.169, 0)), rotation);
    count += 1;
    return count;
  }

  return { add, get count() { return count; }, drawCalls: 3 };
}

function cylinderBetween(THREE, start, end, radius, material, segments = 14) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

export function createDetailedTrafficSignal({ THREE, parent, materials, intersectionZ, direction, mainRoadX, roadHalfWidth, curbHeight }) {
  const group = new THREE.Group();
  group.name = `DetailedTrafficSignal:${intersectionZ}:${direction}`;
  const side = direction;
  const poleMaterial = materials.galvanized;
  const housingMaterial = materials.darkMetal;
  const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x15191b, roughness: 0.58, metalness: 0.46 });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.098, 3.6, 12), poleMaterial);
  pole.position.y = 1.8;
  pole.castShadow = true;
  group.add(pole);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.18, 12), housingMaterial);
  collar.position.y = 0.09;
  group.add(collar);

  const armStart = new THREE.Vector3(0, 3.3, 0);
  const armEnd = new THREE.Vector3(-side * 3.0, 3.3, 0);
  group.add(cylinderBetween(THREE, armStart, armEnd, 0.048, poleMaterial));
  group.add(cylinderBetween(
    THREE,
    new THREE.Vector3(0, 2.86, 0),
    new THREE.Vector3(-side * 0.62, 3.3, 0),
    0.032,
    poleMaterial,
    12
  ));

  const housingX = -side * 2.64;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.38, 0.25), housingMaterial);
  housing.position.set(housingX, 3.2, 0);
  group.add(housing);
  const rearRim = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.42, 0.045), blackMaterial);
  rearRim.position.set(housingX, 3.2, side > 0 ? 0.145 : -0.145);
  group.add(rearRim);

  const signalColors = [0x63231f, 0x92711c, 0x19715a];
  signalColors.forEach((color, index) => {
    const lensX = -side * (2.91 - index * 0.27);
    const lit = index === 2;
    const lensMaterial = new THREE.MeshPhysicalMaterial({
      color,
      emissive: lit ? 0x2f9c75 : 0x000000,
      emissiveIntensity: lit ? 1.35 : 0,
      roughness: 0.2,
      clearcoat: 0.7,
    });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.086, 16), lensMaterial);
    lens.position.set(lensX, 3.2, side > 0 ? -0.132 : 0.132);
    lens.rotation.y = side > 0 ? Math.PI : 0;
    group.add(lens);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.076, 0.098, 12), blackMaterial);
    ring.position.copy(lens.position);
    ring.rotation.y = lens.rotation.y;
    group.add(ring);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.035, 0.16), blackMaterial);
    visor.position.set(lensX, 3.31, side > 0 ? -0.17 : 0.17);
    group.add(visor);
  });

  const pedestrianHousing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.52, 0.2), housingMaterial);
  pedestrianHousing.position.set(side * 0.22, 2.35, side * 0.02);
  group.add(pedestrianHousing);
  const pedestrianLens = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x2a725c, emissive: 0x225a4a, emissiveIntensity: 0.8 })
  );
  pedestrianLens.position.set(side * 0.22, 2.22, side > 0 ? -0.105 : 0.105);
  pedestrianLens.rotation.y = side > 0 ? Math.PI : 0;
  group.add(pedestrianLens);

  const cornerClearance = 0.5;
  group.position.set(
    mainRoadX + side * (roadHalfWidth + cornerClearance),
    curbHeight,
    intersectionZ + side * (roadHalfWidth + cornerClearance)
  );
  parent.add(group);
  return group;
}

function makeVendingTexture(THREE, accent, seed) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#eef3f2");
  gradient.addColorStop(0.72, "#d5d9d7");
  gradient.addColorStop(1, "#aeb4b3");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = accent;
  context.fillRect(0, 0, canvas.width, 58);
  context.fillStyle = "rgba(255,255,255,0.88)";
  context.font = "bold 24px sans-serif";
  context.textAlign = "center";
  context.fillText("DRINKS", canvas.width / 2, 38);
  context.fillStyle = "#20272a";
  context.fillRect(28, 78, 328, 270);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const x = 52 + column * 52;
      const y = 112 + row * 82;
      const hue = (seed * 47 + row * 83 + column * 41) % 360;
      context.fillStyle = `hsl(${hue},55%,48%)`;
      context.fillRect(x - 10, y - 22, 20, 43);
      context.fillStyle = "rgba(255,255,255,0.72)";
      context.fillRect(x - 7, y - 17, 14, 4);
      context.fillStyle = "#f3eee0";
      context.fillRect(x - 17, y + 27, 34, 10);
      context.fillStyle = "#ba2e29";
      context.font = "8px sans-serif";
      context.fillText(String(100 + ((seed + row + column) % 5) * 10), x, y + 35);
    }
    context.fillStyle = "#6f7475";
    context.fillRect(34, 151 + row * 82, 316, 4);
  }
  context.fillStyle = "#32383a";
  context.fillRect(38, 382, 214, 72);
  context.fillStyle = "#111516";
  context.fillRect(72, 404, 142, 27);
  context.fillStyle = "#d5dad8";
  context.fillRect(278, 382, 65, 72);
  context.fillStyle = "#1f2527";
  context.fillRect(292, 399, 36, 9);
  context.fillStyle = "#e6c04d";
  context.beginPath();
  context.arc(310, 431, 9, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createDetailedVendingMachine({ THREE, parent, position, rotationY, accent, seed }) {
  const group = new THREE.Group();
  group.name = `DetailedVendingMachine:${seed}`;
  group.position.copy(position);
  group.rotation.y = rotationY;
  const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: 0xd8dcda, roughness: 0.38, metalness: 0.34, clearcoat: 0.24 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x353a3c, roughness: 0.56, metalness: 0.52 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.75, 0.62), bodyMaterial);
  body.position.y = 0.875;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const frontTexture = makeVendingTexture(THREE, accent, seed);
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(0.64, 1.54),
    new THREE.MeshStandardMaterial({ map: frontTexture, emissiveMap: frontTexture, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.28 })
  );
  front.position.set(0, 0.96, 0.316);
  group.add(front);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.055, 0.66), trimMaterial);
  top.position.y = 1.76;
  group.add(top);
  [-0.24, 0.24].forEach((x) => {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.08, 12), trimMaterial);
    foot.position.set(x, 0.04, 0.18);
    group.add(foot);
  });
  parent.add(group);
  return group;
}
