import { describe, expect, it } from "vitest";
import {
  addNote,
  changeVelocities,
  clipCell,
  copyNotes,
  duplicateLoop,
  duplicateNotes,
  fitToClip,
  moveNotes,
  noteAt,
  notesIn,
  notesStartingAt,
  pasteNotes,
  quantizeNotes,
  recordedNote,
  removeNotes,
  resizeNotes,
  sortNotes,
  velocityAt,
  type ClipView,
} from "./clipEdit";

const view: ClipView = { beatWidth: 40, rowHeight: 10, lowest: 36, highest: 84, beats: 16 };
const rect = { left: 100, top: 50 } as DOMRect;

describe("clipCell", () => {
  it("finds the beat and the note under the pointer", () => {
    expect(clipCell(rect, 100, 50, view)).toEqual({ beat: 0, note: 84 });
    expect(clipCell(rect, 190, 75, view)).toEqual({ beat: 2.25, note: 82 });
  });

  it("stays inside the clip", () => {
    expect(clipCell(rect, 0, 0, view)).toEqual({ beat: 0, note: 84 });
    expect(clipCell(rect, 5000, 5000, view)).toEqual({ beat: 16, note: 36 });
  });
});

describe("editing notes", () => {
  const notes = [
    { note: 60, start: 0, length: 1 },
    { note: 64, start: 2, length: 0.5 },
  ];

  it("finds the note at a beat and pitch", () => {
    expect(noteAt(notes, 0.5, 60)).toBe(0);
    expect(noteAt(notes, 2.49, 64)).toBe(1);
    expect(noteAt(notes, 2.5, 64)).toBeUndefined();
    expect(noteAt(notes, 0.5, 61)).toBeUndefined();
  });

  it("adds a note on the grid, as long as asked", () => {
    expect(addNote(notes, 1.3, 62, 0.5, 0.25, view)).toEqual({
      notes: [...notes, { note: 62, start: 1.25, length: 0.5 }],
      index: 2,
    });
  });

  it("adds a note no longer than what is left of the clip", () => {
    expect(addNote(notes, 15.1, 62, 2, 0.25, view).notes[2]).toEqual({ note: 62, start: 15, length: 1 });
  });

  it("moves a note by whole steps of the grid, and keeps it in the clip", () => {
    expect(moveNotes(notes, [1], { beats: 0.6, notes: 3 }, 0.25, view)[1]).toEqual({
      note: 67,
      start: 2.5,
      length: 0.5,
    });
    expect(moveNotes(notes, [0], { beats: -5, notes: -60 }, 0.25, view)[0]).toEqual({ note: 36, start: 0, length: 1 });
    expect(moveNotes(notes, [0], { beats: 40, notes: 0 }, 0.25, view)[0]).toEqual({ note: 60, start: 15, length: 1 });
  });

  it("moves notes together, only as far as all of them fit, keeping their shape", () => {
    expect(moveNotes(notes, [0, 1], { beats: -1, notes: 30 }, 0.25, view)).toEqual([
      { note: 80, start: 0, length: 1 },
      { note: 84, start: 2, length: 0.5 },
    ]);
    expect(moveNotes(notes, [0, 1], { beats: 20, notes: 0 }, 0.25, view)).toEqual([
      { note: 60, start: 13.5, length: 1 },
      { note: 64, start: 15.5, length: 0.5 },
    ]);
  });

  it("sets the end of a note on the grid, never shorter than a step", () => {
    expect(resizeNotes(notes, [0], 0, 2.6, 0.25, view)[0]).toEqual({ note: 60, start: 0, length: 2.75 });
    expect(resizeNotes(notes, [0], 0, -1, 0.25, view)[0]).toEqual({ note: 60, start: 0, length: 0.25 });
    expect(resizeNotes(notes, [0], 0, 99, 0.25, view)[0]).toEqual({ note: 60, start: 0, length: 16 });
  });

  it("makes the other notes chosen longer or shorter by as much as the one grabbed", () => {
    expect(resizeNotes(notes, [0, 1], 0, 1.5, 0.25, view)).toEqual([
      { note: 60, start: 0, length: 1.5 },
      { note: 64, start: 2, length: 1 },
    ]);
    expect(resizeNotes(notes, [0, 1], 0, 0.1, 0.25, view)[1]).toEqual({ note: 64, start: 2, length: 0.25 });
  });

  it("removes notes", () => {
    expect(removeNotes(notes, [0])).toEqual([notes[1]]);
    expect(removeNotes(notes, [0, 1])).toEqual([]);
  });

  it("finds the notes that reach into a box, drawn either way", () => {
    expect(notesIn(notes, { beat: 0.5, note: 59 }, { beat: 2.1, note: 64 })).toEqual([0, 1]);
    expect(notesIn(notes, { beat: 2.1, note: 64 }, { beat: 0.5, note: 61 })).toEqual([1]);
    expect(notesIn(notes, { beat: 1, note: 60 }, { beat: 1.9, note: 64 })).toEqual([]);
  });

  it("sorts the notes as they are stored, following the selected ones", () => {
    expect(sortNotes([notes[1], notes[0]], [0])).toEqual({ notes, selected: [1] });
  });
});

