import { describe, expect, it } from "vitest";
import { SpectralFreeze, type FreezeSettings } from "./spectralFreeze";

const SAMPLE_RATE = 44100;
const BLOCK = 128;

const settings = (overrides: Partial<FreezeSettings> = {}): FreezeSettings => ({
  mix: 1,
  release: 0.2,
  ...overrides,
});

const sine = (frequency: number, frames: number, from = 0) =>
  Float32Array.from({ length: frames }, (_, frame) =>
    Math.sin((2 * Math.PI * frequency * (from + frame)) / SAMPLE_RATE),
  );

function render(freeze: SpectralFreeze, input: Float32Array | undefined, startFrame: number, values = settings()) {
  const output = new Float32Array(input?.length ?? SAMPLE_RATE);
  for (let start = 0; start < output.length; start += BLOCK) {
    const end = Math.min(output.length, start + BLOCK);
    freeze.process(input?.subarray(start, end), output.subarray(start, end), startFrame + start, values);
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

describe("SpectralFreeze", () => {
  it("lets the sound through untouched with no mix", () => {
    const freeze = new SpectralFreeze(SAMPLE_RATE);
    const input = sine(440, 8192);

    expect(render(freeze, input, 0, settings({ mix: 0 }))).toEqual(input);
  });

  it("gives nothing of its own until the gate freezes it", () => {
    const freeze = new SpectralFreeze(SAMPLE_RATE);

    expect(rms(render(freeze, sine(440, 8192), 0))).toBe(0);
  });

  it("keeps sounding the note it froze after the sound it got has stopped", () => {
    const freeze = new SpectralFreeze(SAMPLE_RATE);
    render(freeze, sine(440, 8192), 0);
    freeze.freeze(8192);

    const held = render(freeze, new Float32Array(SAMPLE_RATE), 8192);
    const late = held.subarray(SAMPLE_RATE / 2);

    expect(frequency(late)).toBeGreaterThan(440 * 0.98);
    expect(frequency(late)).toBeLessThan(440 * 1.02);
    expect(rms(late)).toBeGreaterThan(0.5);
    expect(rms(late)).toBeLessThan(0.9);
  });

  it("fades out over its release once the gate closes", () => {
    const freeze = new SpectralFreeze(SAMPLE_RATE);
    render(freeze, sine(440, 8192), 0);
    freeze.freeze(8192);
    render(freeze, new Float32Array(8192), 8192);
    freeze.release(16384);

    const output = render(freeze, new Float32Array(SAMPLE_RATE), 16384, settings({ release: 0.2 }));

    expect(rms(output.subarray(0, 1024))).toBeGreaterThan(0.3);
    expect(rms(output.subarray(0.3 * SAMPLE_RATE))).toBeLessThan(0.001);
  });

  it("freezes the new sound when the gate opens again", () => {
    const freeze = new SpectralFreeze(SAMPLE_RATE);
    render(freeze, sine(440, 8192), 0);
    freeze.freeze(8192);
    render(freeze, sine(660, 8192), 8192);
    freeze.freeze(16384);

    const held = render(freeze, new Float32Array(SAMPLE_RATE), 16384).subarray(SAMPLE_RATE / 2);

    expect(frequency(held)).toBeGreaterThan(660 * 0.98);
    expect(frequency(held)).toBeLessThan(660 * 1.02);
  });
});
