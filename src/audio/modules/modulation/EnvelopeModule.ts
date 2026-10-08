import type { Params, ParamValue } from "../../../patch/types";
import { unknownParameter, type AudioModule, type TriggerInput } from "../AudioModule";

/** The pieces an exponential stage is drawn with, and how sharply it bends. */
const CURVE_STEPS = 16;
const CURVE_BEND = 5;

/** How far an exponential stage has gone at `progress` (0 to 1): fast at first, slower near the end, and there on time. */
const curved = (progress: number) => (1 - Math.exp(-CURVE_BEND * progress)) / (1 - Math.exp(-CURVE_BEND));

/** How long each burst of a clap lasts before the next hand, in spreads, a little uneven, and how fast it hits. */
const CLAP_BURSTS = [1.1, 0.9, 1.2];
const CLAP_HIT = 0.001;
const CLAP_SPREAD = 0.01;

interface Breakpoint {
  time: number;
  value: number;
}

/**
 * The level is a line through breakpoints, each reached with a linear ramp. Keeping them here lets a
 * gate scheduled ahead of time (by an arpeggiator, say) start from the level the envelope will have
 * then, not the one it has now. With the exponential curve each stage is drawn with short ramps
 * along the curve, like the charge of a capacitor in an analog envelope.
 */
export class EnvelopeModule implements AudioModule, TriggerInput {
  private readonly source: ConstantSourceNode;
  private breakpoints: Breakpoint[] = [{ time: 0, value: 0 }];
  private attack: number;
  private decay: number;
  private sustain: number;
  private release: number;
  private curve: string;
  private spread: number;

  constructor(context: BaseAudioContext, params: Params) {
    this.attack = Number(params.attack);
    this.decay = Number(params.decay);
    this.sustain = Number(params.sustain);
    this.release = Number(params.release);
    this.curve = String(params.curve ?? "linear");
    this.spread = Number(params.spread ?? CLAP_SPREAD);

    this.source = context.createConstantSource();
    this.source.offset.value = 0;
    this.source.start();
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "out" ? this.source : undefined;
  }

  getTriggerInput(port: string) {
    return port === "gate" ? this : undefined;
  }

  gateOn(time: number) {
    this.holdAt(time);
    const start = this.curve === "clap" ? this.clapFrom(time) : time;
    this.stageTo(1, start + this.attack);
    this.stageTo(this.sustain, start + this.attack + this.decay);
  }

  gateOff(time: number) {
    this.holdAt(time);
    this.stageTo(0, time + this.release);
  }

  setParameter(name: string, value: ParamValue) {
    switch (name) {
      case "attack":
        this.attack = Number(value);
        return;
      case "decay":
        this.decay = Number(value);
        return;
      case "sustain":
        this.sustain = Number(value);
        return;
      case "release":
        this.release = Number(value);
        return;
      case "curve":
        this.curve = String(value);
        return;
      case "spread":
        this.spread = Number(value);
        return;
      default:
        unknownParameter("ADSR", name);
    }
  }

  dispose() {
    this.source.stop();
    this.source.disconnect();
  }

  /** Drops everything planned from `time` on, keeping the line that led there. */
  private holdAt(time: number) {
    const value = this.valueAt(time);
    const before = this.breakpoints.filter((point) => point.time < time).at(-1);
    this.breakpoints = before ? [before] : [];
    const level = this.source.offset;
    level.cancelScheduledValues(time);
    this.rampTo(value, time);
  }

  /** Hits and lets die away each burst of the clap from `time`, and returns when the last one is over. */
  private clapFrom(time: number) {
    let start = time;
    for (const length of CLAP_BURSTS.map((burst) => burst * this.spread)) {
      this.rampTo(1, start + CLAP_HIT);
      this.stageTo(0, start + length);
      start += length;
    }
    return start;
  }

  /** Goes from the last breakpoint to `value` by `time`, in a line or along the curve. */
  private stageTo(value: number, time: number) {
    const from = this.breakpoints.at(-1)!;
    if (this.curve === "linear" || time <= from.time) {
      this.rampTo(value, time);
      return;
    }
    for (let step = 1; step < CURVE_STEPS; step++) {
      const progress = step / CURVE_STEPS;
      this.rampTo(from.value + (value - from.value) * curved(progress), from.time + (time - from.time) * progress);
    }
    this.rampTo(value, time);
  }

  private rampTo(value: number, time: number) {
    this.source.offset.linearRampToValueAtTime(value, time);
    this.breakpoints.push({ time, value });
  }

  private valueAt(time: number) {
    const next = this.breakpoints.findIndex((point) => point.time > time);
    if (next === -1) {
      return this.breakpoints.at(-1)?.value ?? 0;
    }
    if (next === 0) {
      return this.breakpoints[0].value;
    }
    const from = this.breakpoints[next - 1];
    const to = this.breakpoints[next];
    return from.value + ((to.value - from.value) * (time - from.time)) / (to.time - from.time);
  }
}
