import { describe, expect, it } from "vitest";
import type { TimeSignature } from "./meter";
import { MidiFormatError, readMidi, TICKS_PER_BEAT, writeMidi } from "./midi";

const word = (value: number, bytes: number) =>
  Array.from({ length: bytes }, (_, index) => (value >> (8 * (bytes - 1 - index))) & 0xff);
const text = (value: string) => [...value].map((char) => char.charCodeAt(0));

/** A MIDI file of the tracks given, as their events, with `division` ticks a beat. */
const file = (tracks: number[][], { format = 1, division = 96 } = {}) =>
  new Uint8Array([
    ...text("MThd"),
    ...word(6, 4),
    ...word(format, 2),
    ...word(tracks.length, 2),
    ...word(division, 2),
    ...tracks.flatMap((track) => [...text("MTrk"), ...word(track.length, 4), ...track]),
  ]);

const END = [0x00, 0xff, 0x2f, 0x00];

describe("writeMidi", () => {
  const notes = [
    { note: 60, start: 0, length: 1 },
    { note: 64, start: 1, length: 0.5 },
    { note: 60, start: 1, length: 2 },
  ];

  it("writes a file its own reader reads back, with the tempo", () => {
    const bytes = writeMidi(notes, { tempo: 120, beats: 8, name: "Clip" });

    expect(readMidi(bytes)).toEqual({
      notes: [
        { note: 60, start: 0, length: 1 },
        { note: 60, start: 1, length: 2 },
        { note: 64, start: 1, length: 0.5 },
      ],
      tempo: 120,
      beats: 8,
    });
  });

  it("writes a single track, in ticks of a beat, that lasts the whole loop", () => {
    const bytes = writeMidi([], { tempo: 90, beats: 8 });
    const track = bytes.slice(22);

    expect([...bytes.slice(0, 14)]).toEqual([...text("MThd"), ...word(6, 4), 0, 0, 0, 1, ...word(TICKS_PER_BEAT, 2)]);
    expect([...track.slice(0, 7)]).toEqual([0x00, 0xff, 0x51, 0x03, ...word(Math.round(60_000_000 / 90), 3)]);
    // The end of the track comes 8 beats in: 3840 ticks, 0x9e 0x00 as a variable length.
    expect([...track.slice(-5)]).toEqual([0x9e, 0x00, 0xff, 0x2f, 0x00]);
  });

  it("writes the time signature of a bar, four quarters without one", () => {
    const written = (signature?: TimeSignature) =>
      [...writeMidi([], { tempo: 120, beats: 8, signature }).slice(22).slice(7, 15)];

    expect(written()).toEqual([0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08]);
    expect(written({ numerator: 3, denominator: 4, clocks: 24 })).toEqual([0x00, 0xff, 0x58, 0x04, 0x03, 0x02, 0x18, 0x08]);
    expect(written({ numerator: 5, denominator: 4, clocks: 24 })).toEqual([0x00, 0xff, 0x58, 0x04, 0x05, 0x02, 0x18, 0x08]);
    expect(written({ numerator: 6, denominator: 8, clocks: 36 })).toEqual([0x00, 0xff, 0x58, 0x04, 0x06, 0x03, 0x24, 0x08]);
    expect(written({ numerator: 12, denominator: 8, clocks: 36 })).toEqual([0x00, 0xff, 0x58, 0x04, 0x0c, 0x03, 0x24, 0x08]);
  });

  it("keeps how hard each note is played", () => {
    const bytes = writeMidi(
      [
        { note: 60, start: 0, length: 1, velocity: 30 },
        { note: 62, start: 1, length: 1 },
      ],
      { tempo: 120, beats: 4 },
    );

    expect(readMidi(bytes).notes).toEqual([
      { note: 60, start: 0, length: 1, velocity: 30 },
      { note: 62, start: 1, length: 1 },
    ]);
  });

  it("lets a note go before the same note starts again", () => {
    const bytes = writeMidi(
      [
        { note: 60, start: 0, length: 1 },
        { note: 60, start: 1, length: 1 },
      ],
      { tempo: 120, beats: 4 },
    );

    expect(readMidi(bytes).notes).toEqual([
      { note: 60, start: 0, length: 1 },
      { note: 60, start: 1, length: 1 },
    ]);
  });
});

describe("readMidi", () => {
  it("reads running status, and a note on with no velocity as a note off", () => {
    const track = [0x00, 0x90, 60, 100, 0x00, 64, 90, 0x60, 60, 0, 0x30, 0x80, 64, 0, ...END];

    expect(readMidi(file([track])).notes).toEqual([
      { note: 60, start: 0, length: 1 },
      { note: 64, start: 0, length: 1.5, velocity: 90 },
    ]);
  });

  it("gathers the notes of every track and channel, skipping the other events", () => {
    const first = [0x00, 0xff, 0x51, 0x03, ...word(500_000, 3), 0x00, 0xc0, 5, 0x00, 0xf0, 0x02, 0x01, 0xf7, ...END];
    const second = [0x60, 0x91, 50, 100, 0x00, 0xb1, 7, 100, 0x60, 0x81, 50, 0, ...END];

    // The second track is the longer one: two beats of 96 ticks.
    expect(readMidi(file([first, second]))).toEqual({
      notes: [{ note: 50, start: 1, length: 1 }],
      tempo: 120,
      beats: 2,
    });
  });

  it("lets go of a note played twice in the order it was played, and ends one never let go with its track", () => {
    const track = [
      ...[0x00, 0x90, 60, 100],
      ...[0x60, 0x90, 60, 100],
      ...[0x60, 0x80, 60, 0],
      ...[0x60, 0x90, 62, 100],
      ...[0x60, 0xff, 0x2f, 0x00],
    ];

    expect(readMidi(file([track])).notes).toEqual([
      { note: 60, start: 0, length: 2 },
      { note: 60, start: 1, length: 3 },
      { note: 62, start: 3, length: 1 },
    ]);
  });

  it("refuses what is not a MIDI file, one cut short, and one timed in frames", () => {
    expect(() => readMidi(new Uint8Array(text("not a midi file at all")))).toThrow(MidiFormatError);
    expect(() => readMidi(file([[0x00, 0x90, 60, 100, ...END]]).slice(0, 26))).toThrow(MidiFormatError);
    expect(() => readMidi(file([END], { division: 0xe728 }))).toThrow("frames");
  });
});
