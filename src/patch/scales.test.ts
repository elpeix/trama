import { describe, expect, it } from "vitest";
import { noteName } from "./pitch";
import { gridRows, scaleChord } from "./scales";

const names = (rows: ReturnType<typeof gridRows>) => rows.map(({ note }) => noteName(note));

describe("gridRows", () => {
  it("shows two octaves of a pentatonic scale from its root, highest first", () => {
    expect(names(gridRows("pentatonic minor", "C", 60, []))).toEqual([
      "C6", "A#5", "G5", "F5", "D#5", "C5", "A#4", "G4", "F4", "D#4", "C4",
    ]);
  });

  it("starts from the chosen root", () => {
    expect(names(gridRows("major", "D", 60, [])).slice(-8)).toEqual([
      "D5", "C#5", "B4", "A4", "G4", "F#4", "E4", "D4",
    ]);
  });

  it("shows a single octave of the chromatic scale", () => {
    const rows = gridRows("chromatic", "C", 60, []);

    expect(rows).toHaveLength(13);
    expect(names(rows)[0]).toBe("C5");
    expect(rows.every(({ inScale }) => inScale)).toBe(true);
  });

  it("keeps the rows of notes placed outside the scale, marked", () => {
    // E4 is not in C minor pentatonic.
    const rows = gridRows("pentatonic minor", "C", 60, [60, null, 64, 64]);

    expect(rows.find(({ note }) => note === 64)).toEqual({ note: 64, inScale: false });
    expect(rows.filter(({ inScale }) => !inScale)).toHaveLength(1);
    expect(rows.map(({ note }) => note)).toEqual([...rows.map(({ note }) => note)].sort((a, b) => b - a));
  });
});

describe("scaleChord", () => {
  it("plays the note alone with no chord", () => {
    expect(scaleChord(62, "off", "major", "C")).toEqual([62]);
  });

  it("stacks thirds within the scale, so each degree gets its own chord", () => {
    expect(scaleChord(60, "triad", "major", "C")).toEqual([60, 64, 67]);
    expect(scaleChord(62, "triad", "major", "C")).toEqual([62, 65, 69]);
    expect(scaleChord(71, "triad", "major", "C")).toEqual([71, 74, 77]);
    expect(scaleChord(57, "triad", "minor", "A")).toEqual([57, 60, 64]);
  });

  it("adds the seventh, or keeps only the fifth", () => {
    expect(scaleChord(67, "7th", "major", "C")).toEqual([67, 71, 74, 77]);
    expect(scaleChord(64, "5th", "minor", "A")).toEqual([64, 71]);
  });

  it("stacks every other note of a pentatonic scale", () => {
    expect(scaleChord(60, "triad", "pentatonic minor", "C")).toEqual([60, 65, 70]);
  });

  it("builds the chords of the major scale of the root for the chromatic scale", () => {
    expect(scaleChord(62, "triad", "chromatic", "C")).toEqual([62, 65, 69]);
  });

  it("builds a chord on a note outside the scale from the note of the scale below it", () => {
    expect(scaleChord(61, "triad", "major", "C")).toEqual([61, 64, 67]);
  });
});
