export interface ShifterSettings {
  /** In semitones. */
  shift: number;
  /** In milliseconds: how long each of the two taps reads before fading into the other. */
  window: number;
  /** From 0, only the sound it gets, to 1, only the shifted one. */
  mix: number;
}

const LONGEST_WINDOW = 0.25;

/**
 * Shifts the pitch with a delay line read by two taps that drift against the writing, faster to
 * go up and slower to go down. Each tap jumps back when it reaches the end of the window, while
 * the other one, half a window away, carries the sound: they fade into each other so the jumps
 * are not heard.
 */
export class PitchShifter {
  private readonly sampleRate: number;
  private readonly line: Float32Array;
  private written = 0;
  private phase = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.line = new Float32Array(Math.ceil(sampleRate * LONGEST_WINDOW) + 2);
  }

  process(input: Float32Array | undefined, output: Float32Array, settings: ShifterSettings) {
    const { mix } = settings;
    const size = this.line.length;
    const window = Math.min(size - 2, Math.max(2, (settings.window / 1000) * this.sampleRate));
    const drift = (1 - 2 ** (settings.shift / 12)) / window;
    for (let index = 0; index < output.length; index++) {
      const dry = input?.[index] ?? 0;
      this.line[this.written] = dry;

      const second = (this.phase + 0.5) % 1;
      const wet =
        this.read(this.phase * window) * Math.sin(Math.PI * this.phase) ** 2 +
        this.read(second * window) * Math.sin(Math.PI * second) ** 2;

      output[index] = (1 - mix) * dry + mix * wet;
      this.written = (this.written + 1) % size;
      this.phase = (((this.phase + drift) % 1) + 1) % 1;
    }
  }

  private read(delay: number) {
    const size = this.line.length;
    const position = this.written - delay + size;
    const whole = Math.floor(position);
    const fraction = position - whole;
    return this.line[whole % size] * (1 - fraction) + this.line[(whole + 1) % size] * fraction;
  }
}
