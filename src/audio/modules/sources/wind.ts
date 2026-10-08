import type { WindBore, WindExciter } from "../../../patch/effects";
import { at, Body, clamp, DelayLine, hertz, lowpass, noiseSource, Slope, smoothing, softLimit } from "./waveguide";

export interface WindSettings {
  exciter: WindExciter;
  bore: WindBore;
  /** How hard it is blown, from 0 to 1, for each sample or one for the whole block. */
  breath: Float32Array;
  /** Cents away from the note, for each sample or one for the whole block. */
  detune: Float32Array;
  noise: number;
  brightness: number;
  vibrato: number;
  /** Where the bell or the tone holes stop holding the sound in, in hertz. */
  bell: number;
  /** How far the bell opens up when blown hard, from 0 to 1. */
  flare: number;
  /** How hard the tongue starts a note, from 0 to 1. */
  attack: number;
}

interface WindEvent {
  frame: number;
  type: "on" | "off" | "all";
  note: number;
  velocity: number;
}

interface HeldNote {
  note: number;
  velocity: number;
}

/** What the player does to the instrument on a sample. */
interface Blowing {
  /** The breath as it rises and falls with the notes, from 0 to 1. */
  blown: number;
  /** The push of the tongue that starts a note, from 0 to 1. */
  tongue: number;
  /** How hard it is blown, from 0 to 1: the Breath and the velocity. */
  dynamic: number;
  /** The turbulence of the breath, from -1 to 1, as much as the Noise lets in. */
  air: number;
  /** A random number from -1 to 1. */
  random: number;
  frequency: number;
  brightness: number;
  /** Where the bell stops holding the sound in, in hertz, opened as far as the flare and the dynamic say. */
  bell: number;
}

interface Bore {
  next(blowing: Blowing): number;
  /** Sets the bore ringing at `frequency`, as the tongue does when it lets the reed or the jet go. */
  seed(frequency: number, amount: number): void;
}

const SOFTEST_LEVEL = 0.1;
const SOFTEST_VELOCITY = 0.2;
const DC_BLOCK = 0.995;
const SOFT_ATTACK_SECONDS = 0.025;
const HARD_ATTACK_SECONDS = 0.006;
const RELEASE_SECONDS = 0.025;
const TONGUE = 0.5;
const TONGUE_SECONDS = 0.002;
const VIBRATO_HZ = 5.2;
const VIBRATO_CENTS = 12;
const VIBRATO_LEVEL = 0.15;
const VIBRATO_WAITS_SECONDS = 0.2;
const VIBRATO_GROWS_SECONDS = 0.4;
const FLARE_RANGE = 20;
const SOFT_DARKER = 0.6;
const LOUD_BRIGHTER = 0.8;
const LEVEL = 1.5;
const QUIET = 1e-5;
const RESTS_AFTER_SECONDS = 0.05;

const CLARINET_LOSS = 0.95;
const REED_REST = 0.7;
const REED_SLOPE = -0.3;
const SOFTEST_PRESSURE = 0.68;
const PRESSURE_RANGE = 0.3;
const CLARINET_NOISE = 0.25;
const CLARINET_DARKEST = 1200;
const CLARINET_CUTOFF_RANGE = 5;
const CLARINET_CUTOFF_OVER_NOTE = 4;
const RADIATION = 0.7;
const CLARINET_SEED = 0.6;
const REED_HEARD = 1;
const REED_RESONANCE = 3000;

/**
 * A cylinder closed by a reed: the bore sends the pressure back from its open end inverted and
 * darkened, and the reed lets in the breath as the pressure across it allows. The breath is kept
 * between where the reed starts to sound and where it shuts, so that every note speaks. Below the
 * bell the bore is heard, with its odd harmonics; above it the sound leaves by the open holes, and
 * the reed itself is heard, even harmonics and all, as far up as the reed can follow.
 */
