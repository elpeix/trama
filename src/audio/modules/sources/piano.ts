export interface PianoSettings {
  /** From 0, soft felt hammers, to 1, hard ones: how bright a key struck as hard sounds. */
  brightness: number;
  /** How much longer or shorter than a piano the notes ring, 1 as one does. */
  decay: number;
  /** How far apart the strings of a key are tuned, in steps of about a cent. */
  unison: number;
  /** From 0 to 1: how loud the thump of the hammer is. */
  hammer: number;
  /** The sustain pedal: down from 0.5 up, when the dampers leave the strings alone. */
  pedal: number;
  /** From 0 to 1: how much of the soundboard colours the strings, none at 0. */
  body: number;
}

export const MAX_PIANO_VOICES = 16;
const MAX_PARTIALS = 32;
/** The partials up to this one ring on every string of a key, and beat; those above, on one. */
const BEATING_PARTIALS = 8;
/** The highest a partial rings at, as a share of the sample rate. */
const TOP = 0.45;
/** Where along the string the hammer strikes, as a share of its length: the partials it divides into ring less. */
const STRIKE = 1 / 8;
const LOWEST_KEY = 21;
const HIGHEST_KEY = 108;
/** From this key up there are no dampers, and a note rings on when its key goes up. */
const NO_DAMPERS = 89;
const CENTS_PER_UNISON = 1.2;
const SIXTY_DB = Math.log(0.001);
const PROMPT = 0.75;
const PROMPT_FASTER = 6;
/** Seconds the dampers take to quiet a note by 60 dB around middle C: twice as long two octaves down, half two up. */
const DAMPED_SECONDS = 0.3;
const SHORTEST_DAMPING = 0.08;
const LONGEST_DAMPING = 1;
/** How much faster than the one below each partial dies under the dampers, so that a note darkens as it goes. */
const DAMPED_PARTIAL_FASTER = 0.12;
const RESTRUCK_SECONDS = 0.02;
const THUMP_SECONDS = 0.012;
/** How long the felt of the hammer takes to press into the strings: softer strikes take longer. */
const SOFT_ATTACK_SECONDS = 0.004;
const HARD_ATTACK_SECONDS = 0.0015;
/** Below C5 the hammers get heavier and stay longer on the strings: the attack grows longer, twice three octaves down. */
const HEAVY_HAMMERS_FROM = 72;
const BASS_ATTACK_OCTAVES = 3;
/** The felt lets the partials through up to a frequency, higher the harder the strike and the brighter the hammers. */
const FELT_LOWEST = 1000;
const FELT_RANGE = 3500;
/** How many times above the felt a partial still rings: past it, it is too faint to count. */
const FELT_REACH = 4;
/** Below C5, where the hammers get heavier, the partials fall more slowly up the series: by this much an octave, four octaves at most. */
const BASS_FLATTER = 0.3;
const BASS_FLATTER_OCTAVES = 4;
/** The bigger, softer bass hammers let through less of the high partials: the felt lowers by this much of an octave an octave down. */
const BASS_FELT = 0.8;
/** The partials start on phases spread as Schroeder's, π n² / N, so that their peaks do not all line up. */
const PHASE_PARTIALS = 32;
/** The soundboard radiates the frequencies below this one weakly: the fundamentals of the bass are faint. */
const RADIATES_FROM = 150;
const DAMPER_NOISE_SECONDS = 0.03;
const SILENT = 1e-5;
const LEVEL = 0.35;
const WIDTH = 0.6;

const keep = (seconds: number, sampleRate: number) => Math.exp(SIXTY_DB / (seconds * sampleRate));

const BOARD_MODES = 24;
const BOARD_LOWEST = 90;
const BOARD_HIGHEST = 3000;
/** How far, as a share, each mode of the soundboard is off an even spread: wood is not regular. */
const BOARD_UNEVEN = 0.06;
const BOARD_LONGEST = 0.15;
const BOARD_SHORTEST = 0.06;
const BOARD_LEVEL = 1;

/**
 * The soundboard of a piano: a few dozen resonances of its wood, from the bass to a few kilohertz,
 * a little uneven, each ringing for a tenth of a second or so, that every string sounds through.
 */
class Soundboard {
  private readonly pull = new Float64Array(BOARD_MODES);
  private readonly keep = new Float64Array(BOARD_MODES);
  private readonly gain = new Float64Array(BOARD_MODES);
  private readonly last = new Float64Array(BOARD_MODES);
  private readonly before = new Float64Array(BOARD_MODES);
  private inputLast = 0;
  private inputBefore = 0;

