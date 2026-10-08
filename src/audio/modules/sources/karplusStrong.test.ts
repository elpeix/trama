import { describe, expect, it } from "vitest";
import { KarplusStrong, type StringSettings } from "./karplusStrong";

const SAMPLE_RATE = 44100;
const BLOCK = 128;

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

const settings = (overrides: Partial<StringSettings> = {}): StringSettings => ({
  frequency: 441,
  detune: 0,
  decay: 2,
  damp: 0.08,
  brightness: 0.5,
  ...overrides,
});

function render(string: KarplusStrong, frames: number, values: StringSettings = settings()) {
  const output = new Float32Array(frames);
  for (let start = 0; start < frames; start += BLOCK) {
    const block = output.subarray(start, Math.min(frames, start + BLOCK));
    string.process(block, start, values);
  }
  return output;
}

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);

function period(samples: Float32Array, shortest: number, longest: number) {
  let best = shortest;
  let bestScore = -Infinity;
  for (let lag = shortest; lag <= longest; lag++) {
    let score = 0;
    for (let index = 0; index + lag < samples.length; index++) {
      score += samples[index] * samples[index + lag];
    }
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  return best;
}

describe("KarplusStrong", () => {
  it("stays silent until it is plucked", () => {
    const string = new KarplusStrong(SAMPLE_RATE, seeded());

    expect(rms(render(string, 4096))).toBe(0);
  });

  it("starts sounding on the frame it is plucked at", () => {
    const string = new KarplusStrong(SAMPLE_RATE, seeded());
    string.pluck(300);

    const output = render(string, 1024);

    expect(output.subarray(0, 300).every((sample) => sample === 0)).toBe(true);
    expect(rms(output.subarray(300, 600))).toBeGreaterThan(0.05);
  });

  it("rings at its frequency", () => {
    const string = new KarplusStrong(SAMPLE_RATE, seeded());
    string.pluck(0);

    const output = render(string, 8192);

    expect(period(output.subarray(2048), 60, 160)).toBe(100);
  });

  it("follows the detune, in cents", () => {
    const string = new KarplusStrong(SAMPLE_RATE, seeded());
    string.pluck(0);

    const output = render(string, 8192, settings({ frequency: 220.5, detune: 1200 }));

    expect(period(output.subarray(2048), 60, 160)).toBe(100);
  });

  it("fades by 60 dB over its decay", () => {
    const string = new KarplusStrong(SAMPLE_RATE, seeded());
    string.pluck(0);
    const decay = 0.5;

    const output = render(string, SAMPLE_RATE, settings({ decay, brightness: 1 }));
    const window = 2205;
    const start = rms(output.subarray(window, 2 * window));
    const end = rms(output.subarray(window + decay * SAMPLE_RATE, 2 * window + decay * SAMPLE_RATE));

    expect(end / start).toBeGreaterThan(0.0005);
    expect(end / start).toBeLessThan(0.002);
  });

  it("sounds darker with less brightness", () => {
    const roughness = (brightness: number) => {
      const string = new KarplusStrong(SAMPLE_RATE, seeded());
      string.pluck(0);
      const output = render(string, 8192, settings({ brightness })).subarray(4096);
      const steps = output.slice(1).map((sample, index) => sample - output[index]);
      return rms(steps) / rms(output);
    };

    expect(roughness(0)).toBeLessThan(roughness(1) / 2);
  });

  it("adds a new pluck to the one still ringing", () => {
    const string = new KarplusStrong(SAMPLE_RATE, seeded());
    string.pluck(0);
    string.pluck(SAMPLE_RATE / 2);

    const output = render(string, SAMPLE_RATE, settings({ decay: 0.2 }));

    expect(rms(output.subarray(SAMPLE_RATE / 2 - 2205, SAMPLE_RATE / 2))).toBeLessThan(0.01);
    expect(rms(output.subarray(SAMPLE_RATE / 2, SAMPLE_RATE / 2 + 2205))).toBeGreaterThan(0.05);
  });

  it("fades quickly once damped", () => {
    const string = new KarplusStrong(SAMPLE_RATE, seeded());
    string.pluck(0);
    string.damp(SAMPLE_RATE / 4);

    const output = render(string, SAMPLE_RATE / 2, settings({ decay: 4 }));

    expect(rms(output.subarray(SAMPLE_RATE / 4 - 2205, SAMPLE_RATE / 4))).toBeGreaterThan(0.05);
    expect(rms(output.subarray(SAMPLE_RATE / 4 + 4410, SAMPLE_RATE / 4 + 6615))).toBeLessThan(0.005);
  });

  it("rings again when plucked after a damp, even on the same frame", () => {
    const string = new KarplusStrong(SAMPLE_RATE, seeded());
    string.pluck(0);
    string.damp(4410);
    string.pluck(4410);

    const output = render(string, SAMPLE_RATE / 2, settings({ decay: 4 }));

    expect(rms(output.subarray(SAMPLE_RATE / 4, SAMPLE_RATE / 4 + 2205))).toBeGreaterThan(0.05);
  });

  it("fades over its damp time once damped", () => {
    const tail = (damp: number) => {
      const string = new KarplusStrong(SAMPLE_RATE, seeded());
      string.pluck(0);
      string.damp(SAMPLE_RATE / 4);
      const output = render(string, SAMPLE_RATE / 2, settings({ decay: 4, damp }));
      return rms(output.subarray(SAMPLE_RATE / 4 + 4410, SAMPLE_RATE / 4 + 6615));
    };

    expect(tail(0.02)).toBeLessThan(0.001);
    expect(tail(1)).toBeGreaterThan(0.01);
  });
});
