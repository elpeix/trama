import { describe, expect, it } from "vitest";
import { WIND_BODY_BANDS, WIND_BORES, WIND_EXCITERS, windBodyFrequencies } from "../../../patch/effects";
import { WIND_INSTRUMENTS, type WindInstrument } from "../../../patch/windInstruments";
import { windBodyResponse } from "./waveguide";
import { Wind, type WindSettings } from "./wind";

const SAMPLE_RATE = 48000;
const BLOCK = 128;

type InstrumentName = keyof typeof WIND_INSTRUMENTS;

const settingsOf = (instrument: WindInstrument, overrides: Partial<WindSettings> = {}): WindSettings => ({
  exciter: instrument.exciter,
  bore: instrument.bore,
  breath: Float32Array.of(0.7),
  detune: Float32Array.of(0),
  noise: 0,
  brightness: instrument.brightness,
  vibrato: 0,
  bell: instrument.bell,
  flare: instrument.flare,
  attack: instrument.attack,
  ...overrides,
});

const settings = (name: InstrumentName = "clarinet", overrides: Partial<WindSettings> = {}) => settingsOf(WIND_INSTRUMENTS[name], overrides);

function newWind(body: readonly number[] = []) {
  const wind = new Wind(SAMPLE_RATE);
  wind.setBody(body);
  return wind;
}

function render(wind: Wind, frames: number, values: WindSettings = settings(), from = 0) {
  const output = new Float32Array(frames);
  for (let start = 0; start < frames; start += BLOCK) {
    const end = Math.min(frames, start + BLOCK);
    wind.process(output.subarray(start, end), from + start, values);
  }
  return output;
}

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);

const peak = (samples: Float32Array) => samples.reduce((most, sample) => Math.max(most, Math.abs(sample)), 0);

/** How strong a frequency is in the samples, by the Goertzel method, over a Hann window. */
function strength(samples: Float32Array, frequency: number) {
  const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / SAMPLE_RATE);
  let previous = 0;
  let before = 0;
  samples.forEach((sample, index) => {
    const windowed = sample * Math.sin((Math.PI * index) / (samples.length - 1)) ** 2;
    const next = windowed + coefficient * previous - before;
    before = previous;
    previous = next;
  });
  return Math.sqrt(Math.max(0, previous * previous + before * before - coefficient * previous * before)) / samples.length;
}

function strongest(samples: Float32Array, from: number, to: number, step: number) {
  let best = from;
  let bestStrength = -1;
  for (let frequency = from; frequency <= to; frequency += step) {
    const found = strength(samples, frequency);
    if (found > bestStrength) {
      bestStrength = found;
      best = frequency;
    }
  }
  return best;
}

/** The frequency near `around` where the samples are strongest, to a twentieth of a hertz. */
function peakNear(samples: Float32Array, around: number) {
  const near = strongest(samples, around * 0.97, around * 1.03, 1);
  return strongest(samples, near - 1, near + 1, 0.05);
}

const hertz = (note: number) => 440 * 2 ** ((note - 69) / 12);
const cents = (frequency: number, note: number) => 1200 * Math.log2(frequency / hertz(note));
const decibels = (ratio: number) => 20 * Math.log10(ratio);

const steady = (samples: Float32Array) => samples.subarray(samples.length - 16384);

/** How strong each harmonic of a frequency is against it, in decibels. */
function harmonicsOf(sound: Float32Array, at: number) {
  const fundamental = strength(sound, at);
  return (number: number) => decibels(strength(sound, at * number) / fundamental);
}

/** How strong each harmonic is against the note, as it sounds, in decibels. */
const harmonics = (sound: Float32Array, note: number) => harmonicsOf(sound, peakNear(sound, hertz(note)));

/** How much of the sound of the harmonics is above a frequency, in decibels. */
function above(sound: Float32Array, note: number, frequency: number) {
  const at = peakNear(sound, hertz(note));
  let all = 0;
  let high = 0;
  for (let number = 1; at * number < 20000; number++) {
    const power = strength(sound, at * number) ** 2;
    all += power;
    high += at * number > frequency ? power : 0;
  }
  return 10 * Math.log10(high / all);
}

/** When the sound first reaches most of the level it keeps, in seconds. */
function speaks(sound: Float32Array) {
  const level = rms(sound.subarray(sound.length - 4096));
  const window = 1024;
  const reached = Array.from({ length: sound.length / window }, (_, index) => rms(sound.subarray(index * window, (index + 1) * window))).findIndex(
    (value) => value > level * 0.7,
  );
  return (reached * window) / SAMPLE_RATE;
}

const playedWith = (instrument: WindInstrument, note: number, velocity = 100, frames = SAMPLE_RATE, overrides: Partial<WindSettings> = {}) => {
  const wind = newWind(instrument.body);
  wind.noteOn(note, 0, velocity);
  return render(wind, frames, settingsOf(instrument, overrides));
};

const playedAs = (name: InstrumentName, note: number, velocity = 100, frames = SAMPLE_RATE, overrides: Partial<WindSettings> = {}) =>
  playedWith(WIND_INSTRUMENTS[name], note, velocity, frames, overrides);

