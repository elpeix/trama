import type { StringsPlay } from "../../../patch/effects";
import { at, Body, clamp, DelayLine, hertz, lowpass, noiseSource, Slope, smoothing, softLimit } from "./waveguide";

export interface StringsSettings {
  play: StringsPlay;
  /** How fast the bow is drawn, from 0 to 1, for each sample or one for the whole block. */
  bow: Float32Array;
  /** How hard the bow presses on the string, from 0 to 1. */
  pressure: number;
  /** Where the bow draws or the finger plucks, as a share of the string from the bridge. */
  position: number;
  /** Cents away from the note, for each sample or one for the whole block. */
  detune: Float32Array;
  brightness: number;
  noise: number;
  vibrato: number;
  /** How long the bow takes to come up to speed on a new stroke, from 0 to 1. */
  attack: number;
}

interface StringsEvent {
  frame: number;
  type: "on" | "off" | "all";
  note: number;
  velocity: number;
}

interface HeldNote {
  note: number;
  velocity: number;
}

const OVERSAMPLE = 4;
const STRING_SIZE = 16384;
const SOFTEST_VELOCITY = 0.1;
const BOW_SPEED = 0.25;
const FASTEST_ATTACK_SECONDS = 0.02;
const SLOWEST_ATTACK_SECONDS = 0.15;
const PLAIN_VELOCITY = 100;
const BITE_SECONDS = 0.12;
const BITE_BRIGHTER = 2;
const BITE_LOUDER = 1;
const SOFT_ENTRY_SECONDS = 0.08;
const LIFT_SECONDS = 0.02;
const LEAVES_SECONDS = 0.005;
const HAIR_NOISE = 0.3;
const SCRATCH = 2;
const LIGHTEST_FORCE = 4;
const HEAVIEST_FORCE = 10;
const NEAR_BRIDGE_PRESSES = 1.5;
const RESTING_PRESSES = 0.4;
const STICKING = 0.8;
const SLIDING = 0.3;
const SLIDING_SETTLES = 0.1;
const NEAREST_SIDE = 0.06;
const FARTHEST_SIDE = 0.25;
const BOWED_LOSS = 0.95;
const LOOP_HARMONICS = 11;
const NEAR_BRIDGE_SHARPER = 0.75;
const SOFT_DARKER = 0.6;
const LOUD_BRIGHTER = 0.8;
const TONE = 1200;
const TONE_RANGE = 8;
const NEAR_BRIDGE_BRIGHTER = 0.5;
const PRESSED_BRIGHTER = 1;
const BOW_SHARPENS = 3.8;
const HEAVY_FORCE = 4;
const HEAVY_SHARPENS = 1.2;
const PLUCK_RINGS_SECONDS = 1.2;
const PLUCK_RINGS_AT_HZ = 220;
const STOPPED_RINGS_SECONDS = 0.15;
const LOSS_MOVES_SECONDS = 0.005;
const MOST_REFLECTED = 0.9999;
const FINGER_CUTOFF = 2000;
const PLUCK = 1.5;
const SHORTEST_SIDE = 2.5;
const REFERENCE_POSITION = 0.12;
const VIBRATO_HZ = 5.5;
const VIBRATO_CENTS = 18;
const VIBRATO_PRESSES = 0.05;
const VIBRATO_WAITS_SECONDS = 0.25;
const VIBRATO_GROWS_SECONDS = 0.5;
const DC_BLOCK = 0.995;
const LEVEL = 0.5;
const QUIET = 1e-5;
const RESTS_AFTER_SECONDS = 0.05;

/** How much of each period a string keeps when it rings for `seconds` before it falls by 60 dB. */
const keptOver = (seconds: number, frequency: number) => 10 ** (-3 / (seconds * frequency));

/**
 * How much the bow pushes the string at the bow, in the velocity it adds to each wave leaving it,
 * when the string would move at `slip` under the bow if left alone, pressed with `force`. It holds
 * the string to the bow while the friction it takes stays below sticking friction; past that, the
 * string slides, and the friction falls the faster it slides, towards sliding friction.
 */
function friction(slip: number, force: number, settles: number) {
  const size = Math.abs(slip);
  if (size <= force * STICKING) {
    return slip;
  }
  const over = size - force * SLIDING - settles;
  const sliding = (over + Math.sqrt(over * over + 4 * settles * (size - force * STICKING))) / 2;
  return Math.sign(slip) * (size - sliding);
}

