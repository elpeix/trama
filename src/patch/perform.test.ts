import { describe, expect, it } from "vitest";
import {
  performItems,
  pinnableChannel,
  pinnableMixer,
  withChannelValue,
  pruneScenes,
  sceneKnobAt,
  sceneKnobs,
  sceneStatus,
  withScene,
  withSceneName,
  withoutScene,
  pruneHidden,
  withHiddenToggled,
  pinnableKnob,
  prunePinned,
  withKnobValue,
  withPinMoved,
  withPinName,
  withPinToggled,
} from "./perform";
import { moduleRegistry } from "./registry";
import type { Graph, PinnedKnob, Scene } from "./types";

const graph: Graph = {
  nodes: [
    { id: "filter-1", type: "filter", position: { x: 0, y: 0 }, params: { type: "lowpass", frequency: 800 } },
    { id: "sequencer-2", type: "sequencer", position: { x: 0, y: 0 }, params: { length: 16, glide: 60 } },
    {
      id: "subpatch-3",
      type: "subpatch",
      name: "Bass",
      position: { x: 0, y: 0 },
      params: {},
      patch: {
        nodes: [
          { id: "oscillator-4", type: "oscillator", position: { x: 0, y: 0 }, params: { frequency: 110 } },
          { id: "inlet-5", type: "inlet", position: { x: 0, y: 0 }, params: { signal: "control", value: 0.5 } },
        ],
        connections: [],
      },
    },
  ],
  connections: [],
};

const [filterFrequency] = moduleRegistry.filter.params.filter((param) => param.id === "frequency");

describe("pinnableKnob", () => {
  it("finds the node and the number param of a control, inside subpatches too", () => {
    expect(pinnableKnob(graph, "filter-1.frequency")).toEqual({ node: graph.nodes[0], definition: filterFrequency });
    expect(pinnableKnob(graph, "subpatch-3/oscillator-4.frequency")?.node.id).toBe("oscillator-4");
    expect(pinnableKnob(graph, "subpatch-3/inlet-5.value")?.definition.id).toBe("value");
  });

  it("leaves out selects, params of the patterns, and nodes or params that are not there", () => {
    expect(pinnableKnob(graph, "filter-1.type")).toBeUndefined();
    expect(pinnableKnob(graph, "sequencer-2.length")).toBeUndefined();
    expect(pinnableKnob(graph, "sequencer-2.glide")).toBeDefined();
    expect(pinnableKnob(graph, "filter-9.frequency")).toBeUndefined();
    expect(pinnableKnob(graph, "filter-1.nothing")).toBeUndefined();
    expect(pinnableKnob(graph, "subpatch-3/filter-1.frequency")).toBeUndefined();
  });

  it("leaves out the channels of a mixer", () => {
    expect(pinnableKnob(graph, "noise-6:audio->mixer-7:audio.level")).toBeUndefined();
  });
});

describe("performItems", () => {
  it("gives each pinned knob in order, with its value and its name", () => {
    const pinned: PinnedKnob[] = [
      { key: "subpatch-3/oscillator-4.frequency" },
      { key: "filter-1.frequency", name: "Cutoff" },
    ];

    expect(performItems(graph, pinned).map((item) => ({ kind: item.kind, key: item.key, label: item.label, value: item.kind === "knob" && item.value }))).toEqual([
      { kind: "knob", key: "subpatch-3/oscillator-4.frequency", label: "Bass › Oscillator › Freq", value: 110 },
      { kind: "knob", key: "filter-1.frequency", label: "Cutoff", value: 800 },
    ]);
  });

  it("takes the default of a param the node does not keep", () => {
    const [knob] = performItems(graph, [{ key: "filter-1.Q" }]);

    expect(knob.kind === "knob" && knob.value).toBe(knob.kind === "knob" && knob.definition.default);
  });

  it("skips knobs that cannot be found", () => {
    expect(performItems(graph, [{ key: "filter-9.frequency" }])).toEqual([]);
  });
});

