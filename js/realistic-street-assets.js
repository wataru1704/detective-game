import { FBXLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/FBXLoader.js";

function createBatch(THREE, scene, geometry, material, entries, name, castShadow = false) {
  if (entries.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  entries.forEach((entry, index) => {
    mesh.setMatrixAt(index, entry.matrix);
    if (entry.color) mesh.setColorAt(index, entry.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}

function makeMatrix(THREE, placement, localPosition, localScale, localRotation = [0, 0, 0]) {
  const placementRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, placement.rotation || 0, 0));
  const partRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...localRotation));
  const worldRotation = placementRotation.clone().multiply(partRotation);
  const local = new THREE.Vector3(...localPosition).applyQuaternion(placementRotation);
  const worldPosition = new THREE.Vector3(placement.x + local.x, placement.groundY + local.y, placement.z + local.z);
  return new THREE.Matrix4().compose(worldPosition, worldRotation, new THREE.Vector3(...localScale));
}

const VEHICLE_MODELS = [
  {
    type: "late-2000s-compact",
    asset: "assets/vehicle-realistic-compact.fbx",
    width: 1.69,
    height: 1.32,
    length: 3.92,
    color: 0x718b92,
  },
  {
    type: "family-sedan",
    asset: "assets/vehicle-realistic-car.fbx",
    width: 1.75,
    height: 1.39,
    length: 4.12,
    color: 0xa4a29b,
  },
  {
    type: "utility-pickup",
    asset: "assets/vehicle-realistic-pickup.fbx",
    width: 1.72,
    height: 1.48,
    length: 4.55,
    color: 0xc7c4b8,
  },
  {
    type: "family-sedan-dark",
    asset: "assets/vehicle-realistic-car.fbx",
    width: 1.75,
    height: 1.39,
    length: 4.12,
    color: 0x655f59,
  },
];

function makeVehicleMaterial(THREE, original, bodyColor, isWheel) {
  const name = (original?.name || "").toLowerCase();
  if (isWheel) {
    return new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.88, metalness: 0.12 });
  }
  if (name === "cor" || name === "branco") {
    return new THREE.MeshPhysicalMaterial({
      name: original?.name,
      color: bodyColor,
      roughness: 0.28,
      metalness: 0.18,
      clearcoat: 0.62,
      clearcoatRoughness: 0.20,
    });
  }
  if (name === "cor2" || name === "preto") {
    return new THREE.MeshPhysicalMaterial({
      name: original?.name,
      color: 0x182126,
      roughness: 0.16,
      metalness: 0.08,
      transparent: true,
      opacity: 0.86,
    });
  }
  if (name === "cor3") {
    return new THREE.MeshStandardMaterial({
      name: original?.name,
      color: 0xd8ddd8,
      roughness: 0.30,
      metalness: 0.42,
      emissive: 0xbfc8c0,
      emissiveIntensity: 0.10,
    });
  }
  return new THREE.MeshStandardMaterial({ color: 0x303235, roughness: 0.68, metalness: 0.28 });
}

