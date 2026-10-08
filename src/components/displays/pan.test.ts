import { describe, expect, it } from "vitest";
import { formatPan, parsePan } from "./pan";

describe("pan", () => {
  it("shows the centre as C, and how far left or right in percent", () => {
    expect(formatPan(0)).toBe("C");
    expect(formatPan(-0.1)).toBe("L10");
    expect(formatPan(1)).toBe("R100");
    expect(formatPan(0.004)).toBe("C");
  });

  it("reads a side and a percent, the centre, or a number", () => {
    expect(parsePan("L30")).toBe(-0.3);
    expect(parsePan("r 100")).toBe(1);
    expect(parsePan("C")).toBe(0);
    expect(parsePan("-0,5")).toBe(-0.5);
    expect(parsePan("left")).toBeUndefined();
  });
});
