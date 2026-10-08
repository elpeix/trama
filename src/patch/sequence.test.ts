import { describe, expect, it } from "vitest";
import {
  formatCurve,
  formatNotes,
  formatRhythm,
  formatRhythmSteps,
  formatSequence,
  formatSteps,
  noteFromName,
  parseCurve,
  parseNotes,
  parseRhythm,
  parseRhythmSteps,
  parseSequence,
  parseSteps,
  transposeSequence,
} from "./sequence";

describe("noteFromName", () => {
  it("reads note names with middle C as C4", () => {
    expect(noteFromName("C4")).toBe(60);
    expect(noteFromName("D#4")).toBe(63);
    expect(noteFromName("B3")).toBe(59);
    expect(noteFromName("C-1")).toBe(0);
  });

  it("rejects anything else", () => {
    for (const name of ["", "H4", "C", "c4", "Db4", "C#", "C4x"]) {
      expect(noteFromName(name)).toBeUndefined();
    }
  });
});

describe("steps", () => {
  it("writes notes and rests as readable text", () => {
    expect(formatSteps([60, null, 63, 72])).toBe("C4 - D#4 C5");
  });

  it("reads them back", () => {
    expect(parseSteps("C4 - D#4 C5")).toEqual([60, null, 63, 72]);
    expect(parseSteps("  C4   -  ")).toEqual([60, null]);
  });

  it("rejects text that is not a sequence", () => {
    expect(parseSteps("C4 X D4")).toBeUndefined();
    expect(parseSteps("C4,D4")).toBeUndefined();
  });
});

describe("notes", () => {
  it("writes a set of notes from the lowest, once each", () => {
    expect(formatNotes([67, 60, 64, 60])).toBe("C4 E4 G4");
    expect(formatNotes([])).toBe("");
  });

  it("reads them back in order, and nothing as no notes", () => {
    expect(parseNotes("G4 C4 E4")).toEqual([60, 64, 67]);
    expect(parseNotes("")).toEqual([]);
  });

  it("rejects what is not a note, rests included", () => {
    expect(parseNotes("C4 X")).toBeUndefined();
    expect(parseNotes("C4 -")).toBeUndefined();
  });
});

describe("rhythm", () => {
  it("writes the steps that sound as x and the silent ones as -", () => {
    expect(formatRhythm([true, false, true, true])).toBe("x - x x");
  });

  it("reads them back", () => {
    expect(parseRhythm("x - x x")).toEqual([true, false, true, true]);
    expect(parseRhythm("  x   -  ")).toEqual([true, false]);
  });

  it("rejects text that is not a rhythm", () => {
    expect(parseRhythm("x o x")).toBeUndefined();
    expect(parseRhythm("C4 -")).toBeUndefined();
    expect(parseRhythm("")).toBeUndefined();
  });

  it("reads a step that sounds now and then as one that sounds, to what only needs to know that", () => {
    expect(parseRhythm("x?50 - x")).toEqual([true, false, true]);
  });
});

describe("rhythm with chances", () => {
  it("writes the chance of a step that sounds after it, in percent, unless it always sounds", () => {
    expect(
      formatRhythmSteps([{ sounds: true, chance: 50 }, { sounds: false }, { sounds: true }, { sounds: true, chance: 100 }]),
    ).toBe("x?50 - x x");
  });

  it("reads them back, a step without a chance always sounding", () => {
    expect(parseRhythmSteps("x?50 - x")).toEqual([{ sounds: true, chance: 50 }, { sounds: false }, { sounds: true }]);
    expect(parseRhythmSteps("x?100")).toEqual([{ sounds: true }]);
  });

  it("rejects a chance on a silent step, or one that is not a percent from 1 to 100", () => {
    expect(parseRhythmSteps("-?50")).toBeUndefined();
    expect(parseRhythmSteps("x?0")).toBeUndefined();
    expect(parseRhythmSteps("x?101")).toBeUndefined();
    expect(parseRhythmSteps("x?")).toBeUndefined();
    expect(parseRhythmSteps("x?33.5")).toBeUndefined();
    expect(parseRhythm("x?0")).toBeUndefined();
  });
});

describe("rhythm with retrigs", () => {
  it("writes how many times a step sounds within itself after the x, and before its chance", () => {
    expect(
      formatRhythmSteps([{ sounds: true, retrig: 2 }, { sounds: false }, { sounds: true, retrig: 3, chance: 50 }, { sounds: true, retrig: 4 }]),
    ).toBe("x2 - x3?50 x4");
  });

  it("reads them back, as steps that sound to what only needs to know that", () => {
    expect(parseRhythmSteps("x2 - x3?50 x4")).toEqual([
      { sounds: true, retrig: 2 },
      { sounds: false },
      { sounds: true, retrig: 3, chance: 50 },
      { sounds: true, retrig: 4 },
    ]);
    expect(parseRhythm("x2 - x4?25")).toEqual([true, false, true]);
  });

  it("rejects retrigs on a silent step, or other than 2 to 4", () => {
    expect(parseRhythmSteps("-2")).toBeUndefined();
    expect(parseRhythmSteps("x1")).toBeUndefined();
    expect(parseRhythmSteps("x5")).toBeUndefined();
    expect(parseRhythmSteps("x?50 2")).toBeUndefined();
    expect(parseRhythmSteps("x?502")).toBeUndefined();
  });
});

