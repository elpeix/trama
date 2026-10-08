import { windBodyFrequencies } from "../../../patch/effects";

const BORE_SIZE = 8192;
const KNEE = 0.7;
const BODY_Q = 4;
const BODY_SETTLES_SECONDS = 0.1;
const BODY_MOST = 1000;
const BODY_ROUNDS = 3;
const BODY_DAMPING = 0.01;
const BODY_UNIT = 6;
const BODY_LIMIT = 40;
const SILENT_POWER = 1e-12;

export const hertz = (note: number, cents: number) => 440 * 2 ** ((note - 69) / 12 + cents / 1200);

export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** The sound as it is up to the knee, and bent smoothly above it so that it never reaches full scale. */
export const softLimit = (sample: number) => {
  const size = Math.abs(sample);
  return size <= KNEE ? sample : Math.sign(sample) * (KNEE + (1 - KNEE) * Math.tanh((size - KNEE) / (1 - KNEE)));
};

export const smoothing = (seconds: number, sampleRate: number) => 1 - Math.exp(-1 / (seconds * sampleRate));

export const at = (values: Float32Array, frame: number) => (values.length > 1 ? values[frame] : values[0]) ?? 0;

/** A random number from -1 to 1, the same ones on every run. */
export function noiseSource(seed = 22222) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 31 - 1;
  };
}

/** The pole of a one-pole lowpass at `cutoff`, and the delay in samples and the gain it has at `frequency`. */
export function lowpass(cutoff: number, frequency: number, sampleRate: number) {
  const pole = Math.exp((-2 * Math.PI * Math.min(cutoff, sampleRate * 0.45)) / sampleRate);
  const turn = (2 * Math.PI * frequency) / sampleRate;
  return {
    pole,
    delay: Math.atan2(pole * Math.sin(turn), 1 - pole * Math.cos(turn)) / turn,
    gain: (1 - pole) / Math.sqrt(1 - 2 * pole * Math.cos(turn) + pole * pole),
  };
}

/** A delay line read between its samples, by cubic Lagrange interpolation, holding `size` samples, a power of two. */
export class DelayLine {
  private readonly samples: Float32Array;
  private readonly mask: number;
  private written = 0;

  constructor(size = BORE_SIZE) {
    this.samples = new Float32Array(size);
    this.mask = size - 1;
  }

  /** Fills what it holds with a sine at `frequency`, as if it had been ringing at it. */
  ring(frequency: number, amplitude: number, sampleRate: number) {
    const turn = (2 * Math.PI * frequency) / sampleRate;
    const span = Math.min(this.mask, Math.ceil(sampleRate / frequency) + 4);
    for (let age = 1; age <= span; age++) {
      this.samples[(this.written - age) & this.mask] = amplitude * Math.sin(-turn * age);
    }
  }

  write(sample: number) {
    this.samples[this.written & this.mask] = sample;
    this.written++;
  }

  read(delay: number) {
    const position = this.written - clamp(delay, 2, this.mask - 3);
    const whole = Math.floor(position);
    const d = position - whole;
    const sample = (offset: number) => this.samples[(whole + offset) & this.mask];
    return (
      sample(-1) * ((-d * (d - 1) * (d - 2)) / 6) +
      sample(0) * (((d + 1) * (d - 1) * (d - 2)) / 2) +
      sample(1) * ((-(d + 1) * d * (d - 2)) / 2) +
      sample(2) * (((d + 1) * d * (d - 1)) / 6)
    );
  }
}

/** A filter of two poles and two zeros. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  set(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number) {
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  next(input: number) {
    const output = this.b0 * input + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }
}

/** Filters of two poles in a row, flat to one side of their frequency and falling 12 dB an octave to the other for each. */
export class Slope {
  private readonly sampleRate: number;
  private readonly high: boolean;
  private readonly stages: Biquad[];
  private frequency = 0;

  constructor(sampleRate: number, high: boolean, stages = 2) {
    this.sampleRate = sampleRate;
    this.high = high;
    this.stages = Array.from({ length: stages }, () => new Biquad());
  }

  /** Moves the frequency, worked out again only when it moves by more than a percent. */
  tune(frequency: number) {
    if (Math.abs(frequency - this.frequency) < this.frequency * 0.01) {
      return;
    }
    this.frequency = frequency;
    const turn = (2 * Math.PI * clamp(frequency, 10, this.sampleRate * 0.45)) / this.sampleRate;
    const cos = Math.cos(turn);
    const alpha = Math.sin(turn) / Math.SQRT2;
    const edge = this.high ? (1 + cos) / 2 : (1 - cos) / 2;
    const middle = this.high ? -(1 + cos) : 1 - cos;
    this.stages.forEach((stage) => stage.set(edge, middle, edge, 1 + alpha, -2 * cos, 1 - alpha));
  }

  next(input: number) {
    return this.stages.reduce((sound, stage) => stage.next(sound), input);
  }
}

/** The coefficients of a peaking filter at `frequency`, raised or lowered by `gain` decibels. */
function peaking(frequency: number, gain: number, sampleRate: number): [number, number, number, number, number, number] {
  const amplitude = 10 ** (gain / 40);
  const turn = (2 * Math.PI * Math.min(frequency, sampleRate * 0.45)) / sampleRate;
  const alpha = Math.sin(turn) / (2 * BODY_Q);
  const cos = Math.cos(turn);
  return [1 + alpha * amplitude, -2 * cos, 1 - alpha * amplitude, 1 + alpha / amplitude, -2 * cos, 1 - alpha / amplitude];
}

