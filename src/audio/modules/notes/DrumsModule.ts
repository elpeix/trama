import { FIRST_SLOT, patternIds, type Launch } from "../../../patch/patterns";
import { DRUM_ROWS } from "../../../patch/registry";
import { parseRhythmSteps, type RhythmStep } from "../../../patch/sequence";
import type { Params, ParamValue, Patterns, PatternSlot } from "../../../patch/types";
import type { Transport } from "../../Transport";
import { TriggerBus, unknownParameter, type AudioModule } from "../AudioModule";
import { PatternBank } from "../PatternBank";
import { beatsPerStep, GATE_STEP, GateSteps, launchOn, StepClock } from "../StepClock";
import { soundsThisTime } from "./chance";

const ROWS = DRUM_ROWS.map(({ id }) => id);

/**
 * A row of steps for each drum, in a loop while the audio runs: on each step a row sounds on, it
 * opens its own gate for the Gate of a step. The accent row sets the accent out to 1 on its steps.
 * The position in the loop comes from the shared grid, so it plays in step with the Seq. With its
 * step at "gate", each gate into its clock input plays the next step instead, and the gates of
 * its rows stay open as long as that gate. A step with a chance sounds only when the dice fall
 * under it, each time round, and each row rolls its own. A step with retrigs sounds that many
 * times within itself on the grid, and once on a gate.
 */
export class DrumsModule implements AudioModule {
  private readonly context: BaseAudioContext;
  private readonly transport: Transport;
  private readonly gates = new Map(ROWS.map((row) => [row, new TriggerBus()]));
  private readonly accent: ConstantSourceNode;
  private readonly clock: StepClock;
  private readonly clockIn: GateSteps;
  /** The gates a gate into the clock input opened, until it closes. */
  private readonly opened = new Set<TriggerBus>();
  private readonly patterns: PatternBank;
  private readonly random: () => number;
  private params: Params;
  private rows = new Map<string, RhythmStep[]>();
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
    this.params = {};
    this.apply(params);
    this.patterns = new PatternBank(patternIds("drums"), params, patterns);
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
    const created = context.currentTime;
    this.starting = setTimeout(() => this.clock.start(created));
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "accent" ? this.accent : undefined;
  }

  getTriggerOutput(port: string) {
    return this.gates.get(port);
  }

  getTriggerInput(port: string) {
    return port === "clock" ? this.clockIn : undefined;
  }

  /** The step playing now, counting from 0, or undefined before the first one. */
  getPosition(): number | undefined {
    const now = this.context.currentTime;
    return this.scheduled.findLast((step) => step.start <= now && now < step.end)?.position;
  }

  setParameter(name: string, value: ParamValue) {
    if (!(name in this.params)) {
      unknownParameter("Drums", name);
    }
    if (patternIds("drums").includes(name)) {
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
    this.stepOff(this.context.currentTime);
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
      this.stepOff(this.context.currentTime);
      this.clockIn?.reset();
      // The steps scheduled on the other clock are not played any more.
      this.scheduled = [];
    }
    for (const row of [...ROWS, "accent"]) {
      if (row in values) {
        this.rows.set(row, parseRhythmSteps(String(values[row])) ?? this.rows.get(row) ?? []);
      }
    }
  }

  private positionOf(step: number) {
    const length = Math.max(1, Number(this.params.length));
    const local = step - this.ahead;
    return ((local % length) + length) % length;
  }

  /** Launches the pattern due on a step, keeps the step to tell where it plays, and sets its accent. */
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
        .filter((scheduled) => scheduled.end > this.context.currentTime - 1)
        // A step a gate marked lasts until the next one.
        .map((scheduled) => (scheduled.end === Infinity ? { ...scheduled, end: time } : scheduled)),
      { start: time, end, position },
    ];
    this.accent.offset.setValueAtTime(this.soundsOn("accent", position) ? 1 : 0, time);
    return position;
  }

  /** Whether a row sounds on a step this time round. */
  private soundsOn(row: string, position: number) {
    const step = this.rows.get(row)?.[position];
    return step?.sounds === true && !this.patterns.stopped && soundsThisTime(step.chance, this.random);
  }

  /** The gates of the rows that sound on a step, and how many times each sounds within it. */
  private sounding(position: number) {
    return ROWS.filter((row) => this.soundsOn(row, position)).map((row) => ({
      gate: this.gates.get(row)!,
      retrig: this.rows.get(row)?.[position]?.retrig ?? 1,
    }));
  }

  private play(time: number, duration: number, step: number) {
    for (const { gate, retrig } of this.sounding(this.enter(time, time + duration, step))) {
      const part = duration / retrig;
      for (let hit = 0; hit < retrig; hit++) {
        gate.gateOn(time + hit * part);
        gate.gateOff(time + hit * part + part * Number(this.params.gate));
      }
    }
  }

  private stepOn(time: number, step: number) {
    if (!this.followsGates) {
      return;
    }
    this.stepOff(time);
    for (const { gate } of this.sounding(this.enter(time, Infinity, step))) {
      gate.gateOn(time);
      this.opened.add(gate);
    }
  }

  private stepOff(time: number) {
    this.opened.forEach((gate) => gate.gateOff(time));
    this.opened.clear();
  }
}
