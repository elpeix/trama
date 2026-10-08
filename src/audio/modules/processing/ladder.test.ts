import { describe, expect, it } from "vitest";
import { Ladder, type LadderSettings } from "./ladder";

const SAMPLE_RATE = 44100;
const BLOCK = 128;

const settings = (overrides: Partial<LadderSettings> = {}): LadderSettings => ({
  frequency: 1000,
  detune: 0,
  resonance: 0,
  drive: 0,
  ...overrides,
});

const sine = (frequency: number, frames: number, amplitude = 0.5) =>
  new Float32Array(frames).map((_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE));

function filter(input: Float32Array, values: LadderSettings = settings(), ladder = new Ladder(SAMPLE_RATE)) {
  const output = new Float32Array(input.length);
  for (let start = 0; start < input.length; start += BLOCK) {
    const end = Math.min(input.length, start + BLOCK);
    ladder.process(input.subarray(start, end), output.subarray(start, end), values);
  }
  return output;
}

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);

/** How much of a sine comes out, once the filter has settled. */
const gainAt = (frequency: number, values: LadderSettings = settings(), amplitude = 0.5) => {
  const input = sine(frequency, 44100, amplitude);
  return rms(filter(input, values).subarray(22050)) / rms(input.subarray(22050));
};

const peak = (samples: Float32Array) => samples.reduce((loudest, sample) => Math.max(loudest, Math.abs(sample)), 0);

describe("Ladder", () => {
  it("lets through what is well below its frequency", () => {
    expect(gainAt(100)).toBeGreaterThan(0.85);
  });

  it("cuts 24 dB an octave above its frequency", () => {
    const octave = gainAt(4000) / gainAt(8000);

    expect(gainAt(4000)).toBeLessThan(0.1);
    expect(octave).toBeGreaterThan(10);
    expect(octave).toBeLessThan(25);
  });

  it("follows a frequency moved by the detune in cents", () => {
    expect(gainAt(2000, settings({ frequency: 500, detune: 1200 }))).toBeCloseTo(gainAt(2000, settings({ frequency: 1000 })), 2);
  });

  it("rings at its frequency as the resonance goes up, on a sound soft enough not to saturate it", () => {
    expect(gainAt(1000, settings({ resonance: 0.8 }), 0.05)).toBeGreaterThan(3 * gainAt(1000, settings(), 0.05));
  });

  it("goes on singing at its frequency on its own at full resonance", () => {
    const input = new Float32Array(44100);
    input[0] = 1;

    const output = filter(input, settings({ resonance: 1 }));
    const late = output.subarray(33075);
    const crossings = late.filter((sample, index) => index > 0 && late[index - 1] < 0 && sample >= 0).length;

    expect(rms(late)).toBeGreaterThan(0.05);
    expect(crossings / (late.length / SAMPLE_RATE)).toBeGreaterThan(900);
    expect(crossings / (late.length / SAMPLE_RATE)).toBeLessThan(1100);
  });

  it("saturates a sound it drives, squarer and louder but never past 1", () => {
    const input = sine(100, 44100, 1);
    const clean = filter(input, settings({ frequency: 10000 }));
    const driven = filter(input, settings({ frequency: 10000, drive: 1 }));

    expect(peak(driven)).toBeLessThanOrEqual(1);
    expect(rms(driven)).toBeGreaterThan(rms(clean));
    expect(peak(driven) / rms(driven)).toBeLessThan(peak(clean) / rms(clean));
  });

  it("takes params that change on every frame, or hold still as a single value through a block", () => {
    const input = sine(2000, 44100);
    const everyFrame = filter(input, settings({ frequency: new Float32Array(44100).fill(1000), detune: new Float32Array(44100) }));
    const still = filter(input, settings({ frequency: new Float32Array([1000]), detune: new Float32Array([0]), resonance: new Float32Array([0]) }));

    expect(still.every(Number.isFinite)).toBe(true);
    expect(rms(still)).toBeCloseTo(rms(everyFrame), 5);
  });

  it("stays steady at the top of its range, fully resonant and driven", () => {
    const noise = new Float32Array(44100).map((_, index) => Math.sin(index * 12.9898) * 0.9);

    const output = filter(noise, settings({ frequency: 20000, resonance: 1, drive: 1 }));

    expect(output.every(Number.isFinite)).toBe(true);
    expect(peak(output)).toBeLessThanOrEqual(1);
  });

  it("is silent without a sound", () => {
    expect(peak(filter(new Float32Array(4096), settings({ resonance: 0.5 })))).toBe(0);
  });
});
