import { noteName } from "./pitch";

/** One step of a sequence: a MIDI note, or null for a rest. */
export type Step = number | null;

export const REST = "-";
export const TIE = "_";
const ACCENT = "!";
const CHANCE = "?";
const ALWAYS = 100;
const CHANCE_PATTERN = /^(.*)\?(\d+)$/;

/**
 * A step of a sequence with its marks: an accented note, or a tie that keeps the gate of the note
 * before it open, holding that note or gliding into a note of its own. A note that starts can have
 * a chance, in percent, of sounding each time the loop comes round.
 */
export interface SequenceStep {
  note: number | null;
  accent?: boolean;
  tie?: boolean;
  chance?: number;
}

/** A chance from 1 to 99 as written after a step; an empty one for a step that always sounds. */
const formatChance = (chance: number | undefined) =>
  chance !== undefined && chance < ALWAYS ? `${CHANCE}${chance}` : "";

/**
 * Splits the chance off the end of a token: the rest of the token and the chance, undefined when
 * it always sounds, or undefined for all when the chance is not a percent from 1 to 100.
 */
function splitChance(token: string): { rest: string; chance?: number } | undefined {
  const match = CHANCE_PATTERN.exec(token);
  if (!match) {
    return token.includes(CHANCE) ? undefined : { rest: token };
  }
  const chance = Number(match[2]);
  if (chance < 1 || chance > ALWAYS) {
    return undefined;
  }
  return chance === ALWAYS ? { rest: match[1] } : { rest: match[1], chance };
}

/** The next chance a step takes when lowered: a quarter less each time, and back to always after a quarter. */
export function lowerChance(chance = ALWAYS): number {
  const lowered = Math.ceil(chance / 25) * 25 - 25;
  return lowered <= 0 ? ALWAYS : lowered;
}

