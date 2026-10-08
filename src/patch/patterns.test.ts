import { describe, expect, it } from "vitest";
import {
  bankOf,
  initialPatterns,
  legacySlot,
  numberOf,
  paramsInPattern,
  PATTERN_SLOTS,
  patternIds,
  slotOf,
  withPatternParam,
} from "./patterns";
import { defaultParams } from "./registry";
import type { PatchNode } from "./types";

const sequencer = (): PatchNode => {
  const params = defaultParams("sequencer");
  return {
    id: "sequencer-1",
    type: "sequencer",
    position: { x: 0, y: 0 },
    params,
    patterns: initialPatterns("sequencer", params),
  };
};

describe("patterns", () => {
  it("are the melody and rhythm of a Seq and an Arp, and nothing of other modules", () => {
    expect(patternIds("sequencer")).toEqual(["length", "root", "scale", "chord", "steps"]);
    expect(patternIds("arpeggiator")).toEqual(["pattern", "chord", "length", "rhythm", "notes"]);
    expect(patternIds("oscillator")).toEqual([]);
  });

  it("are 32: four banks, A to D, of eight patterns each", () => {
    expect(PATTERN_SLOTS).toHaveLength(32);
    expect(PATTERN_SLOTS.slice(0, 9)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "B1"]);
    expect(PATTERN_SLOTS.at(-1)).toBe("D8");
    expect(bankOf("C5")).toBe("C");
    expect(numberOf("C5")).toBe(5);
    expect(slotOf("D", 2)).toBe("D2");
  });

  it("take the patterns A to D of the files from before the banks as A1 to A4", () => {
    expect(["A", "B", "C", "D"].map(legacySlot)).toEqual(["A1", "A2", "A3", "A4"]);
    expect(legacySlot("E")).toBeUndefined();
    expect(legacySlot("A1")).toBeUndefined();
  });

  it("start as copies of pattern A1", () => {
    const params = { ...defaultParams("sequencer"), steps: "C4 - - - - - - - - - - - - - - -", division: "1/4" };

    const patterns = initialPatterns("sequencer", params);

    expect(Object.keys(patterns ?? {})).toEqual(PATTERN_SLOTS.slice(1));
    expect(patterns?.C3).toEqual({ length: 16, root: "C", scale: "pentatonic minor", chord: "off", steps: params.steps });
    expect(initialPatterns("oscillator", defaultParams("oscillator"))).toBeUndefined();
  });

  it("show the params of the node with those of the pattern", () => {
    const node = sequencer();
    node.patterns!.B2 = { ...node.patterns!.B2, steps: "D4 - - - - - - - - - - - - - - -" };

    expect(paramsInPattern(node, "B2")).toEqual({ ...node.params, steps: "D4 - - - - - - - - - - - - - - -" });
    expect(paramsInPattern(node, "A1")).toBe(node.params);
  });

  it("change a param of one pattern and leave the others alone", () => {
    const node = sequencer();

    const changed = withPatternParam(node, "A2", "steps", "E4 - - - - - - - - - - - - - - -");

    expect(changed.patterns?.A2?.steps).toBe("E4 - - - - - - - - - - - - - - -");
    expect(changed.patterns?.D8).toBe(node.patterns?.D8);
    expect(changed.params).toBe(node.params);
  });

  it("transpose the steps of that pattern alone when its root changes", () => {
    const node = sequencer();

    const changed = withPatternParam(node, "C7", "root", "D");

    expect(changed.patterns?.C7).toMatchObject({ root: "D", steps: expect.stringMatching(/^D4 /) });
    expect(changed.params.steps).toBe(node.params.steps);
  });

  it("change the node itself for pattern A1 and for params that are not in the patterns", () => {
    const node = sequencer();

    expect(withPatternParam(node, "A1", "steps", "F4 - - - - - - - - - - - - - - -").params.steps).toMatch(/^F4 /);
    const division = withPatternParam(node, "B1", "division", "1/4");
    expect(division.params.division).toBe("1/4");
    expect(division.patterns).toBe(node.patterns);
  });
});
