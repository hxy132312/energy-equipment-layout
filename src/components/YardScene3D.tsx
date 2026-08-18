import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EQUIPMENT_SPECS } from "../data/equipment";
import {
  getBoundaryWorldPoints,
  getTerrainColor,
  getTerrainElevation,
  getTerrainElevationRange,
  getTerrainIntensity,
  getTerrainSceneLabel,
  isTerrainPointEnabled,
} from "../lib/fieldGeometry";
import type { Device, LayoutCandidate, LayoutParams, Rect as LayoutRect } from "../lib/layoutEngine";

interface SceneLayers {
  safety: boolean;
  pipelines: boolean;
  roads: boolean;
  forbidden: boolean;
  labels: boolean;
  heatmap: boolean;
}

interface YardScene3DProps {
  candidate: LayoutCandidate;
  layers: SceneLayers;
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root: THREE.Group;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  frameId: number;
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 640;
const DEVICE_HEIGHT: Record<Device["type"], number> = {
  wellhead: 7.5,
  manifold: 5.4,
  fracPump: 4.2,
  blender: 4.8,
  sandTank: 8.4,
  waterTank: 8.8,
  additiveSkid: 4.6,
  generator: 4.2,
  controlCabin: 4.5,
  fireZone: 3.4,
};

export function YardScene3D({ candidate, layers, selectedDeviceId, onSelectDevice }: YardScene3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const refs = useRef<SceneRefs | null>(null);
  const terrainLabel = useMemo(() => getTerrainSceneLabel(candidate.params), [candidate.params]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#08111f");
    scene.fog = new THREE.Fog("#08111f", 160, 360);

    const camera = new THREE.PerspectiveCamera(42, CANVAS_WIDTH / CANVAS_HEIGHT, 0.1, 1200);
    camera.position.set(65, 78, 110);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "scene3d-canvas";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 60;
    controls.maxDistance = 260;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 0, 0);

    const root = new THREE.Group();
    scene.add(root);
    addSceneLights(scene);

    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      refs.current!.frameId = window.requestAnimationFrame(render);
    };

    refs.current = {
      renderer,
      scene,
      camera,
      controls,
      root,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      frameId: window.requestAnimationFrame(render),
    };

    return () => {
      if (!refs.current) return;
      window.cancelAnimationFrame(refs.current.frameId);
      refs.current.controls.dispose();
      disposeGroup(refs.current.root);
      refs.current.scene.clear();
      refs.current.renderer.dispose();
      refs.current.renderer.domElement.remove();
      refs.current = null;
    };
  }, []);

  useEffect(() => {
    const sceneRefs = refs.current;
    if (!sceneRefs) return;
    rebuildScene(sceneRefs.root, candidate, layers, selectedDeviceId, terrainLabel);
    fitCamera(sceneRefs.camera, sceneRefs.controls, candidate.params);
  }, [candidate, layers, selectedDeviceId, terrainLabel]);

  return (
    <div className="scene3d-shell">
      <div
        ref={mountRef}
        className="scene3d-mount"
        role="img"
        aria-label="压裂井场三维模型"
        onClick={(event) => {
          const sceneRefs = refs.current;
          if (!sceneRefs) return;
          const rect = sceneRefs.renderer.domElement.getBoundingClientRect();
          sceneRefs.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          sceneRefs.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          sceneRefs.raycaster.setFromCamera(sceneRefs.pointer, sceneRefs.camera);
          const hit = sceneRefs.raycaster.intersectObjects(sceneRefs.root.children, true).find((item) => findDeviceId(item.object));
          const deviceId = hit ? findDeviceId(hit.object) : null;
          if (deviceId) onSelectDevice(deviceId);
        }}
      />
      <div className="scene3d-hud">
        <strong>{terrainLabel}</strong>
        <span>高程色带 / 等高线图 / 环境优化布置</span>
      </div>
    </div>
  );
}

