import { VCO_MAX_VOICES } from "../../../patch/effects";

export type VcoWave = "sine" | "triangle" | "sawtooth" | "square";

export interface VcoSettings {
  wave: VcoWave;
  frequency: number | Float32Array;
  /** Cents, which the pitch and the cables into the frequency reach it in. */
  detune: number | Float32Array;
  /** How long the square stays up in each cycle, from 0 to 1. */
  width: number | Float32Array;
  voices: number;
  /** How far apart, in cents, the outermost voices play. */
  spread: number;
  /** How much each voice wanders off pitch, from 0 to 1. */
  drift: number;
}

export const MAX_VOICES = VCO_MAX_VOICES;
const MIN_WIDTH = 0.02;
/** How far, in cents, a voice drifts at the most. */
const DRIFT_CENTS = 10;
/** How often a voice heads for a new drift, and how slowly it gets there, in seconds. */
const DRIFT_EVERY = 0.25;
const DRIFT_TIME = 0.5;

const at = (value: number | Float32Array, frame: number) =>
  typeof value === "number" ? value : value.length > 1 ? value[frame] : value[0];

/** The correction that rounds off a jump at the start of a cycle, over the frame before it and the one after. */
function polyBlep(phase: number, step: number) {
  if (phase < step) {
    const x = phase / step;
    return x + x - x * x - 1;
  }
  if (phase > 1 - step) {
    const x = (phase - 1) / step;
    return x * x + x + x + 1;
  }
  return 0;
}

function naive(wave: VcoWave, phase: number, width: number) {
  switch (wave) {
    case "sine":
      return Math.sin(2 * Math.PI * phase);
    case "triangle":
      return 1 - 4 * Math.abs(phase - 0.5);
    case "sawtooth":
      return 2 * phase - 1;
    case "square":
      return phase < width ? 1 : -1;
  }
}

/** How far the wave jumps at the start of each cycle, from the end of the one before. */
const jumpAtStart = (wave: VcoWave) => (wave === "sawtooth" ? -2 : wave === "square" ? 2 : 0);

/**
 * An oscillator in the manner of the analog ones, worked out a frame at a time: its waves keep
 * their jumps from aliasing with polyBLEP, its square has a width that can be modulated, several
 * voices can play detuned and spread across the stereo field, a rising edge into sync starts every
 * voice over, and each voice can drift a little off pitch.
 */
export class Vco {
  private readonly sampleRate: number;
  private readonly random: () => number;
  private readonly phases: number[];
  private readonly drifts = new Array<number>(MAX_VOICES).fill(0);
  private readonly targets = new Array<number>(MAX_VOICES).fill(0);
  private readonly driftKeep: number;
  private untilDrift = 0;
  private lastSync = 0;

  constructor(sampleRate: number, random: () => number = Math.random) {
    this.sampleRate = sampleRate;
    this.random = random;
    this.phases = Array.from({ length: MAX_VOICES }, () => random());
    this.driftKeep = Math.exp(-1 / (DRIFT_TIME * sampleRate));
  }

  process(left: Float32Array, right: Float32Array | undefined, sync: Float32Array | undefined, settings: VcoSettings) {
    const voices = Math.max(1, Math.min(MAX_VOICES, Math.round(settings.voices)));
    const gain = 1 / Math.sqrt(voices);
    for (let frame = 0; frame < left.length; frame++) {
      this.moveDrifts(settings.drift);
      const base = at(settings.frequency, frame) * 2 ** (at(settings.detune, frame) / 1200);
      const width = Math.min(1 - MIN_WIDTH, Math.max(MIN_WIDTH, at(settings.width, frame)));
      const synced = sync ? this.syncedAt(sync[frame]) : undefined;
      let sumLeft = 0;
      let sumRight = 0;
      for (let voice = 0; voice < voices; voice++) {
        const place = voices === 1 ? 0 : (2 * voice) / (voices - 1) - 1;
        const cents = place * settings.spread + this.drifts[voice];
        const step = Math.min(0.5, Math.max(0, (base * 2 ** (cents / 1200)) / this.sampleRate));
        const sample = this.voiceAt(voice, settings.wave, step, width, synced) * gain;
        sumLeft += sample * Math.sqrt(1 - place);
        sumRight += sample * Math.sqrt(1 + place);
      }
      left[frame] = sumLeft;
      if (right) {
        right[frame] = sumRight;
      }
    }
  }

  /** Where in the frame before a rising edge into sync came, from 0 to 1, or undefined without one. */
  private syncedAt(value: number) {
    const last = this.lastSync;
    this.lastSync = value;
    return last <= 0 && value > 0 ? last / (last - value) : undefined;
  }

  private voiceAt(voice: number, wave: VcoWave, step: number, width: number, synced: number | undefined) {
    let phase = this.phases[voice];
    let jump = 0;
    if (synced !== undefined) {
      const before = naive(wave, (phase + synced * step) % 1, width);
      phase = (1 - synced) * step;
      jump = naive(wave, 0, width) - before - jumpAtStart(wave);
    }
    let sample = naive(wave, phase, width) + (jump / 2) * Math.min(0, polyBlep(phase, step));
    if (wave === "sawtooth") {
      sample -= polyBlep(phase, step);
    } else if (wave === "square") {
      sample += polyBlep(phase, step) - polyBlep((phase - width + 1) % 1, step) - (2 * width - 1);
    }
    this.phases[voice] = (phase + step) % 1;
    return sample;
  }

  private moveDrifts(amount: number) {
    if (this.untilDrift <= 0) {
      this.untilDrift = Math.round(DRIFT_EVERY * this.sampleRate);
      for (let voice = 0; voice < MAX_VOICES; voice++) {
        this.targets[voice] = (2 * this.random() - 1) * DRIFT_CENTS;
      }
    }
    this.untilDrift--;
    for (let voice = 0; voice < MAX_VOICES; voice++) {
      const target = this.targets[voice] * amount;
      this.drifts[voice] = target + this.driftKeep * (this.drifts[voice] - target);
    }
  }
}