  constructor(sampleRate: number) {
    for (let mode = 0; mode < BOARD_MODES; mode++) {
      const place = mode / (BOARD_MODES - 1);
      const frequency = BOARD_LOWEST * (BOARD_HIGHEST / BOARD_LOWEST) ** place * (1 + BOARD_UNEVEN * Math.sin(mode * 2.39996));
      const fall = Math.exp(SIXTY_DB / ((BOARD_LONGEST - (BOARD_LONGEST - BOARD_SHORTEST) * place) * sampleRate));
      this.pull[mode] = 2 * fall * Math.cos((2 * Math.PI * frequency) / sampleRate);
      this.keep[mode] = fall * fall;
      this.gain[mode] = (1 - fall * fall) / 2 / Math.sqrt(1 + (frequency / 800) ** 2);
    }
  }

  next(input: number): number {
    const drive = input - this.inputBefore;
    this.inputBefore = this.inputLast;
    this.inputLast = input;
    let sum = 0;
    for (let mode = 0; mode < BOARD_MODES; mode++) {
      const next = this.pull[mode] * this.last[mode] - this.keep[mode] * this.before[mode] + this.gain[mode] * drive;
      this.before[mode] = this.last[mode];
      this.last[mode] = next;
      sum += next;
    }
    return sum * BOARD_LEVEL;
  }
}

/** The inharmonicity of the strings of a key: the stiffer, the sharper its high partials, and more so up the keyboard. */
const inharmonicity = (note: number) => 4e-5 * 2 ** (((note - LOWEST_KEY) / 12) * 0.8);

/** Seconds the slow part of a note takes to fade by 60 dB: long in the bass, short in the treble. */
const ringing = (note: number) => 28 * 2 ** (-((note - LOWEST_KEY) / 12) * 0.55);

const stringsOf = (note: number) => (note < 34 ? 1 : note < 48 ? 2 : 3);

const dampingOf = (note: number) =>
  Math.max(SHORTEST_DAMPING, Math.min(LONGEST_DAMPING, DAMPED_SECONDS * 2 ** ((60 - note) / 24)));

interface PianoEvent {
  frame: number;
  type: "on" | "off" | "all";
  note: number;
  velocity: number;
}

/** A key that sounds: each of its partials, string by string, as a sine that turns and two levels that fall. */
class Voice {
  readonly note: number;
  readonly left: number;
  readonly right: number;
  readonly count: number;
  private readonly real: Float64Array;
  private readonly imaginary: Float64Array;
  private readonly cosine: Float64Array;
  private readonly sine: Float64Array;
  private readonly prompt: Float64Array;
  private readonly after: Float64Array;
  private readonly keepPrompt: Float64Array;
  private readonly keepAfter: Float64Array;
  private readonly partials: Float64Array;
  private thump: number;
  private attack = 0;
  private readonly attackKeep: number;
  private thumpKeep: number;
  private rub = 0;
  private rubKeep: number;
  private low = 0;
  private seed: number;
  released = false;
  damped = false;

