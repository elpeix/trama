import { describe, expect, it, vi } from "vitest";
import type { PatchConnection, PatchNode } from "../patch/types";
import {
  applyFlowEdgeChanges,
  applyFlowNodeChanges,
  fromFlowConnection,
  fromFlowDeletion,
  toFlowEdges,
  toFlowNodes,
} from "./flowAdapter";

const node: PatchNode = {
  id: "gain-1",
  type: "gain",
  position: { x: 1, y: 2 },
  params: { gain: 0.5 },
};

const connection: PatchConnection = {
  id: "c1",
  source: { nodeId: "osc-1", port: "audio" },
  target: { nodeId: "gain-1", port: "audio" },
};

const actions = () => ({
  moveNode: vi.fn(),
  removeNode: vi.fn(),
  setNodeView: vi.fn(),
  disconnect: vi.fn(),
  setConnectionSelected: vi.fn(),
});

describe("toFlowNodes", () => {
  it("maps patch nodes and their view state", () => {
    const views = { "gain-1": { selected: true, measured: { width: 10, height: 20 } } };

    expect(toFlowNodes([node], views)).toEqual([
      {
        id: "gain-1",
        type: "module",
        position: { x: 1, y: 2 },
        data: { type: "gain", params: { gain: 0.5 } },
        selected: true,
        measured: { width: 10, height: 20 },
      },
    ]);
  });

  it("maps nodes without view state", () => {
    expect(toFlowNodes([node], {})[0]).toEqual({
      id: "gain-1",
      type: "module",
      position: { x: 1, y: 2 },
      data: { type: "gain", params: { gain: 0.5 } },
    });
  });
});

describe("toFlowEdges", () => {
  const nodes: PatchNode[] = [
    { ...node, id: "osc-1", type: "oscillator" },
    { ...node, id: "lfo-1", type: "lfo" },
    { ...node, id: "keys-1", type: "keyboard" },
  ];

  it("maps connections to edges with their handles", () => {
    expect(toFlowEdges([connection], nodes, ["c1"])).toEqual([
      {
        id: "c1",
        source: "osc-1",
        sourceHandle: "audio",
        target: "gain-1",
        targetHandle: "audio",
        selected: true,
        className: "edge-audio",
      },
    ]);
  });

  it("marks unselected edges", () => {
    expect(toFlowEdges([connection], nodes, [])[0].selected).toBe(false);
  });

  it("styles edges by the type of their source port", () => {
    const control: PatchConnection = {
      id: "c2",
      source: { nodeId: "lfo-1", port: "out" },
      target: { nodeId: "gain-1", port: "gain" },
    };
    const trigger: PatchConnection = {
      id: "c3",
      source: { nodeId: "keys-1", port: "gate" },
      target: { nodeId: "env-1", port: "gate" },
    };

    expect(toFlowEdges([control, trigger], nodes, []).map((edge) => edge.className)).toEqual([
      "edge-control",
      "edge-trigger",
    ]);
  });

  it("gives control edges an amount control", () => {
    const control: PatchConnection = {
      id: "c2",
      source: { nodeId: "lfo-1", port: "out" },
      target: { nodeId: "gain-1", port: "gain" },
    };

    const [plain, scaled] = toFlowEdges([control, { ...control, id: "c3", amount: 0.4 }], nodes, []);

    expect(plain).toMatchObject({ type: "control", data: { amount: 1 } });
    expect(scaled).toMatchObject({ type: "control", data: { amount: 0.4 } });
  });
});

describe("fromFlowConnection", () => {
  it("maps handles to ports", () => {
    expect(
      fromFlowConnection({
        source: "osc-1",
        sourceHandle: "audio",
        target: "gain-1",
        targetHandle: "audio",
      }),
    ).toEqual({ source: connection.source, target: connection.target });
  });

  it("returns null when a handle is missing", () => {
    expect(
      fromFlowConnection({ source: "osc-1", sourceHandle: null, target: "gain-1", targetHandle: "audio" }),
    ).toBeNull();
  });
});

describe("applyFlowNodeChanges", () => {
  it("moves dragged nodes", () => {
    const spy = actions();

    applyFlowNodeChanges(
      [{ type: "position", id: "gain-1", position: { x: 3, y: 4 }, dragging: true }],
      spy,
    );

    expect(spy.moveNode).toHaveBeenCalledWith("gain-1", { x: 3, y: 4 });
    expect(spy.setNodeView).toHaveBeenCalledWith("gain-1", { dragging: true });
  });

  it("records the end of a drag without a position", () => {
    const spy = actions();

    applyFlowNodeChanges([{ type: "position", id: "gain-1", dragging: false }], spy);

    expect(spy.moveNode).not.toHaveBeenCalled();
    expect(spy.setNodeView).toHaveBeenCalledWith("gain-1", { dragging: false });
  });

  it("stores measured dimensions", () => {
    const spy = actions();

    applyFlowNodeChanges(
      [{ type: "dimensions", id: "gain-1", dimensions: { width: 100, height: 40 } }],
      spy,
    );

    expect(spy.setNodeView).toHaveBeenCalledWith("gain-1", {
      measured: { width: 100, height: 40 },
    });
  });

  it("tracks selection", () => {
    const spy = actions();

    applyFlowNodeChanges([{ type: "select", id: "gain-1", selected: true }], spy);

    expect(spy.setNodeView).toHaveBeenCalledWith("gain-1", { selected: true });
  });

  it("leaves removals to the delete handler", () => {
    const spy = actions();

    applyFlowNodeChanges([{ type: "remove", id: "gain-1" }], spy);

    expect(spy.removeNode).not.toHaveBeenCalled();
  });
});

describe("applyFlowEdgeChanges", () => {
  it("tracks selection", () => {
    const spy = actions();

    applyFlowEdgeChanges([{ type: "select", id: "c1", selected: true }], spy);

    expect(spy.setConnectionSelected).toHaveBeenCalledWith("c1", true);
  });

  it("leaves removals to the delete handler", () => {
    const spy = actions();

    applyFlowEdgeChanges([{ type: "remove", id: "c1" }], spy);

    expect(spy.disconnect).not.toHaveBeenCalled();
  });
});

describe("fromFlowDeletion", () => {
  it("collects the ids of deleted nodes and edges", () => {
    expect(
      fromFlowDeletion({
        nodes: [{ id: "gain-1", position: { x: 0, y: 0 }, data: {} }],
        edges: [{ id: "c1", source: "osc-1", target: "gain-1" }],
      }),
    ).toEqual({ nodes: ["gain-1"], connections: ["c1"] });
  });
});
