import type { ClipNote } from "../../../patch/clip";

/**
 * The notes a clip of `loopBeats` plays, in order, one at a time: of the notes that start
 * together only the last one sounds, and each note ends by the time the next one starts, the
 * first one of the next loop included.
 */
export function clipSchedule(notes: readonly ClipNote[], loopBeats: number): ClipNote[] {
  const sorted = notes
    .filter((note) => note.start < loopBeats)
    .sort((a, b) => a.start - b.start || a.note - b.note)
    .filter((note, index, all) => all[index + 1]?.start !== note.start);
  return sorted.map((note, index) => {
    const next = sorted[index + 1]?.start ?? sorted[0].start + loopBeats;
    return { ...note, length: Math.min(note.length, next - note.start) };
  });
}

/**
 * The notes a clip of `loopBeats` plays, in order, as many at a time as they are drawn: a note
 * ends by the time the same note starts again, the first one of the next loop included, and of a
 * note drawn twice in the same place only the longest one sounds.
 */
export function chordSchedule(notes: readonly ClipNote[], loopBeats: number): ClipNote[] {
  const sorted = notes
    .filter((note) => note.start < loopBeats)
    .sort((a, b) => a.start - b.start || a.note - b.note || a.length - b.length);
  return sorted
    .map((note, index) => {
      const again = sorted.slice(index + 1).find((later) => later.note === note.note)?.start;
      const next = again ?? sorted.find((first) => first.note === note.note)!.start + loopBeats;
      return { ...note, length: Math.min(note.length, next - note.start) };
    })
    .filter((note) => note.length > 0);
}