describe.each<{ name: InstrumentName; low: number; high: number; speaksWithin: number }>([
  { name: "clarinet", low: 50, high: 91, speaksWithin: 0.2 },
  { name: "flute", low: 60, high: 96, speaksWithin: 0.2 },
  { name: "oboe", low: 58, high: 91, speaksWithin: 0.2 },
  { name: "bassoon", low: 34, high: 72, speaksWithin: 0.35 },
  { name: "horn", low: 41, high: 77, speaksWithin: 0.2 },
  { name: "sax", low: 49, high: 80, speaksWithin: 0.2 },
  { name: "recorder", low: 65, high: 91, speaksWithin: 0.2 },
  { name: "pan", low: 67, high: 91, speaksWithin: 0.2 },
  { name: "flabiol", low: 79, high: 98, speaksWithin: 0.2 },
  { name: "tible", low: 64, high: 89, speaksWithin: 0.2 },
  { name: "tenora", low: 52, high: 82, speaksWithin: 0.2 },
  { name: "fiscorn", low: 42, high: 72, speaksWithin: 0.2 },
  { name: "trumpet", low: 52, high: 84, speaksWithin: 0.2 },
  { name: "trombone", low: 40, high: 70, speaksWithin: 0.2 },
])("Wind, as a $name", ({ name, low, high, speaksWithin }) => {
  const as = (overrides: Partial<WindSettings> = {}) => settings(name, overrides);

  const played = (note: number, velocity = 100, frames = SAMPLE_RATE, values = as()) => {
    const wind = newWind(WIND_INSTRUMENTS[name].body);
    wind.noteOn(note, 0, velocity);
    return render(wind, frames, values);
  };

  const fresh = () => newWind(WIND_INSTRUMENTS[name].body);

  const middle = Math.round((low + high) / 2);

  it("stays silent until a note is played", () => {
    expect(rms(render(fresh(), 4096, as()))).toBe(0);
  });

  it("starts the note on the frame it is played", () => {
    const wind = fresh();
    wind.noteOn(middle, 300, 100);

    const output = render(wind, 4096, as());

    expect(rms(output.subarray(0, 300))).toBe(0);
    expect(rms(output.subarray(300))).toBeGreaterThan(0);
  });

  it("plays in tune over its range", () => {
    for (let note = low; note <= high; note += 5) {
      const sound = steady(played(note));

      expect(Math.abs(cents(peakNear(sound, hertz(note)), note)), `note ${note}`).toBeLessThan(6);
    }
  });

  it("speaks soon after the lowest note is played", () => {
    expect(speaks(played(low, 100, SAMPLE_RATE / 2))).toBeLessThan(speaksWithin);
  });

  it("reaches half its level within 0.1 s, low or high, soft or hard, or half the time it takes to speak if it is slower", () => {
    const window = Math.round(0.02 * SAMPLE_RATE);
    const by = Math.round(Math.max(0.1, speaksWithin / 2) * SAMPLE_RATE);
    for (const note of [low, low + 5, middle, high]) {
      for (const velocity of [60, 110]) {
        const sound = played(note, velocity);
        const level = rms(steady(sound));

        expect(rms(sound.subarray(by - window, by)), `note ${note} at ${velocity}`).toBeGreaterThan(level * 0.5);
      }
    }
  });

  it("starts with the colour it keeps, not on a harmonic above the note", () => {
    for (const note of [low, low + 5, middle]) {
      const sound = played(note, 100, SAMPLE_RATE, as({ noise: 0.2 }));
      const at = peakNear(steady(sound), hertz(note));
      const attack = sound.subarray(Math.round(0.03 * SAMPLE_RATE), Math.round(0.1 * SAMPLE_RATE));
      const balance = (part: Float32Array) =>
        decibels(Math.max(...[2, 3, 4, 5].map((number) => strength(part, at * number))) / strength(part, at));

      expect(balance(attack), `note ${note}`).toBeLessThan(balance(steady(sound)) + 10);
    }
  });

  it("plays louder and brighter the harder the note is played", () => {
    const soft = steady(played(middle, 30));
    const hard = steady(played(middle, 127));
    const brightness = (sound: Float32Array) => {
      const at = peakNear(sound, hertz(middle));
      return strength(sound, at * 3) / strength(sound, at);
    };

    expect(decibels(rms(hard) / rms(soft))).toBeGreaterThan(6);
    expect(brightness(hard)).toBeGreaterThan(brightness(soft));
  });

  it("plays louder with more breath, and the breath can change on every sample", () => {
    const little = steady(played(middle, 100, SAMPLE_RATE, as({ breath: Float32Array.of(0.2) })));
    const much = steady(played(middle, 100, SAMPLE_RATE, as({ breath: new Float32Array(BLOCK).fill(1) })));

    expect(rms(much)).toBeGreaterThan(rms(little) * 1.5);
  });

  it("still sounds with no breath of its own, softly, so that a cable can bring the breath in", () => {
    expect(rms(steady(played(middle, 100, SAMPLE_RATE, as({ breath: Float32Array.of(0) }))))).toBeGreaterThan(0.005);
  });

  it("sounds about as loud as the clarinet", () => {
    const clarinet = rms(steady(playedAs("clarinet", middle)));

    expect(Math.abs(decibels(rms(steady(played(middle))) / clarinet))).toBeLessThan(6);
  });

  it("keeps below full scale, however hard and high it is played", () => {
    for (let note = low; note <= high + 7; note += 6) {
      const sound = played(note, 127, SAMPLE_RATE, as({ breath: Float32Array.of(1), noise: 1, brightness: 1, vibrato: 1 }));

      expect(peak(sound), `note ${note}`).toBeLessThan(1);
    }
  });

  it("is brighter with more brightness", () => {
    const upper = (brightness: number) => above(steady(played(low + 2, 100, SAMPLE_RATE, as({ brightness }))), low + 2, 3000);

    expect(upper(1)).toBeGreaterThan(upper(0) + 3);
  });

  it("blows air into the sound with noise", () => {
    const between = (noise: number) => strength(steady(played(middle, 100, SAMPLE_RATE, as({ noise }))), hertz(middle) * 2.5);

    expect(between(1)).toBeGreaterThan(between(0) * 3);
  });

  it("moves by the detune, in cents, which can change on every sample", () => {
    const up = steady(played(middle, 100, SAMPLE_RATE, as({ detune: new Float32Array(BLOCK).fill(100) })));

    expect(Math.abs(cents(peakNear(up, hertz(middle + 1)), middle + 1))).toBeLessThan(6);
  });

  it("stops soon after the note is let go", () => {
    const wind = fresh();
    wind.noteOn(middle, 0, 100);
    wind.noteOff(middle, SAMPLE_RATE / 2);

    const output = render(wind, SAMPLE_RATE, as());

    expect(rms(output.subarray(SAMPLE_RATE / 2 - 4096, SAMPLE_RATE / 2))).toBeGreaterThan(0.02);
    expect(peak(output.subarray(SAMPLE_RATE / 2 + 0.15 * SAMPLE_RATE))).toBeLessThan(0.001);
  });

  it("stops working out the sound a while after it falls silent, and wakes on the frame of the next note", () => {
    const wind = fresh();
    const next = Math.round(1.5 * SAMPLE_RATE) + 37;
    wind.noteOn(middle, 0, 100);
    wind.noteOff(middle, SAMPLE_RATE / 2);
    wind.noteOn(middle, next, 100);

    const output = render(wind, 3 * SAMPLE_RATE, as());

    expect(output.subarray(SAMPLE_RATE, next).every((sample) => sample === 0)).toBe(true);
    expect(rms(output.subarray(next, next + 2048))).toBeGreaterThan(0);
    expect(Math.abs(cents(peakNear(steady(output), hertz(middle)), middle))).toBeLessThan(6);
  });

  it("stops at once on all notes off", () => {
    const wind = fresh();
    wind.noteOn(middle, 0, 100);
    wind.noteOn(middle + 4, 0, 100);
    wind.allNotesOff(SAMPLE_RATE / 2);

    const output = render(wind, SAMPLE_RATE, as());

    expect(peak(output.subarray(SAMPLE_RATE / 2 + 0.15 * SAMPLE_RATE))).toBeLessThan(0.001);
  });

  it("slurs to a note played while another is held, without stopping the sound", () => {
    const wind = fresh();
    wind.noteOn(middle, 0, 100);
    wind.noteOn(middle + 4, SAMPLE_RATE / 2, 100);
    wind.noteOff(middle, SAMPLE_RATE / 2);

    const output = render(wind, SAMPLE_RATE, as());
    const level = Math.min(rms(output.subarray(SAMPLE_RATE / 2 - 4096, SAMPLE_RATE / 2)), rms(steady(output)));
    const window = 512;
    const quietest = Math.min(
      ...Array.from({ length: 16 }, (_, index) => rms(output.subarray(SAMPLE_RATE / 2 + index * window, SAMPLE_RATE / 2 + (index + 1) * window))),
    );

    expect(quietest).toBeGreaterThan(level * 0.7);
    expect(Math.abs(cents(peakNear(steady(output), hertz(middle + 4)), middle + 4))).toBeLessThan(6);
  });

  it("goes back to the note still held when the later one is let go", () => {
    const wind = fresh();
    wind.noteOn(middle, 0, 100);
    wind.noteOn(middle + 4, SAMPLE_RATE / 4, 100);
    wind.noteOff(middle + 4, SAMPLE_RATE / 2);

    const output = render(wind, SAMPLE_RATE, as());

    expect(Math.abs(cents(peakNear(steady(output), hertz(middle)), middle))).toBeLessThan(6);
    expect(rms(steady(output))).toBeGreaterThan(0.02);
  });

  it("tongues a note played after a short rest: the sound dips between the two", () => {
    const wind = fresh();
    const rest = Math.round(0.05 * SAMPLE_RATE);
    wind.noteOn(middle, 0, 100);
    wind.noteOff(middle, SAMPLE_RATE / 2);
    wind.noteOn(middle, SAMPLE_RATE / 2 + rest, 100);

    const output = render(wind, SAMPLE_RATE, as());
    const level = rms(output.subarray(SAMPLE_RATE / 2 - 4096, SAMPLE_RATE / 2));

    expect(rms(output.subarray(SAMPLE_RATE / 2 + rest - 512, SAMPLE_RATE / 2 + rest))).toBeLessThan(level * 0.5);
    expect(rms(steady(output))).toBeGreaterThan(level * 0.7);
  });

  it("brings a vibrato in a while after the note starts, in the level and the pitch", () => {
    const period = SAMPLE_RATE / hertz(middle);
    const window = Math.round(period * Math.round((0.02 * SAMPLE_RATE) / period));
    const swing = (sound: Float32Array, from: number, to: number) => {
      const levels = Array.from({ length: Math.floor(((to - from) * SAMPLE_RATE) / window) }, (_, index) =>
        rms(sound.subarray(from * SAMPLE_RATE + index * window, from * SAMPLE_RATE + (index + 1) * window)),
      );
      return Math.max(...levels) / Math.min(...levels);
    };
    const still = played(middle, 100, 2 * SAMPLE_RATE);
    const shaking = played(middle, 100, 2 * SAMPLE_RATE, as({ vibrato: 1 }));
    const spread = (sound: Float32Array) => {
      const tail = sound.subarray(SAMPLE_RATE);
      const at = hertz(middle);
      return strength(tail, at + 5.2) / strength(tail, at);
    };

    expect(swing(still, 1, 2)).toBeLessThan(1.05);
    expect(swing(shaking, 1, 2)).toBeGreaterThan(1.15);
    expect(swing(shaking, 0.25, 0.4)).toBeLessThan(swing(shaking, 1, 2));
    expect(spread(shaking)).toBeGreaterThan(spread(still) * 2);
  });

  it("goes on playing when what blows it and its bore change", () => {
    const wind = fresh();
    wind.noteOn(middle, 0, 100);
    render(wind, SAMPLE_RATE / 2, as(name === "flute" ? { exciter: "reed", bore: "cylinder" } : { exciter: "air" }));

    const after = render(wind, SAMPLE_RATE / 2, as(), SAMPLE_RATE / 2);

    expect(after.every(Number.isFinite)).toBe(true);
    expect(rms(steady(after))).toBeGreaterThan(0.02);
  });
});

