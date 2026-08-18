import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Konva from "konva";
import {
  Activity,
  ArrowDownToLine,
  Boxes,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  Network,
  RefreshCcw,
  Route,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { YardScene3D } from "./components/YardScene3D";
import {
  EQUIPMENT_SPECS,
  PUBLIC_RULE_NOTES,
  RULE_MATRIX,
  SCORE_PROFILES,
  SIMULATED_SAMPLE_CASES,
  type SampleCase,
  type FracScale,
  type ScoreProfile,
  type YardShape,
} from "./data/equipment";
import {
  createDefaultParams,
  generateLayoutOptions,
  getConnectedDeviceNames,
  moveDevice,
  runIterativeOptimization,
  type Device,
  type IterativeOptimizationResult,
  type LayoutCandidate,
  type LayoutParams,
  type Rect as LayoutRect,
  type Violation,
} from "./lib/layoutEngine";
import { getBoundaryWorldPoints } from "./lib/fieldGeometry";

const STAGE_WIDTH = 900;
const STAGE_HEIGHT = 640;
const PAD = 34;

const scaleOptions: Array<{ value: FracScale; label: string }> = [
  { value: "small", label: "小规模" },
  { value: "medium", label: "中等规模" },
  { value: "large", label: "大规模" },
];

const shapeOptions: Array<{ value: YardShape; label: string }> = [
  { value: "rectangle", label: "矩形" },
  { value: "trapezoid", label: "梯形近似" },
  { value: "notched", label: "缺口边界" },
];

const profileOptions = (Object.keys(SCORE_PROFILES) as ScoreProfile[]).map((value) => ({
  value,
  label: SCORE_PROFILES[value].label,
}));

interface LayerState {
  safety: boolean;
  pipelines: boolean;
  roads: boolean;
  forbidden: boolean;
  labels: boolean;
  heatmap: boolean;
}

type ViewMode = "2d" | "3d";

const defaultLayers: LayerState = {
  safety: true,
  pipelines: true,
  roads: true,
  forbidden: true,
  labels: true,
  heatmap: false,
};

function App() {
  const stageRef = useRef<Konva.Stage>(null);
  const [params, setParams] = useState<LayoutParams>(() => createDefaultParams());
  const [candidates, setCandidates] = useState<LayoutCandidate[]>(() => generateLayoutOptions(createDefaultParams()));
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerState>(defaultLayers);
  const [paramsDirty, setParamsDirty] = useState(false);
  const [iterating, setIterating] = useState(false);
  const [iterationResult, setIterationResult] = useState<IterativeOptimizationResult | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const active = candidates[activeIndex];

  const view = useMemo(() => {
    const scale = Math.min((STAGE_WIDTH - PAD * 2) / active.params.fieldWidth, (STAGE_HEIGHT - PAD * 2) / active.params.fieldHeight);
    const offsetX = (STAGE_WIDTH - active.params.fieldWidth * scale) / 2;
    const offsetY = (STAGE_HEIGHT - active.params.fieldHeight * scale) / 2;
    return { scale, offsetX, offsetY };
  }, [active.params.fieldHeight, active.params.fieldWidth]);

  const selectedDevice = active.devices.find((device) => device.id === selectedDeviceId) ?? active.devices[0];
  const selectedViolations = selectedDevice
    ? active.violations.filter((violation) => violation.deviceIds.includes(selectedDevice.id))
    : [];
  const highRiskCount = active.violations.filter((violation) => violation.severity === "high").length;
  const mediumRiskCount = active.violations.filter((violation) => violation.severity === "medium").length;

  useEffect(() => {
    setSelectedDeviceId((current) => {
      if (current && active.devices.some((device) => device.id === current)) return current;
      return active.devices[0]?.id ?? null;
    });
  }, [active.devices]);

  const regenerate = () => {
    const next = generateLayoutOptions(params);
    setCandidates(next);
    setActiveIndex(0);
    setSelectedDeviceId(next[0]?.devices[0]?.id ?? null);
    setParamsDirty(false);
  };

  const reset = () => {
    const defaults = createDefaultParams();
    const next = generateLayoutOptions(defaults);
    setParams(defaults);
    setCandidates(next);
    setActiveIndex(0);
    setSelectedDeviceId(next[0]?.devices[0]?.id ?? null);
    setParamsDirty(false);
    setIterationResult(null);
  };

  const loadSampleCase = (sample: SampleCase) => {
    const next = generateLayoutOptions(sample.params);
    setParams({ ...sample.params });
    setCandidates(next);
    setActiveIndex(0);
    setSelectedDeviceId(next[0]?.devices[0]?.id ?? null);
    setParamsDirty(false);
    setIterationResult(null);
  };

  const updateParam = <K extends keyof LayoutParams>(key: K, value: LayoutParams[K]) => {
    setParams((current) => ({ ...current, [key]: value }));
    setParamsDirty(true);
    setIterationResult(null);
  };

  const runHundredIterations = () => {
    setIterating(true);
    window.setTimeout(() => {
      const result = runIterativeOptimization(params, 100);
      setIterationResult(result);
      setCandidates((current) => {
        const preserved = current.filter((candidate) => candidate.id !== result.best.id);
        return [result.best, ...preserved].slice(0, 4);
      });
      setActiveIndex(0);
      setSelectedDeviceId(result.best.devices[0]?.id ?? null);
      setParamsDirty(false);
      setIterating(false);
    }, 16);
  };

  const updateActiveCandidate = (candidate: LayoutCandidate) => {
    setCandidates((items) => items.map((item, index) => (index === activeIndex ? candidate : item)));
  };

  const handleDragEnd = (device: Device, x: number, y: number) => {
    const world = screenToWorld(x, y, view);
    updateActiveCandidate(moveDevice(active, device.id, world.x, world.y));
  };

  const exportPng = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const url = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
    downloadUrl(url, `${active.name}-压裂井场布局.png`);
  };

  const exportJson = () => {
    downloadText(JSON.stringify(createExportPayload(active, iterationResult), null, 2), `${active.name}-layout.json`, "application/json;charset=utf-8");
  };

  const exportDxf = () => {
    downloadText(createDxf(active), `${active.name}-layout.dxf`, "application/dxf;charset=utf-8");
  };

  const exportReportSummary = () => {
    downloadText(createReportSummary(active), `${active.name}-报告证据摘要.md`, "text/markdown;charset=utf-8");
  };

  const toggleLayer = (key: keyof LayerState) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <main className="app-shell">
      <aside className="control-panel">
        <div className="brand-block">
          <div className="brand-row">
            <div className="brand-mark">FracAI</div>
            <span>能源装备竞赛系统</span>
          </div>
          <h1>压裂井场布局智能生成原型</h1>
          <p>规则约束、多目标优化与可解释评分的一体化工作台</p>
        </div>

        <section className="panel-section">
          <div className="section-title">
            <SlidersHorizontal size={17} />
            <span>输入参数</span>
          </div>
          <NumberField label="井场长度 m" min={80} max={220} value={params.fieldWidth} onChange={(fieldWidth) => updateParam("fieldWidth", fieldWidth)} />
          <NumberField label="井场宽度 m" min={60} max={160} value={params.fieldHeight} onChange={(fieldHeight) => updateParam("fieldHeight", fieldHeight)} />
          <SelectField label="地形边界" value={params.shape} options={shapeOptions} onChange={(shape) => updateParam("shape", shape)} />
          <SelectField label="压裂规模" value={params.scale} options={scaleOptions} onChange={(scale) => updateParam("scale", scale)} />
          <SelectField
            label="评分偏向"
            value={params.scoreProfile}
            options={profileOptions}
            onChange={(scoreProfile) => updateParam("scoreProfile", scoreProfile)}
          />
          <NumberField
            label="压裂泵车数量"
            min={4}
            max={16}
            value={params.fracPumpCount}
            onChange={(fracPumpCount) => updateParam("fracPumpCount", fracPumpCount)}
          />
          <NumberField
            label="砂罐数量"
            min={2}
            max={8}
            value={params.sandTankCount}
            onChange={(sandTankCount) => updateParam("sandTankCount", sandTankCount)}
          />
          <NumberField
            label="水罐数量"
            min={1}
            max={6}
            value={params.waterTankCount}
            onChange={(waterTankCount) => updateParam("waterTankCount", waterTankCount)}
          />
          <NumberField
            label="化添撬数量"
            min={1}
            max={4}
            value={params.additiveSkidCount}
            onChange={(additiveSkidCount) => updateParam("additiveSkidCount", additiveSkidCount)}
          />
          <label className="toggle-row">
            <span>启用禁布区</span>
            <input
              type="checkbox"
              checked={params.enableForbiddenZone}
              onChange={(event) => updateParam("enableForbiddenZone", event.target.checked)}
            />
          </label>
          <NumberField
            label="优化迭代次数"
            min={20}
            max={600}
            value={params.optimizationIterations}
            onChange={(optimizationIterations) => updateParam("optimizationIterations", optimizationIterations)}
          />
          <div className="button-grid">
            <button className="primary-button" onClick={regenerate}>
              <RefreshCcw size={16} />
              {paramsDirty ? "重新生成" : "生成方案"}
            </button>
            <button className="ghost-button" onClick={reset}>
              <RotateCcw size={16} />
              重置
            </button>
            <button className="tertiary-button wide" onClick={runHundredIterations} disabled={iterating}>
              <Activity size={16} />
              {iterating ? "迭代中" : "100轮迭代"}
            </button>
          </div>
          {iterationResult ? <IterationSummary result={iterationResult} /> : null}
        </section>

        <section className="panel-section sample-loader">
          <div className="section-title">典型案例复现</div>
          {SIMULATED_SAMPLE_CASES.map((sample) => (
            <button key={sample.id} className="sample-button" onClick={() => loadSampleCase(sample)}>
              <strong>{sample.name.replace("抽象案例 ", "案例 ")}</strong>
              <span>
                {sample.boundary.width}m x {sample.boundary.height}m / {scaleText(sample.scale)} / {sample.ruleTags.slice(0, 2).join("、")}
              </span>
            </button>
          ))}
        </section>

        <section className="panel-section">
          <div className="section-title">图层控制</div>
          <LayerToggle label="安全缓冲区" active={layers.safety} onClick={() => toggleLayer("safety")} />
          <LayerToggle label="管线" active={layers.pipelines} onClick={() => toggleLayer("pipelines")} />
          <LayerToggle label="道路" active={layers.roads} onClick={() => toggleLayer("roads")} />
          <LayerToggle label="禁布区" active={layers.forbidden} onClick={() => toggleLayer("forbidden")} />
          <LayerToggle label="设备标签" active={layers.labels} onClick={() => toggleLayer("labels")} />
          <LayerToggle label="评分热区" active={layers.heatmap} onClick={() => toggleLayer("heatmap")} />
        </section>

        <section className="panel-section compact-list">
          <div className="section-title">规则摘要</div>
          {PUBLIC_RULE_NOTES.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </section>
      </aside>

      <section className="workspace">
        <div className="workspace-toolbar">
          <div>
            <strong>井场方案优化工作台</strong>
            <span>
              {active.templateName} / {active.params.fieldWidth}m x {active.params.fieldHeight}m / {SCORE_PROFILES[active.params.scoreProfile].label}
            </span>
          </div>
          <div className={`operation-state ${paramsDirty ? "dirty" : ""}`}>
            <Activity size={16} />
            <span>{paramsDirty ? "参数待生成" : "模型已同步"}</span>
          </div>
          <div className="view-mode-switch" aria-label="切换布局视图">
            <button className={viewMode === "2d" ? "active" : ""} onClick={() => setViewMode("2d")}>
              2D
            </button>
            <button className={viewMode === "3d" ? "active" : ""} onClick={() => setViewMode("3d")}>
              3D
            </button>
          </div>
          <div className="export-actions">
            <button onClick={exportPng} title="导出 PNG 图片">
              <Download size={16} />
              PNG
            </button>
            <button onClick={exportJson} title="导出布局 JSON">
              <FileJson size={16} />
              JSON
            </button>
            <button onClick={exportDxf} title="导出简化 CAD DXF">
              <ArrowDownToLine size={16} />
              DXF
            </button>
            <button onClick={exportReportSummary} title="导出报告证据摘要">
              <FileText size={16} />
              摘要
            </button>
          </div>
        </div>

        <div className="workspace-kpis">
          <StatusTile icon={<ShieldCheck size={18} />} label="安全合规" value={toPercent(active.scores.safetyCompliance)} tone="green" />
          <StatusTile icon={<Network size={18} />} label="管线评分" value={toPercent(active.scores.pipelineScore)} tone="cyan" />
          <StatusTile icon={<Route size={18} />} label="道路通达" value={toPercent(active.scores.roadAccessibility)} tone="amber" />
          <StatusTile icon={<Boxes size={18} />} label="设备数量" value={`${active.devices.length} 台套`} tone="steel" />
        </div>

        <div className="canvas-wrap">
          {viewMode === "2d" ? (
            <Stage ref={stageRef} width={STAGE_WIDTH} height={STAGE_HEIGHT} className="stage">
              <Layer>
                <Rect x={0} y={0} width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="#07111f" />
                <Grid view={view} params={active.params} />
                <Boundary view={view} params={active.params} />
                {layers.roads ? active.roads.map((road) => <RoadShape key={road.id} road={road} view={view} />) : null}
                {layers.forbidden ? active.forbiddenZones.map((zone) => <ForbiddenShape key={zone.id} zone={zone} view={view} />) : null}
                {layers.heatmap ? <HeatmapLayer candidate={active} view={view} /> : null}
                {layers.pipelines ? <PipelineLayer candidate={active} view={view} /> : null}
                {active.devices.map((device) => (
                  <DeviceShape
                    key={device.id}
                    device={device}
                    selected={device.id === selectedDeviceId}
                    view={view}
                    warning={active.violations.some((violation) => violation.deviceIds.includes(device.id))}
                    showSafety={layers.safety}
                    showLabel={layers.labels}
                    onSelect={() => setSelectedDeviceId(device.id)}
                    onDragEnd={(x, y) => handleDragEnd(device, x, y)}
                  />
                ))}
              </Layer>
            </Stage>
          ) : (
            <YardScene3D candidate={active} layers={layers} selectedDeviceId={selectedDeviceId} onSelectDevice={setSelectedDeviceId} />
          )}
        </div>
      </section>

      <aside className="result-panel">
        <section className="ops-summary">
          <div>
            <span>当前方案</span>
            <strong>{active.name}</strong>
          </div>
          <div className="risk-badges">
            <b>{highRiskCount} 高风险</b>
            <b>{mediumRiskCount} 中风险</b>
          </div>
        </section>

        <section className="panel-section schemes">
          <div className="section-title">候选方案排序</div>
          {candidates.map((candidate, index) => (
            <button key={candidate.id} className={`scheme-card ${index === activeIndex ? "active" : ""}`} onClick={() => setActiveIndex(index)}>
              <span>{candidate.name}</span>
              <strong>{candidate.scores.total.toFixed(1)}</strong>
              <small>
                {candidate.templateName} / {candidate.violations.length} 项告警 / 管线 {candidate.scores.pipelineLength.toFixed(1)}m
              </small>
            </button>
          ))}
        </section>

        <section className="score-board">
          <Gauge label="综合评分" value={active.scores.total} suffix="" max={100} />
          <Metric label="安全合规率" value={toPercent(active.scores.safetyCompliance)} />
          <Metric label="空间利用率" value={toPercent(active.scores.spaceUtilization)} />
          <Metric label="道路通达性" value={toPercent(active.scores.roadAccessibility)} />
          <Metric label="碰撞率" value={toPercent(active.scores.collisionRate)} danger={active.scores.collisionRate > 0} />
          <Metric label="管线总长" value={`${active.scores.pipelineLength.toFixed(1)} m`} />
          <Metric label="流程合理性" value={toPercent(active.scores.processRationality)} />
        </section>

        <section className="panel-section score-details">
          <div className="section-title">评分解释</div>
          {active.scores.details.map((detail) => (
            <div key={detail.key} className="score-detail-row">
              <div>
                <strong>{detail.label}</strong>
                <span>{detail.explanation}</span>
              </div>
              <b>{detail.contribution.toFixed(1)}</b>
            </div>
          ))}
        </section>

        <section className="panel-section rule-matrix">
          <div className="section-title">规则依据矩阵</div>
          {RULE_MATRIX.map((rule) => (
            <div key={rule.id} className="rule-card">
              <div>
                <strong>{rule.id}</strong>
                <span>{rule.category}</span>
              </div>
              <p>{rule.rule}</p>
              <small>
                {rule.target} / 置信度：{rule.confidence}
              </small>
            </div>
          ))}
        </section>

        <section className="panel-section">
          <div className="section-title">选中设备</div>
          {selectedDevice ? (
            <DeviceDetail candidate={active} device={selectedDevice} violations={selectedViolations} />
          ) : null}
        </section>

        <section className="panel-section warning-list">
          <div className="section-title">约束校验告警</div>
          {active.violations.length === 0 ? (
            <div className="ok-state">当前方案无硬碰撞、越界或禁布区占用。</div>
          ) : (
            active.violations.slice(0, 12).map((violation) => (
              <div key={violation.id} className={`warning ${violation.severity}`}>
                {violation.message}
              </div>
            ))
          )}
        </section>

        <section className="panel-section compact-list">
          <div className="section-title">抽象样例</div>
          {SIMULATED_SAMPLE_CASES.map((sample) => (
            <p key={sample.id}>
              <strong>{sample.name}</strong>
              <span>{sample.ruleTags.join(" / ")}</span>
            </p>
          ))}
        </section>
      </aside>
    </main>
  );
}