function createVehicles({ THREE, scene, placements, groundY, diagnostics }) {
  const assignments = new Map();
  const bounds = [];
  const plateEntries = [];
  placements.forEach((rawPlacement, index) => {
    const spec = VEHICLE_MODELS[index % VEHICLE_MODELS.length];
    const placement = { ...rawPlacement, groundY };
    if (!assignments.has(spec.asset)) assignments.set(spec.asset, []);
    assignments.get(spec.asset).push({ placement, spec, index });

    const rotated = Math.abs(Math.sin(placement.rotation || 0)) > 0.5;
    const halfX = (rotated ? spec.length : spec.width) / 2;
    const halfZ = (rotated ? spec.width : spec.length) / 2;
    bounds.push({
      type: spec.type,
      minX: placement.x - halfX,
      maxX: placement.x + halfX,
      minY: groundY,
      maxY: groundY + spec.height,
      minZ: placement.z - halfZ,
      maxZ: placement.z + halfZ,
    });

    [-1, 1].forEach((front) => {
      plateEntries.push({
        matrix: makeMatrix(
          THREE,
          placement,
          [0, 0.47, front * (spec.length / 2 + 0.012)],
          [0.34, 0.17, 0.018]
        ),
      });
    });
  });

  const plateMaterial = new THREE.MeshStandardMaterial({ color: 0xe5e3d5, roughness: 0.72, metalness: 0.02 });
  const plateMesh = createBatch(
    THREE,
    scene,
    new THREE.BoxGeometry(1, 1, 1),
    plateMaterial,
    plateEntries,
    "RealisticVehicles:japanese-plates"
  );
  diagnostics.drawCalls += plateMesh ? 1 : 0;

  const loader = new FBXLoader();
  diagnostics.modelsExpected = assignments.size;
  assignments.forEach((assetAssignments, asset) => {
    loader.load(
      asset,
      (source) => {
        const rawBox = new THREE.Box3().setFromObject(source);
        const rawSize = new THREE.Vector3();
        rawBox.getSize(rawSize);
        const sourceMeshCount = [];
        source.traverse((child) => { if (child.isMesh) sourceMeshCount.push(child); });

        assetAssignments.forEach(({ placement, spec, index }) => {
          const vehicle = source.clone(true);
          vehicle.name = `RealisticVehicle:${spec.type}:${index}`;
          vehicle.scale.setScalar(spec.width / rawSize.x);
          vehicle.rotation.y = placement.rotation || 0;
          vehicle.updateMatrixWorld(true);
          const transformedBox = new THREE.Box3().setFromObject(vehicle);
          const centerX = (transformedBox.min.x + transformedBox.max.x) / 2;
          const centerZ = (transformedBox.min.z + transformedBox.max.z) / 2;
          vehicle.position.set(
            placement.x - centerX,
            groundY - transformedBox.min.y,
            placement.z - centerZ
          );
          vehicle.traverse((child) => {
            if (!child.isMesh) return;
            if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
            const isWheel = /roda|wheel/i.test(child.name);
            const originalMaterials = Array.isArray(child.material) ? child.material : [child.material];
            const materials = originalMaterials.map((material) => makeVehicleMaterial(THREE, material, spec.color, isWheel));
            child.material = Array.isArray(child.material) ? materials : materials[0];
            // 車体は複数メッシュなので、動的な影を省いてスマホGPU負荷を抑える。
            // 接地感は環境AOへ任せ、受光だけ残して形状と材質の精細さを優先する。
            child.castShadow = false;
            child.receiveShadow = true;
          });
          scene.add(vehicle);
        });

        diagnostics.modelsLoaded += 1;
        diagnostics.vehicleModelDrawCalls += sourceMeshCount.length * assetAssignments.length;
        diagnostics.drawCalls += sourceMeshCount.length * assetAssignments.length;
        document.querySelector("canvas")?.setAttribute("data-realistic-street-assets", JSON.stringify(diagnostics));
      },
      undefined,
      (error) => {
        diagnostics.modelFailures.push(asset);
        document.querySelector("canvas")?.setAttribute("data-realistic-street-assets", JSON.stringify(diagnostics));
        console.warn(`Realistic vehicle load failed: ${asset}`, error);
      }
    );
  });

  return {
    count: placements.length,
    variants: placements.map((_, index) => VEHICLE_MODELS[index % VEHICLE_MODELS.length].type),
    bounds,
  };
}

