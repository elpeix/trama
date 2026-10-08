import { portsOfNode } from "../patch/subpatch";
import type { Graph, NodeId, PatchConnection, PatchNode, Position } from "../patch/types";
import { NEW_NODE_SIZE } from "./placement";

type Size = { width: number; height: number };

interface Block extends Size {
  offsets: Record<NodeId, Position>;
}

const COLUMN_GAP = 50;
const ROW_GAP = 30;
const TRACK_GAP = 80;
const BUS_GAP = 160;

const byPosition = (a: PatchNode, b: PatchNode) => a.position.y - b.position.y || a.position.x - b.position.x;

const isClock = (connection: PatchConnection) => connection.target.port === "clock";

class Groups {
  private parent = new Map<NodeId, NodeId>();

  find(id: NodeId): NodeId {
    const parent = this.parent.get(id) ?? id;
    if (parent === id) {
      return id;
    }
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  join(a: NodeId, b: NodeId) {
    const [rootA, rootB] = [this.find(a), this.find(b)];
    if (rootA !== rootB) {
      this.parent.set(rootA, rootB);
    }
  }
}

function signalOrder(nodes: PatchNode[], connections: PatchConnection[]) {
  const targets = new Map<NodeId, NodeId[]>(nodes.map((node) => [node.id, []]));
  for (const { source, target } of connections) {
    targets.get(source.nodeId)?.push(target.nodeId);
  }
  const visited = new Set<NodeId>();
  const order: NodeId[] = [];
  const visit = (id: NodeId) => {
    visited.add(id);
    for (const next of targets.get(id) ?? []) {
      if (!visited.has(next)) {
        visit(next);
      }
    }
    order.push(id);
  };
  for (const node of [...nodes].sort(byPosition)) {
    if (!visited.has(node.id)) {
      visit(node.id);
    }
  }
  return order.reverse();
}

function mergesTracks(
  incoming: PatchConnection[],
  audioInputs: Set<string>,
  roots: Map<NodeId, Set<NodeId>>,
) {
  const classes: Set<NodeId>[] = [];
  for (const connection of incoming) {
    if (!audioInputs.has(connection.target.port)) {
      continue;
    }
    const sourceRoots = roots.get(connection.source.nodeId)!;
    const touching = classes.filter((known) => [...sourceRoots].some((root) => known.has(root)));
    const joined = new Set([...sourceRoots, ...touching.flatMap((known) => [...known])]);
    classes.splice(0, classes.length, ...classes.filter((known) => !touching.includes(known)), joined);
  }
  return classes.length > 1;
}

function groupsOf(nodes: PatchNode[], forward: PatchConnection[], order: NodeId[]) {
  const incoming = new Map<NodeId, PatchConnection[]>(nodes.map((node) => [node.id, []]));
  for (const connection of forward) {
    incoming.get(connection.target.nodeId)!.push(connection);
  }
  const roots = new Map<NodeId, Set<NodeId>>();
  for (const id of order) {
    const sources = incoming.get(id)!.filter((connection) => !isClock(connection));
    roots.set(
      id,
      sources.length === 0 ? new Set([id]) : new Set(sources.flatMap(({ source }) => [...roots.get(source.nodeId)!])),
    );
  }

  const groups = new Groups();
  for (const node of nodes) {
    const audioInputs = new Set(
      portsOfNode(node)
        .inputs.filter((port) => port.type === "audio")
        .map((port) => port.id),
    );
    if (!mergesTracks(incoming.get(node.id)!, audioInputs, roots)) {
      for (const connection of incoming.get(node.id)!) {
        if (!isClock(connection)) {
          groups.join(connection.source.nodeId, node.id);
        }
      }
    }
  }

  const links = (withClocks: boolean) => {
    const upstream = new Map<NodeId, Set<NodeId>>();
    const downstream = new Map<NodeId, Set<NodeId>>();
    for (const connection of forward) {
      const [from, to] = [groups.find(connection.source.nodeId), groups.find(connection.target.nodeId)];
      if (from !== to && (withClocks || !isClock(connection))) {
        upstream.set(to, (upstream.get(to) ?? new Set()).add(from));
        downstream.set(from, (downstream.get(from) ?? new Set()).add(to));
      }
    }
    return { upstream, downstream };
  };
  for (let changed = true; changed; ) {
    changed = false;
    const signal = links(false);
    const all = links(true);
    for (const group of new Set(order.map((id) => groups.find(id)))) {
      const feeds = [...(all.downstream.get(group) ?? [])];
      const fed = signal.upstream.has(group);
      const [only] = feeds;
      const next = [...(signal.downstream.get(group) ?? [])];
      if (!fed && feeds.length === 1 && !signal.upstream.has(only)) {
        groups.join(group, only);
        changed = true;
        break;
      }
      if (fed && next.length === 1) {
        groups.join(group, next[0]);
        changed = true;
        break;
      }
    }
  }

  const { upstream } = links(false);
  const members = new Map<NodeId, NodeId[]>();
  for (const id of order) {
    const group = groups.find(id);
    members.set(group, [...(members.get(group) ?? []), id]);
  }
  return [...members].map(([group, ids]) => ({ ids, bus: upstream.has(group) }));
}

function blockOf(
  ids: NodeId[],
  forward: PatchConnection[],
  nodes: Map<NodeId, PatchNode>,
  sizes: Record<NodeId, Size>,
): Block {
  const inside = new Set(ids);
  const layers = new Map<NodeId, number>();
  for (const id of ids) {
    const from = forward
      .filter(({ source, target }) => target.nodeId === id && inside.has(source.nodeId))
      .map(({ source }) => layers.get(source.nodeId)! + 1);
    layers.set(id, Math.max(0, ...from));
  }
  const columns: PatchNode[][] = [];
  for (const id of ids) {
    (columns[layers.get(id)!] ??= []).push(nodes.get(id)!);
  }
  const sizeOf = (id: NodeId) => sizes[id] ?? NEW_NODE_SIZE;
  const offsets: Record<NodeId, Position> = {};
  let x = 0;
  let height = 0;
  for (const column of columns.filter(Boolean)) {
    let y = 0;
    for (const node of column.sort(byPosition)) {
      offsets[node.id] = { x, y };
      y += sizeOf(node.id).height + ROW_GAP;
    }
    height = Math.max(height, y - ROW_GAP);
    x += Math.max(...column.map((node) => sizeOf(node.id).width)) + COLUMN_GAP;
  }
  return { width: x - COLUMN_GAP, height, offsets };
}

const stackHeight = (blocks: Block[]) =>
  blocks.reduce((total, block) => total + block.height, 0) + TRACK_GAP * Math.max(0, blocks.length - 1);

function wrap(tracks: Block[], count: number) {
  const target = stackHeight(tracks) / count;
  const columns: Block[][] = [[]];
  for (const track of tracks) {
    const current = columns.at(-1)!;
    if (current.length > 0 && columns.length < count && stackHeight([...current, track]) > target) {
      columns.push([track]);
    } else {
      current.push(track);
    }
  }
  return columns;
}

/**
 * Places the nodes of a graph from the top left corner: each track, from what plays it to what it
 * feeds, from left to right; the tracks one below the other, in as many columns as fit `aspect`
 * best; and what the tracks feed together, such as a mixer, to their right.
 */
export function arrangeGraph(graph: Graph, sizes: Record<NodeId, Size>, aspect: number): Record<NodeId, Position> {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const connections = graph.connections.filter(
    ({ source, target }) => nodes.has(source.nodeId) && nodes.has(target.nodeId),
  );
  const order = signalOrder(graph.nodes, connections);
  const rank = new Map(order.map((id, index) => [id, index]));
  const forward = connections.filter(({ source, target }) => rank.get(source.nodeId)! < rank.get(target.nodeId)!);
  const top = (ids: NodeId[]) => ids.map((id) => nodes.get(id)!).sort(byPosition)[0];

  const groups = groupsOf(graph.nodes, forward, order).map((group) => ({
    ...group,
    block: blockOf(group.ids, forward, nodes, sizes),
    first: top(group.ids),
  }));
  const byFirst = (a: { first: PatchNode }, b: { first: PatchNode }) => byPosition(a.first, b.first);
  const tracks = groups.filter((group) => !group.bus).sort(byFirst);
  const buses = groups.filter((group) => group.bus).sort(byFirst);

  const busWidth = Math.max(0, ...buses.map(({ block }) => block.width));
  const busHeight = stackHeight(buses.map(({ block }) => block));
  const layouts = tracks.map((_track, index) => {
    const columns = wrap(
      tracks.map(({ block }) => block),
      index + 1,
    );
    const widths = columns.map((column) => Math.max(...column.map((block) => block.width)));
    const tracksWidth = widths.reduce((total, width) => total + width, 0) + BUS_GAP * (columns.length - 1);
    const width = buses.length === 0 ? tracksWidth : tracksWidth + BUS_GAP + busWidth;
    const height = Math.max(busHeight, ...columns.map(stackHeight));
    return { columns, widths, tracksWidth, height, fit: Math.abs(Math.log(width / height / aspect)) };
  });
  const best = layouts.reduce<(typeof layouts)[number] | undefined>(
    (chosen, layout) => (chosen === undefined || layout.fit < chosen.fit - 1e-9 ? layout : chosen),
    undefined,
  );

  const positions: Record<NodeId, Position> = {};
  const place = (block: Block, x: number, y: number) => {
    for (const [id, offset] of Object.entries(block.offsets)) {
      positions[id] = { x: Math.round(x + offset.x), y: Math.round(y + offset.y) };
    }
  };
  let x = 0;
  for (const [index, column] of (best?.columns ?? []).entries()) {
    let y = 0;
    for (const block of column) {
      place(block, x, y);
      y += block.height + TRACK_GAP;
    }
    x += best!.widths[index] + BUS_GAP;
  }
  let y = Math.max(0, ((best?.height ?? busHeight) - busHeight) / 2);
  for (const { block } of buses) {
    place(block, best === undefined ? 0 : x, y);
    y += block.height + TRACK_GAP;
  }
  return positions;
}
