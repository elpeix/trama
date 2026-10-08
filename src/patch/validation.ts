import type { PortDefinition } from "./registry";
import { portsOfNode } from "./subpatch";
import type { Graph, NodeId, PortRef } from "./types";

export type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "unknown-node" | "unknown-port" | "incompatible" | "self" | "duplicate" | "cycle";
    };

export function canConnectPorts(source: PortDefinition, target: PortDefinition): boolean {
  return source.type === target.type;
}

export function validateConnection(
  patch: Graph,
  connection: { source: PortRef; target: PortRef },
): ValidationResult {
  const { source, target } = connection;
  const sourceNode = patch.nodes.find((node) => node.id === source.nodeId);
  const targetNode = patch.nodes.find((node) => node.id === target.nodeId);
  if (!sourceNode || !targetNode) {
    return { ok: false, reason: "unknown-node" };
  }

  const sourcePort = portsOfNode(sourceNode).outputs.find((port) => port.id === source.port);
  const targetPort = portsOfNode(targetNode).inputs.find((port) => port.id === target.port);
  if (!sourcePort || !targetPort) {
    return { ok: false, reason: "unknown-port" };
  }
  if (!canConnectPorts(sourcePort, targetPort)) {
    return { ok: false, reason: "incompatible" };
  }

  if (source.nodeId === target.nodeId) {
    return { ok: false, reason: "self" };
  }

  const duplicate = patch.connections.some(
    (existing) =>
      existing.source.nodeId === source.nodeId &&
      existing.source.port === source.port &&
      existing.target.nodeId === target.nodeId &&
      existing.target.port === target.port,
  );
  if (duplicate) {
    return { ok: false, reason: "duplicate" };
  }

  if (reaches(patch, target.nodeId, source.nodeId)) {
    return { ok: false, reason: "cycle" };
  }

  return { ok: true };
}

function reaches(patch: Graph, from: NodeId, to: NodeId): boolean {
  const pending = [from];
  const visited = new Set<NodeId>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === to) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const connection of patch.connections) {
      if (connection.source.nodeId === current) {
        pending.push(connection.target.nodeId);
      }
    }
  }
  return false;
}
