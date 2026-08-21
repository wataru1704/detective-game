import { RoundedBoxGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js";

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
  const vehicleRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, placement.rotation || 0, 0));
  const partRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...localRotation));
  const worldRotation = vehicleRotation.clone().multiply(partRotation);
  const local = new THREE.Vector3(...localPosition).applyQuaternion(vehicleRotation);
  const worldPosition = new THREE.Vector3(placement.x + local.x, placement.groundY + local.y, placement.z + local.z);
  return new THREE.Matrix4().compose(worldPosition, worldRotation, new THREE.Vector3(...localScale));
}

const VEHICLE_SPECS = [
  { type: "kei-height-wagon", width: 1.48, height: 1.66, length: 3.40, color: 0xd9d7cf, cabinZ: 0.08 },
  { type: "compact-hatchback", width: 1.69, height: 1.51, length: 4.05, color: 0x5f8ea0, cabinZ: 0.13 },
  { type: "family-sedan", width: 1.75, height: 1.46, length: 4.44, color: 0xa7a49d, cabinZ: 0.05 },
  { type: "compact-minivan", width: 1.73, height: 1.79, length: 4.55, color: 0xb85d50, cabinZ: 0.02 },
];

function createVehicles({ THREE, scene, placements, groundY }) {
  const roundedUnit = new RoundedBoxGeometry(1, 1, 1, 3, 0.11);
  const boxUnit = new THREE.BoxGeometry(1, 1, 1);
  const wheelUnit = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
  const body = [];
  const glass = [];
  const wheels = [];
  const trim = [];
  const headlights = [];
  const taillights = [];
  const plates = [];
  const bounds = [];

  placements.forEach((rawPlacement, index) => {
    const spec = VEHICLE_SPECS[index % VEHICLE_SPECS.length];
    const placement = { ...rawPlacement, groundY };
    const wheelRadius = spec.type === "compact-minivan" ? 0.31 : 0.29;
    const wheelWidth = 0.19;
    const lowerHeight = spec.height * 0.38;
    const cabinHeight = spec.height - lowerHeight - 0.17;
    const cabinLength = spec.type === "family-sedan" ? spec.length * 0.50 : spec.length * 0.61;
    const lowerY = wheelRadius + lowerHeight * 0.53;
    const cabinY = wheelRadius + lowerHeight + cabinHeight * 0.48;

    body.push(
      { matrix: makeMatrix(THREE, placement, [0, lowerY, 0], [spec.width, lowerHeight, spec.length * 0.91]) },
      { matrix: makeMatrix(THREE, placement, [0, wheelRadius + lowerHeight * 0.88, -spec.length * 0.39], [spec.width * 0.95, lowerHeight * 0.37, spec.length * 0.18]) },
      { matrix: makeMatrix(THREE, placement, [0, wheelRadius + lowerHeight * 0.87, spec.length * 0.39], [spec.width * 0.94, lowerHeight * 0.34, spec.length * 0.16]) },
      { matrix: makeMatrix(THREE, placement, [0, cabinY, spec.cabinZ], [spec.width * 0.84, cabinHeight, cabinLength]) }
    );

    const sideX = spec.width * 0.427;
    const sideWindowLength = cabinLength * 0.37;
    [-1, 1].forEach((side) => {
      [-0.22, 0.22].forEach((zFactor) => {
        glass.push({
          matrix: makeMatrix(THREE, placement, [side * sideX, cabinY + cabinHeight * 0.05, spec.cabinZ + zFactor * cabinLength], [0.025, cabinHeight * 0.52, sideWindowLength]),
        });
      });
      trim.push({
        matrix: makeMatrix(THREE, placement, [side * (spec.width * 0.51), lowerY + lowerHeight * 0.18, -spec.length * 0.23], [0.075, 0.13, 0.17]),
      });
    });
    glass.push(
      { matrix: makeMatrix(THREE, placement, [0, cabinY + cabinHeight * 0.03, spec.cabinZ - cabinLength * 0.505], [spec.width * 0.70, cabinHeight * 0.54, 0.025], [-0.17, 0, 0]) },
      { matrix: makeMatrix(THREE, placement, [0, cabinY + cabinHeight * 0.02, spec.cabinZ + cabinLength * 0.505], [spec.width * 0.69, cabinHeight * 0.51, 0.025], [0.13, 0, 0]) }
    );

    const axleZ = spec.length * 0.32;
    [-1, 1].forEach((side) => {
      [-1, 1].forEach((front) => {
        wheels.push({
          matrix: makeMatrix(THREE, placement, [side * spec.width * 0.48, wheelRadius, front * axleZ], [wheelRadius * 2, wheelWidth, wheelRadius * 2], [0, 0, Math.PI / 2]),
        });
      });
    });

    [-1, 1].forEach((side) => {
      headlights.push({ matrix: makeMatrix(THREE, placement, [side * spec.width * 0.29, lowerY + lowerHeight * 0.05, -spec.length * 0.463], [spec.width * 0.22, lowerHeight * 0.24, 0.035]) });
      taillights.push({ matrix: makeMatrix(THREE, placement, [side * spec.width * 0.31, lowerY + lowerHeight * 0.07, spec.length * 0.463], [spec.width * 0.18, lowerHeight * 0.27, 0.035]) });
    });
    trim.push(
      { matrix: makeMatrix(THREE, placement, [0, wheelRadius + 0.05, -spec.length * 0.467], [spec.width * 0.80, 0.11, 0.055]) },
      { matrix: makeMatrix(THREE, placement, [0, wheelRadius + 0.05, spec.length * 0.467], [spec.width * 0.82, 0.11, 0.055]) }
    );
    plates.push(
      { matrix: makeMatrix(THREE, placement, [0, wheelRadius + 0.24, -spec.length * 0.474], [0.33, 0.16, 0.018]) },
      { matrix: makeMatrix(THREE, placement, [0, wheelRadius + 0.24, spec.length * 0.474], [0.33, 0.16, 0.018]) }
    );

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
  });

  const bodyMeshes = VEHICLE_SPECS.slice(0, placements.length).map((spec, index) => {
    const material = new THREE.MeshPhysicalMaterial({
      color: spec.color,
      roughness: 0.29,
      metalness: 0.14,
      clearcoat: 0.58,
      clearcoatRoughness: 0.22,
      emissive: spec.color,
      emissiveIntensity: 0.10,
    });
    return createBatch(THREE, scene, roundedUnit, material, body.slice(index * 4, index * 4 + 4), `DetailedVehicles:body:${spec.type}`, true);
  }).filter(Boolean);
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0x71858d, roughness: 0.18, metalness: 0.05, emissive: 0x1b282d, emissiveIntensity: 0.24, transparent: true, opacity: 0.76 });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.92, metalness: 0.02 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x292c2e, roughness: 0.56, metalness: 0.42 });
  const headlightMaterial = new THREE.MeshStandardMaterial({ color: 0xd9e1d9, emissive: 0xdce6da, emissiveIntensity: 0.18, roughness: 0.28 });
  const taillightMaterial = new THREE.MeshStandardMaterial({ color: 0x8f1918, emissive: 0x5b0707, emissiveIntensity: 0.15, roughness: 0.34 });
  const plateMaterial = new THREE.MeshStandardMaterial({ color: 0xe4e2d4, roughness: 0.72, metalness: 0.02 });

  const meshes = [
    ...bodyMeshes,
    createBatch(THREE, scene, boxUnit, glassMaterial, glass, "DetailedVehicles:glass"),
    createBatch(THREE, scene, wheelUnit, tireMaterial, wheels, "DetailedVehicles:wheels", true),
    createBatch(THREE, scene, boxUnit, trimMaterial, trim, "DetailedVehicles:trim"),
    createBatch(THREE, scene, boxUnit, headlightMaterial, headlights, "DetailedVehicles:headlights"),
    createBatch(THREE, scene, boxUnit, taillightMaterial, taillights, "DetailedVehicles:taillights"),
    createBatch(THREE, scene, boxUnit, plateMaterial, plates, "DetailedVehicles:plates"),
  ].filter(Boolean);
  return { count: placements.length, variants: placements.map((_, index) => VEHICLE_SPECS[index % VEHICLE_SPECS.length].type), bounds, drawCalls: meshes.length };
}

