import type { Connection, Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";
import { portsOfNode } from "../patch/subpatch";
import type {
  Graph,
  NodeId,
  NodeType,
  PatchConnection,
  PatchNode,
  Params,
  Patterns,
  PortRef,
  PublishedParam,
} from "../patch/types";
import type { NodeView, PatchState } from "../store/patchStore";

export type FlowNodeData = {
  type: NodeType;
  name?: string;
  params: Params;
  patterns?: Patterns;
  patch?: Graph;
  published?: PublishedParam[];
};

export type FlowNode = Node<FlowNodeData, "module">;

export function toFlowNodes(nodes: PatchNode[], views: Record<NodeId, NodeView>): FlowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: "module" as const,
    position: node.position,
    data: {
      type: node.type,
      name: node.name,
      params: node.params,
      patterns: node.patterns,
      patch: node.patch,
      published: node.published,
    },
    ...views[node.id],
  }));
}

export function toFlowEdges(
  connections: PatchConnection[],
  nodes: PatchNode[],
  selectedIds: string[],
): Edge[] {
  const typeOf = (connection: PatchConnection) => {
    const source = nodes.find((node) => node.id === connection.source.nodeId);
    const port = source && portsOfNode(source).outputs.find(({ id }) => id === connection.source.port);
    return port?.type ?? "audio";
  };

  return connections.map((connection) => ({
    ...(typeOf(connection) === "control" && {
      type: "control",
      data: { amount: connection.amount ?? 1 },
    }),
    id: connection.id,
    source: connection.source.nodeId,
    sourceHandle: connection.source.port,
    target: connection.target.nodeId,
    targetHandle: connection.target.port,
    selected: selectedIds.includes(connection.id),
    className: `edge-${typeOf(connection)}`,
  }));
}

export function fromFlowConnection(
  connection: Connection | Edge,
): { source: PortRef; target: PortRef } | null {
  if (!connection.sourceHandle || !connection.targetHandle) {
    return null;
  }
  return {
    source: { nodeId: connection.source, port: connection.sourceHandle },
    target: { nodeId: connection.target, port: connection.targetHandle },
  };
}

export function fromFlowDeletion({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  return { nodes: nodes.map(({ id }) => id), connections: edges.map(({ id }) => id) };
}

export function applyFlowNodeChanges(
  changes: NodeChange<FlowNode>[],
  actions: Pick<PatchState, "moveNode" | "setNodeView">,
) {
  for (const change of changes) {
    switch (change.type) {
      case "position":
        if (change.position) {
          actions.moveNode(change.id, change.position);
        }
        if (change.dragging !== undefined) {
          actions.setNodeView(change.id, { dragging: change.dragging });
        }
        break;
      case "dimensions":
        if (change.dimensions) {
          actions.setNodeView(change.id, { measured: change.dimensions });
        }
        break;
      case "select":
        actions.setNodeView(change.id, { selected: change.selected });
        break;
    }
  }
}

export function applyFlowEdgeChanges(
  changes: EdgeChange[],
  actions: Pick<PatchState, "setConnectionSelected">,
) {
  for (const change of changes) {
    switch (change.type) {
      case "select":
        actions.setConnectionSelected(change.id, change.selected);
        break;
    }
  }
}
