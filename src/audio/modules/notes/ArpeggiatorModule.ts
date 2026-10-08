import { FIRST_SLOT, patternIds, type Launch } from "../../../patch/patterns";
import { parseNotes, parseRhythm } from "../../../patch/sequence";
import type { Params, ParamValue, Patterns, PatternSlot } from "../../../patch/types";
import {
  TriggerBus,
  unknownParameter,
  type AudioModule,
  type NoteActivity,
  type NoteReceiver,
} from "../AudioModule";
import type { Transport } from "../../Transport";
import { PatternBank } from "../PatternBank";
import { beatsPerStep, GATE_STEP, GateSteps, launchOn, StepClock } from "../StepClock";

const MIDDLE_C = 60;

export type Pattern = "up" | "down" | "up-down" | "random";

/** Semitones above the key for each chord; "off" plays only the keys themselves. */
const CHORDS: Record<string, number[]> = {
  off: [0],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus4: [0, 5, 7],
};

/**
 * The order in which the notes are played: every held key, or the chord built on it, repeated over
 * `span` octaves.
 */
export function arpeggio(held: number[], pattern: Pattern, span: number, chord = "off"): number[] {
  const intervals = CHORDS[chord] ?? CHORDS.off;
  const notes = new Set(held.flatMap((key) => intervals.map((interval) => key + interval)));
  const sorted = [...notes].sort((a, b) => a - b);
  const up = Array.from({ length: span }, (_, octave) => sorted.map((note) => note + 12 * octave)).flat();
  switch (pattern) {
    case "down":
      return up.reverse();
    case "up-down":
      return up.length <= 2 ? up : [...up, ...up.slice(1, -1).reverse()];
    default:
      return up;
  }
}

/**
 * Plays the held notes one after the other at the tempo of the patch, with the same outputs as the
 * Keyboard. The first note waits for the next step of the shared grid, so it stays in time with the
 * sequencers; with its start param set to "now" it sounds the moment a key is pressed instead, and
 * the steps that follow keep that beat. With its source set to "notes", it plays notes of its own instead, in a loop while
 * the sound runs, and starts over with the sound like a sequencer; with its keys param on, the last
 * computer key pressed transposes them. Its rhythm, a loop of steps on the grid, says which steps
 * sound: a silent one keeps its note for the next step that sounds. With its step at "gate", each
 * gate into its clock input plays the next step instead of the grid, for as long as that gate.
 */
export class ArpeggiatorModule implements AudioModule, NoteReceiver {
  private readonly context: BaseAudioContext;
  private readonly pitch: ConstantSourceNode;
  private readonly gate = new TriggerBus();
  private readonly random: () => number;
  private held: number[] = [];
  /** The notes of its own, played instead of the keys when its source is "notes". */
  private own: number[];
  /** Which steps of the loop sound; a silent one keeps its note for the next one that does. */
  private rhythm: boolean[];
  /** The last computer key pressed, which can transpose its own notes. */
  private keyNote = MIDDLE_C;
  private params: Params;
  private readonly clock: StepClock;
  private readonly clockIn: GateSteps;
  /** Whether a gate into the clock input opened the gate, until it closes. */
  private opened = false;
  private readonly transport: Transport;
  private readonly patterns: PatternBank;
  private step = 0;
  private lastNote: number | undefined;
  /** Steps already scheduled, to tell which one is sounding at a given moment. */
  private scheduled: { start: number; end: number; note: number }[] = [];
  /** Steps of the rhythm already scheduled, silent ones too, to tell which one it is on. */
  private positions: { start: number; end: number; position: number }[] = [];
  /** How many steps the grid is ahead of the pattern playing. */
  private ahead = 0;
  private readonly starting: ReturnType<typeof setTimeout> | undefined;

  constructor(
    context: BaseAudioContext,
    params: Params,
    transport: Transport,
    random: () => number = Math.random,
    patterns?: Patterns,
  ) {
    this.context = context;
    this.transport = transport;
    this.params = { ...params };
    this.patterns = new PatternBank(patternIds("arpeggiator"), params, patterns);
    this.own = parseNotes(String(params.notes ?? "")) ?? [];
    this.rhythm = parseRhythm(String(params.rhythm ?? "")) ?? [true];
    this.random = random;
    this.pitch = context.createConstantSource();
    this.pitch.offset.value = 0;
    this.pitch.start();
    this.clock = new StepClock(
      context,
      transport,
      () => beatsPerStep(String(this.params.division)),
      (time, duration, step) => {
        if (this.followsGates) {
          return;
        }
        const note = this.enter(time, time + duration, step);
        if (note !== undefined) {
          this.play(note, time, duration * Number(this.params.gate));
        }
      },
    );
    this.clockIn = new GateSteps(
      transport,
      (time, step) => this.stepOn(time, step),
      (time) => this.stepOff(time),
    );
    if (this.playsOwnNotes) {
      // Start once the engine has wired the outputs, so the first step is not lost.
      const created = context.currentTime;
      this.starting = setTimeout(() => this.startClock(created));
    }
  }