function rebuildScene(root: THREE.Group, candidate: LayoutCandidate, layers: SceneLayers, selectedDeviceId: string | null, terrainLabel: string) {
  disposeGroup(root);
  root.clear();

  root.add(createTerrain(candidate.params));
  root.add(createBoundaryLine(candidate.params));
  root.add(createTerrainLegend(terrainLabel, candidate.params));

  if (layers.roads) candidate.roads.forEach((road) => root.add(createRoadLayer(road, candidate.params)));
  if (layers.forbidden) candidate.forbiddenZones.forEach((zone) => root.add(createRectLayer(zone, candidate.params, "#8f1d24", 0.48, 0.12)));
  if (layers.heatmap) candidate.heatZones.forEach((zone) => root.add(createRectLayer(zone, candidate.params, "#e11d48", 0.26 + zone.intensity * 0.24, 0.18)));
  if (layers.safety) candidate.devices.forEach((device) => root.add(createSafetyDisk(device, candidate, device.id === selectedDeviceId)));

  candidate.devices.forEach((device) => {
    root.add(createDeviceModel(device, candidate.params, device.id === selectedDeviceId));
    if (layers.labels || device.id === selectedDeviceId) root.add(createLabelSprite(device, candidate.params, device.id === selectedDeviceId));
  });

  if (layers.pipelines) createPipelineGroup(candidate).forEach((line) => root.add(line));
}

function addSceneLights(scene: THREE.Scene) {
  const ambient = new THREE.HemisphereLight("#dff6ff", "#07111f", 1.8);
  scene.add(ambient);

  const key = new THREE.DirectionalLight("#ffffff", 2.8);
  key.position.set(-56, 120, 78);
  key.castShadow = true;
  key.shadow.camera.left = -150;
  key.shadow.camera.right = 150;
  key.shadow.camera.top = 150;
  key.shadow.camera.bottom = -150;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);

  const rim = new THREE.DirectionalLight("#38bdf8", 1.3);
  rim.position.set(120, 60, -90);
  scene.add(rim);
}

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, params: LayoutParams) {
  const maxSide = Math.max(params.fieldWidth, params.fieldHeight);
  camera.position.set(maxSide * 0.62, maxSide * 0.58, maxSide * 0.88);
  controls.target.set(0, 0, 0);
  controls.update();
}

function createTerrain(params: LayoutParams) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  getBoundaryWorldPoints(params).forEach(([x, y], index) => {
    const px = x - params.fieldWidth / 2;
    const py = y - params.fieldHeight / 2;
    if (index === 0) shape.moveTo(px, -py);
    else shape.lineTo(px, -py);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: params.shape === "trapezoid" ? "#173829" : params.shape === "notched" ? "#17313a" : "#102d27",
    roughness: 0.86,
    metalness: 0.04,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -1.8;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  group.add(mesh);
  group.add(createTerrainPatches(params));
  group.add(createContourLines(params));

  const grid = new THREE.GridHelper(
    Math.max(params.fieldWidth, params.fieldHeight),
    Math.ceil(Math.max(params.fieldWidth, params.fieldHeight) / 10),
    "#31556c",
    "#1c3343",
  );
  grid.position.y = 0.06;
  group.add(grid);

  for (let y = 8; y < params.fieldHeight; y += 14) {
    const points: THREE.Vector3[] = [];
    for (let x = 4; x <= params.fieldWidth - 4; x += 8) {
      if (!terrainCellEnabled(x, y, params)) continue;
      points.push(worldToVector({ x, y, z: terrainZ(x, y, params) + 0.12 }, params));
    }
    if (points.length > 1) group.add(createLine(points, "#7dd3fc", 0.28));
  }

  return group;
}

function createTerrainPatches(params: LayoutParams) {
  const group = new THREE.Group();
  const columns = 30;
  const rows = 22;
  const cellWidth = params.fieldWidth / columns;
  const cellHeight = params.fieldHeight / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const rect = { x: column * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight };
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      if (!terrainCellEnabled(centerX, centerY, params)) continue;
      const corners = [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.width, y: rect.y },
        { x: rect.x + rect.width, y: rect.y + rect.height },
        { x: rect.x, y: rect.y + rect.height },
      ];
      if (corners.some((point) => !isTerrainPointEnabled(point.x, point.y, params))) continue;

      const vertices = corners.flatMap((point) => {
        const vector = worldToVector({ x: point.x, y: point.y, z: terrainZ(point.x, point.y, params) + 0.1 }, params);
        return [vector.x, vector.y, vector.z];
      });
      const patch = new THREE.BufferGeometry();
      patch.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      patch.setIndex([0, 1, 2, 0, 2, 3]);
      patch.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: getTerrainColor(getTerrainIntensity(centerX, centerY, params), params),
        roughness: 0.9,
        metalness: 0.03,
        transparent: true,
        opacity: 0.76,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(patch, material);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  return group;
}

