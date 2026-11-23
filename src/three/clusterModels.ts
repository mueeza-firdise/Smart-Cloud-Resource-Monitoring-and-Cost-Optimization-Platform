import * as THREE from 'three';

export interface RackHandle {
  index: number;
  group: THREE.Group;
  ledMat: THREE.MeshStandardMaterial;
  loadBar: THREE.Mesh;
  beaconMat: THREE.MeshStandardMaterial;
  targetPos: THREE.Vector3;
  conduitPoints: [THREE.Vector3, THREE.Vector3];
}

export interface CoreHandle {
  group: THREE.Group;
  turbineGroup: THREE.Group;
  ringMat: THREE.MeshStandardMaterial;
}

export function buildCoolingCoreGroup(brushedBump: THREE.CanvasTexture): CoreHandle {
  const group = new THREE.Group();
  group.name = 'CoolingPowerCore';

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.82,
    roughness: 0.28,
    bumpMap: brushedBump,
    bumpScale: 0.008,
  });

  const darkAlloyMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.65,
    roughness: 0.42,
  });

  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xb45309,
    metalness: 0.88,
    roughness: 0.24,
  });

  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x2563eb,
    emissive: 0x2563eb,
    emissiveIntensity: 1.4,
    metalness: 0.3,
    roughness: 0.2,
  });

  // 1. Base octagonal plinth seated flush on y=0
  const basePlinth = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.55, 0.36, 8), darkAlloyMat);
  basePlinth.position.y = 0.18;
  basePlinth.castShadow = true;
  basePlinth.receiveShadow = true;
  group.add(basePlinth);

  // 2. Stepped brushed collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.0, 0.42, 16), metalMat);
  collar.position.y = 0.57;
  collar.castShadow = true;
  collar.receiveShadow = true;
  group.add(collar);

  // 3. Central glass-shrouded telemetry column
  const coreColumn = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 2.5, 24), darkAlloyMat);
  coreColumn.position.y = 2.02;
  coreColumn.castShadow = true;
  group.add(coreColumn);

  // 4. Illuminated status torus ring
  const statusRing = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.075, 16, 48), ringMat);
  statusRing.rotation.x = Math.PI / 2;
  statusRing.position.y = 2.4;
  group.add(statusRing);

  const lowerRing = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.055, 16, 48), ringMat);
  lowerRing.rotation.x = Math.PI / 2;
  lowerRing.position.y = 1.25;
  group.add(lowerRing);

  // 5. Four exterior coolant manifold riser pipes
  const pipeGeo = new THREE.CylinderGeometry(0.11, 0.11, 2.35, 12);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const pipe = new THREE.Mesh(pipeGeo, copperMat);
    pipe.position.set(Math.cos(angle) * 1.48, 1.9, Math.sin(angle) * 1.48);
    pipe.castShadow = true;
    group.add(pipe);
  }

  // 6. Top turbine shroud + animated rotor assembly
  const topCap = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.35, 0.34, 16), metalMat);
  topCap.position.y = 3.42;
  topCap.castShadow = true;
  group.add(topCap);

  const turbineGroup = new THREE.Group();
  turbineGroup.position.y = 3.66;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.22, 16), copperMat);
  turbineGroup.add(hub);

  const bladeGeo = new THREE.BoxGeometry(0.95, 0.05, 0.22);
  for (let b = 0; b < 6; b++) {
    const bladePivot = new THREE.Group();
    bladePivot.rotation.y = (b * Math.PI) / 3;
    const blade = new THREE.Mesh(bladeGeo, metalMat);
    blade.position.set(0.62, 0, 0);
    blade.rotation.x = 0.32;
    bladePivot.add(blade);
    turbineGroup.add(bladePivot);
  }
  group.add(turbineGroup);

  return {group, turbineGroup, ringMat};
}

export function buildServerRackGroup(
  index: number,
  targetPos: THREE.Vector3,
  brushedBump: THREE.CanvasTexture,
  shadowTexture: THREE.CanvasTexture,
): RackHandle {
  const group = new THREE.Group();
  group.name = `ServerRack_${index + 1}`;
  group.position.copy(targetPos);

  const rackMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.72,
    roughness: 0.34,
    bumpMap: brushedBump,
    bumpScale: 0.006,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.85,
    roughness: 0.26,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x090d16,
    metalness: 0.1,
    roughness: 0.14,
    clearcoat: 0.85,
    clearcoatRoughness: 0.15,
  });

  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 1.5,
    roughness: 0.25,
  });

  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 1.2,
    roughness: 0.2,
  });

  // Ground contact shadow decal
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 2.1),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.008;
  group.add(contactShadow);

  // 1. Plinth feet / base frame seated flush on y=0
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.14, 1.16), trimMat);
  base.position.y = 0.07;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // 2. Main steel enclosure body
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.06, 2.35, 1.06), rackMat);
  cabinet.position.y = 1.315;
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  cabinet.userData.rackIndex = index;
  group.add(cabinet);

  // 3. Recessed front glass bezel
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.86, 2.08, 0.06), glassMat);
  bezel.position.set(0, 1.31, 0.52);
  bezel.userData.rackIndex = index;
  group.add(bezel);

  // 4. Four blade server drawer ribs across front
  const bladeGeo = new THREE.BoxGeometry(0.76, 0.12, 0.04);
  for (let row = 0; row < 4; row++) {
    const blade = new THREE.Mesh(bladeGeo, trimMat);
    blade.position.set(0, 0.65 + row * 0.42, 0.55);
    group.add(blade);
  }

  // 5. Dynamic vertical load meter strip along right bezel rail
  const loadBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.85, 0.05), ledMat);
  loadBar.position.set(0.37, 1.31, 0.555);
  group.add(loadBar);

  // 6. Top ventilation louver hood & status beacon cap
  const exhaustHood = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.16, 1.12), trimMat);
  exhaustHood.position.y = 2.57;
  exhaustHood.castShadow = true;
  group.add(exhaustHood);

  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.18), beaconMat);
  beacon.position.set(0, 2.69, 0.28);
  group.add(beacon);

  const conduitStart = new THREE.Vector3(targetPos.x, 0.08, targetPos.z);
  const conduitEnd = new THREE.Vector3(0, 0.08, 0);

  return {
    index,
    group,
    ledMat,
    loadBar,
    beaconMat,
    targetPos,
    conduitPoints: [conduitStart, conduitEnd],
  };
}
