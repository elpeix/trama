import type { MATH_OPERATIONS } from "../../../patch/registry";

const OPERATIONS: Record<(typeof MATH_OPERATIONS)[number], (a: number, b: number) => number> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  min: Math.min,
  max: Math.max,
};

/**
 * Combines a and b a frame at a time into `output`. Without an input, a is 0; b is a single value
 * for the whole block while it does not move, as an AudioParam gives it.
 */
export function combine(operation: string, a: Float32Array | undefined, b: Float32Array, output: Float32Array) {
  const apply = OPERATIONS[operation as keyof typeof OPERATIONS] ?? OPERATIONS.add;
  for (let index = 0; index < output.length; index++) {
    output[index] = apply(a ? a[index] : 0, b.length > 1 ? b[index] : b[0]);
  }
}