function createContourLines(params: LayoutParams) {
  const group = new THREE.Group();
  const range = getTerrainElevationRange(params);
  const levels = 8;
  const columns = 46;
  const rows = 34;
  const stepX = params.fieldWidth / columns;
  const stepY = params.fieldHeight / rows;

  for (let index = 1; index < levels; index += 1) {
    const level = range.min + ((range.max - range.min) * index) / levels;
    const segments: THREE.Vector3[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const corners = [
          contourPoint(column * stepX, row * stepY, params),
          contourPoint((column + 1) * stepX, row * stepY, params),
          contourPoint((column + 1) * stepX, (row + 1) * stepY, params),
          contourPoint(column * stepX, (row + 1) * stepY, params),
        ];
        if (corners.some((point) => !point.enabled)) continue;
        const hits = [
          interpolateContour(corners[0], corners[1], level),
          interpolateContour(corners[1], corners[2], level),
          interpolateContour(corners[2], corners[3], level),
          interpolateContour(corners[3], corners[0], level),
        ].filter(Boolean) as Point3[];
        if (hits.length === 2) segments.push(worldToVector({ ...hits[0], z: level + 0.42 }, params), worldToVector({ ...hits[1], z: level + 0.42 }, params));
        if (hits.length === 4) {
          segments.push(worldToVector({ ...hits[0], z: level + 0.42 }, params), worldToVector({ ...hits[1], z: level + 0.42 }, params));
          segments.push(worldToVector({ ...hits[2], z: level + 0.42 }, params), worldToVector({ ...hits[3], z: level + 0.42 }, params));
        }
      }
    }
    if (segments.length) {
      const geometry = new THREE.BufferGeometry().setFromPoints(segments);
      const material = new THREE.LineBasicMaterial({ color: index % 2 === 0 ? "#fef3c7" : "#d9f99d", transparent: true, opacity: index % 2 === 0 ? 0.7 : 0.48 });
      group.add(new THREE.LineSegments(geometry, material));
    }
  }

  return group;
}

function createRoadLayer(road: LayoutRect, params: LayoutParams) {
  const group = createRectLayer(road, params, "#334155", 0.88, 0.08);
  const horizontal = road.width >= road.height;
  const stripeCount = Math.max(1, Math.floor((horizontal ? road.width : road.height) / 22));
  for (let index = 0; index < stripeCount; index += 1) {
    const ratio = (index + 0.5) / stripeCount;
    const stripe = horizontal
      ? [
          worldToVector({ x: road.x + road.width * ratio - 3.2, y: road.y + road.height / 2, z: terrainZ(road.x + road.width * ratio, road.y + road.height / 2, params) + 0.22 }, params),
          worldToVector({ x: road.x + road.width * ratio + 3.2, y: road.y + road.height / 2, z: terrainZ(road.x + road.width * ratio, road.y + road.height / 2, params) + 0.22 }, params),
        ]
      : [
          worldToVector({ x: road.x + road.width / 2, y: road.y + road.height * ratio - 3.2, z: terrainZ(road.x + road.width / 2, road.y + road.height * ratio, params) + 0.22 }, params),
          worldToVector({ x: road.x + road.width / 2, y: road.y + road.height * ratio + 3.2, z: terrainZ(road.x + road.width / 2, road.y + road.height * ratio, params) + 0.22 }, params),
        ];
    group.add(createLine(stripe, "#cbd5e1", 0.58));
  }
  return group;
}

