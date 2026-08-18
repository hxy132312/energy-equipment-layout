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
  if (params.shape === "trapezoid") return "坡地情景 / 斜边退让";
  if (params.shape === "notched") return "缺口情景 / 不规则平台";
  return "平整井场 / 矩形边界";
}
