/** The settings of a Strings that make it a given instrument, all but how it is played. */
export interface StringInstrument {
  pressure: number;
  position: number;
  brightness: number;
  noise: number;
  vibrato: number;
  attack: number;
  /** The gain in decibels of each band of the body, from the lowest. */
  body: readonly number[];
}

export const STRING_INSTRUMENTS = {
  violin: {
    pressure: 0.5,
    position: 0.12,
    brightness: 0.6,
    noise: 0.15,
    vibrato: 0.4,
    attack: 0.4,
    body: [-12, -12, -10, -8, -6, -2, 2, 6, 3, 1, 4, 8, 7, 0, -2, -3, -1, 0, 1, 2, 3, 5, 8, 8, 5, 2, 0, -4, -6, -8, -10, -12],
  },
  viola: {
    pressure: 0.55,
    position: 0.13,
    brightness: 0.5,
    noise: 0.15,
    vibrato: 0.35,
    attack: 0.45,
    body: [-10, -8, -6, -3, 0, 3, 6, 4, 2, 6, 7, 4, 1, -2, -3, -2, 0, 1, 2, 3, 5, 6, 5, 3, 1, -1, -3, -6, -8, -10, -12, -12],
  },
  cello: {
    pressure: 0.6,
    position: 0.13,
    brightness: 0.45,
    noise: 0.12,
    vibrato: 0.4,
    attack: 0.4,
    body: [6, 4, 2, 4, 6, 7, 4, 3, 4, 3, 1, 0, -1, -2, -2, -1, 0, 1, 2, 3, 3, 2, 0, -2, -4, -6, -8, -10, -12, -12, -12, -12],
  },
  bass: {
    pressure: 0.3,
    position: 0.12,
    brightness: 0.35,
    noise: 0.1,
    vibrato: 0.25,
    attack: 0.6,
    body: [8, 6, 5, 4, 3, 2, 1, 0, 0, -1, -2, -2, -2, -1, 0, 1, 2, 2, 1, 0, -2, -4, -6, -8, -10, -12, -12, -12, -12, -12, -12, -12],
  },
} satisfies Record<string, StringInstrument>;
