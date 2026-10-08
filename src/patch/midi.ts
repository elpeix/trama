import { byStart, DEFAULT_VELOCITY, velocityOf, type ClipNote } from "./clip";
import { DEFAULT_METER, timeSignature, type TimeSignature } from "./meter";

/** Ticks a beat in the files written: what most programs use. */
export const TICKS_PER_BEAT = 480;
const MICROSECONDS_PER_MINUTE = 60_000_000;

export class MidiFormatError extends Error {}

/** What a MIDI file holds for a clip: its notes, in beats, and the first tempo it sets, if any. */
export interface MidiClip {
  notes: ClipNote[];
  tempo?: number;
  /** Where the longest track ends, in beats: a loop that ends in silence is as long as that. */
  beats: number;
}

const text = (value: string) => [...value].map((char) => char.charCodeAt(0) & 0x7f);

const word = (value: number, bytes: number) =>
  Array.from({ length: bytes }, (_, index) => (value >> (8 * (bytes - 1 - index))) & 0xff);

/** A number as MIDI writes lengths and times: seven bits a byte, the first ones marked. */
function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let rest = value >> 7; rest > 0; rest >>= 7) {
    bytes.unshift((rest & 0x7f) | 0x80);
  }
  return bytes;
}

interface TrackEvent {
  tick: number;
  /** At the same tick, notes that end go first, so that a note that starts again is not cut. */
  order: number;
  bytes: number[];
}

/**
 * A standard MIDI file of a single track with the notes of a clip, on the first channel: the
 * tempo, the time signature (four quarters if not given), the name if given, and the notes.
 * The track lasts `beats` at least, so that the whole loop is kept even when it ends in silence.
 */
