import { moduleRegistry } from "./registry";
import type { Graph, NodeId, NodeType, PatchConnection, Position, PortRef } from "./types";

const connectionId = (source: PortRef, target: PortRef) =>
  `${source.nodeId}:${source.port}->${target.nodeId}:${target.port}`;

const isPort = (type: NodeType) => type === "inlet" || type === "outlet";

/** Some nodes of a graph, and the cables between them; undefined without any. */
export function copyGraph(graph: Graph, ids: readonly NodeId[]): Graph | undefined {
  const nodes = graph.nodes.filter(({ id }) => ids.includes(id));
  if (nodes.length === 0) {
    return undefined;
  }
  const copied = new Set(nodes.map(({ id }) => id));
  return {
    nodes,
    connections: graph.connections.filter(({ source, target }) => copied.has(source.nodeId) && copied.has(target.nodeId)),
  };
}

/**
 * The graph with a copy of `clip` added, and the ids of the nodes added. Each node gets a new id
 * and moves by `offset`; a subpatch keeps its inside as it is. The cables between them follow,
 * with their settings, and so does the trace a scope holds still on. Without `ports`, outside any
 * subpatch, the In and the Out are left out.
 */
export function pasteGraph(
  graph: Graph,
  clip: Graph,
  nextId: (type: NodeType) => NodeId,
  offset: Position,
  { ports = true }: { ports?: boolean } = {},
): { graph: Graph; ids: NodeId[] } {
  const kept = clip.nodes.filter(({ type }) => ports || !isPort(type));
  const ids = new Map(kept.map(({ id, type }) => [id, nextId(type)]));
  const moved = (ref: PortRef) => ({ ...ref, nodeId: ids.get(ref.nodeId)! });
  const cables = clip.connections.filter(({ source, target }) => ids.has(source.nodeId) && ids.has(target.nodeId));
  const connections = cables.map((connection): PatchConnection => {
    const source = moved(connection.source);
    const target = moved(connection.target);
    return { ...connection, id: connectionId(source, target), source, target };
  });
  const cableIds = new Map(cables.map((connection, index) => [connection.id, connections[index].id]));
  const nodes = kept.map((node) => {
    const params = { ...node.params };
    for (const param of moduleRegistry[node.type].params) {
      if (param.kind === "cable" && cableIds.has(String(params[param.id]))) {
        params[param.id] = cableIds.get(String(params[param.id]))!;
      }
    }
    return {
      ...node,
      id: ids.get(node.id)!,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      params,
    };
  });
  return {
    graph: { nodes: [...graph.nodes, ...nodes], connections: [...graph.connections, ...connections] },
    ids: nodes.map(({ id }) => id),
  };
}