describe("copying notes", () => {
  const notes = [
    { note: 60, start: 1, length: 1 },
    { note: 64, start: 2, length: 0.5 },
  ];

  it("copies notes from the first of them", () => {
    expect(copyNotes(notes, [0, 1])).toEqual([
      { note: 60, start: 0, length: 1 },
      { note: 64, start: 1, length: 0.5 },
    ]);
  });

  it("pastes them from a beat, selected, leaving out or cutting what goes past the clip", () => {
    const copied = copyNotes(notes, [0, 1]);

    expect(pasteNotes(notes, copied, 4, view)).toEqual({
      notes: [...notes, { note: 60, start: 4, length: 1 }, { note: 64, start: 5, length: 0.5 }],
      selected: [2, 3],
    });
    expect(pasteNotes([], copied, 15.5, view)).toEqual({
      notes: [{ note: 60, start: 15.5, length: 0.5 }],
      selected: [0],
    });
  });

  it("duplicates notes right after them, on the grid", () => {
    expect(duplicateNotes(notes, [0, 1], 1, view).notes.slice(2)).toEqual([
      { note: 60, start: 3, length: 1 },
      { note: 64, start: 4, length: 0.5 },
    ]);
  });
});

describe("tidying a clip", () => {
  it("moves the start of the notes chosen to the nearest step, keeping their lengths", () => {
    const notes = [
      { note: 60, start: 0.3, length: 0.7 },
      { note: 62, start: 1.1, length: 1 },
      { note: 64, start: 15.9, length: 0.1 },
    ];

    expect(quantizeNotes(notes, [0, 2], 0.5, view)).toEqual([
      { note: 60, start: 0.5, length: 0.7 },
      { note: 62, start: 1.1, length: 1 },
      { note: 64, start: 15.5, length: 0.1 },
    ]);
  });

  it("quantizes to a triplet grid", () => {
    expect(quantizeNotes([{ note: 60, start: 0.3, length: 1 }], [0], 1 / 3, view)[0].start).toBeCloseTo(1 / 3, 9);
  });

  it("doubles a loop, leaving out the notes past its end", () => {
    const notes = [
      { note: 60, start: 0, length: 1 },
      { note: 64, start: 3.5, length: 1 },
      { note: 67, start: 5, length: 1 },
    ];

    expect(duplicateLoop(notes, 4)).toEqual([
      { note: 60, start: 0, length: 1 },
      { note: 64, start: 3.5, length: 1 },
      { note: 60, start: 4, length: 1 },
      { note: 64, start: 7.5, length: 1 },
    ]);
  });
});

describe("recording", () => {
  it("keeps a note where it started in the loop, as long as it was held", () => {
    expect(recordedNote(60, 3.5, 11.5, 12.25, 8)).toEqual({ note: 60, start: 3.5, length: 0.75 });
  });

  it("starts a note inside a shorter clip than the one playing", () => {
    expect(recordedNote(60, 6.5, 6.5, 7, 4)).toEqual({ note: 60, start: 2.5, length: 0.5 });
  });

  it("keeps a tap, and a note held for longer than the clip, within bounds", () => {
    expect(recordedNote(60, 1, 5, 5, 8).length).toBe(1 / 16);
    expect(recordedNote(60, 1, 5, 30, 8).length).toBe(8);
  });
});

