import { describe, expect, it } from "vitest";
import { MIDDLE_C_HZ, noteName, OCTAVE_CENTS } from "./pitch";

describe("MIDDLE_C_HZ", () => {
  it("is C4 in equal temperament tuned to A4 = 440 Hz", () => {
    expect(MIDDLE_C_HZ).toBeCloseTo(261.6256, 4);
  });
});

describe("OCTAVE_CENTS", () => {
  it("is twelve semitones of a hundred cents", () => {
    expect(OCTAVE_CENTS).toBe(1200);
  });
});

describe("noteName", () => {
  it("names notes with middle C as C4", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(61)).toBe("C#4");
    expect(noteName(71)).toBe("B4");
    expect(noteName(48)).toBe("C3");
    expect(noteName(0)).toBe("C-1");
  });
});
