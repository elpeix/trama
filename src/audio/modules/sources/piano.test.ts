import { describe, expect, it } from "vitest";
import { MAX_PIANO_VOICES, Piano, type PianoSettings } from "./piano";

const SAMPLE_RATE = 44100;
const BLOCK = 128;

const settings = (overrides: Partial<PianoSettings> = {}): PianoSettings => ({
  brightness: 0.5,
  decay: 1,
  unison: 1,
  hammer: 0.3,
  pedal: 0,
  body: 0,
  ...overrides,
});

function render(piano: Piano, frames: number, values: PianoSettings = settings(), from = 0) {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let start = 0; start < frames; start += BLOCK) {
    const end = Math.min(frames, start + BLOCK);
    piano.process(left.subarray(start, end), right.subarray(start, end), from + start, values);
  }
  return { left, right, mono: left.map((sample, index) => (sample + right[index]) / 2) };
}

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);

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

/** The frequency near `around` where the samples are strongest, to a tenth of a hertz. */
function peakNear(samples: Float32Array, around: number, width: number) {
  let best = around;
  let bestStrength = -1;
  for (let frequency = around - width; frequency <= around + width; frequency += 0.1) {
    const found = strength(samples, frequency);
    if (found > bestStrength) {
      bestStrength = found;
      best = frequency;
    }
  }
  return best;
}

/** How strong the partial near a frequency is, its stretch allowed for: up to 2 % sharp. */
const peakStrength = (samples: Float32Array, frequency: number) =>
  Math.max(...Array.from({ length: 26 }, (_, step) => strength(samples, frequency * (0.995 + step * 0.001))));

const played = (note: number, velocity = 90, frames = 16384, values = settings()) => {
  const piano = new Piano(SAMPLE_RATE);
  piano.noteOn(note, 0, velocity);
  return render(piano, frames, values);
};

