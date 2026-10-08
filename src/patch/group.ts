import { defaultParams } from "./registry";
import { portsOfNode } from "./subpatch";
import type { Graph, NodeId, NodeType, PatchConnection, PatchNode, PortRef } from "./types";

const PORT_GAP = 260;
const PORT_STEP = 140;

const connectionId = (source: PortRef, target: PortRef) =>
  `${source.nodeId}:${source.port}->${target.nodeId}:${target.port}`;

const keyOf = ({ nodeId, port }: PortRef) => `${nodeId}:${port}`;

/** What a cable carries for the place it ends at: the attenuator of a control cable, the channel of a mixer. */
const settingsOf = ({ amount, pan, mute, solo }: PatchConnection) => ({
  ...(amount !== undefined && { amount }),
  ...(pan !== undefined && { pan }),
  ...(mute !== undefined && { mute }),
  ...(solo !== undefined && { solo }),
});

/** Whether a node outside the group reaches another one, going only through nodes outside it. */
function reachesOutside(graph: Graph, inside: Set<NodeId>, from: NodeId, to: NodeId): boolean {
  const pending = [from];
  const visited = new Set<NodeId>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === to) {
      return true;
    }
    if (visited.has(current) || inside.has(current)) {
      continue;
    }
    visited.add(current);
    pending.push(...graph.connections.filter(({ source }) => source.nodeId === current).map(({ target }) => target.nodeId));
  }
  return false;
}

const uniqueNames = (names: string[]) =>
  names.map((name, index) => {
    const earlier = names.slice(0, index).filter((other) => other === name).length;
    return earlier === 0 ? name : `${name} ${earlier + 1}`;
  });

/**
 * The graph with some of its nodes moved into a new subpatch, and that subpatch. The cables
 * between them go inside; each source outside that reaches them gets an In, and each port inside
 * that reaches out gets an Out, named after the port. What a cable carries for the place it ends
 * at, an attenuator or the channel of a mixer, stays on the cable that reaches that place, so the
 * patch sounds the same. Undefined when there is nothing to group, when a path outside would
 * lead from the group back into it, or when notes would cross it, as no In or Out passes them on.
 */
export function groupGraph(
  graph: Graph,
  ids: readonly NodeId[],
  nextId: (type: NodeType) => NodeId,
): { graph: Graph; subpatch: PatchNode } | undefined {
  const members = graph.nodes.filter(({ id }) => ids.includes(id));
  if (members.length === 0) {
    return undefined;
  }
  const inside = new Set(members.map(({ id }) => id));
  const isIn = (ref: PortRef) => inside.has(ref.nodeId);
  const entering = graph.connections.filter(({ source, target }) => !isIn(source) && isIn(target));
  const leaving = graph.connections.filter(({ source, target }) => isIn(source) && !isIn(target));
  const typeOf = (ref: PortRef) => {
    const node = graph.nodes.find(({ id }) => id === ref.nodeId)!;
    return portsOfNode(node).outputs.find(({ id }) => id === ref.port)!.type;
  };
  const loops = leaving.some((out) =>
    entering.some((into) => reachesOutside(graph, inside, out.target.nodeId, into.source.nodeId)),
  );
  const notes = [...entering, ...leaving].some(({ source }) => typeOf(source) === "notes");
  if (loops || notes) {
    return undefined;
  }
  const left = Math.min(...members.map(({ position }) => position.x));
  const right = Math.max(...members.map(({ position }) => position.x));
  const top = Math.min(...members.map(({ position }) => position.y));
  const subpatchId = nextId("subpatch");

  const sources = [...new Map(entering.map(({ source }) => [keyOf(source), source])).values()];
  const inletNames = uniqueNames(sources.map(({ port }) => port));
  const inlets = sources.map(
    (source, index): PatchNode => ({
      id: nextId("inlet"),
      type: "inlet",
      name: inletNames[index],
      position: { x: left - PORT_GAP, y: top + index * PORT_STEP },
      params: { ...defaultParams("inlet"), signal: typeOf(source) },
    }),
  );
  const inletFor = (source: PortRef) => inlets[sources.findIndex((candidate) => keyOf(candidate) === keyOf(source))];

  const exits = [...new Map(leaving.map(({ source }) => [keyOf(source), source])).values()];
  const outletNames = uniqueNames(exits.map(({ port }) => port));
  const outlets = exits.map(
    (source, index): PatchNode => ({
      id: nextId("outlet"),
      type: "outlet",
      name: outletNames[index],
      position: { x: right + PORT_GAP, y: top + index * PORT_STEP },
      params: { ...defaultParams("outlet"), signal: typeOf(source) },
    }),
  );
  const outletFor = (source: PortRef) => outlets[exits.findIndex((candidate) => keyOf(candidate) === keyOf(source))];

  const cable = (source: PortRef, target: PortRef, settings = {}): PatchConnection => ({
    id: connectionId(source, target),
    source,
    target,
    ...settings,
  });

  const innerConnections = [
    ...graph.connections.filter(({ source, target }) => isIn(source) && isIn(target)),
    ...entering.map((connection) =>
      cable({ nodeId: inletFor(connection.source).id, port: "out" }, connection.target, settingsOf(connection)),
    ),
    ...exits.map((source) => cable(source, { nodeId: outletFor(source).id, port: "in" })),
  ];
  const subpatch: PatchNode = {
    id: subpatchId,
    type: "subpatch",
    position: { x: left, y: top },
    params: defaultParams("subpatch"),
    patch: { nodes: [...inlets, ...members, ...outlets], connections: innerConnections },
  };

  const outerConnections = [
    ...graph.connections.filter(({ source, target }) => !isIn(source) && !isIn(target)),
    ...sources.map((source) => cable(source, { nodeId: subpatchId, port: inletFor(source).id })),
    ...leaving.map((connection) =>
      cable({ nodeId: subpatchId, port: outletFor(connection.source).id }, connection.target, settingsOf(connection)),
    ),
  ];
  const first = graph.nodes.findIndex(({ id }) => inside.has(id));
  const outerNodes = graph.nodes.filter(({ id }) => !inside.has(id));
  outerNodes.splice(first, 0, subpatch);

  return { graph: { nodes: outerNodes, connections: outerConnections }, subpatch };
}
