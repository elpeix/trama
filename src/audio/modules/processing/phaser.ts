import { PHASER_MAX_STAGES } from "../../../patch/effects";
import { SineLfo } from "./modulatedDelay";

/** How far the LFO sweeps the stages at full Depth, in octaves each way. */
const SWEEP_OCTAVES = 2;

export interface PhaserSettings {
  rate: number;
  depth: number;
  /** In Hz. */
  frequency: number;
  stages: number;
  feedback: number;
  mix: number;
}

/**
 * A chain of first-order allpass stages, which turn the phase of a sound and leave its level,
 * swept by an LFO around Freq, and mixed with the dry sound: where the two are out of phase they
 * cancel, a notch for each two stages. Feedback sends the end of the chain back into it.
 */
export class Phaser {
  private readonly sampleRate: number;
  private readonly lfo: SineLfo;
  private readonly inputs = new Float32Array(PHASER_MAX_STAGES);
  private readonly outputs = new Float32Array(PHASER_MAX_STAGES);
  private last = 0;

  constructor(sampleRate: number, phase = 0) {
    this.sampleRate = sampleRate;
    this.lfo = new SineLfo(sampleRate, phase);
  }

  process(input: Float32Array | undefined, output: Float32Array, settings: PhaserSettings) {
    const stages = Math.min(PHASER_MAX_STAGES, Math.max(2, 2 * Math.round(settings.stages / 2)));
    const highest = this.sampleRate * 0.45;
    for (let index = 0; index < output.length; index++) {
      const dry = input ? input[index] : 0;
      const frequency = Math.min(highest, settings.frequency * 2 ** (SWEEP_OCTAVES * settings.depth * this.lfo.at()));
      const tangent = Math.tan((Math.PI * frequency) / this.sampleRate);
      const coefficient = (tangent - 1) / (tangent + 1);
      let sample = dry + settings.feedback * this.last;
      for (let stage = 0; stage < stages; stage++) {
        const shifted = coefficient * sample + this.inputs[stage] - coefficient * this.outputs[stage];
        this.inputs[stage] = sample;
        this.outputs[stage] = shifted;
        sample = shifted;
      }
      this.last = sample;
      this.lfo.advance(settings.rate);
      output[index] = dry * (1 - settings.mix) + sample * settings.mix;
    }
  }
}
