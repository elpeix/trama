import type { CurveParamDefinition } from "../../patch/registry";
import { limitToRange } from "./scale";

export interface CurvePoint {
  index: number;
  value: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const limit = (value: number, definition: CurveParamDefinition) =>
  limitToRange(value, { ...definition, scale: "linear" });

/** The point of the curve under the pointer, and the value its height stands for. */
export function curvePoint(
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  clientX: number,
  clientY: number,
  definition: CurveParamDefinition,
): CurvePoint {
  const { points, min, max } = definition;
  const index = clamp(Math.floor(((clientX - rect.left) / rect.width) * points), 0, points - 1);
  const height = clamp((clientY - rect.top) / rect.height, 0, 1);
  return { index, value: limit(max - height * (max - min), definition) };
}

/** Sets the point `to`, and the ones between it and `from` along a straight line. */
export function paintCurve(
  values: readonly number[],
  from: CurvePoint | undefined,
  to: CurvePoint,
  definition: CurveParamDefinition,
): number[] {
  const start = from ?? to;
  const span = to.index - start.index;
  const [low, high] = span < 0 ? [to.index, start.index] : [start.index, to.index];
  return values.map((value, index) => {
    if (index < low || index > high) {
      return value;
    }
    const position = span === 0 ? 1 : (index - start.index) / span;
    return limit(start.value + position * (to.value - start.value), definition);
  });
}

/** Where the bars start from: zero when the range crosses it, and its bottom otherwise. */
export function curveBaseline({ min, max }: Pick<CurveParamDefinition, "min" | "max">): number {
  return clamp(0, min, max);
}