function IterationSummary({ result }: { result: IterativeOptimizationResult }) {
  const last = result.history[result.history.length - 1];
  return (
    <div className="iteration-summary">
      <div>
        <span>100轮最佳</span>
        <strong>{result.finalBestScore.toFixed(1)}</strong>
      </div>
      <div>
        <span>提升</span>
        <strong>{result.improvement >= 0 ? "+" : ""}{result.improvement.toFixed(1)}</strong>
      </div>
      <div>
        <span>后10轮均分</span>
        <strong>{result.averageFinalScore.toFixed(1)}</strong>
      </div>
      <div>
        <span>硬约束风险</span>
        <strong>{last?.hardViolationCount ?? 0}</strong>
      </div>
      <div>
        <span>管线总长</span>
        <strong>{(last?.pipelineLength ?? result.best.scores.pipelineLength).toFixed(1)}m</strong>
      </div>
      <div>
        <span>道路通达</span>
        <strong>{toPercent(last?.roadAccessibility ?? result.best.scores.roadAccessibility)}</strong>
      </div>
      <small>
        {result.rounds} 轮 / {last?.templateName ?? result.best.templateName} / 安全 {toPercent(last?.safetyCompliance ?? result.best.scores.safetyCompliance)} / 流程{" "}
        {toPercent(last?.processRationality ?? result.best.scores.processRationality)} / {last?.warningCount ?? result.best.violations.length} 项告警
      </small>
    </div>
  );
}