/** How much a filter raises or lowers `frequency`, in decibels. */
function decibelsAt([b0, b1, b2, a0, a1, a2]: number[], frequency: number, sampleRate: number) {
  const turn = (2 * Math.PI * frequency) / sampleRate;
  const response = (c0: number, c1: number, c2: number) =>
    Math.hypot(c0 + c1 * Math.cos(turn) + c2 * Math.cos(2 * turn), c1 * Math.sin(turn) + c2 * Math.sin(2 * turn));
  return 20 * Math.log10(response(b0, b1, b2) / response(a0, a1, a2));
}

/** Solves `matrix` times x equals `wanted` as nearly as it can, kept from growing wild by `damping`, by least squares. */
function leastSquares(matrix: number[][], wanted: number[], damping: number) {
  const size = wanted.length;
  const rows = Array.from({ length: size }, (_, row) => [
    ...Array.from({ length: size }, (_, column) => matrix.reduce((sum, line) => sum + line[row] * line[column], 0) + (row === column ? damping : 0)),
    matrix.reduce((sum, line, index) => sum + line[row] * wanted[index], 0),
  ]);
  for (let pivot = 0; pivot < size; pivot++) {
    const best = rows.slice(pivot).reduce((most, row, index) => (Math.abs(row[pivot]) > Math.abs(rows[most][pivot]) ? pivot + index : most), pivot);
    [rows[pivot], rows[best]] = [rows[best], rows[pivot]];
    for (let row = pivot + 1; row < size; row++) {
      const factor = rows[row][pivot] / rows[pivot][pivot];
      for (let column = pivot; column <= size; column++) {
        rows[row][column] -= factor * rows[pivot][column];
      }
    }
  }
  const solution = new Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row--) {
    const known = solution.reduce((sum, value, column) => sum + (column > row ? rows[row][column] * value : 0), 0);
    solution[row] = (rows[row][size] - known) / rows[row][row];
  }
  return solution;
}

const overlaps = new Map<number, number[][]>();

/** How much each band, raised by a decibel, raises the frequency of every bar. */
function overlap(sampleRate: number) {
  const known = overlaps.get(sampleRate);
  if (known) {
    return known;
  }
  const frequencies = windBodyFrequencies();
  const matrix = frequencies.map((frequency) =>
    frequencies.map((centre) => decibelsAt(peaking(centre, BODY_UNIT, sampleRate), frequency, sampleRate) / BODY_UNIT),
  );
  overlaps.set(sampleRate, matrix);
  return matrix;
}

/**
 * The gain of each band that makes the body raise each bar's frequency by just what the bar says:
 * the bands overlap, so they are worked out together, and set again a few times against what they
 * really add. A drawing no bands can follow, such as bars up and down by turns, is followed as
 * nearly as they can.
 */
function bandGains(bars: readonly number[], sampleRate: number) {
  const frequencies = windBodyFrequencies();
  const wanted = frequencies.map((_, index) => bars[index] ?? 0);
  const matrix = overlap(sampleRate);
  let gains = leastSquares(matrix, wanted, BODY_DAMPING).map((gain) => clamp(gain, -BODY_LIMIT, BODY_LIMIT));
  for (let round = 0; round < BODY_ROUNDS; round++) {
    const filters = gains.map((gain, index) => peaking(frequencies[index], gain, sampleRate));
    const missing = frequencies.map((frequency, index) => wanted[index] - filters.reduce((sum, filter) => sum + decibelsAt(filter, frequency, sampleRate), 0));
    const step = leastSquares(matrix, missing, BODY_DAMPING);
    gains = gains.map((gain, index) => clamp(gain + step[index], -BODY_LIMIT, BODY_LIMIT));
  }
  return gains;
}

/** How much a body drawn with `bars` raises or lowers `frequency`, in decibels. */
export function windBodyResponse(bars: readonly number[], frequency: number, sampleRate: number) {
  const frequencies = windBodyFrequencies();
  return bandGains(bars, sampleRate).reduce((sum, gain, index) => sum + decibelsAt(peaking(frequencies[index], gain, sampleRate), frequency, sampleRate), 0);
}

/**
 * The body of the instrument: a band of fixed frequency for each bar, so that every note takes the
 * colour of where its harmonics fall. Each bar is the gain at its own frequency, whatever the bars
 * beside it. It changes the colour and not the loudness: the sound through it is kept as strong as
 * the sound into it, measured over a tenth of a second, so that a note whose harmonics fall on
 * raised bands does not stand out.
 */
export class Body {
  private readonly sampleRate: number;
  private readonly frequencies = windBodyFrequencies();
  private readonly settling: number;
  private bands: Biquad[] = [];
  private powerIn = 0;
  private powerOut = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.settling = smoothing(BODY_SETTLES_SECONDS, sampleRate);
  }

  shape(bars: readonly number[]) {
    if (bars.every((bar) => bar === 0)) {
      this.bands = [];
      return;
    }
    this.bands = bandGains(bars, this.sampleRate).map((gain, index) => {
      const band = new Biquad();
      band.set(...peaking(this.frequencies[index], gain, this.sampleRate));
      return band;
    });
  }

  next(input: number) {
    if (this.bands.length === 0) {
      return input;
    }
    const output = this.bands.reduce((sound, band) => band.next(sound), input);
    this.powerIn += (input * input - this.powerIn) * this.settling;
    this.powerOut += (output * output - this.powerOut) * this.settling;
    const gain = this.powerOut > SILENT_POWER ? clamp(Math.sqrt(this.powerIn / this.powerOut), 1 / BODY_MOST, BODY_MOST) : 1;
    return output * gain;
  }
}
