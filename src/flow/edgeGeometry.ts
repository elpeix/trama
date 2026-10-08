import { getBezierPath } from "@xyflow/react";

type BezierParams = Parameters<typeof getBezierPath>[0];

const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t;
  return u ** 3 * p0 + 3 * u ** 2 * t * p1 + 3 * u * t ** 2 * p2 + t ** 3 * p3;
};

export function pointAlongBezier(params: BezierParams, t: number): [number, number] {
  const [path] = getBezierPath(params);
  const [x0, y0, x1, y1, x2, y2, x3, y3] = (path.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) ?? []).map(Number);
  return [cubic(x0, x1, x2, x3, t), cubic(y0, y1, y2, y3, t)];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PREFERRED_T = 0.75;
const T_STEP = 0.05;
const GAP = 4;

const candidates = () => {
  const values = [PREFERRED_T];
  for (let step = 1; step * T_STEP < PREFERRED_T; step++) {
    const later = PREFERRED_T + step * T_STEP;
    if (later < 1) {
      values.push(later);
    }
    values.push(PREFERRED_T - step * T_STEP);
  }
  return values;
};

const hits = ([x, y]: [number, number], size: { width: number; height: number }, rect: Rect) =>
  x + size.width / 2 + GAP > rect.x &&
  x - size.width / 2 - GAP < rect.x + rect.width &&
  y + size.height / 2 + GAP > rect.y &&
  y - size.height / 2 - GAP < rect.y + rect.height;

export function labelPosition(
  params: BezierParams,
  obstacles: Rect[],
  size: { width: number; height: number },
): [number, number] {
  for (const t of candidates()) {
    const point = pointAlongBezier(params, t);
    if (!obstacles.some((rect) => hits(point, size, rect))) {
      return point;
    }
  }
  return pointAlongBezier(params, PREFERRED_T);
}
