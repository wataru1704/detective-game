function createInstancedPart(THREE, scene, name, geometry, material, capacity, castsShadow = false) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = 0;
  mesh.castShadow = castsShadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function updateInstance(THREE, mesh, position, rotationY, scale) {
  if (mesh.count >= mesh.instanceMatrix.count) return false;
  const transform = new THREE.Object3D();
  transform.position.copy(position);
  transform.rotation.y = rotationY;
  transform.scale.copy(scale);
  transform.updateMatrix();
  mesh.setMatrixAt(mesh.count, transform.matrix);
  mesh.count += 1;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return true;
}

function facadeBox(THREE, position, front, width, height, depth) {
  const tangent = new THREE.Vector3(front.z, 0, -front.x);
  const halfX = Math.abs(tangent.x) * width / 2 + Math.abs(front.x) * depth / 2;
  const halfZ = Math.abs(tangent.z) * width / 2 + Math.abs(front.z) * depth / 2;
  return new THREE.Box3(
    new THREE.Vector3(position.x - halfX, position.y - height / 2, position.z - halfZ),
    new THREE.Vector3(position.x + halfX, position.y + height / 2, position.z + halfZ)
  );
}

export function createBuildingDetailSystem({
  THREE,
  scene,
  curbHeight,
  maxBuildings,
  recordObstacle,
  isRoadwayClear = () => true,
  surfaceMaps,
}) {
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x28343a, roughness: 0.42, metalness: 0.5 });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x60777e,
    roughness: 0.24,
    metalness: 0.18,
    transparent: true,
    opacity: 0.78,
    depthWrite: true,
  });
  const thresholdMaterial = new THREE.MeshStandardMaterial({ color: 0x6f716d, roughness: 0.82, metalness: 0.18 });
  const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0x4c5557, roughness: 0.68, metalness: 0.42 });
  const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x767b79, roughness: 0.72, metalness: 0.48 });
  const unitMaterial = new THREE.MeshStandardMaterial({ color: 0xacaea8, roughness: 0.78, metalness: 0.15 });
  const grilleMaterial = new THREE.MeshStandardMaterial({ color: 0x515957, roughness: 0.72, metalness: 0.42 });
  const applySurface = (material, pair, strength) => {
    if (!pair) return;
    material.normalMap = pair.normalMap;
    material.roughnessMap = pair.roughnessMap;
    material.normalScale.set(strength, strength);
  };
  applySurface(doorMaterial, surfaceMaps?.metal, 0.12);
  applySurface(glassMaterial, surfaceMaps?.metal, 0.035);
  applySurface(thresholdMaterial, surfaceMaps?.concrete, 0.08);
  applySurface(canopyMaterial, surfaceMaps?.metal, 0.13);
  applySurface(pipeMaterial, surfaceMaps?.metal, 0.1);
  applySurface(unitMaterial, surfaceMaps?.metal, 0.09);
  applySurface(grilleMaterial, surfaceMaps?.metal, 0.14);

  const doors = createInstancedPart(
    THREE, scene, "scaled-building-doors",
    new THREE.PlaneGeometry(1, 1), doorMaterial, maxBuildings
  );
  const doorGlass = createInstancedPart(
    THREE, scene, "scaled-building-door-glass",
    new THREE.PlaneGeometry(1, 1), glassMaterial, maxBuildings
  );
  const thresholds = createInstancedPart(
    THREE, scene, "building-thresholds",
    new THREE.BoxGeometry(1, 1, 1), thresholdMaterial, maxBuildings
  );
  const storefronts = createInstancedPart(
    THREE, scene, "ground-floor-storefronts",
    new THREE.PlaneGeometry(1, 1), glassMaterial, maxBuildings
  );
  const canopies = createInstancedPart(
    THREE, scene, "building-canopies",
    new THREE.BoxGeometry(1, 1, 1), canopyMaterial, maxBuildings, true
  );
  const downpipes = createInstancedPart(
    THREE, scene, "building-downpipes",
    new THREE.CylinderGeometry(1, 1, 1, 8), pipeMaterial, maxBuildings
  );
  const outdoorUnits = createInstancedPart(
    THREE, scene, "wall-outdoor-units",
    new THREE.BoxGeometry(1, 1, 1), unitMaterial, maxBuildings * 2
  );
  const unitGrilles = createInstancedPart(
    THREE, scene, "wall-outdoor-unit-grilles",
    new THREE.CircleGeometry(0.5, 12), grilleMaterial, maxBuildings * 2
  );

  const diagnostics = {
    version: 1,
    buildingsDetailed: 0,
    entrances: [],
    storefronts: 0,
    canopies: 0,
    downpipes: 0,
    outdoorUnits: 0,
    addedDrawCalls: 8,
  };
  window.__buildingDetailDiagnostics = diagnostics;

  function addBuilding({ index, box, rotation, commercial, random }) {
    const front = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    const tangent = new THREE.Vector3(front.z, 0, -front.x);
    const centerX = (box.min.x + box.max.x) / 2;
    const centerZ = (box.min.z + box.max.z) / 2;
    const widthX = box.max.x - box.min.x;
    const depthZ = box.max.z - box.min.z;
    const height = box.max.y - curbHeight;
    const facadeWidth = Math.abs(front.z) > 0.5 ? widthX : depthZ;
    const facadeOffset = Math.abs(front.x) * widthX / 2 + Math.abs(front.z) * depthZ / 2;
    const facingRotation = Math.atan2(front.x, front.z);
    const doorWidth = 0.88 + random() * 0.12;
    const doorHeight = 2.02 + random() * 0.12;
    const allowedDoorShift = Math.max(0, facadeWidth / 2 - doorWidth / 2 - 0.35);
    const doorShift = (random() * 2 - 1) * Math.min(allowedDoorShift, facadeWidth * 0.18);
    const facadePoint = new THREE.Vector3(
      centerX + tangent.x * doorShift + front.x * (facadeOffset + 0.012),
      curbHeight + doorHeight / 2,
      centerZ + tangent.z * doorShift + front.z * (facadeOffset + 0.012)
    );

    updateInstance(THREE, doors, facadePoint, facingRotation, new THREE.Vector3(doorWidth, doorHeight, 1));
    const glassPoint = facadePoint.clone().addScaledVector(front, 0.008);
    glassPoint.y += 0.11;
    updateInstance(THREE, doorGlass, glassPoint, facingRotation, new THREE.Vector3(doorWidth * 0.66, doorHeight * 0.68, 1));
    const thresholdPoint = new THREE.Vector3(
      facadePoint.x + front.x * 0.16,
      curbHeight + 0.035,
      facadePoint.z + front.z * 0.16
    );
    updateInstance(THREE, thresholds, thresholdPoint, facingRotation, new THREE.Vector3(doorWidth + 0.18, 0.07, 0.32));
    recordObstacle?.(`entrance:${index}`, facadeBox(THREE, facadePoint, front, doorWidth, doorHeight, 0.04));

    diagnostics.entrances.push({ index, width: doorWidth, height: doorHeight });
    diagnostics.buildingsDetailed += 1;

    const remainingFacade = facadeWidth - doorWidth - 0.65;
    if (commercial && remainingFacade > 1.15) {
      const storefrontWidth = Math.min(2.4, remainingFacade);
      const storefrontShift = doorShift >= 0
        ? doorShift - doorWidth / 2 - storefrontWidth / 2 - 0.18
        : doorShift + doorWidth / 2 + storefrontWidth / 2 + 0.18;
      const storefrontPoint = new THREE.Vector3(
        centerX + tangent.x * storefrontShift + front.x * (facadeOffset + 0.014),
        curbHeight + 1.08,
        centerZ + tangent.z * storefrontShift + front.z * (facadeOffset + 0.014)
      );
      updateInstance(THREE, storefronts, storefrontPoint, facingRotation, new THREE.Vector3(storefrontWidth, 1.78, 1));
      diagnostics.storefronts += 1;
    }

    if (commercial && random() < 0.72) {
      const canopyWidth = Math.min(facadeWidth - 0.35, Math.max(1.65, doorWidth + 0.75));
      const canopyDepth = 0.48 + random() * 0.16;
      const canopyPoint = new THREE.Vector3(
        facadePoint.x + front.x * canopyDepth / 2,
        curbHeight + 2.28,
        facadePoint.z + front.z * canopyDepth / 2
      );
      const canopyBounds = facadeBox(THREE, canopyPoint, front, canopyWidth, 0.11, canopyDepth);
      if (isRoadwayClear(canopyBounds)) {
        updateInstance(THREE, canopies, canopyPoint, facingRotation, new THREE.Vector3(canopyWidth, 0.11, canopyDepth));
        recordObstacle?.(`canopy:${index}`, canopyBounds);
        diagnostics.canopies += 1;
      }
    }

    if (height >= 3.2 && height <= 14 && random() < 0.82) {
      const pipeHeight = Math.max(2.7, height - 0.25);
      const pipeShift = (random() < 0.5 ? -1 : 1) * Math.max(0.35, facadeWidth / 2 - 0.16);
      const pipePoint = new THREE.Vector3(
        centerX + tangent.x * pipeShift + front.x * (facadeOffset + 0.055),
        curbHeight + pipeHeight / 2,
        centerZ + tangent.z * pipeShift + front.z * (facadeOffset + 0.055)
      );
      updateInstance(THREE, downpipes, pipePoint, 0, new THREE.Vector3(0.065, pipeHeight, 0.065));
      diagnostics.downpipes += 1;
    }

    if (height >= 3.4 && height <= 16 && random() < 0.74) {
      const unitCount = height > 6.5 && random() < 0.62 ? 2 : 1;
      for (let unit = 0; unit < unitCount; unit++) {
        const unitWidth = 0.62;
        const unitHeight = 0.45;
        const unitDepth = 0.24;
        const side = doorShift >= 0 ? -1 : 1;
        const unitShift = side * Math.max(0.25, facadeWidth / 2 - unitWidth / 2 - 0.2);
        const y = Math.min(box.max.y - 0.45, curbHeight + 2.7 + unit * 2.55);
        const unitPoint = new THREE.Vector3(
          centerX + tangent.x * unitShift + front.x * (facadeOffset + unitDepth / 2),
          y,
          centerZ + tangent.z * unitShift + front.z * (facadeOffset + unitDepth / 2)
        );
        updateInstance(THREE, outdoorUnits, unitPoint, facingRotation, new THREE.Vector3(unitWidth, unitHeight, unitDepth));
        const grillePoint = unitPoint.clone().addScaledVector(front, unitDepth / 2 + 0.004);
        updateInstance(THREE, unitGrilles, grillePoint, facingRotation, new THREE.Vector3(0.31, 0.31, 1));
        recordObstacle?.(`outdoor-unit:${index}:${unit}`, facadeBox(THREE, unitPoint, front, unitWidth, unitHeight, unitDepth));
        diagnostics.outdoorUnits += 1;
      }
    }
    return diagnostics;
  }

  return { addBuilding, diagnostics };
}
