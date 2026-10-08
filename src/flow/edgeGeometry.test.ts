import { getBezierPath, Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { labelPosition, pointAlongBezier, type Rect } from "./edgeGeometry";

const forward = {
  sourceX: 0,
  sourceY: 0,
  sourcePosition: Position.Right,
  targetX: 400,
  targetY: 200,
  targetPosition: Position.Left,
};

const backward = { ...forward, sourceX: 400, targetX: 0 };

describe("pointAlongBezier", () => {
  it("starts at the source", () => {
    expect(pointAlongBezier(forward, 0)).toEqual([0, 0]);
  });

  it("ends at the target", () => {
    expect(pointAlongBezier(forward, 1)).toEqual([400, 200]);
  });

  it.each([
    ["forward", forward],
    ["backward", backward],
  ])("matches the React Flow label position at the middle of a %s edge", (_name, edge) => {
    const [, labelX, labelY] = getBezierPath(edge);

    const [x, y] = pointAlongBezier(edge, 0.5);

    expect(x).toBeCloseTo(labelX);
    expect(y).toBeCloseTo(labelY);
  });

  it("gets closer to the target as t grows", () => {
    const [x] = pointAlongBezier(forward, 0.75);

    expect(x).toBeGreaterThan(200);
    expect(x).toBeLessThan(400);
  });
});

describe("labelPosition", () => {
  const size = { width: 40, height: 20 };

  const overlaps = ([x, y]: [number, number], rect: Rect) =>
    x + size.width / 2 > rect.x &&
    x - size.width / 2 < rect.x + rect.width &&
    y + size.height / 2 > rect.y &&
    y - size.height / 2 < rect.y + rect.height;

  it("sits three quarters along a free edge", () => {
    expect(labelPosition(forward, [], size)).toEqual(pointAlongBezier(forward, 0.75));
  });

  it("moves away from a node covering the preferred spot", () => {
    const [x, y] = pointAlongBezier(forward, 0.75);
    const node: Rect = { x: x - 30, y: y - 30, width: 60, height: 60 };

    const position = labelPosition(forward, [node], size);

    expect(overlaps(position, node)).toBe(false);
  });

  it("stays as close as possible to the preferred spot", () => {
    const [x, y] = pointAlongBezier(forward, 0.75);
    const node: Rect = { x: x - 30, y: y - 30, width: 60, height: 60 };

    const [freeX] = labelPosition(forward, [node], size);

    expect(Math.abs(freeX - x)).toBeLessThan(120);
  });

  it("falls back to the preferred spot when there is no room", () => {
    const everything: Rect = { x: -1000, y: -1000, width: 3000, height: 3000 };

    expect(labelPosition(forward, [everything], size)).toEqual(pointAlongBezier(forward, 0.75));
  });
});
