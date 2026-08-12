import { useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import {
  ArrowDownToLine,
  Download,
  Eye,
  EyeOff,
  FileJson,
  RefreshCcw,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import {
  EQUIPMENT_SPECS,
  PUBLIC_RULE_NOTES,
  SCORE_PROFILES,
  SIMULATED_SAMPLE_CASES,
  type FracScale,
  type ScoreProfile,
  type YardShape,
} from "./data/equipment";
import {
  createDefaultParams,
  generateLayoutOptions,
  getConnectedDeviceNames,
  moveDevice,
  type Device,
  type LayoutCandidate,
  type LayoutParams,
  type Rect as LayoutRect,
  type Violation,
} from "./lib/layoutEngine";

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
  };

  const reset = () => {
    const defaults = createDefaultParams();
    const next = generateLayoutOptions(defaults);
    setParams(defaults);
    setCandidates(next);
    setActiveIndex(0);
    setSelectedDeviceId(next[0]?.devices[0]?.id ?? null);
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
    downloadText(JSON.stringify(createExportPayload(active), null, 2), `${active.name}-layout.json`, "application/json;charset=utf-8");
  };

  const exportDxf = () => {
    downloadText(createDxf(active), `${active.name}-layout.dxf`, "application/dxf;charset=utf-8");
  };

  const toggleLayer = (key: keyof LayerState) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <main className="app-shell">
      <aside className="control-panel">
        <div className="brand-block">
          <div className="brand-mark">FracAI</div>
          <h1>压裂井场布局智能生成原型</h1>
          <p>规则约束 + 多目标优化 + 可解释评分</p>
        </div>

        <section className="panel-section">
          <div className="section-title">
            <SlidersHorizontal size={17} />
            <span>输入参数</span>
          </div>
          <NumberField label="井场长度 m" min={80} max={220} value={params.fieldWidth} onChange={(fieldWidth) => setParams({ ...params, fieldWidth })} />
          <NumberField label="井场宽度 m" min={60} max={160} value={params.fieldHeight} onChange={(fieldHeight) => setParams({ ...params, fieldHeight })} />
          <SelectField label="地形边界" value={params.shape} options={shapeOptions} onChange={(shape) => setParams({ ...params, shape })} />
          <SelectField label="压裂规模" value={params.scale} options={scaleOptions} onChange={(scale) => setParams({ ...params, scale })} />
          <SelectField
            label="评分偏向"
            value={params.scoreProfile}
            options={profileOptions}
            onChange={(scoreProfile) => setParams({ ...params, scoreProfile })}
          />
          <NumberField
            label="压裂泵车数量"
            min={4}
            max={16}
            value={params.fracPumpCount}
            onChange={(fracPumpCount) => setParams({ ...params, fracPumpCount })}
          />
          <NumberField
            label="砂罐数量"
            min={2}
            max={8}
            value={params.sandTankCount}
            onChange={(sandTankCount) => setParams({ ...params, sandTankCount })}
          />
          <NumberField
            label="水罐数量"
            min={1}
            max={6}
            value={params.waterTankCount}
            onChange={(waterTankCount) => setParams({ ...params, waterTankCount })}
          />
          <NumberField
            label="化添撬数量"
            min={1}
            max={4}
            value={params.additiveSkidCount}
            onChange={(additiveSkidCount) => setParams({ ...params, additiveSkidCount })}
          />
          <label className="toggle-row">
            <span>启用禁布区</span>
            <input
              type="checkbox"
              checked={params.enableForbiddenZone}
              onChange={(event) => setParams({ ...params, enableForbiddenZone: event.target.checked })}
            />
          </label>
          <NumberField
            label="优化迭代次数"
            min={20}
            max={600}
            value={params.optimizationIterations}
            onChange={(optimizationIterations) => setParams({ ...params, optimizationIterations })}
          />
          <div className="button-grid">
            <button className="primary-button" onClick={regenerate}>
              <RefreshCcw size={16} />
              生成方案
            </button>
            <button className="ghost-button" onClick={reset}>
              <RotateCcw size={16} />
              重置
            </button>
          </div>
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
            <strong>{active.name}</strong>
            <span>
              {active.templateName} / {active.params.fieldWidth}m x {active.params.fieldHeight}m / {SCORE_PROFILES[active.params.scoreProfile].label}
            </span>
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
          </div>
        </div>

        <div className="canvas-wrap">
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
        </div>
      </section>

      <aside className="result-panel">
        <section className="panel-section schemes">
          <div className="section-title">候选方案排序</div>
          {candidates.map((candidate, index) => (
            <button key={candidate.id} className={`scheme-card ${index === activeIndex ? "active" : ""}`} onClick={() => setActiveIndex(index)}>
              <span>{candidate.name}</span>
              <strong>{candidate.scores.total.toFixed(1)}</strong>
              <small>{candidate.templateName}</small>
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
  const w = params.fieldWidth;
  const h = params.fieldHeight;
  const points =
    params.shape === "trapezoid"
      ? [
          [12, 0],
          [w, 0],
          [w - 8, h],
          [0, h],
        ]
      : params.shape === "notched"
        ? [
            [0, 0],
            [w - 30, 0],
            [w - 30, 24],
            [w, 24],
            [w, h],
            [0, h],
          ]
        : [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
          ];
  return points.flatMap(([x, y]) => [worldX(x, view), worldY(y, view)]);
}

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
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

function createExportPayload(candidate: LayoutCandidate) {
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
  };
}

function createDxf(candidate: LayoutCandidate): string {
  const lines = ["0", "SECTION", "2", "ENTITIES"];
  const addLine = (x1: number, y1: number, x2: number, y2: number, layer = "0") => {
    lines.push("0", "LINE", "8", layer, "10", String(x1), "20", String(-y1), "11", String(x2), "21", String(-y2));
  };
  const addText = (x: number, y: number, text: string, layer = "TEXT") => {
    lines.push("0", "TEXT", "8", layer, "10", String(x), "20", String(-y), "40", "2.5", "1", text);
  };
  const addRect = (rect: LayoutRect, layer: string) => {
    addLine(rect.x, rect.y, rect.x + rect.width, rect.y, layer);
    addLine(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, layer);
    addLine(rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height, layer);
    addLine(rect.x, rect.y + rect.height, rect.x, rect.y, layer);
  };

  addRect({ x: 0, y: 0, width: candidate.params.fieldWidth, height: candidate.params.fieldHeight }, "BOUNDARY");
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
