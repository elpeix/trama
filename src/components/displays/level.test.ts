import { describe, expect, it } from "vitest";
import { StereoPeaks, fallingLevel, formatDecibels, meterPosition, peakOf, toDecibels } from "./level";

describe("peakOf", () => {
  it("returns the largest absolute sample", () => {
    expect(peakOf(Float32Array.of(0.2, -0.75, 0.5))).toBe(0.75);
    expect(peakOf(new Float32Array(0))).toBe(0);
  });
});

describe("toDecibels", () => {
  it("converts a level to dBFS", () => {
    expect(toDecibels(1)).toBe(0);
    expect(toDecibels(0.5)).toBeCloseTo(-6.02);
    expect(toDecibels(2)).toBeCloseTo(6.02);
    expect(toDecibels(0)).toBe(-Infinity);
  });
});

describe("meterPosition", () => {
  it("maps the floor to 0 and 0 dBFS to 1", () => {
    expect(meterPosition(0)).toBe(0);
    expect(meterPosition(10 ** (-48 / 20))).toBeCloseTo(0);
    expect(meterPosition(10 ** (-24 / 20))).toBeCloseTo(0.5);
    expect(meterPosition(1)).toBe(1);
    expect(meterPosition(3)).toBe(1);
  });
});

describe("formatDecibels", () => {
  it("shows one decimal with a real minus sign", () => {
    expect(formatDecibels(0.5)).toBe("−6.0 dB");
    expect(formatDecibels(2)).toBe("+6.0 dB");
    expect(formatDecibels(1)).toBe("0.0 dB");
    expect(formatDecibels(0)).toBe("−∞ dB");
    expect(formatDecibels(0.001)).toBe("−∞ dB");
  });
});

describe("fallingLevel", () => {
  it("jumps up to a new peak", () => {
    expect(fallingLevel(0.1, 0.8, 0.016)).toBe(0.8);
  });

  it("falls back at the given rate", () => {
    expect(toDecibels(fallingLevel(1, 0, 0.5, 24))).toBeCloseTo(-12);
  });
});

describe("StereoPeaks", () => {
  const analyser = (samples: number[]) =>
    ({
      fftSize: samples.length,
      getFloatTimeDomainData: (buffer: Float32Array) => buffer.set(samples),
    }) as unknown as AnalyserNode;

  it("reads the peak of each side", () => {
    const peaks = new StereoPeaks();

    expect(peaks.read({ left: analyser([0.25, -0.75]), right: analyser([0.125, 0.5]) })).toEqual([0.75, 0.5]);
  });

  it("reads silence with nothing to read", () => {
    expect(new StereoPeaks().read(undefined)).toEqual([0, 0]);
  });
});

