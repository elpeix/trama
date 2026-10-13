/** What a MIDI message asks for, on a channel from 1 to 16; the messages the patch does not use are left out. */
export type MidiEvent =
  | { type: "noteOn"; channel: number; note: number; velocity: number }
  | { type: "noteOff"; channel: number; note: number }
  | { type: "control"; channel: number; control: number; value: number }
  /** How far the pitch wheel is moved, from -1 down to 1 up. */
  | { type: "bend"; channel: number; amount: number };

/** The numbers of the controls the patch uses. */
export const MOD_WHEEL = 1;
export const SUSTAIN_PEDAL = 64;
export const ALL_SOUND_OFF = 120;
export const ALL_NOTES_OFF = 123;

/** Whether the sustain pedal is down: switch pedals send 127, and half pedals less. */
export const pedalDown = (value: number) => value >= 64;

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const PITCH_BEND = 0xe0;
const BEND_CENTER = 8192;

/**
 * Reads a MIDI message: a note on with velocity 0 is a note off, as many keyboards send it. The
 * messages of the system, such as the clock, and the ones too short to read, give undefined.
 */
export function parseMidiMessage(data: ArrayLike<number>): MidiEvent | undefined {
  const [status, first, second] = Array.from(data);
  if (status === undefined || first === undefined || second === undefined || status < NOTE_OFF || status >= 0xf0) {
    return undefined;
  }
  const channel = (status & 0x0f) + 1;
  switch (status & 0xf0) {
    case NOTE_ON:
      return second === 0 ? { type: "noteOff", channel, note: first } : { type: "noteOn", channel, note: first, velocity: second };
    case NOTE_OFF:
      return { type: "noteOff", channel, note: first };
    case CONTROL_CHANGE:
      return { type: "control", channel, control: first, value: second };
    case PITCH_BEND: {
      const value = (second << 7) | first;
      return { type: "bend", channel, amount: value >= BEND_CENTER ? (value - BEND_CENTER) / (BEND_CENTER - 1) : (value - BEND_CENTER) / BEND_CENTER };
    }
    default:
      return undefined;
  }
}
