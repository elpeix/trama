import { WIND_BODY_BANDS, type WindBore, type WindExciter } from "./effects";

/** The settings of a Wind that make it a given instrument, all but how it is played. */
export interface WindInstrument {
  exciter: WindExciter;
  bore: WindBore;
  brightness: number;
  bell: number;
  flare: number;
  attack: number;
  noise: number;
  vibrato: number;
  /** The gain in decibels of each band of the body, from the lowest. */
  body: readonly number[];
}

const flat = Array.from({ length: WIND_BODY_BANDS }, () => 0);

export const WIND_INSTRUMENTS = {
  clarinet: {
    exciter: "reed",
    bore: "cylinder",
    brightness: 0.5,
    bell: 2000,
    flare: 0,
    attack: 0.5,
    noise: 0.2,
    vibrato: 0,
    body: flat,
  },
  flute: {
    exciter: "air",
    bore: "cylinder",
    brightness: 0.5,
    bell: 12000,
    flare: 0,
    attack: 0.5,
    noise: 0.3,
    vibrato: 0.4,
    body: flat,
  },
  oboe: {
    exciter: "double reed",
    bore: "cone",
    brightness: 0.82,
    bell: 4500,
    flare: 0.29,
    attack: 0.38,
    noise: 0.08,
    vibrato: 0.38,
    body: [0, 0, 0, 0, 0, 0.5, 0.5, 1, 1.5, 1.5, 2, 3, 4, 5, 7, 9, 11.5, 15, 15, 11.5, 8, 6, 5, 7, 9, 7.5, 5, 3.5, 2.5, 2, 1.5, 1],
  },
  bassoon: {
    exciter: "double reed",
    bore: "cone",
    brightness: 0.67,
    bell: 2500,
    flare: 0,
    attack: 0.43,
    noise: 0.2,
    vibrato: 0.24,
    body: [2, 4, 6, 8, 10, 12, 14, 17, 19.5, 21.5, 23.5, 24, 23, 23, 23, 21, 15.5, 9, 5, 2, 0.5, -0.5, -1.5, -2.5, -3.5, -4.5, -4.5, -5, -6, -6.5, -6.5, -6.5],
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
    body: [2.5, 5, 7, 9.5, 12.5, 15.5, 18.5, 21.5, 23, 24, 23.5, 22.5, 20.5, 18.5, 16.5, 14, 11.5, 8.5, 5.5, 3.5, 2, 0.5, -0.5, -1.5, -3, -4, -4, -3, -3.5, -3.5, -3.5, -4.5],
  },
  sax: {
    exciter: "reed",
    bore: "cone",
    brightness: 0.7,
    bell: 650,
    flare: 1,
    attack: 0.5,
    noise: 0.25,
    vibrato: 0.3,
    body: [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 1.5, 2.5, 4, 5, 6, 7.5, 8.5, 9.5, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 4, 4, 4, -3, -3],
  },
  recorder: {
    exciter: "duct",
    bore: "cone",
    brightness: 0.4,
    bell: 12000,
    flare: 0,
    attack: 0.7,
    noise: 0.15,
    vibrato: 0,
    body: flat,
  },
  pan: {
    exciter: "duct",
    bore: "cone",
    brightness: 0.3,
    bell: 8000,
    flare: 0,
    attack: 0.2,
    noise: 0.6,
    vibrato: 0.25,
    body: flat,
  },
  flabiol: {
    exciter: "duct",
    bore: "cone",
    brightness: 0.7,
    bell: 12000,
    flare: 0,
    attack: 0.8,
    noise: 0.25,
    vibrato: 0.15,
    body: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2.5, 3.5, 5, 4.5, 3.5, 3, 2, 1, 0],
  },
  tible: {
    exciter: "double reed",
    bore: "cone",
    brightness: 1,
    bell: 6000,
    flare: 0.3,
    attack: 0.6,
    noise: 0.08,
    vibrato: 0.1,
    body: [0, 0.5, 1, 1, 1.5, 2, 2.5, 2.5, 3, 3.5, 3.5, 3.5, 4, 4, 4, 4, 4.5, 5.5, 7, 8.5, 10, 11.5, 12.5, 13.5, 14, 13.5, 12.5, 12, 9, 6, 3, 0],
  },
  tenora: {
    exciter: "double reed",
    bore: "cone",
    brightness: 0.9,
    bell: 500,
    flare: 1,
    attack: 0.5,
    noise: 0.1,
    vibrato: 0.3,
    body: [-6, -6, -6, -6, -6, -6, -6, -6, -6, -6, -5.5, -4, -2.5, -1, 0.5, 3.5, 6.5, 9, 11.5, 14.5, 16.5, 17, 18, 16.5, 15, 12.5, 9, 6, 3.5, 1, -0.5, -2],
  },
  fiscorn: {
    exciter: "lips",
    bore: "cone",
    brightness: 0.7,
    bell: 800,
    flare: 0.8,
    attack: 0.3,
    noise: 0.1,
    vibrato: 0,
    body: [3, 4, 4.5, 5.5, 6, 7, 7.5, 8, 8, 8, 8, 8, 8, 7.5, 7, 6, 5.5, 4.5, 4, 3, 2.5, 2, 1.5, 1, 0.5, 0, -0.5, -1, -1.5, -2, -2.5, -3],
  },
  trumpet: {
    exciter: "lips",
    bore: "cylinder",
    brightness: 0.9,
    bell: 500,
    flare: 1,
    attack: 0.5,
    noise: 0.08,
    vibrato: 0,
    body: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2.5, 3.5, 5, 6.5, 8, 9, 10.5, 11.5, 12, 12, 11.5, 10, 8.5, 6.5, 5, 3.5, 2, -0.5, -3],
  },
  trombone: {
    exciter: "lips",
    bore: "cylinder",
    brightness: 0.8,
    bell: 500,
    flare: 1,
    attack: 0.4,
    noise: 0.08,
    vibrato: 0,
    body: [2, 2.5, 3, 3, 3.5, 4, 4.5, 4.5, 5, 5.5, 6, 6, 6.5, 7, 7, 6.5, 6, 6, 6, 6, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5, -1, -1.5, -2, -3, -3.5, -4],
  },
} satisfies Record<string, WindInstrument>;
