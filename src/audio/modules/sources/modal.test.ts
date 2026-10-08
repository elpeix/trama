import { describe, expect, it } from "vitest";
import { MODAL_MODEL_NAMES } from "../../../patch/effects";
import { MODAL_MODELS, Modal, type ModalSettings } from "./modal";

const SAMPLE_RATE = 44100;
const BLOCK = 128;

const settings = (overrides: Partial<ModalSettings> = {}): ModalSettings => ({
  model: "marimba",
  frequency: 441,
  detune: 0,
  decay: 2,
  brightness: 1,
  hit: 1,
  stretch: 0,
  ...overrides,
});

function render(modal: Modal, frames: number, values: ModalSettings = settings(), from = 0) {
  const output = new Float32Array(frames);
  for (let start = 0; start < frames; start += BLOCK) {
    modal.process(output.subarray(start, Math.min(frames, start + BLOCK)), from + start, values);
  }
  return output;
}

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);

/** How strong a frequency is in the samples, by the Goertzel method. */
function strength(samples: Float32Array, frequency: number) {
  const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / SAMPLE_RATE);
  let previous = 0;
  let before = 0;
  for (const sample of samples) {
    const next = sample + coefficient * previous - before;
    before = previous;
    previous = next;
  }
  return Math.sqrt(previous * previous + before * before - coefficient * previous * before) / samples.length;
}

const struck = (values: ModalSettings = settings(), frames = 8192) => {
  const modal = new Modal(SAMPLE_RATE);
  modal.strike(0);
  return render(modal, frames, values);
};