/** The oboe, the bassoon and the horn as they were when the Wind was made general, before their presets were tuned by ear. */
const BEFORE_GENERAL: Record<"oboe" | "bassoon" | "horn", WindInstrument> = {
  oboe: {
    exciter: "double reed",
    bore: "cone",
    brightness: 0.86,
    bell: 4500,
    flare: 0,
    attack: 0.5,
    noise: 0.2,
    vibrato: 0.25,
    body: [0, 0, 0, 0, 0, 0.5, 0.5, 1, 1.5, 1.5, 2, 3, 4, 5, 7, 9, 11.5, 15, 15, 11.5, 8, 6, 5, 7, 9, 7.5, 5, 3.5, 2.5, 2, 1.5, 1],
  },
  bassoon: {
    exciter: "double reed",
    bore: "cone",
    brightness: 0.56,
    bell: 2500,
    flare: 0,
    attack: 0.5,
    noise: 0.2,
    vibrato: 0.1,
    body: [2, 2, 2.5, 3.5, 4.5, 5.5, 7, 8.5, 11, 13.5, 16.5, 19, 17, 13, 9.5, 8, 8, 10.5, 10.5, 8, 6, 4.5, 4, 3, 2, 1.5, 1.5, 1, 0.5, 0, 0, 0],
  },
  horn: {
    exciter: "lips",
    bore: "cone",
    brightness: 0.69,
    bell: 600,
    flare: 1,
    attack: 0.21,
    noise: 0.1,
    vibrato: 0,
    body: [3.5, 4.5, 5.5, 6.5, 8, 9, 10.5, 11.5, 12.5, 13.5, 14, 14, 13.5, 13.5, 14, 15, 15.5, 15.5, 14.5, 13, 11.5, 10.5, 9, 8, 6.5, 5.5, 4.5, 3.5, 3, 2.5, 1.5, 1],
  },
};

