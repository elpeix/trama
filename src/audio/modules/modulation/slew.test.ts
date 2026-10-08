import { describe, expect, it } from "vitest";
import { Slew } from "./slew";

const SAMPLE_RATE = 100;

const values = (...numbers: number[]) => Float32Array.from(numbers);
const filled = (value: number, length = 4) => new Float32Array(length).fill(value);
const rounded = (output: Float32Array) => [...output].map((value) => Number(value.toFixed(2)));

const run = (slew: Slew, input: Float32Array | undefined, rise: number, fall: number, length = 4) => {
  const output = new Float32Array(length);
  slew.process(input, output, rise, fall);
  return rounded(output);
};

describe("Slew", () => {
  it("starts at the first value it gets, without sliding to it", () => {
    const slew = new Slew(SAMPLE_RATE);

    expect(run(slew, filled(0.7), 1, 1)).toEqual([0.7, 0.7, 0.7, 0.7]);
  });

  it("rises by 1 in Rise seconds, at a steady rate", () => {
    const slew = new Slew(SAMPLE_RATE);
    run(slew, filled(0), 0.5, 1);

    expect(run(slew, filled(1), 0.5, 1)).toEqual([0.02, 0.04, 0.06, 0.08]);
  });

  it("falls by 1 in Fall seconds, apart from how it rises", () => {
    const slew = new Slew(SAMPLE_RATE);
    run(slew, filled(0), 1, 0.25);

    expect(run(slew, filled(-1), 1, 0.25)).toEqual([-0.04, -0.08, -0.12, -0.16]);
  });

  it("stops at the value it gets, without going past it", () => {
    const slew = new Slew(SAMPLE_RATE);
    run(slew, filled(0), 0.1, 0.1);

    expect(run(slew, filled(0.25), 0.1, 0.1)).toEqual([0.1, 0.2, 0.25, 0.25]);
  });

  it("follows a signal that moves slower than its rate as it comes", () => {
    const slew = new Slew(SAMPLE_RATE);

    expect(run(slew, values(0, 0.01, 0.02, 0.01), 1, 1)).toEqual([0, 0.01, 0.02, 0.01]);
  });

  it("keeps sliding across blocks", () => {
    const slew = new Slew(SAMPLE_RATE);
    run(slew, filled(0), 0.5, 0.5);
    run(slew, filled(1), 0.5, 0.5);

    expect(run(slew, filled(1), 0.5, 0.5)).toEqual([0.1, 0.12, 0.14, 0.16]);
  });

  it("jumps at once with no time to rise or fall", () => {
    const slew = new Slew(SAMPLE_RATE);
    run(slew, filled(0), 0, 0);

    expect(run(slew, values(1, -1, 0.5, 0.5), 0, 0)).toEqual([1, -1, 0.5, 0.5]);
  });

  it("slides to 0 without a cable into it", () => {
    const slew = new Slew(SAMPLE_RATE);
    run(slew, filled(0.5), 1, 0.5);

    expect(run(slew, undefined, 1, 0.5)).toEqual([0.48, 0.46, 0.44, 0.42]);
  });
});
