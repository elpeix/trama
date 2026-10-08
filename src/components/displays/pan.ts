import { parseParam } from "../controls/scale";

/** A pan as the small screen shows it: "C" in the centre, and how far left or right, in percent. */
export function formatPan(pan: number): string {
  const percent = Math.round(Math.abs(pan) * 100);
  return percent === 0 ? "C" : `${pan < 0 ? "L" : "R"}${percent}`;
}

/** Reads a pan typed as "L30", "R100", "C" or a number from -1 to 1. */
export function parsePan(text: string): number | undefined {
  const match = /^\s*([LRC])\s*(\d+(?:[.,]\d+)?)?\s*$/i.exec(text);
  if (!match) {
    return parseParam(text, {});
  }
  const side = match[1].toUpperCase();
  const percent = Number((match[2] ?? "0").replace(",", ".")) / 100;
  return side === "C" ? 0 : side === "L" ? -percent : percent;
}