function StatusTile({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "green" | "cyan" | "amber" | "steel" }) {
  return (
    <div className={`status-tile ${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LayerToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`layer-toggle ${active ? "active" : ""}`} onClick={onClick}>
      {active ? <Eye size={15} /> : <EyeOff size={15} />}
      <span>{label}</span>
    </button>
  );
}

function Grid({ view, params }: { view: ViewTransform; params: LayoutParams }) {
  const lines = [];
  for (let x = 0; x <= params.fieldWidth; x += 10) {
    lines.push(
      <Line
        key={`gx-${x}`}
        points={[worldX(x, view), worldY(0, view), worldX(x, view), worldY(params.fieldHeight, view)]}
        stroke="#1f334d"
        strokeWidth={1}
      />,
    );
  }
  for (let y = 0; y <= params.fieldHeight; y += 10) {
    lines.push(
      <Line
        key={`gy-${y}`}
        points={[worldX(0, view), worldY(y, view), worldX(params.fieldWidth, view), worldY(y, view)]}
        stroke="#1f334d"
        strokeWidth={1}
      />,
    );
  }
  return <>{lines}</>;
}

function Boundary({ view, params }: { view: ViewTransform; params: LayoutParams }) {
  const points = boundaryPoints(params, view);
  return (
    <>
      <Line points={points} closed fill="#0b1a2b" stroke="#d4e5ff" strokeWidth={2} />
      <Text x={worldX(2, view)} y={worldY(2, view)} text={`井场边界 ${params.fieldWidth}m x ${params.fieldHeight}m`} fill="#d8e7ff" fontSize={13} />
    </>
  );
}

function RoadShape({ road, view }: { road: LayoutRect & { name: string; role: string }; view: ViewTransform }) {
  const fill = road.role === "emergency" ? "#475569" : road.role === "main" ? "#334155" : "#263648";
  return (
    <Group>
      <Rect
        x={worldX(road.x, view)}
        y={worldY(road.y, view)}
        width={road.width * view.scale}
        height={road.height * view.scale}
        fill={fill}
        opacity={0.78}
        cornerRadius={2}
      />
      {road.width > road.height ? (
        <Line
          points={[
            worldX(road.x + 2, view),
            worldY(road.y + road.height / 2, view),
            worldX(road.x + road.width - 2, view),
            worldY(road.y + road.height / 2, view),
          ]}
          stroke="#94a3b8"
          dash={[8, 6]}
          strokeWidth={1}
        />
      ) : null}
    </Group>
  );
}

function ForbiddenShape({ zone, view }: { zone: LayoutRect & { name: string }; view: ViewTransform }) {
  return (
    <Group>
      <Rect
        x={worldX(zone.x, view)}
        y={worldY(zone.y, view)}
        width={zone.width * view.scale}
        height={zone.height * view.scale}
        fill="#7f1d1d"
        opacity={0.42}
        stroke="#f87171"
        dash={[6, 5]}
      />
      <Text x={worldX(zone.x + 1, view)} y={worldY(zone.y + 1, view)} text="禁布区" fill="#fecaca" fontSize={12} />
    </Group>
  );
}

function HeatmapLayer({ candidate, view }: { candidate: LayoutCandidate; view: ViewTransform }) {
  return (
    <>
      {candidate.heatZones.map((zone) => (
        <Rect
          key={zone.id}
          x={worldX(zone.x, view)}
          y={worldY(zone.y, view)}
          width={zone.width * view.scale}
          height={zone.height * view.scale}
          fill="#f43f5e"
          opacity={0.13 + zone.intensity * 0.16}
          stroke="#fb7185"
          strokeWidth={1}
          dash={[4, 4]}
        />
      ))}
    </>
  );
}

function PipelineLayer({ candidate, view }: { candidate: LayoutCandidate; view: ViewTransform }) {
  const byId = new Map(candidate.devices.map((device) => [device.id, device]));
  const lines = candidate.devices.flatMap((device) =>
    device.connectsTo.map((targetId) => {
      const target = byId.get(targetId);
      if (!target) return null;
      const highPressure = device.type === "fracPump" || target.type === "manifold" || target.type === "wellhead";
      return (
        <Line
          key={`${device.id}-${target.id}`}
          points={[
            worldX(device.x + device.width / 2, view),
            worldY(device.y + device.height / 2, view),
            worldX(target.x + target.width / 2, view),
            worldY(target.y + target.height / 2, view),
          ]}
          stroke={highPressure ? "#fb7185" : "#22d3ee"}
          strokeWidth={highPressure ? 2 : 1.4}
          opacity={0.78}
        />
      );
    }),
  );
  return <>{lines}</>;
}

function DeviceShape({
  device,
  view,
  selected,
  warning,
  showSafety,
  showLabel,
  onSelect,
  onDragEnd,
}: {
  device: Device;
  view: ViewTransform;
  selected: boolean;
  warning: boolean;
  showSafety: boolean;
  showLabel: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  const x = worldX(device.x, view);
  const y = worldY(device.y, view);
  const width = device.width * view.scale;
  const height = device.height * view.scale;
  const label = EQUIPMENT_SPECS[device.type].shortLabel;

  return (
    <Group x={x} y={y} draggable onClick={onSelect} onTap={onSelect} onDragEnd={(event) => onDragEnd(event.target.x(), event.target.y())}>
      {showSafety ? (
        <Circle
          x={width / 2}
          y={height / 2}
          radius={(Math.max(device.width, device.height) / 2 + device.safetyDistance) * view.scale}
          fill={warning ? "#dc2626" : "#16a34a"}
          opacity={warning ? 0.13 : 0.08}
          stroke={warning ? "#f87171" : "#4ade80"}
          strokeWidth={selected ? 1.8 : 0.8}
          dash={[5, 5]}
        />
      ) : null}
      <Rect
        width={width}
        height={height}
        fill={device.color}
        stroke={selected ? "#ffffff" : warning ? "#fecaca" : "#0f172a"}
        strokeWidth={selected ? 2.5 : 1.2}
        cornerRadius={3}
        shadowColor="#020617"
        shadowBlur={selected ? 12 : 4}
        shadowOpacity={0.32}
      />
      {showLabel ? (
        <Text
          x={2}
          y={Math.max(1, height / 2 - 7)}
          width={width - 4}
          text={label}
          align="center"
          fill="#ffffff"
          fontSize={Math.max(10, Math.min(13, width / Math.max(label.length, 2)))}
          fontStyle="bold"
        />
      ) : null}
    </Group>
  );
}

function DeviceDetail({ candidate, device, violations }: { candidate: LayoutCandidate; device: Device; violations: Violation[] }) {
  const connections = getConnectedDeviceNames(candidate, device);
  return (
    <div className="device-detail">
      <div className="device-swatch" style={{ background: device.color }} />
      <strong>{device.name}</strong>
      <span>类型：{EQUIPMENT_SPECS[device.type].label}</span>
      <span>
        尺寸：{device.width}m x {device.height}m
      </span>
      <span>
        坐标：({device.x.toFixed(1)}, {device.y.toFixed(1)})
      </span>
      <span>安全缓冲：{device.safetyDistance}m</span>
      <span>连接：{connections.length ? connections.join(" / ") : "无"}</span>
      <div className="device-violations">
        {violations.length ? violations.map((violation) => <small key={violation.id}>{violation.message}</small>) : <small>当前设备无违规项。</small>}
      </div>
    </div>
  );
}

function Gauge({ label, value, suffix, max }: { label: string; value: number; suffix: string; max: number }) {
  const percent = Math.min(value / max, 1);
  return (
    <div className="gauge">
      <div>
        <span>{label}</span>
        <strong>
          {value.toFixed(1)}
          {suffix}
        </strong>
      </div>
      <div className="gauge-track">
        <i style={{ width: `${percent * 100}%` }} />
      </div>
    </div>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`metric ${danger ? "danger" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function worldX(x: number, view: ViewTransform) {
  return view.offsetX + x * view.scale;
}

function worldY(y: number, view: ViewTransform) {
  return view.offsetY + y * view.scale;
}

function screenToWorld(x: number, y: number, view: ViewTransform) {
  return {
    x: (x - view.offsetX) / view.scale,
    y: (y - view.offsetY) / view.scale,
  };
}

function boundaryPoints(params: LayoutParams, view: ViewTransform): number[] {
  return getBoundaryWorldPoints(params).flatMap(([x, y]) => [worldX(x, view), worldY(y, view)]);
}

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function scaleText(scale: FracScale): string {
  if (scale === "large") return "大规模";
  if (scale === "medium") return "中等规模";
  return "小规模";
}

function downloadUrl(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

function downloadText(text: string, filename: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  URL.revokeObjectURL(url);
}

function createExportPayload(candidate: LayoutCandidate, iterationResult: IterativeOptimizationResult | null) {
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
          templateName: item.templateName,
        })),
      }
    : null;

  return {
    id: candidate.id,
    name: candidate.name,
    template: { id: candidate.templateId, name: candidate.templateName },
    params: candidate.params,
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
      violations: candidate.violations.filter((violation) => violation.deviceIds.includes(device.id)).map((violation) => violation.message),
    })),
    roads: candidate.roads,
    forbiddenZones: candidate.forbiddenZones,
    connections: candidate.devices.flatMap((device) => device.connectsTo.map((targetId) => ({ from: device.id, to: targetId }))),
    scores: candidate.scores,
    violations: candidate.violations,
    explanation: candidate.explanation,
    optimizationTrace,
  };
}

