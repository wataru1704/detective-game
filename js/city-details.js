/**
 * 日本の住宅・商業混在街区らしい生活設備を、軽量な共通形状で追加する。
 * 同じ形状をまとめて描くことで、スマホでも描画回数を増やしすぎない。
 */
export function createJapaneseCityDetails({
  THREE,
  scene,
  gridCols,
  gridRows,
  cellSize,
  blockSize,
  curbHeight,
  openLotIndices,
}) {
  const details = new THREE.Group();
  details.name = "JapaneseCityDetails";
  scene.add(details);
  const cityDetailDiagnostics = { signals: [], signs: [], obstacles: [], roadIntrusions: [] };

  const roadWidth = cellSize - blockSize;
  const roadHalfWidth = roadWidth / 2;
  const cityHalfWidth = ((gridCols - 1) * cellSize + blockSize) / 2;
  const cityHalfDepth = ((gridRows - 1) * cellSize + blockSize) / 2;
  const mainRoadX = (Math.floor((gridCols - 1) / 2) + 0.5 - (gridCols - 1) / 2) * cellSize;
  const shoppingStreetZ = cellSize / 2;
  const roadObstacleClearance = 0.3;
  const roadCenterXs = Array.from(
    { length: gridCols - 1 },
    (_, index) => (index + 0.5 - (gridCols - 1) / 2) * cellSize
  );
  const roadCenterZs = Array.from(
    { length: gridRows - 1 },
    (_, index) => (index + 0.5 - (gridRows - 1) / 2) * cellSize
  );

  function roadCorridorsIntersectingBox(box) {
    const epsilon = 0.0001;
    const corridors = [];
    roadCenterXs.forEach((center) => {
      if (
        box.max.x > center - roadHalfWidth - roadObstacleClearance + epsilon &&
        box.min.x < center + roadHalfWidth + roadObstacleClearance - epsilon
      ) corridors.push(`vertical:${center}`);
    });
    roadCenterZs.forEach((center) => {
      if (
        box.max.z > center - roadHalfWidth - roadObstacleClearance + epsilon &&
        box.min.z < center + roadHalfWidth + roadObstacleClearance - epsilon
      ) corridors.push(`horizontal:${center}`);
    });
    return corridors;
  }

  function recordGroundObstacle(label, box) {
    cityDetailDiagnostics.obstacles.push({
      label,
      minX: box.min.x,
      maxX: box.max.x,
      minZ: box.min.z,
      maxZ: box.max.z,
    });
    const corridors = roadCorridorsIntersectingBox(box);
    if (corridors.length > 0) cityDetailDiagnostics.roadIntrusions.push({ label, corridors });
  }

  const asphaltMaterial = new THREE.MeshStandardMaterial({ color: 0x45484a, roughness: 0.98 });
  const repairedAsphaltMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x505456, roughness: 1, transparent: true, opacity: 0.58 }),
    new THREE.MeshStandardMaterial({ color: 0x67696a, roughness: 1, transparent: true, opacity: 0.48 }),
  ];
  const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0x8b8980, roughness: 0.95 });
  const fadedWhiteMaterial = new THREE.MeshStandardMaterial({ color: 0xb9b7aa, roughness: 0.9 });
  const darkMetalMaterial = new THREE.MeshStandardMaterial({ color: 0x3d4143, roughness: 0.65, metalness: 0.55 });
  const galvanizedMaterial = new THREE.MeshStandardMaterial({ color: 0x999b96, roughness: 0.62, metalness: 0.45 });
  const utilityPoleMaterial = new THREE.MeshStandardMaterial({ color: 0x4d4b46, roughness: 0.95 });
  const rustMaterial = new THREE.MeshStandardMaterial({ color: 0x6d4938, roughness: 0.95 });
  const weedMaterial = new THREE.MeshStandardMaterial({ color: 0x586b3d, roughness: 1, side: THREE.DoubleSide });

  function lotCenter(index) {
    const col = index % gridCols;
    const row = Math.floor(index / gridCols);
    return {
      x: (col - (gridCols - 1) / 2) * cellSize,
      z: (row - (gridRows - 1) / 2) * cellSize,
    };
  }

  function addBox(size, position, material, rotationY = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
    mesh.position.copy(position);
    mesh.rotation.y = rotationY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    details.add(mesh);
    return mesh;
  }

  function makeLabelTexture(text, background, foreground) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(255,255,255,0.1)";
    for (let i = 0; i < 18; i++) {
      context.fillRect((i * 47) % 256, (i * 31) % 128, 24, 3);
    }
    context.strokeStyle = "rgba(40,35,30,0.65)";
    context.lineWidth = 7;
    context.strokeRect(4, 4, 248, 120);
    context.fillStyle = foreground;
    context.font = "bold 44px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 128, 66);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function addParkingLot(index, kind) {
    const center = lotCenter(index);
    const lotSize = blockSize - 0.55;
    const lot = new THREE.Mesh(
      new THREE.PlaneGeometry(lotSize, lotSize),
      kind === "vacant" ? concreteMaterial : repairedAsphaltMaterials[0]
    );
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(center.x, curbHeight + 0.008, center.z);
    lot.receiveShadow = true;
    details.add(lot);

    if (kind === "parking") {
      for (let slot = -1; slot <= 1; slot++) {
        const stripe = addBox(
          new THREE.Vector3(0.055, 0.012, 3.3),
          new THREE.Vector3(center.x + slot * 1.65, curbHeight + 0.022, center.z + 0.35),
          fadedWhiteMaterial
        );
        stripe.castShadow = false;
      }
      for (let stop = -1; stop <= 1; stop++) {
        addBox(
          new THREE.Vector3(0.75, 0.18, 0.16),
          new THREE.Vector3(center.x + stop * 1.65, curbHeight + 0.09, center.z - 1.05),
          concreteMaterial
        );
      }
    } else {
      const alley = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, lotSize),
        asphaltMaterial
      );
      alley.rotation.x = -Math.PI / 2;
      alley.position.set(center.x, curbHeight + 0.016, center.z);
      alley.receiveShadow = true;
      details.add(alley);
      [-1, 1].forEach((side) => {
        addBox(
          new THREE.Vector3(0.055, 0.82, lotSize - 0.45),
          new THREE.Vector3(center.x + side * 1.52, curbHeight + 0.41, center.z),
          rustMaterial
        );
      });
    }

    const signTexture = makeLabelTexture(kind === "parking" ? "月極" : "路地", "#ece8d5", "#26313a");
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.6),
      new THREE.MeshStandardMaterial({ map: signTexture, roughness: 0.85, side: THREE.DoubleSide })
    );
    sign.position.set(center.x + lotSize / 2 - 0.75, curbHeight + 1.15, center.z - lotSize / 2 + 0.12);
    sign.rotation.y = Math.PI;
    details.add(sign);
    addBox(
      new THREE.Vector3(0.06, 1.1, 0.06),
      new THREE.Vector3(sign.position.x, curbHeight + 0.55, sign.position.z),
      darkMetalMaterial
    );
  }

  openLotIndices.forEach((index, order) => {
    addParkingLot(index, order % 3 === 1 ? "vacant" : "parking");
  });

  // 道路の補修跡。同じ矩形を整列させず、角度と色を少しずつ変える。
  const patchPositions = [
    [mainRoadX - 1.3, -25, 0.08], [mainRoadX + 1.1, -16, -0.04], [mainRoadX - 0.5, -4, 0.03], [mainRoadX + 1.5, 12, -0.06],
    [mainRoadX - 1.1, 23, 0.04], [-24, shoppingStreetZ + 0.8, -0.03], [-12, shoppingStreetZ - 1.1, 0.05],
    [13, shoppingStreetZ + 1.2, -0.04], [27, shoppingStreetZ - 0.7, 0.06],
  ];
  patchPositions.forEach(([x, z, rotation], index) => {
    const patch = addBox(
      new THREE.Vector3(index % 2 === 0 ? 1.3 : 2.0, 0.009, index % 3 === 0 ? 2.8 : 1.7),
      new THREE.Vector3(x, 0.01, z),
      repairedAsphaltMaterials[index % repairedAsphaltMaterials.length],
      rotation
    );
    patch.castShadow = false;
  });

  // マンホールは共通形状をまとめて描画する。
  const manholePositions = [-25, -15, -5, 5, 15, 25];
  const manholeGeometry = new THREE.CylinderGeometry(0.31, 0.31, 0.025, 20);
  const manholeMesh = new THREE.InstancedMesh(manholeGeometry, darkMetalMaterial, manholePositions.length);
  const instanceTransform = new THREE.Object3D();
  manholePositions.forEach((z, index) => {
    instanceTransform.position.set(mainRoadX + (index % 2 === 0 ? -0.85 : 0.95), 0.018, z);
    instanceTransform.rotation.y = index * 0.47;
    instanceTransform.updateMatrix();
    manholeMesh.setMatrixAt(index, instanceTransform.matrix);
  });
  manholeMesh.receiveShadow = true;
  details.add(manholeMesh);

  // 道路端の側溝。細かい格子はテクスチャではなく共通の短い蓋で表現する。
  const drainTransforms = [];
  for (let z = -cityHalfDepth + 5; z <= cityHalfDepth - 5; z += 5.5) {
    drainTransforms.push([mainRoadX - roadHalfWidth + 0.14, z], [mainRoadX + roadHalfWidth - 0.14, z]);
  }
  const drainMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.28, 0.035, 0.82),
    darkMetalMaterial,
    drainTransforms.length
  );
  drainTransforms.forEach(([x, z], index) => {
    instanceTransform.position.set(x, 0.025, z);
    instanceTransform.rotation.set(0, 0, 0);
    instanceTransform.updateMatrix();
    drainMesh.setMatrixAt(index, instanceTransform.matrix);
  });
  details.add(drainMesh);

  // 電柱と電線。主要道路の片側へ寄せ、日本の狭い街路らしい密度にする。
  const poleX = mainRoadX + roadHalfWidth + 0.48;
  const poleZPositions = [];
  for (let z = -cityHalfDepth + 4; z <= cityHalfDepth - 4; z += cellSize) poleZPositions.push(z);
  const poleGeometry = new THREE.CylinderGeometry(0.12, 0.17, 7.1, 10);
  const poleMesh = new THREE.InstancedMesh(poleGeometry, utilityPoleMaterial, poleZPositions.length);
  poleZPositions.forEach((z, index) => {
    instanceTransform.position.set(poleX, curbHeight + 3.55, z);
    instanceTransform.rotation.set(0, 0, 0);
    instanceTransform.updateMatrix();
    poleMesh.setMatrixAt(index, instanceTransform.matrix);
  });
  poleMesh.castShadow = true;
  details.add(poleMesh);

  poleZPositions.forEach((z) => {
    addBox(
      new THREE.Vector3(1.35, 0.12, 0.12),
      new THREE.Vector3(poleX, curbHeight + 6.7, z),
      utilityPoleMaterial
    );
    addBox(
      new THREE.Vector3(0.48, 0.72, 0.34),
      new THREE.Vector3(poleX, curbHeight + 5.55, z),
      galvanizedMaterial
    );
  });

  function addWire(xOffset, height, sag) {
    const points = [];
    for (let index = 0; index < poleZPositions.length - 1; index++) {
      const startZ = poleZPositions[index];
      const endZ = poleZPositions[index + 1];
      for (let step = 0; step <= 8; step++) {
        if (index > 0 && step === 0) continue;
        const ratio = step / 8;
        const z = THREE.MathUtils.lerp(startZ, endZ, ratio);
        const y = curbHeight + height - Math.sin(ratio * Math.PI) * sag;
        points.push(new THREE.Vector3(poleX + xOffset, y, z));
      }
    }
    const wire = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0x25282a })
    );
    details.add(wire);
  }
  addWire(-0.48, 6.78, 0.42);
  addWire(0, 6.82, 0.48);
  addWire(0.48, 6.78, 0.42);
  addWire(0.16, 5.9, 0.62);

  function addTrafficSignal(intersectionZ, direction) {
    const group = new THREE.Group();
    const side = direction;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 3.6, 10), galvanizedMaterial);
    pole.position.y = 1.8;
    pole.castShadow = true;
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.1, 0.1), galvanizedMaterial);
    arm.position.set(-side * 1.46, 3.3, 0);
    group.add(arm);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.34, 0.28), darkMetalMaterial);
    housing.position.set(-side * 2.65, 3.2, 0);
    group.add(housing);
    const signalColors = [0x3b1918, 0x806b19, 0x1e6c54];
    signalColors.forEach((color, index) => {
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.085, 12),
        new THREE.MeshStandardMaterial({
          color,
          emissive: index === 2 ? 0x2b7f63 : 0x000000,
          emissiveIntensity: index === 2 ? 1.1 : 0,
        })
      );
      lens.position.set(-side * (2.92 - index * 0.27), 3.2, side > 0 ? -0.145 : 0.145);
      lens.rotation.y = side > 0 ? Math.PI : 0;
      group.add(lens);
    });
    // 柱は交差する2本の道路から外れた歩道角へ置き、腕だけを車道上へ出す。
    const cornerClearance = 0.45;
    group.position.set(
      mainRoadX + side * (roadHalfWidth + cornerClearance),
      curbHeight,
      intersectionZ + side * (roadHalfWidth + cornerClearance)
    );
    details.add(group);
    group.updateMatrixWorld(true);
    const signalBox = new THREE.Box3().setFromObject(group);
    cityDetailDiagnostics.signals.push({
      intersectionZ,
      direction,
      minX: signalBox.min.x,
      maxX: signalBox.max.x,
      minY: signalBox.min.y,
      maxY: signalBox.max.y,
      minZ: signalBox.min.z,
      maxZ: signalBox.max.z,
    });
  }
  [-cellSize / 2, cellSize / 2].forEach((z) => {
    addTrafficSignal(z, -1);
    addTrafficSignal(z, 1);
  });

  // ガードレールは主要道路の一部だけに置き、道路沿いの単調さを避ける。
  [-1, 1].forEach((side) => {
    [-18, 18].forEach((z) => {
      for (let segment = -1; segment <= 1; segment++) {
        const segmentZ = z + segment * 1.75;
        addBox(
          new THREE.Vector3(0.09, 0.78, 0.09),
          new THREE.Vector3(mainRoadX + side * (roadHalfWidth + 0.35), curbHeight + 0.39, segmentZ),
          galvanizedMaterial
        );
      }
      addBox(
        new THREE.Vector3(0.08, 0.2, 3.65),
        new THREE.Vector3(mainRoadX + side * (roadHalfWidth + 0.35), curbHeight + 0.58, z),
        galvanizedMaterial
      );
    });
  });

  function addVendingMachine(index, color, label) {
    const center = lotCenter(index);
    const x = center.x + blockSize / 2 - 0.66;
    const z = center.z + (index % 2 === 0 ? 1.45 : -1.35);
    addBox(new THREE.Vector3(0.72, 1.75, 0.62), new THREE.Vector3(x, curbHeight + 0.875, z), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    const texture = makeLabelTexture(label, "#f0eee6", "#c2362d");
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 1.18),
      new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.18 })
    );
    face.position.set(x - 0.365, curbHeight + 1.02, z);
    face.rotation.y = -Math.PI / 2;
    details.add(face);
  }
  addVendingMachine(6, 0xd8d5cd, "飲料");
  addVendingMachine(4, 0x3d5870, "珈琲");
  addVendingMachine(2, 0xb84a3c, "飲料");

  // 室外機と配管を建物脇へ置く。外周寄りなので入口や道路を塞がない。
  [1, 2, 3, 4, 6, 7, 8].forEach((index, order) => {
    if (openLotIndices.includes(index)) return;
    const center = lotCenter(index);
    const side = order % 2 === 0 ? 1 : -1;
    const x = center.x + side * (blockSize / 2 - 0.64);
    const z = center.z + ((order % 3) - 1) * 1.05;
    addBox(
      new THREE.Vector3(0.68, 0.54, 0.38),
      new THREE.Vector3(x, curbHeight + 0.27, z),
      galvanizedMaterial
    );
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.19, 12), darkMetalMaterial);
    fan.position.set(x - side * 0.345, curbHeight + 0.29, z);
    fan.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    details.add(fan);
    addBox(
      new THREE.Vector3(0.055, 1.35, 0.055),
      new THREE.Vector3(x, curbHeight + 1.1, z + 0.18),
      concreteMaterial
    );
  });

  // 路肩や空地だけに雑草を置き、均等な装飾にならないようにする。
  const weedPositions = [
    [mainRoadX - 3.62, -30], [mainRoadX + 3.7, -16.2], [mainRoadX - 3.7, 2], [mainRoadX + 3.65, 26], [-20, shoppingStreetZ - 3.65],
    [18, shoppingStreetZ + 3.7], [31, shoppingStreetZ - 3.6],
  ];
  weedPositions.forEach(([x, z], index) => {
    const weed = new THREE.Mesh(new THREE.PlaneGeometry(0.38 + (index % 3) * 0.1, 0.55), weedMaterial);
    weed.position.set(x, curbHeight + 0.28, z);
    weed.rotation.y = index * 0.83;
    details.add(weed);
    const crossed = weed.clone();
    crossed.rotation.y += Math.PI / 2;
    details.add(crossed);
  });

  // 商店街入口の古びた案内看板。
  const shoppingTexture = makeLabelTexture("青葉通り", "#e7dfc4", "#294b57");
  const shoppingSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 0.8),
    new THREE.MeshStandardMaterial({ map: shoppingTexture, roughness: 0.88, side: THREE.DoubleSide })
  );
  const signRoadClearance = 0.3;
  const shoppingSignHalfWidth = 1.15;
  shoppingSign.position.set(
    mainRoadX - roadHalfWidth - 0.35,
    curbHeight + 2.7,
    shoppingStreetZ - roadHalfWidth - shoppingSignHalfWidth - signRoadClearance
  );
  shoppingSign.rotation.y = Math.PI / 2;
  details.add(shoppingSign);
  addBox(
    new THREE.Vector3(0.09, 2.55, 0.09),
    new THREE.Vector3(shoppingSign.position.x, curbHeight + 1.28, shoppingSign.position.z - 0.83),
    darkMetalMaterial
  );
  addBox(
    new THREE.Vector3(0.09, 2.55, 0.09),
    new THREE.Vector3(shoppingSign.position.x, curbHeight + 1.28, shoppingSign.position.z + 0.83),
    darkMetalMaterial
  );

  cityDetailDiagnostics.signs.push({
    type: "shopping-street",
    minX: shoppingSign.position.x - 0.045,
    maxX: shoppingSign.position.x + 0.045,
    minZ: shoppingSign.position.z - shoppingSignHalfWidth,
    maxZ: shoppingSign.position.z + shoppingSignHalfWidth,
  });

  details.updateMatrixWorld(true);
  let obstacleIndex = 0;
  details.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh) return;
    const box = new THREE.Box3().setFromObject(object);
    const isRoadSurfaceDetail = box.max.y <= curbHeight + 0.08;
    const isSafelyOverhead = box.min.y >= 2.2;
    if (isRoadSurfaceDetail || isSafelyOverhead) return;
    recordGroundObstacle(`${object.geometry?.type || "mesh"}:${obstacleIndex}`, box);
    obstacleIndex += 1;
  });
  poleZPositions.forEach((z, index) => {
    recordGroundObstacle(
      `utility-pole:${index}`,
      new THREE.Box3(
        new THREE.Vector3(poleX - 0.17, curbHeight, z - 0.17),
        new THREE.Vector3(poleX + 0.17, curbHeight + 7.1, z + 0.17)
      )
    );
  });
  if (cityDetailDiagnostics.roadIntrusions.length > 0) {
    console.error("Roadside obstacle entered the roadway", cityDetailDiagnostics.roadIntrusions);
  }
  const canvas = document.querySelector("canvas");
  if (canvas) canvas.dataset.cityDetailDiagnostics = JSON.stringify(cityDetailDiagnostics);

  return { details, cityHalfWidth, cityHalfDepth };
}
