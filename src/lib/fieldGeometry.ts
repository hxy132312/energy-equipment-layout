import type { LayoutParams } from "./layoutEngine";

export function getBoundaryWorldPoints(params: LayoutParams): Array<[number, number]> {
  const w = params.fieldWidth;
  const h = params.fieldHeight;
  if (params.shape === "trapezoid") {
    return [
      [12, 0],
      [w, 0],
      [w - 8, h],
      [0, h],
    ];
  }
  if (params.shape === "notched") {
    return [
      [0, 0],
      [w - 30, 0],
      [w - 30, 24],
      [w, 24],
      [w, h],
      [0, h],
    ];
  }
  return [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
}

export function getTerrainSceneLabel(params: LayoutParams): string {
  const profile = params.terrainProfile ?? "flat";
  if (profile === "slope") return "单向坡地 / 沿等高线布置";
  if (profile === "valley") return "沟谷地势 / 汇水廊道避让";
  if (profile === "ridge") return "台脊地势 / 核心上台";
  if (profile === "waterSensitive") return "水敏环境 / 低洼侧强避让";
  if (params.shape === "trapezoid") return "坡地情景 / 斜边退让";
  if (params.shape === "notched") return "缺口情景 / 不规则平台";
  return "平整井场 / 矩形边界";
}

export function getTerrainElevation(x: number, y: number, params: LayoutParams): number {
  const ripple = Math.sin((y / params.fieldHeight) * Math.PI * 2) * 0.28 + Math.cos((x / params.fieldWidth) * Math.PI * 4) * 0.16;
  const profile = params.terrainProfile ?? "flat";
  if (profile === "slope") return (y / params.fieldHeight) * 9 + ripple;
  if (profile === "valley") {
    const valley = Math.abs(x / params.fieldWidth - 0.5) * 8.2;
    return valley + lowMound(x, y, params) * 0.85 - 1.4;
  }
  if (profile === "ridge") {
    const ridge = Math.max(0, 1 - Math.abs(x / params.fieldWidth - 0.5) * 2) * 7.2;
    return ridge + lowMound(x, y, params) * 0.55;
  }
  if (profile === "waterSensitive") {
    const basin = Math.max(0, 1 - Math.hypot(x / params.fieldWidth - 0.22, y / params.fieldHeight - 0.72) * 2.2) * -3.2;
    return lowMound(x, y, params) * 0.75 + (y / params.fieldHeight) * 2.4 + basin;
  }
  if (params.shape === "trapezoid") return (y / params.fieldHeight) * 7.5 + ripple;
  if (params.shape === "notched") return lowMound(x, y, params) * 1.2;
  return lowMound(x, y, params) * 0.7;
}

export function getTerrainIntensity(x: number, y: number, params: LayoutParams): number {
  const elevation = getTerrainElevation(x, y, params);
  const range = getTerrainElevationRange(params);
  return clamp01((elevation - range.min) / Math.max(range.max - range.min, 0.01));
}

export function getTerrainElevationRange(params: LayoutParams): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let row = 0; row <= 16; row += 1) {
    for (let column = 0; column <= 16; column += 1) {
      const x = (params.fieldWidth * column) / 16;
      const y = (params.fieldHeight * row) / 16;
      if (!isTerrainPointEnabled(x, y, params)) continue;
      const elevation = getTerrainElevation(x, y, params);
      min = Math.min(min, elevation);
      max = Math.max(max, elevation);
    }
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 1 };
}

export function getTerrainColor(intensity: number, params: LayoutParams): string {
  const profile = params.terrainProfile ?? "flat";
  const low = profile === "waterSensitive" ? [14, 116, 144] : profile === "valley" ? [30, 64, 85] : [15, 118, 110];
  const mid = profile === "ridge" ? [128, 116, 58] : [122, 111, 45];
  const high = profile === "slope" || profile === "ridge" ? [180, 83, 9] : [132, 89, 38];
  const color = intensity < 0.5 ? mixColor(low, mid, intensity * 2) : mixColor(mid, high, (intensity - 0.5) * 2);
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

export function isTerrainPointEnabled(x: number, y: number, params: LayoutParams): boolean {
  if (params.shape === "notched" && x > params.fieldWidth - 30 && y < 24) return false;
  if (params.shape === "trapezoid") {
    const leftEdge = 12 * (1 - y / params.fieldHeight);
    const rightEdge = params.fieldWidth - 8 * (y / params.fieldHeight);
    return x >= leftEdge && x <= rightEdge;
  }
  return true;
}

function lowMound(x: number, y: number, params: LayoutParams) {
  const nx = x / params.fieldWidth - 0.5;
  const ny = y / params.fieldHeight - 0.5;
  return Math.sin(nx * Math.PI * 2) * 0.35 + Math.cos(ny * Math.PI * 2) * 0.28 + 0.55;
}

function mixColor(a: number[], b: number[], ratio: number) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * clamp01(ratio)));
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}
