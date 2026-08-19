const fs = require("fs");
const path = require("path");
const ts = require("typescript");

require.extensions[".ts"] = function registerTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  EQUIPMENT_SPECS,
  RULE_MATRIX,
  SCORE_PROFILES,
  SIMULATED_SAMPLE_CASES,
  TERRAIN_PROFILES,
} = require("../src/data/equipment.ts");
const {
  generateLayoutOptions,
  getConnectedDeviceNames,
  runIterativeOptimization,
} = require("../src/lib/layoutEngine.ts");
const { getBoundaryWorldPoints } = require("../src/lib/fieldGeometry.ts");

const root = path.resolve(__dirname, "..", "..");
const packageDir = path.join(root, "压裂井场智能布局系统_初赛匿名材料包");
const dataDir = path.join(packageDir, "06_数据与支撑");
const dxfDir = path.join(packageDir, "04_CAD_DXF");

const caseKeys = [
  { key: "case_a_medium_rectangle", label: "中等规模矩形井场" },
  { key: "case_b_large_linear", label: "大规模长条井场" },
  { key: "case_c_large_notched", label: "带缺口边界大井场" },
];

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(dxfDir, { recursive: true });

function toPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function scaleText(scale) {
  if (scale === "large") return "大规模";
  if (scale === "medium") return "中等规模";
  return "小规模";
}

function createExportPayload(candidate, iterationResult) {
  const optimizationTrace = iterationResult
    ? {
        rounds: iterationResult.rounds,
        initialBestScore: Number(iterationResult.initialBestScore.toFixed(2)),
        finalBestScore: Number(iterationResult.finalBestScore.toFixed(2)),
        improvement: Number(iterationResult.improvement.toFixed(2)),
        averageFinalScore: Number(iterationResult.averageFinalScore.toFixed(2)),
        latest: iterationResult.history[iterationResult.history.length - 1] ?? null,
        history: iterationResult.history.map((item) => ({
          iteration: item.iteration,
          bestScore: Number(item.bestScore.toFixed(2)),
          averageScore: Number(item.averageScore.toFixed(2)),
          hardViolationCount: item.hardViolationCount,
          warningCount: item.warningCount,
          pipelineLength: Number(item.pipelineLength.toFixed(2)),
          safetyCompliance: Number(item.safetyCompliance.toFixed(4)),
          roadAccessibility: Number(item.roadAccessibility.toFixed(4)),
          processRationality: Number(item.processRationality.toFixed(4)),
          terrainAdaptability: Number(item.terrainAdaptability.toFixed(4)),
          templateName: item.templateName,
        })),
      }
    : null;

  return {
    id: candidate.id,
    name: candidate.name,
    template: { id: candidate.templateId, name: candidate.templateName },
    params: candidate.params,
    environmentStrategy: {
      label: TERRAIN_PROFILES[candidate.params.terrainProfile].label,
      description: TERRAIN_PROFILES[candidate.params.terrainProfile].description,
      optimizationFocus: TERRAIN_PROFILES[candidate.params.terrainProfile].optimizationFocus,
      terrainAdaptability: candidate.scores.terrainAdaptability,
    },
    devices: candidate.devices.map((device) => ({
      id: device.id,
      name: device.name,
      type: device.type,
      typeLabel: EQUIPMENT_SPECS[device.type].label,
      x: Number(device.x.toFixed(2)),
      y: Number(device.y.toFixed(2)),
      width: device.width,
      height: device.height,
      rotation: device.rotation,
      safetyDistance: device.safetyDistance,
      connectsTo: device.connectsTo,
      connectionNames: getConnectedDeviceNames(candidate, device),
      violations: candidate.violations
        .filter((violation) => violation.deviceIds.includes(device.id))
        .map((violation) => violation.message),
    })),
    roads: candidate.roads,
    forbiddenZones: candidate.forbiddenZones,
    connections: candidate.devices.flatMap((device) =>
      device.connectsTo.map((targetId) => ({ from: device.id, to: targetId })),
    ),
    scores: candidate.scores,
    violations: candidate.violations,
    explanation: candidate.explanation,
    optimizationTrace,
  };
}

