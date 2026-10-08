import { Fft } from "./fft";

export interface FreezeSettings {
  /** From 0, only the sound it gets, to 1, only the frozen one. */
  mix: number;
  /** Seconds the frozen sound takes to fade by 60 dB once the gate closes. */
  release: number;
}

const SIZE = 2048;
const HOP = SIZE / 4;
const BINS = SIZE / 2 + 1;
/** What four Hann windows squared add up to, overlapping by three quarters. */
const OVERLAP_GAIN = 1.5;
const SILENT = 1e-5;

type Event = { frame: number; type: "freeze" | "release" };

const wrap = (phase: number) => phase - 2 * Math.PI * Math.round(phase / (2 * Math.PI));

/**
 * Holds the spectrum of an instant: on freezing, two transforms of the latest sound, a hop apart,
 * give the level of each frequency and how fast its phase turns. From then on it plays that
 * spectrum again every hop, each phase turning on at its own speed, and overlaps the frames.
 */
export class SpectralFreeze {
  private readonly sampleRate: number;
  private readonly fft = new Fft(SIZE);
  private readonly window = Float64Array.from(
    { length: SIZE },
    (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / SIZE),
  );
  private readonly history = new Float64Array(SIZE + HOP);
  private written = 0;
  private readonly real = new Float64Array(SIZE);
  private readonly imag = new Float64Array(SIZE);
  private readonly earlierPhases = new Float64Array(BINS);
  private readonly magnitudes = new Float64Array(BINS);
  private readonly advances = new Float64Array(BINS);
  private readonly phases = new Float64Array(BINS);
  private readonly overlap = new Float64Array(SIZE);
  private read = 0;
  private untilHop = 0;
  private sounding = false;
  private releasing = false;
  private level = 0;
  private events: Event[] = [];

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  freeze(frame: number) {
    this.schedule({ frame, type: "freeze" });
  }

  release(frame: number) {
    this.schedule({ frame, type: "release" });
  }

  process(input: Float32Array | undefined, output: Float32Array, startFrame: number, settings: FreezeSettings) {
    const { mix, release } = settings;
    const fade = 10 ** (-3 / (Math.max(release, 0.001) * this.sampleRate));
    for (let index = 0; index < output.length; index++) {
      const frame = startFrame + index;
      while (this.events.length > 0 && this.events[0].frame <= frame) {
        const event = this.events.shift()!;
        if (event.type === "freeze") {
          this.capture();
        } else {
          this.releasing = this.sounding;
        }
      }

      const dry = input?.[index] ?? 0;
      this.history[this.written] = dry;
      this.written = (this.written + 1) % this.history.length;

      let wet = 0;
      if (this.sounding) {
        if (this.untilHop === 0) {
          this.synthesize();
          this.untilHop = HOP;
        }
        this.untilHop--;
        wet = this.overlap[this.read] * this.level;
        this.overlap[this.read] = 0;
        this.read = (this.read + 1) % SIZE;
        if (this.releasing) {
          this.level *= fade;
          if (this.level < SILENT) {
            this.stop();
          }
        }
      }
      output[index] = (1 - mix) * dry + mix * wet;
    }
  }

  private schedule(event: Event) {
    this.events.push(event);
    this.events.sort((a, b) => a.frame - b.frame);
  }

  private capture() {
    this.analyse(SIZE + HOP);
    for (let bin = 0; bin < BINS; bin++) {
      this.earlierPhases[bin] = Math.atan2(this.imag[bin], this.real[bin]);
    }
    this.analyse(SIZE);
    for (let bin = 0; bin < BINS; bin++) {
      const phase = Math.atan2(this.imag[bin], this.real[bin]);
      const expected = (2 * Math.PI * bin * HOP) / SIZE;
      this.magnitudes[bin] = Math.hypot(this.real[bin], this.imag[bin]);
      this.advances[bin] = expected + wrap(phase - this.earlierPhases[bin] - expected);
      this.phases[bin] = phase;
    }
    if (!this.sounding) {
      this.overlap.fill(0);
      this.untilHop = 0;
    }
    this.sounding = true;
    this.releasing = false;
    this.level = 1;
  }

  /** Transforms the window of sound that ended `ago` frames back from the latest one. */
  private analyse(ago: number) {
    const size = this.history.length;
    const start = this.written - ago + size;
    for (let index = 0; index < SIZE; index++) {
      this.real[index] = this.history[(start + index) % size] * this.window[index];
      this.imag[index] = 0;
    }
    this.fft.forward(this.real, this.imag);
  }

  private synthesize() {
    for (let bin = 0; bin < BINS; bin++) {
      this.phases[bin] = wrap(this.phases[bin] + this.advances[bin]);
      this.real[bin] = this.magnitudes[bin] * Math.cos(this.phases[bin]);
      this.imag[bin] = this.magnitudes[bin] * Math.sin(this.phases[bin]);
    }
    for (let bin = BINS; bin < SIZE; bin++) {
      this.real[bin] = this.real[SIZE - bin];
      this.imag[bin] = -this.imag[SIZE - bin];
    }
    this.fft.inverse(this.real, this.imag);
    for (let index = 0; index < SIZE; index++) {
      const position = (this.read + index) % SIZE;
      this.overlap[position] += (this.real[index] * this.window[index]) / OVERLAP_GAIN;
    }
  }

  private stop() {
    this.sounding = false;
    this.releasing = false;
    this.level = 0;
    this.overlap.fill(0);
  }
}