describe("Wind, sounding as it did before it was made general", () => {
  const before: Record<"flute" | "oboe" | "bassoon" | "horn", { note: number; velocity: number; rms: number; harmonics: number[] }[]> = {
    flute: [
      { note: 60, velocity: 50, rms: 0.075, harmonics: [-15.1, -12.4, -19.8, -21, -25.6, -28.8, -32.3] },
      { note: 60, velocity: 110, rms: 0.1501, harmonics: [-14.6, -11.5, -17.9, -19, -22.2, -25.4, -27] },
      { note: 72, velocity: 50, rms: 0.073, harmonics: [-9.9, -17.5, -21.6, -29.2, -32.4, -39.1, -42.8] },
      { note: 72, velocity: 110, rms: 0.1483, harmonics: [-8.5, -15.5, -17.4, -25, -25.2, -32.1, -32] },
      { note: 84, velocity: 50, rms: 0.0687, harmonics: [-9.7, -26.6, -34.1, -49.8, -70.4, -70.6, -74.3] },
      { note: 84, velocity: 110, rms: 0.1441, harmonics: [-6.8, -22.9, -25.2, -36.9, -40.2, -49.8, -55.8] },
    ],
    oboe: [
      { note: 58, velocity: 50, rms: 0.0525, harmonics: [-3.3, -3.1, -0.5, -9.1, -5.3, -11.5, -13] },
      { note: 58, velocity: 110, rms: 0.0893, harmonics: [-3.7, -2.7, -0.3, -5.4, -4.9, -13.5, -12.4] },
      { note: 67, velocity: 50, rms: 0.0621, harmonics: [0.5, 4, -3.9, -26.7, -15.9, -15.6, -16.5] },
      { note: 67, velocity: 110, rms: 0.1061, harmonics: [0, 4.9, -3.3, -18.9, -14.9, -16.9, -14.6] },
      { note: 79, velocity: 50, rms: 0.037, harmonics: [-3.6, -16.1, -17.2, -45, -39.4, -51.4, -60] },
      { note: 79, velocity: 110, rms: 0.0604, harmonics: [-3.7, -13, -13.5, -31.2, -31.6, -44, -44.5] },
    ],
    bassoon: [
      { note: 36, velocity: 50, rms: 0.0683, harmonics: [-1.5, -4.4, -2.3, -20.8, -1.6, 4.1, -0.9] },
      { note: 36, velocity: 110, rms: 0.1038, harmonics: [-2.3, -3.4, -2.3, -12.3, -1.3, 0.3, 0.5] },
      { note: 46, velocity: 50, rms: 0.072, harmonics: [-0.2, 1.9, 6.2, -15.7, -8.8, -12.6, -13.6] },
      { note: 46, velocity: 110, rms: 0.1219, harmonics: [-0.7, 2.5, 6.4, -8.7, -8.4, -14.8, -12.8] },
      { note: 60, velocity: 50, rms: 0.0596, harmonics: [4.8, -10.2, -11.5, -33.7, -21.9, -27.1, -30.6] },
      { note: 60, velocity: 110, rms: 0.0941, harmonics: [4.2, -9, -10.8, -22.8, -20.7, -28.5, -28.3] },
    ],
    horn: [
      { note: 43, velocity: 50, rms: 0.0716, harmonics: [4.8, 2.5, 1, -2.8, -6.8, 0.3, -6.1] },
      { note: 43, velocity: 110, rms: 0.1203, harmonics: [4.4, 2.8, 1.1, -0.4, -6.5, -1.7, -5.6] },
      { note: 55, velocity: 50, rms: 0.0635, harmonics: [5.4, -1.4, -4, -12.6, -12.8, -6.7, -18.9] },
      { note: 55, velocity: 110, rms: 0.1059, harmonics: [4.9, -0.8, -3.5, -6.4, -10.9, -6.1, -13.9] },
      { note: 67, velocity: 50, rms: 0.043, harmonics: [0.7, -8.8, -17.1, -39.1, -38.6, -37.3, -53.2] },
      { note: 67, velocity: 110, rms: 0.0725, harmonics: [0.5, -5.9, -12.1, -20.3, -25.3, -22.8, -31.4] },
    ],
  };

  it.each(["flute", "horn"] as const)("keeps the %s as it was, harmonic by harmonic", (name) => {
    before[name].forEach(({ note, velocity, harmonics: was }) => {
      const instrument = name === "flute" ? WIND_INSTRUMENTS.flute : BEFORE_GENERAL.horn;
      const harmonic = harmonicsOf(steady(playedWith(instrument, note, velocity)), hertz(note));

      was.forEach((value, index) => {
        if (value > -30) {
          expect(Math.abs(harmonic(index + 2) - value), `note ${note} at ${velocity}, harmonic ${index + 2}`).toBeLessThan(3);
        }
      });
    });
  });

  it("keeps the flute as loud as it was, as its body is flat", () => {
    before.flute.forEach(({ note, velocity, rms: level }) => {
      expect(Math.abs(decibels(rms(steady(playedAs("flute", note, velocity))) / level)), `note ${note} at ${velocity}`).toBeLessThan(2);
    });
  });

  it.each(["oboe", "bassoon"] as const)(
    "keeps the %s as it was where its valve drove every harmonic, and gives back the second, the fifth and the seventh",
    (name) => {
      before[name].forEach(({ note, velocity, harmonics: was }) => {
        const harmonic = harmonicsOf(steady(playedWith(BEFORE_GENERAL[name], note, velocity)), hertz(note));

        [3, 4, 6, 8].forEach((number) => {
          if (was[number - 2] > -30) {
            expect(Math.abs(harmonic(number) - was[number - 2]), `note ${note} at ${velocity}, harmonic ${number}`).toBeLessThan(3);
          }
        });
        [2, 5, 7].forEach((number) => {
          expect(harmonic(number), `note ${note} at ${velocity}, harmonic ${number}`).toBeGreaterThan(was[number - 2] + 2);
        });
      });
    },
  );
});

