import { noteName } from "./pitch";
import type { NotesParamDefinition, RhythmParamDefinition, SequenceParamDefinition } from "./registry";
import {
  formatNotes,
  formatRhythmSteps,
  formatSequence,
  parseRhythmStep,
  noteFromName,
  parseSequenceStep,
  type RhythmStep,
  type SequenceStep,
} from "./sequence";

/** Where a text written by hand stops being steps, as positions in it, and why. */
export interface TextProblem {
  start: number;
  end: number;
  message: string;
}

/** The steps a text written by hand stands for, as they are stored, or where it goes wrong. */
export type TextReading = { value: string } | { problem: TextProblem };

interface Token {
  text: string;
  start: number;
  end: number;
}

const tokensOf = (text: string): Token[] =>
  [...text.matchAll(/\S+/g)].map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }));

const LOOSE_NOTE = /^(_?)([A-Ga-g])([#b]?)(-?\d+)(.*)$/;
const PITCH_CLASSES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A step with its note named as it is stored: in capitals, and with a sharp for a flat. */
function withStoredName(token: string): string {
  const match = LOOSE_NOTE.exec(token);
  if (!match) {
    return token;
  }
  const [, tie, letter, accidental, octave, marks] = match;
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  const note = (Number(octave) + 1) * 12 + PITCH_CLASSES[letter.toUpperCase()] + shift;
  return `${tie}${noteName(note)}${marks}`;
}

const tooMany = (tokens: readonly Token[], steps: number): TextProblem => ({
  start: tokens[steps].start,
  end: tokens[tokens.length - 1].end,
  message: `${tokens.length} steps, and there are ${steps}`,
});

/** Why a note is out of the range of a param, or undefined when it is in. */
function outOfRange(note: number, { lowest, highest }: { lowest: number; highest: number }): string | undefined {
  if (note < lowest) {
    return `${noteName(note)} is below ${noteName(lowest)}, the lowest note`;
  }
  return note > highest ? `${noteName(note)} is above ${noteName(highest)}, the highest note` : undefined;
}

/**
 * Reads the steps of a Seq written by hand: notes may be in small letters or flats, and the steps
 * left are rests.
 */
export function readSequenceText(
  text: string,
  definition: Pick<SequenceParamDefinition, "steps" | "lowest" | "highest">,
): TextReading {
  const tokens = tokensOf(text);
  if (tokens.length > definition.steps) {
    return { problem: tooMany(tokens, definition.steps) };
  }
  const steps: SequenceStep[] = [];
  for (const token of tokens) {
    const step = parseSequenceStep(withStoredName(token.text));
    const at = { start: token.start, end: token.end };
    if (!step) {
      return { problem: { ...at, message: `"${token.text}" is not a step: a note (C4), a rest (-) or a tie (_)` } };
    }
    const outside = step.note === null ? undefined : outOfRange(step.note, definition);
    if (outside) {
      return { problem: { ...at, message: outside } };
    }
    steps.push(step);
  }
  const rests = Array.from({ length: definition.steps - steps.length }, () => ({ note: null }));
  return { value: formatSequence([...steps, ...rests]) };
}

/** Reads a row of steps written by hand: a capital X sounds too, and the steps left are silent. */
export function readRhythmText(
  text: string,
  definition: Pick<RhythmParamDefinition, "steps" | "chance" | "retrig">,
): TextReading {
  const tokens = tokensOf(text);
  if (tokens.length > definition.steps) {
    return { problem: tooMany(tokens, definition.steps) };
  }
  const steps: RhythmStep[] = [];
  for (const token of tokens) {
    const step = parseRhythmStep(token.text.replace(/^X/, "x"));
    const at = { start: token.start, end: token.end };
    if (!step) {
      return { problem: { ...at, message: `"${token.text}" is not a step: x for one that sounds, - for one that does not` } };
    }
    if (step.chance !== undefined && !definition.chance) {
      return { problem: { ...at, message: "These steps have no chance" } };
    }
    if (step.retrig !== undefined && !definition.retrig) {
      return { problem: { ...at, message: "These steps do not sound several times within themselves" } };
    }
    steps.push(step);
  }
  const silent = Array.from({ length: definition.steps - steps.length }, () => ({ sounds: false }));
  return { value: formatRhythmSteps([...steps, ...silent]) };
}

/** Reads a set of notes written by hand, in small letters or flats too; nothing is no notes. */
export function readNotesText(text: string, definition: Pick<NotesParamDefinition, "lowest" | "highest">): TextReading {
  const notes: number[] = [];
  for (const token of tokensOf(text)) {
    const note = noteFromName(withStoredName(token.text));
    const at = { start: token.start, end: token.end };
    if (note === undefined) {
      return { problem: { ...at, message: `"${token.text}" is not a note: a name and an octave (C4)` } };
    }
    const outside = outOfRange(note, definition);
    if (outside) {
      return { problem: { ...at, message: outside } };
    }
    notes.push(note);
  }
  return { value: formatNotes(notes) };
}

/** Rows of steps with each step padded to the widest in its column, so that the steps line up. */
export function alignRows(rows: readonly string[]): string[] {
  const tokens = rows.map((row) => row.trim().split(/\s+/));
  const widths: number[] = [];
  tokens.forEach((row) => row.forEach((token, column) => (widths[column] = Math.max(widths[column] ?? 0, token.length))));
  return tokens.map((row) =>
    row
      .map((token, column) => token.padEnd(widths[column]))
      .join(" ")
      .trimEnd(),
  );
}
