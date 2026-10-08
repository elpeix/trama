import { describe, expect, it } from "vitest";
import { CEILING, OutputLimiter } from "./limiter";

const SAMPLE_RATE = 48000;
const BLOCK = 128;

const sine = (frequency: number, seconds: number, amplitude: number) =>
  new Float32Array(Math.round(seconds * SAMPLE_RATE)).map(
    (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE),
  );

function run(limiter: OutputLimiter, left: Float32Array, right: Float32Array | undefined = left) {
  const outputs = [new Float32Array(left.length), new Float32Array(left.length)];
  const muted: number[] = [];
  for (let start = 0; start < left.length; start += BLOCK) {
    const end = Math.min(left.length, start + BLOCK);
    const inputs = right ? [left.subarray(start, end), right.subarray(start, end)] : [left.subarray(start, end)];
    if (limiter.process(inputs, [outputs[0].subarray(start, end), outputs[1].subarray(start, end)])) {
      muted.push(start);
    }
  }
  return { outputs, muted };
}

const peak = (samples: Float32Array) => samples.reduce((highest, sample) => Math.max(highest, Math.abs(sample)), 0);

describe("OutputLimiter", () => {
  it("keeps its ceiling just under 0 dBFS", () => {
    expect(20 * Math.log10(CEILING)).toBeCloseTo(-0.3, 5);
  });

  it("lets a sound under the ceiling through untouched", () => {
    const input = sine(440, 0.1, 0.5);

    const { outputs } = run(new OutputLimiter(SAMPLE_RATE), input);

    expect(outputs[0]).toEqual(input);
    expect(outputs[1]).toEqual(input);
  });

  it("never goes past the ceiling, however loud the sound", () => {
    const { outputs } = run(new OutputLimiter(SAMPLE_RATE), sine(220, 0.3, 3));

    expect(peak(outputs[0])).toBeLessThanOrEqual(CEILING);
    expect(peak(outputs[0])).toBeGreaterThan(CEILING * 0.95);
  });

  it("brings both sides down together, so the sound stays where it was panned", () => {
    const left = sine(220, 0.1, 3);
    const right = left.map((sample) => sample / 3);

    const { outputs } = run(new OutputLimiter(SAMPLE_RATE), left, right);

    outputs[0].forEach((sample, index) => expect(outputs[1][index]).toBeCloseTo(sample / 3, 5));
  });

  it("sends a mono sound to both sides", () => {
    const input = sine(440, 0.05, 0.5);

    const { outputs } = run(new OutputLimiter(SAMPLE_RATE), input, undefined);

    expect(outputs[1]).toEqual(input);
  });

  it("lets the sound back up after a peak", () => {
    const limiter = new OutputLimiter(SAMPLE_RATE);
    run(limiter, sine(220, 0.05, 3));

    const { outputs } = run(limiter, sine(220, 1, 0.5));

    expect(peak(outputs[0].subarray(SAMPLE_RATE / 2))).toBeCloseTo(0.5, 2);
  });

  it("goes quiet when the sound stays far above the ceiling, and says so once", () => {
    const limiter = new OutputLimiter(SAMPLE_RATE);

    const { outputs, muted } = run(limiter, sine(110, 1, 10));

    expect(muted).toHaveLength(1);
    expect(muted[0] / SAMPLE_RATE).toBeGreaterThan(0.45);
    expect(muted[0] / SAMPLE_RATE).toBeLessThan(0.6);
    expect(peak(outputs[0].subarray(muted[0] + BLOCK))).toBe(0);
    expect(limiter.muted).toBe(true);
  });

  it("does not go quiet for a loud hit that ends soon", () => {
    const limiter = new OutputLimiter(SAMPLE_RATE);

    const { muted } = run(limiter, Float32Array.from([...sine(110, 0.3, 10), ...sine(110, 1, 0.5)]));

    expect(muted).toEqual([]);
    expect(limiter.muted).toBe(false);
  });

  it("does not go quiet for a loud mix the ceiling holds", () => {
    const { muted } = run(new OutputLimiter(SAMPLE_RATE), sine(110, 2, 2));

    expect(muted).toEqual([]);
  });

  it("goes quiet at once on a sample that is not a number", () => {
    const limiter = new OutputLimiter(SAMPLE_RATE);
    const input = sine(440, 0.01, 0.5);
    input[3] = Number.NaN;

    const { outputs, muted } = run(limiter, input);

    expect(muted).toEqual([0]);
    expect(peak(outputs[0].subarray(3))).toBe(0);
    expect(outputs[0].slice(0, 3)).toEqual(input.slice(0, 3));
  });

  it("goes quiet at once on an infinite sample", () => {
    const input = sine(440, 0.01, 0.5);
    input[200] = Number.POSITIVE_INFINITY;

    const { muted } = run(new OutputLimiter(SAMPLE_RATE), input);

    expect(muted).toEqual([BLOCK]);
  });

  it("sounds again, from scratch, once unmuted", () => {
    const limiter = new OutputLimiter(SAMPLE_RATE);
    run(limiter, sine(110, 1, 10));

    limiter.unmute();
    const input = sine(440, 0.1, 0.5);
    const { outputs, muted } = run(limiter, input);

    expect(limiter.muted).toBe(false);
    expect(muted).toEqual([]);
    expect(outputs[0]).toEqual(input);
  });

  it("lets everything through, and never goes quiet, when turned off", () => {
    const limiter = new OutputLimiter(SAMPLE_RATE);
    limiter.enabled = false;
    const input = sine(110, 1, 10);

    const { outputs, muted } = run(limiter, input);

    expect(outputs[0]).toEqual(input);
    expect(muted).toEqual([]);
  });

  it("sounds again when turned off after going quiet", () => {
    const limiter = new OutputLimiter(SAMPLE_RATE);
    run(limiter, sine(110, 1, 10));

    limiter.enabled = false;
    const input = sine(440, 0.1, 0.5);
    const { outputs } = run(limiter, input);

    expect(limiter.muted).toBe(false);
    expect(outputs[0]).toEqual(input);
  });

  it("is silent with nothing coming in", () => {
    const outputs = [new Float32Array(BLOCK).fill(1), new Float32Array(BLOCK).fill(1)];

    new OutputLimiter(SAMPLE_RATE).process([], outputs);

    expect(peak(outputs[0])).toBe(0);
    expect(peak(outputs[1])).toBe(0);
  });
});
