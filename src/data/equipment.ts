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
export type TerrainProfile = "flat" | "slope" | "valley" | "ridge" | "waterSensitive";
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
  | "utilization"
  | "terrain";

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
  terrainProfile: TerrainProfile;
  scale: FracScale;
  templateId: TemplateId;
  params: {
    fieldWidth: number;
    fieldHeight: number;
    shape: YardShape;
    terrainProfile: TerrainProfile;
    scale: FracScale;
    fracPumpCount: number;
    sandTankCount: number;
    waterTankCount: number;
    additiveSkidCount: number;
    enableForbiddenZone: boolean;
    optimizationIterations: number;
    scoreProfile: ScoreProfile;
  };
  equipmentSummary: Record<string, number>;
  ruleTags: string[];
}

export interface RuleMatrixItem {
  id: string;
  category: "硬约束" | "强惩罚约束" | "推荐约束" | "可配置默认值";
  target: string;
  rule: string;
  evidence: string;
  confidence: "高" | "中" | "低";
}

export const TERRAIN_PROFILES: Record<TerrainProfile, { label: string; description: string; optimizationFocus: string }> = {
  flat: {
    label: "平整平台",
    description: "场地高差小，优先压缩占地和管线长度。",
    optimizationFocus: "紧凑布置、管线短、道路环通",
  },
  slope: {
    label: "单向坡地",
    description: "场地沿南北向抬升，高压核心区避开低洼侧。",
    optimizationFocus: "沿等高线布置、低洼侧避让、排水通道保留",
  },
  valley: {
    label: "沟谷地势",
    description: "中部低洼，两侧抬升，需避开汇水沟和软弱带。",
    optimizationFocus: "设备分列、中心排水廊道避让、双通道检修",
  },
  ridge: {
    label: "台脊地势",
    description: "中部高、边缘低，井口和管汇优先布置在稳定高台。",
    optimizationFocus: "核心上台、物料外缘、边坡安全退让",
  },
  waterSensitive: {
    label: "水敏/环保区",
    description: "低洼侧和敏感边界需要更强避让，减少液体设备泄漏影响。",
    optimizationFocus: "水罐/化添远离敏感区、管线少穿越、道路应急可达",
  },
};

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
    weights: { safety: 0.21, collision: 0.16, forbidden: 0.08, pipeline: 0.15, road: 0.11, process: 0.13, utilization: 0.07, terrain: 0.09 },
  },
  safety: {
    label: "安全优先",
    weights: { safety: 0.31, collision: 0.22, forbidden: 0.11, pipeline: 0.07, road: 0.09, process: 0.07, utilization: 0.03, terrain: 0.1 },
  },
  efficiency: {
    label: "效率优先",
    weights: { safety: 0.14, collision: 0.09, forbidden: 0.03, pipeline: 0.23, road: 0.17, process: 0.2, utilization: 0.06, terrain: 0.08 },
  },
  cost: {
    label: "成本优先",
    weights: { safety: 0.12, collision: 0.07, forbidden: 0.04, pipeline: 0.26, road: 0.14, process: 0.11, utilization: 0.18, terrain: 0.08 },
  },
  convenience: {
    label: "施工便捷",
    weights: { safety: 0.15, collision: 0.09, forbidden: 0.04, pipeline: 0.12, road: 0.26, process: 0.2, utilization: 0.05, terrain: 0.09 },
  },
  compact: {
    label: "占地最小",
    weights: { safety: 0.16, collision: 0.13, forbidden: 0.04, pipeline: 0.17, road: 0.05, process: 0.11, utilization: 0.25, terrain: 0.09 },
  },
};

export const PUBLIC_RULE_NOTES = [
  "公开资料确认的强规则主要是碰撞避让、禁布区避让、危险区/逃生路线/集合点设置；设备间具体米数需按企业 HSE 或项目设计校核。",
  "压裂作业区应缩短高压管汇走向，物料区靠近入口和混砂车，形成砂/水/化学剂 -> 混砂 -> 压裂泵 -> 管汇 -> 井口的清晰流程。",
  "仪表车、电源和人员活动区应布置在高压核心区外侧，并保持道路可达，减少人员进入高压管线密集区。",
  "车辆进出、消防和应急疏散优先形成环形或双通道组织，避免大型车辆倒车、交叉和管线压占主通道。",
  "本原型内置的安全距离数值是可配置工程默认值；正式施工设计必须由项目标准、企业制度和 HSE 审查覆盖。",
  "环境地势会改变优化倾向：坡地沿等高线布置，沟谷避开汇水廊道，水敏场景强化液体设备和管线避让。",
];