describe("Modal", () => {
  it("stays silent until it is struck", () => {
    expect(rms(render(new Modal(SAMPLE_RATE), 4096))).toBe(0);
  });

  it("starts ringing on the frame it is struck at", () => {
    const modal = new Modal(SAMPLE_RATE);
    modal.strike(300);

    const output = render(modal, 1024);

    expect(rms(output.subarray(0, 300))).toBe(0);
    expect(Math.abs(output[301])).toBeGreaterThan(0);
  });

  it("rings at the partials of its model, and not between them", () => {
    const output = struck();
    const [, second] = MODAL_MODELS.marimba;

    expect(strength(output, 441)).toBeGreaterThan(20 * strength(output, 441 * 1.5));
    expect(strength(output, 441 * second.ratio)).toBeGreaterThan(20 * strength(output, 441 * (second.ratio + 0.5)));
  });

  it("follows a frequency moved by the detune in cents", () => {
    const output = struck(settings({ frequency: 220.5, detune: 1200 }));

    expect(strength(output, 441)).toBeGreaterThan(20 * strength(output, 220.5));
  });

  it("has a tubular bell whose partials are not whole multiples of each other", () => {
    const ratios = MODAL_MODELS.tubular.map(({ ratio }) => ratio);
    const output = struck(settings({ model: "tubular" }));

    expect(ratios.some((ratio) => Math.abs(ratio - Math.round(ratio)) > 0.1)).toBe(true);
    for (const ratio of ratios.filter((ratio) => 441 * ratio < SAMPLE_RATE / 2)) {
      expect(strength(output, 441 * ratio)).toBeGreaterThan(5 * strength(output, 441 * ratio * 1.07));
    }
  });

  it("ends a tubular bell on its note, with no partial below it lasting longer", () => {
    const ratios = MODAL_MODELS.tubular.map(({ ratio }) => ratio);
    const tail = struck(settings({ model: "tubular", frequency: 220.5, decay: 6, brightness: 0.5, hit: 0.8 }), 4 * SAMPLE_RATE).subarray(
      3 * SAMPLE_RATE,
    );
    const octave = strength(tail, 441);

    for (const ratio of ratios.filter((ratio) => ratio < 2)) {
      expect(strength(tail, 220.5 * ratio)).toBeLessThan(octave);
    }
  });

  it("has a gong of many partials close together, some in pairs that beat", () => {
    const ratios = MODAL_MODELS.gong.map(({ ratio }) => ratio).sort((a, b) => a - b);

    expect(ratios.length).toBeGreaterThanOrEqual(20);
    expect(ratios.some((ratio, index) => index > 0 && ratio / ratios[index - 1] < 1.01)).toBe(true);
  });

  it("makes the high partials of a gong swell after the strike, where those of a bell only fade", () => {
    const highs = (model: ModalSettings["model"], from: number) => {
      const output = struck(settings({ model, frequency: 110, decay: 6, brightness: 1, hit: 1 }), SAMPLE_RATE);
      const window = output
        .slice(Math.round(from * SAMPLE_RATE), Math.round(from * SAMPLE_RATE) + 2048)
        .map((sample, index) => sample * Math.sin((Math.PI * index) / 2047) ** 2);
      return Array.from({ length: 200 }, (_, step) => 1000 + 10 * step).reduce((sum, frequency) => sum + strength(window, frequency), 0);
    };

    expect(highs("gong", 0.5)).toBeGreaterThan(2 * highs("gong", 0.01));
    expect(highs("bell", 0.5)).toBeLessThan(highs("bell", 0.01));
  });

  it("fades its note by 60 dB over the decay", () => {
    const output = struck(settings({ decay: 0.5 }), SAMPLE_RATE);
    const start = rms(output.subarray(0, 441));
    const end = rms(output.subarray(22050 - 441, 22050));

    expect(end / start).toBeLessThan(0.003);
    expect(end / start).toBeGreaterThan(0.0001);
  });

  it("lets the high partials die faster as the brightness goes down", () => {
    const high = 441 * MODAL_MODELS.marimba[1].ratio;
    const late = (brightness: number) => struck(settings({ brightness }), SAMPLE_RATE).subarray(22050);

    expect(strength(late(0), high)).toBeLessThan(strength(late(1), high) / 4);
  });

  it("brings out the high partials with a hard hit, and keeps them down with a soft one", () => {
    const high = 441 * MODAL_MODELS.marimba[1].ratio;
    const ratio = (hit: number) => {
      const output = struck(settings({ hit }), 4096);
      return strength(output, high) / strength(output, 441);
    };

    expect(ratio(0)).toBeLessThan(ratio(1) / 2);
  });

  it("stretches its partials away from the note", () => {
    const second = MODAL_MODELS.marimba[1].ratio;
    const output = struck(settings({ stretch: 0.5 }));
    const stretched = 1 + (second - 1) * 1.25;

    expect(strength(output, 441 * stretched)).toBeGreaterThan(5 * strength(output, 441 * second));
    expect(strength(output, 441)).toBeGreaterThan(5 * strength(output, 441 * 1.5));
  });

  it("rings on with a new strike added to the one sounding", () => {
    const modal = new Modal(SAMPLE_RATE);
    modal.strike(0);
    const once = rms(render(modal, 4096).subarray(3000));

    const twice = new Modal(SAMPLE_RATE);
    twice.strike(0);
    twice.strike(2000);

    expect(rms(render(twice, 4096).subarray(3000))).toBeGreaterThan(once);
  });

  it("takes params that change on every frame, or hold still as a single value through a block", () => {
    const everyFrame = struck(settings({ frequency: new Float32Array(8192).fill(441), detune: new Float32Array(8192) }));
    const still = struck(settings({ frequency: new Float32Array([441]), detune: new Float32Array([0]) }));

    expect(still.every(Number.isFinite)).toBe(true);
    expect(rms(still)).toBeCloseTo(rms(everyFrame), 6);
  });

  it("leaves out the partials above what the sample rate can hold, and stays steady", () => {
    const output = struck(settings({ model: "gong", frequency: 8000 }));

    expect(output.every(Number.isFinite)).toBe(true);
    expect(Math.max(...output.map(Math.abs))).toBeLessThanOrEqual(1);
  });

  it("has the partials of each model the menu offers", () => {
    expect(Object.keys(MODAL_MODELS)).toEqual([...MODAL_MODEL_NAMES]);
  });

  it("keeps every model under 1 at its loudest, struck hard on any note", () => {
    for (const model of Object.keys(MODAL_MODELS) as ModalSettings["model"][]) {
      for (const frequency of [40, 110, 440, 1760]) {
        for (const stretch of [-1, 0, 1]) {
          const output = struck(settings({ model, frequency, decay: 10, brightness: 1, hit: 1, stretch }), 22050);

          expect(Math.max(...output.map(Math.abs))).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("has every model ring", () => {
    for (const model of Object.keys(MODAL_MODELS) as ModalSettings["model"][]) {
      expect(rms(struck(settings({ model }), 4096))).toBeGreaterThan(0.01);
    }
  });
});
