import { FIRST_SLOT, OTHER_SLOTS, patternOf, STOP, type Launch } from "../../patch/patterns";
import type { Params, ParamValue, Patterns, PatternSlot } from "../../patch/types";
import type { PatternState } from "./AudioModule";

const EPSILON = 1e-6;

/**
 * The patterns of a node, the one it plays and the one launched to take over, and when that
 * happens: on the next step, on the first beat of a bar, or when the one playing starts over. A
 * stop launched silences the node when due, until a pattern is launched again.
 */
export class PatternBank {
  private readonly slots: Record<PatternSlot, Params>;
  private playing: PatternSlot = FIRST_SLOT;
  private queued: Launch | undefined;
  private silent = false;
  private queuedMode: string | undefined;
  private queuedAt: number | undefined;
  private taken: number | undefined;

  constructor(ids: readonly string[], params: Params, patterns: Patterns = {}) {
    const first = patternOf(params, ids);
    this.slots = {
      A1: first,
      ...(Object.fromEntries(OTHER_SLOTS.map((slot) => [slot, { ...first, ...patterns[slot] }])) as Record<
        Exclude<PatternSlot, "A1">,
        Params
      >),
    };
  }

  values(slot: PatternSlot): Params {
    return this.slots[slot];
  }

  /** Changes a value of a pattern; true when it is the one playing. */
  set(slot: PatternSlot, name: string, value: ParamValue): boolean {
    this.slots[slot] = { ...this.slots[slot], [name]: value };
    return slot === this.playing;
  }

  get stopped(): boolean {
    return this.silent;
  }

  /**
   * Queues a pattern, or a stop, to take over; with `mode`, when it does, instead of the Launch of
   * the node. With `at`, it takes over on that beat of the pattern, starting it over if it plays;
   * without, it goes on from where the grid is.
   */
  launch(slot: Launch, mode?: string, at?: number) {
    const current = this.silent ? STOP : this.playing;
    this.queued = slot === current && at === undefined ? undefined : slot;
    this.queuedMode = this.queued ? mode : undefined;
    this.queuedAt = this.queued ? at : undefined;
  }

  /** The beat of the pattern the one playing took over on, when it was launched for one. */
  get into(): number | undefined {
    return this.taken;
  }

  /** How many steps of `stepBeats` the grid is ahead of the pattern that took over on `step`: none without a place. */
  stepsAhead(step: number, stepBeats: number): number {
    return this.taken === undefined ? 0 : step - Math.round(this.taken / stepBeats);
  }

  /** When the pattern launched takes over: as the launch said, or as `mode`, the Launch of the node. */
  launchMode(mode: string): string {
    return this.queuedMode ?? mode;
  }

  state(): PatternState {
    return { playing: this.playing, ...(this.queued && { queued: this.queued }), ...(this.silent && { stopped: true }) };
  }

  /**
   * On a step at `beat`, on `position` of the pattern playing: the values of the pattern launched
   * if it takes over now, or undefined; a stop due silences the node.
   */
  switchAt(mode: string, beat: number, position: number, beatsPerBar: number): Params | undefined {
    if (!this.queued) {
      return undefined;
    }
    const due =
      mode === "now" ||
      (mode === "end" && position === 0) ||
      (mode === "bar" && Math.abs(beat / beatsPerBar - Math.round(beat / beatsPerBar)) < EPSILON);
    if (!due) {
      return undefined;
    }
    const queued = this.queued;
    this.taken = this.queuedAt;
    this.queued = undefined;
    this.queuedMode = undefined;
    this.queuedAt = undefined;
    this.silent = queued === STOP;
    if (queued === STOP) {
      return undefined;
    }
    this.playing = queued;
    return this.slots[this.playing];
  }
}
