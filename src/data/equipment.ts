export type DeviceType =
  | "wellhead"
  | "manifold"
  | "fracPump"
  | "blender"
  | "sandTank"
  | "waterTank"
  | "additiveSkid"
  | "generator"
  | "controlCabin"
  | "fireZone";

export type YardShape = "rectangle" | "trapezoid" | "notched";
export type FracScale = "small" | "medium" | "large";
export type TemplateId = "compactRing" | "linearFlow" | "dualLane";
export type ScoreProfile = "balanced" | "safety" | "efficiency" | "cost" | "convenience" | "compact";
export type ScoreKey =
  | "safety"
  | "collision"
  | "forbidden"
  | "pipeline"
  | "road"
  | "process"
  | "utilization";

export interface EquipmentSpec {
  type: DeviceType;
  label: string;
  shortLabel: string;
  width: number;
  height: number;
  safetyDistance: number;
  preferredRotation: 0 | 90 | 180 | 270;
  color: string;
  category: "core" | "pressure" | "material" | "utility" | "safety";
  requiresRoad: boolean;
  zone: "highPressure" | "lowPressure" | "material" | "utility" | "emergency";
}

export interface CaseTemplate {
  id: TemplateId;
  name: string;
  description: string;
  preferredAspect: number;
  scaleFit: FracScale[];
  scoreBias: number;
}

export interface SampleCase {
  id: string;
  name: string;
  boundary: { width: number; height: number; shape: YardShape };
  scale: FracScale;
  templateId: TemplateId;
  equipmentSummary: Record<string, number>;
  ruleTags: string[];
}

export const EQUIPMENT_SPECS: Record<DeviceType, EquipmentSpec> = {
  wellhead: {
    type: "wellhead",
    label: "井口作业区",
    shortLabel: "井口",
    width: 8,
    height: 8,
    safetyDistance: 8,
    preferredRotation: 0,
    color: "#f59e0b",
    category: "core",
    requiresRoad: false,
    zone: "highPressure",
  },
  manifold: {
    type: "manifold",
    label: "高低压管汇撬",
    shortLabel: "管汇",
    width: 12,
    height: 6,
    safetyDistance: 6,
    preferredRotation: 0,
    color: "#ef4444",
    category: "core",
    requiresRoad: true,
    zone: "highPressure",
  },
  fracPump: {
    type: "fracPump",
    label: "压裂泵车",
    shortLabel: "压裂",
    width: 14,
    height: 3.8,
    safetyDistance: 3,
    preferredRotation: 0,
    color: "#2563eb",
    category: "pressure",
    requiresRoad: true,
    zone: "highPressure",
  },
  blender: {
    type: "blender",
    label: "混砂车",
    shortLabel: "混砂",
    width: 12,
    height: 4.5,
    safetyDistance: 5,
    preferredRotation: 0,
    color: "#0f766e",
    category: "material",
    requiresRoad: true,
    zone: "lowPressure",
  },
  sandTank: {
    type: "sandTank",
    label: "砂罐",
    shortLabel: "砂罐",
    width: 8,
    height: 8,
    safetyDistance: 4,
    preferredRotation: 0,
    color: "#ca8a04",
    category: "material",
    requiresRoad: true,
    zone: "material",
  },
  waterTank: {
    type: "waterTank",
    label: "水罐",
    shortLabel: "水罐",
    width: 10,
    height: 8,
    safetyDistance: 4,
    preferredRotation: 0,
    color: "#0891b2",
    category: "material",
    requiresRoad: true,
    zone: "material",
  },
  additiveSkid: {
    type: "additiveSkid",
    label: "化添撬",
    shortLabel: "化添",
    width: 8,
    height: 5,
    safetyDistance: 5,
    preferredRotation: 0,
    color: "#7c3aed",
    category: "material",
    requiresRoad: true,
    zone: "material",
  },
  generator: {
    type: "generator",
    label: "电源机组",
    shortLabel: "电源",
    width: 10,
    height: 4.5,
    safetyDistance: 10,
    preferredRotation: 0,
    color: "#64748b",
    category: "utility",
    requiresRoad: true,
    zone: "utility",
  },
  controlCabin: {
    type: "controlCabin",
    label: "仪表控制车",
    shortLabel: "仪控",
    width: 10,
    height: 5,
    safetyDistance: 8,
    preferredRotation: 0,
    color: "#16a34a",
    category: "utility",
    requiresRoad: true,
    zone: "utility",
  },
  fireZone: {
    type: "fireZone",
    label: "消防应急区",
    shortLabel: "消防",
    width: 12,
    height: 7,
    safetyDistance: 6,
    preferredRotation: 0,
    color: "#dc2626",
    category: "safety",
    requiresRoad: true,
    zone: "emergency",
  },
};

