import { describe, expect, it } from "vitest";
import type { Graph, Scene } from "../../patch/types";
import { crossfadeValues } from "./crossfade";

const channel = "oscillator-2:audio->mixer-3:audio";

const graph: Graph = {
  nodes: [
    { id: "filter-1", type: "filter", position: { x: 0, y: 0 }, params: { type: "lowpass", frequency: 800, Q: 2 } },
    { id: "oscillator-2", type: "oscillator", position: { x: 0, y: 0 }, params: {} },
    { id: "mixer-3", type: "mixer", position: { x: 0, y: 0 }, params: { level: 1 } },
  ],
  connections: [
    { id: channel, source: { nodeId: "oscillator-2", port: "audio" }, target: { nodeId: "mixer-3", port: "audio" }, amount: 0.5 },
  ],
};

const scene = (knobs: Record<string, number>): Scene => ({ patterns: {}, knobs });

describe("crossfadeValues", () => {
  const a = scene({ "filter-1.frequency": 200, [`${channel}.level`]: 0.2 });
  const b = scene({ "filter-1.frequency": 2000, [`${channel}.level`]: 0.8 });

  it("gives the knobs of scene A at the left end, and those of B at the right end", () => {
    expect(crossfadeValues(graph, a, b, 0)).toEqual({ "filter-1.frequency": 200, [`${channel}.level`]: 0.2 });
    expect(crossfadeValues(graph, a, b, 1)).toEqual({ "filter-1.frequency": 2000, [`${channel}.level`]: 0.8 });
  });

  it("goes between them along the turn of each knob: a frequency on its log scale, a level in a line", () => {
    expect(crossfadeValues(graph, a, b, 0.5)).toEqual({ "filter-1.frequency": 632, [`${channel}.level`]: 0.5 });
  });

  it("takes the value of the patch for a knob only one of the scenes keeps, or for a side without a scene", () => {
    expect(crossfadeValues(graph, scene({ "filter-1.Q": 10 }), b, 0)).toEqual({
      "filter-1.Q": 10,
      "filter-1.frequency": 800,
      [`${channel}.level`]: 0.5,
    });
    expect(crossfadeValues(graph, undefined, b, 0)).toEqual({ "filter-1.frequency": 800, [`${channel}.level`]: 0.5 });
  });

  it("holds a knob both scenes keep at the same value", () => {
    expect(crossfadeValues(graph, scene({ "filter-1.Q": 6 }), scene({ "filter-1.Q": 6 }), 0.3)).toEqual({ "filter-1.Q": 6 });
  });

  it("moves nothing without scenes, nor the knobs of controls the patch has not", () => {
    expect(crossfadeValues(graph, undefined, undefined, 0.5)).toEqual({});
    expect(crossfadeValues(graph, scene({ "filter-9.frequency": 300 }), undefined, 0)).toEqual({});
  });
});
