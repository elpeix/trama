import { describe, expect, it } from "vitest";
import { DELAY_SYNC_OPTIONS, LFO_SYNC_OPTIONS, syncBeats, syncedRate, syncedSeconds } from "./tempo";

describe("syncedRate", () => {
  it("gives one cycle per division at the tempo", () => {
    expect(syncedRate("1/4", 120, 4)).toBe(2);
    expect(syncedRate("1/8", 120, 4)).toBe(4);
    expect(syncedRate("1 bar", 120, 4)).toBe(0.5);
    expect(syncedRate("4 bars", 60, 4)).toBe(1 / 16);
  });

  it("gives one cycle per bar of the meter for the divisions in bars", () => {
    expect(syncedRate("1 bar", 120, 3)).toBe(2 / 3);
    expect(syncedRate("2 bars", 60, 5)).toBe(1 / 10);
    expect(syncedRate("1/4", 120, 3)).toBe(2);
  });

  it("is undefined when free", () => {
    expect(syncedRate("free", 120, 4)).toBeUndefined();
  });
});

describe("syncedSeconds", () => {
  it("gives the length of a division, dotted ones included", () => {
    expect(syncedSeconds("1/4", 120, 4)).toBe(0.5);
    expect(syncedSeconds("3/16", 120, 4)).toBe(0.375);
    expect(syncedSeconds("3/8", 100, 4)).toBe(0.9);
    expect(syncedSeconds("1 bar", 120, 3)).toBe(1.5);
    expect(syncedSeconds("free", 120, 4)).toBeUndefined();
  });
});

describe("syncBeats", () => {
  it("gives the beats of a division, those in bars by the beats of a bar", () => {
    expect(syncBeats("1/8", 3)).toBe(0.5);
    expect(syncBeats("1 bar", 3)).toBe(3);
    expect(syncBeats("4 bars", 7)).toBe(28);
    expect(syncBeats("free", 4)).toBeUndefined();
  });
});

describe("sync options", () => {
  it("offer free first, LFOs from slow to fast and delays from short to long", () => {
    expect(LFO_SYNC_OPTIONS).toEqual(["free", "4 bars", "2 bars", "1 bar", "1/2", "1/4", "1/8", "1/16"]);
    expect(DELAY_SYNC_OPTIONS).toEqual(["free", "1/16", "1/8", "3/16", "1/4", "3/8", "1/2"]);
  });
});