describe("withPinToggled", () => {
  it("pins a knob at the end, and unpins it with its name", () => {
    const pinned = withPinToggled([{ key: "filter-1.Q" }], "filter-1.frequency");
    expect(pinned).toEqual([{ key: "filter-1.Q" }, { key: "filter-1.frequency" }]);

    expect(withPinToggled([{ key: "filter-1.Q", name: "Res" }], "filter-1.Q")).toEqual([]);
  });
});

describe("withPinName", () => {
  const pinned: PinnedKnob[] = [{ key: "filter-1.Q" }];

  it("names a pinned knob, trimmed and cut to the length of a name", () => {
    expect(withPinName(pinned, "filter-1.Q", "  Res  ")).toEqual([{ key: "filter-1.Q", name: "Res" }]);
    expect(withPinName(pinned, "filter-1.Q", "x".repeat(60))[0].name).toHaveLength(40);
  });

  it("goes back to its own name when empty", () => {
    expect(withPinName([{ key: "filter-1.Q", name: "Res" }], "filter-1.Q", " ")).toEqual(pinned);
  });

  it("leaves the list as it was for a knob that is not pinned", () => {
    expect(withPinName(pinned, "filter-1.frequency", "Cutoff")).toBe(pinned);
  });
});

describe("withPinMoved", () => {
  const pinned: PinnedKnob[] = [{ key: "a.x" }, { key: "b.x" }, { key: "c.x" }];

  it("moves a knob to another place", () => {
    expect(withPinMoved(pinned, "a.x", 2).map(({ key }) => key)).toEqual(["b.x", "c.x", "a.x"]);
    expect(withPinMoved(pinned, "c.x", 0).map(({ key }) => key)).toEqual(["c.x", "a.x", "b.x"]);
  });

  it("keeps the place inside the list", () => {
    expect(withPinMoved(pinned, "b.x", 9).map(({ key }) => key)).toEqual(["a.x", "c.x", "b.x"]);
    expect(withPinMoved(pinned, "b.x", -1).map(({ key }) => key)).toEqual(["b.x", "a.x", "c.x"]);
  });

  it("leaves the list as it was when nothing moves", () => {
    expect(withPinMoved(pinned, "b.x", 1)).toBe(pinned);
    expect(withPinMoved(pinned, "z.x", 0)).toBe(pinned);
  });
});

describe("prunePinned", () => {
  it("drops the knobs that cannot be found", () => {
    expect(prunePinned([{ key: "filter-1.Q" }, { key: "filter-9.q" }], graph)).toEqual([{ key: "filter-1.Q" }]);
  });

  it("gives back the same list when all are there", () => {
    const pinned: PinnedKnob[] = [{ key: "filter-1.Q" }];

    expect(prunePinned(pinned, graph)).toBe(pinned);
  });
});

describe("withKnobValue", () => {
  it("sets the param of a node at any depth, leaving the rest as it was", () => {
    const changed = withKnobValue(graph, "subpatch-3/oscillator-4.frequency", 220);

    expect(changed.nodes[2].patch?.nodes[0].params).toEqual({ frequency: 220 });
    expect(changed.nodes[0]).toBe(graph.nodes[0]);
    expect(graph.nodes[2].patch?.nodes[0].params).toEqual({ frequency: 110 });
  });

  it("gives back the same graph for a knob that cannot be found", () => {
    expect(withKnobValue(graph, "filter-9.frequency", 1)).toBe(graph);
    expect(withKnobValue(graph, "filter-1.type", 1)).toBe(graph);
  });
});

describe("withHiddenToggled", () => {
  it("hides the row of a node in the launcher, and shows it again", () => {
    expect(withHiddenToggled(["sequencer-2"], "subpatch-3/clip-9")).toEqual(["sequencer-2", "subpatch-3/clip-9"]);
    expect(withHiddenToggled(["sequencer-2", "subpatch-3/clip-9"], "sequencer-2")).toEqual(["subpatch-3/clip-9"]);
  });
});