export function writeMidi(
  notes: readonly ClipNote[],
  options: { tempo: number; beats: number; name?: string; signature?: TimeSignature },
): Uint8Array<ArrayBuffer> {
  const tick = (beat: number) => Math.round(beat * TICKS_PER_BEAT);
  const name = options.name ? text(options.name) : [];
  const signature = options.signature ?? timeSignature(DEFAULT_METER);
  const events: TrackEvent[] = [
    { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, ...word(Math.round(MICROSECONDS_PER_MINUTE / options.tempo), 3)] },
    {
      tick: 0,
      order: 0,
      bytes: [0xff, 0x58, 0x04, signature.numerator, Math.log2(signature.denominator), signature.clocks, 0x08],
    },
    ...(name.length > 0 ? [{ tick: 0, order: 0, bytes: [0xff, 0x03, ...variableLength(name.length), ...name] }] : []),
    ...notes.flatMap((note) => [
      { tick: tick(note.start), order: 2, bytes: [0x90, note.note, velocityOf(note)] },
      { tick: tick(note.start + note.length), order: 1, bytes: [0x80, note.note, 0] },
    ]),
  ].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const end = Math.max(tick(options.beats), ...events.map((event) => event.tick));

  const track: number[] = [];
  let last = 0;
  for (const event of [...events, { tick: end, order: 3, bytes: [0xff, 0x2f, 0x00] }]) {
    track.push(...variableLength(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  return new Uint8Array([
    ...text("MThd"),
    ...word(6, 4),
    ...word(0, 2),
    ...word(1, 2),
    ...word(TICKS_PER_BEAT, 2),
    ...text("MTrk"),
    ...word(track.length, 4),
    ...track,
  ]);
}

/** Reads the bytes of a MIDI file one after another, and fails as soon as they run out. */
class Reader {
  private readonly bytes: Uint8Array;
  readonly end: number;
  position = 0;

  constructor(bytes: Uint8Array, end = bytes.length) {
    this.bytes = bytes;
    this.end = end;
  }

  byte() {
    if (this.position >= this.end) {
      throw new MidiFormatError("The MIDI file ends too soon");
    }
    return this.bytes[this.position++];
  }

  number(bytes: number) {
    let value = 0;
    for (let index = 0; index < bytes; index++) {
      value = value * 256 + this.byte();
    }
    return value;
  }

  text(length: number) {
    return String.fromCharCode(...Array.from({ length }, () => this.byte()));
  }

  variableLength() {
    let value = 0;
    for (let index = 0; index < 4; index++) {
      const byte = this.byte();
      value = value * 128 + (byte & 0x7f);
      if (byte < 0x80) {
        return value;
      }
    }
    throw new MidiFormatError("The MIDI file has a length that is too long");
  }

  skip(length: number) {
    if (this.position + length > this.end) {
      throw new MidiFormatError("The MIDI file ends too soon");
    }
    this.position += length;
  }

  /** A reader for the next `length` bytes, which this one then skips. */
  chunk(length: number) {
    const inside = new Reader(this.bytes, this.position + length);
    inside.position = this.position;
    this.skip(length);
    return inside;
  }
}

/** The notes of one track, in ticks, and the tempo it sets first, if any. */
function readTrack(reader: Reader) {
  const notes: { note: number; start: number; end: number; velocity: number }[] = [];
  // The notes still sounding, by channel and note, the earliest first, with how hard they were played.
  const open = new Map<number, { start: number; velocity: number }[]>();
  let tempo: number | undefined;
  let tick = 0;
  let status = 0;

  const end = (channel: number, note: number, at: number) => {
    const started = open.get(channel * 128 + note)?.shift();
    if (started !== undefined) {
      notes.push({ note, ...started, end: at });
    }
  };

  while (reader.position < reader.end) {
    tick += reader.variableLength();
    let first = reader.byte();
    if (first < 0x80) {
      // Running status: the event has no status byte of its own, and takes the last one.
      if (status === 0) {
        throw new MidiFormatError("The MIDI file has an event without a status");
      }
      first = status;
      reader.position--;
    }
    if (first === 0xff) {
      const type = reader.byte();
      const length = reader.variableLength();
      if (type === 0x51 && length === 3 && tempo === undefined) {
        // Rounded, as the file keeps it in whole microseconds a beat: 90 comes back as 89.99995.
        tempo = Math.round((MICROSECONDS_PER_MINUTE / reader.number(3)) * 100) / 100;
      } else if (type === 0x2f) {
        reader.skip(length);
        break;
      } else {
        reader.skip(length);
      }
      continue;
    }
    if (first === 0xf0 || first === 0xf7) {
      reader.skip(reader.variableLength());
      continue;
    }
    status = first;
    const kind = first & 0xf0;
    const channel = first & 0x0f;
    const data = kind === 0xc0 || kind === 0xd0 ? [reader.byte()] : [reader.byte(), reader.byte()];
    if (kind === 0x90 && data[1] > 0) {
      const key = channel * 128 + data[0];
      open.set(key, [...(open.get(key) ?? []), { start: tick, velocity: data[1] }]);
    } else if (kind === 0x80 || kind === 0x90) {
      end(channel, data[0], tick);
    }
  }
  // A note never let go lasts to the end of its track.
  for (const [key, started] of open) {
    started.forEach((note) => notes.push({ note: key % 128, ...note, end: tick }));
  }
  return { notes, tempo, end: tick };
}

/**
 * The notes of a standard MIDI file, from all its tracks and channels, in beats. A note played
 * again before it ends is let go in the order it was played. Files timed in frames instead of
 * beats are not read.
 */
export function readMidi(bytes: Uint8Array): MidiClip {
  const reader = new Reader(bytes);
  if (bytes.length < 14 || reader.text(4) !== "MThd") {
    throw new MidiFormatError("This is not a MIDI file");
  }
  const header = reader.chunk(reader.number(4));
  header.number(2);
  const tracks = header.number(2);
  const division = header.number(2);
  if (division & 0x8000) {
    throw new MidiFormatError("MIDI files timed in frames are not supported");
  }
  if (division === 0) {
    throw new MidiFormatError("The MIDI file has no ticks per beat");
  }

  const notes: ClipNote[] = [];
  let tempo: number | undefined;
  let end = 0;
  for (let found = 0; found < tracks && reader.position < reader.end;) {
    const type = reader.text(4);
    const chunk = reader.chunk(reader.number(4));
    if (type !== "MTrk") {
      continue;
    }
    found++;
    const track = readTrack(chunk);
    tempo ??= track.tempo;
    end = Math.max(end, track.end);
    notes.push(
      ...track.notes.map(({ note, start, end, velocity }) => ({
        note,
        start: start / division,
        length: (end - start) / division,
        ...(velocity !== DEFAULT_VELOCITY && { velocity }),
      })),
    );
  }
  return { notes: notes.sort(byStart), ...(tempo !== undefined && { tempo }), beats: end / division };
}
