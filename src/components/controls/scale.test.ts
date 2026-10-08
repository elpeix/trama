import { describe, expect, it } from "vitest";
import type { NumberParamDefinition } from "../../patch/registry";
import { formatParam, fromSliderPosition, parseParam, toSliderPosition } from "./scale";

const frequency: NumberParamDefinition = {
  id: "frequency",
  label: "Freq",
  kind: "number",
  min: 20,
  max: 20000,
  step: 1,
  default: 440,
  scale: "log",
};

const detune: NumberParamDefinition = {
  id: "detune",
  label: "Detune",
  kind: "number",
  min: -1200,
  max: 1200,
  step: 1,
  default: 0,
  scale: "linear",
};

const gain: NumberParamDefinition = {
  id: "gain",
  label: "Gain",
  kind: "number",
  min: 0,
  max: 1,
  step: 0.01,
  default: 0.5,
  scale: "linear",
};

describe("log scale", () => {
  it("maps the range ends to 0 and 1", () => {
    expect(toSliderPosition(20, frequency)).toBe(0);
    expect(toSliderPosition(20000, frequency)).toBe(1);
  });

  it("places the geometric mean in the middle", () => {
    expect(toSliderPosition(Math.sqrt(20 * 20000), frequency)).toBeCloseTo(0.5);
  });

  it("maps the middle back to the geometric mean, rounded to the step", () => {
    expect(fromSliderPosition(0.5, frequency)).toBe(632);
  });

  it("round-trips a value", () => {
    expect(fromSliderPosition(toSliderPosition(1200, frequency), frequency)).toBe(1200);
  });
});

describe("linear scale", () => {
  it("maps values proportionally", () => {
    expect(toSliderPosition(0, detune)).toBe(0.5);
    expect(fromSliderPosition(0.25, gain)).toBe(0.25);
  });

  it("rounds to the step without float noise", () => {
    expect(fromSliderPosition(0.123456, gain)).toBe(0.12);
  });
});

describe("clamping", () => {
  it("clamps values outside the range", () => {
    expect(toSliderPosition(5, frequency)).toBe(0);
    expect(toSliderPosition(99999, frequency)).toBe(1);
  });

  it("clamps positions outside 0..1", () => {
    expect(fromSliderPosition(-1, gain)).toBe(0);
    expect(fromSliderPosition(2, gain)).toBe(1);
  });
});

describe("parseParam", () => {
  const hz = { unit: "Hz" };

  it("reads a number with or without its unit", () => {
    expect(parseParam("440", hz)).toBe(440);
    expect(parseParam(" 440 Hz ", hz)).toBe(440);
    expect(parseParam("440hz", hz)).toBe(440);
  });

  it("reads a decimal comma", () => {
    expect(parseParam("0,3", { unit: "s" })).toBe(0.3);
  });

  it("reads negative values", () => {
    expect(parseParam("-700 ct", { unit: "ct" })).toBe(-700);
  });

  it("rejects what is not a number", () => {
    expect(parseParam("", hz)).toBeUndefined();
    expect(parseParam("Hz", hz)).toBeUndefined();
    expect(parseParam("loud", hz)).toBeUndefined();
    expect(parseParam("440 s", hz)).toBeUndefined();
  });
});

describe("named values", () => {
  const transpose: NumberParamDefinition = {
    id: "transpose",
    label: "Transpose",
    kind: "number",
    min: 0,
    max: 11,
    step: 1,
    default: 0,
    valueNames: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
    scale: "linear",
  };

  it("shows the name of the value", () => {
    expect(formatParam(0, transpose)).toBe("C");
    expect(formatParam(6, transpose)).toBe("F#");
  });

  it("reads a typed name, whatever its case, or a number", () => {
    expect(parseParam("F#", transpose)).toBe(6);
    expect(parseParam(" a ", transpose)).toBe(9);
    expect(parseParam("7", transpose)).toBe(7);
    expect(parseParam("H", transpose)).toBeUndefined();
  });
});
