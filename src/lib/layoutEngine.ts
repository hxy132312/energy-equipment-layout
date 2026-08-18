import {
  CASE_TEMPLATES,
  EQUIPMENT_SPECS,
  SCORE_PROFILES,
  type DeviceType,
  type FracScale,
  type ScoreKey,
  type ScoreProfile,
  type TemplateId,
  type YardShape,
} from "../data/equipment";

export interface LayoutParams {
  fieldWidth: number;
  fieldHeight: number;
  shape: YardShape;
  scale: FracScale;
  fracPumpCount: number;
  sandTankCount: number;
  waterTankCount: number;
  additiveSkidCount: number;
  enableForbiddenZone: boolean;
  optimizationIterations: number;
  scoreProfile: ScoreProfile;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Device extends Rect {
  id: string;
  type: DeviceType;
  name: string;
  rotation: 0 | 90 | 180 | 270;
  safetyDistance: number;
  color: string;
  requiresRoad: boolean;
  connectsTo: string[];
}

export interface Road extends Rect {
  id: string;
  name: string;
  role: "main" | "service" | "emergency";
}

export interface ForbiddenZone extends Rect {
  id: string;
  name: string;
  reason: string;
}

export interface Violation {
  id: string;
  ruleId: string;
  type: "collision" | "safety" | "boundary" | "forbidden" | "road" | "process" | "pipeline";
  severity: "high" | "medium" | "low";
  message: string;
  deviceIds: string[];
  evidence: string;
}

export type Warning = Violation;

export interface ScoreDetail {
  key: ScoreKey;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  explanation: string;
}

export interface Scores {
  total: number;
  safetyCompliance: number;
  collisionRate: number;
  forbiddenAvoidance: number;
  spaceUtilization: number;
  spaceUtilizationScore: number;
  roadAccessibility: number;
  pipelineLength: number;
  pipelineScore: number;
  processRationality: number;
  details: ScoreDetail[];
}

export interface HeatZone extends Rect {
  id: string;
  label: string;
  intensity: number;
  reason: string;
}

export interface LayoutCandidate {
  id: string;
  name: string;
  templateId: TemplateId;
  templateName: string;
  params: LayoutParams;
  devices: Device[];
  roads: Road[];
  forbiddenZones: ForbiddenZone[];
  violations: Violation[];
  warnings: Violation[];
  scores: Scores;
  heatZones: HeatZone[];
  explanation: string[];
}

export interface IterationSnapshot {
  iteration: number;
  bestScore: number;
  averageScore: number;
  hardViolationCount: number;
  highRiskCount: number;
  warningCount: number;
  pipelineLength: number;
  safetyCompliance: number;
  roadAccessibility: number;
  processRationality: number;
  templateName: string;
}

export interface IterativeOptimizationResult {
  rounds: number;
  best: LayoutCandidate;
  history: IterationSnapshot[];
  initialBestScore: number;
  finalBestScore: number;
  improvement: number;
  averageFinalScore: number;
}

interface Point {
  x: number;
  y: number;
}

interface ObjectiveSnapshot {
  safety: number;
  collision: number;
  forbidden: number;
  pipeline: number;
  road: number;
  process: number;
  utilization: number;
}

const DEFAULT_PARAMS: LayoutParams = {
  fieldWidth: 130,
  fieldHeight: 92,
  shape: "rectangle",
  scale: "medium",
  fracPumpCount: 8,
  sandTankCount: 4,
  waterTankCount: 3,
  additiveSkidCount: 2,
  enableForbiddenZone: true,
  optimizationIterations: 180,
  scoreProfile: "balanced",
};

const MIN_CLEARANCE_RULES: Array<{
  id: string;
  a: DeviceType;
  b: DeviceType;
  min?: number;
  max?: number;
  evidence: string;
  hard?: boolean;
}> = [
  { id: "R-HSE-00", a: "wellhead", b: "fracPump", min: 12, evidence: "原型可配置默认值，公开检索未确认通用强制米数。", hard: false },
  { id: "R-HSE-01", a: "wellhead", b: "controlCabin", min: 18, evidence: "人员活动区应远离高压/井口核心区，来自 API RP 54 与 OSHA 的风险控制原则。", hard: false },
  { id: "R-HSE-02", a: "wellhead", b: "generator", min: 16, evidence: "电源与高压核心区分区布置，按防火防爆和人员暴露控制原则设置。", hard: false },
  { id: "R-HSE-03", a: "manifold", b: "controlCabin", min: 18, evidence: "仪表车宜在高压管汇区外侧，减少人员进入高压管线密集区。", hard: false },
  { id: "R-HSE-04", a: "fracPump", b: "controlCabin", min: 12, evidence: "高压泵车阵列与人员控制区保持分离。", hard: false },
  { id: "R-FLOW-01", a: "wellhead", b: "manifold", min: 4, max: 18, evidence: "高压管汇走向应优化并尽量短，来自电动压裂井场布置优化原则。" },
  { id: "R-FLOW-02", a: "manifold", b: "fracPump", min: 3, max: 28, evidence: "泵车通过高压管汇与井口连接，管线短、交叉少。"},
  { id: "R-FLOW-03", a: "blender", b: "sandTank", min: 3, max: 28, evidence: "供砂区靠近混砂车和进出口，便于物料装卸和输砂。"},
  { id: "R-FLOW-04", a: "blender", b: "waterTank", min: 3, max: 32, evidence: "配液/供液设施应靠近混砂车，降低低压管线长度。"},
  { id: "R-FLOW-05", a: "blender", b: "additiveSkid", min: 3, max: 24, evidence: "化学剂注入属于混配上游，宜靠近混砂车。"},
  { id: "R-UTIL-01", a: "generator", b: "controlCabin", min: 3, max: 28, evidence: "电源服务仪表控制，同时不进入高压核心。"},
];

const PROCESS_ORDER: DeviceType[] = ["sandTank", "waterTank", "additiveSkid", "blender", "fracPump", "manifold", "wellhead"];

const SCORE_LABELS: Record<ScoreKey, string> = {
  safety: "安全距离",
  collision: "碰撞避让",
  forbidden: "禁布区避让",
  pipeline: "管线长度",
  road: "道路通达",
  process: "流程合理",
  utilization: "空间利用",
};

export function createDefaultParams(): LayoutParams {
  return { ...DEFAULT_PARAMS };
}

export function generateLayoutOptions(params: LayoutParams, seedOffset = 0): LayoutCandidate[] {
  const normalized = normalizeParams(params);
  const rankedTemplates = rankTemplates(normalized);
  const rawCandidates = rankedTemplates.flatMap((template, templateIndex) => {
    return [0, 1, 2].map((variant) => {
      const seed = 3907 + seedOffset * 1009 + templateIndex * 491 + variant * 97 + normalized.fracPumpCount * 11 + normalized.sandTankCount * 17;
      const initial = createInitialLayout(normalized, template.id, seed, variant);
      return optimizeCandidate(initial, seed);
    });
  });

  return rawCandidates
    .sort(compareCandidates)
    .slice(0, 4)
    .map((candidate, index) => {
      const improved = index === 0 ? polishCandidate(candidate, 8719 + seedOffset * 131) : candidate;
      return {
        ...improved,
        id: `scheme-${index + 1}`,
        name: `候选方案 ${index + 1}`,
        explanation: createEvidenceExplanation(improved),
      };
    });
}

export function runIterativeOptimization(params: LayoutParams, rounds = 100): IterativeOptimizationResult {
  const safeRounds = clamp(Math.round(rounds), 1, 500);
  const iterativeParams: LayoutParams = {
    ...params,
    optimizationIterations: clamp(Math.round(params.optimizationIterations * 0.35), 35, 160),
  };
  let globalBest: LayoutCandidate = generateLayoutOptions(params)[0];
  const initialBestScore = globalBest.scores.total;
  const history: IterationSnapshot[] = [];

  for (let iteration = 1; iteration <= safeRounds; iteration += 1) {
    const candidates = generateLayoutOptions(iterativeParams, iteration);
    const roundBest = candidates[0];
    const averageScore = average(candidates.map((candidate) => candidate.scores.total));

    if (isBetterCandidate(roundBest, globalBest)) {
      globalBest = roundBest;
    }

    history.push({
      iteration,
      bestScore: globalBest.scores.total,
      averageScore,
      hardViolationCount: countHardViolations(globalBest),
      highRiskCount: globalBest.violations.filter((violation) => violation.severity === "high").length,
      warningCount: globalBest.violations.length,
      pipelineLength: globalBest.scores.pipelineLength,
      safetyCompliance: globalBest.scores.safetyCompliance,
      roadAccessibility: globalBest.scores.roadAccessibility,
      processRationality: globalBest.scores.processRationality,
      templateName: globalBest.templateName,
    });
  }

  const best = globalBest;
  const finalBestScore = best.scores.total;
  return {
    rounds: safeRounds,
    best,
    history,
    initialBestScore,
    finalBestScore,
    improvement: finalBestScore - initialBestScore,
    averageFinalScore: average(history.slice(-10).map((item) => item.averageScore)),
  };
}

export function recalculateCandidate(candidate: LayoutCandidate): LayoutCandidate {
  return evaluateCandidate({ ...candidate, devices: candidate.devices.map((device) => ({ ...device })) });
}

export function moveDevice(candidate: LayoutCandidate, deviceId: string, x: number, y: number): LayoutCandidate {
  const devices = candidate.devices.map((device) =>
    device.id === deviceId
      ? {
          ...device,
          x: clamp(x, 0, candidate.params.fieldWidth - device.width),
          y: clamp(y, 0, candidate.params.fieldHeight - device.height),
        }
      : device,
  );
  return recalculateCandidate({ ...candidate, devices });
}

export function getConnectedDeviceNames(candidate: LayoutCandidate, device: Device): string[] {
  const byId = new Map(candidate.devices.map((item) => [item.id, item.name]));
  return device.connectsTo.map((id) => byId.get(id) ?? id);
}

function normalizeParams(params: LayoutParams): LayoutParams {
  return {
    ...params,
    fieldWidth: clamp(Math.round(params.fieldWidth), 80, 220),
    fieldHeight: clamp(Math.round(params.fieldHeight), 60, 160),
    fracPumpCount: clamp(Math.round(params.fracPumpCount), 4, 16),
    sandTankCount: clamp(Math.round(params.sandTankCount), 2, 8),
    waterTankCount: clamp(Math.round(params.waterTankCount), 1, 6),
    additiveSkidCount: clamp(Math.round(params.additiveSkidCount), 1, 4),
    optimizationIterations: clamp(Math.round(params.optimizationIterations), 20, 600),
    scoreProfile: params.scoreProfile ?? "balanced",
  };
}

function rankTemplates(params: LayoutParams) {
  const aspect = params.fieldWidth / params.fieldHeight;
  return CASE_TEMPLATES.map((template) => {
    const aspectPenalty = Math.abs(template.preferredAspect - aspect) * 12;
    const scaleBonus = template.scaleFit.includes(params.scale) ? 10 : 0;
    return { ...template, rank: template.scoreBias + scaleBonus - aspectPenalty };
  }).sort((a, b) => b.rank - a.rank);
}

function createInitialLayout(params: LayoutParams, templateId: TemplateId, seed: number, variant: number): LayoutCandidate {
  const roads = createRoads(params);
  const forbiddenZones = createForbiddenZones(params);
  const devices = createBaseDevices(params);
  const templateName = CASE_TEMPLATES.find((template) => template.id === templateId)?.name ?? "规则模板";

  placeByTemplate(devices, params, templateId, seed, variant);
  connectDevices(devices);

  return evaluateCandidate({
    id: templateId,
    name: templateName,
    templateId,
    templateName,
    params,
    devices,
    roads,
    forbiddenZones,
    violations: [],
    warnings: [],
    heatZones: [],
    scores: emptyScores(params.scoreProfile),
    explanation: [
      `模板匹配：根据长宽比 ${(params.fieldWidth / params.fieldHeight).toFixed(2)}、规模 ${scaleLabel(params.scale)} 选择“${templateName}”。`,
      "规则初始化：井口/管汇/泵车为高压核心，砂罐/水罐/化添撬围绕混砂车形成上游物料区。",
      "多目标优化：先修复碰撞、越界和禁布区占用，再用模拟退火式扰动与局部微调在安全、管线、道路和流程之间寻优。",
      `评分画像：采用“${SCORE_PROFILES[params.scoreProfile].label}”权重，但硬约束风险优先于综合分排序。`,
    ],
  });
}

function createBaseDevices(params: LayoutParams): Device[] {
  const devices: Device[] = [];
  const add = (type: DeviceType, count: number) => {
    const spec = EQUIPMENT_SPECS[type];
    for (let index = 1; index <= count; index += 1) {
      devices.push({
        id: `${type}-${index}`,
        type,
        name: `${spec.label}${count > 1 ? index : ""}`,
        x: 0,
        y: 0,
        width: spec.width,
        height: spec.height,
        rotation: spec.preferredRotation,
        safetyDistance: spec.safetyDistance,
        color: spec.color,
        requiresRoad: spec.requiresRoad,
        connectsTo: [],
      });
    }
  };

  add("wellhead", 1);
  add("manifold", 1);
  add("fracPump", params.fracPumpCount);
  add("blender", 1);
  add("sandTank", params.sandTankCount);
  add("waterTank", params.waterTankCount);
  add("additiveSkid", params.additiveSkidCount);
  add("generator", 1);
  add("controlCabin", 1);
  add("fireZone", 1);
  return devices;
}

function placeByTemplate(devices: Device[], params: LayoutParams, templateId: TemplateId, seed: number, variant: number) {
  const rng = mulberry32(seed);
  const wellhead = getDevice(devices, "wellhead-1");
  const manifold = getDevice(devices, "manifold-1");
  const blender = getDevice(devices, "blender-1");
  const pumps = devices.filter((device) => device.type === "fracPump");
  const sandTanks = devices.filter((device) => device.type === "sandTank");
  const waterTanks = devices.filter((device) => device.type === "waterTank");
  const additives = devices.filter((device) => device.type === "additiveSkid");

  const shift = (variant - 1) * 0.04;
  if (templateId === "linearFlow") {
    setCenter(wellhead, params.fieldWidth * (0.74 + shift), params.fieldHeight * 0.52);
    setCenter(manifold, params.fieldWidth * (0.62 + shift), params.fieldHeight * 0.52);
    setCenter(blender, params.fieldWidth * (0.42 + shift), params.fieldHeight * 0.52);
    placeGrid(pumps, params.fieldWidth * (0.47 + shift), params.fieldHeight * 0.24, Math.ceil(pumps.length / 2), 5, params.fieldHeight * 0.32);
    placeGrid(sandTanks, 14, 15, Math.max(1, Math.ceil(sandTanks.length / 2)), 4, 5);
    placeGrid(waterTanks, 14, params.fieldHeight - 28, Math.max(1, waterTanks.length), 4, 4);
    placeGrid(additives, params.fieldWidth * 0.27, params.fieldHeight * 0.66, Math.max(1, additives.length), 5, 3);
  } else if (templateId === "dualLane") {
    setCenter(wellhead, params.fieldWidth * (0.58 + shift), params.fieldHeight * 0.5);
    setCenter(manifold, params.fieldWidth * (0.47 + shift), params.fieldHeight * 0.5);
    setCenter(blender, params.fieldWidth * (0.31 + shift), params.fieldHeight * 0.5);
    placeGrid(pumps, params.fieldWidth * (0.38 + shift), params.fieldHeight * 0.22, Math.ceil(pumps.length / 2), 5, params.fieldHeight * 0.34);
    placeGrid(sandTanks, 15, 15, Math.ceil(sandTanks.length / 2), 4, 5);
    placeGrid(waterTanks, 15, params.fieldHeight - 28, Math.max(1, waterTanks.length), 4, 4);
    placeGrid(additives, params.fieldWidth * 0.2, params.fieldHeight * 0.58, Math.max(1, additives.length), 5, 4);
  } else {
    setCenter(wellhead, params.fieldWidth * (0.55 + shift), params.fieldHeight * 0.52);
    setCenter(manifold, params.fieldWidth * (0.43 + shift), params.fieldHeight * 0.52);
    setCenter(blender, params.fieldWidth * (0.29 + shift), params.fieldHeight * 0.52);
    placeGrid(pumps, params.fieldWidth * (0.38 + shift), params.fieldHeight * 0.25, Math.ceil(pumps.length / 2), 5, params.fieldHeight * 0.28);
    placeGrid(sandTanks, 14, 15, Math.ceil(sandTanks.length / 2), 4, 4);
    placeGrid(waterTanks, params.fieldWidth - 34, 15, 1, 4, 4);
    placeGrid(additives, params.fieldWidth * 0.18, params.fieldHeight * 0.62, Math.max(1, additives.length), 5, 3);
  }

  setCenter(getDevice(devices, "generator-1"), params.fieldWidth - 25, params.fieldHeight - 18);
  setCenter(getDevice(devices, "controlCabin-1"), params.fieldWidth - 25, 18);
  setCenter(getDevice(devices, "fireZone-1"), 24, params.fieldHeight - 18);

  devices.forEach((device) => {
    if (!["wellhead", "manifold"].includes(device.type)) {
      device.x += (rng() - 0.5) * 3;
      device.y += (rng() - 0.5) * 3;
    }
    clampDevice(device, params);
  });
}

function connectDevices(devices: Device[]) {
  for (const device of devices) {
    if (device.type === "manifold") device.connectsTo = ["wellhead-1"];
    if (device.type === "fracPump") device.connectsTo = ["manifold-1", "blender-1"];
    if (device.type === "blender") device.connectsTo = ["manifold-1"];
    if (["sandTank", "waterTank", "additiveSkid"].includes(device.type)) device.connectsTo = ["blender-1"];
    if (device.type === "generator") device.connectsTo = ["controlCabin-1"];
    if (device.type === "controlCabin") device.connectsTo = ["manifold-1"];
  }
}

function optimizeCandidate(candidate: LayoutCandidate, seed: number): LayoutCandidate {
  let current = candidate;
  let best = candidate;
  const rng = mulberry32(seed + 991);
  const movableTypes: DeviceType[] = ["fracPump", "blender", "sandTank", "waterTank", "additiveSkid", "generator", "controlCabin", "fireZone"];

  for (let index = 0; index < candidate.params.optimizationIterations; index += 1) {
    const progress = index / candidate.params.optimizationIterations;
    const movable = pickMovableDevices(current, movableTypes);
    const picked = movable[Math.floor(rng() * movable.length)];
    const step = 11 * (1 - progress) + 0.9;
    const trialDevices = current.devices.map((item) => {
      if (item.id !== picked.id) return { ...item };
      const guidance = calculateMoveGuidance(item, current);
      const guidedWeight = rng() < 0.68 ? 0.72 : 0.22;
      return {
        ...item,
        x: item.x + (rng() - 0.5) * step + guidance.x * guidedWeight * step,
        y: item.y + (rng() - 0.5) * step + guidance.y * guidedWeight * step,
      };
    });

    const repaired = repairLayout(trialDevices, candidate.params, current.forbiddenZones, rng);
    const trial = evaluateCandidate({ ...current, devices: repaired });
    const temperature = 0.08 * (1 - progress);
    const acceptWorse = rng() < temperature && trial.scores.total > current.scores.total - (4 - progress * 2.5);

    if (trial.scores.total >= current.scores.total || acceptWorse) current = trial;
    if (current.scores.total > best.scores.total) best = current;
  }

  return evaluateCandidate({ ...best, devices: repairLayout(best.devices, best.params, best.forbiddenZones, mulberry32(seed + 2123)) });
}

function pickMovableDevices(candidate: LayoutCandidate, movableTypes: DeviceType[]): Device[] {
  const movable = candidate.devices.filter((device) => movableTypes.includes(device.type));
  const warnedIds = new Set(
    candidate.violations
      .filter((violation) => violation.severity !== "low" || ["collision", "forbidden", "boundary", "road"].includes(violation.type))
      .flatMap((violation) => violation.deviceIds),
  );
  const warnedMovable = movable.filter((device) => warnedIds.has(device.id));
  return warnedMovable.length ? warnedMovable : movable;
}

function polishCandidate(candidate: LayoutCandidate, seed: number): LayoutCandidate {
  let best = candidate;
  const rng = mulberry32(seed);
  const movableTypes: DeviceType[] = ["fracPump", "blender", "sandTank", "waterTank", "additiveSkid", "generator", "controlCabin", "fireZone"];
  const steps = [2, 1];
  const directions: Point[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  for (const step of steps) {
    const devices = [...best.devices.filter((device) => movableTypes.includes(device.type))].sort((a, b) => {
      const aw = best.violations.some((violation) => violation.deviceIds.includes(a.id)) ? 0 : 1;
      const bw = best.violations.some((violation) => violation.deviceIds.includes(b.id)) ? 0 : 1;
      return aw - bw || rng() - 0.5;
    });

    for (const device of devices.slice(0, 5)) {
      for (const direction of directions) {
        const trialDevices = best.devices.map((item) =>
          item.id === device.id
            ? {
                ...item,
                x: item.x + direction.x * step,
                y: item.y + direction.y * step,
              }
            : { ...item },
        );
        const trial = evaluateCandidate({ ...best, devices: repairLayout(trialDevices, best.params, best.forbiddenZones, rng) });
        if (isBetterCandidate(trial, best)) best = trial;
      }
    }
  }

  return best;
}

function isBetterCandidate(next: LayoutCandidate, current: LayoutCandidate): boolean {
  const nextHard = countHardViolations(next);
  const currentHard = countHardViolations(current);
  if (nextHard !== currentHard) return nextHard < currentHard;
  if (next.violations.length !== current.violations.length && Math.abs(next.scores.total - current.scores.total) < 0.8) {
    return next.violations.length < current.violations.length;
  }
  return next.scores.total > current.scores.total + 0.05;
}

function compareCandidates(a: LayoutCandidate, b: LayoutCandidate): number {
  return (
    countHardViolations(a) - countHardViolations(b) ||
    a.violations.length - b.violations.length ||
    b.scores.total - a.scores.total
  );
}

function countHardViolations(candidate: LayoutCandidate): number {
  return candidate.violations.filter((violation) => violation.severity === "high" || ["collision", "boundary", "forbidden"].includes(violation.type)).length;
}

function calculateMoveGuidance(device: Device, candidate: LayoutCandidate): Point {
  const vectors: Point[] = [];
  const deviceCenter = center(device);

  if (device.requiresRoad) {
    const nearest = nearestRoadPoint(device, candidate.roads);
    const distance = pointDistance(deviceCenter, nearest);
    if (distance > 8) vectors.push(normalizeVector({ x: nearest.x - deviceCenter.x, y: nearest.y - deviceCenter.y }, 1.15));
  }

  const connected = connectedDevices(candidate, device);
  if (connected.length) {
    const target = {
      x: average(connected.map((item) => center(item).x)),
      y: average(connected.map((item) => center(item).y)),
    };
    vectors.push(normalizeVector({ x: target.x - deviceCenter.x, y: target.y - deviceCenter.y }, 0.36));
  }

  for (const violation of candidate.violations) {
    if (!violation.deviceIds.includes(device.id)) continue;
    const others = candidate.devices.filter((item) => item.id !== device.id && violation.deviceIds.includes(item.id));
    if (["collision", "safety"].includes(violation.type) && others.length) {
      const otherCenter = {
        x: average(others.map((item) => center(item).x)),
        y: average(others.map((item) => center(item).y)),
      };
      vectors.push(normalizeVector({ x: deviceCenter.x - otherCenter.x, y: deviceCenter.y - otherCenter.y }, violation.type === "collision" ? 1.4 : 0.9));
    }
    if (violation.type === "road" && device.requiresRoad) {
      const nearest = nearestRoadPoint(device, candidate.roads);
      vectors.push(normalizeVector({ x: nearest.x - deviceCenter.x, y: nearest.y - deviceCenter.y }, 1.25));
    }
    if (["forbidden", "boundary"].includes(violation.type)) {
      vectors.push(normalizeVector({ x: candidate.params.fieldWidth / 2 - deviceCenter.x, y: candidate.params.fieldHeight / 2 - deviceCenter.y }, 1.1));
    }
  }

  return vectors.length
    ? normalizeVector({ x: vectors.reduce((sum, vector) => sum + vector.x, 0), y: vectors.reduce((sum, vector) => sum + vector.y, 0) }, 1)
    : { x: 0, y: 0 };
}

function repairLayout(devices: Device[], params: LayoutParams, zones: ForbiddenZone[], rng: () => number): Device[] {
  const repaired = devices.map((device) => ({ ...device }));
  const blockingZones = [...shapeAvoidanceZones(params), ...zones];
  repairBoundaryAndZones(repaired, params, blockingZones);

  for (let pass = 0; pass < 7; pass += 1) {
    for (let i = 0; i < repaired.length; i += 1) {
      for (let j = i + 1; j < repaired.length; j += 1) {
        const a = repaired[i];
        const b = repaired[j];
        const relation = findClearanceRule(a.type, b.type);
        const required = rectsOverlap(a, b) ? 1 : relation?.min;
        if (!required) continue;
        const distance = rectDistance(a, b);
        if (!rectsOverlap(a, b) && distance >= required) continue;
        const push = rectsOverlap(a, b) ? 2.8 + pass * 0.8 : Math.min((required - distance) * 0.45, 2.4);
        pushPairApart(a, b, push, params, rng);
        if (relation?.max && distance > relation.max * 1.35 && pass > 3) {
          pullPairTogether(a, b, Math.min((distance - relation.max) * 0.08, 1.4), params);
        }
      }
    }
    repairBoundaryAndZones(repaired, params, blockingZones);
  }

  return repaired;
}

function repairBoundaryAndZones(devices: Device[], params: LayoutParams, zones: Rect[]) {
  for (const device of devices) {
    clampDevice(device, params);
    for (const zone of zones) {
      for (let attempt = 0; attempt < 3 && rectsOverlap(device, zone); attempt += 1) {
        pushOutOfRect(device, zone, params);
      }
    }
    clampDevice(device, params);
  }
}

function shapeAvoidanceZones(params: LayoutParams): Rect[] {
  if (params.shape === "notched") {
    return [{ x: params.fieldWidth - 30, y: 0, width: 30, height: 24 }];
  }
  if (params.shape === "trapezoid") {
    return [{ x: 0, y: 0, width: 22, height: 22 }];
  }
  return [];
}

function evaluateCandidate(candidate: LayoutCandidate): LayoutCandidate {
  const violations: Violation[] = [];
  const devices = candidate.devices;
  const boundary: Rect = { x: 0, y: 0, width: candidate.params.fieldWidth, height: candidate.params.fieldHeight };
  const pairCount = (devices.length * (devices.length - 1)) / 2;
  let collisionPairs = 0;
  let safetyPenalty = 0;
  let forbiddenPenalty = 0;
  let boundaryPenalty = 0;
  let processPenalty = 0;
  let roadPenalty = 0;
  let pipeCrossPenalty = 0;

  for (const device of devices) {
    if (!containsRect(boundary, device) || !insideShape(device, candidate.params)) {
      boundaryPenalty += 1;
      violations.push({
        id: `boundary-${device.id}`,
        ruleId: "R-HARD-BOUNDARY",
        type: "boundary",
        severity: "high",
        message: `${device.name} 超出井场可布置边界。`,
        deviceIds: [device.id],
        evidence: "设备必须位于井场边界内，缺口/梯形边界按禁布区处理。",
      });
    }
    for (const zone of candidate.forbiddenZones) {
      if (rectsOverlap(device, zone)) {
        forbiddenPenalty += 1;
        violations.push({
          id: `forbidden-${device.id}-${zone.id}`,
          ruleId: "R-HARD-FORBIDDEN",
          type: "forbidden",
          severity: "high",
          message: `${device.name} 与禁布区“${zone.name}”重叠。`,
          deviceIds: [device.id],
          evidence: zone.reason,
        });
      }
    }
  }

  for (let i = 0; i < devices.length; i += 1) {
    for (let j = i + 1; j < devices.length; j += 1) {
      const a = devices[i];
      const b = devices[j];
      if (rectsOverlap(a, b)) {
        collisionPairs += 1;
        violations.push({
          id: `collision-${a.id}-${b.id}`,
          ruleId: "R-HARD-COLLISION",
          type: "collision",
          severity: "high",
          message: `${a.name} 与 ${b.name} 发生设备碰撞。`,
          deviceIds: [a.id, b.id],
          evidence: "设备碰撞率必须为 0。",
        });
        continue;
      }

      const relation = findClearanceRule(a.type, b.type);
      const required = relation?.min ?? Math.max(a.safetyDistance, b.safetyDistance) * 0.45;
      const distance = rectDistance(a, b);
      if (distance < required) {
        safetyPenalty += (required - distance) / Math.max(required, 1);
        violations.push({
          id: `safety-${a.id}-${b.id}`,
          ruleId: relation?.id ?? "R-CONFIG-SAFETY",
          type: "safety",
          severity: distance < required * 0.55 ? "medium" : "low",
          message: `${a.name} 距 ${b.name} ${distance.toFixed(1)}m，低于当前规则 ${required.toFixed(1)}m。`,
          deviceIds: [a.id, b.id],
          evidence: relation?.evidence ?? "来自设备安全缓冲区的可配置默认约束。",
        });
      }
      if (relation?.max && distance > relation.max) {
        processPenalty += Math.min((distance - relation.max) / relation.max, 1);
        violations.push({
          id: `process-distance-${a.id}-${b.id}`,
          ruleId: relation.id,
          type: "process",
          severity: "low",
          message: `${a.name} 距 ${b.name} ${distance.toFixed(1)}m，超过推荐上限 ${relation.max.toFixed(1)}m。`,
          deviceIds: [a.id, b.id],
          evidence: relation.evidence,
        });
      }
    }
  }

  const roadRequired = devices.filter((device) => device.requiresRoad);
  const roadAccessible = roadRequired.filter((device) => candidate.roads.some((road) => rectDistance(device, road) <= 10));
  for (const device of roadRequired) {
    if (!roadAccessible.includes(device)) {
      roadPenalty += 1;
      violations.push({
        id: `road-${device.id}`,
        ruleId: "R-ROAD-ACCESS",
        type: "road",
        severity: "medium",
        message: `${device.name} 距最近道路超过 10m，检修/消防/装卸可达性不足。`,
        deviceIds: [device.id],
        evidence: "道路应服务大型车辆进出、消防和应急疏散。",
      });
    }
  }

  for (const line of pipelineSegments(devices)) {
    for (const zone of candidate.forbiddenZones) {
      if (lineIntersectsRect(line.a, line.b, zone)) {
        pipeCrossPenalty += 1;
        violations.push({
          id: `pipeline-forbidden-${line.id}-${zone.id}`,
          ruleId: "R-PIPE-FORBIDDEN",
          type: "pipeline",
          severity: "medium",
          message: `管线 ${line.label} 穿越禁布区“${zone.name}”。`,
          deviceIds: line.deviceIds,
          evidence: "管线应避开禁布区、道路冲突区和地形不可用区域。",
        });
      }
    }
  }

  const pipeLength = calculatePipelineLength(devices);
  const equipmentArea = devices.reduce((sum, device) => sum + device.width * device.height, 0);
  const fieldArea = candidate.params.fieldWidth * candidate.params.fieldHeight;
  const utilization = equipmentArea / fieldArea;
  const targetUtilization = candidate.params.scale === "large" ? 0.18 : candidate.params.scale === "medium" ? 0.16 : 0.14;
  const roadAccessibility = roadRequired.length ? roadAccessible.length / roadRequired.length : 1;
  const safetyCompliance = clamp01(1 - (safetyPenalty + boundaryPenalty * 2) / Math.max(pairCount * 0.08, 1));
  const collisionScore = collisionPairs === 0 ? 1 : clamp01(1 - collisionPairs / Math.max(pairCount * 0.08, 1));
  const forbiddenAvoidance = clamp01(1 - (forbiddenPenalty * 2 + pipeCrossPenalty) / Math.max(candidate.forbiddenZones.length * 2 + 1, 1));
  const utilizationScore = clamp01(1 - Math.abs(utilization - targetUtilization) / targetUtilization);
  const pipeTarget = candidate.params.fieldWidth * 1.9 + candidate.params.fieldHeight * 1.2 + devices.length * 8;
  const pipelineScore = clamp01(1 - Math.max(pipeLength - pipeTarget, 0) / pipeTarget);
  const processOrderScore = calculateProcessOrderScore(devices);
  const processRationality = clamp01(0.42 * processOrderScore + 0.28 * pipelineScore + 0.2 * roadAccessibility + 0.1 * forbiddenAvoidance - processPenalty * 0.04);

  const objectives: ObjectiveSnapshot = {
    safety: safetyCompliance,
    collision: collisionScore,
    forbidden: forbiddenAvoidance,
    pipeline: pipelineScore,
    road: roadAccessibility,
    process: processRationality,
    utilization: utilizationScore,
  };
  const profile = SCORE_PROFILES[candidate.params.scoreProfile] ?? SCORE_PROFILES.balanced;
  const details = (Object.keys(profile.weights) as ScoreKey[]).map((key) => ({
    key,
    label: SCORE_LABELS[key],
    score: objectives[key],
    weight: profile.weights[key],
    contribution: objectives[key] * profile.weights[key] * 100,
    explanation: explainScore(key, objectives[key], candidate, violations, pipeLength, utilization, targetUtilization),
  }));
  const total = details.reduce((sum, item) => sum + item.contribution, 0);

  return {
    ...candidate,
    violations,
    warnings: violations,
    heatZones: createHeatZones(candidate, violations),
    scores: {
      total,
      safetyCompliance,
      collisionRate: collisionPairs / Math.max(pairCount, 1),
      forbiddenAvoidance,
      spaceUtilization: utilization,
      spaceUtilizationScore: utilizationScore,
      roadAccessibility,
      pipelineLength: pipeLength,
      pipelineScore,
      processRationality,
      details,
    },
  };
}

function createRoads(params: LayoutParams): Road[] {
  const roadWidth = 7;
  const roads: Road[] = [
    { id: "road-top", name: "北侧主通道", role: "main", x: 5, y: 5, width: params.fieldWidth - 10, height: roadWidth },
    {
      id: "road-bottom",
      name: "南侧应急通道",
      role: "emergency",
      x: 5,
      y: params.fieldHeight - 5 - roadWidth,
      width: params.fieldWidth - 10,
      height: roadWidth,
    },
    { id: "road-left", name: "西侧进场通道", role: "main", x: 5, y: 5, width: roadWidth, height: params.fieldHeight - 10 },
    {
      id: "road-right",
      name: "东侧检修通道",
      role: "service",
      x: params.fieldWidth - 5 - roadWidth,
      y: 5,
      width: roadWidth,
      height: params.fieldHeight - 10,
    },
    {
      id: "road-center",
      name: "中部设备检修通道",
      role: "service",
      x: 18,
      y: params.fieldHeight * 0.5 - roadWidth / 2,
      width: params.fieldWidth - 36,
      height: roadWidth,
    },
  ];
  if (params.scale === "large") {
    roads.push({
      id: "road-service",
      name: "压裂车检修副通道",
      role: "service",
      x: 18,
      y: params.fieldHeight * 0.28,
      width: params.fieldWidth - 36,
      height: roadWidth * 0.85,
    });
  }
  return roads;
}

function createForbiddenZones(params: LayoutParams): ForbiddenZone[] {
  if (!params.enableForbiddenZone) return [];
  const zones: ForbiddenZone[] = [
    {
      id: "forbid-slope",
      name: "坡坎/占压管线避让区",
      reason: "模拟地形边界、地下管线或消防隔离要求形成的禁布区。",
      x: params.fieldWidth * 0.74,
      y: params.fieldHeight * 0.58,
      width: params.fieldWidth * 0.16,
      height: params.fieldHeight * 0.2,
    },
  ];
  if (params.shape === "notched") {
    zones.push({
      id: "forbid-notch",
      name: "不规则边界缺口",
      reason: "表达井场边界非矩形造成的不可布置空间。",
      x: params.fieldWidth - 30,
      y: 0,
      width: 30,
      height: 24,
    });
  }
  if (params.shape === "trapezoid") {
    zones.push({
      id: "forbid-corner",
      name: "斜边退让区",
      reason: "近似表达梯形场地的斜边退让。",
      x: 0,
      y: 0,
      width: 22,
      height: 22,
    });
  }
  return zones;
}

function calculatePipelineLength(devices: Device[]): number {
  const byId = new Map(devices.map((device) => [device.id, device]));
  return devices.reduce((sum, device) => {
    return (
      sum +
      device.connectsTo.reduce((lineSum, targetId) => {
        const target = byId.get(targetId);
        return target ? lineSum + pointDistance(center(device), center(target)) : lineSum;
      }, 0)
    );
  }, 0);
}

function calculateProcessOrderScore(devices: Device[]): number {
  const groups = PROCESS_ORDER.map((type) => devices.filter((device) => device.type === type));
  let checks = 0;
  let ok = 0;
  for (let index = 0; index < groups.length - 1; index += 1) {
    const left = groups[index];
    const right = groups[index + 1];
    if (!left.length || !right.length) continue;
    checks += 1;
    const leftX = average(left.map((device) => center(device).x));
    const rightX = average(right.map((device) => center(device).x));
    if (leftX <= rightX + 4) ok += 1;
  }
  return checks ? ok / checks : 1;
}

function findClearanceRule(a: DeviceType, b: DeviceType) {
  return MIN_CLEARANCE_RULES.find((rule) => (rule.a === a && rule.b === b) || (rule.a === b && rule.b === a));
}

function pipelineSegments(devices: Device[]) {
  const byId = new Map(devices.map((device) => [device.id, device]));
  return devices.flatMap((device) =>
    device.connectsTo.flatMap((targetId) => {
      const target = byId.get(targetId);
      if (!target) return [];
      return [
        {
          id: `${device.id}-${target.id}`,
          label: `${device.name}-${target.name}`,
          a: center(device),
          b: center(target),
          deviceIds: [device.id, target.id],
        },
      ];
    }),
  );
}

function createHeatZones(candidate: LayoutCandidate, violations: Violation[]): HeatZone[] {
  const zones: HeatZone[] = [];
  for (const violation of violations.slice(0, 18)) {
    const related = candidate.devices.filter((device) => violation.deviceIds.includes(device.id));
    if (!related.length) continue;
    const box = boundingBox(related);
    zones.push({
      id: `heat-${violation.id}`,
      label: violation.type,
      x: Math.max(0, box.x - 3),
      y: Math.max(0, box.y - 3),
      width: Math.min(candidate.params.fieldWidth - box.x, box.width + 6),
      height: Math.min(candidate.params.fieldHeight - box.y, box.height + 6),
      intensity: violation.severity === "high" ? 0.85 : violation.severity === "medium" ? 0.58 : 0.34,
      reason: violation.message,
    });
  }
  return zones;
}

function explainScore(
  key: ScoreKey,
  score: number,
  candidate: LayoutCandidate,
  violations: Violation[],
  pipeLength: number,
  utilization: number,
  targetUtilization: number,
): string {
  const relevant = violations.filter((violation) => {
    if (key === "safety") return ["safety", "boundary"].includes(violation.type);
    if (key === "collision") return violation.type === "collision";
    if (key === "forbidden") return ["forbidden", "pipeline"].includes(violation.type);
    if (key === "road") return violation.type === "road";
    if (key === "process") return violation.type === "process";
    if (key === "pipeline") return violation.type === "pipeline";
    return false;
  });
  if (key === "pipeline") return `管线总长 ${pipeLength.toFixed(1)}m，越短、交叉越少得分越高。`;
  if (key === "utilization") return `设备占地 ${(utilization * 100).toFixed(1)}%，目标约 ${(targetUtilization * 100).toFixed(1)}%。`;
  if (key === "road") return relevant.length ? `有 ${relevant.length} 项道路可达性问题。` : "需进出或检修设备均在道路服务半径内。";
  if (key === "collision") return relevant.length ? `存在 ${relevant.length} 对设备碰撞。` : "设备碰撞率为 0。";
  if (key === "forbidden") return relevant.length ? `存在 ${relevant.length} 项禁布区或管线穿越问题。` : "设备和管线未占用禁布区。";
  if (key === "process") return relevant.length ? `存在 ${relevant.length} 项流程距离或顺序偏差。` : "物料、混砂、增压、管汇、井口的流程方向清晰。";
  if (key === "safety") return relevant.length ? `存在 ${relevant.length} 项安全距离/边界风险。` : "当前未发现安全缓冲区不足。";
  return `子项得分 ${(score * 100).toFixed(1)}。`;
}

function createEvidenceExplanation(candidate: LayoutCandidate): string[] {
  const base = candidate.explanation.filter((item) => !item.startsWith("结果复核：") && !item.startsWith("排序依据："));
  const hardCount = countHardViolations(candidate);
  const mediumCount = candidate.violations.filter((violation) => violation.severity === "medium").length;
  const topSignals = candidate.scores.details
    .slice()
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((detail) => `${detail.label}${detail.contribution.toFixed(1)}分`)
    .join("、");

  return [
    ...base,
    `结果复核：硬约束风险 ${hardCount} 项，中风险 ${mediumCount} 项，碰撞率 ${(candidate.scores.collisionRate * 100).toFixed(1)}%。`,
    `排序依据：综合分 ${candidate.scores.total.toFixed(1)}，主要贡献来自 ${topSignals || "各项指标均衡"}；管线总长 ${candidate.scores.pipelineLength.toFixed(1)}m，道路通达率 ${(candidate.scores.roadAccessibility * 100).toFixed(1)}%。`,
  ];
}

function placeGrid(devices: Device[], startX: number, startY: number, columns: number, gapX: number, gapY: number) {
  devices.forEach((device, index) => {
    const column = index % Math.max(columns, 1);
    const row = Math.floor(index / Math.max(columns, 1));
    device.x = startX + column * (device.width + gapX);
    device.y = startY + row * (device.height + gapY);
  });
}

function setCenter(rect: Rect, x: number, y: number) {
  rect.x = x - rect.width / 2;
  rect.y = y - rect.height / 2;
}

function clampDevice(device: Device, params: LayoutParams) {
  device.x = clamp(device.x, 1, params.fieldWidth - device.width - 1);
  device.y = clamp(device.y, 1, params.fieldHeight - device.height - 1);
}

function pushOutOfRect(device: Device, zone: Rect, params: LayoutParams) {
  const c = center(device);
  const z = center(zone);
  const moveRight = zone.x + zone.width - device.x;
  const moveLeft = device.x + device.width - zone.x;
  const moveDown = zone.y + zone.height - device.y;
  const moveUp = device.y + device.height - zone.y;
  const horizontal = c.x < z.x ? -moveLeft : moveRight;
  const vertical = c.y < z.y ? -moveUp : moveDown;
  if (Math.abs(horizontal) < Math.abs(vertical)) device.x += horizontal + Math.sign(horizontal || 1) * 1.5;
  else device.y += vertical + Math.sign(vertical || 1) * 1.5;
  clampDevice(device, params);
}

function pushPairApart(a: Device, b: Device, amount: number, params: LayoutParams, rng: () => number) {
  const ac = center(a);
  const bc = center(b);
  const vector = normalizeVector({ x: bc.x - ac.x || rng() - 0.5, y: bc.y - ac.y || rng() - 0.5 }, 1);
  const aLocked = isAnchorDevice(a);
  const bLocked = isAnchorDevice(b);

  if (!bLocked) {
    b.x += vector.x * amount * (aLocked ? 1.35 : 0.75);
    b.y += vector.y * amount * (aLocked ? 1.35 : 0.75);
    clampDevice(b, params);
  }
  if (!aLocked) {
    a.x -= vector.x * amount * (bLocked ? 1.35 : 0.75);
    a.y -= vector.y * amount * (bLocked ? 1.35 : 0.75);
    clampDevice(a, params);
  }
}

function pullPairTogether(a: Device, b: Device, amount: number, params: LayoutParams) {
  const ac = center(a);
  const bc = center(b);
  const vector = normalizeVector({ x: bc.x - ac.x, y: bc.y - ac.y }, 1);
  const aLocked = isAnchorDevice(a);
  const bLocked = isAnchorDevice(b);

  if (!aLocked) {
    a.x += vector.x * amount;
    a.y += vector.y * amount;
    clampDevice(a, params);
  }
  if (!bLocked) {
    b.x -= vector.x * amount;
    b.y -= vector.y * amount;
    clampDevice(b, params);
  }
}

function isAnchorDevice(device: Device): boolean {
  return device.type === "wellhead" || device.type === "manifold";
}

function getDevice(devices: Device[], id: string): Device {
  const device = devices.find((item) => item.id === id);
  if (!device) throw new Error(`Missing device ${id}`);
  return device;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function containsRect(a: Rect, b: Rect): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
}

function insideShape(rect: Rect, params: LayoutParams): boolean {
  if (params.shape === "rectangle") return true;
  if (params.shape === "notched") {
    const notch: Rect = { x: params.fieldWidth - 30, y: 0, width: 30, height: 24 };
    return !rectsOverlap(rect, notch);
  }
  const corner: Rect = { x: 0, y: 0, width: 22, height: 22 };
  return !rectsOverlap(rect, corner);
}

function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.hypot(dx, dy);
}

function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function connectedDevices(candidate: LayoutCandidate, device: Device): Device[] {
  const relatedIds = new Set(device.connectsTo);
  for (const other of candidate.devices) {
    if (other.connectsTo.includes(device.id)) relatedIds.add(other.id);
  }
  return candidate.devices.filter((item) => relatedIds.has(item.id));
}

function nearestRoadPoint(device: Device, roads: Road[]): Point {
  const c = center(device);
  let best = c;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const road of roads) {
    const point = {
      x: clamp(c.x, road.x, road.x + road.width),
      y: clamp(c.y, road.y, road.y + road.height),
    };
    const distance = pointDistance(c, point);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeVector(vector: Point, magnitude: number): Point {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 0.001) return { x: 0, y: 0 };
  return { x: (vector.x / length) * magnitude, y: (vector.y / length) * magnitude };
}

function lineIntersectsRect(a: Point, b: Point, rect: Rect): boolean {
  if (pointInsideRect(a, rect) || pointInsideRect(b, rect)) return true;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return corners.some((corner, index) => segmentsIntersect(a, b, corner, corners[(index + 1) % corners.length]));
}

function pointInsideRect(point: Point, rect: Rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const ccw = (p1: Point, p2: Point, p3: Point) => (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

function boundingBox(rects: Rect[]): Rect {
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function emptyScores(profileId: ScoreProfile): Scores {
  const profile = SCORE_PROFILES[profileId] ?? SCORE_PROFILES.balanced;
  return {
    total: 0,
    safetyCompliance: 0,
    collisionRate: 0,
    forbiddenAvoidance: 0,
    spaceUtilization: 0,
    spaceUtilizationScore: 0,
    roadAccessibility: 0,
    pipelineLength: 0,
    pipelineScore: 0,
    processRationality: 0,
    details: (Object.keys(profile.weights) as ScoreKey[]).map((key) => ({
      key,
      label: SCORE_LABELS[key],
      score: 0,
      weight: profile.weights[key],
      contribution: 0,
      explanation: "",
    })),
  };
}

function scaleLabel(scale: FracScale): string {
  return scale === "large" ? "大规模" : scale === "medium" ? "中等规模" : "小规模";
}

function mulberry32(seed: number) {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