/**
 * A string of a violin, a viola, a cello or a double bass by digital waveguide, played one note at
 * a time and worked out four times a sample, so that each slip of the bow can fall between samples
 * and the note keeps in tune. Bowed, the bow drags the string along until it slips, over and over,
 * pressed harder the nearer the bridge it draws and the faster it goes, as a player does, so that
 * it takes the note cleanly as it comes up to speed; velocity and the Bow make it
 * louder and brighter. Velocity also sets how a stroke comes in: over 100 it is accented, louder
 * and brighter for a moment, under 100 it comes in gently. How the bow takes the string is the same whatever the
 * velocity, as starting it otherwise can leave some notes slipping twice a period all through. A note played while another is held moves the finger without lifting the
 * bow, and one played after a rest starts a new stroke, the bow coming up to speed as slowly as
 * the Attack says. Plucked, the finger pulls the string and lets it go on every note, and it rings
 * until the finger lifts. Where it is bowed or plucked colours it, and the body after it.
 */
export class Strings {
  private readonly sampleRate: number;
  private readonly body: Body;
  private readonly noise = noiseSource();
  private readonly toBridge = new DelayLine(STRING_SIZE);
  private readonly toNut = new DelayLine(STRING_SIZE);
  private readonly tone: Slope;
  private events: StringsEvent[] = [];
  private held: HeldNote[] = [];
  private note = 60;
  private velocity = 0;
  private bowing = 0;
  private contact = 0;
  private kept = BOWED_LOSS;
  private reflected = 0;
  private pendingPluck = false;
  private plucking = 0;
  private pluckStrength = 0;
  private finger = 0;
  private sinceStroke = 0;
  private vibratoPhase = 0;
  private dcIn = 0;
  private dcOut = 0;
  private quietFrames = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.body = new Body(sampleRate);
    this.tone = new Slope(sampleRate, false, 2);
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
   * Fills `output` with the frames from `startFrame` on. While nothing is played and the sound has
   * died away, nothing is worked out until the frame of the next note.
   */
  process(output: Float32Array, startFrame: number, settings: StringsSettings) {
    const wakes = this.resting() ? Math.max(0, Math.min(output.length, (this.events[0]?.frame ?? Infinity) - startFrame)) : 0;
    output.fill(0, 0, wakes);
    if (wakes === output.length) {
      return;
    }
    const bowed = settings.play === "bowed";
    const brightness = clamp(settings.brightness, 0, 1);
    const noise = clamp(settings.noise, 0, 1);
    const vibrato = clamp(settings.vibrato, 0, 1);
    const pressure = clamp(settings.pressure, 0, 1);
    const force = LIGHTEST_FORCE * (HEAVIEST_FORCE / LIGHTEST_FORCE) ** pressure;
    const pressing = BOW_SPEED * force;
    const sharpens = bowed ? BOW_SHARPENS + HEAVY_SHARPENS * Math.max(0, force - HEAVY_FORCE) : 0;
    const settles = BOW_SPEED * SLIDING_SETTLES;
    const attack = smoothing(FASTEST_ATTACK_SECONDS + (SLOWEST_ATTACK_SECONDS - FASTEST_ATTACK_SECONDS) * clamp(settings.attack, 0, 1), this.sampleRate);
    const lift = smoothing(LIFT_SECONDS, this.sampleRate);
    const leaves = smoothing(LEAVES_SECONDS, this.sampleRate);
    const lossMoves = smoothing(LOSS_MOVES_SECONDS, this.sampleRate);
    const rate = this.sampleRate * OVERSAMPLE;
    const fingerCutoff = smoothing(1 / (2 * Math.PI * FINGER_CUTOFF), rate);
    const vibratoStep = (2 * Math.PI * VIBRATO_HZ) / this.sampleRate;
    for (let frame = wakes; frame < output.length; frame++) {
      while (this.events.length > 0 && this.events[0].frame <= startFrame + frame) {
        this.apply(this.events.shift()!, bowed);
      }
      const holding = this.held.length > 0;
      const drawing = holding && bowed;
      const accent = clamp((this.velocity - PLAIN_VELOCITY) / (127 - PLAIN_VELOCITY), 0, 1);
      const softness = clamp((PLAIN_VELOCITY - this.velocity) / PLAIN_VELOCITY, 0, 1);
      this.bowing += ((drawing ? 1 : 0) - this.bowing) * (drawing ? attack : lift);
      const sinceStroke = this.sinceStroke / this.sampleRate;
      const bite = accent * Math.exp(-sinceStroke / BITE_SECONDS);
      const entry = 1 - softness * Math.exp(-sinceStroke / SOFT_ENTRY_SECONDS);
      this.contact += ((drawing ? 1 : 0) - this.contact) * (drawing ? lift : leaves);

      const grown = clamp((this.sinceStroke / this.sampleRate - VIBRATO_WAITS_SECONDS) / VIBRATO_GROWS_SECONDS, 0, 1);
      const swing = vibrato * grown * Math.sin(this.vibratoPhase);
      this.vibratoPhase = (this.vibratoPhase + vibratoStep) % (2 * Math.PI);
      this.sinceStroke++;

      const strength = this.velocity / 127;
      const dynamic = clamp(at(settings.bow, frame), 0, 1) * (SOFTEST_VELOCITY + (1 - SOFTEST_VELOCITY) * strength);
      const frequency = hertz(this.note, at(settings.detune, frame) + VIBRATO_CENTS * swing - sharpens);
      const side = clamp(settings.position, Math.max(NEAREST_SIDE, (SHORTEST_SIDE * frequency) / rate), FARTHEST_SIDE);
      const corner = LOOP_HARMONICS * (REFERENCE_POSITION / side) ** NEAR_BRIDGE_SHARPER;
      const { pole, delay, gain } = lowpass(corner * frequency, frequency, rate);
      const length = rate / frequency - delay;
      if (this.pendingPluck) {
        this.pendingPluck = false;
        this.plucking = Math.max(1, Math.round(side * length));
      }

      const kept = drawing ? BOWED_LOSS : Math.min(keptOver(holding ? this.ringsFor(frequency) : STOPPED_RINGS_SECONDS, frequency) / gain, MOST_REFLECTED);
      this.kept += (kept - this.kept) * lossMoves;

      const random = this.noise();
      const hair = 1 + noise * HAIR_NOISE * (1 + SCRATCH * (1 - this.bowing)) * random;
      const bowSpeed = BOW_SPEED * this.bowing * (1 + VIBRATO_PRESSES * swing) * hair;
      const grip = this.contact * pressing * (RESTING_PRESSES + (1 - RESTING_PRESSES) * this.bowing) * (REFERENCE_POSITION / side) ** NEAR_BRIDGE_PRESSES;
      let heard = 0;
      for (let step = 0; step < OVERSAMPLE; step++) {
        const fromBridge = this.toBridge.read(side * length);
        const fromNut = this.toNut.read((1 - side) * length);
        this.reflected = (1 - pole) * fromBridge + pole * this.reflected;
        const bridgeReflection = -this.kept * this.reflected;
        const nutReflection = -fromNut;
        const drag = friction(bowSpeed - (bridgeReflection + nutReflection), grip, settles);
        const pull = this.plucking > 0 ? PLUCK * this.pluckStrength : 0;
        if (this.plucking > 0) {
          this.plucking--;
        }
        this.finger += (pull - this.finger) * fingerCutoff;
        this.toNut.write(bridgeReflection + drag + this.finger);
        this.toBridge.write(nutReflection + drag + this.finger);
        heard += fromBridge;
      }
      const fromBridge = heard / OVERSAMPLE;

      this.dcOut = fromBridge - this.dcIn + DC_BLOCK * this.dcOut;
      this.dcIn = fromBridge;
      const level = bowed ? (entry * (1 + BITE_LOUDER * bite * this.bowing) * dynamic * side) / REFERENCE_POSITION : 1;
      const loudness = bowed ? dynamic : this.pluckStrength;
      this.tone.tune(
        TONE *
          TONE_RANGE ** brightness *
          (SOFT_DARKER + LOUD_BRIGHTER * loudness) *
          (REFERENCE_POSITION / side) ** NEAR_BRIDGE_BRIGHTER *
          (1 + PRESSED_BRIGHTER * pressure) *
          (bowed ? 1 + BITE_BRIGHTER * bite : 1),
      );
      output[frame] = softLimit(this.body.next(this.tone.next(this.dcOut)) * level * LEVEL);
      this.quietFrames = !drawing && this.plucking === 0 && Math.abs(output[frame]) < QUIET ? this.quietFrames + 1 : 0;
    }
  }

