import { describe, expect, it } from "vitest";
import { DRIVE_RANGE, distortionCurve } from "./distortionCurve";

const at = (curve: Float32Array, input: number) => {
  const index = Math.round(((input / DRIVE_RANGE + 1) / 2) * (curve.length - 1));
  return curve[index];
};

describe("distortionCurve", () => {
  it("covers the whole range of the drive, with a point at silence", () => {
    const curve = distortionCurve("soft", []);

    expect(curve.length % 2).toBe(1);
    expect(at(curve, 0)).toBe(0);
  });

  it("saturates softly", () => {
    const curve = distortionCurve("soft", []);

    expect(at(curve, 0.5)).toBeCloseTo(Math.tanh(0.5), 2);
    expect(at(curve, DRIVE_RANGE)).toBeCloseTo(1);
    expect(at(curve, -DRIVE_RANGE)).toBeCloseTo(-1);
  });

  it("clips hard at full scale", () => {
    const curve = distortionCurve("hard", []);

    expect(at(curve, 0.5)).toBeCloseTo(0.5, 2);
    expect(at(curve, 3)).toBe(1);
    expect(at(curve, -3)).toBe(-1);
  });

  it("folds what goes past full scale back in", () => {
    const curve = distortionCurve("fold", []);

    expect(at(curve, 0.5)).toBeCloseTo(0.5, 2);
    expect(at(curve, 1)).toBeCloseTo(1, 2);
    expect(at(curve, 1.5)).toBeCloseTo(0.5, 2);
    expect(at(curve, 3)).toBeCloseTo(-1, 2);
    expect(at(curve, -1.5)).toBeCloseTo(-0.5, 2);
  });

  it("follows the curve drawn from -1 to 1, and holds its ends past them", () => {
    const curve = distortionCurve("drawn", [-1, 0.5, 1]);

    expect(at(curve, 0)).toBeCloseTo(0.5);
    expect(at(curve, 0.5)).toBeCloseTo(0.75, 2);
    expect(at(curve, -0.5)).toBeCloseTo(-0.25, 2);
    expect(at(curve, 5)).toBe(1);
    expect(at(curve, -5)).toBe(-1);
  });
});
