import { FLANGER_MAX_DELAY_MS } from "../../../patch/effects";
import { DelayLine, SineLfo } from "./modulatedDelay";

export interface FlangerSettings {
  rate: number;
  depth: number;
  /** In milliseconds. */
  delay: number;
  feedback: number;
  mix: number;
}

/**
 * A copy of a sound a few milliseconds late, swept by an LFO by up to Depth times Delay each way,
 * and fed back into itself: the comb of notches that sweeps up and down. It never reads less than
 * a sample back, so the feedback always has something to feed.
 */
export class Flanger {
  private readonly sampleRate: number;
  private readonly line: DelayLine;
  private readonly lfo: SineLfo;

  constructor(sampleRate: number, phase = 0) {
    this.sampleRate = sampleRate;
    this.line = new DelayLine(Math.ceil((sampleRate * FLANGER_MAX_DELAY_MS * 2) / 1000) + 4);
    this.lfo = new SineLfo(sampleRate, phase);
  }

  process(input: Float32Array | undefined, output: Float32Array, settings: FlangerSettings) {
    const delay = (settings.delay * this.sampleRate) / 1000;
    for (let index = 0; index < output.length; index++) {
      const dry = input ? input[index] : 0;
      const wet = this.line.read(delay * (1 + settings.depth * this.lfo.at()));
      this.line.write(dry + settings.feedback * wet);
      this.lfo.advance(settings.rate);
      output[index] = dry * (1 - settings.mix) + wet * settings.mix;
    }
  }
}