class Clarinet implements Bore {
  private readonly sampleRate: number;
  private readonly bore = new DelayLine();
  private readonly below: Slope;
  private readonly above: Slope;
  private readonly reedTop: Slope;
  private reflected = 0;
  private last = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.below = new Slope(sampleRate, false, 1);
    this.above = new Slope(sampleRate, true, 1);
    this.reedTop = new Slope(sampleRate, false, 1);
    this.reedTop.tune(REED_RESONANCE);
  }

  seed(frequency: number, amount: number) {
    this.bore.ring(frequency, CLARINET_SEED * amount, this.sampleRate);
  }

  next({ blown, tongue, dynamic, air, frequency, brightness, bell }: Blowing) {
    const pressure = (blown + tongue) * (SOFTEST_PRESSURE + PRESSURE_RANGE * dynamic) * (1 + CLARINET_NOISE * air);
    const cutoff = Math.max(
      CLARINET_DARKEST * CLARINET_CUTOFF_RANGE ** brightness * (SOFT_DARKER + LOUD_BRIGHTER * dynamic),
      CLARINET_CUTOFF_OVER_NOTE * frequency,
    );
    const { pole, delay } = lowpass(cutoff, frequency, this.sampleRate);
    const back = this.bore.read(this.sampleRate / (2 * frequency) - delay);
    this.reflected = (1 - pole) * back + pole * this.reflected;
    const across = -CLARINET_LOSS * this.reflected - pressure;
    const reed = clamp(REED_REST + REED_SLOPE * across, -1, 1);
    this.bore.write(pressure + across * reed);
    const radiated = back - RADIATION * this.last;
    this.last = back;
    this.below.tune(bell);
    this.above.tune(bell);
    return this.below.next(radiated) + REED_HEARD * this.above.next(this.reedTop.next(reed * pressure));
  }
}

const CONE_LOSS = 0.95;
const VALVE_REST = 0.7;
const VALVE_SLOPE = 0.3;
const VALVE_PLACE = 0.42;
const SOFTEST_VALVE_PRESSURE = 0.72;
const VALVE_PRESSURE_RANGE = 0.2;
const VALVE_NOISE = 0.15;
const VALVE_DARKEST = 1500;
const VALVE_CUTOFF_RANGE = 10;
const VALVE_CUTOFF_OVER_NOTE = 3;
const VALVE_SEED = 2.8;
const VALVE_FILL = 0.6;
const VALVE_LEVEL = 0.18;

/**
 * A tube that rings at every harmonic of the note, blown through a valve that opens as the mouth
 * pressure rises over the pressure in it: a reed on a cone, a double reed, or the lips. The bore
 * is split where the valve blows into it, a little short of halfway, so that it keeps to the note;
 * that leaves weak the harmonics with a node there, as a comb would, and the inverse comb gives
 * them back. The sound comes out of the bell, which lets nothing much through above it.
 */