  constructor(note: number, velocity: number, sampleRate: number, settings: PianoSettings) {
    this.note = note;
    const place = ((Math.max(LOWEST_KEY, Math.min(HIGHEST_KEY, note)) - LOWEST_KEY) / (HIGHEST_KEY - LOWEST_KEY)) * 2 - 1;
    const angle = ((place * WIDTH + 1) * Math.PI) / 4;
    this.left = Math.cos(angle);
    this.right = Math.sin(angle);
    const fundamental = 440 * 2 ** ((note - 69) / 12);
    const stiffness = inharmonicity(note);
    const hardness = Math.max(0, Math.min(1, velocity / 127));
    const bright = 0.5 + 0.5 * Math.max(0, Math.min(1, settings.brightness));
    const below = Math.min(BASS_FLATTER_OCTAVES, Math.max(0, (HEAVY_HAMMERS_FROM - note) / 12));
    const slope = 2.2 - 1.2 * hardness * bright - BASS_FLATTER * below;
    const felt = (FELT_LOWEST + FELT_RANGE * hardness * bright) * 2 ** (-BASS_FELT * below);
    const strings = stringsOf(note);
    const cents = Math.max(0, settings.unison) * CENTS_PER_UNISON;
    const lasts = ringing(note) * Math.max(0.05, settings.decay);
    const components: { partial: number; frequency: number; amplitude: number; lasts: number }[] = [];
    for (let partial = 1; partial <= MAX_PARTIALS; partial++) {
      const frequency = (fundamental * partial * Math.sqrt(1 + stiffness * partial * partial)) / Math.sqrt(1 + stiffness);
      if (frequency >= TOP * sampleRate || frequency > felt * FELT_REACH) {
        break;
      }
      const radiated = 1 / Math.sqrt(1 + (RADIATES_FROM / frequency) ** 2);
      const amplitude =
        (radiated * partial ** -slope * (0.15 + 0.85 * Math.abs(Math.sin(Math.PI * partial * STRIKE)))) / (1 + (frequency / felt) ** 2);
      const partialLasts = lasts / (1 + 0.08 * (partial - 1));
      const onStrings = partial <= BEATING_PARTIALS ? strings : 1;
      for (let string = 0; string < onStrings; string++) {
        const offset = onStrings === 1 ? 0 : (string / (onStrings - 1)) * 2 - 1;
        components.push({
          partial,
          frequency: frequency * 2 ** ((offset * cents) / 1200),
          amplitude: amplitude / onStrings,
          lasts: partialLasts,
        });
      }
    }
    const loudness = Math.sqrt(components.reduce((sum, { amplitude }) => sum + amplitude * amplitude, 0)) || 1;
    const gain = hardness ** 1.6 / loudness;
    this.count = components.length;
    this.real = new Float64Array(this.count);
    this.imaginary = new Float64Array(this.count);
    this.cosine = new Float64Array(this.count);
    this.sine = new Float64Array(this.count);
    this.prompt = new Float64Array(this.count);
    this.after = new Float64Array(this.count);
    this.keepPrompt = new Float64Array(this.count);
    this.keepAfter = new Float64Array(this.count);
    this.partials = new Float64Array(this.count);
    components.forEach(({ partial, frequency, amplitude, lasts: componentLasts }, index) => {
      this.partials[index] = partial;
      const turn = (2 * Math.PI * frequency) / sampleRate;
      const phase = (Math.PI * (partial - 1) ** 2) / PHASE_PARTIALS;
      this.real[index] = Math.cos(phase);
      this.imaginary[index] = Math.sin(phase);
      this.cosine[index] = Math.cos(turn);
      this.sine[index] = Math.sin(turn);
      this.prompt[index] = PROMPT * amplitude * gain;
      this.after[index] = (1 - PROMPT) * amplitude * gain;
      this.keepPrompt[index] = keep(componentLasts / PROMPT_FASTER, sampleRate);
      this.keepAfter[index] = keep(componentLasts, sampleRate);
    });
    this.thump = Math.max(0, Math.min(1, settings.hammer)) * hardness * 0.12;
    const heavier = 2 ** (Math.max(0, HEAVY_HAMMERS_FROM - note) / (12 * BASS_ATTACK_OCTAVES));
    const attack = (SOFT_ATTACK_SECONDS - (SOFT_ATTACK_SECONDS - HARD_ATTACK_SECONDS) * hardness) * heavier;
    this.attackKeep = Math.exp(-1 / (attack * sampleRate));
    this.thumpKeep = keep(THUMP_SECONDS, sampleRate);
    this.rubKeep = keep(DAMPER_NOISE_SECONDS, sampleRate);
    this.seed = 1 + note * 7919;
  }

  /**
   * Lays the dampers on the strings, which quiet the note over a fraction of a second, the bass
   * slower and the high partials first; or stops it at once when its key is struck again. The
   * highest keys have no dampers.
   */
  damp(sampleRate: number, mode: "dampers" | "quick" = "dampers", always = false) {
    if (this.damped || (!always && this.note >= NO_DAMPERS)) {
      return;
    }
    this.damped = true;
    if (mode === "quick") {
      this.keepPrompt.fill(keep(RESTRUCK_SECONDS, sampleRate));
      this.keepAfter.fill(keep(RESTRUCK_SECONDS, sampleRate));
      return;
    }
    const seconds = dampingOf(this.note);
    for (let index = 0; index < this.count; index++) {
      const fall = keep(seconds / (1 + DAMPED_PARTIAL_FASTER * (this.partials[index] - 1)), sampleRate);
      this.keepPrompt[index] = Math.min(this.keepPrompt[index], fall);
      this.keepAfter[index] = Math.min(this.keepAfter[index], fall);
    }
    this.rub = 0.01 * (this.loudest() + 0.1);
  }

