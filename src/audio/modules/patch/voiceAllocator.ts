interface Voice {
  note?: number;
  since: number;
  /** When its last note was let go, in seconds; undefined while held or before any. */
  releasedAt?: number;
  /** The note it let go last, whose tail it may still ring. */
  last?: number;
}

/**
 * Which of the voices of a subpatch plays each note: a note played again takes the voice that still
 * sounds it, held or in its release. It also tells whether the voice it gives a note still sounded
 * another one, and counts the most voices that sounded at once.
 */
export class VoiceAllocator {
  private readonly voices: Voice[];
  private release: number;
  private clock = 0;
  /** The notes held and the ends of the releases, apart from the voices, to count what would have needed one. */
  private readonly held = new Set<number>();
  private tails: { note: number; end: number }[] = [];
  /** Whether the last note took a voice that still sounded another one. */
  stole = false;
  /** The most voices that sounded at once, as a note started, their release included. */
  needed = 0;

  constructor(count: number, release = 0) {
    this.voices = Array.from({ length: count }, () => ({ since: 0 }));
    this.release = release;
  }

  setRelease(release: number) {
    this.release = release;
  }

  noteOn(note: number, time = 0): number {
    const held = this.voices.findIndex((voice) => voice.note === note);
    const ringing = this.voices.findIndex(
      (voice) => voice.note === undefined && voice.last === note && this.sounds(voice, time),
    );
    const sounding = held >= 0 ? held : ringing;
    const free = this.voices.filter((voice) => voice.note === undefined);
    const pool = free.length > 0 ? free : this.voices;
    const oldest = pool.reduce((best, voice) => (voice.since < best.since ? voice : best));
    const index = sounding >= 0 ? sounding : this.voices.indexOf(oldest);
    this.tails = this.tails.filter((tail) => tail.end > time && tail.note !== note);
    this.needed = Math.max(this.needed, this.held.size + this.tails.length + (this.held.has(note) ? 0 : 1));
    this.held.add(note);
    this.stole = sounding < 0 && this.sounds(this.voices[index], time);
    this.voices[index] = { note, since: ++this.clock };
    return index;
  }

  glide(from: number, to: number): number | undefined {
    const index = this.voices.findIndex((voice) => voice.note === from);
    if (this.held.delete(from)) {
      this.held.add(to);
    }
    if (index < 0) {
      return undefined;
    }
    this.voices[index] = { ...this.voices[index], note: to };
    return index;
  }

  noteOff(note: number, time = 0): number | undefined {
    const index = this.voices.findIndex((voice) => voice.note === note);
    this.held.delete(note);
    if (index < 0) {
      return undefined;
    }
    this.voices[index] = { since: ++this.clock, releasedAt: time, last: note };
    if (this.release > 0) {
      this.tails.push({ note, end: time + this.release });
    }
    return index;
  }

  private sounds(voice: Voice, time: number) {
    return voice.note !== undefined || (voice.releasedAt !== undefined && time - voice.releasedAt < this.release);
  }
}