class Valve implements Bore {
  private readonly sampleRate: number;
  private readonly toBell = new DelayLine();
  private readonly toReed = new DelayLine();
  private readonly filled = new DelayLine();
  private readonly holes: Slope;
  private reflected = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.holes = new Slope(sampleRate, false);
  }

  seed(frequency: number, amount: number) {
    this.toBell.ring(frequency, VALVE_SEED * amount, this.sampleRate);
    this.toReed.ring(frequency, VALVE_SEED * amount, this.sampleRate);
  }

  /** Gives back the harmonics the valve hardly drives, by the inverse of the comb its place makes, as loud as before on the note. */
  private fill(sound: number, frequency: number) {
    const filled = sound + VALVE_FILL * this.filled.read((VALVE_PLACE * this.sampleRate) / frequency);
    this.filled.write(filled);
    const turn = 2 * Math.PI * VALVE_PLACE;
    return filled * Math.sqrt(1 - 2 * VALVE_FILL * Math.cos(turn) + VALVE_FILL * VALVE_FILL);
  }

  next({ blown, tongue, dynamic, air, frequency, brightness, bell }: Blowing) {
    const pressure = (blown + tongue) * (SOFTEST_VALVE_PRESSURE + VALVE_PRESSURE_RANGE * dynamic) * (1 + VALVE_NOISE * air);
    const cutoff = Math.max(
      VALVE_DARKEST * VALVE_CUTOFF_RANGE ** brightness * (SOFT_DARKER + LOUD_BRIGHTER * dynamic),
      VALVE_CUTOFF_OVER_NOTE * frequency,
    );
    const { pole, delay } = lowpass(cutoff, frequency, this.sampleRate);
    const length = this.sampleRate / frequency - delay;
    const fromBell = this.toBell.read((1 - VALVE_PLACE) * length);
    const fromReed = this.toReed.read(VALVE_PLACE * length);
    this.reflected = (1 - pole) * fromBell + pole * this.reflected;
    const reflected = -CONE_LOSS * this.reflected;
    const mouthpiece = reflected - fromReed;
    const across = pressure - mouthpiece;
    const opening = clamp(VALVE_REST + VALVE_SLOPE * across, -1, 1);
    this.toReed.write(reflected);
    this.toBell.write(pressure - across * opening - reflected);
    this.holes.tune(Math.max(bell, VALVE_CUTOFF_OVER_NOTE * frequency));
    return this.fill(this.holes.next(fromBell), frequency) * VALVE_LEVEL;
  }
}

const FLUTE_RINGS_SECONDS = 0.04;
const SOFTEST_JET = 0.4;
const JET_RANGE = 0.6;
const JET_GAIN = 6;
const JET_OFFSET = 0.3;
const JET_DRIVE = 0.3;
const JET_DELAY = 0.5;
const TURBULENCE = 0.1;
const FLUTE_KICK = 6;
const FLUTE_DARKEST = 2000;
const FLUTE_CUTOFF_RANGE = 4;
const FLUTE_CUTOFF_OVER_NOTE = 3;
const FLUTE_TUNING = 0.18;
const FLUTE_SCALE = 2.5;
const EDGE = 1.5;
const BREATH_HEARD = 0.25;
const BREATH_CUTOFF = 3000;
const FLUTE_LEVEL = 0.27;
const FLUTE_SEED = 0.2;

/** Where the jet meets the edge: shaped by the lips, a little off it, or aimed at it by a duct. */
interface Jet {
  offset: number;
  /** How much the jet striking off the edge is heard, which gives the octave above. */
  edge: number;
}

const LIPS_JET: Jet = { offset: JET_OFFSET, edge: EDGE };
const DUCT_JET: Jet = { offset: 0.1, edge: 0.5 };

/**
 * A tube open at both ends, driven by a jet of air across its mouth hole: the jet takes half a
 * period to reach the edge, and there it blows into the tube or out of it as the sound in the tube
 * bends it. The tube sets the note, rings for a fixed time whatever the note. A jet shaped by the
 * lips strikes a little off the edge, which gives the octave above; one aimed by a duct, as in a
 * recorder, strikes it nearly straight, and is purer. The breath is heard too.
 */
class Flute implements Bore {
  private readonly sampleRate: number;
  private readonly jetShape: Jet;
  private readonly bore = new DelayLine();
  private readonly jet = new DelayLine();
  private readonly mouth: Slope;
  private reflected = 0;
  private breath = 0;

  constructor(sampleRate: number, jet: Jet) {
    this.sampleRate = sampleRate;
    this.jetShape = jet;
    this.mouth = new Slope(sampleRate, false);
  }

  seed(frequency: number, amount: number) {
    const ringing = (FLUTE_SEED * amount) / (1 - Math.exp(-1 / (frequency * FLUTE_RINGS_SECONDS)));
    this.bore.ring(frequency, ringing, this.sampleRate);
    this.jet.ring(frequency, ringing, this.sampleRate);
  }

