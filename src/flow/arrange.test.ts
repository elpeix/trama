import { describe, expect, it } from "vitest";
import song from "../../examples/43-song.json";
import { parsePatch } from "../patch/serialization";
import { defaultParams } from "../patch/registry";
import { portsOfNode } from "../patch/subpatch";
import type { Graph, NodeId, NodeType, PatchConnection, PatchNode, Position } from "../patch/types";
import { arrangeGraph } from "./arrange";
import type { Rect } from "./edgeGeometry";
import { NEW_NODE_SIZE } from "./placement";

type Size = { width: number; height: number };

const WIDE = 16 / 9;
const TALL = 1 / 3;

const KINDS: Record<string, NodeType> = {
  seq: "sequencer",
  osc: "oscillator",
  filter: "filter",
  vca: "gain",
  mix: "mixer",
  output: "output",
  lfo: "lfo",
  clock: "clock",
  hall: "reverb",
  delay: "delay",
  scope: "scope",
};

const typeOf = (id: NodeId) => KINDS[id.split("-").at(-1)!];

const node = (id: NodeId, position: Position = { x: 0, y: 0 }): PatchNode => ({
  id,
  type: typeOf(id),
  position,
  params: defaultParams(typeOf(id)),
});

const portsOf = (id: NodeId) => portsOfNode({ type: typeOf(id), params: defaultParams(typeOf(id)) });

const cable = (from: string, to: string): PatchConnection => {
  const [sourceId, sourcePort = portsOf(sourceId).outputs[0].id] = from.split(":");
  const [targetId, targetPort = portsOf(targetId).inputs[0].id] = to.split(":");
  return {
    id: `${from}->${to}`,
    source: { nodeId: sourceId, port: sourcePort },
    target: { nodeId: targetId, port: targetPort },
  };
};

const graphOf = (cables: [string, string][], extra: NodeId[] = []): Graph => {
  const ids = [...new Set([...cables.flat().map((end) => end.split(":")[0]), ...extra])];
  return {
    nodes: ids.map((id, index) => node(id, { x: 0, y: index * 100 })),
    connections: cables.map(([from, to]) => cable(from, to)),
  };
};

const track = (name: string, into = "mix"): [string, string][] => [
  [`${name}-seq`, `${name}-osc`],
  [`${name}-osc`, `${name}-vca`],
  [`${name}-vca`, into],
];

const rectsOf = (positions: Record<NodeId, Position>, sizes: Record<NodeId, Size> = {}) =>
  Object.fromEntries(
    Object.entries(positions).map(([id, position]) => [id, { ...position, ...(sizes[id] ?? NEW_NODE_SIZE) }]),
  ) as Record<NodeId, Rect>;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const expectNoOverlaps = (rects: Record<NodeId, Rect>) => {
  const all = Object.entries(rects);
  for (const [index, [id, rect]] of all.entries()) {
    for (const [otherId, other] of all.slice(index + 1)) {
      expect(overlaps(rect, other), `${id} overlaps ${otherId}`).toBe(false);
    }
  }
};

const bounds = (rects: Rect[]) => ({
  left: Math.min(...rects.map((rect) => rect.x)),
  top: Math.min(...rects.map((rect) => rect.y)),
  right: Math.max(...rects.map((rect) => rect.x + rect.width)),
  bottom: Math.max(...rects.map((rect) => rect.y + rect.height)),
});

const ofTrack = (rects: Record<NodeId, Rect>, name: string) =>
  Object.entries(rects)
    .filter(([id]) => id.startsWith(`${name}-`))
    .map(([, rect]) => rect);

