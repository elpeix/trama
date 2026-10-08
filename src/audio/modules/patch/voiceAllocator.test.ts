import { describe, expect, it } from "vitest";
import { VoiceAllocator } from "./voiceAllocator";

describe("VoiceAllocator", () => {
  it("gives each new note a free voice, in turn", () => {
    const voices = new VoiceAllocator(3);

    expect([voices.noteOn(60), voices.noteOn(64), voices.noteOn(67)]).toEqual([0, 1, 2]);
  });

  it("frees the voice of a released note", () => {
    const voices = new VoiceAllocator(2);
    voices.noteOn(60);
    voices.noteOn(64);

    expect(voices.noteOff(60)).toBe(0);
    expect(voices.noteOn(67)).toBe(0);
  });

  it("gives a new note the voice released longest ago, so the tail of the last one goes on", () => {
    const voices = new VoiceAllocator(3);
    voices.noteOn(60);
    voices.noteOn(64);
    voices.noteOff(64);
    voices.noteOff(60);

    expect(voices.noteOn(67)).toBe(2);
    expect(voices.noteOn(69)).toBe(1);
    expect(voices.noteOn(71)).toBe(0);
  });

  it("takes the voice of the oldest note when every voice sounds", () => {
    const voices = new VoiceAllocator(2);
    voices.noteOn(60);
    voices.noteOn(64);

    expect(voices.noteOn(67)).toBe(0);
    expect(voices.noteOn(69)).toBe(1);
  });

  it("releases nothing for a note whose voice was taken", () => {
    const voices = new VoiceAllocator(1);
    voices.noteOn(60);
    voices.noteOn(64);

    expect(voices.noteOff(60)).toBeUndefined();
    expect(voices.noteOff(64)).toBe(0);
  });

  it("plays a note again on the voice that already sounds it", () => {
    const voices = new VoiceAllocator(3);
    voices.noteOn(60);
    voices.noteOn(64);

    expect(voices.noteOn(60)).toBe(0);
  });

  it("releases nothing for a note that does not sound", () => {
    expect(new VoiceAllocator(2).noteOff(60)).toBeUndefined();
  });

  it("glides a note into another one on the same voice, which then releases with the new note", () => {
    const voices = new VoiceAllocator(2);
    voices.noteOn(60);
    voices.noteOn(64);

    expect(voices.glide(64, 67)).toBe(1);
    expect(voices.noteOff(64)).toBeUndefined();
    expect(voices.noteOff(67)).toBe(1);
  });

  it("glides nothing from a note that does not sound", () => {
    expect(new VoiceAllocator(2).glide(60, 64)).toBeUndefined();
  });

  it("tells when the voice it gives still sounds: held, or let go less than the release ago", () => {
    const voices = new VoiceAllocator(2, 3);
    voices.noteOn(60, 0);
    expect(voices.stole).toBe(false);
    voices.noteOn(64, 0);
    voices.noteOff(60, 1);

    voices.noteOn(67, 2);
    expect(voices.stole).toBe(true);

    voices.noteOff(67, 2.5);
    voices.noteOff(64, 2.5);
    voices.noteOn(69, 6);
    expect(voices.stole).toBe(false);
  });

  it("takes again the voice of a note played again, as no other note sounded on it", () => {
    const voices = new VoiceAllocator(2, 3);
    voices.noteOn(60, 0);

    voices.noteOn(60, 1);

    expect(voices.stole).toBe(false);
  });

  it("plays a note again on the voice where its tail still rings, without taking it from another note", () => {
    const voices = new VoiceAllocator(3, 3);
    voices.noteOn(60, 0);
    voices.noteOn(64, 0);
    voices.noteOff(60, 1);
    voices.noteOff(64, 1);

    expect(voices.noteOn(60, 2)).toBe(0);
    expect(voices.stole).toBe(false);
  });

  it("gives a note whose tail has died away the voice released longest ago, as any other", () => {
    const voices = new VoiceAllocator(3, 3);
    voices.noteOn(60, 0);
    voices.noteOn(64, 0);
    voices.noteOff(60, 1);
    voices.noteOff(64, 1);

    expect(voices.noteOn(60, 5)).toBe(2);
  });

  it("counts a note played again over its own tail as one voice", () => {
    const voices = new VoiceAllocator(8, 1.2);
    [0, 0.9, 1.2].forEach((start, index) => {
      const chord = index < 2 ? [57, 60, 64] : [53, 57, 60];
      chord.forEach((note) => voices.noteOn(note, start));
      chord.forEach((note) => voices.noteOff(note, start + 0.09));
    });

    expect(voices.needed).toBe(4);
  });

  it("counts the most voices that sounded at once, their release included", () => {
    const voices = new VoiceAllocator(4, 3);
    for (let bar = 0; bar < 4; bar++) {
      const chord = [60, 64, 67].map((note) => note + bar);
      chord.forEach((note) => voices.noteOn(note, bar * 4));
      chord.forEach((note) => voices.noteOff(note, bar * 4 + 4));
    }

    expect(voices.needed).toBe(6);
  });

  it("needs no more voices than notes held at once without a release", () => {
    const voices = new VoiceAllocator(4);
    for (let bar = 0; bar < 4; bar++) {
      const chord = [60, 64, 67].map((note) => note + bar);
      chord.forEach((note) => voices.noteOn(note, bar * 4));
      chord.forEach((note) => voices.noteOff(note, bar * 4 + 4));
    }

    expect(voices.needed).toBe(3);
  });

  it("stops counting a note whose voice was taken once it is let go, and a note glided into another as one", () => {
    const voices = new VoiceAllocator(1);
    voices.noteOn(60, 0);
    voices.noteOn(64, 1);
    voices.noteOff(60, 2);
    voices.noteOff(64, 2);
    voices.noteOn(65, 3);
    voices.glide(65, 67);
    voices.noteOff(67, 4);

    voices.noteOn(69, 5);

    expect(voices.needed).toBe(2);
  });
});
