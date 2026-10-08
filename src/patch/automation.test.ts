import { describe, expect, it } from "vitest";
import {
  changesIn,
  channelLabel,
  controlKey,
  controlLabel,
  controlTargets,
  formatLane,
  parseControlKey,
  parseLane,
  pointsIn,
  valueAt,
  withoutPointsIn,
  withConstant,
  withPoint,
  withTake,
} from "./automation";
import type { Graph } from "./types";

const lane = [
  { beat: 0, value: 100 },
  { beat: 2.5, value: 200 },
  { beat: 8, value: 300 },
];

describe("controlKey and parseControlKey", () => {
  it("names a control by what it is on and its name", () => {
    expect(controlKey("sub-2/filter-3", "cutoff")).toBe("sub-2/filter-3.cutoff");
    expect(parseControlKey("sub-2/filter-3.cutoff")).toEqual({ target: "sub-2/filter-3", name: "cutoff" });
  });

  it("names the channel of a mixer by its cable", () => {
    const key = controlKey("osc-1:audio->mixer-2:audio", "level");

    expect(parseControlKey(key)).toEqual({ target: "osc-1:audio->mixer-2:audio", name: "level" });
  });
});

describe("parseLane and formatLane", () => {
  it("reads and writes a beat and a value for each point", () => {
    expect(parseLane("0:100 2.5:200 8:300")).toEqual(lane);
    expect(formatLane(lane)).toBe("0:100 2.5:200 8:300");
  });

  it("reads and writes the points reached in a ramp with a tilde", () => {
    const ramp = [
      { beat: 0, value: 300 },
      { beat: 32, value: 900, ramp: true },
      { beat: 36, value: 300 },
    ];

    expect(parseLane("0:300 32~900 36:300")).toEqual(ramp);
    expect(formatLane(ramp)).toBe("0:300 32~900 36:300");
  });

  it("rounds the beats to thousandths and the values to six figures", () => {
    expect(formatLane([{ beat: 1.23456, value: 0.1234567 }])).toBe("1.235:0.123457");
  });

  it("gives undefined for text that is not a lane", () => {
    expect(parseLane("0:100 x")).toBeUndefined();
    expect(parseLane("")).toBeUndefined();
  });
});

describe("valueAt", () => {
  it("gives the value of the last point at or before a beat", () => {
    expect(valueAt(lane, 2.5)).toBe(200);
    expect(valueAt(lane, 7.9)).toBe(200);
    expect(valueAt(lane, 20)).toBe(300);
  });

  it("gives undefined before the first point", () => {
    expect(valueAt([{ beat: 4, value: 1 }], 3)).toBeUndefined();
  });

  it("goes in a straight line to a point reached in a ramp, and holds it after", () => {
    const ramp = [
      { beat: 0, value: 100 },
      { beat: 4, value: 300, ramp: true },
    ];

    expect(valueAt(ramp, 1)).toBe(150);
    expect(valueAt(ramp, 4)).toBe(300);
    expect(valueAt(ramp, 6)).toBe(300);
  });

  it("jumps to a point reached in a ramp on the same beat as the one before", () => {
    const ramp = [
      { beat: 0, value: 0 },
      { beat: 2, value: 1 },
      { beat: 2, value: 5, ramp: true },
    ];

    expect(valueAt(ramp, 1.999)).toBe(0);
    expect(valueAt(ramp, 2)).toBe(5);
  });

  it("jumps to a first point reached in a ramp, with nothing to start it from", () => {
    expect(valueAt([{ beat: 4, value: 1, ramp: true }], 3)).toBeUndefined();
    expect(valueAt([{ beat: 4, value: 1, ramp: true }], 4)).toBe(1);
  });
});

describe("pointsIn", () => {
  it("gives the points from a beat up to another one, that one left out", () => {
    expect(pointsIn(lane, 0, 8)).toEqual(lane.slice(0, 2));
  });
});

describe("changesIn", () => {
  it("gives the points, and every sixteenth of a beat along a ramp", () => {
    const ramp = [
      { beat: 0, value: 0 },
      { beat: 0.25, value: 4, ramp: true },
      { beat: 1, value: 0 },
    ];

    expect(changesIn(ramp, 0, 2)).toEqual([
      { beat: 0, value: 0 },
      { beat: 0.0625, value: 1 },
      { beat: 0.125, value: 2 },
      { beat: 0.1875, value: 3 },
      { beat: 0.25, value: 4 },
      { beat: 1, value: 0 },
    ]);
  });

  it("gives only the steps of a ramp from a beat up to another one", () => {
    const ramp = [
      { beat: 0, value: 0 },
      { beat: 1, value: 16, ramp: true },
    ];

    expect(changesIn(ramp, 0.5, 0.625)).toEqual([
      { beat: 0.5, value: 8 },
      { beat: 0.5625, value: 9 },
    ]);
  });
});

describe("withPoint", () => {
  it("adds a point in its place", () => {
    expect(withPoint(lane, 4, 250)).toEqual([lane[0], lane[1], { beat: 4, value: 250 }, lane[2]]);
  });

  it("replaces a point on the same beat", () => {
    expect(withPoint(lane, 2.5, 1)).toEqual([lane[0], { beat: 2.5, value: 1 }, lane[2]]);
  });
});

