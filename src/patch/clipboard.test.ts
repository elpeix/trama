import { describe, expect, it } from "vitest";
import { copyGraph, pasteGraph } from "./clipboard";
import type { Graph, NodeType, PatchConnection, PatchNode, PortRef } from "./types";

const node = (id: string, type: NodeType, x = 0, y = 0, extra: Partial<PatchNode> = {}): PatchNode => ({
  id,
  type,
  position: { x, y },
  params: {},
  ...extra,
});

const cable = (source: PortRef, target: PortRef, extra: Partial<PatchConnection> = {}): PatchConnection => ({
  id: `${source.nodeId}:${source.port}->${target.nodeId}:${target.port}`,
  source,
  target,
  ...extra,
});

const audio = (nodeId: string) => ({ nodeId, port: "audio" });

const graph: Graph = {
  nodes: [
    node("oscillator-1", "oscillator", 0, 0),
    node("filter-2", "filter", 200, 0, { name: "Dark" }),
    node("lfo-3", "lfo", 200, 200),
    node("output-4", "output", 400, 0),
  ],
  connections: [
    cable(audio("oscillator-1"), audio("filter-2")),
    cable({ nodeId: "lfo-3", port: "out" }, { nodeId: "filter-2", port: "frequency" }, { amount: 0.3 }),
    cable(audio("filter-2"), audio("output-4")),
  ],
};

let last = 10;
const nextId = (type: NodeType) => `${type}-${++last}`;

describe("copyGraph", () => {
  it("copies the nodes and the cables between them, not the ones that reach out", () => {
    expect(copyGraph(graph, ["filter-2", "lfo-3"])).toEqual({
      nodes: [graph.nodes[1], graph.nodes[2]],
      connections: [graph.connections[1]],
    });
  });

  it("copies nothing without nodes", () => {
    expect(copyGraph(graph, [])).toBeUndefined();
    expect(copyGraph(graph, ["nope"])).toBeUndefined();
  });
});

describe("pasteGraph", () => {
  const clip = copyGraph(graph, ["oscillator-1", "filter-2", "lfo-3"])!;

  it("adds the nodes with new ids, moved by the offset, and their cables with their settings", () => {
    last = 10;
    const pasted = pasteGraph(graph, clip, nextId, { x: 40, y: 40 });

    expect(pasted.ids).toEqual(["oscillator-11", "filter-12", "lfo-13"]);
    expect(pasted.graph.nodes.slice(0, 4)).toEqual(graph.nodes);
    expect(pasted.graph.nodes.slice(4)).toEqual([
      node("oscillator-11", "oscillator", 40, 40),
      node("filter-12", "filter", 240, 40, { name: "Dark" }),
      node("lfo-13", "lfo", 240, 240),
    ]);
    expect(pasted.graph.connections).toEqual([
      ...graph.connections,
      cable(audio("oscillator-11"), audio("filter-12")),
      cable({ nodeId: "lfo-13", port: "out" }, { nodeId: "filter-12", port: "frequency" }, { amount: 0.3 }),
    ]);
  });

  it("keeps the inside of a subpatch, its published params and the cables to its ports", () => {
    const inner: Graph = {
      nodes: [node("inlet-5", "inlet", 0, 0, { params: { signal: "audio" } }), node("gain-6", "gain")],
      connections: [cable({ nodeId: "inlet-5", port: "out" }, audio("gain-6"))],
    };
    const subpatch = node("subpatch-7", "subpatch", 0, 0, {
      params: { voices: 1 },
      patch: inner,
      published: [{ node: "gain-6", param: "gain" }],
    });
    const outer: Graph = {
      nodes: [node("noise-8", "noise"), subpatch],
      connections: [cable(audio("noise-8"), { nodeId: "subpatch-7", port: "inlet-5" })],
    };
    last = 10;

    const pasted = pasteGraph(outer, copyGraph(outer, ["noise-8", "subpatch-7"])!, nextId, { x: 0, y: 0 });

    expect(pasted.graph.nodes[3]).toEqual({ ...subpatch, id: "subpatch-12" });
    expect(pasted.graph.connections[1]).toEqual(cable(audio("noise-11"), { nodeId: "subpatch-12", port: "inlet-5" }));
  });

  it("points the trace a scope holds still on to the pasted cable", () => {
    const scoped: Graph = {
      nodes: [
        node("oscillator-1", "oscillator"),
        node("scope-2", "scope", 0, 0, { params: { trigger: "oscillator-1:audio->scope-2:audio" } }),
      ],
      connections: [cable(audio("oscillator-1"), audio("scope-2"))],
    };
    last = 10;

    const pasted = pasteGraph(scoped, copyGraph(scoped, ["oscillator-1", "scope-2"])!, nextId, { x: 0, y: 0 });

    expect(pasted.graph.nodes[3].params.trigger).toBe("oscillator-11:audio->scope-12:audio");
  });

  it("leaves out the In and the Out outside a subpatch, with their cables", () => {
    const inner: Graph = {
      nodes: [node("inlet-1", "inlet"), node("gain-2", "gain")],
      connections: [cable({ nodeId: "inlet-1", port: "out" }, audio("gain-2"))],
    };
    last = 10;

    const pasted = pasteGraph({ nodes: [], connections: [] }, inner, nextId, { x: 0, y: 0 }, { ports: false });

    expect(pasted.ids).toEqual(["gain-11"]);
    expect(pasted.graph.connections).toEqual([]);
  });
});