describe("fitting notes read from a file", () => {
  const range = { lowest: 24, highest: 96, maxBars: 16, beatsPerBar: 4 };

  it("keeps the notes in range, as many bars as they need", () => {
    expect(
      fitToClip(
        [
          { note: 60, start: 0, length: 1 },
          { note: 62, start: 4, length: 0.5 },
        ],
        range,
      ),
    ).toEqual({
      notes: [
        { note: 60, start: 0, length: 1 },
        { note: 62, start: 4, length: 0.5 },
      ],
      bars: 2,
      left: 0,
    });
  });

  it("leaves out the notes out of range or past the longest loop, and cuts those that end past it", () => {
    const fitted = fitToClip(
      [
        { note: 12, start: 0, length: 1 },
        { note: 60, start: 62, length: 4 },
        { note: 60, start: 64, length: 1 },
        { note: 60, start: 1, length: 0 },
      ],
      range,
    );

    expect(fitted).toEqual({
      notes: [
        { note: 60, start: 62, length: 2 },
        { note: 60, start: 1, length: 1 / 16 },
      ],
      bars: 16,
      left: 2,
    });
  });

  it("makes the loop as long as the file when it ends in silence", () => {
    expect(fitToClip([{ note: 60, start: 0, length: 1 }], range, 16).bars).toBe(4);
  });

  it("makes an empty clip a bar long", () => {
    expect(fitToClip([], range)).toEqual({ notes: [], bars: 1, left: 0 });
  });

  it("counts the bars of the meter, and the longest loop in them", () => {
    expect(fitToClip([{ note: 60, start: 4, length: 2 }], { ...range, beatsPerBar: 3 }).bars).toBe(2);
    expect(fitToClip([{ note: 60, start: 58, length: 4 }], { ...range, maxBars: 12, beatsPerBar: 5 })).toEqual({
      notes: [{ note: 60, start: 58, length: 2 }],
      bars: 12,
      left: 0,
    });
  });
});

describe("velocity", () => {
  it("adds a note as hard as asked, keeping nothing for the default", () => {
    expect(addNote([], 0, 60, 1, 0.25, view, 90).notes[0]).toEqual({ note: 60, start: 0, length: 1, velocity: 90 });
    expect(addNote([], 0, 60, 1, 0.25, view).notes[0]).toEqual({ note: 60, start: 0, length: 1 });
  });

  it("reads a velocity from the height in its lane", () => {
    expect(velocityAt(0, 50)).toBe(127);
    expect(velocityAt(50, 50)).toBe(1);
    expect(velocityAt(25, 50)).toBe(64);
    expect(velocityAt(-10, 50)).toBe(127);
    expect(velocityAt(90, 50)).toBe(1);
  });

  it("finds the notes that start closest to a beat, a chord together", () => {
    const notes = [
      { note: 60, start: 1, length: 1 },
      { note: 64, start: 1, length: 1 },
      { note: 67, start: 1.1, length: 1 },
      { note: 72, start: 3, length: 1 },
    ];

    expect(notesStartingAt(notes, 1.02, 0.2)).toEqual([0, 1]);
    expect(notesStartingAt(notes, 2, 0.2)).toEqual([]);
  });

  it("sets the velocity of the note grabbed, and moves the others chosen by as much", () => {
    const notes = [
      { note: 60, start: 0, length: 1, velocity: 80 },
      { note: 64, start: 1, length: 1 },
      { note: 67, start: 2, length: 1, velocity: 120 },
    ];

    expect(changeVelocities(notes, [0, 2], 0, 100)).toEqual([
      { note: 60, start: 0, length: 1 },
      { note: 64, start: 1, length: 1 },
      { note: 67, start: 2, length: 1, velocity: 127 },
    ]);
  });
});
