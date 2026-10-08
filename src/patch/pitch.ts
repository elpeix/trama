export const MIDDLE_C_HZ = 440 * 2 ** (-9 / 12);

export const OCTAVE_CENTS = 1200;

/** The names of the notes of an octave, from C. */
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** The name of a MIDI note, with middle C (60) as C4. */
export function noteName(note: number): string {
  return `${NOTE_NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}