  next({ blown, tongue, dynamic, air, random, frequency, brightness, bell }: Blowing) {
    const pressure = blown * (SOFTEST_JET + JET_RANGE * dynamic);
    const cutoff = Math.max(
      FLUTE_DARKEST * FLUTE_CUTOFF_RANGE ** brightness * (SOFT_DARKER + LOUD_BRIGHTER * dynamic),
      FLUTE_CUTOFF_OVER_NOTE * frequency,
    );
    const { pole, delay, gain } = lowpass(cutoff, frequency, this.sampleRate);
    const period = this.sampleRate / frequency;
    const loss = Math.exp(-1 / (frequency * FLUTE_RINGS_SECONDS));
    const back = this.bore.read(period - delay + FLUTE_TUNING);
    this.reflected = (1 - pole) * back + pole * this.reflected;
    this.jet.write(back + TURBULENCE * air * pressure);
    const bent = this.jet.read(JET_DELAY * period);
    const drive = pressure * Math.tanh(JET_GAIN * pressure * bent + this.jetShape.offset);
    this.bore.write(loss * this.reflected - JET_DRIVE * drive + FLUTE_KICK * tongue * random);
    this.breath += (air - this.breath) * (1 - Math.exp((-2 * Math.PI * BREATH_CUTOFF) / this.sampleRate));
    const sound = back * (1 - loss * gain) * FLUTE_SCALE;
    this.mouth.tune(Math.max(bell, FLUTE_CUTOFF_OVER_NOTE * frequency));
    return this.mouth.next((sound + this.jetShape.edge * sound * sound + BREATH_HEARD * this.breath * pressure) * FLUTE_LEVEL);
  }
}

/** The bore that answers to what blows it and how it is shaped. */
const boreFor = (exciter: WindExciter, bore: WindBore) =>
  exciter === "air" ? "flute" : exciter === "duct" ? "recorder" : bore === "cylinder" && exciter !== "lips" ? "clarinet" : "valve";

/**
 * A wind instrument by digital waveguide, played one note at a time. It does what the player does:
 * velocity and the Breath set how hard each note is blown, louder and brighter; a note played while
 * another is held slurs to it, and one played after a rest is tongued, a short push that starts it
 * at once; and a vibrato comes in a while after the note starts, in the breath and the pitch. What
 * blows it and its bore choose the instrument that answers; the bell and the body colour it.
 */
