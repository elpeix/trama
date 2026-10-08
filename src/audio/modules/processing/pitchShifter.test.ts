import { describe, expect, it } from "vitest";
import { PitchShifter, type ShifterSettings } from "./pitchShifter";

const SAMPLE_RATE = 44100;
const BLOCK = 128;

const settings = (overrides: Partial<ShifterSettings> = {}): ShifterSettings => ({
  shift: 0,
  window: 60,
  mix: 1,
  ...overrides,
});

const sine = (frequency: number, frames: number) =>
  Float32Array.from({ length: frames }, (_, frame) => Math.sin((2 * Math.PI * frequency * frame) / SAMPLE_RATE));

function render(shifter: PitchShifter, input: Float32Array | undefined, frames: number, values: ShifterSettings) {
  const output = new Float32Array(frames);
  for (let start = 0; start < frames; start += BLOCK) {
    const end = Math.min(frames, start + BLOCK);
    shifter.process(input?.subarray(start, end), output.subarray(start, end), values);
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

describe("PitchShifter", () => {
  it.each([
    [12, 880],
    [-12, 220],
    [7, 440 * 2 ** (7 / 12)],
  ])("moves a sine by %i semitones", (shift, expected) => {
    const shifter = new PitchShifter(SAMPLE_RATE);

    const output = render(shifter, sine(440, SAMPLE_RATE), SAMPLE_RATE, settings({ shift }));

    expect(frequency(output.subarray(SAMPLE_RATE / 4))).toBeGreaterThan(expected * 0.97);
    expect(frequency(output.subarray(SAMPLE_RATE / 4))).toBeLessThan(expected * 1.03);
  });

  it("keeps the level of what it gets", () => {
    const shifter = new PitchShifter(SAMPLE_RATE);

    const output = render(shifter, sine(440, SAMPLE_RATE), SAMPLE_RATE, settings({ shift: 5 }));

    expect(rms(output.subarray(SAMPLE_RATE / 4))).toBeGreaterThan(0.6);
    expect(rms(output.subarray(SAMPLE_RATE / 4))).toBeLessThan(0.8);
  });

  it("lets the sound through untouched with no mix", () => {
    const shifter = new PitchShifter(SAMPLE_RATE);
    const input = sine(440, 4096);

    const output = render(shifter, input, 4096, settings({ shift: 7, mix: 0 }));

    expect(output).toEqual(input);
  });

  it("stays silent with nothing connected", () => {
    const shifter = new PitchShifter(SAMPLE_RATE);

    const output = render(shifter, undefined, 4096, settings({ shift: 7 }));

    expect(rms(output)).toBe(0);
  });
});
