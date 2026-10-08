import { describe, expect, it } from "vitest";
import { Phaser, type PhaserSettings } from "./phaser";

const SAMPLE_RATE = 48000;

const settings = (values: Partial<PhaserSettings> = {}): PhaserSettings => ({
  rate: 0.5,
  depth: 0,
  frequency: 1000,
  stages: 2,
  feedback: 0,
  mix: 0.5,
  ...values,
});

const sine = (frequency: number, length = 9600) =>
  Float32Array.from({ length }, (_, index) => Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE));

const run = (phaser: Phaser, input: Float32Array, values: Partial<PhaserSettings>) => {
  const output = new Float32Array(input.length);
  phaser.process(input, output, settings(values));
  return output;
};

/** The loudest sample of the last tenth of a second, once the filters have settled. */
const peak = (output: Float32Array) => Math.max(...[...output.subarray(-4800)].map(Math.abs));

describe("Phaser", () => {
  it("lets the sound through untouched with no mix", () => {
    const input = Float32Array.from([0.5, -0.2, 0.1, 0.9]);

    expect([...run(new Phaser(SAMPLE_RATE), input, { mix: 0, depth: 1, feedback: 0.9 })]).toEqual([...input]);
  });

  it("shifts the phase of the sound without changing its level, alone", () => {
    const output = run(new Phaser(SAMPLE_RATE), sine(300), { mix: 1, stages: 4 });

    expect(peak(output)).toBeCloseTo(1, 1);
  });

  it("cuts out the frequency where two stages turn the phase over, mixed half and half", () => {
    expect(peak(run(new Phaser(SAMPLE_RATE), sine(1000), {}))).toBeLessThan(0.02);
    expect(peak(run(new Phaser(SAMPLE_RATE), sine(100), {}))).toBeGreaterThan(0.8);
  });

  it("moves that notch around Freq with its LFO", () => {
    const output = run(new Phaser(SAMPLE_RATE), sine(1000, 48000), { depth: 1, rate: 2 });

    expect(Math.max(...[...output.subarray(-24000)].map(Math.abs))).toBeGreaterThan(0.3);
  });

  it("makes more notches with more stages", () => {
    const two = peak(run(new Phaser(SAMPLE_RATE), sine(3000), { stages: 2 }));
    const six = peak(run(new Phaser(SAMPLE_RATE), sine(3000), { stages: 6 }));

    expect(six).toBeLessThan(two);
  });

  it("stays bounded with the most feedback", () => {
    const noise = Float32Array.from({ length: 48000 }, (_, index) => Math.sin(index * 12.9898) % 1);

    expect(peak(run(new Phaser(SAMPLE_RATE), noise, { feedback: 0.95, depth: 1, stages: 12, mix: 1 }))).toBeLessThan(30);
  });

  it("changes what it gives with feedback", () => {
    const plain = peak(run(new Phaser(SAMPLE_RATE), sine(700), {}));
    const fed = peak(run(new Phaser(SAMPLE_RATE), sine(700), { feedback: 0.7 }));

    expect(Math.abs(fed - plain)).toBeGreaterThan(0.05);
  });

  it("stays silent without an input", () => {
    const output = new Float32Array(8);

    new Phaser(SAMPLE_RATE).process(undefined, output, settings({ mix: 1 }));

    expect([...output]).toEqual(Array(8).fill(0));
  });
});
