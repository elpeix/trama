import { describe, expect, it } from "vitest";
import { Chorus, type ChorusSettings } from "./chorus";

const SAMPLE_RATE = 1000;

const settings = (values: Partial<ChorusSettings> = {}): ChorusSettings => ({
  rate: 1,
  depth: 0,
  delay: 5,
  voices: 1,
  mix: 1,
  ...values,
});

const impulse = (length = 16) => Float32Array.from({ length }, (_, index) => (index === 0 ? 1 : 0));
const ramp = (length: number) => Float32Array.from({ length }, (_, index) => index);
const rounded = (samples: Float32Array) => [...samples].map((value) => Number(value.toFixed(3)));

const run = (chorus: Chorus, input: Float32Array, values: Partial<ChorusSettings>) => {
  const output = new Float32Array(input.length);
  chorus.process(input, output, settings(values));
  return output;
};

describe("Chorus", () => {
  it("lets the sound through untouched with no mix", () => {
    const input = Float32Array.from([0.5, -0.2, 0.1, 0.9]);

    expect(rounded(run(new Chorus(SAMPLE_RATE), input, { mix: 0, depth: 1 }))).toEqual(rounded(input));
  });

  it("delays the sound by Delay, in milliseconds, with no depth", () => {
    const output = run(new Chorus(SAMPLE_RATE), impulse(), {});

    expect(output[5]).toBeCloseTo(1);
    expect([...output].filter((value) => Math.abs(value) > 1e-6)).toHaveLength(1);
  });

  it("gives the sound at the same level whatever the number of voices", () => {
    const output = run(new Chorus(SAMPLE_RATE), impulse(), { voices: 3 });

    expect(output[5]).toBeCloseTo(1);
  });

  it("mixes the delayed sound with the dry one", () => {
    const output = run(new Chorus(SAMPLE_RATE), impulse(), { mix: 0.25 });

    expect(output[0]).toBeCloseTo(0.75);
    expect(output[5]).toBeCloseTo(0.25);
  });

  it("sweeps the delay with its LFO, by up to half of Delay each way", () => {
    const input = ramp(3000);
    const output = run(new Chorus(SAMPLE_RATE), input, { rate: 1, depth: 1, delay: 20 });
    const delays = [...output].slice(100).map((value, index) => input[index + 100] - value);

    expect(Math.min(...delays)).toBeCloseTo(10, 0);
    expect(Math.max(...delays)).toBeCloseTo(30, 0);
  });

  it("starts its LFO at the phase it is given, so the two sides of a stereo sound differ", () => {
    const input = ramp(200);
    const output = run(new Chorus(SAMPLE_RATE, 0.25), input, { rate: 0.01, depth: 1, delay: 20 });

    expect(input[100] - output[100]).toBeCloseTo(30, 0);
  });

  it("keeps sweeping across blocks as in a single one", () => {
    const input = ramp(400);
    const whole = run(new Chorus(SAMPLE_RATE), input, { depth: 0.8, delay: 20, voices: 2 });
    const split = new Chorus(SAMPLE_RATE);
    const first = run(split, input.subarray(0, 128), { depth: 0.8, delay: 20, voices: 2 });
    const second = run(split, input.subarray(128), { depth: 0.8, delay: 20, voices: 2 });

    expect(rounded(Float32Array.from([...first, ...second]))).toEqual(rounded(whole));
  });

  it("stays silent without an input", () => {
    const output = new Float32Array(8);

    new Chorus(SAMPLE_RATE).process(undefined, output, settings());

    expect([...output]).toEqual(Array(8).fill(0));
  });
});
