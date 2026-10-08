import { DEFAULT_VELOCITY, MAX_VELOCITY, parseClip, velocityOf, type ClipNote } from "../../../patch/clip";
import { FIRST_SLOT, patternIds, type Launch } from "../../../patch/patterns";
import type { Params, ParamValue, Patterns, PatternSlot } from "../../../patch/types";
import type { Transport } from "../../Transport";
import { TriggerBus, unknownParameter, type AudioModule } from "../AudioModule";
import { chordSchedule, clipSchedule } from "./clipSchedule";
import { NoteQueue } from "./noteQueue";
import { PatternBank } from "../PatternBank";
import { StepClock } from "../StepClock";

const MIDDLE_C = 60;
/** The clock looks for notes a thirty-second of a beat at a time, and plays each at its own moment. */
const SCAN_BEATS = 1 / 32;
const EPSILON = 1e-6;

/**
 * Plays a phrase of notes in a loop of whole bars while the audio runs, with the same outputs as
 * the Seq: each note sets the pitch and holds the gate open for its length. It sends its notes
 * too, chords included, for the voices of a subpatch. It follows the shared grid, so it plays in
 * time with the Seq and the Arp, and its swing: a note that starts or ends on a step the swing
 * holds back, or within a thirty-second of a beat of one, starts or ends that much later. Its four patterns are each a length and a phrase, launched like
 * those of the Seq.
 */
export class ClipModule implements AudioModule {
  private readonly context: BaseAudioContext;
  private readonly transport: Transport;
  private readonly pitch: ConstantSourceNode;
  /** How hard the note sounding is played, from 0 to 1. */
  private readonly velocity: ConstantSourceNode;
  private readonly gate = new TriggerBus();
  private readonly notesOut = new NoteQueue();
  private readonly clock: StepClock;
  private readonly patterns: PatternBank;
  /** How many beats the grid is ahead of the pattern playing. */
  private ahead = 0;
  private params: Params;
  private notes: ClipNote[];
  private schedule: ClipNote[];
  private chords: ClipNote[];
  private playing = false;
  /** The note being previewed, octave included, if any. */
  private previewing: number | undefined;
  private readonly starting: ReturnType<typeof setTimeout>;

  constructor(context: BaseAudioContext, params: Params, transport: Transport, patterns?: Patterns) {
    this.context = context;
    this.transport = transport;
    this.params = { ...params };
    this.patterns = new PatternBank(patternIds("clip"), params, patterns);
    this.notes = parseClip(String(params.notes)) ?? [];
    this.schedule = clipSchedule(this.notes, this.loopBeats);
    this.chords = chordSchedule(this.notes, this.loopBeats);
    this.pitch = context.createConstantSource();
    this.pitch.offset.value = 0;
    this.pitch.start();
    this.velocity = context.createConstantSource();
    this.velocity.offset.value = 0;
    this.velocity.start();
    this.clock = new StepClock(context, transport, () => SCAN_BEATS, (time, _duration, step) => this.scan(time, step), {
      swing: false,
    });
    const created = context.currentTime;
    this.starting = setTimeout(() => this.clock.start(created));
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
    return port === "notes" ? this.notesOut.output : undefined;
  }

  /** The beat of the loop it is on, while it plays; undefined before it starts. */
  getPosition(): number | undefined {
    if (!this.playing) {
      return undefined;
    }
    return this.inLoop(this.transport.beatAt(this.context.currentTime));
  }

  setParameter(name: string, value: ParamValue) {
    if (!(name in this.params)) {
      unknownParameter("Clip", name);
    }
    if (patternIds("clip").includes(name)) {
      this.setPatternParameter(FIRST_SLOT, name, value);
      return;
    }
    this.apply({ [name]: value });
  }

  setPatternParameter(slot: PatternSlot, name: string, value: ParamValue) {
    if (this.patterns.set(slot, name, value)) {
      this.apply({ [name]: value });
    }
  }

  launchPattern(slot: Launch, mode?: string, at?: number) {
    this.patterns.launch(slot, mode, at);
  }

  getPattern() {
    return this.patterns.state();
  }

  previewOn(note: number, time: number, velocity = DEFAULT_VELOCITY) {
    this.previewOff(time);
    const shifted = note + 12 * Number(this.params.octave);
    this.pitch.offset.setValueAtTime((shifted - MIDDLE_C) / 12, time);
    this.velocity.offset.setValueAtTime(velocity / MAX_VELOCITY, time);
    this.gate.gateOn(time);
    this.notesOut.output.noteOn(shifted, time, velocity);
    this.previewing = shifted;
  }

  previewOff(time: number) {
    if (this.previewing === undefined) {
      return;
    }
    this.gate.gateOff(time);
    this.notesOut.output.noteOff(this.previewing, time);
    this.previewing = undefined;
  }

  dispose() {
    clearTimeout(this.starting);
    this.clock.stop();
    this.notesOut.stop(this.context.currentTime);
    this.pitch.stop();
    this.pitch.disconnect();
    this.velocity.stop();
    this.velocity.disconnect();
  }

  private apply(values: Params) {
    this.params = { ...this.params, ...values };
    if ("notes" in values) {
      this.notes = parseClip(String(values.notes)) ?? this.notes;
    }
    this.schedule = clipSchedule(this.notes, this.loopBeats);
    this.chords = chordSchedule(this.notes, this.loopBeats);
  }

  private get loopBeats() {
    return Number(this.params.bars) * this.transport.beatsPerBar;
  }

  private inLoop(beat: number) {
    const local = beat - this.ahead;
    return ((local % this.loopBeats) + this.loopBeats) % this.loopBeats;
  }

  private scan(time: number, step: number) {
    this.playing = true;
    // A pattern launched takes over on the first beat of a bar, when the loop starts over, or now,
    // going on from the same place of the grid, or from the beat it was launched for.
    const launched = this.patterns.switchAt(
      this.patterns.launchMode(String(this.params.launch)),
      step * SCAN_BEATS,
      this.inLoop(step * SCAN_BEATS),
      this.transport.beatsPerBar,
    );
    if (launched) {
      this.apply(launched);
      this.ahead = this.patterns.stepsAhead(step, SCAN_BEATS) * SCAN_BEATS;
    }
    const from = this.inLoop(step * SCAN_BEATS);
    const secondsPerBeat = this.transport.secondsPerBeat();
    const shift = 12 * Number(this.params.octave);
    const inWindow = (note: ClipNote) =>
      !this.patterns.stopped && note.start >= from - EPSILON && note.start < from + SCAN_BEATS - EPSILON;
    const grid = this.transport.beatAt(time);
    const swung = (beats: number) => time + (beats + this.transport.swingAt(grid + beats, SCAN_BEATS)) * secondsPerBeat;
    const startOf = (note: ClipNote) => swung(note.start - from);
    const endOf = (note: ClipNote) => swung(note.start - from + note.length);
    for (const note of this.schedule.filter(inWindow)) {
      const start = startOf(note);
      this.pitch.offset.setValueAtTime((note.note + shift - MIDDLE_C) / 12, start);
      this.velocity.offset.setValueAtTime(velocityOf(note) / MAX_VELOCITY, start);
      this.gate.gateOn(start);
      this.gate.gateOff(endOf(note));
    }
    for (const note of this.chords.filter(inWindow)) {
      this.notesOut.play(note.note + shift, startOf(note), endOf(note), velocityOf(note));
    }
    this.notesOut.send(time + SCAN_BEATS * secondsPerBeat - EPSILON);
  }
}
