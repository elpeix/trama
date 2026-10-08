import { describe, expect, it } from "vitest";
import { chordSchedule, clipSchedule } from "./clipSchedule";

describe("clipSchedule", () => {
  it("keeps the notes that start inside the loop, in order", () => {
    const notes = [
      { note: 64, start: 2, length: 1 },
      { note: 60, start: 0, length: 1 },
      { note: 67, start: 8, length: 1 },
    ];

    expect(clipSchedule(notes, 4)).toEqual([
      { note: 60, start: 0, length: 1 },
      { note: 64, start: 2, length: 1 },
    ]);
  });

  it("cuts a note short where the next one starts, since it plays one note at a time", () => {
    const notes = [
      { note: 60, start: 0, length: 3 },
      { note: 64, start: 1, length: 1 },
    ];

    expect(clipSchedule(notes, 4)).toEqual([
      { note: 60, start: 0, length: 1 },
      { note: 64, start: 1, length: 1 },
    ]);
  });

  it("plays the last of the notes that start together", () => {
    const notes = [
      { note: 60, start: 0, length: 1 },
      { note: 64, start: 0, length: 1 },
    ];

    expect(clipSchedule(notes, 4)).toEqual([{ note: 64, start: 0, length: 1 }]);
  });

  it("lets the last note ring into the next loop until the first one starts again", () => {
    const notes = [
      { note: 60, start: 1, length: 1 },
      { note: 64, start: 3, length: 4 },
    ];

    expect(clipSchedule(notes, 4)).toEqual([
      { note: 60, start: 1, length: 1 },
      { note: 64, start: 3, length: 2 },
    ]);
  });
});

describe("chordSchedule", () => {
  it("keeps every note that starts inside the loop, those that start together too, in order", () => {
    const notes = [
      { note: 64, start: 0, length: 2 },
      { note: 67, start: 8, length: 1 },
      { note: 60, start: 0, length: 3 },
      { note: 67, start: 1, length: 1 },
    ];

    expect(chordSchedule(notes, 4)).toEqual([
      { note: 60, start: 0, length: 3 },
      { note: 64, start: 0, length: 2 },
      { note: 67, start: 1, length: 1 },
    ]);
  });

  it("cuts a note short only where the same note starts again, in the next loop too", () => {
    const notes = [
      { note: 60, start: 0, length: 3 },
      { note: 60, start: 2, length: 4 },
      { note: 64, start: 3, length: 4 },
    ];

    expect(chordSchedule(notes, 4)).toEqual([
      { note: 60, start: 0, length: 2 },
      { note: 60, start: 2, length: 2 },
      { note: 64, start: 3, length: 4 },
    ]);
  });

  it("plays a note drawn twice in the same place once", () => {
    const notes = [
      { note: 60, start: 0, length: 1 },
      { note: 60, start: 0, length: 2 },
    ];

    expect(chordSchedule(notes, 4)).toEqual([{ note: 60, start: 0, length: 2 }]);
  });
});
