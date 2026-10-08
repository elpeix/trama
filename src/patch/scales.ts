import type { Step } from "./sequence";

/** Semitones above the root of each note of a scale, within one octave. */
export const SCALES: Record<string, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  "pentatonic major": [0, 2, 4, 7, 9],
  "pentatonic minor": [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

export const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export interface GridRow {
  note: number;
  inScale: boolean;
}

/**
 * The rows of a step grid, highest first: the notes of the scale from the root upwards (one octave
 * for the chromatic scale, two for the others, which have fewer notes), plus any note of the pattern
 * that falls outside them, so nothing already placed disappears.
 */
export function gridRows(scale: string, root: string, lowest: number, steps: Step[]): GridRow[] {
  const intervals = SCALES[scale] ?? SCALES.chromatic;
  const octaves = intervals.length > 7 ? 1 : 2;
  const first = lowest + Math.max(0, ROOTS.indexOf(root));
  const inScale = new Set(
    Array.from({ length: octaves }, (_, octave) => intervals.map((interval) => first + 12 * octave + interval))
      .flat()
      .concat(first + 12 * octaves),
  );
  const outside = steps.filter((step): step is number => step !== null && !inScale.has(step));
  return [...new Set([...inScale, ...outside])]
    .sort((a, b) => b - a)
    .map((note) => ({ note, inScale: inScale.has(note) }));
}

/** How many notes of the scale a chord of the Seq stacks on a step, a third apart: every other note. */
export const CHORDS: Record<string, number[]> = {
  off: [0],
  "5th": [0, 4],
  triad: [0, 2, 4],
  "7th": [0, 2, 4, 6],
};

/**
 * The notes of a chord on `note`, stacking every other note of the scale above it; the chromatic
 * scale takes the major scale of the root. A note outside the scale takes the chord of the note of
 * the scale below it, above its own.
 */
export function scaleChord(note: number, chord: string, scale: string, root: string): number[] {
  const intervals = scale === "chromatic" ? SCALES.major : (SCALES[scale] ?? SCALES.major);
  const rootClass = Math.max(0, ROOTS.indexOf(root));
  const inScale = (candidate: number) => intervals.includes((((candidate - rootClass) % 12) + 12) % 12);
  let base = note;
  while (!inScale(base)) {
    base--;
  }
  const ladder = [base];
  for (let candidate = base + 1; ladder.length < 7; candidate++) {
    if (inScale(candidate)) {
      ladder.push(candidate);
    }
  }
  return (CHORDS[chord] ?? CHORDS.off).map((steps) => (steps === 0 ? note : ladder[steps]));
}