describe("pruneHidden", () => {
  it("drops the rows of nodes that are gone or have no patterns, and those hidden twice", () => {
    expect(pruneHidden(["sequencer-2", "filter-1", "sequencer-8", "sequencer-2"], graph)).toEqual(["sequencer-2"]);
  });

  it("gives back the same list when all are there", () => {
    const hidden = ["sequencer-2"];

    expect(pruneHidden(hidden, graph)).toBe(hidden);
  });
});

describe("scenes", () => {
  const scenes: Scene[] = [{ patterns: { "sequencer-2": "A1" } }, { name: "Drop", patterns: { "sequencer-2": "B3" } }];

  it("adds a scene at the end", () => {
    expect(withScene(scenes, { "sequencer-2": "C1" })).toEqual([...scenes, { patterns: { "sequencer-2": "C1" } }]);
  });

  it("removes a scene", () => {
    expect(withoutScene(scenes, 0)).toEqual([scenes[1]]);
    expect(withoutScene(scenes, 5)).toBe(scenes);
  });

  it("names a scene, trimmed, or takes its name away when empty", () => {
    expect(withSceneName(scenes, 0, "  Intro ")[0]).toEqual({ name: "Intro", patterns: { "sequencer-2": "A1" } });
    expect(withSceneName(scenes, 1, "")[1]).toEqual({ patterns: { "sequencer-2": "B3" } });
    expect(withSceneName(scenes, 0, "x".repeat(60))[0].name).toHaveLength(40);
    expect(withSceneName(scenes, 5, "Intro")).toBe(scenes);
  });

  it("drops the patterns of nodes that are gone or have no patterns, and the scenes left empty", () => {
    const pruned = pruneScenes(
      [{ patterns: { "sequencer-2": "A2", "filter-1": "A1" } }, { name: "Gone", patterns: { "sequencer-9": "A1" } }],
      graph,
    );

    expect(pruned).toEqual([{ patterns: { "sequencer-2": "A2" } }]);
  });

  it("gives back the same scenes when all are there", () => {
    expect(pruneScenes(scenes, graph)).toBe(scenes);
  });

  it("keeps the knobs of a scene when it is named", () => {
    const withKnobs: Scene[] = [{ patterns: { "sequencer-2": "A1" }, knobs: { "filter-1.frequency": 300 } }];

    expect(withSceneName(withKnobs, 0, "Drop")).toEqual([{ name: "Drop", patterns: { "sequencer-2": "A1" }, knobs: { "filter-1.frequency": 300 } }]);
    expect(withSceneName([{ ...withKnobs[0], name: "Drop" }], 0, "")).toEqual(withKnobs);
  });

  it("keeps the knobs given with a scene, and none when there are none", () => {
    expect(withScene([], { "sequencer-2": "A1" }, { "filter-1.frequency": 300 })).toEqual([
      { patterns: { "sequencer-2": "A1" }, knobs: { "filter-1.frequency": 300 } },
    ]);
    expect(withScene([], { "sequencer-2": "A1" }, {})).toEqual([{ patterns: { "sequencer-2": "A1" } }]);
  });

  it("drops the knobs of a scene that the patch has not", () => {
    const pruned = pruneScenes([{ patterns: { "sequencer-2": "A2" }, knobs: { "filter-1.frequency": 300, "filter-9.frequency": 100 } }], graph);

    expect(pruned).toEqual([{ patterns: { "sequencer-2": "A2" }, knobs: { "filter-1.frequency": 300 } }]);
  });
});