function createReportSummary(candidate: LayoutCandidate): string {
  const equipmentCounts = candidate.devices.reduce<Record<string, number>>((counts, device) => {
    const label = EQUIPMENT_SPECS[device.type].label;
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});
  const countText = Object.entries(equipmentCounts)
    .map(([label, count]) => `${label}${count}台套`)
    .join("、");
  const topWarnings = candidate.violations.slice(0, 8).map((violation, index) => `${index + 1}. ${violation.message}`).join("\n");
  const scoreRows = candidate.scores.details
    .map((detail) => `| ${detail.label} | ${(detail.score * 100).toFixed(1)}% | ${detail.weight.toFixed(2)} | ${detail.contribution.toFixed(1)} | ${detail.explanation} |`)
    .join("\n");
  const ruleRows = RULE_MATRIX.map((rule) => `| ${rule.id} | ${rule.category} | ${rule.target} | ${rule.confidence} | ${rule.rule} | ${rule.evidence} |`).join("\n");

  return [
    `# ${candidate.name} 报告证据摘要`,
    "",
    "## 输入参数",
    `- 井场尺寸：${candidate.params.fieldWidth}m x ${candidate.params.fieldHeight}m`,
    `- 地形边界：${candidate.params.shape}`,
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
    topWarnings || "当前方案无硬碰撞、越界或禁布区占用。",
    "",
    "## 规则依据矩阵",
    "| 编号 | 类别 | 对象 | 置信度 | 规则 | 依据说明 |",
    "| --- | --- | --- | --- | --- | --- |",
    ruleRows,
    "",
    "## 导出说明",
    "- PNG 用于报告插图和评审快速浏览。",
    "- JSON 保留 params、devices、roads、forbiddenZones、connections、scores、violations 和 explanation 字段，可用于复核。",
    "- DXF 按 BOUNDARY、ROAD、FORBIDDEN、PIPELINE、LABEL 和设备类型分层，可作为 CAD 图样支撑。",
  ].join("\n");
}

