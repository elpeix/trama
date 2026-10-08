import { DEFAULT_VELOCITY, MAX_VELOCITY } from "../../../patch/clip";
import { FIRST_SLOT, patternIds, type Launch } from "../../../patch/patterns";
import { scaleChord } from "../../../patch/scales";
import { parseSequence, type SequenceStep } from "../../../patch/sequence";
import type { Params, ParamValue, Patterns, PatternSlot } from "../../../patch/types";
import { TriggerBus, unknownParameter, type AudioModule, type NoteReceiver } from "../AudioModule";
import type { Transport } from "../../Transport";
import { PatternBank } from "../PatternBank";
import { beatsPerStep, GATE_STEP, GateSteps, launchOn, StepClock } from "../StepClock";
import { soundsThisTime } from "./chance";
import { NoteQueue } from "./noteQueue";

const MIDDLE_C = 60;
const EPSILON = 1e-6;

/** An accented step plays its notes as hard as they go, the others as hard as the computer keys. */
const velocityOfStep = (step: SequenceStep) => (step.accent ? MAX_VELOCITY : DEFAULT_VELOCITY);

/**
 * Plays a row of steps in a loop while the audio runs, with the same outputs as the Keyboard: each
 * step sets the pitch and opens the gate, and a rest leaves the gate closed. The position in the
 * loop comes from the shared grid, so sequencers with the same length play in step. With its keys
 * param on, the last computer key pressed transposes the pattern, from C4, until another one is.
 * It sends its notes too, for the voices of a subpatch, each with the chord of the scale its chord
 * param stacks on it, gliding them into a tied note like the pitch. With its step at "gate", each
 * gate into its clock input plays the next step instead of the grid, for as long as that gate is
 * open, or on to the end of the steps tied to it. A note with a chance sounds only when the dice
 * fall under it, each time round, and the steps tied to a note that does not sound stay silent.
 */
export class SequencerModule implements AudioModule, NoteReceiver {
  private readonly context: BaseAudioContext;
  private readonly pitch: ConstantSourceNode;
  /** 1 while an accented note plays, 0 otherwise. */
  private readonly accent: ConstantSourceNode;
  private readonly gate = new TriggerBus();
  private readonly notes = new NoteQueue();
  private readonly clock: StepClock;
  private readonly clockIn: GateSteps;
  /** The note a gate into the clock input started, while it sounds. */
  private sounding: { position: number; voicing: number[] } | undefined;
  private readonly transport: Transport;
  private readonly patterns: PatternBank;
  private readonly random: () => number;
  private params: Params;
  private steps: SequenceStep[];
  /** Whether the last note that started was left silent by its chance, and the steps tied to it with it. */
  private skipping = false;
  /** The last computer key pressed, kept until another one is. */
  private keyNote = MIDDLE_C;
  /** Steps already scheduled, to tell which one is playing at a given moment. */
  private scheduled: { start: number; end: number; position: number }[] = [];
  /** How many steps the grid is ahead of the pattern playing. */
  private ahead = 0;
  private readonly starting: ReturnType<typeof setTimeout>;

  constructor(
    context: BaseAudioContext,
    params: Params,
    transport: Transport,
    patterns?: Patterns,
    random: () => number = Math.random,
  ) {
    this.context = context;
    this.transport = transport;
    this.random = random;
    this.params = { ...params };
    this.patterns = new PatternBank(patternIds("sequencer"), params, patterns);
    this.steps = parseSequence(String(params.steps)) ?? [];
    this.pitch = context.createConstantSource();
    this.pitch.offset.value = 0;
    this.pitch.start();
    this.accent = context.createConstantSource();
    this.accent.offset.value = 0;
    this.accent.start();
    this.clock = new StepClock(
      context,
      transport,
      () => beatsPerStep(String(this.params.division)),
      (time, duration, step) => {
        if (!this.followsGates) {
          this.play(time, duration, step);
        }
      },
    );
    this.clockIn = new GateSteps(
      transport,
      (time, step) => this.stepOn(time, step),
      (time) => this.stepOff(time),
    );
    // Start once the engine has wired the outputs, so the first step is not lost.
    const created = context.currentTime;
    this.starting = setTimeout(() => this.clock.start(created));
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "pitch" ? this.pitch : port === "accent" ? this.accent : undefined;
  }

