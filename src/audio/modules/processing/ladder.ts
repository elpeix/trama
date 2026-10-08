export interface LadderSettings {
  frequency: number | Float32Array;
  /** Cents, which the cables into the frequency reach it in. */
  detune: number | Float32Array;
  /** From 0 to 1, where it sings on its own. */
  resonance: number | Float32Array;
  /** From 0 to 1: how hard the sound is pushed into the saturation at its input. */
  drive: number;
}

const STAGES = 4;
/** The feedback at full resonance: a little past where the filter would hold a steady tone, so that it starts singing. */
const MAX_FEEDBACK = 4.2;
/** How much louder the sound reaches the saturation at full drive. */
const MAX_DRIVE_GAIN = 10;
/** The highest frequency it keeps steady at, as a share of the sample rate. */
const TOP = 0.45;

const at = (value: number | Float32Array, frame: number) =>
  typeof value === "number" ? value : value.length > 1 ? value[frame] : value[0];

/**
 * The low-pass of a Moog: four one-pole stages of 6 dB an octave in a row, 24 in all, with the
 * output fed back to the input for the resonance. Each stage is a zero-delay filter, so that the
 * frequency stays true up high and the loop is solved within the frame; the input saturates, which
 * the drive pushes into and which holds the singing of full resonance at a steady level.
 */
export class Ladder {
  private readonly sampleRate: number;
  private readonly states = new Float64Array(STAGES);

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  process(input: Float32Array | undefined, output: Float32Array, settings: LadderSettings) {
    const driveGain = 1 + (MAX_DRIVE_GAIN - 1) * Math.max(0, Math.min(1, settings.drive));
    for (let frame = 0; frame < output.length; frame++) {
      const frequency = Math.min(TOP * this.sampleRate, at(settings.frequency, frame) * 2 ** (at(settings.detune, frame) / 1200));
      const resonance = Math.max(0, Math.min(1, at(settings.resonance, frame)));
      const warped = Math.tan((Math.PI * Math.max(1, frequency)) / this.sampleRate);
      const share = warped / (1 + warped);
      const feedback = MAX_FEEDBACK * resonance;
      let held = 0;
      for (let stage = 0; stage < STAGES; stage++) {
        held = share * held + (1 - share) * this.states[stage];
      }
      const loop = share ** STAGES;
      const driven = (input?.[frame] ?? 0) * driveGain;
      let signal = Math.tanh((driven - feedback * held) / (1 + feedback * loop));
      for (let stage = 0; stage < STAGES; stage++) {
        const change = (signal - this.states[stage]) * share;
        signal = change + this.states[stage];
        this.states[stage] = signal + change;
      }
      output[frame] = signal;
    }
  }
}
