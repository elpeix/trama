import { CHORUS_MAX_DELAY_MS, CHORUS_MAX_VOICES } from "../../../patch/effects";
import { DelayLine, SineLfo } from "./modulatedDelay";

export interface ChorusSettings {
  rate: number;
  depth: number;
  /** In milliseconds. */
  delay: number;
  voices: number;
  mix: number;
}

/**
 * Copies of a sound a few milliseconds late, each swept by the same LFO a different part of its
 * cycle: up to half of Delay each way at full Depth. The copies are averaged, so the level stays
 * the same however many voices, and mixed with the dry sound.
 */
export class Chorus {
  private readonly sampleRate: number;
  private readonly line: DelayLine;
  private readonly lfo: SineLfo;

  constructor(sampleRate: number, phase = 0) {
    this.sampleRate = sampleRate;
    this.line = new DelayLine(Math.ceil((sampleRate * CHORUS_MAX_DELAY_MS * 1.5) / 1000) + 4);
    this.lfo = new SineLfo(sampleRate, phase);
  }

  process(input: Float32Array | undefined, output: Float32Array, settings: ChorusSettings) {
    const voices = Math.min(CHORUS_MAX_VOICES, Math.max(1, Math.round(settings.voices)));
    const delay = (settings.delay * this.sampleRate) / 1000;
    for (let index = 0; index < output.length; index++) {
      const dry = input ? input[index] : 0;
      let wet = 0;
      for (let voice = 0; voice < voices; voice++) {
        wet += this.line.read(delay * (1 + 0.5 * settings.depth * this.lfo.at(voice / voices)));
      }
      this.line.write(dry);
      this.lfo.advance(settings.rate);
      output[index] = dry * (1 - settings.mix) + (wet / voices) * settings.mix;
    }
  }
}
