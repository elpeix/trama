import { describe, expect, it } from "vitest";
import { STRING_INSTRUMENTS, type StringInstrument } from "../../../patch/stringInstruments";
import { Strings, type StringsSettings } from "./strings";

const SAMPLE_RATE = 48000;
const BLOCK = 128;

type InstrumentName = keyof typeof STRING_INSTRUMENTS;

const settingsOf = (instrument: StringInstrument, overrides: Partial<StringsSettings> = {}): StringsSettings => ({
  play: "bowed",
  bow: Float32Array.of(0.7),
  pressure: instrument.pressure,
  position: instrument.position,
  detune: Float32Array.of(0),
  brightness: instrument.brightness,
  noise: 0,
  vibrato: 0,
  attack: instrument.attack,
  ...overrides,
});

function newStrings(body: readonly number[] = []) {
  const strings = new Strings(SAMPLE_RATE);
  strings.setBody(body);
  return strings;
}

function render(strings: Strings, frames: number, values: StringsSettings, from = 0) {
  const output = new Float32Array(frames);
  for (let start = 0; start < frames; start += BLOCK) {
    const end = Math.min(frames, start + BLOCK);
    strings.process(output.subarray(start, end), from + start, values);
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

const seconds = (time: number) => Math.round(time * SAMPLE_RATE);

/**
 * The loudest part of the start of a note that is not the note, against the level it keeps or the
 * loudest it gets as it starts, if it is accented: how much it scratches or breathes before the
 * string takes the note.
 */
function roughStart(sound: Float32Array, note: number) {
  const period = Math.round(SAMPLE_RATE / hertz(note));
  const window = Math.max(480, 2 * period);
  const starting = Array.from({ length: Math.floor(seconds(0.15) / window) }, (_, index) => rms(sound.subarray(index * window, (index + 1) * window)));
  const level = Math.max(rms(steady(sound)), ...starting);
  let worst = 0;
  for (let from = 0; from + window + period < seconds(0.15); from += 240) {
    let difference = 0;
    for (let index = from + period; index < from + period + window; index++) {
      difference += (sound[index] - sound[index - period]) ** 2;
    }
    worst = Math.max(worst, Math.sqrt(difference / window / 2) / level);
  }
  return worst;
}

describe.each<{ name: InstrumentName; low: number; high: number; speaksWithin: number; rough: number }>([
  { name: "violin", low: 55, high: 93, speaksWithin: 0.25, rough: 0.25 },
  { name: "viola", low: 48, high: 86, speaksWithin: 0.25, rough: 0.3 },
  { name: "cello", low: 36, high: 76, speaksWithin: 0.3, rough: 0.36 },
  { name: "bass", low: 28, high: 67, speaksWithin: 0.4, rough: 0.36 },
])("Strings, as a $name", ({ name, low, high, speaksWithin, rough }) => {
  const instrument = STRING_INSTRUMENTS[name];
  const as = (overrides: Partial<StringsSettings> = {}) => settingsOf(instrument, overrides);
  const fresh = () => newStrings(instrument.body);
  const middle = Math.round((low + high) / 2);

  const played = (note: number, velocity = 100, frames = SAMPLE_RATE, values = as()) => {
    const strings = fresh();
    strings.noteOn(note, 0, velocity);
    return render(strings, frames, values);
  };

  const plucked = (note: number, velocity = 100, frames = SAMPLE_RATE, overrides: Partial<StringsSettings> = {}) =>
    played(note, velocity, frames, as({ play: "plucked", ...overrides }));

  it("stays silent until a note is played", () => {
    expect(rms(render(fresh(), 4096, as()))).toBe(0);
  });

  it("starts the note on the frame it is played", () => {
    const strings = fresh();
    strings.noteOn(middle, 300, 100);

    const output = render(strings, 4096, as());

    expect(rms(output.subarray(0, 300))).toBe(0);
    expect(rms(output.subarray(300))).toBeGreaterThan(0);
  });

  it("plays in tune over its range", () => {
    for (let note = low; note <= high; note += 5) {
      const sound = steady(played(note));

      expect(Math.abs(cents(peakNear(sound, hertz(note)), note)), `note ${note}`).toBeLessThan(5);
    }
  });

  it("keeps in tune bowed near the bridge or over the fingerboard, lightly or heavily", () => {
    for (const note of [low, middle, high]) {
      for (const overrides of [{ position: 0.06 }, { position: 0.2 }, { pressure: 0 }, { pressure: 1 }]) {
        const sound = steady(played(note, 100, SAMPLE_RATE, as(overrides)));

        expect(Math.abs(cents(peakNear(sound, hertz(note)), note)), `note ${note} with ${JSON.stringify(overrides)}`).toBeLessThan(10);
      }
    }
  });

  it("speaks soon after the lowest note is bowed", () => {
    expect(speaks(played(low, 100, SAMPLE_RATE / 2))).toBeLessThan(speaksWithin);
  });

  it("starts as the bow takes hold, not with a blow: quiet in the first 10 ms, low or high, soft or hard", () => {
    for (const note of [low, middle, high]) {
      for (const velocity of [60, 110]) {
        const sound = played(note, velocity);

        expect(rms(sound.subarray(0, seconds(0.01))), `note ${note} at ${velocity}`).toBeLessThan(rms(steady(sound)) * 0.4);
      }
    }
  });

  it("is half way up by 0.15 s, low or high, or by 0.25 s when played softly", () => {
    const window = seconds(0.02);
    for (const note of [low, middle, high]) {
      for (const [velocity, within] of [[60, 0.25], [110, 0.15]]) {
        const by = seconds(Math.max(within, speaksWithin / 2));
        const sound = played(note, velocity);

        expect(rms(sound.subarray(by - window, by)), `note ${note} at ${velocity}`).toBeGreaterThan(rms(steady(sound)) * 0.5);
      }
    }
  });

  it("takes the note cleanly as the bow comes up to speed, the bow pressing harder the faster it goes, not breathing first", () => {
    for (let note = low; note <= high - 5; note += 7) {
      const sound = played(note, 100, SAMPLE_RATE / 2, as({ noise: instrument.noise }));

      expect(roughStart(sound, note), `note ${note}`).toBeLessThan(rough);
    }
  });

  it("bites sooner the harder the note is played, and comes in gently when it is played softly", () => {
    for (const note of [low + 7, middle, high - 5]) {
      const early = (velocity: number) => {
        const sound = played(note, velocity);
        return rms(sound.subarray(seconds(0.015), seconds(0.035))) / rms(steady(sound));
      };

      expect(early(120), `note ${note}`).toBeGreaterThan(early(40) * 1.5);
      expect(speaks(played(note, 120)), `note ${note}`).toBeLessThan(speaks(played(note, 40)));
    }
  });

  it("accents a note played harder than 100: it starts louder and brighter, then settles", () => {
    const accented = (velocity: number) => {
      const sound = played(middle, velocity);
      return rms(sound.subarray(seconds(0.06), seconds(0.16))) / rms(steady(sound));
    };

    expect(decibels(accented(127) / accented(100))).toBeGreaterThan(2);
    expect(Math.abs(decibels(rms(steady(played(middle, 127))) / rms(steady(played(middle, 100)))))).toBeLessThan(3);
  });

  it("takes the note cleanly when played softly, and scratches only a little more when accented", () => {
    for (let note = low; note <= high - 5; note += 7) {
      for (const [velocity, allowed] of [[40, rough], [127, rough * 1.25]]) {
        const sound = played(note, velocity, SAMPLE_RATE / 2, as({ noise: instrument.noise }));

        expect(roughStart(sound, note), `note ${note} at ${velocity}`).toBeLessThan(allowed);
      }
    }
  });

  it("takes longer to get going with a slower attack", () => {
    const reached = (attack: number) => speaks(played(middle, 100, SAMPLE_RATE, as({ attack })));

    expect(reached(1)).toBeGreaterThan(reached(0));
  });

  it("scratches as the bow takes hold: more noise between the harmonics at the start than later", () => {
    const sound = played(middle, 100, SAMPLE_RATE, as({ noise: 0.3 }));
    const at = hertz(middle);
    const roughness = (part: Float32Array) => strength(part, at * 2.5) / rms(part);

    expect(roughness(sound.subarray(seconds(0.01), seconds(0.06)))).toBeGreaterThan(roughness(steady(sound)));
  });

  it("plays louder and brighter the faster the bow, by velocity", () => {
    const soft = steady(played(middle, 40));
    const hard = steady(played(middle, 120));

    expect(decibels(rms(hard) / rms(soft))).toBeGreaterThan(6);
    expect(above(hard, middle, 1500)).toBeGreaterThan(above(soft, middle, 1500));
  });

  it("plays louder with more bow, which can change on every sample", () => {
    const little = steady(played(middle, 100, SAMPLE_RATE, as({ bow: Float32Array.of(0.2) })));
    const much = steady(played(middle, 100, SAMPLE_RATE, as({ bow: new Float32Array(BLOCK).fill(1) })));

    expect(rms(much)).toBeGreaterThan(rms(little) * 1.5);
  });

  it("is brighter bowed near the bridge than over the fingerboard", () => {
    const upper = (position: number) => above(steady(played(middle, 100, SAMPLE_RATE, as({ position }))), middle, 3000);

    expect(upper(0.06)).toBeGreaterThan(upper(0.2) + 3);
  });

  it("is brighter with more brightness", () => {
    const upper = (brightness: number) => above(steady(played(middle, 100, SAMPLE_RATE, as({ brightness }))), middle, 1500);

    expect(upper(1)).toBeGreaterThan(upper(0) + 3);
  });

  it("is brighter bowed heavily than lightly", () => {
    const upper = (pressure: number) => above(steady(played(middle, 100, SAMPLE_RATE, as({ pressure }))), middle, 1500);

    expect(upper(0.9)).toBeGreaterThan(upper(0.2));
  });

  it("sounds about as loud low and high", () => {
    const levels = [low, middle, high].map((note) => rms(steady(played(note))));

    expect(decibels(Math.max(...levels) / Math.min(...levels))).toBeLessThan(8);
  });

  it("sounds about as loud as a Wind does, neither faint nor near full scale", () => {
    const level = rms(steady(played(middle)));

    expect(level).toBeGreaterThan(0.04);
    expect(level).toBeLessThan(0.25);
  });

  it("keeps below full scale, however hard and high it is played", () => {
    for (let note = low; note <= high + 7; note += 6) {
      const values = as({ bow: Float32Array.of(1), pressure: 1, position: 0.06, noise: 1, brightness: 1, vibrato: 1 });

      expect(peak(played(note, 127, SAMPLE_RATE, values)), `note ${note}`).toBeLessThan(1);
      expect(peak(plucked(note, 127, SAMPLE_RATE, { position: 0.04, brightness: 1 })), `plucked ${note}`).toBeLessThan(1);
    }
  });

  it("moves by the detune, in cents, which can change on every sample", () => {
    const up = steady(played(middle, 100, SAMPLE_RATE, as({ detune: new Float32Array(BLOCK).fill(100) })));

    expect(Math.abs(cents(peakNear(up, hertz(middle + 1)), middle + 1))).toBeLessThan(5);
  });

  it("stops soon after the note is let go, as the finger leaves the string", () => {
    const strings = fresh();
    strings.noteOn(middle, 0, 100);
    strings.noteOff(middle, SAMPLE_RATE / 2);

    const output = render(strings, SAMPLE_RATE, as());

    expect(rms(output.subarray(SAMPLE_RATE / 2 - 4096, SAMPLE_RATE / 2))).toBeGreaterThan(0.02);
    expect(peak(output.subarray(SAMPLE_RATE / 2 + seconds(0.4)))).toBeLessThan(0.001);
  });

  it("rings a little after the bow leaves the string, not cut off", () => {
    const strings = fresh();
    strings.noteOn(middle, 0, 100);
    strings.noteOff(middle, SAMPLE_RATE / 2);

    const output = render(strings, SAMPLE_RATE, as());
    const before = rms(output.subarray(SAMPLE_RATE / 2 - 2048, SAMPLE_RATE / 2));

    expect(rms(output.subarray(SAMPLE_RATE / 2 + seconds(0.03), SAMPLE_RATE / 2 + seconds(0.05)))).toBeGreaterThan(before * 0.1);
  });

  it("stops at once on all notes off", () => {
    const strings = fresh();
    strings.noteOn(middle, 0, 100);
    strings.noteOn(middle + 4, 0, 100);
    strings.allNotesOff(SAMPLE_RATE / 2);

    const output = render(strings, SAMPLE_RATE, as());

    expect(peak(output.subarray(SAMPLE_RATE / 2 + seconds(0.4)))).toBeLessThan(0.001);
  });

  it("stops working out the sound a while after it falls silent, and wakes on the frame of the next note", () => {
    for (const play of ["bowed", "plucked"] as const) {
      const strings = fresh();
      const next = Math.round(2.5 * SAMPLE_RATE) + 37;
      strings.noteOn(middle, 0, 100);
      strings.noteOff(middle, SAMPLE_RATE / 2);
      strings.noteOn(middle, next, 100);

      const output = render(strings, 4 * SAMPLE_RATE, as({ play }));

      expect(output.subarray(2 * SAMPLE_RATE, next).every((sample) => sample === 0), play).toBe(true);
      expect(rms(output.subarray(next, next + 4096)), play).toBeGreaterThan(0);
      expect(Math.abs(cents(peakNear(output.subarray(next + seconds(0.3), next + seconds(0.3) + 16384), hertz(middle)), middle)), play).toBeLessThan(5);
    }
  });

  it("moves to a note played while another is held without lifting the bow", () => {
    const strings = fresh();
    strings.noteOn(middle, 0, 100);
    strings.noteOn(middle + 4, SAMPLE_RATE / 2, 100);
    strings.noteOff(middle, SAMPLE_RATE / 2);

    const output = render(strings, SAMPLE_RATE, as());
    const level = Math.min(rms(output.subarray(SAMPLE_RATE / 2 - 4096, SAMPLE_RATE / 2)), rms(steady(output)));
    const window = 1024;
    const quietest = Math.min(
      ...Array.from({ length: 8 }, (_, index) => rms(output.subarray(SAMPLE_RATE / 2 + index * window, SAMPLE_RATE / 2 + (index + 1) * window))),
    );

    expect(quietest).toBeGreaterThan(level * 0.6);
    expect(Math.abs(cents(peakNear(steady(output), hertz(middle + 4)), middle + 4))).toBeLessThan(5);
  });

  it("goes back to the note still held when the later one is let go", () => {
    const strings = fresh();
    strings.noteOn(middle, 0, 100);
    strings.noteOn(middle + 4, SAMPLE_RATE / 4, 100);
    strings.noteOff(middle + 4, SAMPLE_RATE / 2);

    const output = render(strings, SAMPLE_RATE, as());

    expect(Math.abs(cents(peakNear(steady(output), hertz(middle)), middle))).toBeLessThan(5);
    expect(rms(steady(output))).toBeGreaterThan(0.02);
  });

  it("bows a note played after a rest anew: the sound dips between the two and comes back", () => {
    const strings = fresh();
    const rest = seconds(0.1);
    strings.noteOn(middle, 0, 100);
    strings.noteOff(middle, SAMPLE_RATE / 2);
    strings.noteOn(middle, SAMPLE_RATE / 2 + rest, 100);

    const output = render(strings, SAMPLE_RATE + rest, as());
    const level = rms(output.subarray(SAMPLE_RATE / 2 - 4096, SAMPLE_RATE / 2));

    expect(rms(output.subarray(SAMPLE_RATE / 2 + rest, SAMPLE_RATE / 2 + rest + seconds(0.01)))).toBeLessThan(level * 0.4);
    expect(rms(steady(output))).toBeGreaterThan(level * 0.7);
  });

  it("brings a vibrato in a while after the note starts, in the pitch", () => {
    const still = played(middle, 100, 2 * SAMPLE_RATE);
    const shaking = played(middle, 100, 2 * SAMPLE_RATE, as({ vibrato: 1 }));
    const spread = (sound: Float32Array) => {
      const tail = sound.subarray(SAMPLE_RATE);
      const at = peakNear(tail, hertz(middle));
      return (strength(tail, at + 5.5) + strength(tail, at - 5.5)) / strength(tail, at);
    };

    expect(spread(shaking)).toBeGreaterThan(spread(still) * 2);
    expect(shaking.subarray(0, seconds(0.2))).toEqual(still.subarray(0, seconds(0.2)));
  });

  it("plucks a note: loudest at once, then dying away while it is held", () => {
    const sound = plucked(middle, 100, 2 * SAMPLE_RATE);
    const start = rms(sound.subarray(0, seconds(0.05)));

    expect(start).toBeGreaterThan(0.02);
    expect(rms(sound.subarray(seconds(1.5), seconds(1.6)))).toBeLessThan(start * 0.3);
  });

  it("plucks in tune over its range", () => {
    for (let note = low; note <= high; note += 5) {
      const sound = plucked(note).subarray(seconds(0.05), seconds(0.05) + 16384);

      expect(Math.abs(cents(peakNear(sound, hertz(note)), note)), `note ${note}`).toBeLessThan(5);
    }
  });

  it("plucks every note, even one played while another is held", () => {
    const strings = fresh();
    const second = seconds(0.6);
    strings.noteOn(middle, 0, 100);
    strings.noteOn(middle + 4, second, 100);

    const output = render(strings, SAMPLE_RATE, as({ play: "plucked" }));

    expect(rms(output.subarray(second, second + seconds(0.03)))).toBeGreaterThan(rms(output.subarray(second - seconds(0.03), second)) * 1.5);
  });

  it("stops a plucked note when it is let go, as the finger damps the string", () => {
    const strings = fresh();
    strings.noteOn(middle, 0, 100);
    strings.noteOff(middle, seconds(0.3));

    const output = render(strings, SAMPLE_RATE, as({ play: "plucked" }));

    expect(rms(output.subarray(seconds(0.25), seconds(0.3)))).toBeGreaterThan(0.005);
    expect(peak(output.subarray(seconds(0.3) + seconds(0.15)))).toBeLessThan(0.001);
  });

  it("plucks louder the harder the note is played", () => {
    const level = (velocity: number) => rms(plucked(middle, velocity).subarray(0, seconds(0.1)));

    expect(decibels(level(120) / level(40))).toBeGreaterThan(6);
  });

  it("plucks brighter near the bridge", () => {
    const upper = (position: number) => above(plucked(middle, 100, SAMPLE_RATE, { position }).subarray(0, 16384), middle, 1500);

    expect(upper(0.06)).toBeGreaterThan(upper(0.25) + 3);
  });

  it("plucks with the soft flesh of a finger: little above 4 kHz", () => {
    expect(above(plucked(middle, 100, SAMPLE_RATE, { position: 0.15 }).subarray(0, 8192), middle, 4000)).toBeLessThan(-20);
  });

  it("goes on playing when it changes from bowed to plucked and back", () => {
    const strings = fresh();
    strings.noteOn(middle, 0, 100);
    render(strings, SAMPLE_RATE / 2, as());
    const plucking = render(strings, SAMPLE_RATE / 2, as({ play: "plucked" }), SAMPLE_RATE / 2);
    const bowing = render(strings, SAMPLE_RATE, as(), SAMPLE_RATE);

    expect(plucking.every(Number.isFinite)).toBe(true);
    expect(rms(steady(bowing))).toBeGreaterThan(0.02);
  });
});

describe("Strings instruments", () => {
  const playedAs = (name: InstrumentName, note: number) => {
    const strings = newStrings(STRING_INSTRUMENTS[name].body);
    strings.noteOn(note, 0, 100);
    return steady(render(strings, SAMPLE_RATE, settingsOf(STRING_INSTRUMENTS[name])));
  };

  it("makes the cello darker than the violin on the same note", () => {
    expect(above(playedAs("cello", 62), 62, 2000)).toBeLessThan(above(playedAs("violin", 62), 62, 2000));
  });

  it("gives the violin the bright hill of its bridge, around 2.5 kHz", () => {
    const sound = playedAs("violin", 69);
    const at = peakNear(sound, hertz(69));
    const near = (frequency: number) => strength(sound, at * Math.round(frequency / at));

    expect(near(2500)).toBeGreaterThan(near(1200));
  });
});