function createBoundaryLine(params: LayoutParams) {
  const boundary = getBoundaryWorldPoints(params).map(([x, y]) => worldToVector({ x, y, z: terrainZ(x, y, params) + 0.28 }, params));
  boundary.push(boundary[0].clone());
  return createLine(boundary, "#e0f2fe", 0.95);
}

function contourPoint(x: number, y: number, params: LayoutParams) {
  return { x, y, z: terrainZ(x, y, params), enabled: isTerrainPointEnabled(x, y, params) };
}

function interpolateContour(a: Point3 & { enabled: boolean }, b: Point3 & { enabled: boolean }, level: number): Point3 | null {
  const da = a.z - level;
  const db = b.z - level;
  if (da === 0) return { x: a.x, y: a.y, z: level };
  if (db === 0) return { x: b.x, y: b.y, z: level };
  if ((da > 0 && db > 0) || (da < 0 && db < 0)) return null;
  const ratio = (level - a.z) / (b.z - a.z);
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
    z: level,
  };
}

function createRectLayer(rect: LayoutRect, params: LayoutParams, color: string, opacity: number, lift: number) {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(rect.width, rect.height);
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.72,
    side: THREE.DoubleSide,
    depthWrite: opacity > 0.6,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(rectCenterVector(rect, params, lift));
  mesh.receiveShadow = true;
  group.add(mesh);

  const edges = new THREE.EdgesGeometry(geometry);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: "#dbeafe", transparent: true, opacity: Math.min(opacity + 0.28, 0.92) }));
  line.rotation.copy(mesh.rotation);
  line.position.copy(mesh.position);
  group.add(line);
  return group;
}

