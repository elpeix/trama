import { describe, expect, it } from "vitest";
import { harmonicWave } from "./harmonicWave";

const POINTS = 64;
const only = (harmonic: number) => Array.from({ length: 16 }, (_, index) => (index === harmonic - 1 ? 1 : 0));
const saw = Array.from({ length: 16 }, (_, index) => 1 / (index + 1));

describe("harmonicWave", () => {
  it("draws one cycle of the fundamental alone as a sine", () => {
    const wave = harmonicWave(only(1), { brightness: 1, even: 1 }, POINTS);

    expect(wave).toHaveLength(POINTS);
    expect(wave[0]).toBeCloseTo(0);
    expect(wave[POINTS / 4]).toBeCloseTo(1);
    expect(wave[(3 * POINTS) / 4]).toBeCloseTo(-1);
  });

  it("scales the wave to reach the top of the screen", () => {
    const wave = harmonicWave(saw, { brightness: 1, even: 1 }, POINTS);

    expect(Math.max(...wave.map(Math.abs))).toBeCloseTo(1);
  });

  it("leaves out the even harmonics with no even, so each half of the cycle mirrors the other", () => {
    const wave = harmonicWave(saw, { brightness: 1, even: 0 }, POINTS);

    wave.slice(0, POINTS / 2).forEach((value, index) => expect(value).toBeCloseTo(-wave[index + POINTS / 2]));
  });

  it("takes the higher harmonics down with less brightness, leaving the fundamental", () => {
    const dark = harmonicWave(only(16), { brightness: 0, even: 1 }, POINTS);
    const bright = harmonicWave([1, ...only(16).slice(1)], { brightness: 0, even: 1 }, POINTS);

    expect(dark.every((value) => value === 0)).toBe(true);
    expect(bright[POINTS / 4]).toBeCloseTo(1);
  });

  it("is flat with every harmonic silent", () => {
    expect(harmonicWave(Array(16).fill(0), { brightness: 1, even: 1 }, POINTS).every((value) => value === 0)).toBe(true);
  });
});
