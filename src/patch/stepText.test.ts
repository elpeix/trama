import { describe, expect, it } from "vitest";
import { alignRows, readNotesText, readRhythmText, readSequenceText } from "./stepText";

const seq = { steps: 4, lowest: 60, highest: 95 };
const drums = { steps: 4, chance: true, retrig: true };

describe("readSequenceText", () => {
  it("reads a sequence with its marks as it is stored", () => {
    expect(readSequenceText("C4! _ _E4 D#4?50", seq)).toEqual({ value: "C4! _ _E4 D#4?50" });
  });

  it("fills the steps left with rests", () => {
    expect(readSequenceText("C4 D4", seq)).toEqual({ value: "C4 D4 - -" });
    expect(readSequenceText("   ", seq)).toEqual({ value: "- - - -" });
  });

  it("takes any spacing", () => {
    expect(readSequenceText("  C4\t -\n  D4  ", seq)).toEqual({ value: "C4 - D4 -" });
  });

  it("takes small letters and flats, and writes them as stored", () => {
    expect(readSequenceText("c4 eb4 bb4! _db5", seq)).toEqual({ value: "C4 D#4 A#4! _C#5" });
  });

  it("points at a step that is not one", () => {
    expect(readSequenceText("C4 H4 D4", seq)).toEqual({
      problem: { start: 3, end: 5, message: '"H4" is not a step: a note (C4), a rest (-) or a tie (_)' },
    });
    expect(readSequenceText("C4 - _C4?50", seq)).toEqual({
      problem: { start: 5, end: 11, message: '"_C4?50" is not a step: a note (C4), a rest (-) or a tie (_)' },
    });
  });

  it("points at a note out of range", () => {
    expect(readSequenceText("C4 B3", seq)).toEqual({
      problem: { start: 3, end: 5, message: "B3 is below C4, the lowest note" },
    });
    expect(readSequenceText("_C7!", seq)).toEqual({
      problem: { start: 0, end: 4, message: "C7 is above B6, the highest note" },
    });
  });

  it("points at the steps beyond the last", () => {
    expect(readSequenceText("C4 - - - D4 E4", seq)).toEqual({
      problem: { start: 9, end: 14, message: "6 steps, and there are 4" },
    });
  });
});

describe("readRhythmText", () => {
  it("reads a rhythm with its chances and retrigs as it is stored", () => {
    expect(readRhythmText("x?50 - x3 x", drums)).toEqual({ value: "x?50 - x3 x" });
  });

  it("fills the steps left with silent ones", () => {
    expect(readRhythmText("x", drums)).toEqual({ value: "x - - -" });
    expect(readRhythmText("", drums)).toEqual({ value: "- - - -" });
  });

  it("takes a capital X", () => {
    expect(readRhythmText("X - X2 -", drums)).toEqual({ value: "x - x2 -" });
  });

  it("points at a step that is not one", () => {
    expect(readRhythmText("x - o x", drums)).toEqual({
      problem: { start: 4, end: 5, message: '"o" is not a step: x for one that sounds, - for one that does not' },
    });
    expect(readRhythmText("x5", drums)).toEqual({
      problem: { start: 0, end: 2, message: '"x5" is not a step: x for one that sounds, - for one that does not' },
    });
  });

  it("points at chances and retrigs where the row has none", () => {
    const plain = { steps: 4 };
    expect(readRhythmText("x - x?50", plain)).toEqual({
      problem: { start: 4, end: 8, message: "These steps have no chance" },
    });
    expect(readRhythmText("x3", plain)).toEqual({
      problem: { start: 0, end: 2, message: "These steps do not sound several times within themselves" },
    });
  });

  it("points at the steps beyond the last", () => {
    expect(readRhythmText("x - x - x", drums)).toEqual({
      problem: { start: 8, end: 9, message: "5 steps, and there are 4" },
    });
  });
});

describe("readNotesText", () => {
  const notes = { lowest: 60, highest: 72 };

  it("reads a set of notes as it is stored: from the lowest, once each", () => {
    expect(readNotesText("g4 C4 eb4 c4", notes)).toEqual({ value: "C4 D#4 G4" });
  });

  it("reads nothing as no notes", () => {
    expect(readNotesText("  ", notes)).toEqual({ value: "" });
  });

  it("points at what is not a note", () => {
    expect(readNotesText("C4 - E4", notes)).toEqual({
      problem: { start: 3, end: 4, message: '"-" is not a note: a name and an octave (C4)' },
    });
  });

  it("points at a note out of range", () => {
    expect(readNotesText("C4 D5", notes)).toEqual({
      problem: { start: 3, end: 5, message: "D5 is above C5, the highest note" },
    });
  });
});

describe("alignRows", () => {
  it("pads the steps of every row to the widest in their column", () => {
    expect(alignRows(["x?50 - x3 x", "x - x x?25"])).toEqual(["x?50 - x3 x", "x    - x  x?25"]);
  });

  it("leaves a single row as it is", () => {
    expect(alignRows(["C4! - D4"])).toEqual(["C4! - D4"]);
  });
});
