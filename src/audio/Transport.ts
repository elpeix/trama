import { beatsPerBar, DEFAULT_METER, type Meter } from "../patch/meter";
import { DEFAULT_SWING, DEFAULT_SWING_GRID, DEFAULT_TEMPO, type SwingGrid } from "../patch/types";

const SWING_STEP_BEATS: Record<SwingGrid, number> = { "1/16": 1 / 4, "1/8": 1 / 2 };
const EPSILON = 1e-6;

/**
 * The shared musical clock: turns audio time into beats at the tempo of the patch. Everything that
 * steps to a beat reads it, so arpeggiators and sequencers stay on the same grid.
 */
export class Transport {
  private readonly context: BaseAudioContext;
  private anchorTime = 0;
  private anchorBeat = 0;
  private bpm = DEFAULT_TEMPO;
  private swingAmount = DEFAULT_SWING;
  private swingSteps: SwingGrid = DEFAULT_SWING_GRID;
  private meterGroups: Meter = DEFAULT_METER;
  /** Changes on every restart, so clocks know their next step is no longer valid. */
  generation = 0;
  private isPaused = false;
  private readonly listeners = new Set<() => void>();

  constructor(context: BaseAudioContext, tempo = DEFAULT_TEMPO) {
    this.context = context;
    this.bpm = tempo;
  }

  get tempo() {
    return this.bpm;
  }

  /** Whether the sound is stopped: the clocks plan no step until the next restart. */
  get paused() {
    return this.isPaused;
  }

  pause() {
    this.isPaused = true;
  }

  /** Changes the tempo from now on; the beats already played keep their times. */
  setTempo(tempo: number) {
    const now = this.context.currentTime;
    this.anchorBeat = this.beatAt(now);
    this.anchorTime = now;
    this.bpm = tempo;
    this.listeners.forEach((listener) => listener());
  }

  get swing() {
    return this.swingAmount;
  }

  setSwing(swing: number) {
    this.swingAmount = swing;
  }

  get swingGrid() {
    return this.swingSteps;
  }

  setSwingGrid(grid: SwingGrid) {
    this.swingSteps = grid;
  }

  get meter() {
    return this.meterGroups;
  }

  /** Bars are counted in these beats from the first beat of the transport. */
  get beatsPerBar() {
    return beatsPerBar(this.meterGroups);
  }

  setMeter(meter: Meter) {
    this.meterGroups = meter;
    this.listeners.forEach((listener) => listener());
  }

  /**
   * How many beats a step on `beat` is held back by the swing: only those on the sixteenths between
   * the eighths are, or on the eighths between the beats when the swing is on the eighths. A moment
   * within `near` beats of one of those steps is held back as much.
   */
  swingAt(beat: number, near = 0) {
    const step = SWING_STEP_BEATS[this.swingSteps];
    const nearest = Math.round(beat / step);
    if (Math.abs(beat - nearest * step) > near + EPSILON || Math.abs(nearest) % 2 === 0) {
      return 0;
    }
    return ((this.swingAmount - DEFAULT_SWING) / 100) * 2 * step;
  }

  /** Makes `time` the first beat again. */
  restart(time = this.context.currentTime) {
    this.isPaused = false;
    this.anchorTime = time;
    this.anchorBeat = 0;
    this.generation++;
    this.listeners.forEach((listener) => listener());
  }

  /** Calls `listener` whenever the tempo or the meter changes, or the transport restarts. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  beatAt(time: number) {
    return this.anchorBeat + ((time - this.anchorTime) * this.bpm) / 60;
  }

  timeAt(beat: number) {
    return this.anchorTime + ((beat - this.anchorBeat) * 60) / this.bpm;
  }

  secondsPerBeat() {
    return 60 / this.bpm;
  }
}
