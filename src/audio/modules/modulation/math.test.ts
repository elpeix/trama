import { describe, expect, it } from "vitest";
import { MATH_OPERATIONS } from "../../../patch/registry";
import { combine } from "./math";

const values = (...numbers: number[]) => Float32Array.from(numbers);
const rounded = (output: Float32Array) => [...output].map((value) => Number(value.toFixed(2)));

const run = (operation: string, a: Float32Array | undefined, b: Float32Array, length = 4) => {
  const output = new Float32Array(length);
  combine(operation, a, b, output);
  return rounded(output);
};

describe("combine", () => {
  const a = values(0.5, -0.5, 0.2, 1);
  const b = values(0.25, 0.25, -0.4, -1);

  it("offers the operations of the module, adding first", () => {
    expect(MATH_OPERATIONS).toEqual(["add", "subtract", "multiply", "min", "max"]);
  });

  it("adds, subtracts and multiplies the two signals, a frame at a time", () => {
    expect(run("add", a, b)).toEqual([0.75, -0.25, -0.2, 0]);
    expect(run("subtract", a, b)).toEqual([0.25, -0.75, 0.6, 2]);
    expect(run("multiply", a, b)).toEqual([0.13, -0.13, -0.08, -1]);
  });

  it("takes the lowest or the highest of the two", () => {
    expect(run("min", a, b)).toEqual([0.25, -0.5, -0.4, -1]);
    expect(run("max", a, b)).toEqual([0.5, 0.25, 0.2, 1]);
  });

  it("holds b for the whole block while it does not move", () => {
    expect(run("add", a, values(1))).toEqual([1.5, 0.5, 1.2, 2]);
    expect(run("multiply", a, values(-1))).toEqual([-0.5, 0.5, -0.2, -1]);
  });

  it("takes a as 0 without a cable into it", () => {
    expect(run("add", undefined, values(0.3))).toEqual([0.3, 0.3, 0.3, 0.3]);
    expect(run("max", undefined, b)).toEqual([0.25, 0.25, 0, 0]);
  });

  it("adds on an unknown operation", () => {
    expect(run("nope", a, b)).toEqual(run("add", a, b));
  });
});
