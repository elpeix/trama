/**
 * A partial of a struck body: how far above the note it rings, how loud it gets, and how much
 * longer or shorter than the note it lasts; with a swell, it does not ring at once but takes that
 * many seconds to bloom, as the energy of the strike spreads to it.
 */
export interface ModalPartial {
  ratio: number;
  gain: number;
  decay: number;
  swell?: number;
}

const partials = (ratios: number[], gains: number[], decays: number[]): ModalPartial[] =>
  ratios.map((ratio, index) => ({ ratio, gain: gains[index], decay: decays[index] }));

/**
 * A tam-tam: the note and a partner that beats with it, and above them pairs of modes close
 * together that bloom after the strike, the higher the later.
 */
const gong = (): ModalPartial[] => [
  { ratio: 1, gain: 1, decay: 1 },
  { ratio: 1.006, gain: 0.5, decay: 0.9 },
  ...Array.from({ length: 11 }, (_, pair) => 1.45 * 1.3 ** pair).flatMap((ratio, pair) =>
    [ratio, ratio * 1.005].map((partner) => ({
      ratio: partner,
      gain: 0.7 * partner ** -0.3,
      decay: 1.1 * partner ** -0.35,
      swell: Math.min(1.2, 0.15 + 0.1 * pair),
    })),
  ),
];

/** The note a tubular bell is heard at is half its fourth mode, where its fourth, fifth and sixth go nearly 2 : 3 : 4. */
const TUBE_NOTE = 8.933 / 2;

export const MODAL_MODELS = {
  tubular: partials(
    [1, 2.756, 5.404, 8.933, 13.344, 18.638].map((mode) => mode / TUBE_NOTE),
    [0.08, 0.2, 0.45, 1, 0.8, 0.6],
    [0.5, 0.6, 0.8, 1, 0.8, 0.6],
  ),
  bell: partials(
    [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166],
    [0.6, 1, 0.8, 0.5, 0.9, 0.5, 0.4, 0.4, 0.25],
    [2, 1.3, 1.1, 1, 0.8, 0.6, 0.55, 0.5, 0.4],
  ),
  marimba: partials([1, 3.99, 10.65], [1, 0.5, 0.25], [1, 0.35, 0.15]),
  vibraphone: partials([1, 4, 10], [1, 0.4, 0.15], [1, 0.6, 0.3]),
  glass: partials([1, 2.32, 4.25, 6.63, 9.38], [1, 0.6, 0.4, 0.25, 0.15], [1, 0.8, 0.6, 0.45, 0.35]),
  gong: gong(),
} satisfies Record<string, ModalPartial[]>;

export type ModalModel = keyof typeof MODAL_MODELS;

export interface ModalSettings {
  model: ModalModel;
  /** In Hz; one value for the whole block, or one per frame. */
  frequency: number | Float32Array;
  /** In cents; one value for the whole block, or one per frame. */
  detune: number | Float32Array;
  /** Seconds the note takes to fade by 60 dB. */
  decay: number;
  /** From 0, where the partials above the main one die out fast, to 1, where they last as their model says. */
  brightness: number;
  /** From 0, a soft mallet that keeps the partials above the main one down, to 1, a hard one that brings them out. */
  hit: number;
  /** From -1 to 1: draws the partials closer to the note, or pushes them away. */
  stretch: number;
}

const MAX_PARTIALS = Math.max(...Object.values(MODAL_MODELS).map((model) => model.length));
/** The highest a partial rings at, as a share of the sample rate. */
const TOP = 0.45;
const SOFT_HIT = 1.5;
const STRETCH = 0.5;
const SIXTY_DB = Math.log(0.001);
/** How far below 1 the partials together are kept, as their peaks seldom line up. */
const LEVEL = 2.5;

const at = (value: number | Float32Array, frame: number) =>
  typeof value === "number" ? value : value.length > 1 ? value[frame] : value[0];

/**
 * A struck body by modal synthesis: each partial of its model is a resonator that rings at its own
 * ratio of the note and fades at its own pace once struck. A partial that swells is driven by a
 * burst of noise as long as its swell instead, so that it grows in after the strike. A strike while
 * it rings adds to what sounds, as on a bell; the partials too high for the sample rate are left out.
 */