const NOTE_PATTERN = /^([A-G])(#?)(-?\d+)$/;
const PITCH_CLASSES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The MIDI note for a name like "C4" or "D#3", or undefined if it is not one. */
export function noteFromName(name: string): number | undefined {
  const match = NOTE_PATTERN.exec(name);
  if (!match) {
    return undefined;
  }
  const [, letter, sharp, octave] = match;
  return (Number(octave) + 1) * 12 + PITCH_CLASSES[letter] + (sharp ? 1 : 0);
}

/**
 * Sequences are stored as text so that a patch stays readable: one token per step, separated by
 * spaces, each a note name ("C4") or "-" for a rest.
 */
export function formatSteps(steps: Step[]): string {
  return steps.map((step) => (step === null ? REST : noteName(step))).join(" ");
}

/** Reads the notes of a sequence, a tie that only holds counting as a silent step, or undefined if the text is not one. */
export function parseSteps(text: string): Step[] | undefined {
  return parseSequence(text)?.map((step) => step.note);
}

/**
 * The marks go in the same text: "!" after a note accents it ("C4!"), "_" is a tie that holds the
 * note before it, "_" before a note ties into it, and "?" and a percent after a note that starts
 * give its chance ("C4!?50 _ _E4 - D#4?25").
 */
export function formatSequence(steps: readonly SequenceStep[]): string {
  return steps
    .map((step) => {
      if (step.note === null) {
        return step.tie ? TIE : REST;
      }
      const note = `${noteName(step.note)}${step.accent ? ACCENT : ""}`;
      return step.tie ? `${TIE}${note}` : `${note}${formatChance(step.chance)}`;
    })
    .join(" ");
}

type ParsedStep = Required<Omit<SequenceStep, "chance">> & Pick<SequenceStep, "chance">;

/** Reads one step of a sequence with its marks, or returns undefined if the token is not one. */
export function parseSequenceStep(token: string): ParsedStep | undefined {
  if (token === REST || token === TIE) {
    return { note: null, accent: false, tie: token === TIE };
  }
  const split = splitChance(token);
  const tie = token.startsWith(TIE);
  if (!split || (tie && split.chance !== undefined)) {
    return undefined;
  }
  const name = tie ? split.rest.slice(TIE.length) : split.rest;
  const accent = name.endsWith(ACCENT);
  const note = noteFromName(accent ? name.slice(0, -ACCENT.length) : name);
  if (note === undefined) {
    return undefined;
  }
  return { note, accent, tie, ...(split.chance !== undefined && { chance: split.chance }) };
}

/** Reads a sequence with its marks, or returns undefined if the text is not one. */
export function parseSequence(text: string): ParsedStep[] | undefined {
  const steps: ParsedStep[] = [];
  for (const token of text.trim().split(/\s+/)) {
    const step = parseSequenceStep(token);
    if (!step) {
      return undefined;
    }
    steps.push(step);
  }
  return steps;
}

/** Transposes the notes of a sequence like `transposeSteps`, keeping its accents and ties. */
export function transposeSequence(
  steps: readonly SequenceStep[],
  semitones: number,
  lowest: number,
  highest: number,
): SequenceStep[] {
  const notes = transposeSteps(
    steps.map((step) => step.note),
    semitones,
    lowest,
    highest,
  );
  return steps.map((step, index) => ({ ...step, note: notes[index] }));
}

/**
 * Moves every note by `semitones`. A note that would leave the range [lowest, highest] moves an
 * octave the other way instead, so nothing is lost.
 */
export function transposeSteps(steps: Step[], semitones: number, lowest: number, highest: number): Step[] {
  return steps.map((step) => {
    if (step === null) {
      return null;
    }
    let note = step + semitones;
    while (note > highest) {
      note -= 12;
    }
    while (note < lowest) {
      note += 12;
    }
    return note;
  });
}

/**
 * A set of notes, like those an arpeggiator plays on its own, is stored as text too: the names of
 * its notes from the lowest, separated by spaces ("C4 E4 G4"), or nothing for none.
 */
export function formatNotes(notes: readonly number[]): string {
  return [...new Set(notes)]
    .sort((a, b) => a - b)
    .map(noteName)
    .join(" ");
}

/** Reads a set of notes, or returns undefined if the text is not one. */
export function parseNotes(text: string): number[] | undefined {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const notes = tokens.map(noteFromName);
  return notes.every((note) => note !== undefined) ? [...new Set(notes)].sort((a, b) => a - b) : undefined;
}

const SOUNDS = "x";
const SOUNDING_PATTERN = /^x([2-4])?$/;

/**
 * A step of a rhythm: whether it sounds, its chance of sounding, in percent, when not always, and
 * how many times it sounds within itself, when more than once.
 */
export interface RhythmStep {
  sounds: boolean;
  chance?: number;
  retrig?: number;
}

/**
 * A rhythm is stored as text too: one token per step, "x" for a step that sounds and "-" for one
 * that stays silent ("x - x x").
 */
export function formatRhythm(steps: readonly boolean[]): string {
  return steps.map((sounds) => (sounds ? SOUNDS : REST)).join(" ");
}

/** Reads a rhythm, or returns undefined if the text is not one. */
export function parseRhythm(text: string): boolean[] | undefined {
  return parseRhythmSteps(text)?.map((step) => step.sounds);
}

/**
 * A rhythm with chances and retrigs: "?" and a percent after a step that sounds now and then, and
 * the times a step sounds within itself after its x ("x?50 - x3 x").
 */
export function formatRhythmSteps(steps: readonly RhythmStep[]): string {
  return steps.map((step) => (step.sounds ? `${SOUNDS}${step.retrig ?? ""}${formatChance(step.chance)}` : REST)).join(" ");
}

/** Reads one step of a rhythm with its chance and retrigs, or returns undefined if the token is not one. */
export function parseRhythmStep(token: string): RhythmStep | undefined {
  if (token === REST) {
    return { sounds: false };
  }
  const split = splitChance(token);
  const sounding = split && SOUNDING_PATTERN.exec(split.rest);
  if (!sounding) {
    return undefined;
  }
  return {
    sounds: true,
    ...(sounding[1] && { retrig: Number(sounding[1]) }),
    ...(split.chance !== undefined && { chance: split.chance }),
  };
}

/** Reads a rhythm with its chances and retrigs, or returns undefined if the text is not one. */
export function parseRhythmSteps(text: string): RhythmStep[] | undefined {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const steps = tokens.map(parseRhythmStep);
  if (steps.length === 0 || steps.some((step) => step === undefined)) {
    return undefined;
  }
  return steps as RhythmStep[];
}

const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

const decimals = (step: number) => step.toString().split(".")[1]?.length ?? 0;

/** A curve is stored as text too: its values from left to right, rounded to `step` ("0 0.5 -1"). */
export function formatCurve(values: readonly number[], step: number): string {
  return values
    .map((value) => Number((Math.round(value / step) * step).toFixed(decimals(step))) || 0)
    .join(" ");
}

/** Reads a curve, or returns undefined if the text is not one. */
export function parseCurve(text: string): number[] | undefined {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.some((token) => !NUMBER_PATTERN.test(token))) {
    return undefined;
  }
  return tokens.map(Number);
}
