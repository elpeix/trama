import { describe, expect, it } from "vitest";
import { moduleRegistry } from "./registry";
import { songControlAt, songControls } from "./songControls";
import type { Graph } from "./types";

const graph: Graph = {
  nodes: [
    { id: "filter-1", type: "filter", position: { x: 0, y: 0 }, params: { type: "lowpass", frequency: 800 } },
    { id: "lfo-2", type: "lfo", position: { x: 0, y: 0 }, params: {} },
    { id: "oscillator-3", type: "oscillator", position: { x: 0, y: 0 }, params: {} },
    { id: "mixer-4", type: "mixer", position: { x: 0, y: 0 }, params: { level: 0.5 } },
    { id: "sequencer-5", type: "sequencer", position: { x: 0, y: 0 }, params: {} },
    { id: "sampler-7", type: "sampler", position: { x: 0, y: 0 }, params: { order: "random" } },
    {
      id: "subpatch-6",
      type: "subpatch",
      name: "Keys",
      position: { x: 0, y: 0 },
      params: {},
      patch: {
        nodes: [{ id: "piano-1", type: "piano", position: { x: 0, y: 0 }, params: { pedal: 1 } }],
        connections: [],
      },
    },
  ],
  connections: [
    {
      id: "lfo-2:out->filter-1:frequency",
      source: { nodeId: "lfo-2", port: "out" },
      target: { nodeId: "filter-1", port: "frequency" },
      amount: 0.4,
    },
    {
      id: "oscillator-3:audio->mixer-4:audio",
      source: { nodeId: "oscillator-3", port: "audio" },
      target: { nodeId: "mixer-4", port: "audio" },
      amount: 0.7,
      pan: -0.5,
      mute: true,
    },
  ],
};

const filterDefinition = (id: string) => moduleRegistry.filter.params.find((param) => param.id === id);

describe("songControlAt", () => {
  it("gives a knob of a node, with its value in the patch and its param", () => {
    expect(songControlAt(graph, "filter-1.frequency")).toEqual({
      kind: "knob",
      value: 800,
      definition: filterDefinition("frequency"),
    });
  });

  it("gives the default of a knob the node leaves unset", () => {
    expect(songControlAt(graph, "filter-1.Q")?.value).toBe(filterDefinition("Q")?.default);
  });

  it("gives a knob inside a subpatch", () => {
    expect(songControlAt(graph, "subpatch-6/piano-1.pedal")).toMatchObject({ kind: "knob", value: 1 });
  });

  it("gives the level of a mixer", () => {
    expect(songControlAt(graph, "mixer-4.level")).toMatchObject({ kind: "knob", value: 0.5 });
  });

  it("gives the level, pan, mute and solo of a mixer channel", () => {
    const channel = "oscillator-3:audio->mixer-4:audio";

    expect(songControlAt(graph, `${channel}.level`)).toMatchObject({ kind: "knob", value: 0.7, definition: { min: 0, max: 1 } });
    expect(songControlAt(graph, `${channel}.pan`)).toMatchObject({ kind: "pan", value: -0.5, definition: { min: -1, max: 1 } });
    expect(songControlAt(graph, `${channel}.mute`)).toMatchObject({ kind: "switch", value: 1, definition: { min: 0, max: 1, step: 1 } });
    expect(songControlAt(graph, `${channel}.solo`)).toMatchObject({ kind: "switch", value: 0 });
  });

  it("gives the amount of a control cable", () => {
    expect(songControlAt(graph, "lfo-2:out->filter-1:frequency.amount")).toMatchObject({
      kind: "knob",
      value: 0.4,
      definition: { min: -1, max: 1 },
    });
  });

  it.each([
    ["a select", "filter-1.type"],
    ["a param of the patterns", "sequencer-5.length"],
    ["a node that is not there", "filter-9.frequency"],
    ["a param the node does not have", "filter-1.rate"],
    ["a cable that is not there", "x->y.level"],
  ])("gives nothing for %s", (_name, key) => {
    expect(songControlAt(graph, key)).toBeUndefined();
  });
});

describe("songControls", () => {
  const keys = () => songControls(graph).map(({ key }) => key);

  it("lists every control a song can move, with its name", () => {
    expect(songControls(graph)).toContainEqual({ key: "filter-1.frequency", label: "Filter › Freq" });
    expect(songControls(graph)).toContainEqual({ key: "subpatch-6/piano-1.pedal", label: "Keys › Piano › Pedal" });
    expect(keys()).toEqual(
      expect.arrayContaining([
        "mixer-4.level",
        "oscillator-3:audio->mixer-4:audio.level",
        "oscillator-3:audio->mixer-4:audio.pan",
        "oscillator-3:audio->mixer-4:audio.mute",
        "oscillator-3:audio->mixer-4:audio.solo",
        "lfo-2:out->filter-1:frequency.amount",
      ]),
    );
  });

  it("leaves out selects, params of the patterns and params hidden by another one", () => {
    expect(keys()).not.toContain("filter-1.type");
    expect(keys()).not.toContain("sequencer-5.length");
    expect(keys()).toContain("lfo-2.rate");
    expect(keys()).not.toContain("sampler-7.select");
  });

  it("gives every control it lists", () => {
    for (const key of keys()) {
      expect(songControlAt(graph, key), key).toBeDefined();
    }
  });
});
