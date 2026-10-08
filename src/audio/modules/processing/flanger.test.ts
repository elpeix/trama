import { describe, expect, it } from "vitest";
import { Flanger, type FlangerSettings } from "./flanger";

const SAMPLE_RATE = 1000;

const settings = (values: Partial<FlangerSettings> = {}): FlangerSettings => ({
  rate: 1,
  depth: 0,
  delay: 3,
  feedback: 0,
  mix: 1,
  ...values,
});

const impulse = (length = 16) => Float32Array.from({ length }, (_, index) => (index === 0 ? 1 : 0));
const ramp = (length: number) => Float32Array.from({ length }, (_, index) => index);

const run = (flanger: Flanger, input: Float32Array, values: Partial<FlangerSettings>) => {
  const output = new Float32Array(input.length);
  flanger.process(input, output, settings(values));
  return output;
};

describe("Flanger", () => {
  it("lets the sound through untouched with no mix", () => {
    const input = Float32Array.from([0.5, -0.2, 0.1, 0.9]);

    expect([...run(new Flanger(SAMPLE_RATE), input, { mix: 0, depth: 1, feedback: 0.9 })]).toEqual([...input]);
  });

  it("delays the sound by Delay, in milliseconds, with no depth nor feedback", () => {
    const output = run(new Flanger(SAMPLE_RATE), impulse(), {});

    expect(output[3]).toBeCloseTo(1);
    expect([...output].filter((value) => Math.abs(value) > 1e-6)).toHaveLength(1);
  });

  it("feeds the delayed sound back in, each echo Feedback times the last", () => {
    const output = run(new Flanger(SAMPLE_RATE), impulse(), { feedback: 0.5 });

    expect([output[3], output[6], output[9], output[12]].map((value) => Number(value.toFixed(3)))).toEqual([
      1, 0.5, 0.25, 0.125,
    ]);
  });

  it("turns each echo over with a negative feedback", () => {
    const output = run(new Flanger(SAMPLE_RATE), impulse(), { feedback: -0.5 });

    expect([output[3], output[6], output[9]].map((value) => Number(value.toFixed(3)))).toEqual([1, -0.5, 0.25]);
  });

  it("mixes the delayed sound with the dry one", () => {
    const output = run(new Flanger(SAMPLE_RATE), impulse(), { mix: 0.5 });

    expect(output[0]).toBeCloseTo(0.5);
    expect(output[3]).toBeCloseTo(0.5);
  });

  it("sweeps the delay with its LFO, by up to Depth times Delay each way", () => {
    const input = ramp(3000);
    const output = run(new Flanger(SAMPLE_RATE), input, { rate: 1, depth: 0.5, delay: 8 });
    const delays = [...output].slice(100).map((value, index) => input[index + 100] - value);

    expect(Math.min(...delays)).toBeCloseTo(4, 0);
    expect(Math.max(...delays)).toBeCloseTo(12, 0);
  });

  it("never reads ahead of what it has written, with the deepest sweep", () => {
    const input = ramp(3000);
    const output = run(new Flanger(SAMPLE_RATE), input, { rate: 1, depth: 1, delay: 8 });
    const delays = [...output].slice(100).map((value, index) => input[index + 100] - value);

    expect(Math.min(...delays)).toBeGreaterThan(0);
  });

  it("starts its LFO at the phase it is given", () => {
    const input = ramp(200);
    const output = run(new Flanger(SAMPLE_RATE, 0.25), input, { rate: 0.01, depth: 0.5, delay: 8 });

    expect(input[100] - output[100]).toBeCloseTo(12, 0);
  });
});