function createVegetation({ THREE, scene, placements, groundY, diagnostics }) {
  const potGeometry = new THREE.CylinderGeometry(0.38, 0.31, 0.42, 16);
  const trunkGeometry = new THREE.CylinderGeometry(0.62, 1, 1, 10);
  const branchGeometry = new THREE.CylinderGeometry(0.55, 1, 1, 8);
  const foliageGeometry = new THREE.PlaneGeometry(1, 1);
  const potEntries = [];
  const trunkEntries = [];
  const branchEntries = [];
  const foliageEntries = [];
  const bounds = [];

  placements.forEach((rawPlacement, index) => {
    const placement = { ...rawPlacement, groundY };
    const treeHeight = 2.34 + (index % 3) * 0.16;
    const trunkHeight = 1.55 + (index % 2) * 0.12;
    const canopyY = 1.54 + (index % 2) * 0.08;
    const canopyWidth = 1.50 + (index % 3) * 0.08;
    const canopyHeight = 1.36 + ((index + 1) % 3) * 0.06;
    potEntries.push({ matrix: makeMatrix(THREE, placement, [0, 0.21, 0], [1, 1, 1]) });
    trunkEntries.push({
      matrix: makeMatrix(
        THREE,
        placement,
        [0, 0.42 + trunkHeight / 2, 0],
        [0.085, trunkHeight, 0.085],
        [0.025 * (index - 1.5), 0, 0.035 * ((index % 2) * 2 - 1)]
      ),
    });

    const branches = [
      [-0.16, 1.28, 0.02, 0.035, 0.68, 0.035, 0.04, 0.18, 0.48],
      [0.18, 1.42, -0.02, 0.032, 0.62, 0.032, -0.10, -0.28, -0.52],
      [0.02, 1.58, 0.12, 0.028, 0.52, 0.028, 0.42, 0.12, 0.10],
    ];
    branches.forEach((branch) => {
      branchEntries.push({
        matrix: makeMatrix(
          THREE,
          placement,
          branch.slice(0, 3),
          branch.slice(3, 6),
          branch.slice(6)
        ),
      });
    });

    [0, Math.PI / 3, Math.PI * 2 / 3].forEach((rotationY, cardIndex) => {
      foliageEntries.push({
        matrix: makeMatrix(
          THREE,
          placement,
          [0, canopyY + cardIndex * 0.015, 0],
          [canopyWidth, canopyHeight, 1],
          [0, rotationY + index * 0.19, (cardIndex - 1) * 0.025]
        ),
      });
    });

    bounds.push({
      minX: placement.x - canopyWidth / 2,
      maxX: placement.x + canopyWidth / 2,
      minY: groundY,
      maxY: groundY + treeHeight,
      minZ: placement.z - canopyWidth / 2,
      maxZ: placement.z + canopyWidth / 2,
    });
  });

  const foliageTexture = new THREE.TextureLoader().load("assets/Textures/urban-tree-foliage.png");
  foliageTexture.colorSpace = THREE.SRGBColorSpace;
  const potMaterial = new THREE.MeshStandardMaterial({ color: 0x68645d, roughness: 0.98, metalness: 0.01 });
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x594a3c, roughness: 1, metalness: 0 });
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: 0xb7b8a7,
    map: foliageTexture,
    transparent: true,
    alphaTest: 0.32,
    side: THREE.DoubleSide,
    depthWrite: true,
    roughness: 0.92,
    metalness: 0,
  });
  const meshes = [
    createBatch(THREE, scene, potGeometry, potMaterial, potEntries, "UrbanVegetation:weathered-pots"),
    createBatch(THREE, scene, trunkGeometry, trunkMaterial, trunkEntries, "UrbanVegetation:trunks", true),
    createBatch(THREE, scene, branchGeometry, trunkMaterial, branchEntries, "UrbanVegetation:branches", true),
    createBatch(THREE, scene, foliageGeometry, foliageMaterial, foliageEntries, "UrbanVegetation:foliage-cards"),
  ].filter(Boolean);
  diagnostics.drawCalls += meshes.length;
  return { count: placements.length, bounds };
}

export function createRealisticStreetAssets({ THREE, scene, vehiclePlacements, vegetationPlacements, groundY }) {
  const diagnostics = {
    version: 2,
    vehicles: vehiclePlacements.length,
    vehicleVariants: [],
    vegetation: vegetationPlacements.length,
    modelsExpected: 0,
    modelsLoaded: 0,
    modelFailures: [],
    vehicleModelDrawCalls: 0,
    drawCalls: 0,
    foliageTexture: "assets/Textures/urban-tree-foliage.png",
  };
  const vehicles = createVehicles({ THREE, scene, placements: vehiclePlacements, groundY, diagnostics });
  const vegetation = createVegetation({ THREE, scene, placements: vegetationPlacements, groundY, diagnostics });
  diagnostics.vehicleVariants = vehicles.variants;
  window.__realisticStreetAssetDiagnostics = diagnostics;
  return { diagnostics, vehicleBounds: vehicles.bounds, vegetationBounds: vegetation.bounds };
}
