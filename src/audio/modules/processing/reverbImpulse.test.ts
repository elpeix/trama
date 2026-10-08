import { describe, expect, it } from "vitest";
import { reverbImpulse } from "./reverbImpulse";

const SAMPLE_RATE = 1000;

describe("reverbImpulse", () => {
  it("lasts the decay, on two channels", () => {
    const channels = reverbImpulse(2, SAMPLE_RATE);

    expect(channels).toHaveLength(2);
    expect(channels.map((channel) => channel.length)).toEqual([2000, 2000]);
  });

  it("fades out 60 dB over the decay", () => {
    const [left] = reverbImpulse(2, SAMPLE_RATE, () => 1);

    expect(left[0]).toBeCloseTo(1);
    expect(left[1000]).toBeCloseTo(10 ** -1.5);
    expect(left[1999]).toBeCloseTo(0.001, 4);
  });

  it("is noise between -1 and 1", () => {
    const [left] = reverbImpulse(1, SAMPLE_RATE);

    expect(left.every((sample) => sample >= -1 && sample <= 1)).toBe(true);
    expect(left.some((sample) => sample < 0)).toBe(true);
    expect(left.some((sample) => sample > 0)).toBe(true);
  });

  it("draws each side apart, so the tail opens in stereo", () => {
    const [left, right] = reverbImpulse(1, SAMPLE_RATE);

    expect(left).not.toEqual(right);
  });
});