function createReportSummary(caseInfo, candidate, payload) {
  const equipmentCounts = payload.devices.reduce((counts, device) => {
    counts[device.typeLabel] = (counts[device.typeLabel] ?? 0) + 1;
    return counts;
  }, {});
  const countText = Object.entries(equipmentCounts)
    .map(([label, count]) => `${label}${count}台套`)
    .join("、");
  const scoreRows = candidate.scores.details
    .map(
      (detail) =>
        `| ${detail.label} | ${(detail.score * 100).toFixed(1)}% | ${detail.weight.toFixed(2)} | ${detail.contribution.toFixed(1)} | ${detail.explanation} |`,
    )
    .join("\n");
  const ruleRows = RULE_MATRIX.map(
    (rule) => `| ${rule.id} | ${rule.category} | ${rule.target} | ${rule.confidence} | ${rule.rule} | ${rule.evidence} |`,
  ).join("\n");
  const warnings = candidate.violations
    .slice(0, 8)
    .map((violation, index) => `${index + 1}. ${violation.message}`)
    .join("\n");

  return [
    `# ${caseInfo.label} 报告证据摘要`,
    "",
    "## 输入参数",
    `- 井场尺寸：${candidate.params.fieldWidth}m x ${candidate.params.fieldHeight}m`,
    `- 地形边界：${candidate.params.shape}`,
    `- 环境地势：${payload.environmentStrategy.label}（${payload.environmentStrategy.optimizationFocus}）`,
    `- 压裂规模：${scaleText(candidate.params.scale)}`,
    `- 评分画像：${SCORE_PROFILES[candidate.params.scoreProfile].label}`,
    `- 设备构成：${countText}`,
    `- 禁布区：${candidate.params.enableForbiddenZone ? "启用" : "未启用"}`,
    `- 优化迭代次数：${candidate.params.optimizationIterations}`,
    "",
    "## 方案结果",
    `- 模板：${candidate.templateName}`,
    `- 综合评分：${candidate.scores.total.toFixed(1)}`,
    `- 安全合规率：${toPercent(candidate.scores.safetyCompliance)}`,
    `- 碰撞率：${toPercent(candidate.scores.collisionRate)}`,
    `- 道路通达性：${toPercent(candidate.scores.roadAccessibility)}`,
    `- 环境适配性：${toPercent(candidate.scores.terrainAdaptability)}`,
    `- 空间利用率：${toPercent(candidate.scores.spaceUtilization)}`,
    `- 管线总长：${candidate.scores.pipelineLength.toFixed(1)}m`,
    `- 告警数量：${candidate.violations.length}`,
    "",
    "## 评分分解",
    "| 指标 | 子项得分 | 权重 | 贡献分 | 解释 |",
    "| --- | ---: | ---: | ---: | --- |",
    scoreRows,
    "",
    "## 主要告警",
    warnings || "当前方案无硬碰撞、越界或禁布区占用。",
    "",
    "## 规则依据矩阵",
    "| 编号 | 类别 | 对象 | 置信度 | 规则 | 依据说明 |",
    "| --- | --- | --- | --- | --- | --- |",
    ruleRows,
    "",
    "## 导出说明",
    "- PNG 用于报告插图和评审快速浏览。",
    "- JSON 保留 params、devices、roads、forbiddenZones、connections、scores、violations、explanation 与 optimizationTrace 字段，可用于复核。",
    "- DXF 按 BOUNDARY、ROAD、FORBIDDEN、PIPELINE、LABEL 和设备类型分层，可作为 CAD 图样支撑。",
  ].join("\n");
}