export class Wind {
  private readonly sampleRate: number;
  private readonly bores: Record<ReturnType<typeof boreFor>, Bore>;
  private readonly body: Body;
  private readonly noise = noiseSource();
  private events: WindEvent[] = [];
  private held: HeldNote[] = [];
  private note = 60;
  private velocity = 0;
  private blowing = false;
  private envelope = 0;
  private tongue = 0;
  private sinceTongued = 0;
  private seeding = false;
  private vibratoPhase = 0;
  private dcIn = 0;
  private dcOut = 0;
  private quietFrames = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.bores = {
      clarinet: new Clarinet(sampleRate),
      flute: new Flute(sampleRate, LIPS_JET),
      recorder: new Flute(sampleRate, DUCT_JET),
      valve: new Valve(sampleRate),
    };
    this.body = new Body(sampleRate);
  }

  /** Shapes the body: the gain in decibels of each of its bands, from the lowest; the ones left out are flat. */
  setBody(gains: readonly number[]) {
    this.body.shape(gains);
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

  /**
   * Fills `output` with the frames from `startFrame` on. While nothing is blown and the sound has
   * died away, nothing is worked out until the frame of the next note.
   */
  process(output: Float32Array, startFrame: number, settings: WindSettings) {
    const wakes = this.resting() ? Math.max(0, Math.min(output.length, (this.events[0]?.frame ?? Infinity) - startFrame)) : 0;
    output.fill(0, 0, wakes);
    if (wakes === output.length) {
      return;
    }
    const bore = this.bores[boreFor(settings.exciter, settings.bore)];
    const brightness = clamp(settings.brightness, 0, 1);
    const noise = clamp(settings.noise, 0, 1);
    const vibrato = clamp(settings.vibrato, 0, 1);
    const flare = clamp(settings.flare, 0, 1);
    const attackAmount = clamp(settings.attack, 0, 1);
    const release = smoothing(RELEASE_SECONDS, this.sampleRate);
    const vibratoStep = (2 * Math.PI * VIBRATO_HZ) / this.sampleRate;
    for (let frame = wakes; frame < output.length; frame++) {
      while (this.events.length > 0 && this.events[0].frame <= startFrame + frame) {
        this.apply(this.events.shift()!);
      }
      const strength = this.velocity / 127;
      const attack = smoothing(SOFT_ATTACK_SECONDS + (HARD_ATTACK_SECONDS - SOFT_ATTACK_SECONDS) * strength, this.sampleRate);
      this.envelope += ((this.blowing ? 1 : 0) - this.envelope) * (this.blowing ? attack : release);
      const tongue = this.tongue > 0 ? TONGUE * strength : 0;
      if (this.tongue > 0) {
        this.tongue--;
      }
      const grown = clamp((this.sinceTongued / this.sampleRate - VIBRATO_WAITS_SECONDS) / VIBRATO_GROWS_SECONDS, 0, 1);
      const swing = vibrato * grown * Math.sin(this.vibratoPhase);
      this.vibratoPhase = (this.vibratoPhase + vibratoStep) % (2 * Math.PI);
      this.sinceTongued++;

      const dynamic = clamp(at(settings.breath, frame), 0, 1) * (SOFTEST_VELOCITY + (1 - SOFTEST_VELOCITY) * strength);
      const random = this.noise();
      const frequency = hertz(this.note, at(settings.detune, frame) + VIBRATO_CENTS * swing);
      if (this.seeding) {
        bore.seed(frequency, (0.5 + 0.5 * strength) * attackAmount);
        this.seeding = false;
      }
      const sound = bore.next({
        blown: this.envelope * (1 + VIBRATO_LEVEL * swing),
        tongue,
        dynamic,
        air: noise * random,
        random,
        frequency,
        brightness,
        bell: settings.bell * FLARE_RANGE ** (flare * dynamic),
      });
      this.dcOut = sound - this.dcIn + DC_BLOCK * this.dcOut;
      this.dcIn = sound;
      const level = this.envelope * (SOFTEST_LEVEL + (1 - SOFTEST_LEVEL) * dynamic) * (1 + VIBRATO_LEVEL * swing);
      output[frame] = softLimit(this.body.next(this.dcOut) * level * LEVEL);
      this.quietFrames = !this.blowing && Math.abs(output[frame]) < QUIET ? this.quietFrames + 1 : 0;
    }
  }

  /** Whether nothing is blown and the sound has stayed below hearing for a while. */
  private resting() {
    return this.quietFrames > RESTS_AFTER_SECONDS * this.sampleRate;
  }

  private schedule(event: WindEvent) {
    this.events.push(event);
    this.events.sort((a, b) => a.frame - b.frame);
  }

  private apply(event: WindEvent) {
    if (event.type === "all") {
      this.held = [];
      this.blowing = false;
      return;
    }
    this.held = this.held.filter(({ note }) => note !== event.note);
    if (event.type === "on") {
      if (!this.blowing) {
        this.tongue = Math.round(TONGUE_SECONDS * this.sampleRate);
        this.sinceTongued = 0;
        this.seeding = true;
      }
      this.held.push({ note: event.note, velocity: event.velocity });
    }
    const playing = this.held.at(-1);
    this.blowing = playing !== undefined;
    if (playing) {
      this.note = playing.note;
      this.velocity = playing.velocity;
    }
  }
}
