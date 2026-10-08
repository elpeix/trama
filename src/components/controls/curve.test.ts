import { describe, expect, it } from "vitest";
import type { CurveParamDefinition } from "../../patch/registry";
import { curveBaseline, curvePoint, paintCurve } from "./curve";

const SHAPE: CurveParamDefinition = {
  id: "shape",
  label: "Shape",
  kind: "curve",
  points: 8,
  min: -1,
  max: 1,
  step: 0.01,
  default: "0 0 0 0 0 0 0 0",
  style: "line",
};

const rect = { left: 100, top: 50, width: 80, height: 40 } as DOMRect;

describe("curvePoint", () => {
  it("finds the point under the pointer and the value at its height", () => {
    expect(curvePoint(rect, 100, 50, SHAPE)).toEqual({ index: 0, value: 1 });
    expect(curvePoint(rect, 135, 70, SHAPE)).toEqual({ index: 3, value: 0 });
    expect(curvePoint(rect, 179, 80, SHAPE)).toEqual({ index: 7, value: -0.5 });
  });

  it("stays inside the curve when the pointer leaves it", () => {
    expect(curvePoint(rect, 20, 0, SHAPE)).toEqual({ index: 0, value: 1 });
    expect(curvePoint(rect, 400, 200, SHAPE)).toEqual({ index: 7, value: -1 });
  });

  it("rounds the value to the step", () => {
    expect(curvePoint(rect, 100, 50.26, SHAPE).value).toBe(0.99);
  });
});

describe("paintCurve", () => {
  const flat = [0, 0, 0, 0, 0, 0, 0, 0];

  it("sets the point under the pointer", () => {
    expect(paintCurve(flat, undefined, { index: 2, value: 0.5 }, SHAPE)).toEqual([0, 0, 0.5, 0, 0, 0, 0, 0]);
  });

  it("fills the points skipped by a quick move with a straight line", () => {
    expect(paintCurve(flat, { index: 1, value: 1 }, { index: 5, value: -1 }, SHAPE)).toEqual([
      0, 1, 0.5, 0, -0.5, -1, 0, 0,
    ]);
    expect(paintCurve(flat, { index: 5, value: -1 }, { index: 1, value: 1 }, SHAPE)).toEqual([
      0, 1, 0.5, 0, -0.5, -1, 0, 0,
    ]);
  });
});

describe("curveBaseline", () => {
  it("draws from zero when the range crosses it, and from the bottom otherwise", () => {
    expect(curveBaseline(SHAPE)).toBe(0);
    expect(curveBaseline({ ...SHAPE, min: 0.2 })).toBe(0.2);
  });
});