describe("the knobs of a scene", () => {
  const desk: Graph = {
    nodes: [
      { id: "filter-1", type: "filter", position: { x: 0, y: 0 }, params: { type: "lowpass", frequency: 800, Q: 2 } },
      { id: "oscillator-2", type: "oscillator", position: { x: 0, y: 0 }, params: {} },
      { id: "mixer-3", type: "mixer", position: { x: 0, y: 0 }, params: { level: 0.9 } },
    ],
    connections: [
      { id: "oscillator-2:audio->mixer-3:audio", source: { nodeId: "oscillator-2", port: "audio" }, target: { nodeId: "mixer-3", port: "audio" }, amount: 0.7, pan: -0.5 },
    ],
  };
  const channel = "oscillator-2:audio->mixer-3:audio";

  it("are the values of the knobs pinned, and of the level of each mixer pinned and the level and pan of its channels", () => {
    expect(sceneKnobs(desk, [{ key: "filter-1.frequency" }, { key: "mixer-3" }])).toEqual({
      "filter-1.frequency": 800,
      "mixer-3.level": 0.9,
      [`${channel}.level`]: 0.7,
      [`${channel}.pan`]: -0.5,
    });
  });

  it("each have the value in the patch and the range of their control", () => {
    expect(sceneKnobAt(desk, "filter-1.frequency")).toEqual({
      value: 800,
      range: { min: 20, max: 20000, step: 1, scale: "log" },
    });
    expect(sceneKnobAt(desk, "mixer-3.level")?.value).toBe(0.9);
    expect(sceneKnobAt(desk, `${channel}.level`)).toEqual({ value: 0.7, range: { min: 0, max: 1, step: 0.01, scale: "linear" } });
    expect(sceneKnobAt(desk, `${channel}.pan`)).toEqual({ value: -0.5, range: { min: -1, max: 1, step: 0.01, scale: "linear" } });
  });

  it("are none of the controls a scene does not keep", () => {
    expect(sceneKnobAt(desk, "filter-1.type")).toBeUndefined();
    expect(sceneKnobAt(desk, `${channel}.mute`)).toBeUndefined();
    expect(sceneKnobAt(desk, "filter-9.frequency")).toBeUndefined();
  });
});

describe("sceneStatus", () => {
  const scene: Scene = { patterns: { "a/seq-1": "A2", "arp-2": "B1" } };

  it("is playing while every node of the scene plays its pattern", () => {
    const states = { "a/seq-1": { playing: "A2" }, "arp-2": { playing: "B1" } } as const;

    expect(sceneStatus(scene, (path) => states[path as keyof typeof states])).toBe("playing");
  });

  it("is queued while the patterns of the scene are playing or about to", () => {
    const states = { "a/seq-1": { playing: "A2" }, "arp-2": { playing: "A1", queued: "B1" } } as const;

    expect(sceneStatus(scene, (path) => states[path as keyof typeof states])).toBe("queued");
  });

  it("is not playing while a stop of the song silences one of its nodes, and queued once it is launched again", () => {
    const stopped = { "a/seq-1": { playing: "A2" }, "arp-2": { playing: "B1", stopped: true } } as const;
    const relaunched = { "a/seq-1": { playing: "A2" }, "arp-2": { playing: "B1", queued: "B1", stopped: true } } as const;

    expect(sceneStatus(scene, (path) => stopped[path as keyof typeof stopped])).toBeUndefined();
    expect(sceneStatus(scene, (path) => relaunched[path as keyof typeof relaunched])).toBe("queued");
  });

  it("is neither when a node plays another pattern, or cannot be read", () => {
    const states = { "a/seq-1": { playing: "A3" }, "arp-2": { playing: "B1" } } as const;

    expect(sceneStatus(scene, (path) => states[path as keyof typeof states])).toBeUndefined();
    expect(sceneStatus(scene, () => undefined)).toBeUndefined();
  });
});