describe("arrangeGraph", () => {
  it("leaves an empty graph empty", () => {
    expect(arrangeGraph({ nodes: [], connections: [] }, {}, WIDE)).toEqual({});
  });

  it("lays a chain out from left to right, following the signal, on one row", () => {
    const graph = graphOf([
      ["osc", "filter"],
      ["filter", "vca"],
      ["vca", "output"],
    ]);

    const rects = rectsOf(arrangeGraph(graph, {}, WIDE));

    expect(rects.osc.x + rects.osc.width).toBeLessThan(rects.filter.x);
    expect(rects.filter.x + rects.filter.width).toBeLessThan(rects.vca.x);
    expect(rects.vca.x + rects.vca.width).toBeLessThan(rects.output.x);
    expect(new Set(Object.values(rects).map((rect) => rect.y))).toEqual(new Set([0]));
  });

  it("starts at the origin", () => {
    const graph = graphOf([["osc", "output"]]);
    graph.nodes = graph.nodes.map((each) => ({ ...each, position: { x: 900, y: -400 } }));

    const { left, top } = bounds(Object.values(rectsOf(arrangeGraph(graph, {}, WIDE))));

    expect({ left, top }).toEqual({ left: 0, top: 0 });
  });

  it("stacks the nodes of a column by their measured size, as they were from the top", () => {
    const graph = graphOf([
      ["seq", "low-osc"],
      ["seq", "high-osc"],
      ["low-osc", "vca"],
      ["high-osc", "vca"],
    ]);
    graph.nodes = graph.nodes.map((each) =>
      each.id === "high-osc" ? { ...each, position: { x: 0, y: -50 } } : each,
    );
    const sizes = { seq: { width: 300, height: 600 }, "high-osc": { width: 200, height: 450 } };

    const rects = rectsOf(arrangeGraph(graph, sizes, WIDE), sizes);

    expectNoOverlaps(rects);
    expect(rects["high-osc"].x).toBe(rects["low-osc"].x);
    expect(rects["high-osc"].y).toBeLessThan(rects["low-osc"].y);
    expect(rects.seq.x + 300).toBeLessThan(rects["high-osc"].x);
  });

  it("keeps each track together and puts what they feed to their right", () => {
    const graph = graphOf([...track("bass"), ...track("lead"), ["mix", "output"]]);

    const rects = rectsOf(arrangeGraph(graph, {}, TALL));
    const bass = bounds(ofTrack(rects, "bass"));
    const lead = bounds(ofTrack(rects, "lead"));

    expectNoOverlaps(rects);
    expect(bass.bottom).toBeLessThan(lead.top);
    expect(Math.max(bass.right, lead.right)).toBeLessThan(rects.mix.x);
    expect(rects.mix.x + rects.mix.width).toBeLessThan(rects.output.x);
    expect(rects.mix.y).toBeGreaterThan(bass.top);
    expect(rects.mix.y).toBeLessThan(lead.bottom);
  });

  it("keeps the tracks in the order they were from the top", () => {
    const graph = graphOf([...track("bass"), ...track("lead")]);
    graph.nodes = graph.nodes.map((each) =>
      each.id.startsWith("lead-") ? { ...each, position: { x: 0, y: -1000 } } : each,
    );

    const rects = rectsOf(arrangeGraph(graph, {}, TALL));

    expect(bounds(ofTrack(rects, "lead")).bottom).toBeLessThan(bounds(ofTrack(rects, "bass")).top);
  });

  it("wraps the tracks into columns to fill a wide view, and not a tall one", () => {
    const names = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
    const graph = graphOf([...names.flatMap((name) => track(name)), ["mix", "output"]]);
    const columns = (aspect: number) => {
      const rects = rectsOf(arrangeGraph(graph, {}, aspect));
      expectNoOverlaps(rects);
      return new Set(names.map((name) => rects[`${name}-seq`].x)).size;
    };

    expect(columns(WIDE)).toBeGreaterThan(1);
    expect(columns(TALL)).toBe(1);
  });

  it("does not join the tracks a clock drives", () => {
    const graph = graphOf([
      ["clock", "bass-seq:clock"],
      ["clock", "lead-seq:clock"],
      ...track("bass"),
      ...track("lead"),
    ]);

    const rects = rectsOf(arrangeGraph(graph, {}, TALL));

    expect(bounds(ofTrack(rects, "bass")).bottom).toBeLessThan(bounds(ofTrack(rects, "lead")).top);
  });

  it("keeps a modulator with the track it modulates", () => {
    const graph = graphOf([
      ...track("bass"),
      ["bass-lfo", "bass-osc:frequency"],
      ...track("lead"),
      ["mix", "output"],
    ]);

    const rects = rectsOf(arrangeGraph(graph, {}, TALL));
    const bass = bounds(ofTrack(rects, "bass"));

    expect(rects["bass-lfo"].y + rects["bass-lfo"].height).toBeLessThanOrEqual(bass.bottom);
    expect(bass.bottom).toBeLessThan(bounds(ofTrack(rects, "lead")).top);
  });

  it("puts an effect shared by some tracks next to what it feeds", () => {
    const graph = graphOf([
      ...track("bass"),
      ...track("lead"),
      ["bass-vca", "hall"],
      ["lead-vca", "hall"],
      ["hall", "mix"],
      ["mix", "output"],
    ]);

    const rects = rectsOf(arrangeGraph(graph, {}, TALL));
    const tracks = bounds([...ofTrack(rects, "bass"), ...ofTrack(rects, "lead")]);

    expectNoOverlaps(rects);
    expect(tracks.right).toBeLessThan(rects.hall.x);
    expect(rects.hall.x + rects.hall.width).toBeLessThan(rects.mix.x);
  });

  it("copes with feedback loops", () => {
    const graph = graphOf([
      ["osc", "delay"],
      ["delay", "filter"],
      ["filter", "delay"],
      ["filter", "output"],
      ["delay", "delay"],
    ]);

    const rects = rectsOf(arrangeGraph(graph, {}, WIDE));

    expectNoOverlaps(rects);
    expect(rects.osc.x).toBeLessThan(rects.delay.x);
    expect(rects.delay.x).toBeLessThan(rects.filter.x);
  });

  it("gives every node a place, one alone too", () => {
    const graph = graphOf([["osc", "output"]], ["scope", "lfo"]);

    const rects = rectsOf(arrangeGraph(graph, {}, WIDE));

    expect(Object.keys(rects).sort()).toEqual(["lfo", "osc", "output", "scope"]);
    expectNoOverlaps(rects);
  });

  it("lays the song example out wider than tall, with nothing on top of anything", () => {
    const graph = parsePatch(song);
    const sizes: Record<NodeId, Size> = Object.fromEntries(
      graph.nodes.map((each, index) => [each.id, { width: 180 + (index % 3) * 40, height: 150 + (index % 5) * 90 }]),
    );

    const rects = rectsOf(arrangeGraph(graph, sizes, WIDE), sizes);
    const { left, top, right, bottom } = bounds(Object.values(rects));

    expectNoOverlaps(rects);
    expect(right - left).toBeGreaterThan(bottom - top);
  });
});
