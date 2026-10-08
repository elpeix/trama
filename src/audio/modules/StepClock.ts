import type { Transport } from "../Transport";
import type { TriggerInput } from "./AudioModule";

/** How far ahead steps are scheduled on the audio clock, and how often the scheduler wakes up. */
const LOOKAHEAD_SECONDS = 0.1;
const TICK_MS = 25;
/** Rounding slack when comparing beat positions. */
const EPSILON = 1e-6;

export const BEATS_PER_STEP: Record<string, number> = { "1/4": 1, "1/8": 1 / 2, "1/16": 1 / 4, "1/32": 1 / 8 };

export const beatsPerStep = (division: string) => BEATS_PER_STEP[division] ?? 1 / 4;

/** The step option that follows the gates of the clock input instead of the grid. */
export const GATE_STEP = "gate";

/**
 * On a clock that follows gates there is no bar to wait for: a pattern launched for the next bar
 * takes over when the one playing starts over instead.
 */
export const launchOn = (launch: string, followsGates: boolean) => (followsGates && launch === "bar" ? "end" : launch);

/**
 * Steps marked by the gates that reach a clock input instead of by the grid: one step on each gate,
 * which lasts until it closes. They count from the first gate after the transport restarts, or
 * after `reset`, so that they start over with the sound like the steps of the grid.
 */
export class GateSteps implements TriggerInput {
  private readonly transport: Transport;
  private readonly onStep: (time: number, step: number) => void;
  private readonly onEnd: (time: number) => void;
  private count = 0;
  private generation: number;

  constructor(transport: Transport, onStep: (time: number, step: number) => void, onEnd: (time: number) => void) {
    this.transport = transport;
    this.onStep = onStep;
    this.onEnd = onEnd;
    this.generation = transport.generation;
  }

  reset() {
    this.count = 0;
  }

  gateOn(time: number) {
    if (this.generation !== this.transport.generation) {
      this.generation = this.transport.generation;
      this.count = 0;
    }
    this.onStep(time, this.count++);
  }

  gateOff(time: number) {
    this.onEnd(time);
  }
}

/**
 * Calls `onStep` on every step of the shared beat grid while running, with the step's audio time,
 * its length in seconds and its number on the grid (step 0 is the first beat of the transport).
 * With swing, a step on a sixteenth between two eighths comes later and is shorter, and the one
 * before it longer, so that they still fill the pair, unless the clock is told to keep straight.
 *
 * Steps are scheduled a little ahead, so a timer that fires late does not make them late. After a
 * long pause (a hidden tab, a suspended context) it joins the grid again from now instead of
 * catching up; after a restart of the transport it joins from the moment of the restart, so its
 * first step is the first beat even if this clock only hears about it a little later.
 */
export class StepClock {
  private readonly transport: Transport;
  private readonly context: BaseAudioContext;
  private readonly stepBeats: () => number;
  private readonly onStep: (time: number, duration: number, step: number) => void;
  private readonly swing: boolean;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextBeat = 0;
  /** The beat the steps are counted from: the first beat of the transport, or where it started. */
  private origin = 0;
  private generation = -1;

  constructor(
    context: BaseAudioContext,
    transport: Transport,
    stepBeats: () => number,
    onStep: (time: number, duration: number, step: number) => void,
    { swing = true }: { swing?: boolean } = {},
  ) {
    this.context = context;
    this.transport = transport;
    this.stepBeats = stepBeats;
    this.onStep = onStep;
    this.swing = swing;
  }

  get running() {
    return this.timer !== undefined;
  }

  /** Starts on the first step of the grid at or after `time`; with "now", a step falls on `time`. */
  start(time: number, from: "grid" | "now" = "grid") {
    this.stop();
    this.origin = from === "now" ? this.transport.beatAt(time) : 0;
    this.join(time);
    this.tick();
    this.timer = setInterval(this.tick, TICK_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private join(time: number) {
    const size = this.stepBeats();
    this.nextBeat = this.onGrid(this.transport.beatAt(time), size);
    this.generation = this.transport.generation;
  }

  private tick = () => {
    if (this.transport.paused) {
      return;
    }
    const now = this.context.currentTime;
    const restarted = this.generation !== this.transport.generation;
    if (restarted || this.transport.timeAt(this.nextBeat) < now - LOOKAHEAD_SECONDS) {
      if (restarted) {
        // Everything counts from the restart again, even a clock that had started on its own.
        this.origin = 0;
      }
      // The restart is the first beat: joining from there, and not from the moment this tick runs,
      // keeps the first step from being pushed to the next one.
      this.join(restarted ? Math.max(this.transport.timeAt(0), now - LOOKAHEAD_SECONDS) : now);
    }
    // If the division just changed, the next step moves to the new grid.
    this.nextBeat = this.onGrid(this.nextBeat, this.stepBeats());
    while (this.transport.timeAt(this.nextBeat) < now + LOOKAHEAD_SECONDS) {
      const size = this.stepBeats();
      const step = Math.round((this.nextBeat - this.origin) / size);
      const late = this.swing ? this.transport.swingAt(this.nextBeat) : 0;
      const nextLate = this.swing ? this.transport.swingAt(this.nextBeat + size) : 0;
      const secondsPerBeat = this.transport.secondsPerBeat();
      this.onStep(this.transport.timeAt(this.nextBeat) + late * secondsPerBeat, (size + nextLate - late) * secondsPerBeat, step);
      this.nextBeat = this.onGrid(this.nextBeat + size, size);
    }
  };

  /** The first beat of a step at or after `beat`, counting from the origin. */
  private onGrid(beat: number, size: number) {
    // `+ 0` turns -0 into 0.
    return this.origin + Math.ceil((beat - this.origin) / size - EPSILON) * size + 0;
  }
}
