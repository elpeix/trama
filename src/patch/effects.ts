/** The longest delay of a Chorus, in milliseconds, before its sweep: what its processor holds. */
export const CHORUS_MAX_DELAY_MS = 40;
export const CHORUS_MAX_VOICES = 4;

/** The longest delay of a Flanger, in milliseconds, before its sweep. */
export const FLANGER_MAX_DELAY_MS = 10;

export const PHASER_MAX_STAGES = 12;

/** The most voices a VCO plays at once, detuned and spread across the stereo field. */
export const VCO_MAX_VOICES = 7;

/** The struck bodies a Modal plays, each with the partials of its own. */
export const MODAL_MODEL_NAMES = ["tubular", "bell", "marimba", "vibraphone", "glass", "gong"] as const;

/** What makes a Wind sound: a single reed, a double reed, the lips, a jet of air shaped by the lips, or one aimed by a duct. */
export const WIND_EXCITERS = ["reed", "double reed", "lips", "air", "duct"] as const;
export type WindExciter = (typeof WIND_EXCITERS)[number];

/** The bore of a Wind: a cylinder, or a cone (or a brass tube with a bell), which rings at every harmonic. */
export const WIND_BORES = ["cylinder", "cone"] as const;
export type WindBore = (typeof WIND_BORES)[number];

export const WIND_BODY_BANDS = 32;
const WIND_BODY_LOWEST_HZ = 100;
const WIND_BODY_HIGHEST_HZ = 8000;

/** The centres of the bands of the body of a Wind, spread evenly over the octaves from 100 Hz to 8 kHz. */
export function windBodyFrequencies(): number[] {
  const ratio = (WIND_BODY_HIGHEST_HZ / WIND_BODY_LOWEST_HZ) ** (1 / (WIND_BODY_BANDS - 1));
  return Array.from({ length: WIND_BODY_BANDS }, (_, index) => WIND_BODY_LOWEST_HZ * ratio ** index);
}

/** How a Strings sounds its string: drawn by a bow, or plucked by a finger. */
export const STRINGS_PLAYS = ["bowed", "plucked"] as const;
export type StringsPlay = (typeof STRINGS_PLAYS)[number];
