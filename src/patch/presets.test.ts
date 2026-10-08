import { describe, expect, it } from "vitest";
import { defaultParams } from "./registry";
import { hasPresets, innerNodes, presetOf, presetSampleIds, withPreset } from "./presets";
import type { PatchNode } from "./types";

const node = (overrides: Partial<PatchNode>): PatchNode => ({
  id: "filter-3",
  type: "filter",
  name: "Dark",
  position: { x: 10, y: 20 },
  params: defaultParams("filter"),
  ...overrides,
});

describe("presetOf", () => {
  it("keeps the settings of a node, not its id, name or place", () => {
    expect(presetOf(node({ params: { ...defaultParams("filter"), frequency: 300 } }))).toEqual({
      type: "filter",
      params: { ...defaultParams("filter"), frequency: 300 },
    });
  });

  it("keeps the patterns, and the inside of a subpatch with what it publishes", () => {
    const patch = { nodes: [node({ id: "filter-9" })], connections: [] };
    const published = [{ node: "filter-9", param: "frequency" }];
    const subpatch = node({ id: "subpatch-1", type: "subpatch", params: { voices: 4 }, patch, published });

    expect(presetOf(subpatch)).toEqual({ type: "subpatch", params: { voices: 4 }, patch, published });
    const seq = node({ type: "sequencer", params: defaultParams("sequencer"), patterns: { A2: { length: 4 } } });
    expect(presetOf(seq).patterns).toEqual({ A2: { length: 4 } });
  });

  it("leaves out the cable a scope holds still on, which belongs to its patch", () => {
    const scope = node({ type: "scope", params: { ...defaultParams("scope"), trigger: "osc-1:audio->scope-2:audio" } });

    expect(presetOf(scope).params.trigger).toBe("");
  });
});

describe("withPreset", () => {
  it("gives a node the settings of a preset, keeping its id, name and place", () => {
    const changed = withPreset(node({}), { type: "filter", params: { frequency: 300 } });

    expect(changed).toEqual({ ...node({}), params: { ...defaultParams("filter"), frequency: 300 } });
  });

  it("gives a subpatch the inside of the preset, and empties it for one without", () => {
    const inside = { nodes: [node({ id: "filter-9" })], connections: [] };
    const subpatch = node({ id: "subpatch-1", type: "subpatch", params: { voices: 1 }, patch: inside, published: [{ node: "filter-9", param: "Q" }] });

    expect(withPreset(subpatch, { type: "subpatch", params: { voices: 3 } })).toEqual({
      ...subpatch,
      params: { voices: 3 },
      patch: { nodes: [], connections: [] },
      published: undefined,
    });
  });
});

describe("innerNodes", () => {
  it("lists the nodes inside a preset, at every level", () => {
    const inner = node({ id: "subpatch-7", type: "subpatch", params: { voices: 1 }, patch: { nodes: [node({ id: "gain-12" })], connections: [] } });
    const preset = { type: "subpatch" as const, params: { voices: 1 }, patch: { nodes: [inner], connections: [] } };

    expect(innerNodes(preset).map(({ id }) => id)).toEqual(["subpatch-7", "gain-12"]);
    expect(innerNodes({ type: "filter", params: {} })).toEqual([]);
  });
});

describe("hasPresets", () => {
  it("offers presets for every module but the In and the Out", () => {
    expect(hasPresets("filter")).toBe(true);
    expect(hasPresets("subpatch")).toBe(true);
    expect(hasPresets("inlet")).toBe(false);
    expect(hasPresets("outlet")).toBe(false);
  });
});

describe("presetSampleIds", () => {
  it("lists the samples the samplers of some presets play, inside subpatches too, each once", () => {
    const sampler = (sample: string) => ({ type: "sampler" as const, params: { ...defaultParams("sampler"), sample } });
    const drums = {
      type: "subpatch" as const,
      params: { voices: 1 },
      patch: { nodes: [node({ id: "sampler-2", ...sampler("0000000000000002") })], connections: [] },
    };

    expect(presetSampleIds([sampler("0000000000000001"), drums, sampler("0000000000000001"), sampler("")])).toEqual([
      "0000000000000001",
      "0000000000000002",
    ]);
  });
});
