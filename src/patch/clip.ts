import { noteName } from "./pitch";
import { noteFromName } from "./sequence";

/**
 * A note of a clip: its MIDI note, where it starts and how long it lasts, in beats, and how hard
 * it is played, from 1 to 127 as in MIDI; DEFAULT_VELOCITY without one.
 */
export interface ClipNote {
  note: number;
  start: number;
  length: number;
  velocity?: number;
}

/** How hard a note is played when nothing says: what the computer keys play, and most programs draw. */
export const DEFAULT_VELOCITY = 100;
export const MIN_VELOCITY = 1;
export const MAX_VELOCITY = 127;

export const velocityOf = (note: { velocity?: number }) => note.velocity ?? DEFAULT_VELOCITY;

/** The longest clip: sixteen bars of four beats. */
export const CLIP_MAX_BEATS = 64;

const TOKEN = /^([A-G]#?-?\d+)@(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)(?:v(\d+))?$/;

// Six decimals keep a triplet on its grid: a third of a beat, rounded, still falls on the third.
const beats = (value: number) => String(Number(value.toFixed(6)));

/** The order the notes of a clip are stored in: by their start, and the lowest first. */
export const byStart = (a: ClipNote, b: ClipNote) => a.start - b.start || a.note - b.note;

/**
 * A clip is stored as text: one "note@start+length" per note, in beats, from the first ("C4@0+1"),
 * with "v" and its velocity after it when it is not DEFAULT_VELOCITY ("C4@0+1v90").
 */
export function formatClip(notes: readonly ClipNote[]): string {
  return [...notes]
    .sort(byStart)
    .map((note) => {
      const velocity = velocityOf(note) === DEFAULT_VELOCITY ? "" : `v${velocityOf(note)}`;
      return `${noteName(note.note)}@${beats(note.start)}+${beats(note.length)}${velocity}`;
    })
    .join(" ");
}

/** Reads a clip, or returns undefined if the text is not one. */
export function parseClip(text: string): ClipNote[] | undefined {
  const notes: ClipNote[] = [];
  for (const token of text.trim().split(/\s+/).filter(Boolean)) {
    const match = TOKEN.exec(token);
    const note = match && noteFromName(match[1]);
    const start = Number(match?.[2]);
    const length = Number(match?.[3]);
    const velocity = match?.[4] === undefined ? undefined : Number(match[4]);
    if (note === undefined || note === null || start >= CLIP_MAX_BEATS || length <= 0 || length > CLIP_MAX_BEATS) {
      return undefined;
    }
    if (velocity !== undefined && (velocity < MIN_VELOCITY || velocity > MAX_VELOCITY)) {
      return undefined;
    }
    notes.push({ note, start, length, ...(velocity !== undefined && velocity !== DEFAULT_VELOCITY && { velocity }) });
  }
  return notes;
}