  next(): number {
    let sample = 0;
    for (let index = 0; index < this.count; index++) {
      const real = this.real[index] * this.cosine[index] - this.imaginary[index] * this.sine[index];
      const imaginary = this.real[index] * this.sine[index] + this.imaginary[index] * this.cosine[index];
      this.real[index] = real;
      this.imaginary[index] = imaginary;
      this.prompt[index] *= this.keepPrompt[index];
      this.after[index] *= this.keepAfter[index];
      sample += imaginary * (this.prompt[index] + this.after[index]);
    }
    this.attack = 1 - this.attackKeep * (1 - this.attack);
    sample *= this.attack;
    if (this.thump > SILENT || this.rub > SILENT) {
      this.low += 0.03 * (this.noise() - this.low);
      sample += this.low * (this.thump * this.attack + this.rub);
      this.thump *= this.thumpKeep;
      this.rub *= this.rubKeep;
    }
    return sample;
  }

  get silent() {
    return this.loudest() < SILENT && this.thump < SILENT && this.rub < SILENT;
  }

  private loudest() {
    let loudest = 0;
    for (let index = 0; index < this.count; index++) {
      loudest = Math.max(loudest, this.prompt[index] + this.after[index]);
    }
    return loudest;
  }

  private noise() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (2 * this.seed) / 2147483647 - 1;
  }
}

/**
 * A grand piano by additive synthesis, worked out a frame at a time. Each key struck sounds its
 * partials a little sharper up the series, as stiff strings do, on one to three strings tuned a
 * little apart that beat; each partial falls fast and then rings on slower, the bass longer than
 * the treble. The felt of the hammer takes a few milliseconds to press in, and lets through the
 * partials up to a frequency: a harder strike is louder and brighter, and the hammer thumps. Letting a key go lays
 * its dampers on, unless the pedal is down or the key is too high to have any. Low keys sound to
 * the left and high ones to the right, and all of them through a soundboard, as much as Body says.
 */
export class Piano {
  private readonly sampleRate: number;
  private sounding: Voice[] = [];
  private readonly boards: [Soundboard, Soundboard];
  private events: PianoEvent[] = [];
  private settings: PianoSettings | undefined;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.boards = [new Soundboard(sampleRate), new Soundboard(sampleRate)];
  }

  get voices() {
    return this.sounding.length;
  }

  noteOn(note: number, frame: number, velocity: number) {
    this.schedule({ frame, type: "on", note, velocity });
  }

  noteOff(note: number, frame: number) {
    this.schedule({ frame, type: "off", note, velocity: 0 });
  }

  allNotesOff(frame: number) {
    this.schedule({ frame, type: "all", note: 0, velocity: 0 });
  }

  process(left: Float32Array, right: Float32Array | undefined, startFrame: number, settings: PianoSettings) {
    this.settings = settings;
    const pedal = settings.pedal >= 0.5;
    const body = Math.max(0, Math.min(1, settings.body ?? 0));
    if (!pedal) {
      this.sounding.filter((voice) => voice.released).forEach((voice) => voice.damp(this.sampleRate));
    }
    for (let frame = 0; frame < left.length; frame++) {
      while (this.events.length > 0 && this.events[0].frame <= startFrame + frame) {
        this.apply(this.events.shift()!, pedal);
      }
      let sumLeft = 0;
      let sumRight = 0;
      for (const voice of this.sounding) {
        const sample = voice.next();
        sumLeft += sample * voice.left;
        sumRight += sample * voice.right;
      }
      if (body > 0) {
        sumLeft += body * this.boards[0].next(sumLeft);
        sumRight += body * this.boards[1].next(sumRight);
      }
      left[frame] = Math.tanh(sumLeft * LEVEL);
      if (right) {
        right[frame] = Math.tanh(sumRight * LEVEL);
      }
    }
    this.sounding = this.sounding.filter((voice) => !voice.silent);
  }

  private schedule(event: PianoEvent) {
    this.events.push(event);
    this.events.sort((a, b) => a.frame - b.frame);
  }

  private apply(event: PianoEvent, pedal: boolean) {
    if (event.type === "all") {
      this.sounding.forEach((voice) => voice.damp(this.sampleRate, "dampers", true));
      return;
    }
    const held = this.sounding.filter((voice) => voice.note === event.note && !voice.damped);
    if (event.type === "off") {
      held.forEach((voice) => {
        voice.released = true;
        if (!pedal) {
          voice.damp(this.sampleRate);
        }
      });
      return;
    }
    held.forEach((voice) => voice.damp(this.sampleRate, "quick", true));
    const live = this.sounding.filter((voice) => !voice.damped);
    if (live.length >= MAX_PIANO_VOICES) {
      live[0].damp(this.sampleRate, "quick", true);
    }
    this.sounding.push(new Voice(event.note, event.velocity, this.sampleRate, this.settings ?? DEFAULT_SETTINGS));
  }
}

const DEFAULT_SETTINGS: PianoSettings = { brightness: 0.5, decay: 1, unison: 1, hammer: 0.3, pedal: 0, body: 0 };
