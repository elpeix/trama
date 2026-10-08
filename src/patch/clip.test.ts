import { describe, expect, it } from "vitest";
import { formatClip, parseClip } from "./clip";

describe("clip", () => {
  it("writes each note with its start and length in beats, in order", () => {
    expect(
      formatClip([
        { note: 64, start: 1, length: 0.5 },
        { note: 60, start: 0, length: 1 },
        { note: 67, start: 1, length: 2.25 },
      ]),
    ).toBe("C4@0+1 E4@1+0.5 G4@1+2.25");
  });

  it("rounds the beats to keep the text short", () => {
    expect(formatClip([{ note: 60, start: 1 / 3, length: 2 / 3 }])).toBe("C4@0.333333+0.666667");
  });

  it("reads them back", () => {
    expect(parseClip("C4@0+1  E4@1+0.5 ")).toEqual([
      { note: 60, start: 0, length: 1 },
      { note: 64, start: 1, length: 0.5 },
    ]);
  });

  it("writes how hard a note is played when it is not the default, and reads it back", () => {
    const text = formatClip([
      { note: 60, start: 0, length: 1, velocity: 90 },
      { note: 64, start: 1, length: 1, velocity: 100 },
      { note: 67, start: 2, length: 1 },
    ]);

    expect(text).toBe("C4@0+1v90 E4@1+1 G4@2+1");
    expect(parseClip(text)).toEqual([
      { note: 60, start: 0, length: 1, velocity: 90 },
      { note: 64, start: 1, length: 1 },
      { note: 67, start: 2, length: 1 },
    ]);
  });

  it("reads an empty clip", () => {
    expect(parseClip("")).toEqual([]);
    expect(parseClip("   ")).toEqual([]);
  });

  it.each([
    ["a note without a start", "C4+1"],
    ["a note that is not a note", "X4@0+1"],
    ["a length of nothing", "C4@0+0"],
    ["a negative start", "C4@-1+1"],
    ["a start past the longest clip", "C4@64+1"],
    ["a velocity of nothing", "C4@0+1v0"],
    ["a velocity past MIDI", "C4@0+1v128"],
  ])("rejects %s", (_name, text) => {
    expect(parseClip(text)).toBeUndefined();
  });
});
