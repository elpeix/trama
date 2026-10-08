import { describe, expect, it } from "vitest";
import { Granulator, type GrainSettings } from "./granulator";

const SAMPLE_RATE = 44100;
const BLOCK = 128;

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

const settings = (overrides: Partial<GrainSettings> = {}): GrainSettings => ({
  position: 0.1,
  size: 100,
  density: 40,
  pitch: 0,
  spread: 0,
  mix: 1,
  freeze: false,
  ...overrides,
});

const sine = (frequency: number, frames: number) =>
  Float32Array.from({ length: frames }, (_, frame) => Math.sin((2 * Math.PI * frequency * frame) / SAMPLE_RATE));

function render(granulator: Granulator, input: Float32Array, values: GrainSettings = settings()) {
  const output = new Float32Array(input.length);
  for (let start = 0; start < input.length; start += BLOCK) {
    const end = Math.min(input.length, start + BLOCK);
    granulator.process(input.subarray(start, end), output.subarray(start, end), values);
  }
  return output;
}

function frequency(samples: Float32Array) {
  let crossings = 0;
  for (let index = 1; index < samples.length; index++) {
    if (samples[index - 1] < 0 && samples[index] >= 0) {
      crossings++;
    }
  }
  return (crossings * SAMPLE_RATE) / samples.length;
}

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);

describe("Granulator", () => {
  it("lets the sound through untouched with no mix", () => {
    const input = sine(440, 8192);

    expect(render(new Granulator(SAMPLE_RATE, seeded()), input, settings({ mix: 0 }))).toEqual(input);
  });

  it("stays silent on silence", () => {
    expect(rms(render(new Granulator(SAMPLE_RATE, seeded()), new Float32Array(SAMPLE_RATE)))).toBe(0);
  });

  it("keeps about the level of the sound it gets", () => {
    const output = render(new Granulator(SAMPLE_RATE, seeded()), sine(440, SAMPLE_RATE));

    expect(rms(output.subarray(SAMPLE_RATE / 2))).toBeGreaterThan(0.3);
    expect(rms(output.subarray(SAMPLE_RATE / 2))).toBeLessThan(1);
  });

  it.each([
    [12, 880],
    [-12, 220],
  ])("plays its grains %i semitones away", (pitch, expected) => {
    const output = render(new Granulator(SAMPLE_RATE, seeded()), sine(440, SAMPLE_RATE), settings({ pitch, density: 80 }));

    expect(frequency(output.subarray(SAMPLE_RATE / 2))).toBeGreaterThan(expected * 0.93);
    expect(frequency(output.subarray(SAMPLE_RATE / 2))).toBeLessThan(expected * 1.07);
  });

  it("reads the sound from as far back as its position", () => {
    const input = new Float32Array(SAMPLE_RATE);
    input.set(sine(440, 2205));

    const output = render(new Granulator(SAMPLE_RATE, seeded()), input, settings({ position: 0.5, size: 50 }));

    expect(rms(output.subarray(0, 0.4 * SAMPLE_RATE))).toBe(0);
    expect(rms(output.subarray(0.45 * SAMPLE_RATE, 0.65 * SAMPLE_RATE))).toBeGreaterThan(0.01);
    expect(rms(output.subarray(0.8 * SAMPLE_RATE))).toBe(0);
  });

  it("keeps playing the sound it holds once frozen, after what it gets has stopped", () => {
    const granulator = new Granulator(SAMPLE_RATE, seeded());
    render(granulator, sine(440, SAMPLE_RATE / 2));

    const held = render(granulator, new Float32Array(SAMPLE_RATE), settings({ freeze: true }));

    expect(rms(held.subarray(SAMPLE_RATE / 2))).toBeGreaterThan(0.3);
  });

  it("never reads ahead of the sound it has, even played faster", () => {
    const input = new Float32Array(SAMPLE_RATE);
    input.set(sine(440, 2205), SAMPLE_RATE / 2);

    const output = render(
      new Granulator(SAMPLE_RATE, seeded()),
      input,
      settings({ position: 0, size: 200, pitch: 24 }),
    );

    expect(rms(output.subarray(0, SAMPLE_RATE / 2))).toBe(0);
  });
});
