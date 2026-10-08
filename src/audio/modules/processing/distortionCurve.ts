export const DRIVE_RANGE = 40;

const POINTS = 8193;

export type DistortionMode = "soft" | "hard" | "fold" | "drawn";

const clamp = (value: number) => Math.min(1, Math.max(-1, value));

const fold = (value: number) => 1 - Math.abs((((value + 1) % 4) + 4) % 4 - 2);

const drawnAt = (drawn: readonly number[], value: number) => {
  const position = ((clamp(value) + 1) / 2) * (drawn.length - 1);
  const below = Math.floor(position);
  const above = Math.min(drawn.length - 1, below + 1);
  return drawn[below] + (drawn[above] - drawn[below]) * (position - below);
};

const shapes: Record<DistortionMode, (value: number, drawn: readonly number[]) => number> = {
  soft: Math.tanh,
  hard: clamp,
  fold,
  drawn: (value, drawn) => (drawn.length > 1 ? drawnAt(drawn, value) : clamp(value)),
};

/** The curve of a wave shaper for inputs from -DRIVE_RANGE to DRIVE_RANGE, the loudest the drive makes them. */
export function distortionCurve(mode: DistortionMode, drawn: readonly number[]): Float32Array<ArrayBuffer> {
  const shape = shapes[mode] ?? shapes.soft;
  return Float32Array.from({ length: POINTS }, (_, index) =>
    shape(DRIVE_RANGE * ((2 * index) / (POINTS - 1) - 1), drawn),
  );
}