describe("curve", () => {
  it("writes each value rounded to the step", () => {
    expect(formatCurve([0, 0.5, -1, 0.3333], 0.01)).toBe("0 0.5 -1 0.33");
    expect(formatCurve([-0.004, 12.25], 0.5)).toBe("0 12.5");
  });

  it("reads them back", () => {
    expect(parseCurve("0 0.5 -1 0.33")).toEqual([0, 0.5, -1, 0.33]);
    expect(parseCurve("  1   -0.25  ")).toEqual([1, -0.25]);
  });

  it("rejects text that is not a curve", () => {
    expect(parseCurve("0 x 1")).toBeUndefined();
    expect(parseCurve("0 0x10")).toBeUndefined();
    expect(parseCurve("1e3")).toBeUndefined();
    expect(parseCurve("")).toBeUndefined();
  });
});

describe("steps with accents and ties", () => {
  it("writes an accent after its note, and a tie as an underscore", () => {
    expect(
      formatSequence([
        { note: 60, accent: true },
        { note: null, tie: true },
        { note: null },
        { note: 63 },
      ]),
    ).toBe("C4! _ - D#4");
  });

  it("reads them back", () => {
    expect(parseSequence("C4! _ - D#4")).toEqual([
      { note: 60, accent: true, tie: false },
      { note: null, accent: false, tie: true },
      { note: null, accent: false, tie: false },
      { note: 63, accent: false, tie: false },
    ]);
  });

  it("reads plain steps as they were", () => {
    expect(parseSequence("C4 -")).toEqual([
      { note: 60, accent: false, tie: false },
      { note: null, accent: false, tie: false },
    ]);
  });

  it("gives the notes alone, with ties as silent steps, to what only needs the notes", () => {
    expect(parseSteps("C4! _ - D#4")).toEqual([60, null, null, 63]);
  });

  it("writes and reads a tie into another note, accented or not", () => {
    const steps = [
      { note: 60, accent: false, tie: false },
      { note: 64, accent: false, tie: true },
      { note: 67, accent: true, tie: true },
      { note: null, accent: false, tie: true },
    ];

    expect(formatSequence(steps)).toBe("C4 _E4 _G4! _");
    expect(parseSequence("C4 _E4 _G4! _")).toEqual(steps);
    expect(parseSteps("C4 _E4 _G4! _")).toEqual([60, 64, 67, null]);
  });

  it("rejects an accent on nothing", () => {
    expect(parseSequence("C4 !")).toBeUndefined();
    expect(parseSequence("-!")).toBeUndefined();
    expect(parseSequence("_!")).toBeUndefined();
    expect(parseSequence("C4!!")).toBeUndefined();
  });

  it("writes the chance of a note after it and its accent, in percent, unless it always sounds", () => {
    expect(
      formatSequence([
        { note: 60, accent: true, chance: 75 },
        { note: 62, chance: 25 },
        { note: 64, chance: 100 },
        { note: null, tie: true },
      ]),
    ).toBe("C4!?75 D4?25 E4 _");
  });

  it("reads the chance back only where a note does not always sound", () => {
    expect(parseSequence("C4!?75 D4?25 E4")).toEqual([
      { note: 60, accent: true, tie: false, chance: 75 },
      { note: 62, accent: false, tie: false, chance: 25 },
      { note: 64, accent: false, tie: false },
    ]);
    expect(parseSequence("C4?100")).toEqual([{ note: 60, accent: false, tie: false }]);
    expect(parseSteps("C4?50 -")).toEqual([60, null]);
  });

  it("rejects a chance on a rest or a tie, or one that is not a percent from 1 to 100", () => {
    expect(parseSequence("-?50")).toBeUndefined();
    expect(parseSequence("C4 _?50")).toBeUndefined();
    expect(parseSequence("C4 _E4?50")).toBeUndefined();
    expect(parseSequence("C4?0")).toBeUndefined();
    expect(parseSequence("C4?101")).toBeUndefined();
    expect(parseSequence("C4?50!")).toBeUndefined();
  });

  it("keeps the chances when it transposes", () => {
    expect(formatSequence(transposeSequence(parseSequence("C4?50 D4!?25")!, 2, 60, 71))).toBe("D4?50 E4!?25");
  });

  it("transposes the notes and keeps the accents and the ties", () => {
    expect(formatSequence(transposeSequence(parseSequence("C4! _ - B4 _E4")!, 2, 60, 71))).toBe("D4! _ - C#4 _F#4");
  });
});