export const RULE_MATRIX: RuleMatrixItem[] = [
  {
    id: "R-HARD-COLLISION",
    category: "硬约束",
    target: "全部设备",
    rule: "设备矩形不得相交，碰撞率目标为 0。",
    evidence: "设备占地几何校核；公开安全原则要求避免车辆与设备互相占压。",
    confidence: "高",
  },
  {
    id: "R-HARD-BOUNDARY",
    category: "硬约束",
    target: "全部设备、井场边界",
    rule: "设备必须位于可布置边界内，缺口和斜边退让按不可布置空间处理。",
    evidence: "井场边界、坡坎、地下管线或环境敏感区均应在布置前显式标定。",
    confidence: "高",
  },
  {
    id: "R-HARD-FORBIDDEN",
    category: "硬约束",
    target: "设备、管线、禁布区",
    rule: "设备不得占用禁布区，管线穿越禁布区需报警并强惩罚。",
    evidence: "API RP 100-2、现场排水围控和环境敏感区避让原则。",
    confidence: "高",
  },
  {
    id: "R-FLOW-CHAIN",
    category: "推荐约束",
    target: "砂/水/化添、混砂、泵车、管汇、井口",
    rule: "物料、混砂、增压、管汇、井口应形成清晰工艺链。",
    evidence: "压裂井场分区与高压管汇走向优化原则。",
    confidence: "高",
  },
  {
    id: "R-ROAD-ACCESS",
    category: "强惩罚约束",
    target: "需装卸、检修和应急到达的设备",
    rule: "需道路服务设备应保持道路可达，减少倒车、交叉和穿越高压核心区。",
    evidence: "OSHA 对车辆交通、移动设备和砂料运输风险的公开提示。",
    confidence: "中",
  },
  {
    id: "R-PIPE-SHORT",
    category: "推荐约束",
    target: "管汇、压裂泵车、井口及连接管线",
    rule: "高压管线尽量短、交叉少、转弯少，优先压缩管汇-泵车-井口链路。",
    evidence: "电动压裂井场布置优化和设施布局优化文献的共同目标。",
    confidence: "高",
  },
  {
    id: "R-CONFIG-SAFETY",
    category: "可配置默认值",
    target: "设备间距和安全缓冲",
    rule: "设备间米数作为原型评分默认值，不宣称为通用强制标准。",
    evidence: "正式施工设计需由企业 HSE、项目标准和现场审查替换或确认。",
    confidence: "低",
  },
];

export const SIMULATED_SAMPLE_CASES: SampleCase[] = [
  {
    id: "case-120x90-medium",
    name: "抽象案例 A：中等规模矩形井场",
    boundary: { width: 120, height: 90, shape: "rectangle" },
    terrainProfile: "flat",
    scale: "medium",
    templateId: "compactRing",
    params: {
      fieldWidth: 120,
      fieldHeight: 90,
      shape: "rectangle",
      terrainProfile: "flat",
      scale: "medium",
      fracPumpCount: 8,
      sandTankCount: 4,
      waterTankCount: 3,
      additiveSkidCount: 2,
      enableForbiddenZone: true,
      optimizationIterations: 180,
      scoreProfile: "balanced",
    },
    equipmentSummary: { fracPump: 8, sandTank: 4, waterTank: 3, additiveSkid: 2 },
    ruleTags: ["井口居中", "环形道路", "压裂车双排", "砂水同侧"],
  },
  {
    id: "case-160x90-large",
    name: "抽象案例 B：大规模长条井场",
    boundary: { width: 160, height: 90, shape: "rectangle" },
    terrainProfile: "slope",
    scale: "large",
    templateId: "linearFlow",
    params: {
      fieldWidth: 160,
      fieldHeight: 90,
      shape: "rectangle",
      terrainProfile: "slope",
      scale: "large",
      fracPumpCount: 12,
      sandTankCount: 6,
      waterTankCount: 4,
      additiveSkidCount: 2,
      enableForbiddenZone: true,
      optimizationIterations: 180,
      scoreProfile: "balanced",
    },
    equipmentSummary: { fracPump: 12, sandTank: 6, waterTank: 4, additiveSkid: 2 },
    ruleTags: ["线性流程", "高压管线短", "道路分区"],
  },
  {
    id: "case-145x105-large",
    name: "抽象案例 C：带缺口边界大井场",
    boundary: { width: 145, height: 105, shape: "notched" },
    terrainProfile: "valley",
    scale: "large",
    templateId: "dualLane",
    params: {
      fieldWidth: 145,
      fieldHeight: 105,
      shape: "notched",
      terrainProfile: "valley",
      scale: "large",
      fracPumpCount: 10,
      sandTankCount: 5,
      waterTankCount: 4,
      additiveSkidCount: 2,
      enableForbiddenZone: true,
      optimizationIterations: 180,
      scoreProfile: "balanced",
    },
    equipmentSummary: { fracPump: 10, sandTank: 5, waterTank: 4, additiveSkid: 2 },
    ruleTags: ["禁布区避让", "双通道", "设备分群"],
  },
];
