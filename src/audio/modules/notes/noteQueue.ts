import { NoteBus } from "../AudioModule";

const SAME_MOMENT = 1e-9;

type NoteEvent =
  | { kind: "on"; note: number; time: number; velocity?: number }
  | { kind: "off"; note: number; time: number }
  | { kind: "glide"; from: number; to: number; time: number; seconds: number };

const ORDER = { off: 0, glide: 1, on: 2 };

/**
 * The notes a module plays ahead of time, for the voices of a subpatch: each goes out only once
 * its moment is about to come, the end of a note included, so that a voice is never freed before
 * its note ends. At the same moment, the notes that end go out first, then the glides, then the
 * notes that start.
 */
export class NoteQueue {
  readonly output = new NoteBus();
  private events: NoteEvent[] = [];

  play(note: number, start: number, end: number, velocity?: number) {
    this.on(note, start, velocity);
    this.off(note, end);
  }

  on(note: number, time: number, velocity?: number) {
    this.events.push({ kind: "on", note, time, velocity });
  }

  off(note: number, time: number) {
    this.events.push({ kind: "off", note, time });
  }

  glide(from: number, to: number, time: number, seconds: number) {
    this.events.push({ kind: "glide", from, to, time, seconds });
  }

  /** Sends what happens before `until`. */
  send(until: number) {
    const due = this.events.filter((event) => event.time < until);
    this.events = this.events.filter((event) => event.time >= until);
    const order = (a: NoteEvent, b: NoteEvent) =>
      Math.abs(a.time - b.time) > SAME_MOMENT ? a.time - b.time : ORDER[a.kind] - ORDER[b.kind];
    for (const event of due.sort(order)) {
      switch (event.kind) {
        case "on":
          this.output.noteOn(event.note, event.time, event.velocity);
          break;
        case "off":
          this.output.noteOff(event.note, event.time);
          break;
        case "glide":
          this.output.glide(event.from, event.to, event.time, event.seconds);
      }
    }
  }

  stop(time: number) {
    this.events = [];
    this.output.allNotesOff(time);
  }
}
