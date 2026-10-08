import { harmonicGain } from "../../patch/harmonics";

/** One cycle of the wave a set of harmonic levels makes, in `points` values, scaled to reach 1. */
export function harmonicWave(
  levels: readonly number[],
  { brightness, even }: { brightness: number; even: number },
  points: number,
): number[] {
  const gains = levels.map((level, index) => harmonicGain(level, index, brightness, even));
  const wave = Array.from({ length: points }, (_, point) =>
    gains.reduce((sum, gain, index) => sum + gain * Math.sin((2 * Math.PI * (index + 1) * point) / points), 0),
  );
  const peak = Math.max(...wave.map(Math.abs));
  return peak > 0 ? wave.map((value) => value / peak) : wave.map(() => 0);
}
