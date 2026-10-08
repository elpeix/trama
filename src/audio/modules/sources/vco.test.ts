import { describe, expect, it } from "vitest";
import { Vco, type VcoSettings } from "./vco";

const SAMPLE_RATE = 44100;
const BLOCK = 128;

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

const settings = (overrides: Partial<VcoSettings> = {}): VcoSettings => ({
  wave: "sawtooth",
  frequency: 441,
  detune: 0,
  width: 0.5,
  voices: 1,
  spread: 0,
  drift: 0,
  ...overrides,
});

function render(vco: Vco, frames: number, values: VcoSettings = settings(), sync?: Float32Array) {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let start = 0; start < frames; start += BLOCK) {
    const end = Math.min(frames, start + BLOCK);
    vco.process(left.subarray(start, end), right.subarray(start, end), sync?.subarray(start, end), values);
  }
  return { left, right };
}

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);

const mean = (samples: Float32Array) => samples.reduce((sum, sample) => sum + sample, 0) / samples.length;

function period(samples: Float32Array, shortest: number, longest: number) {
  let best = shortest;
  let bestScore = -Infinity;
  for (let lag = shortest; lag <= longest; lag++) {
    let score = 0;
    for (let index = 0; index + lag < samples.length; index++) {
      score -= Math.abs(samples[index] - samples[index + lag]);
    }
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  return best;
}

const biggestJump = (samples: Float32Array) =>
  samples.slice(1).reduce((biggest, sample, index) => Math.max(biggest, Math.abs(sample - samples[index])), 0);

describe("Vco", () => {
  it("plays its wave at the frequency, moved by the detune in cents", () => {
    expect(period(render(new Vco(SAMPLE_RATE, seeded()), 4096).left, 50, 150)).toBe(100);
    expect(period(render(new Vco(SAMPLE_RATE, seeded()), 4096, settings({ detune: 1200 })).left, 30, 80)).toBe(50);
  });

  it("follows a frequency and a detune that change on every frame", () => {
    const frequency = new Float32Array(4096).fill(882);
    const detune = new Float32Array(4096).fill(-1200);

    expect(period(render(new Vco(SAMPLE_RATE, seeded()), 4096, settings({ frequency, detune })).left, 50, 150)).toBe(100);
  });

  it("takes a param that holds still through a block as a single value, as the audio thread gives it", () => {
    const still = new Float32Array([441]);
    const { left } = render(new Vco(SAMPLE_RATE, seeded()), 4096, settings({ frequency: still, detune: new Float32Array([0]), width: new Float32Array([0.5]) }));

    expect(left.every(Number.isFinite)).toBe(true);
    expect(period(left, 50, 150)).toBe(100);
  });

  it("plays a sine, a triangle, a saw and a square, each between -1 and 1", () => {
    for (const wave of ["sine", "triangle", "sawtooth", "square"] as const) {
      const { left } = render(new Vco(SAMPLE_RATE, seeded()), 4096, settings({ wave }));

      expect(Math.max(...left)).toBeLessThanOrEqual(1.05);
      expect(Math.min(...left)).toBeGreaterThanOrEqual(-1.05);
      expect(rms(left)).toBeGreaterThan(0.5);
    }
  });

  it("spreads the jump of a saw over two frames, so that it does not alias", () => {
    const { left } = render(new Vco(SAMPLE_RATE, seeded()), 4096);

    expect(biggestJump(left)).toBeLessThan(1.5);
  });

  it("keeps a square up for the Width of each cycle, without a DC offset", () => {
    const { left } = render(new Vco(SAMPLE_RATE, seeded()), 44100, settings({ wave: "square", width: 0.25 }));
    const middle = mean(left);
    const up = left.filter((sample) => sample > middle).length / left.length;

    expect(up).toBeCloseTo(0.25, 1);
    expect(Math.abs(mean(left))).toBeLessThan(0.01);
  });

  it("plays the same in both channels with one voice", () => {
    const { left, right } = render(new Vco(SAMPLE_RATE, seeded()), 1024);

    expect(right).toEqual(left);
  });

  it("spreads its voices in pitch and across the stereo field, as loud as one voice", () => {
    const one = render(new Vco(SAMPLE_RATE, seeded()), 44100).left;
    const { left, right } = render(new Vco(SAMPLE_RATE, seeded()), 44100, settings({ voices: 5, spread: 30 }));

    expect(right).not.toEqual(left);
    expect(rms(left) / rms(one)).toBeGreaterThan(0.6);
    expect(rms(left) / rms(one)).toBeLessThan(1.5);
  });

  it("starts its cycle again on each rising edge into sync, taking the period of what syncs it", () => {
    const sync = new Float32Array(8192).map((_, index) => (index % 441 < 220 ? 1 : -1));
    const { left } = render(new Vco(SAMPLE_RATE, seeded()), 8192, settings({ frequency: 1000 }), sync);

    expect(period(left.subarray(441), 300, 600)).toBe(441);
    expect(left[441 + 2]).toBeLessThan(-0.8);
  });

  it("drifts its pitch a little, and stays put without drift", () => {
    const still = render(new Vco(SAMPLE_RATE, seeded()), 44100).left;
    const drifting = render(new Vco(SAMPLE_RATE, seeded()), 44100, settings({ drift: 1 })).left;
    const late = drifting.subarray(22050);

    expect(drifting).not.toEqual(still);
    expect(period(late, 90, 110)).toBeGreaterThanOrEqual(99);
    expect(period(late, 90, 110)).toBeLessThanOrEqual(101);
  });
});