describe("Piano", () => {
  it("stays silent until a key is played", () => {
    expect(rms(render(new Piano(SAMPLE_RATE), 4096).mono)).toBe(0);
  });

  it("starts the note on the frame its key goes down", () => {
    const piano = new Piano(SAMPLE_RATE);
    piano.noteOn(60, 300, 100);

    const { mono } = render(piano, 1024);

    expect(rms(mono.subarray(0, 300))).toBe(0);
    expect(rms(mono.subarray(300, 600))).toBeGreaterThan(0);
  });

  it("sounds the note of its key, A4 at 440 Hz", () => {
    expect(peakNear(played(69).mono, 440, 3)).toBeCloseTo(440, 0);
  });

  it("stretches its partials, the higher a little sharper than whole multiples", () => {
    const { mono } = played(45, 100, 32768);
    const tenth = peakNear(mono, 1100, 15);

    expect(tenth).toBeGreaterThan(1100.5);
    expect(tenth).toBeLessThan(1110);
  });

  it("plays louder and brighter the harder its key is struck", () => {
    const brightness = (velocity: number) => {
      const { mono } = played(48, velocity, 8192);
      return strength(mono, 130.81 * 6) / strength(mono, 130.81);
    };

    expect(rms(played(60, 120, 8192).mono)).toBeGreaterThan(2 * rms(played(60, 30, 8192).mono));
    expect(brightness(120)).toBeGreaterThan(1.5 * brightness(30));
  });

  it("grows into its attack over a few milliseconds, as the felt of the hammer presses into the strings", () => {
    for (const [note, velocity] of [
      [48, 120],
      [60, 90],
      [84, 60],
    ]) {
      const { mono } = played(note, velocity, 4096);

      expect(rms(mono.subarray(0, 22))).toBeLessThan(0.5 * rms(mono.subarray(220, 880)));
    }
  });

  describe("the bass", () => {
    const partials = (note: number, count: number) => {
      const mono = played(note, 90, 8192).mono.subarray(441);
      const fundamental = 440 * 2 ** ((note - 69) / 12);
      return Array.from({ length: count }, (_, index) => peakStrength(mono, fundamental * (index + 1)));
    };
    const decibels = (value: number, reference: number) => 20 * Math.log10(value / reference);

    it("sounds its low notes from the partials above a weak fundamental, as a soundboard radiates the bass", () => {
      const [a1, ...aboveA1] = partials(33, 6);
      const [a2, ...aboveA2] = partials(45, 4);

      expect(a1).toBeLessThan(Math.max(...aboveA1));
      expect(a2).toBeLessThan(Math.max(...aboveA2));
    });

    it("keeps a low note full, its partials up to the fifth within 12 dB of the strongest", () => {
      for (const note of [33, 45]) {
        const strengths = partials(note, 5);
        const strongest = Math.max(...strengths);

        for (const strength of strengths) {
          expect(decibels(strength, strongest)).toBeGreaterThan(-12);
        }
      }
    });

    it("darkens the partials of a low note from the tenth up, as the bigger and softer bass hammers do", () => {
      const strengths = partials(33, 16);
      const strongest = Math.max(...strengths);

      for (const strength of strengths.slice(9)) {
        expect(decibels(strength, strongest)).toBeLessThan(-12);
      }
    });

    it("keeps the peaks of a low note struck hard clear of the saturation, its partials not all lining up at once", () => {
      for (const note of [33, 45]) {
        const { mono } = played(note, 127, 8192);
        const peak = mono.reduce((highest, sample) => Math.max(highest, Math.abs(sample)), 0);

        expect(peak).toBeLessThan(0.7);
      }
    });

    it("keeps the fundamental the strongest partial from middle C up", () => {
      for (const note of [60, 69]) {
        const [fundamental, ...above] = partials(note, 6);

        expect(fundamental).toBeGreaterThan(Math.max(...above));
      }
    });
  });

  it("keeps the partials of a high note above 3 kHz well down, as felt does", () => {
    const { mono } = played(72, 90, 8192);
    const fundamental = 523.25;
    const above = Array.from({ length: 15 }, (_, index) => index + 1)
      .map((partial) => fundamental * partial)
      .filter((frequency) => frequency > 3000);
    const loudest = Math.max(...above.map((frequency) => peakStrength(mono, frequency)));

    expect(20 * Math.log10(loudest / peakStrength(mono, fundamental))).toBeLessThan(-28);
  });

  it("grows a low note in as slowly as a middle one, for its longer period, as the heavier bass hammers do", () => {
    const growth = (note: number) => {
      const { mono } = played(note, 100, 4096);
      return rms(mono.subarray(0, 88)) / rms(mono.subarray(441, 1764));
    };

    for (const note of [28, 36, 43]) {
      expect(growth(note)).toBeLessThan(0.5);
    }
  });

  it("grows the notes between the bass and middle C in clearly slower than C5, where the heavier hammers start", () => {
    const growth = (note: number) => {
      const { mono } = played(note, 100, 4096);
      return rms(mono.subarray(0, 88)) / rms(mono.subarray(441, 1764));
    };

    for (const note of [48, 55, 60]) {
      expect(growth(note)).toBeLessThan(0.8 * growth(72));
    }
  });

  it("colours each note with the resonances of a soundboard, between its partials too, as Body goes up", () => {
    const between = (body: number) => {
      const { mono } = played(48, 100, 4410, settings({ body }));
      return [1.5, 2.5, 3.5].reduce((sum, ratio) => sum + peakStrength(mono, 130.81 * ratio), 0);
    };

    expect(20 * Math.log10(between(0.6) / between(0))).toBeGreaterThan(10);
  });

  it("leaves the sound as it was with Body at 0", () => {
    const { mono } = played(60, 100, 4096, settings({ body: 0 }));
    const { mono: again } = played(60, 100, 4096, settings({ body: 0 }));

    expect(mono).toEqual(again);
    expect(rms(mono)).toBeGreaterThan(0);
  });

  it("falls fast and then rings on, slower, as its strings take turns", () => {
    const { mono } = played(48, 100, SAMPLE_RATE * 3);
    const level = (from: number) => 20 * Math.log10(rms(mono.subarray(Math.round(from * SAMPLE_RATE), Math.round((from + 0.1) * SAMPLE_RATE))));

    const early = level(0.05) - level(0.55);
    const late = level(2) - level(2.5);

    expect(early).toBeGreaterThan(1.5 * late);
  });

  it("lets a low note ring longer than a high one", () => {
    const tail = (note: number) => {
      const { mono } = played(note, 100, SAMPLE_RATE * 2);
      return rms(mono.subarray(SAMPLE_RATE * 1.5)) / rms(mono.subarray(0, 4410));
    };

    expect(tail(36)).toBeGreaterThan(tail(84));
  });

  it("damps a note when its key goes up, unless the pedal is down", () => {
    const after = (pedal: number) => {
      const piano = new Piano(SAMPLE_RATE);
      piano.noteOn(60, 0, 100);
      piano.noteOff(60, 4410);
      return rms(render(piano, SAMPLE_RATE, settings({ pedal })).mono.subarray(SAMPLE_RATE / 2));
    };

    expect(after(0)).toBeLessThan(after(1) / 20);
  });

  it("lets a short note fade out when its key goes up, darker and longer in the bass, rather than cut it", () => {
    const release = (note: number) => {
      const piano = new Piano(SAMPLE_RATE);
      piano.noteOn(note, 0, 100);
      piano.noteOff(note, 4410);
      const { mono } = render(piano, SAMPLE_RATE * 2);
      const held = rms(mono.subarray(2205, 4410));
      return (from: number, to: number) => rms(mono.subarray(Math.round(from * SAMPLE_RATE), Math.round(to * SAMPLE_RATE))) / held;
    };
    const middle = release(60);
    const bass = release(36);

    expect(middle(0.15, 0.2)).toBeGreaterThan(1 / 20);
    expect(middle(1, 1.1)).toBeLessThan(1 / 1000);
    expect(bass(0.4, 0.5)).toBeGreaterThan(middle(0.4, 0.5));
  });

  it("damps the notes let go once the pedal comes up", () => {
    const piano = new Piano(SAMPLE_RATE);
    piano.noteOn(60, 0, 100);
    piano.noteOff(60, 100);
    render(piano, SAMPLE_RATE / 2, settings({ pedal: 1 }));

    const { mono } = render(piano, SAMPLE_RATE, settings({ pedal: 0 }), SAMPLE_RATE / 2);

    expect(rms(mono.subarray(SAMPLE_RATE / 2))).toBeLessThan(rms(mono.subarray(0, 2205)) / 20);
  });

  it("leaves the highest notes ringing when let go as if held, as they have no dampers", () => {
    const tail = (note: number, letGo: boolean) => {
      const piano = new Piano(SAMPLE_RATE);
      piano.noteOn(note, 0, 100);
      if (letGo) {
        piano.noteOff(note, 4410);
      }
      return rms(render(piano, SAMPLE_RATE / 2).mono.subarray(SAMPLE_RATE / 4));
    };

    expect(tail(96, true)).toBeCloseTo(tail(96, false), 6);
    expect(tail(84, true)).toBeLessThan(tail(84, false) / 20);
  });

  it("places the low notes to the left and the high ones to the right", () => {
    const low = played(30, 100, 8192);
    const high = played(100, 100, 8192);

    expect(rms(low.left)).toBeGreaterThan(rms(low.right));
    expect(rms(high.right)).toBeGreaterThan(rms(high.left));
  });

  it("plays chords, and keeps below 1 with every key struck hard", () => {
    const piano = new Piano(SAMPLE_RATE);
    for (let note = 21; note <= 108; note += 3) {
      piano.noteOn(note, 0, 127);
    }

    const { left, right } = render(piano, 8192, settings({ brightness: 1, hammer: 1, body: 1 }));

    expect([...left, ...right].every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1)).toBe(true);
    expect(piano.voices).toBeLessThanOrEqual(MAX_PIANO_VOICES);
  });

  it("strikes a key that still sounds again, without piling up voices", () => {
    const piano = new Piano(SAMPLE_RATE);
    for (let strike = 0; strike < 40; strike++) {
      piano.noteOn(60, strike * 100, 100);
    }
    render(piano, 8192);

    expect(piano.voices).toBeLessThanOrEqual(2);
  });

  it("lets every note go at once", () => {
    const piano = new Piano(SAMPLE_RATE);
    piano.noteOn(48, 0, 100);
    piano.noteOn(55, 0, 100);
    piano.allNotesOff(4410);

    const { mono } = render(piano, SAMPLE_RATE);

    expect(rms(mono.subarray(SAMPLE_RATE / 2))).toBeLessThan(rms(mono.subarray(0, 4410)) / 20);
  });
});