describe("Wind, instrument by instrument", () => {
  const played = (name: InstrumentName, note: number, velocity = 100) => steady(playedAs(name, note, velocity));

  it("sounds like a clarinet low down: hollow, the odd harmonics well above the even ones", () => {
    const harmonic = harmonics(played("clarinet", 50), 50);

    expect(harmonic(3) - harmonic(2)).toBeGreaterThan(15);
    expect(harmonic(5) - harmonic(4)).toBeGreaterThan(15);
  });

  it("gives the clarinet even harmonics higher up, where its open holes let the reed be heard", () => {
    const harmonic = harmonics(played("clarinet", 72), 72);

    expect(Math.max(harmonic(2), harmonic(4))).toBeGreaterThan(-35);
  });

  it("makes the clarinet purer the higher it plays", () => {
    const highest = harmonics(played("clarinet", 91), 91);

    expect(Math.max(highest(2), highest(3), highest(4))).toBeLessThan(-20);
    expect(harmonics(played("clarinet", 72), 72)(3)).toBeLessThan(harmonics(played("clarinet", 50), 50)(3) - 4);
  });

  it("sounds like a flute: a strong note, an octave above it, and little else", () => {
    const harmonic = harmonics(played("flute", 72), 72);

    expect(harmonic(2)).toBeGreaterThan(-20);
    expect(harmonic(2)).toBeLessThan(-3);
    expect(harmonic(4)).toBeLessThan(harmonic(2));
    expect(harmonic(6)).toBeLessThan(-20);
  });

  it("sounds like an oboe: nasal, with harmonics from the second to the fifth as strong as the note", () => {
    const harmonic = harmonics(played("oboe", 65), 65);

    expect(Math.max(harmonic(2), harmonic(3), harmonic(4), harmonic(5))).toBeGreaterThan(-3);
    expect(harmonic(2)).toBeGreaterThan(-15);
    expect(harmonic(10)).toBeLessThan(-15);
  });

  it("lets little of the oboe through above 5 kHz, as its tone holes do, a little more when blown hard", () => {
    expect(above(played("oboe", 65, 60), 65, 5000)).toBeLessThan(-35);
    expect(above(played("oboe", 65, 127), 65, 5000)).toBeLessThan(-30);
  });

  it("sounds like a bassoon: low notes strongest in the harmonics around 500 Hz", () => {
    const harmonic = harmonics(played("bassoon", 41), 41);

    expect(Math.max(harmonic(5), harmonic(6))).toBeGreaterThan(0);
    expect(harmonic(2)).toBeGreaterThan(-15);
  });

  it("lets little of the bassoon through above 3 kHz, darker than the oboe", () => {
    expect(above(played("bassoon", 46), 46, 3000)).toBeLessThan(-35);
  });

  it("sounds like a horn: round when soft, opening up when blown hard", () => {
    const upper = (velocity: number) => {
      const harmonic = harmonics(played("horn", 65, velocity), 65);
      return Math.max(harmonic(6), harmonic(7), harmonic(8));
    };

    expect(upper(40)).toBeLessThan(-25);
    expect(upper(127) - upper(40)).toBeGreaterThan(6);
  });

  it("leaves no harmonic missing among the first twelve of a valve blown in short of halfway", () => {
    (["horn", "oboe", "bassoon"] as const).forEach((name) => {
      [41, 48, 53].forEach((note) => {
        const harmonic = harmonics(played(name, note + (name === "oboe" ? 17 : 0)), note + (name === "oboe" ? 17 : 0));
        for (let number = 2; number <= 12; number++) {
          const neighbours = (harmonic(number - 1) + harmonic(number + 1)) / 2;

          expect(harmonic(number), `${name}, note ${note}, harmonic ${number}`).toBeGreaterThan(neighbours - 12);
        }
      });
    });
  });

  it("keeps the horn darker than the oboe", () => {
    expect(above(played("horn", 65), 65, 2000)).toBeLessThan(above(played("oboe", 65), 65, 2000) - 6);
  });

  it("sounds like a sax: rich low down, every harmonic close behind the note", () => {
    const harmonic = harmonics(played("sax", 52), 52);

    expect(Math.min(harmonic(2), harmonic(3), harmonic(4))).toBeGreaterThan(-12);
  });

  it("makes the sax nasal in the middle: harmonics just above the note stronger than the note itself", () => {
    const harmonic = harmonics(played("sax", 61), 61);

    expect(Math.max(harmonic(2), harmonic(3), harmonic(4))).toBeGreaterThan(2);
  });

  it("keeps the sax bright when played as it usually is", () => {
    expect(above(played("sax", 57, 80), 57, 2000)).toBeGreaterThan(-20);
    expect(above(played("sax", 68, 80), 68, 2000)).toBeGreaterThan(-20);
  });

  it("makes the sax sweet when soft and far brighter when blown hard", () => {
    const upper = (velocity: number) => above(played("sax", 57, velocity), 57, 2000);

    expect(upper(127) - upper(40)).toBeGreaterThan(15);
    expect(upper(127) - upper(40)).toBeGreaterThan(above(played("oboe", 62, 127), 62, 2000) - above(played("oboe", 62, 40), 62, 2000) + 5);
  });

  it("sounds like a recorder: purer than a flute, its jet aimed straight at the edge by the duct", () => {
    const recorder = harmonics(played("recorder", 72), 72);
    const flute = harmonics(played("flute", 72), 72);

    expect(recorder(2)).toBeLessThan(-12);
    expect(recorder(2)).toBeLessThan(flute(2) - 6);
  });

  it("makes the pan flute breathier than the recorder, as much air as tone heard in it", () => {
    const air = (name: InstrumentName) => {
      const sound = steady(playedAs(name, 72, 90, SAMPLE_RATE, { noise: WIND_INSTRUMENTS[name].noise }));
      const at = hertz(72);
      let tone = 0;
      let between = 0;
      for (let number = 1; at * number < 12000; number++) {
        tone += strength(sound, at * number) ** 2;
        between += strength(sound, at * (number + 0.5)) ** 2;
      }
      return 10 * Math.log10(between / tone);
    };

    expect(air("pan")).toBeGreaterThan(air("recorder") + 6);
  });

  it("makes the flabiol high and pure, its jet aimed by a duct", () => {
    expect(harmonics(played("flabiol", 86), 86)(2)).toBeLessThan(-12);
  });

  it("makes the tible the brightest of the double reeds, brighter than the oboe", () => {
    expect(above(played("tible", 72), 72, 2000)).toBeGreaterThan(above(played("oboe", 72), 72, 2000) + 5);
  });

  it("makes the tible and the tenora rich as shawms are, the harmonics up to the seventh close to the note", () => {
    const tible = harmonics(played("tible", 72), 72);
    const tenora = harmonics(played("tenora", 62, 95), 62);

    expect(Math.min(...[2, 3, 4, 5, 6, 7].map(tible))).toBeGreaterThan(-10);
    expect(Math.min(...[2, 3, 4, 5, 6, 7].map(tenora))).toBeGreaterThan(-8);
  });

  it("makes the tenora nasal, and much fuller blown hard than soft, as its metal bell opens", () => {
    const harmonic = harmonics(played("tenora", 60), 60);

    expect(Math.max(...[2, 3, 4, 5, 6, 7, 8].map(harmonic))).toBeGreaterThan(2);
    expect(above(played("tenora", 60, 110), 60, 2000) - above(played("tenora", 60, 50), 60, 2000)).toBeGreaterThan(8);
  });

  it("makes the fiscorn round, but more open than the horn, with no hand in its bell", () => {
    const fiscorn = above(played("fiscorn", 52, 110), 52, 2000);

    expect(fiscorn).toBeGreaterThan(above(played("horn", 52, 110), 52, 2000) + 8);
    expect(fiscorn).toBeLessThan(above(played("oboe", 64, 110), 64, 2000));
  });

  it("orders the brass by brightness, as the bells and the hand in one make them: trumpet, trombone, fiscorn, horn", () => {
    const upper = (name: InstrumentName) => above(played(name, 60, 110), 60, 2000);

    expect(upper("trumpet")).toBeGreaterThan(upper("trombone") + 3);
    expect(upper("trombone")).toBeGreaterThan(upper("fiscorn"));
    expect(upper("fiscorn")).toBeGreaterThan(upper("horn") + 8);
  });

  it("makes the trumpet sweet when soft and brassy when blown hard", () => {
    expect(above(played("trumpet", 69, 120), 69, 2000) - above(played("trumpet", 69, 50), 69, 2000)).toBeGreaterThan(12);
  });

  it("gives the oboe even harmonics, which the clarinet hardly has low down", () => {
    expect(harmonics(played("oboe", 62), 62)(2)).toBeGreaterThan(harmonics(played("clarinet", 62), 62)(2) + 15);
  });
});