function createDxf(candidate: LayoutCandidate): string {
  const lines = ["0", "SECTION", "2", "ENTITIES"];
  const addLine = (x1: number, y1: number, x2: number, y2: number, layer = "0") => {
    lines.push("0", "LINE", "8", layer, "10", String(x1), "20", String(-y1), "11", String(x2), "21", String(-y2));
  };
  const addText = (x: number, y: number, text: string, layer = "TEXT") => {
    lines.push("0", "TEXT", "8", layer, "10", String(x), "20", String(-y), "40", "2.5", "1", text);
  };
  const addPolygon = (points: Array<[number, number]>, layer: string) => {
    points.forEach(([x1, y1], index) => {
      const [x2, y2] = points[(index + 1) % points.length];
      addLine(x1, y1, x2, y2, layer);
    });
  };
  const addRect = (rect: LayoutRect, layer: string) => {
    addLine(rect.x, rect.y, rect.x + rect.width, rect.y, layer);
    addLine(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, layer);
    addLine(rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height, layer);
    addLine(rect.x, rect.y + rect.height, rect.x, rect.y, layer);
  };

  addPolygon(getBoundaryWorldPoints(candidate.params), "BOUNDARY");
  candidate.roads.forEach((road) => addRect(road, "ROAD"));
  candidate.forbiddenZones.forEach((zone) => addRect(zone, "FORBIDDEN"));
  candidate.devices.forEach((device) => {
    addRect(device, device.type.toUpperCase());
    addText(device.x + 0.8, device.y + device.height / 2, device.name, "LABEL");
  });
  const byId = new Map(candidate.devices.map((device) => [device.id, device]));
  candidate.devices.forEach((device) => {
    device.connectsTo.forEach((targetId) => {
      const target = byId.get(targetId);
      if (!target) return;
      addLine(device.x + device.width / 2, device.y + device.height / 2, target.x + target.width / 2, target.y + target.height / 2, "PIPELINE");
    });
  });
  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n");
}

export default App;
