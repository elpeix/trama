import { describe, expect, it } from "vitest";
import { addedPitches, modulatedValue, paramLock, withParam } from "./params";
import { defaultParams, moduleRegistry, type NumberParamDefinition } from "./registry";
import type { PatchConnection, PatchNode } from "./types";

const sequencer = (params: Record<string, string | number>): PatchNode => ({
  id: "sequencer-1",
  type: "sequencer",
  position: { x: 0, y: 0 },
  params: { ...defaultParams("sequencer"), ...params },
});

describe("withParam", () => {
  it("sets a param", () => {
    expect(withParam(sequencer({}), "tempo", 90).tempo).toBe(90);
  });

  it("transposes the steps of a sequencer into the new root", () => {
    const node = sequencer({ root: "C", steps: "C4 - D#4 G4 C6 - - - - - - - - - - -" });

    const params = withParam(node, "root", "D");

    expect(params.root).toBe("D");
    expect(params.steps).toBe("D4 - F4 A4 D6 - - - - - - - - - - -");
  });

  it("keeps the accents and the ties when it transposes", () => {
    const node = sequencer({ root: "C", steps: "C4! _ D#4 - - - - - - - - - - - - -" });

    expect(withParam(node, "root", "D").steps).toBe("D4! _ F4 - - - - - - - - - - - - -");
  });

  it("transposes down when the new root is lower", () => {
    const node = sequencer({ root: "B", steps: "B4 - - - - - - - - - - - - - - B6" });

    expect(withParam(node, "root", "C").steps).toBe("C4 - - - - - - - - - - - - - - C6");
  });

  it("keeps notes within the range of the grid by moving them an octave", () => {
    // A note placed below the grid of G (outside the scale) would fall under C4.
    const node = sequencer({ root: "G", steps: "C4 - - - - - - - - - - - - - - -" });

    expect(withParam(node, "root", "F").steps).toBe("A#4 - - - - - - - - - - - - - - -");
  });

  it("leaves the steps alone for other params", () => {
    const node = sequencer({ steps: "C4 - - - - - - - - - - - - - - -" });

    expect(withParam(node, "scale", "major").steps).toBe(node.params.steps);
  });

  it("does not touch modules without steps", () => {
    const node: PatchNode = { id: "gain-1", type: "gain", position: { x: 0, y: 0 }, params: { gain: 0.5 } };

    expect(withParam(node, "gain", 0.2)).toEqual({ gain: 0.2 });
  });
});

describe("paramLock", () => {
  const rate = moduleRegistry.lfo.params.find(({ id }) => id === "rate")!;
  const frequency = moduleRegistry.oscillator.params.find(({ id }) => id === "frequency")!;

  it("locks the rate of a synced LFO to the tempo", () => {
    expect(paramLock(rate, { sync: "1/8", rate: 3 }, 90, 4)).toEqual({ value: 3, label: "3.00 Hz" });
    expect(paramLock(rate, { sync: "1 bar", rate: 3 }, 120, 4)).toEqual({ value: 0.5, label: "0.50 Hz" });
  });

  it("locks the rate of an LFO synced to bars to the bars of the meter", () => {
    expect(paramLock(rate, { sync: "1 bar", rate: 3 }, 120, 3)).toEqual({ value: 2 / 3, label: "0.67 Hz" });
  });

  it("locks the time of a synced delay to the tempo", () => {
    const time = moduleRegistry.delay.params.find(({ id }) => id === "time")!;

    expect(paramLock(time, { sync: "3/16", time: 0.3 }, 120, 4)).toEqual({ value: 0.375, label: "0.375 s" });
    expect(paramLock(time, { sync: "free", time: 0.3 }, 120, 4)).toBeUndefined();
  });

  it("leaves a free LFO alone", () => {
    expect(paramLock(rate, { sync: "free", rate: 3 }, 120, 4)).toBeUndefined();
  });

  it("locks the frequency of an oscillator in keyboard mode", () => {
    expect(paramLock(frequency, { mode: "keyboard" }, 120, 4)).toMatchObject({ label: "C4" });
    expect(paramLock(frequency, { mode: "free" }, 120, 4)).toBeUndefined();
  });
});

describe("modulatedValue", () => {
  const param = (type: "filter" | "gain", id: string) =>
    moduleRegistry[type].params.find((definition) => definition.id === id) as NumberParamDefinition;

  it("multiplies a frequency modulated in cents", () => {
    expect(modulatedValue(param("filter", "frequency"), 1000, 1200)).toBe(2000);
    expect(modulatedValue(param("filter", "frequency"), 1000, -2400)).toBe(250);
  });

  it("adds to any other param in its own units", () => {
    expect(modulatedValue(param("filter", "Q"), 2, 3)).toBe(5);
    expect(modulatedValue(param("gain", "gain"), 0, 0.8)).toBe(0.8);
  });
});

describe("addedPitches", () => {
  const into = (source: string, port: string, target: string, targetPort: string): PatchConnection => ({
    id: `${source}:${port}->${target}:${targetPort}`,
    source: { nodeId: source, port },
    target: { nodeId: target, port: targetPort },
  });

  it("names the param two note sources reach at once", () => {
    const connections = [
      into("keyboard-1", "pitch", "oscillator-3", "frequency"),
      into("sequencer-2", "pitch", "oscillator-3", "frequency"),
    ];

    expect(addedPitches("oscillator-3", connections)).toEqual(["frequency"]);
  });

  it("says nothing about a single note source, or about one on another param", () => {
    const connections = [
      into("keyboard-1", "pitch", "oscillator-3", "frequency"),
      into("sequencer-2", "pitch", "oscillator-3", "detune"),
      into("keyboard-1", "pitch", "oscillator-4", "frequency"),
    ];

    expect(addedPitches("oscillator-3", connections)).toEqual([]);
  });

  it("does not count modulation that is not a note", () => {
    const connections = [
      into("keyboard-1", "pitch", "oscillator-3", "frequency"),
      into("lfo-2", "out", "oscillator-3", "frequency"),
    ];

    expect(addedPitches("oscillator-3", connections)).toEqual([]);
  });
});
