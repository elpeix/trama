import { describe, expect, it } from "vitest";
import { harmonicsWave, shapeWave } from "./periodicWave";

const cycle = (points: number, wave: (phase: number) => number) =>
  Array.from({ length: points }, (_, index) => wave((2 * Math.PI * index) / points));

describe("shapeWave", () => {
  it("finds a single harmonic in one cycle of a sine", () => {
    const { real, imag } = shapeWave(cycle(64, Math.sin));

    expect(imag[1]).toBeCloseTo(1);
    [...imag].forEach((value, harmonic) => harmonic !== 1 && expect(value).toBeCloseTo(0));
    [...real].forEach((value) => expect(value).toBeCloseTo(0));
  });

  it("finds a cosine in the real part", () => {
    const { real, imag } = shapeWave(cycle(64, (phase) => 0.5 * Math.cos(3 * phase)));

    expect(real[3]).toBeCloseTo(0.5);
    [...imag].forEach((value) => expect(value).toBeCloseTo(0));
  });

  it("gives as many harmonics as half the points, and leaves out the offset", () => {
    const { real, imag } = shapeWave(cycle(64, (phase) => 1 + Math.sin(phase)));

    expect(real).toHaveLength(32);
    expect(imag).toHaveLength(32);
    expect(real[0]).toBe(0);
    expect(imag[0]).toBe(0);
  });
});

describe("harmonicsWave", () => {
  it("puts each level on a sine a harmonic higher", () => {
    const { real, imag } = harmonicsWave([1, 0.5, 0]);

    expect([...imag]).toEqual([0, 1, 0.5, 0]);
    expect([...real]).toEqual([0, 0, 0, 0]);
  });
});
