import { describe, expect, it } from "vitest";
import { groupGraph } from "./group";
import { defaultParams } from "./registry";
import type { Graph, NodeType, PatchNode } from "./types";

const node = (id: string, type: NodeType, extra: Partial<PatchNode> = {}): PatchNode => ({
  id,
  type,
  position: { x: 0, y: 0 },
  params: defaultParams(type),
  ...extra,
});

describe("groupGraph", () => {
  it("does not group a subpatch that gets notes, as an In inside cannot pass them on", () => {
    const synth = node("subpatch-2", "subpatch", {
      patch: { nodes: [node("inlet-3", "inlet", { params: { signal: "notes", value: 0 } })], connections: [] },
    });
    const graph: Graph = {
      nodes: [node("keyboard-1", "keyboard"), synth],
      connections: [
        {
          id: "keyboard-1:notes->subpatch-2:inlet-3",
          source: { nodeId: "keyboard-1", port: "notes" },
          target: { nodeId: "subpatch-2", port: "inlet-3" },
        },
      ],
    };
    let count = 0;

    expect(groupGraph(graph, ["subpatch-2"], (type) => `${type}-${(count += 10)}`)).toBeUndefined();
    expect(groupGraph(graph, ["keyboard-1"], (type) => `${type}-${(count += 10)}`)).toBeUndefined();
  });

  it("gives the subpatch and its In and Out every param, at its default", () => {
    const graph: Graph = {
      nodes: [node("oscillator-1", "oscillator"), node("filter-2", "filter"), node("output-3", "output")],
      connections: [
        { id: "oscillator-1:audio->filter-2:audio", source: { nodeId: "oscillator-1", port: "audio" }, target: { nodeId: "filter-2", port: "audio" } },
        { id: "filter-2:audio->output-3:audio", source: { nodeId: "filter-2", port: "audio" }, target: { nodeId: "output-3", port: "audio" } },
      ],
    };
    let count = 0;

    const { subpatch } = groupGraph(graph, ["filter-2"], (type) => `${type}-${(count += 10)}`)!;

    expect(subpatch.params).toEqual(defaultParams("subpatch"));
    const [inlet, , outlet] = subpatch.patch!.nodes;
    expect(inlet.params).toEqual({ ...defaultParams("inlet"), signal: "audio" });
    expect(outlet.params).toEqual({ ...defaultParams("outlet"), signal: "audio" });
  });
});