export const CASE_TEMPLATES: CaseTemplate[] = [
  {
    id: "compactRing",
    name: "环形通道紧凑方案",
    description: "井口与管汇居中，泵车双排靠近高压管汇，砂水化添沿混配侧集中。",
    preferredAspect: 1.25,
    scaleFit: ["small", "medium"],
    scoreBias: 3,
  },
  {
    id: "linearFlow",
    name: "线性工艺流方案",
    description: "物料区、混配区、增压区、井口区按工艺流线顺序展开。",
    preferredAspect: 1.75,
    scaleFit: ["medium", "large"],
    scoreBias: 2,
  },
  {
    id: "dualLane",
    name: "双通道检修方案",
    description: "泵车阵列布置在两条检修通道之间，适合大规模高排量作业。",
    preferredAspect: 1.45,
    scaleFit: ["large"],
    scoreBias: 4,
  },
];

export const SCORE_PROFILES: Record<ScoreProfile, { label: string; weights: Record<ScoreKey, number> }> = {
  balanced: {
    label: "综合均衡",
    weights: { safety: 0.24, collision: 0.18, forbidden: 0.08, pipeline: 0.16, road: 0.12, process: 0.14, utilization: 0.08 },
  },
  safety: {
    label: "安全优先",
    weights: { safety: 0.34, collision: 0.24, forbidden: 0.12, pipeline: 0.08, road: 0.1, process: 0.08, utilization: 0.04 },
  },
  efficiency: {
    label: "效率优先",
    weights: { safety: 0.16, collision: 0.1, forbidden: 0.03, pipeline: 0.24, road: 0.18, process: 0.22, utilization: 0.07 },
  },
  cost: {
    label: "成本优先",
    weights: { safety: 0.13, collision: 0.08, forbidden: 0.04, pipeline: 0.28, road: 0.15, process: 0.12, utilization: 0.2 },
  },
  convenience: {
    label: "施工便捷",
    weights: { safety: 0.17, collision: 0.1, forbidden: 0.04, pipeline: 0.13, road: 0.28, process: 0.22, utilization: 0.06 },
  },
  compact: {
    label: "占地最小",
    weights: { safety: 0.18, collision: 0.14, forbidden: 0.04, pipeline: 0.18, road: 0.06, process: 0.12, utilization: 0.28 },
  },
};

export const PUBLIC_RULE_NOTES = [
  "公开资料确认的强规则主要是碰撞避让、禁布区避让、危险区/逃生路线/集合点设置；设备间具体米数需按企业 HSE 或项目设计校核。",
  "压裂作业区应缩短高压管汇走向，物料区靠近入口和混砂车，形成砂/水/化学剂 -> 混砂 -> 压裂泵 -> 管汇 -> 井口的清晰流程。",
  "仪表车、电源和人员活动区应布置在高压核心区外侧，并保持道路可达，减少人员进入高压管线密集区。",
  "车辆进出、消防和应急疏散优先形成环形或双通道组织，避免大型车辆倒车、交叉和管线压占主通道。",
  "本原型内置的安全距离数值是可配置工程默认值；正式施工设计必须由项目标准、企业制度和 HSE 审查覆盖。",
];

export const SIMULATED_SAMPLE_CASES: SampleCase[] = [
  {
    id: "case-120x90-medium",
    name: "抽象案例 A：中等规模矩形井场",
    boundary: { width: 120, height: 90, shape: "rectangle" },
    scale: "medium",
    templateId: "compactRing",
    equipmentSummary: { fracPump: 8, sandTank: 4, waterTank: 3, additiveSkid: 2 },
    ruleTags: ["井口居中", "环形道路", "压裂车双排", "砂水同侧"],
  },
  {
    id: "case-160x90-large",
    name: "抽象案例 B：大规模长条井场",
    boundary: { width: 160, height: 90, shape: "rectangle" },
    scale: "large",
    templateId: "linearFlow",
    equipmentSummary: { fracPump: 12, sandTank: 6, waterTank: 4, additiveSkid: 2 },
    ruleTags: ["线性流程", "高压管线短", "道路分区"],
  },
  {
    id: "case-145x105-large",
    name: "抽象案例 C：带缺口边界大井场",
    boundary: { width: 145, height: 105, shape: "notched" },
    scale: "large",
    templateId: "dualLane",
    equipmentSummary: { fracPump: 10, sandTank: 5, waterTank: 4, additiveSkid: 2 },
    ruleTags: ["禁布区避让", "双通道", "设备分群"],
  },
];
