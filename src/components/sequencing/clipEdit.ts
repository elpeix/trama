import {
  byStart,
  CLIP_MAX_BEATS,
  DEFAULT_VELOCITY,
  MAX_VELOCITY,
  MIN_VELOCITY,
  velocityOf,
  type ClipNote,
} from "../../patch/clip";

/** How the piano roll is laid out: pixels per beat and per note, and what it shows. */
export interface ClipView {
  beatWidth: number;
  rowHeight: number;
  lowest: number;
  highest: number;
  beats: number;
}

/** A beat and a note of the roll. */
export interface ClipCell {
  beat: number;
  note: number;
}

/** Notes, and which of them are selected, by their index. */
export interface Edited {
  notes: ClipNote[];
  selected: number[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Enough to keep a note on its step of a triplet grid, stored rounded (see formatClip). */
const EPSILON = 1e-4;

const endOf = (note: ClipNote) => note.start + note.length;

/** The beat and the note under the pointer, inside the clip. */
export function clipCell(rect: Pick<DOMRect, "left" | "top">, clientX: number, clientY: number, view: ClipView) {
  const beat = clamp((clientX - rect.left) / view.beatWidth, 0, view.beats);
  const row = Math.floor((clientY - rect.top) / view.rowHeight);
  return { beat, note: clamp(view.highest - row, view.lowest, view.highest) };
}

/** The index of the note that sounds at `beat` on `note`, if any; the last one drawn wins. */
export function noteAt(notes: readonly ClipNote[], beat: number, note: number): number | undefined {
  const index = notes.findLastIndex(
    (candidate) => candidate.note === note && beat >= candidate.start && beat < endOf(candidate),
  );
  return index === -1 ? undefined : index;
}

/** The indices of the notes that reach into the box between two cells, drawn either way. */
export function notesIn(notes: readonly ClipNote[], from: ClipCell, to: ClipCell): number[] {
  const [first, last] = [Math.min(from.beat, to.beat), Math.max(from.beat, to.beat)];
  const [low, high] = [Math.min(from.note, to.note), Math.max(from.note, to.note)];
  return notes.flatMap((note, index) =>
    note.note >= low && note.note <= high && note.start <= last && endOf(note) > first ? [index] : [],
  );
}

/**
 * Puts the notes in the order they are stored in (see formatClip), and says where the selected
 * ones went; notes that start together on the same note keep their order.
 */
export function sortNotes(notes: readonly ClipNote[], selected: Iterable<number>): Edited {
  const chosen = new Set(selected);
  const order = notes.map((note, index) => ({ note, index })).sort((a, b) => byStart(a.note, b.note));
  return {
    notes: order.map(({ note }) => note),
    selected: order.flatMap(({ index }, position) => (chosen.has(index) ? [position] : [])),
  };
}

/**
 * A note on the step of the grid under `beat`, `length` beats long or as much of it as fits in the
 * clip, played as hard as `velocity`.
 */
export function addNote(
  notes: readonly ClipNote[],
  beat: number,
  note: number,
  length: number,
  snap: number,
  view: ClipView,
  velocity = DEFAULT_VELOCITY,
) {
  const start = clamp(Math.floor(beat / snap + EPSILON) * snap, 0, view.beats - snap);
  const added = { note, start, length: Math.min(length, view.beats - start), ...withVelocity(velocity) };
  return { notes: [...notes, added], index: notes.length };
}

/** The velocity of a note as it is kept: nothing when it is the default. */
const withVelocity = (velocity: number) => (velocity === DEFAULT_VELOCITY ? {} : { velocity });

/**
 * Moves some notes together by whole steps of the grid and whole semitones, as far as they can go
 * without any of them leaving the clip, so that they keep their shape.
 */
export function moveNotes(
  notes: readonly ClipNote[],
  indices: readonly number[],
  by: { beats: number; notes: number },
  snap: number,
  view: ClipView,
): ClipNote[] {
  const moved = indices.map((index) => notes[index]);
  if (moved.length === 0) {
    return [...notes];
  }
  const earliest = Math.min(...moved.map((note) => note.start));
  const latest = Math.max(...moved.map(endOf));
  const beats = clamp(Math.round(by.beats / snap) * snap, -earliest, Math.max(-earliest, view.beats - latest));
  const lowest = Math.min(...moved.map((note) => note.note));
  const highest = Math.max(...moved.map((note) => note.note));
  const semitones = clamp(by.notes, view.lowest - lowest, view.highest - highest);
  const chosen = new Set(indices);
  return notes.map((note, index) =>
    chosen.has(index) ? { ...note, start: note.start + beats, note: note.note + semitones } : note,
  );
}

/**
 * Ends the `anchor` note on the step of the grid under `beat`, never shorter than a step nor past
 * the clip, and makes the other notes longer or shorter by as much.
 */
export function resizeNotes(
  notes: readonly ClipNote[],
  indices: readonly number[],
  anchor: number,
  beat: number,
  snap: number,
  view: ClipView,
): ClipNote[] {
  const grabbed = notes[anchor];
  const end = clamp(Math.ceil(beat / snap - EPSILON) * snap, grabbed.start + snap, view.beats);
  const by = end - endOf(grabbed);
  const chosen = new Set([...indices, anchor]);
  return notes.map((note, index) => {
    if (!chosen.has(index)) {
      return note;
    }
    const shortest = Math.min(note.length, snap);
    return { ...note, length: clamp(note.length + by, shortest, Math.max(shortest, view.beats - note.start)) };
  });
}

export function removeNotes(notes: readonly ClipNote[], indices: readonly number[]): ClipNote[] {
  const chosen = new Set(indices);
  return notes.filter((_, index) => !chosen.has(index));
}

/** The notes copied, shared by every clip while the page is open. */
let copied: ClipNote[] = [];

export const copiedNotes = (): readonly ClipNote[] => copied;

export function keepCopiedNotes(notes: ClipNote[]) {
  copied = notes;
}

/** Some notes, taken out to be pasted: from the first of them, which starts at 0. */
export function copyNotes(notes: readonly ClipNote[], indices: readonly number[]): ClipNote[] {
  const copied = indices.map((index) => notes[index]);
  const earliest = Math.min(...copied.map((note) => note.start));
  return copied.map((note) => ({ ...note, start: note.start - earliest }));
}

/**
 * Adds copied notes from `beat` on, and selects them. Those that would start past the clip are
 * left out, and those that would end past it are cut short.
 */
export function pasteNotes(
  notes: readonly ClipNote[],
  copied: readonly ClipNote[],
  beat: number,
  view: ClipView,
): Edited {
  const pasted = copied
    .map((note) => ({ ...note, start: note.start + beat }))
    .filter((note) => note.start < view.beats - EPSILON)
    .map((note) => ({ ...note, length: Math.min(note.length, view.beats - note.start) }));
  return {
    notes: [...notes, ...pasted],
    selected: pasted.map((_, index) => notes.length + index),
  };
}

/** Pastes a copy of some notes right after them, on the grid, and selects the copy. */
export function duplicateNotes(
  notes: readonly ClipNote[],
  indices: readonly number[],
  snap: number,
  view: ClipView,
): Edited {
  const copied = copyNotes(notes, indices);
  const earliest = Math.min(...indices.map((index) => notes[index].start));
  const span = Math.max(...copied.map(endOf));
  return pasteNotes(notes, copied, earliest + Math.ceil(span / snap - EPSILON) * snap, view);
}

/**
 * Moves the start of some notes to the nearest step of the grid, keeping their lengths; a note in
 * the clip stays in it.
 */
export function quantizeNotes(
  notes: readonly ClipNote[],
  indices: readonly number[],
  snap: number,
  view: ClipView,
): ClipNote[] {
  const chosen = new Set(indices);
  return notes.map((note, index) => {
    if (!chosen.has(index)) {
      return note;
    }
    const start = Math.round(note.start / snap) * snap;
    return { ...note, start: note.start < view.beats ? Math.min(start, view.beats - snap) : start };
  });
}

/**
 * The notes of a clip twice over, for a clip twice as long: a copy of those that sound follows
 * them, in place of any that were past its end.
 */
export function duplicateLoop(notes: readonly ClipNote[], beats: number): ClipNote[] {
  const sounding = notes.filter((note) => note.start < beats - EPSILON);
  return [...sounding, ...sounding.map((note) => ({ ...note, start: note.start + beats }))];
}

/** The shortest a note played on the keys is kept, in beats: a sixty-fourth. */
export const SHORTEST_RECORDED = 1 / 16;

/**
 * A note played on the keys while the clip loops: it starts at `position` of the loop, and lasts
 * from beat `from` to beat `to` of the transport, so it may go on past the end of the loop. It is
 * kept no shorter than SHORTEST_RECORDED nor longer than the clip.
 */
export function recordedNote(note: number, position: number, from: number, to: number, beats: number): ClipNote {
  return {
    note,
    start: ((position % beats) + beats) % beats,
    length: clamp(to - from, SHORTEST_RECORDED, beats),
  };
}

/**
 * Notes read from a file made to fit a clip: those out of its range of notes, or past its longest
 * loop, are left out, the others are cut at its end and kept no shorter than SHORTEST_RECORDED,
 * and the loop is as many bars as they need, or as the file lasts, `beats`, if longer.
 */
export function fitToClip(
  notes: readonly ClipNote[],
  range: { lowest: number; highest: number; maxBars: number; beatsPerBar: number },
  beats = 0,
) {
  const maxBeats = Math.min(CLIP_MAX_BEATS, range.maxBars * range.beatsPerBar);
  const kept = notes
    .filter((note) => note.note >= range.lowest && note.note <= range.highest && note.start < maxBeats - EPSILON)
    .map((note) => ({ ...note, length: Math.min(Math.max(note.length, SHORTEST_RECORDED), maxBeats - note.start) }));
  const end = Math.max(beats, ...kept.map((note) => note.start + note.length));
  const bars = Math.min(range.maxBars, Math.max(1, Math.ceil(end / range.beatsPerBar - EPSILON)));
  return { notes: kept, bars, left: notes.length - kept.length };
}

/** The velocity at `y` pixels from the top of a lane `height` pixels high: 127 at the top, 1 at the bottom. */
export function velocityAt(y: number, height: number): number {
  return clamp(Math.round(MIN_VELOCITY + (1 - y / height) * (MAX_VELOCITY - MIN_VELOCITY)), MIN_VELOCITY, MAX_VELOCITY);
}

/** The indices of the notes that start within `tolerance` beats of `beat`, the closest ones only. */
export function notesStartingAt(notes: readonly ClipNote[], beat: number, tolerance: number): number[] {
  const near = notes.flatMap((note, index) => (Math.abs(note.start - beat) <= tolerance ? [index] : []));
  const closest = Math.min(...near.map((index) => Math.abs(notes[index].start - beat)));
  return near.filter((index) => Math.abs(notes[index].start - beat) <= closest + EPSILON);
}

/**
 * Sets the velocity of the `anchor` note to `to`, and moves those of the other notes chosen by as
 * much, each from its own and within MIDI; `base` holds the velocities they had before.
 */
export function changeVelocities(
  base: readonly ClipNote[],
  indices: readonly number[],
  anchor: number,
  to: number,
): ClipNote[] {
  const by = to - velocityOf(base[anchor]);
  const chosen = new Set([...indices, anchor]);
  return base.map((note, index) => {
    if (!chosen.has(index)) {
      return note;
    }
    const { velocity: _previous, ...rest } = note;
    return { ...rest, ...withVelocity(clamp(velocityOf(note) + by, MIN_VELOCITY, MAX_VELOCITY)) };
  });
}
