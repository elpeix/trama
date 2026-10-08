export const CEILING = 10 ** (-0.3 / 20);

const RELEASE_SECONDS = 0.1;
const LOUDNESS_SECONDS = 0.05;
const RUNAWAY_LEVEL = 4;
const RUNAWAY_SECONDS = 0.5;

/**
 * Keeps a stereo sound under CEILING, both sides brought down together, with no lookahead. It goes
 * quiet for good when the sound is not a number, or stays far above the ceiling for a while, as a
 * feedback loop that runs away does, until it is unmuted.
 */
export class OutputLimiter {
  enabled = true;
  private envelope = 0;
  private loudness = 0;
  private loudSamples = 0;
  private quiet = false;
  private readonly release: number;
  private readonly smoothing: number;
  private readonly runawaySamples: number;

  constructor(sampleRate: number) {
    this.release = Math.exp(-1 / (RELEASE_SECONDS * sampleRate));
    this.smoothing = 1 - Math.exp(-1 / (LOUDNESS_SECONDS * sampleRate));
    this.runawaySamples = RUNAWAY_SECONDS * sampleRate;
  }

  get muted() {
    return this.enabled && this.quiet;
  }

  unmute() {
    this.quiet = false;
    this.envelope = 0;
    this.loudness = 0;
    this.loudSamples = 0;
  }

  /** Fills `outputs` from `inputs`, a mono input reaching every side; true on the block it goes quiet. */
  process(inputs: readonly (Float32Array | undefined)[], outputs: readonly Float32Array[]) {
    if (!this.enabled) {
      this.unmute();
      outputs.forEach((output, side) => output.set(inputs[side] ?? inputs[0] ?? new Float32Array(output.length)));
      return false;
    }
    const wasQuiet = this.quiet;
    const frames = outputs[0]?.length ?? 0;
    for (let frame = 0; frame < frames; frame++) {
      let peak = 0;
      let power = 0;
      let finite = true;
      for (let side = 0; side < outputs.length; side++) {
        const sample = (inputs[side] ?? inputs[0])?.[frame] ?? 0;
        finite &&= Number.isFinite(sample);
        peak = Math.max(peak, Math.abs(sample));
        power = Math.max(power, sample * sample);
      }
      if (!finite) {
        this.quiet = true;
      } else {
        this.loudness += (power - this.loudness) * this.smoothing;
        this.loudSamples = this.loudness > RUNAWAY_LEVEL ** 2 ? this.loudSamples + 1 : 0;
        this.quiet ||= this.loudSamples >= this.runawaySamples;
      }
      if (this.quiet) {
        outputs.forEach((output) => output.fill(0, frame));
        break;
      }
      this.envelope = Math.max(peak, this.envelope * this.release);
      const gain = this.envelope > CEILING ? CEILING / this.envelope : 1;
      for (let side = 0; side < outputs.length; side++) {
        outputs[side][frame] = ((inputs[side] ?? inputs[0])?.[frame] ?? 0) * gain;
      }
    }
    return this.quiet && !wasQuiet;
  }
}