function createVegetation({ THREE, scene, placements, groundY }) {
  const potGeometry = new THREE.CylinderGeometry(0.38, 0.31, 0.42, 12);
  const trunkGeometry = new THREE.CylinderGeometry(0.055, 0.085, 1, 9);
  const foliageGeometry = new THREE.SphereGeometry(0.5, 12, 8);
  const potEntries = [];
  const trunkEntries = [];
  const foliageEntries = [];
  const bounds = [];

  placements.forEach((rawPlacement, index) => {
    const placement = { ...rawPlacement, groundY };
    const height = 2.20 + (index % 3) * 0.24;
    const canopyY = 1.50 + (index % 2) * 0.10;
    potEntries.push({ matrix: makeMatrix(THREE, placement, [0, 0.21, 0], [1, 1, 1]) });
    trunkEntries.push({ matrix: makeMatrix(THREE, placement, [0, 0.42 + (height - 0.72) / 2, 0], [1, height - 0.72, 1], [0.03 * (index - 1.5), 0, 0.04 * ((index % 2) * 2 - 1)]) });
    const clusters = [
      [0, canopyY + 0.30, 0, 0.78, 0.66, 0.70],
      [-0.34, canopyY + 0.05, 0.06, 0.58, 0.50, 0.55],
      [0.31, canopyY + 0.12, -0.12, 0.57, 0.48, 0.52],
      [0.10, canopyY + 0.55, 0.10, 0.48, 0.45, 0.47],
    ];
    clusters.forEach((cluster, clusterIndex) => {
      foliageEntries.push({
        matrix: makeMatrix(THREE, placement, cluster.slice(0, 3), cluster.slice(3), [0.08 * clusterIndex, index * 0.39 + clusterIndex * 0.31, -0.05 * clusterIndex]),
      });
    });
    bounds.push({
      minX: placement.x - 0.72,
      maxX: placement.x + 0.72,
      minY: groundY,
      maxY: groundY + height,
      minZ: placement.z - 0.72,
      maxZ: placement.z + 0.72,
    });
  });

  const potMaterial = new THREE.MeshStandardMaterial({ color: 0x65615a, roughness: 0.96, metalness: 0.02 });
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x675342, roughness: 1.0, metalness: 0 });
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x66745d, roughness: 0.94, metalness: 0, emissive: 0x66745d, emissiveIntensity: 0.16 });
  const meshes = [
    createBatch(THREE, scene, potGeometry, potMaterial, potEntries, "UrbanVegetation:pots"),
    createBatch(THREE, scene, trunkGeometry, trunkMaterial, trunkEntries, "UrbanVegetation:trunks", true),
    createBatch(THREE, scene, foliageGeometry, foliageMaterial, foliageEntries, "UrbanVegetation:foliage", true),
  ].filter(Boolean);
  return { count: placements.length, bounds, drawCalls: meshes.length };
}

export function createRealisticStreetAssets({ THREE, scene, vehiclePlacements, vegetationPlacements, groundY }) {
  const vehicles = createVehicles({ THREE, scene, placements: vehiclePlacements, groundY });
  const vegetation = createVegetation({ THREE, scene, placements: vegetationPlacements, groundY });
  const diagnostics = {
    vehicles: vehicles.count,
    vehicleVariants: vehicles.variants,
    vegetation: vegetation.count,
    drawCalls: vehicles.drawCalls + vegetation.drawCalls,
  };
  window.__realisticStreetAssetDiagnostics = diagnostics;
  return { diagnostics, vehicleBounds: vehicles.bounds, vegetationBounds: vegetation.bounds };
}
