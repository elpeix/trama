import { describe, expect, it } from "vitest";
import { filterBandFrequencies, frequencyLabel } from "./filterBands";

describe("filterBandFrequencies", () => {
  it("spreads the bands evenly over the octaves from 25 Hz to 20 kHz", () => {
    const frequencies = filterBandFrequencies(16);

    expect(frequencies).toHaveLength(16);
    expect(frequencies[0]).toBeCloseTo(25);
    expect(frequencies[15]).toBeCloseTo(20000);
    const ratios = frequencies.slice(1).map((frequency, index) => frequency / frequencies[index]);
    ratios.forEach((ratio) => expect(ratio).toBeCloseTo(ratios[0]));
  });
});

describe("frequencyLabel", () => {
  it("writes the hertz below a kilohertz as a whole number", () => {
    expect(frequencyLabel(25)).toBe("25");
    expect(frequencyLabel(148.6)).toBe("149");
    expect(frequencyLabel(884.2)).toBe("884");
  });

  it("writes kilohertz with one decimal, and none when it is round", () => {
    expect(frequencyLabel(1380)).toBe("1.4k");
    expect(frequencyLabel(12810)).toBe("12.8k");
    expect(frequencyLabel(20000)).toBe("20k");
  });
});
