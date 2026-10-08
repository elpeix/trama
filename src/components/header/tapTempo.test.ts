import { describe, expect, it } from "vitest";
import { TapTempo } from "./tapTempo";

describe("TapTempo", () => {
  it("needs two taps to know a tempo", () => {
    const tapper = new TapTempo();

    expect(tapper.tap(0)).toBeUndefined();
    expect(tapper.tap(500)).toBe(120);
  });

  it("averages the last taps", () => {
    const tapper = new TapTempo();

    for (const time of [0, 600, 1190, 1800]) {
      tapper.tap(time);
    }

    expect(tapper.tap(2400)).toBe(100);
  });

  it("starts over after a long pause", () => {
    const tapper = new TapTempo();
    tapper.tap(0);
    tapper.tap(500);

    expect(tapper.tap(5000)).toBeUndefined();
    expect(tapper.tap(5400)).toBe(150);
  });

  it("stays within the tempo range", () => {
    const tapper = new TapTempo();
    tapper.tap(0);

    expect(tapper.tap(100)).toBe(300);
  });
});