describe.each(WIND_EXCITERS.flatMap((exciter) => WIND_BORES.map((bore) => ({ exciter, bore }))))(
  "Wind, blown by $exciter on a $bore",
  ({ exciter, bore }) => {
    const plain: WindInstrument = { exciter, bore, brightness: 0.5, bell: 3000, flare: 0.3, attack: 0.5, noise: 0, vibrato: 0, body: [] };

    const played = (note: number, velocity = 100, overrides: Partial<WindSettings> = {}) => {
      const wind = newWind();
      wind.noteOn(note, 0, velocity);
      return render(wind, SAMPLE_RATE, settingsOf(plain, overrides));
    };

    it("plays in tune, low, in the middle and high", () => {
      [48, 60, 72].forEach((note) => {
        const sound = steady(played(note));

        expect(rms(sound), `note ${note}`).toBeGreaterThan(0.02);
        expect(Math.abs(cents(peakNear(sound, hertz(note)), note)), `note ${note}`).toBeLessThan(6);
      });
    });

    it("speaks soon and keeps below full scale", () => {
      [48, 72].forEach((note) => {
        expect(speaks(played(note).subarray(0, SAMPLE_RATE / 2)), `note ${note}`).toBeLessThan(0.25);
        expect(peak(played(note, 127, { breath: Float32Array.of(1), noise: 1, brightness: 1, vibrato: 1 })), `note ${note}`).toBeLessThan(1);
      });
    });
  },
);