function createDxf(candidate) {
  const lines = ["0", "SECTION", "2", "ENTITIES"];
  const addLine = (x1, y1, x2, y2, layer = "0") => {
    lines.push("0", "LINE", "8", layer, "10", String(x1), "20", String(-y1), "11", String(x2), "21", String(-y2));
  };
  const addText = (x, y, text, layer = "TEXT") => {
    lines.push("0", "TEXT", "8", layer, "10", String(x), "20", String(-y), "40", "2.5", "1", text);
  };
  const addPolygon = (points, layer) => {
    points.forEach(([x1, y1], index) => {
      const [x2, y2] = points[(index + 1) % points.length];
      addLine(x1, y1, x2, y2, layer);
    });
  };
  const addRect = (rect, layer) => {
    addLine(rect.x, rect.y, rect.x + rect.width, rect.y, layer);
    addLine(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, layer);
    addLine(rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height, layer);
    addLine(rect.x, rect.y + rect.height, rect.x, rect.y, layer);
  };

  addPolygon(getBoundaryWorldPoints(candidate.params), "BOUNDARY");
  candidate.roads.forEach((road) => {
    addRect(road, "ROAD");
    addText(road.x + 2, road.y + 4, road.name, "LABEL");
  });
  candidate.forbiddenZones.forEach((zone) => {
    addRect(zone, "FORBIDDEN");
    addText(zone.x + 1, zone.y + 4, zone.name, "LABEL");
  });
  candidate.devices.forEach((device) => {
    addRect(device, `DEVICE_${device.type}`);
    addText(device.x + 1, device.y + Math.max(3, device.height / 2), device.name, "LABEL");
  });
  candidate.devices.forEach((device) => {
    device.connectsTo.forEach((targetId) => {
      const target = candidate.devices.find((item) => item.id === targetId);
      if (!target) return;
      addLine(
        device.x + device.width / 2,
        device.y + device.height / 2,
        target.x + target.width / 2,
        target.y + target.height / 2,
        "PIPELINE",
      );
    });
  });
  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n");
}

const summaries = SIMULATED_SAMPLE_CASES.map((sample, index) => {
  const caseInfo = caseKeys[index];
  const candidate = generateLayoutOptions(sample.params)[0];
  const iterationResult = runIterativeOptimization(sample.params, 100);
  const payload = createExportPayload(candidate, iterationResult);
  const baseName = `06_${caseInfo.key}_${caseInfo.label}`;
  fs.writeFileSync(path.join(dataDir, `${baseName}_layout.json`), JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(path.join(dataDir, `case_${index + 1}_evidence_summary.md`), createReportSummary(caseInfo, candidate, payload), "utf8");
  fs.writeFileSync(path.join(dxfDir, `04_${caseInfo.key}_${caseInfo.label}.dxf`), createDxf(candidate), "utf8");

  return {
    case_key: caseInfo.key,
    case_name: caseInfo.label,
    sample_name: sample.name,
    field_size: `${candidate.params.fieldWidth}m x ${candidate.params.fieldHeight}m`,
    field_width: candidate.params.fieldWidth,
    field_height: candidate.params.fieldHeight,
    shape: candidate.params.shape,
    terrain_profile: candidate.params.terrainProfile,
    terrain_label: payload.environmentStrategy.label,
    terrain_focus: payload.environmentStrategy.optimizationFocus,
    scale: scaleText(candidate.params.scale),
    equipment_count: candidate.devices.length,
    frac_pump_count: candidate.params.fracPumpCount,
    sand_tank_count: candidate.params.sandTankCount,
    water_tank_count: candidate.params.waterTankCount,
    additive_skid_count: candidate.params.additiveSkidCount,
    template: candidate.templateName,
    total_score: Number(candidate.scores.total.toFixed(1)),
    safety_compliance: toPercent(candidate.scores.safetyCompliance),
    collision_rate: toPercent(candidate.scores.collisionRate),
    road_accessibility: toPercent(candidate.scores.roadAccessibility),
    terrain_adaptability: toPercent(candidate.scores.terrainAdaptability),
    process_rationality: toPercent(candidate.scores.processRationality),
    space_utilization: toPercent(candidate.scores.spaceUtilization),
    pipeline_length_m: Number(candidate.scores.pipelineLength.toFixed(1)),
    warning_count: candidate.violations.length,
    optimization_improvement: Number(iterationResult.improvement.toFixed(2)),
    final_best_score: Number(iterationResult.finalBestScore.toFixed(2)),
    rule_tags: sample.ruleTags,
  };
});

fs.writeFileSync(path.join(dataDir, "case_results_report_summary.json"), JSON.stringify(summaries, null, 2), "utf8");
fs.writeFileSync(path.join(dataDir, "06_典型案例结果汇总.json"), JSON.stringify(summaries, null, 2), "utf8");
console.log(JSON.stringify({ summaries, dataDir, dxfDir }, null, 2));