describe("withoutPointsIn", () => {
  it("takes out the points from a beat up to another one, that one left out", () => {
    expect(withoutPointsIn(lane, 2, 4)).toEqual([lane[0], lane[2]]);
    expect(withoutPointsIn(lane, 0, 2.5)).toEqual([lane[1], lane[2]]);
  });
});

describe("withTake", () => {
  it("replaces what was between the start and the end with the take, and goes back to what was there after it", () => {
    const take = [
      { beat: 1, value: 10 },
      { beat: 2, value: 20 },
    ];

    expect(withTake(lane, take, 1, 3)).toEqual([lane[0], ...take, { beat: 3, value: 200 }, lane[2]]);
  });

  it("goes back to nothing after it where there was nothing", () => {
    expect(withTake([], [{ beat: 1, value: 10 }], 1, 3)).toEqual([{ beat: 1, value: 10 }]);
  });

  it("adds no point to go back to a value the take already ends on", () => {
    expect(withTake(lane, [{ beat: 3, value: 200 }], 3, 5)).toEqual([lane[0], lane[1], { beat: 3, value: 200 }, lane[2]]);
  });
});

describe("withConstant", () => {
  it("holds a value from a beat up to another one, and goes back to what was there after it", () => {
    expect(withConstant(lane, 50, 2, 6)).toEqual([lane[0], { beat: 2, value: 50 }, { beat: 6, value: 200 }, lane[2]]);
  });
});

describe("controlTargets", () => {
  it("gives the paths of the nodes and the cables, those inside subpatches too", () => {
    const graph: Graph = {
      nodes: [
        { id: "osc-1", type: "oscillator", position: { x: 0, y: 0 }, params: {} },
        {
          id: "sub-2",
          type: "subpatch",
          position: { x: 0, y: 0 },
          params: {},
          patch: {
            nodes: [{ id: "filter-3", type: "filter", position: { x: 0, y: 0 }, params: {} }],
            connections: [{ id: "a->b", source: { nodeId: "a", port: "audio" }, target: { nodeId: "b", port: "audio" } }],
          },
        },
      ],
      connections: [{ id: "c->d", source: { nodeId: "c", port: "audio" }, target: { nodeId: "d", port: "audio" } }],
    };

    expect([...controlTargets(graph)].sort()).toEqual(["c->d", "osc-1", "sub-2", "sub-2/a->b", "sub-2/filter-3"]);
  });
});

describe("controlLabel", () => {
  const graph: Graph = {
    nodes: [
      { id: "osc-1", type: "oscillator", position: { x: 0, y: 0 }, params: {} },
      { id: "mix-2", type: "mixer", name: "Main", position: { x: 0, y: 0 }, params: {} },
      {
        id: "sub-3",
        type: "subpatch",
        name: "Bass",
        position: { x: 0, y: 0 },
        params: {},
        patch: { nodes: [{ id: "filter-4", type: "filter", position: { x: 0, y: 0 }, params: {} }], connections: [] },
      },
    ],
    connections: [{ id: "osc-1:audio->mix-2:audio", source: { nodeId: "osc-1", port: "audio" }, target: { nodeId: "mix-2", port: "audio" } }],
  };

  it("names a param by the nodes down to it and its label", () => {
    expect(controlLabel(graph, "osc-1.detune")).toBe("Oscillator › Detune");
    expect(controlLabel(graph, "sub-3/filter-4.frequency")).toBe("Bass › Filter › Freq");
  });

  it("names a channel by its mixer and what it brings", () => {
    expect(controlLabel(graph, "osc-1:audio->mix-2:audio.mute")).toBe("Main › Oscillator 1 mute");
  });

  it("names the amount of a control cable by what it modulates and where it comes from", () => {
    const modulated: Graph = {
      nodes: [
        { id: "lfo-5", type: "lfo", position: { x: 0, y: 0 }, params: {} },
        { id: "gain-6", type: "gain", position: { x: 0, y: 0 }, params: {} },
      ],
      connections: [{ id: "lfo-5:out->gain-6:gain", source: { nodeId: "lfo-5", port: "out" }, target: { nodeId: "gain-6", port: "gain" } }],
    };

    expect(controlLabel(modulated, "lfo-5:out->gain-6:gain.amount")).toBe("Gain › Gain ← LFO 5 amount");
  });

  it("falls back on the key for what it cannot find", () => {
    expect(controlLabel(graph, "gone-9.x")).toBe("gone-9.x");
  });
});

describe("channelLabel", () => {
  const graph: Graph = {
    nodes: [
      {
        id: "sub-1",
        type: "subpatch",
        name: "Band",
        position: { x: 0, y: 0 },
        params: {},
        patch: {
          nodes: [
            { id: "noise-2", type: "noise", name: "Hiss", position: { x: 0, y: 0 }, params: {} },
            { id: "mixer-3", type: "mixer", position: { x: 0, y: 0 }, params: {} },
          ],
          connections: [{ id: "noise-2:audio->mixer-3:audio", source: { nodeId: "noise-2", port: "audio" }, target: { nodeId: "mixer-3", port: "audio" } }],
        },
      },
    ],
    connections: [],
  };

  it("names a channel by the nodes down to its mixer, and what it brings", () => {
    expect(channelLabel(graph, "sub-1/noise-2:audio->mixer-3:audio")).toBe("Band › Mixer › Hiss");
  });

  it("gives nothing for a cable that is not there", () => {
    expect(channelLabel(graph, "sub-1/osc-9:audio->mixer-3:audio")).toBeUndefined();
  });
});