export class Modal {
  private readonly sampleRate: number;
  private readonly last = new Float64Array(MAX_PARTIALS);
  private readonly before = new Float64Array(MAX_PARTIALS);
  private readonly pull = new Float64Array(MAX_PARTIALS);
  private readonly keep = new Float64Array(MAX_PARTIALS);
  private readonly kick = new Float64Array(MAX_PARTIALS);
  private readonly driving = new Float64Array(MAX_PARTIALS);
  private readonly drive = new Float64Array(MAX_PARTIALS);
  private seed = 1;
  private strikes: number[] = [];
  private shape = "";

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /** Strikes the body on a frame. */
  strike(frame: number) {
    this.strikes = [...this.strikes, frame].sort((a, b) => a - b);
  }

  process(output: Float32Array, startFrame: number, settings: ModalSettings) {
    const model = MODAL_MODELS[settings.model] ?? MODAL_MODELS.marimba;
    const loudest = LEVEL * Math.sqrt(model.reduce((sum, partial) => sum + partial.gain ** 2, 0));
    for (let frame = 0; frame < output.length; frame++) {
      const note = at(settings.frequency, frame) * 2 ** (at(settings.detune, frame) / 1200);
      this.tune(model, note, settings);
      const struck = this.strikes.length > 0 && this.strikes[0] <= startFrame + frame;
      if (struck) {
        this.strikes = this.strikes.filter((strike) => strike > startFrame + frame);
      }
      let sample = 0;
      for (let index = 0; index < model.length; index++) {
        const swell = model[index].swell;
        if (struck && swell) {
          this.driving[index] = Math.round(swell * this.sampleRate);
          this.drive[index] = this.kick[index] * Math.sqrt(3 / this.driving[index]);
        }
        const input = swell ? (this.driving[index]-- > 0 ? this.drive[index] * this.noise() : 0) : struck ? this.kick[index] : 0;
        const next = this.pull[index] * this.last[index] - this.keep[index] * this.before[index] + input;
        this.before[index] = this.last[index];
        this.last[index] = next;
        sample += next;
      }
      output[frame] = sample / loudest;
    }
  }

  /** Noise from -1 to 1, the same each time it starts, to drive the partials that swell. */
  private noise() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (2 * this.seed) / 2147483647 - 1;
  }

  /** Works out the resonator of each partial for the note, when the note or the settings change. */
  private tune(model: ModalPartial[], note: number, settings: ModalSettings) {
    const shape = `${settings.model} ${note} ${settings.decay} ${settings.brightness} ${settings.hit} ${settings.stretch}`;
    if (shape === this.shape) {
      return;
    }
    this.shape = shape;
    const spread = 1 + STRETCH * Math.max(-1, Math.min(1, settings.stretch));
    const stretched = (ratio: number) => 1 + (ratio - 1) * spread;
    const main = stretched(model.reduce((loudest, partial) => (partial.gain > loudest.gain ? partial : loudest)).ratio);
    model.forEach((partial, index) => {
      const ratio = stretched(partial.ratio);
      const above = Math.max(1, ratio / main);
      const frequency = note * ratio;
      if (frequency <= 0 || frequency >= TOP * this.sampleRate) {
        this.pull[index] = 0;
        this.keep[index] = 0;
        this.kick[index] = 0;
        this.last[index] = 0;
        this.before[index] = 0;
        return;
      }
      const angle = (2 * Math.PI * frequency) / this.sampleRate;
      const lasts = Math.max(0.01, settings.decay * partial.decay * above ** (Math.max(0, Math.min(1, settings.brightness)) - 1));
      const fade = Math.exp(SIXTY_DB / (lasts * this.sampleRate));
      const hardness = above ** (-(1 - Math.max(0, Math.min(1, settings.hit))) * SOFT_HIT);
      this.pull[index] = 2 * fade * Math.cos(angle);
      this.keep[index] = fade * fade;
      this.kick[index] = partial.gain * hardness * Math.sin(angle);
    });
  }
}
