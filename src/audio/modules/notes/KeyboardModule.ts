import { DEFAULT_VELOCITY, MAX_VELOCITY } from "../../../patch/clip";
import type { Params, ParamValue } from "../../../patch/types";
import { NoteBus, TriggerBus, unknownParameter, type AudioModule, type NoteActivity, type NoteReceiver } from "../AudioModule";

const MIDDLE_C = 60;

export class KeyboardModule implements AudioModule, NoteReceiver {
  private readonly pitch: ConstantSourceNode;
  /** How hard the note sounding was played, from 0 to 1. */
  private readonly velocity: ConstantSourceNode;
  private readonly velocities = new Map<number, number>();
  private readonly gate = new TriggerBus();
  private readonly notes = new NoteBus();
  private held: number[] = [];
  private readonly sent = new Map<number, number>();
  /** Semitones added to every note. */
  private transpose: number;

  constructor(context: BaseAudioContext, params: Params) {
    this.transpose = Number(params.transpose);
    this.pitch = context.createConstantSource();
    this.pitch.offset.value = 0;
    this.pitch.start();
    this.velocity = context.createConstantSource();
    this.velocity.offset.value = 0;
    this.velocity.start();
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "pitch" ? this.pitch : port === "velocity" ? this.velocity : undefined;
  }

  getTriggerOutput(port: string) {
    return port === "gate" ? this.gate : undefined;
  }

  getNoteOutput(port: string) {
    return port === "notes" ? this.notes : undefined;
  }

  noteOn(note: number, time: number, velocity = DEFAULT_VELOCITY) {
    this.held = [...this.held.filter((held) => held !== note), note];
    this.velocities.set(note, velocity);
    this.setPitch(note, time);
    this.gate.gateOn(time);
    this.sent.set(note, note + this.transpose);
    this.notes.noteOn(note + this.transpose, time, velocity);
  }

  noteOff(note: number, time: number) {
    if (!this.held.includes(note)) {
      return;
    }
    this.held = this.held.filter((held) => held !== note);
    this.notes.noteOff(this.sent.get(note)!, time);
    this.sent.delete(note);
    this.velocities.delete(note);
    const previous = this.held.at(-1);
    if (previous === undefined) {
      this.gate.gateOff(time);
    } else {
      this.setPitch(previous, time);
    }
  }

  allNotesOff(time: number) {
    if (this.held.length === 0) {
      return;
    }
    this.held = [];
    this.sent.clear();
    this.velocities.clear();
    this.gate.gateOff(time);
    this.notes.allNotesOff(time);
  }

  /** The keys held, and the one sounding: the last one pressed, as it plays one note at a time. */
  getNotes(): NoteActivity {
    const notes = this.held.map((note) => note + this.transpose);
    const playing = notes.at(-1);
    return { notes, ...(playing !== undefined && { playing }) };
  }

  setParameter(name: string, value: ParamValue) {
    if (name !== "transpose") {
      unknownParameter("Keyboard", name);
    }
    this.transpose = Number(value);
  }

  dispose() {
    this.pitch.stop();
    this.pitch.disconnect();
    this.velocity.stop();
    this.velocity.disconnect();
  }

  /** Sets the pitch, and the velocity, of a held note that sounds from `time`. */
  private setPitch(note: number, time: number) {
    this.pitch.offset.setValueAtTime((note + this.transpose - MIDDLE_C) / 12, time);
    this.velocity.offset.setValueAtTime((this.velocities.get(note) ?? DEFAULT_VELOCITY) / MAX_VELOCITY, time);
  }
}