describe("Wind, its body, bell and attack", () => {
  const played = (overrides: Partial<WindSettings> = {}, body: readonly number[] = [], note = 55, velocity = 100) => {
    const wind = newWind(body);
    wind.noteOn(note, 0, velocity);
    return steady(render(wind, SAMPLE_RATE, settings("clarinet", overrides)));
  };

  const bandNear = (frequency: number) => {
    const bands = windBodyFrequencies();
    return bands.reduce((best, band, index) => (Math.abs(Math.log(band / frequency)) < Math.abs(Math.log(bands[best] / frequency)) ? index : best), 0);
  };

  const raised = (frequency: number, gain: number) => Array.from({ length: WIND_BODY_BANDS }, (_, index) => (index === bandNear(frequency) ? gain : 0));

  it("has its bands spread evenly over the octaves from 100 Hz to 8 kHz", () => {
    const bands = windBodyFrequencies();

    expect(bands).toHaveLength(WIND_BODY_BANDS);
    expect(bands[0]).toBeCloseTo(100);
    expect(bands.at(-1)).toBeCloseTo(8000);
  });

  it("makes each bar the gain at its own frequency, however the bars beside it are drawn", () => {
    const frequencies = windBodyFrequencies();
    const shapes = [
      raised(1000, 12),
      Array.from({ length: WIND_BODY_BANDS }, (_, index) => (index < 16 ? 10 : -3)),
      Array.from({ length: WIND_BODY_BANDS }, (_, index) => 12 * Math.sin(index / 2)),
      [...WIND_INSTRUMENTS.oboe.body],
    ];
    shapes.forEach((bars, shape) => {
      bars.forEach((bar, index) => {
        expect(Math.abs(windBodyResponse(bars, frequencies[index], SAMPLE_RATE) - bar), `shape ${shape}, bar ${index}`).toBeLessThan(0.5);
      });
    });
  });

  it("colours the sound with its body, at bands fixed in hertz, by what the bar says", () => {
    const fifth = hertz(55) * 5;
    const flat = harmonics(played(), 55);
    const coloured = harmonics(played({}, Array.from({ length: WIND_BODY_BANDS }, (_, index) => (index === bandNear(fifth) ? 12 : 0))), 55);
    const band = windBodyFrequencies()[bandNear(fifth)];
    const lift = coloured(5) - flat(5) - (coloured(1) - flat(1));

    expect(Math.abs(lift - windBodyResponse(raised(fifth, 12), fifth, SAMPLE_RATE)), `band at ${Math.round(band)} Hz`).toBeLessThan(1.5);
  });

  it("changes the colour and not the loudness, low or high, whatever the body", () => {
    const hump = Array.from({ length: WIND_BODY_BANDS }, (_, index) => (index < 16 ? 10 : -3));
    [50, 62, 74, 86].forEach((note) => {
      [raised(hertz(note), 12), raised(hertz(note) * 3, 12), hump].forEach((body, shape) => {
        const loudness = (shape: readonly number[]) => rms(played({}, shape, note, 60));

        expect(Math.abs(decibels(loudness(body) / loudness([]))), `note ${note}, body ${shape}`).toBeLessThan(1);
      });
    });
  });

  it("lets less through above a lower bell", () => {
    const oboe = (bell: number) => above(steady(playedAs("oboe", 60, 100, SAMPLE_RATE, { bell })), 60, 2000);

    expect(oboe(1500)).toBeLessThan(oboe(4500) - 6);
  });

  it("lets the reed of a clarinet be heard from lower down with a lower bell, even harmonics and all", () => {
    const even = (bell: number) => {
      const harmonic = harmonics(played({ bell }, [], 65), 65);
      return Math.max(harmonic(2), harmonic(4));
    };

    expect(even(1000)).toBeGreaterThan(even(3000) + 3);
  });

  it("opens the bell the harder it is blown, as much as the flare says", () => {
    const opening = (flare: number) => {
      const upper = (velocity: number) => above(steady(playedAs("horn", 55, velocity, SAMPLE_RATE, { flare })), 55, 1500);
      return upper(127) - upper(40);
    };

    expect(opening(1)).toBeGreaterThan(opening(0) + 3);
  });

  it("speaks sooner with a harder attack", () => {
    const speaking = (attack: number) => {
      const wind = newWind();
      wind.noteOn(50, 0, 100);
      return speaks(render(wind, SAMPLE_RATE / 2, settings("clarinet", { attack })));
    };

    expect(speaking(1)).toBeLessThan(speaking(0.1));
  });
});
