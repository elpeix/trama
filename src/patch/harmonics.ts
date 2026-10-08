export const HARMONIC_COUNT = 16;

/** How much less brightness takes a harmonic down, from its index: nothing for the fundamental, all of it for the last one. */
export const harmonicTilt = (index: number) => index / (HARMONIC_COUNT - 1);

export const isEvenHarmonic = (index: number) => (index + 1) % 2 === 0;

/** The level a harmonic sounds at, from the level drawn for it and the two macros. */
export function harmonicGain(level: number, index: number, brightness: number, even: number) {
  const tilted = level * (1 - harmonicTilt(index) * (1 - brightness));
  return isEvenHarmonic(index) ? tilted * even : tilted;
}
