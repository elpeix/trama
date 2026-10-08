export interface GrainSettings {
  /** Seconds back from the latest sound where the grains start reading. */
  position: number;
  /** Milliseconds each grain lasts. */
  size: number;
  /** Grains per second. */
  density: number;
  /** Semitones each grain is played away from the sound. */
  pitch: number;
  /** From 0 to 1: how far, at random, each grain starts from the position, up to the size of a grain. */
  spread: number;
  /** From 0, only the sound it gets, to 1, only the grains. */
  mix: number;
  /** While frozen it stops listening, and the grains go on over the last sound it heard. */
  freeze: boolean;
}

const LONGEST_MEMORY = 4;
const MAX_GRAINS = 128;

interface Grain {
  /** Where it reads now, in frames of the memory. */
  at: number;
  rate: number;
  length: number;
  age: number;
}

/**
 * Keeps the last seconds of the sound it gets, and plays short grains read from them, each one
 * faded in and out, many at a time. Together they make a cloud of the sound, which can be played
 * higher or lower without changing its speed, or held once frozen.
 */
export class Granulator {
  private readonly sampleRate: number;
  private readonly random: () => number;
  private readonly memory: Float32Array;
  private written = 0;
  private grains: Grain[] = [];
  private untilGrain = 0;

  constructor(sampleRate: number, random: () => number = Math.random) {
    this.sampleRate = sampleRate;
    this.random = random;
    this.memory = new Float32Array(Math.ceil(sampleRate * LONGEST_MEMORY));
  }

  process(input: Float32Array | undefined, output: Float32Array, settings: GrainSettings) {
    const { mix, freeze } = settings;
    const length = Math.max(2, Math.round((settings.size / 1000) * this.sampleRate));
    const rate = 2 ** (settings.pitch / 12);
    const interval = this.sampleRate / Math.max(0.1, settings.density);
    const level = 1 / Math.sqrt(Math.max(1, length / interval));
    for (let index = 0; index < output.length; index++) {
      const dry = input?.[index] ?? 0;
      if (!freeze) {
        this.memory[this.written] = dry;
        this.written = (this.written + 1) % this.memory.length;
      }
      if (this.untilGrain <= 0) {
        this.startGrain(settings, length, rate);
        this.untilGrain += interval;
      }
      this.untilGrain--;
      output[index] = (1 - mix) * dry + mix * level * this.playGrains();
    }
  }

  private startGrain(settings: GrainSettings, length: number, rate: number) {
    if (this.grains.length >= MAX_GRAINS) {
      return;
    }
    const size = this.memory.length;
    const earliest = Math.max(1, length * (rate - 1) + 1);
    const jitter = this.random() * Math.max(0, Math.min(1, settings.spread)) * length;
    const back = Math.min(size - length * Math.max(1, rate) - 2, Math.max(earliest, settings.position * this.sampleRate + jitter));
    this.grains.push({ at: (this.written - back + size) % size, rate, length, age: 0 });
  }

  private playGrains() {
    const size = this.memory.length;
    let sum = 0;
    let kept = 0;
    for (const grain of this.grains) {
      const whole = Math.floor(grain.at);
      const fraction = grain.at - whole;
      const sample = this.memory[whole % size] * (1 - fraction) + this.memory[(whole + 1) % size] * fraction;
      sum += sample * Math.sin((Math.PI * grain.age) / grain.length) ** 2;
      grain.at = (grain.at + grain.rate) % size;
      grain.age++;
      if (grain.age < grain.length) {
        this.grains[kept++] = grain;
      }
    }
    this.grains.length = kept;
    return sum;
  }
}