function createSafetyDisk(device: Device, candidate: LayoutCandidate, selected: boolean) {
  const warning = candidate.violations.some((violation) => violation.deviceIds.includes(device.id));
  const radius = Math.max(device.width, device.height) / 2 + device.safetyDistance;
  const geometry = new THREE.CircleGeometry(radius, 64);
  const material = new THREE.MeshBasicMaterial({
    color: warning ? "#dc2626" : "#16a34a",
    transparent: true,
    opacity: selected ? 0.2 : warning ? 0.15 : 0.09,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const disk = new THREE.Mesh(geometry, material);
  disk.rotation.x = -Math.PI / 2;
  disk.position.copy(rectCenterVector(device, candidate.params, 0.2));
  return disk;
}

function createDeviceModel(device: Device, params: LayoutParams, selected: boolean) {
  const group = new THREE.Group();
  group.userData.deviceId = device.id;
  const baseY = terrainZ(device.x + device.width / 2, device.y + device.height / 2, params);
  group.position.copy(worldToVector({ x: device.x + device.width / 2, y: device.y + device.height / 2, z: baseY }, params));

  const color = new THREE.Color(device.color);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.14 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.68), roughness: 0.68, metalness: 0.18 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: selected ? "#ffffff" : "#dbeafe", emissive: selected ? "#60a5fa" : "#000000", emissiveIntensity: selected ? 0.35 : 0 });

  if (device.type === "sandTank" || device.type === "waterTank") {
    addCylinder(group, Math.min(device.width, device.height) * 0.42, DEVICE_HEIGHT[device.type], material);
    addBox(group, device.width * 0.85, 0.35, device.height * 0.85, darkMaterial, 0.18);
    addCylinder(group, Math.min(device.width, device.height) * 0.3, 0.34, darkMaterial, DEVICE_HEIGHT[device.type] + 0.18);
    addBox(group, 0.34, DEVICE_HEIGHT[device.type] * 0.72, 0.24, accentMaterial, DEVICE_HEIGHT[device.type] * 0.5, device.width * 0.43, -device.height * 0.12);
  } else if (device.type === "fracPump") {
    addBox(group, device.width, DEVICE_HEIGHT.fracPump * 0.54, device.height, material, DEVICE_HEIGHT.fracPump * 0.28);
    addBox(group, device.width * 0.26, DEVICE_HEIGHT.fracPump * 0.78, device.height * 0.78, darkMaterial, DEVICE_HEIGHT.fracPump * 0.68, -device.width * 0.28);
    addConnectorRow(group, device.width, device.height, accentMaterial);
    addWheelSet(group, device.width, device.height, darkMaterial);
    addHorizontalCylinder(group, device.width * 0.62, 0.22, darkMaterial, 1.18, device.width * 0.1, device.height * 0.42, "x");
  } else if (device.type === "wellhead") {
    addCylinder(group, device.width * 0.42, 1.2, material);
    addCylinder(group, device.width * 0.16, DEVICE_HEIGHT.wellhead, darkMaterial, DEVICE_HEIGHT.wellhead / 2);
    addBox(group, device.width * 0.75, 0.32, device.height * 0.16, accentMaterial, 1.2);
    addBox(group, device.width * 0.16, 0.32, device.height * 0.75, accentMaterial, 1.2);
    addCylinder(group, device.width * 0.22, 0.5, accentMaterial, DEVICE_HEIGHT.wellhead + 0.25);
    addValveWheel(group, DEVICE_HEIGHT.wellhead * 0.66, accentMaterial);
  } else if (device.type === "manifold") {
    addBox(group, device.width, DEVICE_HEIGHT.manifold * 0.46, device.height, material, DEVICE_HEIGHT.manifold * 0.24);
    addConnectorRow(group, device.width, device.height, accentMaterial);
    addBox(group, device.width * 0.92, 0.38, device.height * 0.18, darkMaterial, DEVICE_HEIGHT.manifold * 0.62);
    [-0.3, 0, 0.3].forEach((ratio) => addHorizontalCylinder(group, device.width * 0.82, 0.26, accentMaterial, DEVICE_HEIGHT.manifold * 0.78, 0, device.height * ratio, "x"));
  } else if (device.type === "fireZone") {
    addBox(group, device.width, 0.32, device.height, new THREE.MeshStandardMaterial({ color: "#dc2626", transparent: true, opacity: 0.45 }), 0.18);
    addBox(group, device.width * 0.82, 1.8, device.height * 0.18, material, 1);
    [-0.34, 0.34].forEach((ratio) => addCone(group, 0.9, 2.6, material, 1.3, device.width * ratio, device.height * 0.3));
  } else {
    addBox(group, device.width, DEVICE_HEIGHT[device.type], device.height, material, DEVICE_HEIGHT[device.type] / 2);
    addBox(group, device.width * 0.82, 0.28, device.height * 0.82, darkMaterial, DEVICE_HEIGHT[device.type] + 0.16);
    if (device.type === "generator" || device.type === "controlCabin") {
      addVentRows(group, device.width, device.height, DEVICE_HEIGHT[device.type], accentMaterial);
      addWheelSet(group, device.width, device.height, darkMaterial);
    }
    if (device.type === "blender" || device.type === "additiveSkid") {
      addHorizontalCylinder(group, device.width * 0.72, 0.28, accentMaterial, DEVICE_HEIGHT[device.type] * 0.68, 0, -device.height * 0.44, "x");
    }
  }

  if (selected) {
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(device.width, device.height) * 0.55, Math.max(device.width, device.height) * 0.68, 48),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.22;
    group.add(halo);
  }

  group.traverse((object) => {
    object.userData.deviceId = device.id;
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  return group;
}

function createPipelineGroup(candidate: LayoutCandidate) {
  const byId = new Map(candidate.devices.map((device) => [device.id, device]));
  return candidate.devices.flatMap((device) =>
    device.connectsTo.flatMap((targetId) => {
      const target = byId.get(targetId);
      if (!target) return [];
      const route = connectionRoute(device, target, candidate.params).map((point) => worldToVector(point, candidate.params));
      const curve = new THREE.CatmullRomCurve3(route, false, "catmullrom", 0.08);
      const highPressure = device.type === "fracPump" || target.type === "manifold" || target.type === "wellhead";
      const geometry = new THREE.TubeGeometry(curve, 12, highPressure ? 0.35 : 0.24, 8, false);
      const material = new THREE.MeshStandardMaterial({
        color: highPressure ? "#fb7185" : "#22d3ee",
        emissive: highPressure ? "#7f1d1d" : "#155e75",
        emissiveIntensity: 0.32,
        roughness: 0.42,
        metalness: 0.18,
      });
      const group = new THREE.Group();
      const pipe = new THREE.Mesh(geometry, material);
      pipe.castShadow = true;
      group.add(pipe);
      route.slice(1, -1).forEach((point) => {
        addPipeSupport(group, point, highPressure);
      });
      return [group];
    }),
  );
}

function createLabelSprite(device: Device, params: LayoutParams, selected: boolean) {
  const texture = createTextTexture(EQUIPMENT_SPECS[device.type].shortLabel, selected);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  const scale = selected ? 12 : 9;
  sprite.scale.set(scale * 1.6, scale * 0.72, 1);
  sprite.position.copy(
    worldToVector(
      {
        x: device.x + device.width / 2,
        y: device.y + device.height / 2,
        z: terrainZ(device.x + device.width / 2, device.y + device.height / 2, params) + DEVICE_HEIGHT[device.type] + 3,
      },
      params,
    ),
  );
  sprite.userData.deviceId = device.id;
  return sprite;
}

function createTerrainLegend(text: string, params: LayoutParams) {
  const texture = createTextTexture(text, false, 360);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, opacity: 0.92 });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(36, 7.2, 1);
  sprite.position.copy(worldToVector({ x: params.fieldWidth * 0.16, y: 7, z: 11 }, params));
  return sprite;
}

