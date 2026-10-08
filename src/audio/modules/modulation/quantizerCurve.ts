import { ROOTS, SCALES } from "../../../patch/scales";

export const QUANTIZER_RANGE = 5;

const POINTS = 16385;
const EPSILON = 1e-9;

/**
 * The curve of a wave shaper that rounds a pitch, in octaves from C4 and within QUANTIZER_RANGE
 * octaves of it each way, to the nearest note of the scale.
 */
export function quantizerCurve(root: string, scale: string): Float32Array<ArrayBuffer> {
  const intervals = SCALES[scale] ?? SCALES.chromatic;
  const offset = Math.max(0, ROOTS.indexOf(root));
  const lowest = -12 * (QUANTIZER_RANGE + 1);
  const notes = Array.from({ length: 12 * 2 * (QUANTIZER_RANGE + 1) + 1 }, (_, index) => lowest + index).filter(
    (note) => intervals.includes((((note - offset) % 12) + 12) % 12),
  );
  let next = 0;
  return Float32Array.from({ length: POINTS }, (_, index) => {
    const semitones = 12 * QUANTIZER_RANGE * ((2 * index) / (POINTS - 1) - 1);
    while (next < notes.length - 1 && notes[next + 1] - semitones < semitones - notes[next] - EPSILON) {
      next++;
    }
    return notes[next] / 12;
  });
}
