import { DEFAULT_VELOCITY, MAX_VELOCITY, velocityOf, type ClipNote } from "./clip";
import { scaleChord } from "./scales";
import { transposeSteps, type SequenceStep } from "./sequence";

/** How a Seq plays its steps: what shapes the notes it sends besides the steps themselves. */
export interface SequencePlaying {
  /** The steps that play, from the first. */
  length: number;
  /** Beats a step. */
  stepBeats: number;
  /** The part of a step a note lasts, before the steps tied to it. */
  gate: number;
  octave: number;
  chord: string;
  scale: string;
  root: string;
}

/** The velocity from which a note read from a file accents its step: halfway from the default to the top. */
const ACCENT_FROM = Math.ceil((DEFAULT_VELOCITY + MAX_VELOCITY) / 2);

/**
 * The notes a Seq sends for its steps, as a clip of `length` steps: each step with a note starts
 * the chord on it, as hard as its accent says, and it lasts through the steps tied to it and then
 * its gate. A tied step with a note of its own, where the Seq glides, starts the chord on that note
 * instead, as hard as the first one. A tie after a rest, which the Seq plays as a note of its own,
 * is one here too.
 */
export function sequenceNotes(steps: readonly SequenceStep[], playing: SequencePlaying): ClipNote[] {
  const { length, stepBeats, gate } = playing;
  const shift = 12 * playing.octave;
  const chordOf = (note: number) =>
    scaleChord(note, playing.chord, playing.scale, playing.root).map((chordNote) => chordNote + shift);
  const holding = (position: number) => {
    for (let index = position - 1; index >= 0; index--) {
      if (!steps[index].tie) {
        return steps[index].note !== null;
      }
    }
    return false;
  };

  const notes: ClipNote[] = [];
  for (let position = 0; position < length; position++) {
    const step = steps[position];
    if (!step || step.note === null || (step.tie && holding(position))) {
      continue;
    }
    let ties = 0;
    while (position + ties + 1 < length && steps[position + ties + 1]?.tie) {
      ties++;
    }
    const velocity = step.accent ? MAX_VELOCITY : DEFAULT_VELOCITY;
    const end = (position + ties + gate) * stepBeats;
    // The notes that start in the run: the first, and each tied step with a note of its own.
    const starts = [position, ...Array.from({ length: ties }, (_, tied) => position + tied + 1)].filter(
      (index) => steps[index].note !== null,
    );
    starts.forEach((start, index) => {
      const until = index + 1 < starts.length ? starts[index + 1] * stepBeats : end;
      for (const note of chordOf(steps[start].note!)) {
        notes.push({
          note,
          start: start * stepBeats,
          length: until - start * stepBeats,
          ...(velocity !== DEFAULT_VELOCITY && { velocity }),
        });
      }
    });
  }
  return notes;
}

/**
 * The steps of a Seq for the notes of a file: each note goes on the step nearest to its start, and
 * holds the steps it lasts over with ties; a step takes the lowest of the notes on it, as the Chord
 * of the Seq builds on it, and a note played hard enough accents it. A note out of the range of the
 * steps moves by octaves into it. The notes past the last step, and those under another note on
 * their step, are left out. The loop is as long as the notes, or the file, need.
 */
export function stepsFromNotes(
  notes: readonly ClipNote[],
  options: { stepBeats: number; steps: number; lowest: number; highest: number; beats?: number },
): { steps: SequenceStep[]; length: number; left: number } {
  const { stepBeats } = options;
  const steps: SequenceStep[] = Array.from({ length: options.steps }, () => ({ note: null }));
  const lengths = new Map<number, number>();
  let left = 0;
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.note - b.note);
  for (const note of sorted) {
    const position = Math.round(note.start / stepBeats);
    if (position >= options.steps || steps[position].note !== null) {
      left++;
      continue;
    }
    const [inRange] = transposeSteps([note.note], 0, options.lowest, options.highest);
    steps[position] = { note: inRange, ...(velocityOf(note) >= ACCENT_FROM && { accent: true }) };
    lengths.set(position, Math.max(1, Math.round(note.length / stepBeats)));
  }
  let end = 0;
  for (const [position, held] of lengths) {
    let tied = 1;
    while (tied < held && position + tied < options.steps && steps[position + tied].note === null) {
      steps[position + tied] = { note: null, tie: true };
      tied++;
    }
    end = Math.max(end, position + tied);
  }
  const fileSteps = options.beats === undefined ? 0 : Math.ceil(options.beats / stepBeats - 1e-6);
  return { steps, length: Math.min(options.steps, Math.max(1, end, fileSteps)), left };
}