function createTextTexture(text: string, selected: boolean, width = 180) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 72;
  const context = canvas.getContext("2d")!;
  context.fillStyle = selected ? "rgba(15, 143, 112, 0.92)" : "rgba(7, 17, 31, 0.82)";
  roundRect(context, 4, 8, width - 8, 48, 12);
  context.fill();
  context.strokeStyle = selected ? "#ffffff" : "rgba(203, 213, 225, 0.48)";
  context.lineWidth = selected ? 3 : 2;
  context.stroke();
  context.fillStyle = "#f8fafc";
  context.font = `700 ${selected ? 26 : 23}px Microsoft YaHei UI, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addBox(group: THREE.Group, width: number, height: number, depth: number, material: THREE.Material, y: number, x = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
}

function addCylinder(group: THREE.Group, radius: number, height: number, material: THREE.Material, y = height / 2) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 32), material);
  mesh.position.y = y;
  group.add(mesh);
}

function addHorizontalCylinder(group: THREE.Group, length: number, radius: number, material: THREE.Material, y: number, x: number, z: number, axis: "x" | "z") {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 20), material);
  mesh.rotation[axis === "x" ? "z" : "x"] = Math.PI / 2;
  mesh.position.set(x, y, z);
  group.add(mesh);
}

function addCone(group: THREE.Group, radius: number, height: number, material: THREE.Material, y: number, x: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 24), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
}

function addWheelSet(group: THREE.Group, width: number, depth: number, material: THREE.Material) {
  [-0.34, 0.34].forEach((xRatio) => {
    [-0.58, 0.58].forEach((zRatio) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.42, 20), material);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(width * xRatio, 0.58, depth * zRatio);
      group.add(wheel);
    });
  });
}

function addValveWheel(group: THREE.Group, y: number, material: THREE.Material) {
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.08, 8, 28), material);
  wheel.rotation.x = Math.PI / 2;
  wheel.position.set(0, y, 0);
  group.add(wheel);
}

function addVentRows(group: THREE.Group, width: number, depth: number, height: number, material: THREE.Material) {
  [-0.24, 0, 0.24].forEach((offset) => {
    addBox(group, width * 0.58, 0.08, 0.12, material, height * (0.46 + offset), 0, -depth / 2 - 0.04);
  });
}

function addPipeSupport(group: THREE.Group, point: THREE.Vector3, highPressure: boolean) {
  const material = new THREE.MeshStandardMaterial({ color: highPressure ? "#fecdd3" : "#cffafe", roughness: 0.6, metalness: 0.12 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, Math.max(point.y - 0.35, 0.6), 10), material);
  post.position.set(point.x, Math.max(point.y / 2, 0.3), point.z);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.42), material);
  saddle.position.set(point.x, point.y - 0.32, point.z);
  group.add(post, saddle);
}

function addConnectorRow(group: THREE.Group, width: number, depth: number, material: THREE.Material) {
  [-0.32, 0, 0.32].forEach((ratio) => {
    const connector = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), material);
    connector.position.set(width * ratio, 1.4, -depth / 2 - 0.35);
    group.add(connector);
  });
}

function createLine(points: THREE.Vector3[], color: string, opacity: number) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geometry, material);
}

function connectionRoute(source: Device, target: Device, params: LayoutParams): Point3[] {
  const start = deviceAnchor(source, params);
  const end = deviceAnchor(target, params);
  const corridorX = nearestCorridorX((start.x + end.x) / 2, params);
  const z = Math.max(start.z, end.z) + 1.2;
  const first = { x: start.x, y: start.y, z };
  const second = { x: corridorX, y: start.y, z: terrainZ(corridorX, start.y, params) + zOffsetForLine(source, target) };
  const third = { x: corridorX, y: end.y, z: terrainZ(corridorX, end.y, params) + zOffsetForLine(source, target) };
  const fourth = { x: end.x, y: end.y, z };
  const directEnough = Math.abs(start.x - end.x) < params.fieldWidth * 0.08 || Math.abs(start.y - end.y) < params.fieldHeight * 0.08;
  return directEnough ? [start, fourth] : [first, second, third, fourth];
}

function deviceAnchor(device: Device, params: LayoutParams): Point3 {
  const x = device.x + device.width / 2;
  const y = device.y + device.height / 2;
  return { x, y, z: terrainZ(x, y, params) + DEVICE_HEIGHT[device.type] * 0.55 + 0.9 };
}

function nearestCorridorX(x: number, params: LayoutParams) {
  const corridors = [params.fieldWidth * 0.28, params.fieldWidth * 0.5, params.fieldWidth * 0.72];
  return corridors.reduce((best, current) => (Math.abs(current - x) < Math.abs(best - x) ? current : best), corridors[0]);
}

function zOffsetForLine(source: Device, target: Device) {
  const highPressure = source.type === "fracPump" || target.type === "manifold" || target.type === "wellhead";
  return highPressure ? 5.2 : 3.9;
}

function rectCenterVector(rect: LayoutRect, params: LayoutParams, lift: number) {
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  return worldToVector({ x, y, z: terrainZ(x, y, params) + lift }, params);
}

function worldToVector(point: Point3, params: LayoutParams) {
  return new THREE.Vector3(point.x - params.fieldWidth / 2, point.z, point.y - params.fieldHeight / 2);
}

function terrainZ(x: number, y: number, params: LayoutParams) {
  return getTerrainElevation(x, y, params);
}

function lowMound(x: number, y: number, params: LayoutParams) {
  const nx = x / params.fieldWidth - 0.5;
  const ny = y / params.fieldHeight - 0.5;
  return Math.sin(nx * Math.PI * 2) * 0.35 + Math.cos(ny * Math.PI * 2) * 0.28 + 0.55;
}

function terrainCellEnabled(x: number, y: number, params: LayoutParams) {
  return isTerrainPointEnabled(x, y, params);
}

function findDeviceId(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (typeof current.userData.deviceId === "string") return current.userData.deviceId;
    current = current.parent;
  }
  return null;
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments || object instanceof THREE.Sprite) {
      object.geometry?.dispose();
      const material = object.material;
      const materials = Array.isArray(material) ? material : [material];
      materials.forEach((item) => {
        const maybeTextured = item as THREE.Material & { map?: THREE.Texture };
        maybeTextured.map?.dispose();
        item.dispose();
      });
    }
  });
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}
