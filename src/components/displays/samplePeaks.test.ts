import { describe, expect, it } from "vitest";
import { FakeAudioBuffer } from "../../test/fakeAudioContext";
import { samplePeaks } from "./samplePeaks";

describe("samplePeaks", () => {
  it("gives the lowest and highest value of each slice, over every channel", () => {
    const buffer = new FakeAudioBuffer(4, 48000, 2);
    buffer.getChannelData(0).set([0.5, -0.2, 0, 0.1]);
    buffer.getChannelData(1).set([0, 0, -0.8, 2]);

    const [first, second] = samplePeaks(buffer, 2);
    expect(first.min).toBeCloseTo(-0.2);
    expect(first.max).toBe(0.5);
    expect(second.min).toBeCloseTo(-0.8);
    expect(second.max).toBe(1);
  });

  it("draws a sample shorter than the columns without gaps", () => {
    const buffer = new FakeAudioBuffer(2, 48000);
    buffer.getChannelData(0).set([0.5, -0.5]);

    expect(samplePeaks(buffer, 4).map(({ max }) => max)).toEqual([0.5, 0.5, 0, 0]);
  });
});
