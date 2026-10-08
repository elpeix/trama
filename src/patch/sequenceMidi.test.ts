import { describe, expect, it } from "vitest";
import { formatSequence, parseSequence } from "./sequence";
import { sequenceNotes, stepsFromNotes, type SequencePlaying } from "./sequenceMidi";

const playing: SequencePlaying = {
  length: 16,
  stepBeats: 0.25,
  gate: 0.5,
  octave: 0,
  chord: "off",
  scale: "pentatonic minor",
  root: "C",
};

const steps = (text: string) => parseSequence(text)!;

describe("sequenceNotes", () => {
  it("plays each step with a note for its gate, an accented one as hard as a note goes", () => {
    expect(sequenceNotes(steps("C4 - E4! - - - - - - - - - - - - -"), playing)).toEqual([
      { note: 60, start: 0, length: 0.125 },
      { note: 64, start: 0.5, length: 0.125, velocity: 127 },
    ]);
  });

  it("holds a note through the steps tied to it, and starts the note of a tied step where the Seq glides", () => {
    expect(sequenceNotes(steps("C4 _ _E4 _ - - - - - - - - - - - -"), playing)).toEqual([
      { note: 60, start: 0, length: 0.5 },
      { note: 64, start: 0.5, length: 0.375 },
    ]);
  });

  it("plays a tie after a rest as a note of its own, and stops at the length", () => {
    expect(sequenceNotes(steps("- _D4 - - C4 _ _ _ - - - - - - - -"), { ...playing, length: 6 })).toEqual([
      { note: 62, start: 0.25, length: 0.125 },
      { note: 60, start: 1, length: 0.375 },
    ]);
  });

  it("plays the chord of the scale on each step, every other note of it, an octave shifted", () => {
    expect(
      sequenceNotes(steps("C4 - - - - - - - - - - - - - - -"), { ...playing, chord: "triad", octave: -1 }),
    ).toEqual([
      { note: 48, start: 0, length: 0.125 },
      { note: 53, start: 0, length: 0.125 },
      { note: 58, start: 0, length: 0.125 },
    ]);
  });
});

describe("stepsFromNotes", () => {
  const options = { stepBeats: 0.25, steps: 16, lowest: 60, highest: 95 };

  it("puts each note on its nearest step, ties the steps it lasts over, and accents the hard ones", () => {
    const read = stepsFromNotes(
      [
        { note: 60, start: 0.02, length: 0.5 },
        { note: 64, start: 0.75, length: 0.25, velocity: 120 },
      ],
      options,
    );

    expect(formatSequence(read.steps)).toBe("C4 _ - E4! - - - - - - - - - - - -");
    expect(read).toMatchObject({ length: 4, left: 0 });
  });

  it("keeps the lowest note of a chord, moves a note into range by octaves, and leaves out what is past the last step", () => {
    const read = stepsFromNotes(
      [
        { note: 67, start: 0, length: 0.25 },
        { note: 60, start: 0, length: 0.25 },
        { note: 36, start: 0.25, length: 0.25 },
        { note: 62, start: 4, length: 0.25 },
      ],
      options,
    );

    expect(formatSequence(read.steps.slice(0, 2))).toBe("C4 C4");
    expect(read.left).toBe(2);
  });

  it("makes the loop as long as the file when it ends in silence", () => {
    expect(stepsFromNotes([{ note: 60, start: 0, length: 0.25 }], { ...options, beats: 2 }).length).toBe(8);
  });

  it("reads back what it writes", () => {
    const written = steps("C4! _ - D#4 - _F4 - G4 A#4 - - - _ - - C5");

    const notes = sequenceNotes(written, { ...playing, gate: 1 });

    const read = stepsFromNotes(notes, { ...options, beats: 4 });

    // A tie after a rest reads back as a plain note, and a glide as a note of its own: they sound the same.
    expect(formatSequence(read.steps)).toBe("C4! _ - D#4 - F4 - G4 A#4 - - - - - - C5");
    expect(read).toMatchObject({ length: 16, left: 0 });
  });
});