  private get playsOwnNotes() {
    return this.params.source === "notes";
  }

  /** On the shared grid, or right away from `time` and keeping that beat from then on. */
  private startClock(time: number) {
    this.clock.start(time, this.params.start === "now" ? "now" : "grid");
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "pitch" ? this.pitch : undefined;
  }

  getTriggerOutput(port: string) {
    return port === "gate" ? this.gate : undefined;
  }

  getTriggerInput(port: string) {
    return port === "clock" ? this.clockIn : undefined;
  }

  noteOn(note: number, time: number) {
    this.keyNote = note;
    if (this.playsOwnNotes || this.held.includes(note)) {
      return;
    }
    this.held = [...this.held, note];
    if (!this.clock.running) {
      this.step = 0;
      this.lastNote = undefined;
      // The gates count from the first key pressed, like the steps of the grid.
      this.clockIn.reset();
      this.startClock(time);
    }
  }

  noteOff(note: number) {
    this.held = this.held.filter((held) => held !== note);
    if (this.held.length === 0 && !this.playsOwnNotes) {
      this.clock.stop();
    }
  }

  allNotesOff() {
    this.held = [];
    if (!this.playsOwnNotes) {
      this.clock.stop();
    }
  }

  setParameter(name: string, value: ParamValue) {
    if (!(name in this.params)) {
      unknownParameter("Arp", name);
    }
    if (patternIds("arpeggiator").includes(name)) {
      this.setPatternParameter(FIRST_SLOT, name, value);
      return;
    }
    const followed = this.followsGates;
    this.params = { ...this.params, [name]: value };
    if (followed !== this.followsGates) {
      this.stepOff(this.context.currentTime);
      this.clockIn.reset();
      // The steps scheduled on the other clock are not played any more.
      this.positions = [];
      this.scheduled = [];
    }
    if (name === "source") {
      // The keys held until now no longer count, and its own notes play on their own.
      this.held = [];
      this.lastNote = undefined;
      if (this.playsOwnNotes) {
        this.startClock(this.context.currentTime);
      } else {
        this.clock.stop();
      }
    }
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

  private apply(values: Params) {
    this.params = { ...this.params, ...values };
    if ("notes" in values) {
      this.own = parseNotes(String(values.notes)) ?? this.own;
    }
    if ("rhythm" in values) {
      this.rhythm = parseRhythm(String(values.rhythm)) ?? this.rhythm;
    }
  }

  getNotes(): NoteActivity {
    const now = this.context.currentTime;
    const shift = this.shift;
    const notes = [...new Set(this.arpeggio("up"))].map((note) => note + shift);
    const playing = this.scheduled.findLast((step) => step.start <= now && now < step.end)?.note;
    return { notes, ...(playing !== undefined && { playing: playing + shift }) };
  }

  /** The step of the rhythm it is on while it plays, silent or not. */
  getPosition(): number | undefined {
    if (!this.clock.running) {
      return undefined;
    }
    const now = this.context.currentTime;
    return this.positions.findLast((step) => step.start <= now && now < step.end)?.position;
  }

  dispose() {
    clearTimeout(this.starting);
    this.clock.stop();
    this.stepOff(this.context.currentTime);
    this.pitch.stop();
    this.pitch.disconnect();
  }

  /** With its own notes and its keys param on, the last key pressed moves them, from C4. */
  getKeyTranspose(): number {
    return this.playsOwnNotes && this.params.keys === "transpose" ? this.keyNote - MIDDLE_C : 0;
  }

  /** Semitones added to every note: the transpose, and the octave and keys of its own notes. */
  private get shift() {
    const octave = this.playsOwnNotes ? Number(this.params.octave) : 0;
    return Number(this.params.transpose) + 12 * octave + this.getKeyTranspose();
  }

  private arpeggio(pattern: Pattern) {
    const notes = this.playsOwnNotes ? this.own : this.held;
    return arpeggio(notes, pattern, Number(this.params.span), String(this.params.chord));
  }

  /** The note of this step, from the step of the shared grid; undefined when there are none. */
  private nextNote(gridStep: number): number | undefined {
    const notes = this.arpeggio(this.params.pattern as Pattern);
    if (notes.length === 0) {
      return undefined;
    }
    if (this.playsOwnNotes) {
      // On the grid, like a sequencer: it starts over when the sound starts.
      this.step = this.soundingBefore(gridStep);
    } else {
      // When notes are added or released, carry on from the one that just played.
      const previous = notes[(this.step - 1) % notes.length];
      if (this.lastNote !== undefined && previous !== this.lastNote && notes.includes(this.lastNote)) {
        this.step = notes.indexOf(this.lastNote) + 1;
      }
    }
    let note = notes[this.step % notes.length];
    if (this.params.pattern === "random") {
      const others = notes.length > 1 ? notes.filter((candidate) => candidate !== this.lastNote) : notes;
      note = others[Math.floor(this.random() * others.length)];
    }
    this.step++;
    this.lastNote = note;
    return note;
  }

  private get length() {
    return Math.min(this.rhythm.length, Math.max(1, Number(this.params.length ?? this.rhythm.length)));
  }

  /** The step of the rhythm that a step of the grid falls on. */
  private positionOf(gridStep: number) {
    const local = gridStep - this.ahead;
    return ((local % this.length) + this.length) % this.length;
  }

  /** How many steps have sounded from the start of the pattern on the grid up to `gridStep`, not counting it. */
  private soundingBefore(gridStep: number) {
    const loop = this.rhythm.slice(0, this.length);
    const perLoop = loop.filter(Boolean).length;
    const loops = Math.floor((gridStep - this.ahead) / this.length);
    return loops * perLoop + loop.slice(0, this.positionOf(gridStep)).filter(Boolean).length;
  }

  private get followsGates() {
    return this.params.division === GATE_STEP;
  }

  /**
   * Launches the pattern due on a step and keeps the step to tell where it is: the note it plays,
   * or undefined on a silent step or without notes.
   */
  private enter(time: number, end: number, step: number) {
    const launch = launchOn(this.patterns.launchMode(String(this.params.launch)), this.followsGates);
    const launched = this.patterns.switchAt(launch, this.transport.beatAt(time), this.positionOf(step), this.transport.beatsPerBar);
    if (launched) {
      this.apply(launched);
      this.ahead = this.followsGates ? 0 : this.patterns.stepsAhead(step, beatsPerStep(String(this.params.division)));
    }
    const position = this.positionOf(step);
    this.positions = [
      ...this.positions
        .filter((scheduled) => scheduled.end > this.context.currentTime - 1)
        // A step a gate marked lasts until the next one.
        .map((scheduled) => (scheduled.end === Infinity ? { ...scheduled, end: time } : scheduled)),
      { start: time, end, position },
    ];
    return this.rhythm[position] && !this.patterns.stopped ? this.nextNote(step) : undefined;
  }

  /** A step on a gate into the clock input, while it plays: its note lasts as long as that gate. */
  private stepOn(time: number, step: number) {
    if (!this.followsGates || !this.clock.running) {
      return;
    }
    this.stepOff(time);
    const note = this.enter(time, Infinity, step);
    if (note === undefined) {
      return;
    }
    this.scheduled = [
      ...this.scheduled.filter((scheduled) => scheduled.end > this.context.currentTime - 1),
      { start: time, end: Infinity, note },
    ];
    this.pitch.offset.setValueAtTime((note + this.shift - MIDDLE_C) / 12, time);
    this.gate.gateOn(time);
    this.opened = true;
  }

  private stepOff(time: number) {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.gate.gateOff(time);
    this.scheduled = this.scheduled.map((scheduled) => (scheduled.end === Infinity ? { ...scheduled, end: time } : scheduled));
  }

  private play(note: number, time: number, length: number) {
    this.scheduled = [
      ...this.scheduled.filter((step) => step.end > this.context.currentTime - 1),
      { start: time, end: time + length, note },
    ];
    this.pitch.offset.setValueAtTime((note + this.shift - MIDDLE_C) / 12, time);
    this.gate.gateOn(time);
    this.gate.gateOff(time + length);
  }
}
