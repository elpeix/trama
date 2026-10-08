export interface StringSettings {
  /** In Hz; one value for the whole block, or one per frame. */
  frequency: number | Float32Array;
  /** In cents; one value for the whole block, or one per frame. */
  detune: number | Float32Array;
  /** Seconds the string takes to fade by 60 dB. */
  decay: number;
  /** Seconds the string takes to fade by 60 dB once damped, when shorter than the decay. */
  damp: number;
  /** From 0, dark, to 1, as bright as the pluck. */
  brightness: number;
}

const LOWEST_FREQUENCY = 20;
const SHORTEST_DELAY = 2;
const DC_BLOCKER = 0.995;

type StringEvent = { frame: number; type: "pluck" | "damp" };

const at = (value: number | Float32Array, frame: number) =>
  typeof value === "number" ? value : value.length > 1 ? value[frame] : value[0];

/**
 * A plucked string by the Karplus-Strong method: a burst of noise, as long as one period, runs
 * round a delay line of that period, and a small lowpass on the way round takes the high partials
 * out first, as a real string does.
 */
export class KarplusStrong {
  private readonly sampleRate: number;
  private readonly random: () => number;
  private readonly line: Float32Array;
  private written = 0;
  private previousDelayed = 0;
  private excitation = 0;
  private burst = 0;
  private dcInput = 0;
  private dcOutput = 0;
  private damped = false;
  private events: StringEvent[] = [];

  constructor(sampleRate: number, random: () => number = Math.random) {
    this.sampleRate = sampleRate;
    this.random = random;
    this.line = new Float32Array(Math.ceil(sampleRate / LOWEST_FREQUENCY) + SHORTEST_DELAY * 2);
  }

  /** Plucks the string at an absolute frame of the audio clock. */
  pluck(frame: number) {
    this.schedule({ frame, type: "pluck" });
  }

  /** Damps the string at an absolute frame of the audio clock, until the next pluck. */
  damp(frame: number) {
    this.schedule({ frame, type: "damp" });
  }

  /** Fills `output` with the frames from `startFrame` on. */
  process(output: Float32Array, startFrame: number, settings: StringSettings) {
    const { decay, damp, brightness } = settings;
    const damping = 0.5 * (1 - brightness);
    const smoothing = 0.2 + 0.8 * brightness;
    const size = this.line.length;
    for (let index = 0; index < output.length; index++) {
      const frame = startFrame + index;
      const frequency = Math.max(
        LOWEST_FREQUENCY,
        at(settings.frequency, index) * 2 ** (at(settings.detune, index) / 1200),
      );
      const period = this.sampleRate / frequency;
      while (this.events.length > 0 && this.events[0].frame <= frame) {
        const event = this.events.shift()!;
        this.damped = event.type === "damp";
        this.burst = this.damped ? 0 : Math.round(period);
      }

      const delay = Math.min(size - SHORTEST_DELAY, Math.max(SHORTEST_DELAY, period - damping));
      const position = this.written - delay + size;
      const whole = Math.floor(position);
      const fraction = position - whole;
      const delayed =
        this.line[whole % size] * (1 - fraction) + this.line[(whole + 1) % size] * fraction;
      const filtered = (1 - damping) * delayed + damping * this.previousDelayed;
      this.previousDelayed = delayed;

      if (this.burst > 0) {
        this.excitation += smoothing * (this.random() * 2 - 1 - this.excitation);
        this.burst--;
      } else {
        this.excitation = 0;
      }
      const loss = 10 ** (-3 / (frequency * (this.damped ? Math.min(decay, damp) : decay)));
      const sample = this.excitation + loss * filtered;
      this.line[this.written] = sample;
      this.written = (this.written + 1) % size;

      this.dcOutput = sample - this.dcInput + DC_BLOCKER * this.dcOutput;
      this.dcInput = sample;
      output[index] = this.dcOutput;
    }
  }

  /** Keeps the events in time order; those on the same frame stay in the order they came. */
  private schedule(event: StringEvent) {
    this.events.push(event);
    this.events.sort((a, b) => a.frame - b.frame);
  }
}