  /** How long a plucked string rings, longer the lower it is. */
  private ringsFor(frequency: number) {
    return PLUCK_RINGS_SECONDS * Math.sqrt(PLUCK_RINGS_AT_HZ / frequency);
  }

  /** Whether nothing is played and the sound has stayed below hearing for a while. */
  private resting() {
    return this.quietFrames > RESTS_AFTER_SECONDS * this.sampleRate;
  }

  private schedule(event: StringsEvent) {
    this.events.push(event);
    this.events.sort((a, b) => a.frame - b.frame);
  }

  private apply(event: StringsEvent, bowed: boolean) {
    if (event.type === "all") {
      this.held = [];
      return;
    }
    const wasHolding = this.held.length > 0;
    this.held = this.held.filter(({ note }) => note !== event.note);
    if (event.type === "on") {
      if (!wasHolding) {
        this.sinceStroke = 0;
      }
      if (!bowed) {
        this.pendingPluck = true;
        this.pluckStrength = SOFTEST_VELOCITY + (1 - SOFTEST_VELOCITY) * (event.velocity / 127);
      }
      this.held.push({ note: event.note, velocity: event.velocity });
    }
    const playing = this.held.at(-1);
    if (playing) {
      this.note = playing.note;
      this.velocity = playing.velocity;
    }
  }
}
