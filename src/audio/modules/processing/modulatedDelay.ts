/** A sine from -1 to 1 that turns at `rate` cycles a second, from the phase it is given, in cycles. */
export class SineLfo {
  private readonly sampleRate: number;
  private phase: number;

  constructor(sampleRate: number, phase = 0) {
    this.sampleRate = sampleRate;
    this.phase = phase;
  }

  /** The value at `offset` cycles from where the sine is now, before it moves on. */
  at(offset = 0) {
    return Math.sin(2 * Math.PI * (this.phase + offset));
  }

  advance(rate: number) {
    this.phase = (this.phase + rate / this.sampleRate) % 1;
  }
}

/** The samples written into it lately, read back any number of samples ago, between two samples too. */
export class DelayLine {
  private readonly buffer: Float32Array;
  private next = 0;

  constructor(length: number) {
    this.buffer = new Float32Array(length);
  }

  /** The sample written `samples` writes ago, 1 being the last one, drawn between its neighbours. */
  read(samples: number) {
    const clamped = Math.min(Math.max(samples, 1), this.buffer.length - 1);
    const whole = Math.floor(clamped);
    const fraction = clamped - whole;
    const newer = this.buffer[(this.next - whole + this.buffer.length) % this.buffer.length];
    const older = this.buffer[(this.next - whole - 1 + this.buffer.length) % this.buffer.length];
    return newer + (older - newer) * fraction;
  }

  write(sample: number) {
    this.buffer[this.next] = sample;
    this.next = (this.next + 1) % this.buffer.length;
  }
}
