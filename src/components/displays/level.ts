import type { StereoAnalyser } from "../../audio/modules/stereoAnalyser";

export const METER_FLOOR_DB = -48;

export function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }
  return peak;
}

export function toDecibels(level: number): number {
  return level > 0 ? 20 * Math.log10(level) : -Infinity;
}

/** Position of a level on a meter that starts at `METER_FLOOR_DB` and ends at 0 dBFS, from 0 to 1. */
export function meterPosition(level: number): number {
  return Math.min(1, Math.max(0, 1 - toDecibels(level) / METER_FLOOR_DB));
}

export function formatDecibels(level: number): string {
  const decibels = toDecibels(level);
  if (decibels < METER_FLOOR_DB) {
    return "−∞ dB";
  }
  const text = decibels.toFixed(1);
  return text.startsWith("-") ? `−${text.slice(1)} dB` : decibels >= 0.05 ? `+${text} dB` : `${text} dB`;
}

/** A meter level that jumps up to new peaks and falls back slowly, so it can be read. */
export function fallingLevel(previous: number, peak: number, elapsedSeconds: number, dbPerSecond = 24): number {
  const fallen = previous * 10 ** (-(dbPerSecond * elapsedSeconds) / 20);
  return Math.max(peak, fallen);
}

/** The range of the level of a mixer channel, and of the mixer itself. */
export const LEVEL_RANGE = { min: 0, max: 1, step: 0.01, scale: "linear" } as const;

/** Reads the peak of each side of a stereo analyser, keeping a buffer for each between frames. */
export class StereoPeaks {
  private buffers: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [new Float32Array(0), new Float32Array(0)];

  read(analyser: StereoAnalyser | undefined): [number, number] {
    if (!analyser) {
      return [0, 0];
    }
    const sides = [analyser.left, analyser.right];
    return sides.map((side, index) => {
      if (this.buffers[index].length !== side.fftSize) {
        this.buffers[index] = new Float32Array(side.fftSize);
      }
      side.getFloatTimeDomainData(this.buffers[index]);
      return peakOf(this.buffers[index]);
    }) as [number, number];
  }
}