describe("mixers", () => {
  const cable = "noise-2:audio->mixer-3:audio";
  const mixed: Graph = {
    nodes: [
      {
        id: "subpatch-1",
        type: "subpatch",
        name: "Band",
        position: { x: 0, y: 0 },
        params: {},
        patch: {
          nodes: [
            { id: "noise-2", type: "noise", position: { x: 0, y: 0 }, params: {} },
            { id: "mixer-3", type: "mixer", position: { x: 0, y: 0 }, params: {} },
            { id: "output-4", type: "output", position: { x: 0, y: 0 }, params: {} },
          ],
          connections: [
            { id: cable, source: { nodeId: "noise-2", port: "audio" }, target: { nodeId: "mixer-3", port: "audio" }, amount: 0.5, mute: true },
            { id: "mixer-3:audio->output-4:audio", source: { nodeId: "mixer-3", port: "audio" }, target: { nodeId: "output-4", port: "audio" } },
          ],
        },
      },
    ],
    connections: [],
  };
  const path = `subpatch-1/${cable}`;

  it("finds the channel a cable into a mixer is, at any depth", () => {
    expect(pinnableChannel(mixed, path)?.id).toBe(cable);
    expect(pinnableChannel(mixed, "subpatch-1/mixer-3:audio->output-4:audio")).toBeUndefined();
    expect(pinnableChannel(mixed, cable)).toBeUndefined();
    expect(pinnableChannel(mixed, "subpatch-1/noise-2.level")).toBeUndefined();
  });

  it("leaves out the level of a mixer as a knob, which the mixer pinned shows", () => {
    expect(pinnableKnob(mixed, "subpatch-1/mixer-3.level")).toBeUndefined();
    expect(prunePinned([{ key: "subpatch-1/mixer-3.level" }], mixed)).toEqual([]);
  });

  it("finds a mixer to pin by its path, at any depth", () => {
    expect(pinnableMixer(mixed, "subpatch-1/mixer-3")?.id).toBe("mixer-3");
    expect(pinnableMixer(mixed, "subpatch-1/noise-2")).toBeUndefined();
    expect(pinnableMixer(mixed, "mixer-3")).toBeUndefined();
  });

  it("gives a mixer pinned with its level and every channel it has, next to the knobs in the order pinned", () => {
    const items = performItems(mixed, [{ key: "subpatch-1/mixer-3" }, { key: "subpatch-1/noise-2.nothing" }]);

    expect(items).toEqual([
      {
        kind: "mixer",
        key: "subpatch-1/mixer-3",
        label: "Band › Mixer",
        level: 1,
        channels: [{ key: path, label: "Noise 2", level: 0.5, pan: 0, mute: true, solo: false }],
      },
    ]);
  });

  it("names a mixer pinned by the name given to it", () => {
    expect(performItems(mixed, [{ key: "subpatch-1/mixer-3", name: "Drums" }])[0].label).toBe("Drums");
  });

  it("keeps a mixer pinned while it is there, and never a channel on its own", () => {
    const pinned: PinnedKnob[] = [{ key: "subpatch-1/mixer-3" }];

    expect(prunePinned(pinned, mixed)).toBe(pinned);
    expect(prunePinned([{ key: path }, { key: "subpatch-1/mixer-9" }], mixed)).toEqual([]);
  });

  it("sets the level, the pan, the mute and the solo of a channel at any depth", () => {
    const channel = (graph: Graph) => graph.nodes[0].patch!.connections[0];

    expect(channel(withChannelValue(mixed, path, "level", 0.8)).amount).toBe(0.8);
    expect(channel(withChannelValue(mixed, path, "pan", -0.4)).pan).toBe(-0.4);
    expect(channel(withChannelValue(withChannelValue(mixed, path, "pan", 0.2), path, "pan", 0))).not.toHaveProperty("pan");
    expect(channel(withChannelValue(mixed, path, "mute", 0))).not.toHaveProperty("mute");
    expect(channel(withChannelValue(mixed, path, "solo", 1)).solo).toBe(true);
    expect(mixed.nodes[0].patch!.connections[0].amount).toBe(0.5);
  });

  it("gives back the same graph for a channel that cannot be found", () => {
    expect(withChannelValue(mixed, "subpatch-1/x-9:audio->mixer-3:audio", "level", 1)).toBe(mixed);
  });
});

