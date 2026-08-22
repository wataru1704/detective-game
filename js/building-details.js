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
  const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x767b79, roughness: 0.72, metalness: 0.48 });
  const unitMaterial = new THREE.MeshStandardMaterial({ color: 0xacaea8, roughness: 0.78, metalness: 0.15 });
  const grilleMaterial = new THREE.MeshStandardMaterial({ color: 0x515957, roughness: 0.72, metalness: 0.42 });
  const applySurface = (material, pair, strength) => {
    if (!pair) return;
    material.normalMap = pair.normalMap;
    material.roughnessMap = pair.roughnessMap;
    material.normalScale.set(strength, strength);
  };
  applySurface(pipeMaterial, surfaceMaps?.metal, 0.1);
  applySurface(unitMaterial, surfaceMaps?.metal, 0.09);
  applySurface(grilleMaterial, surfaceMaps?.metal, 0.14);

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
    version: 2,
    buildingsDetailed: 0,
    syntheticEntrances: 0,
    entrances: [],
    storefronts: 0,
    entranceFrameParts: 0,
    canopies: 0,
    downpipes: 0,
    outdoorUnits: 0,
    addedDrawCalls: 3,
  };
  window.__buildingDetailDiagnostics = diagnostics;

  function addBuilding({ index, box, rotation, random }) {
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
    diagnostics.buildingsDetailed += 1;

    if (height >= 3.2 && height <= 14 && random() < 0.82) {
      const pipeHeight = Math.max(2.7, height - 0.25);
      const pipeShift = (random() < 0.5 ? -1 : 1) * Math.max(0.35, facadeWidth / 2 - 0.16);
      const pipePoint = new THREE.Vector3(
        centerX + tangent.x * pipeShift + front.x * (facadeOffset + 0.055),
        curbHeight + pipeHeight / 2,
        centerZ + tangent.z * pipeShift + front.z * (facadeOffset + 0.055)
      );
      const pipeBounds = facadeBox(THREE, pipePoint, front, 0.13, pipeHeight, 0.13);
      if (isRoadwayClear(pipeBounds)) {
        updateInstance(THREE, downpipes, pipePoint, 0, new THREE.Vector3(0.065, pipeHeight, 0.065));
        diagnostics.downpipes += 1;
      }
    }

    if (height >= 3.4 && height <= 16 && random() < 0.74) {
      const unitCount = height > 6.5 && random() < 0.62 ? 2 : 1;
      const side = random() < 0.5 ? -1 : 1;
      for (let unit = 0; unit < unitCount; unit++) {
        const unitWidth = 0.62;
        const unitHeight = 0.45;
        const unitDepth = 0.24;
        const unitShift = side * Math.max(0.25, facadeWidth / 2 - unitWidth / 2 - 0.2);
        const y = Math.min(box.max.y - 0.45, curbHeight + 2.7 + unit * 2.55);
        const unitPoint = new THREE.Vector3(
          centerX + tangent.x * unitShift + front.x * (facadeOffset + unitDepth / 2),
          y,
          centerZ + tangent.z * unitShift + front.z * (facadeOffset + unitDepth / 2)
        );
        const unitBounds = facadeBox(THREE, unitPoint, front, unitWidth, unitHeight, unitDepth);
        if (!isRoadwayClear(unitBounds)) continue;
        updateInstance(THREE, outdoorUnits, unitPoint, facingRotation, new THREE.Vector3(unitWidth, unitHeight, unitDepth));
        const grillePoint = unitPoint.clone().addScaledVector(front, unitDepth / 2 + 0.004);
        updateInstance(THREE, unitGrilles, grillePoint, facingRotation, new THREE.Vector3(0.31, 0.31, 1));
        recordObstacle?.(`outdoor-unit:${index}:${unit}`, unitBounds);
        diagnostics.outdoorUnits += 1;
      }
    }
    return diagnostics;
  }

  return { addBuilding, diagnostics };
}
