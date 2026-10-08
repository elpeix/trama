const LOWEST_BAND_HZ = 25;
const HIGHEST_BAND_HZ = 20000;

/** The centres of `count` bands spread evenly over the octaves from 25 Hz to 20 kHz. */
export function filterBandFrequencies(count: number): number[] {
  const ratio = (HIGHEST_BAND_HZ / LOWEST_BAND_HZ) ** (1 / (count - 1));
  return Array.from({ length: count }, (_, index) => LOWEST_BAND_HZ * ratio ** index);
}

export function frequencyLabel(hz: number): string {
  if (hz < 1000) {
    return String(Math.round(hz));
  }
  return `${Number((hz / 1000).toFixed(1))}k`;
}
