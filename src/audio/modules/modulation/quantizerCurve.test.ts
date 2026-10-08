import { describe, expect, it } from "vitest";
import { QUANTIZER_RANGE, quantizerCurve } from "./quantizerCurve";

const at = (curve: Float32Array, octaves: number) => {
  const index = Math.round(((octaves / QUANTIZER_RANGE + 1) / 2) * (curve.length - 1));
  return curve[index] * 12;
};

const semitone = 1 / 12;

describe("quantizerCurve", () => {
  it("rounds to the nearest semitone in the chromatic scale", () => {
    const curve = quantizerCurve("C", "chromatic");

    expect(at(curve, 0)).toBeCloseTo(0);
    expect(at(curve, 0.4 * semitone)).toBeCloseTo(0);
    expect(at(curve, 0.6 * semitone)).toBeCloseTo(1);
    expect(at(curve, -0.6 * semitone)).toBeCloseTo(-1);
  });

  it("rounds to the nearest note of the scale", () => {
    const curve = quantizerCurve("C", "major");

    expect(at(curve, 3.4 * semitone)).toBeCloseTo(4);
    expect(at(curve, 2.8 * semitone)).toBeCloseTo(2);
    expect(at(curve, 0.9 * semitone)).toBeCloseTo(0);
    expect(at(curve, 1.1 * semitone)).toBeCloseTo(2);
    expect(at(curve, 5.9 * semitone)).toBeCloseTo(5);
  });

  it("repeats the scale in every octave, above and below C4", () => {
    const curve = quantizerCurve("C", "major");

    expect(at(curve, 1 + 3.4 * semitone)).toBeCloseTo(16);
    expect(at(curve, -1 + 0.2 * semitone)).toBeCloseTo(-12);
    expect(at(curve, -2 + 10.8 * semitone)).toBeCloseTo(-13);
  });

  it("starts the scale on its root", () => {
    const curve = quantizerCurve("D", "minor");

    expect(at(curve, 0)).toBeCloseTo(0);
    expect(at(curve, 1.6 * semitone)).toBeCloseTo(2);
    expect(at(curve, 4.6 * semitone)).toBeCloseTo(5);
  });

  it("reaches a few octaves each way, and holds the ends past them", () => {
    const curve = quantizerCurve("C", "chromatic");

    expect(QUANTIZER_RANGE).toBeGreaterThanOrEqual(4);
    expect(curve[0] * 12).toBeCloseTo(-12 * QUANTIZER_RANGE);
    expect(curve.at(-1)! * 12).toBeCloseTo(12 * QUANTIZER_RANGE);
  });
});
