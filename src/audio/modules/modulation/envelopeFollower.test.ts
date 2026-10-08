import { describe, expect, it } from "vitest";
import { EnvelopeFollower } from "./envelopeFollower";

const SAMPLE_RATE = 1000;

const filled = (value: number, length = 4) => new Float32Array(length).fill(value);
const alternating = (value: number, length = 4) =>
  Float32Array.from({ length }, (_, index) => (index % 2 === 0 ? value : -value));

const run = (
  follower: EnvelopeFollower,
  channels: Float32Array[],
  { attack = 0.01, release = 0.1, gain = 1 } = {},
  length = 4,
) => {
  const output = new Float32Array(length);
  follower.process(channels, output, attack, release, gain);
  return output;
};

const settle = (follower: EnvelopeFollower, channels: Float32Array[], settings = {}) => {
  let output = new Float32Array();
  for (let block = 0; block < 500; block++) {
    output = run(follower, channels, settings);
  }
  return output;
};

describe("EnvelopeFollower", () => {
  it("gives 0 in silence and without an input", () => {
    const follower = new EnvelopeFollower(SAMPLE_RATE);

    expect([...run(follower, [filled(0)])]).toEqual([0, 0, 0, 0]);
    expect([...run(follower, [])]).toEqual([0, 0, 0, 0]);
  });

  it("settles on the level of the sound, whichever way it swings", () => {
    const follower = new EnvelopeFollower(SAMPLE_RATE);

    expect(settle(follower, [alternating(0.6)])[3]).toBeCloseTo(0.6, 3);
  });

  it("rises by nearly two thirds of the way in Attack seconds", () => {
    const follower = new EnvelopeFollower(SAMPLE_RATE);

    const output = run(follower, [filled(1, 10)], { attack: 0.01 }, 10);

    expect(output[9]).toBeCloseTo(1 - Math.exp(-1), 2);
    expect(output[0]).toBeLessThan(output[9]);
  });

  it("falls by nearly two thirds of the way in Release seconds, apart from how it rises", () => {
    const follower = new EnvelopeFollower(SAMPLE_RATE);
    settle(follower, [filled(1)], { attack: 0.001, release: 0.02 });

    const output = run(follower, [filled(0, 20)], { attack: 0.001, release: 0.02 }, 20);

    expect(output[19]).toBeCloseTo(Math.exp(-1), 2);
  });

  it("follows the louder side of a stereo sound", () => {
    const follower = new EnvelopeFollower(SAMPLE_RATE);

    expect(settle(follower, [filled(0.2), filled(-0.7)])[3]).toBeCloseTo(0.7, 3);
  });

  it("multiplies the level by Gain", () => {
    const follower = new EnvelopeFollower(SAMPLE_RATE);

    expect(settle(follower, [filled(0.25)], { gain: 3 })[3]).toBeCloseTo(0.75, 3);
  });

  it("follows at once with no time to rise or fall", () => {
    const follower = new EnvelopeFollower(SAMPLE_RATE);
    const input = Float32Array.from([0.5, -0.9, 0, 0.3]);

    expect([...run(follower, [input], { attack: 0, release: 0 })].map((value) => Number(value.toFixed(2)))).toEqual([
      0.5, 0.9, 0, 0.3,
    ]);
  });
});