  getTriggerOutput(port: string) {
    return port === "gate" ? this.gate : undefined;
  }

  getTriggerInput(port: string) {
    return port === "clock" ? this.clockIn : undefined;
  }

  getNoteOutput(port: string) {
    return port === "notes" ? this.notes.output : undefined;
  }

  /** The step playing now, counting from 0, or undefined before the first one. */
  getPosition(): number | undefined {
    const now = this.context.currentTime;
    return this.scheduled.findLast((step) => step.start <= now && now < step.end)?.position;
  }

  noteOn(note: number) {
    this.keyNote = note;
  }

  noteOff() {}

  allNotesOff() {}

  getKeyTranspose(): number {
    return this.params.keys === "transpose" ? this.keyNote - MIDDLE_C : 0;
  }

  setParameter(name: string, value: ParamValue) {
    if (!(name in this.params)) {
      unknownParameter("Seq", name);
    }
    if (patternIds("sequencer").includes(name)) {
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

  dispose() {
    clearTimeout(this.starting);
    this.clock.stop();
    this.release(this.context.currentTime);
    this.notes.stop(this.context.currentTime);
    this.pitch.stop();
    this.pitch.disconnect();
    this.accent.stop();
    this.accent.disconnect();
  }

  private get followsGates() {
    return this.params.division === GATE_STEP;
  }

  private apply(values: Params) {
    const followed = this.followsGates;
    this.params = { ...this.params, ...values };
    if (followed !== this.followsGates) {
      // A note a gate started does not wait for its end once the grid takes over, and the gates start over.
      this.release(this.context.currentTime);
      this.clockIn.reset();
      // The steps scheduled on the other clock are not played any more.
      this.scheduled = [];
    }
    if ("steps" in values) {
      this.steps = parseSequence(String(values.steps)) ?? this.steps;
    }
  }

  private get length() {
    return Math.max(1, Math.min(this.steps.length, Number(this.params.length)));
  }

  private positionOf(step: number) {
    const local = step - this.ahead;
    return ((local % this.length) + this.length) % this.length;
  }

  /** Whether the step before `position` sounds a note, itself or through the ties before it. */
  private holding(position: number) {
    for (let index = position - 1; index >= 0; index--) {
      const step = this.steps[index];
      if (!step.tie) {
        return step.note !== null;
      }
    }
    return false;
  }

  /** How many steps after `position` are tied to it, up to the end of the length. */
  private tiesAfter(position: number) {
    let ties = 0;
    while (position + ties + 1 < this.length && this.steps[position + ties + 1]?.tie) {
      ties++;
    }
    return ties;
  }

  /**
   * Sends the notes of a note that starts on `position`, with the chord of the scale on it, for the
   * whole run of steps tied to it: each tied note glides the notes into its own chord, note for
   * note, and the gate of the last step ends them.
   */
  private sendRun(position: number, time: number, duration: number, shift: number) {
    const chordOf = (note: number) => this.chordOf(note, shift);
    const glide = Number(this.params.glide) / 1000;
    const ties = this.tiesAfter(position);
    let voicing = chordOf(this.steps[position].note!);
    const velocity = velocityOfStep(this.steps[position]);
    voicing.forEach((note) => this.notes.on(note, time, velocity));
    for (let tied = 1; tied <= ties; tied++) {
      const note = this.steps[position + tied].note;
      if (note !== null) {
        const next = chordOf(note);
        voicing.forEach((from, index) => this.notes.glide(from, next[index], time + tied * duration, glide));
        voicing = next;
      }
    }
    voicing.forEach((note) => this.notes.off(note, time + duration * (ties + Number(this.params.gate))));
  }

  private play(time: number, duration: number, step: number) {
    this.playStep(time, duration, step);
    this.notes.send(time + duration - EPSILON);
  }

  /** Launches the pattern due on a step, and keeps the step to tell where it plays; its position. */
  private enter(time: number, end: number, step: number) {
    const launch = launchOn(this.patterns.launchMode(String(this.params.launch)), this.followsGates);
    const launched = this.patterns.switchAt(launch, this.transport.beatAt(time), this.positionOf(step), this.transport.beatsPerBar);
    if (launched) {
      this.apply(launched);
      this.ahead = this.followsGates ? 0 : this.patterns.stepsAhead(step, beatsPerStep(String(this.params.division)));
    }
    const position = this.positionOf(step);
    this.scheduled = [
      ...this.scheduled
        .filter((step) => step.end > this.context.currentTime - 1)
        // A step a gate marked lasts until the next one.
        .map((step) => (step.end === Infinity ? { ...step, end: time } : step)),
      { start: time, end, position },
    ];
    return position;
  }

  private playStep(time: number, duration: number, step: number) {
    const position = this.enter(time, time + duration, step);
    const current = this.steps[position];
    if (!current || current.note === null || this.patterns.stopped) {
      return;
    }
    const tiedIn = current.tie && this.holding(position);
    if (!tiedIn) {
      this.skipping = !soundsThisTime(current.chance, this.random);
    }
    if (this.skipping) {
      return;
    }
    const shift = this.getKeyTranspose() + 12 * Number(this.params.octave);
    const pitch = (current.note + shift - MIDDLE_C) / 12;
    this.accent.offset.setValueAtTime(current.accent ? 1 : 0, time);
    if (tiedIn) {
      const glide = Number(this.params.glide) / 1000;
      if (glide > 0) {
        this.pitch.offset.setTargetAtTime(pitch, time, glide / 3);
      } else {
        this.pitch.offset.setValueAtTime(pitch, time);
      }
      return;
    }
    this.sendRun(position, time, duration, shift);
    this.pitch.offset.setValueAtTime(pitch, time);
    this.gate.gateOn(time);
    this.gate.gateOff(time + duration * (this.tiesAfter(position) + Number(this.params.gate)));
  }

  /**
   * A step on a gate into the clock input: its note starts, or glides on from the one sounding when
   * tied to it. It ends with its gate, unless the next step is tied to it.
   */
  private stepOn(time: number, step: number) {
    if (!this.followsGates) {
      return;
    }
    const position = this.enter(time, Infinity, step);
    const current = this.steps[position];
    if (current && !current.tie) {
      this.skipping = current.note !== null && !soundsThisTime(current.chance, this.random);
    }
    if (this.skipping || this.patterns.stopped) {
      this.release(time);
      return;
    }
    if (!current || current.note === null) {
      // A tie without a note of its own holds the one sounding; a rest ends it, if still on.
      if (current?.tie && this.sounding) {
        this.sounding = { ...this.sounding, position };
      } else {
        this.release(time);
      }
      return;
    }
    const shift = this.getKeyTranspose() + 12 * Number(this.params.octave);
    const pitch = (current.note + shift - MIDDLE_C) / 12;
    const voicing = this.chordOf(current.note, shift);
    this.accent.offset.setValueAtTime(current.accent ? 1 : 0, time);
    if (current.tie && this.sounding) {
      const glide = Number(this.params.glide) / 1000;
      if (glide > 0) {
        this.pitch.offset.setTargetAtTime(pitch, time, glide / 3);
      } else {
        this.pitch.offset.setValueAtTime(pitch, time);
      }
      this.sounding.voicing.forEach((from, index) => this.notes.glide(from, voicing[index], time, glide));
      this.sounding = { position, voicing };
      this.notes.send(time + EPSILON);
      return;
    }
    this.release(time);
    voicing.forEach((note) => this.notes.on(note, time, velocityOfStep(current)));
    this.pitch.offset.setValueAtTime(pitch, time);
    this.gate.gateOn(time);
    this.sounding = { position, voicing };
    this.notes.send(time + EPSILON);
  }

  private stepOff(time: number) {
    const next = this.sounding && this.sounding.position + 1;
    if (next === undefined || (next < this.length && this.steps[next]?.tie)) {
      return;
    }
    this.release(time);
  }

  /** Ends the note a gate into the clock input started, if one sounds. */
  private release(time: number) {
    if (!this.sounding) {
      return;
    }
    this.gate.gateOff(time);
    this.sounding.voicing.forEach((note) => this.notes.off(note, time));
    this.notes.send(time + EPSILON);
    this.sounding = undefined;
  }

  private chordOf(note: number, shift: number) {
    return scaleChord(note, String(this.params.chord), String(this.params.scale), String(this.params.root)).map(
      (chordNote) => chordNote + shift,
    );
  }
}
