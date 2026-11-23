import {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {Box, Camera, Compass, Play, Pause, RotateCcw} from 'lucide-react';
import {buildCoolingCoreGroup, buildServerRackGroup, type RackHandle} from '../three/clusterModels';
import {
  createChassisBrushedTexture,
  createContactShadowTexture,
  createDataCenterFloorTextures,
} from '../three/proceduralTextures';
import type {ScalingConfig} from '../types';

interface Cluster3DViewProps {
  activeServers: number;
  maxServers: number;
  cpuUsage: number;
  ramUsage: number;
  predictedCpu: number;
  networkLoad: number;
  trafficMode: string;
  scalingConfig: ScalingConfig;
  onSimulate?: (mode: 'normal' | 'heavy' | 'peak') => void;
  simulating?: boolean;
}

type CameraPreset = 'isometric' | 'core' | 'top';

const PRESET_VIEWS: Record<CameraPreset, {pos: [number, number, number]; target: [number, number, number]}> = {
  isometric: {pos: [13.5, 9.2, 14.8], target: [0, 1.4, 0]},
  core: {pos: [5.4, 3.8, 6.2], target: [0, 2.0, 0]},
  top: {pos: [0.01, 20.5, 6.5], target: [0, 0.5, 0]},
};

function computeRackSlotPosition(index: number, totalSlots: number): THREE.Vector3 {
  const ringCount = Math.min(8, totalSlots);
  if (index < ringCount) {
    const angle = (index / ringCount) * Math.PI * 2;
    const radius = 5.4;
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }
  const outerCount = Math.max(1, totalSlots - ringCount);
  const outerIdx = index - ringCount;
  const angle = (outerIdx / outerCount) * Math.PI * 2 + Math.PI / outerCount;
  const radius = 9.0;
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

export function Cluster3DView({
  activeServers,
  maxServers,
  cpuUsage,
  ramUsage,
  predictedCpu,
  networkLoad,
  trafficMode,
  scalingConfig,
  onSimulate,
  simulating = false,
}: Cluster3DViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const telemetryRef = useRef({
    activeServers,
    maxServers,
    cpuUsage,
    ramUsage,
    predictedCpu,
    networkLoad,
    scaleUpHigh: scalingConfig.scaleUpHigh,
    scaleUpCritical: scalingConfig.scaleUpCritical,
  });

  telemetryRef.current = {
    activeServers,
    maxServers,
    cpuUsage,
    ramUsage,
    predictedCpu,
    networkLoad,
    scaleUpHigh: scalingConfig.scaleUpHigh,
    scaleUpCritical: scalingConfig.scaleUpCritical,
  };

  const [webglError, setWebglError] = useState<string | null>(null);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [selectedRack, setSelectedRack] = useState<number | null>(0);
  const [preset, setPreset] = useState<CameraPreset>('isometric');

  const autoOrbitRef = useRef(true);
  const presetRequestRef = useRef<CameraPreset | null>(null);

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL hardware context is unavailable in this browser.');
      return;
    }

    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererString = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : '';
    const isSoftwareGl = /swiftshader|llvmpipe|softpipe|software|warp/i.test(rendererString);

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 360);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    scene.fog = new THREE.FogExp2(0x0b1220, 0.017);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 120);
    camera.position.set(...PRESET_VIEWS.isometric.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(...PRESET_VIEWS.isometric.target);
    controls.minDistance = 4.5;
    controls.maxDistance = 32;
    controls.maxPolarAngle = Math.PI * 0.47;

    // 3-point + hemisphere studio lighting
    const hemiLight = new THREE.HemisphereLight(0xc7dcff, 0x1e293b, 0.55);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
    keyLight.position.set(11, 18, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(isSoftwareGl ? 1024 : 2048, isSoftwareGl ? 1024 : 2048);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 48;
    keyLight.shadow.camera.left = -15;
    keyLight.shadow.camera.right = 15;
    keyLight.shadow.camera.top = 15;
    keyLight.shadow.camera.bottom = -15;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.85);
    rimLight.position.set(-12, 8, -10);
    scene.add(rimLight);

    // Procedural grounded floor
    const {map: floorMap, roughnessMap: floorRoughMap} = createDataCenterFloorTextures();
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorMap,
      roughnessMap: floorRoughMap,
      roughness: 0.72,
      metalness: 0.18,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const brushedBump = createChassisBrushedTexture();
    const shadowTexture = createContactShadowTexture();

    const coreHandle = buildCoolingCoreGroup(brushedBump);
    scene.add(coreHandle.group);

    // Pre-allocate up to 20 rack slots (bounds maxServers up to 20 visual slots)
    const totalRackCapacity = 20;
    const racks: RackHandle[] = [];
    const conduitLineMat = new THREE.LineBasicMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.75,
    });
    const conduitLines: THREE.Line[] = [];

    for (let i = 0; i < totalRackCapacity; i++) {
      const slotPos = computeRackSlotPosition(i, totalRackCapacity);
      const rack = buildServerRackGroup(i, slotPos, brushedBump, shadowTexture);
      rack.group.lookAt(0, 0, 0);
      scene.add(rack.group);
      racks.push(rack);

      const lineGeo = new THREE.BufferGeometry().setFromPoints(rack.conduitPoints);
      const line = new THREE.Line(lineGeo, conduitLineMat);
      scene.add(line);
      conduitLines.push(line);
    }

    // InstancedMesh for optical data packets streaming along rack-to-core conduits
    const packetCount = 40;
    const packetGeo = new THREE.SphereGeometry(0.085, 8, 8);
    const packetMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 2.0,
      roughness: 0.1,
    });
    const packetInstanced = new THREE.InstancedMesh(packetGeo, packetMat, packetCount);
    scene.add(packetInstanced);

    // Pre-allocated scratch objects for zero-GC animation loop
    const clock = new THREE.Clock();
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const scratchDummy = new THREE.Object3D();
    const scratchVec = new THREE.Vector3();
    const scratchPresetPos = new THREE.Vector3();
    const scratchPresetTarget = new THREE.Vector3();
    const colorHealthy = new THREE.Color(0x10b981);
    const colorHeavy = new THREE.Color(0xf59e0b);
    const colorCritical = new THREE.Color(0xef4444);
    const colorStandby = new THREE.Color(0x334155);
    const activeTargetColor = new THREE.Color();

    const handlePointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(
        racks.map((r) => r.group),
        true,
      );
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && obj.userData.rackIndex === undefined) {
          obj = obj.parent;
        }
        if (obj && typeof obj.userData.rackIndex === 'number') {
          setSelectedRack(obj.userData.rackIndex);
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(
        racks.map((r) => r.group),
        true,
      );
      renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(entry.contentRect.width, 320);
      const h = Math.max(entry.contentRect.height, 360);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    let rafId = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let packetPhase = 0;

    const tick = () => {
      if (cancelled) return;

      const delta = Math.min(clock.getDelta(), 0.05);
      const live = telemetryRef.current;

      // Determine semantic cluster color from active thresholds
      if (live.cpuUsage > live.scaleUpCritical || live.predictedCpu > live.scaleUpCritical) {
        activeTargetColor.copy(colorCritical);
      } else if (live.cpuUsage > live.scaleUpHigh || live.predictedCpu > live.scaleUpHigh) {
        activeTargetColor.copy(colorHeavy);
      } else {
        activeTargetColor.copy(colorHealthy);
      }

      // Update cooling turbine & core torus color
      const turbineSpeed = 1.4 + (live.cpuUsage / 100) * 6.5;
      coreHandle.turbineGroup.rotation.y += turbineSpeed * delta;
      coreHandle.ringMat.color.lerp(activeTargetColor, 1 - Math.exp(-6 * delta));
      coreHandle.ringMat.emissive.copy(coreHandle.ringMat.color);
      coreHandle.ringMat.emissiveIntensity = THREE.MathUtils.damp(
        coreHandle.ringMat.emissiveIntensity,
        1.1 + (live.cpuUsage / 100) * 1.4,
        5,
        delta,
      );

      // Update racks (active vs standby capacity)
      const visibleCapacity = Math.max(
        live.activeServers,
        Math.min(totalRackCapacity, live.maxServers),
      );

      for (let i = 0; i < totalRackCapacity; i++) {
        const rack = racks[i];
        const line = conduitLines[i];
        const inFleetBounds = i < visibleCapacity;
        rack.group.visible = inFleetBounds;
        line.visible = inFleetBounds;
        if (!inFleetBounds) continue;

        const isActive = i < live.activeServers;
        const targetColor = isActive ? activeTargetColor : colorStandby;
        const targetScaleY = isActive
          ? Math.max(0.2, Math.min(1.0, (live.cpuUsage + ((i % 3) - 1) * 4) / 100))
          : 0.08;
        const targetY = isActive ? 0 : -0.18;

        rack.group.position.y = THREE.MathUtils.damp(rack.group.position.y, targetY, 6, delta);
        rack.loadBar.scale.y = THREE.MathUtils.damp(rack.loadBar.scale.y, targetScaleY, 7, delta);
        rack.ledMat.color.lerp(targetColor, 1 - Math.exp(-6 * delta));
        rack.ledMat.emissive.copy(rack.ledMat.color);
        rack.ledMat.emissiveIntensity = isActive ? 1.55 : 0.15;
        rack.beaconMat.color.copy(rack.ledMat.color);
        rack.beaconMat.emissive.copy(rack.ledMat.color);
        rack.beaconMat.emissiveIntensity = isActive ? 1.3 : 0.1;
      }

      // Animate InstancedMesh network packets flowing between active racks and central core
      const packetSpeed = 0.28 + Math.min(1.2, live.networkLoad / 900);
      packetPhase = (packetPhase + packetSpeed * delta) % 1;
      const activeCount = Math.max(1, live.activeServers);

      for (let p = 0; p < packetCount; p++) {
        const rackIdx = p % activeCount;
        const rack = racks[rackIdx];
        const t = (packetPhase + p / packetCount) % 1;
        scratchVec.lerpVectors(rack.conduitPoints[0], rack.conduitPoints[1], t);
        scratchDummy.position.set(scratchVec.x, 0.14 + Math.sin(t * Math.PI) * 0.25, scratchVec.z);
        scratchDummy.scale.setScalar(live.activeServers > 0 ? 1 : 0.001);
        scratchDummy.updateMatrix();
        packetInstanced.setMatrixAt(p, scratchDummy.matrix);
      }
      packetInstanced.instanceMatrix.needsUpdate = true;

      // Smooth preset camera transitions
      if (presetRequestRef.current) {
        const targetPreset = PRESET_VIEWS[presetRequestRef.current];
        scratchPresetPos.set(...targetPreset.pos);
        scratchPresetTarget.set(...targetPreset.target);
        camera.position.lerp(scratchPresetPos, 1 - Math.exp(-5 * delta));
        controls.target.lerp(scratchPresetTarget, 1 - Math.exp(-6 * delta));
        if (camera.position.distanceTo(scratchPresetPos) < 0.08) {
          presetRequestRef.current = null;
        }
      } else if (autoOrbitRef.current) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.65;
      } else {
        controls.autoRotate = false;
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        timeoutId = setTimeout(() => {
          if (!cancelled) rafId = requestAnimationFrame(tick);
        }, 90);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      controls.dispose();

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry?.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            mat?.dispose();
          }
        }
      });
      floorMap.dispose();
      floorRoughMap.dispose();
      brushedBump.dispose();
      shadowTexture.dispose();
      envTarget.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
    };
  }, []);

  function applyPreset(next: CameraPreset) {
    setPreset(next);
    presetRequestRef.current = next;
  }

  const inspectedIndex = selectedRack ?? 0;
  const inspectedActive = inspectedIndex < activeServers;
  const loadStatusText =
    cpuUsage > scalingConfig.scaleUpCritical
      ? 'Critical Load'
      : cpuUsage > scalingConfig.scaleUpHigh
        ? 'Scale-Up Active'
        : 'Healthy';

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {/* Header strip above WebGL viewport */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Interactive 3D Data Center Cluster Topology
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
              {activeServers} active racks · {Math.min(20, maxServers)} provisioned slots · CPU {cpuUsage.toFixed(1)}% · Network {networkLoad.toFixed(0)} Mbps · {loadStatusText}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onSimulate && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={simulating}
                  onClick={() => onSimulate('normal')}
                  className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Normal
                </button>
                <button
                  type="button"
                  disabled={simulating}
                  onClick={() => onSimulate('heavy')}
                  className="px-2.5 py-1.5 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/70 text-xs font-medium text-amber-900 dark:text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Heavy
                </button>
                <button
                  type="button"
                  disabled={simulating}
                  onClick={() => onSimulate('peak')}
                  className="px-2.5 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Peak Burst
                </button>
              </div>
            )}
            <div className="text-xs font-medium text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              Mode: {trafficMode} · RAM {ramUsage.toFixed(1)}% · Forecast {predictedCpu.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* 3D Canvas Stage */}
        <div className="relative w-full h-[540px] bg-slate-950">
          {webglError ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-300">
              <Box className="w-8 h-8 text-slate-500 mb-3" />
              <div className="font-display text-base font-semibold mb-1">3D Viewport Unavailable</div>
              <p className="text-xs text-slate-400 max-w-md">{webglError}</p>
            </div>
          ) : (
            <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
          )}

          {/* Compact Opaque Bottom Control Dock (No backdrop-blur over WebGL, <=12% height) */}
          {!webglError && (
            <div className="absolute bottom-3 left-3 right-3 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-200">
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span className="font-semibold text-white">
                  Node-{String(inspectedIndex + 1).padStart(2, '0')}
                </span>
                <span className="text-slate-500" aria-hidden="true">·</span>
                <span className={inspectedActive ? 'text-emerald-400' : 'text-slate-400'}>
                  {inspectedActive ? 'Online (Serving)' : 'Standby Pool'}
                </span>
                <span className="text-slate-500 hidden sm:inline" aria-hidden="true">·</span>
                <span className="hidden sm:inline text-slate-300">
                  {inspectedActive ? `Est. Load ${cpuUsage.toFixed(1)}% · ₹10/hr` : '₹0/hr (Idle)'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset('isometric')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    preset === 'isometric'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Isometric</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('core')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    preset === 'core'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Core Hub</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('top')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    preset === 'top'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Top Array</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoOrbit((prev) => !prev)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  {autoOrbit ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{autoOrbit ? 'Pause Orbit' : 'Auto Orbit'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
