import type { NumberParamDefinition } from "../../patch/registry";

/** What a value control needs to know about the range of a value. */
export type ValueRange = Pick<NumberParamDefinition, "min" | "max" | "step" | "scale">;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const decimals = (step: number) => step.toString().split(".")[1]?.length ?? 0;

/** Rounds a value to the step of its range and keeps it inside the range. */
export function limitToRange(value: number, range: ValueRange): number {
  const { min, max, step } = range;
  const rounded = Number((Math.round(value / step) * step).toFixed(decimals(step)));
  return clamp(rounded, min, max);
}

export function toSliderPosition(value: number, definition: ValueRange): number {
  const { min, max, scale } = definition;
  const clamped = clamp(value, min, max);
  return scale === "log"
    ? Math.log(clamped / min) / Math.log(max / min)
    : (clamped - min) / (max - min);
}

export function fromSliderPosition(position: number, definition: ValueRange): number {
  const { min, max, scale } = definition;
  const p = clamp(position, 0, 1);
  const raw = scale === "log" ? min * (max / min) ** p : min + p * (max - min);
  return limitToRange(raw, definition);
}

export function formatParam(value: number, definition: NumberParamDefinition): string {
  const name = definition.valueNames?.[value - definition.min];
  if (name !== undefined) {
    return name;
  }
  const text = value.toFixed(decimals(definition.step));
  return definition.unit ? `${text} ${definition.unit}` : text;
}

/**
 * Reads a typed param value, with or without its unit ("440", "440 Hz", "440hz") and with a
 * decimal point or comma, or by the name of one of its values ("F#"). Returns `undefined` when it
 * is neither.
 */
export function parseParam(
  text: string,
  definition: Partial<Pick<NumberParamDefinition, "unit" | "valueNames" | "min">>,
): number | undefined {
  const named = definition.valueNames?.findIndex((name) => name.toLowerCase() === text.trim().toLowerCase());
  if (named !== undefined && named !== -1) {
    return (definition.min ?? 0) + named;
  }
  let number = text.trim().replace(",", ".");
  const unit = definition.unit?.toLowerCase();
  if (unit && number.toLowerCase().endsWith(unit)) {
    number = number.slice(0, -unit.length).trim();
  }
  const value = Number(number);
  return number !== "" && Number.isFinite(value) ? value : undefined;
}
