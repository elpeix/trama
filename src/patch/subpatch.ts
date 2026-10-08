import {
  moduleRegistry,
  paramHidden,
  portsOf,
  type CableParamDefinition,
  type CurveParamDefinition,
  type ParamDefinition,
  type PortDefinition,
} from "./registry";
import {
  NODE_NAME_MAX_LENGTH,
  type Graph,
  type NodeId,
  type ParamValue,
  type Patch,
  type PatchConnection,
  type Params,
  type PatchNode,
  type PortRef,
  type PortType,
  type PublishedParam,
} from "./types";

type Ports = { inputs: PortDefinition[]; outputs: PortDefinition[] };

export type PublishableParam = Exclude<ParamDefinition, CurveParamDefinition | CableParamDefinition>;

const ownParam = (node: Pick<PatchNode, "type">, param: string): PublishableParam | undefined => {
  const definition = moduleRegistry[node.type].params.find(({ id }) => id === param);
  return definition?.kind === "curve" || definition?.kind === "cable" ? undefined : definition;
};

/** A knob or a select published on a subpatch, by its key there. */
const publishedKnob = (node: Pick<PatchNode, "type" | "published" | "patch">, key: string) =>
  node.type === "subpatch"
    ? publishedParams(node).find(
        (control) => control.key === key && (control.definition.kind === "number" || control.definition.kind === "select"),
      )
    : undefined;

/**
 * A param of a node that can be published on its subpatch: anything played or programmed, not a
 * curve nor a cable; of a subpatch, also a knob or a select it publishes itself.
 */
export function publishableParam(node: Pick<PatchNode, "type" | "published" | "patch">, param: string): PublishableParam | undefined {
  return ownParam(node, param) ?? publishedKnob(node, param)?.definition;
}

/** The port and the key of a published param: the node inside and its param. */
export const publishedKey = ({ node, param }: Pick<PublishedParam, "node" | "param">) => `${node}.${param}`;

export interface PublishedControl {
  key: string;
  node: NodeId;
  param: string;
  name: string;
  definition: PublishableParam;
  value: ParamValue;
  /** The params of the node inside, those of its pattern A1. */
  params: Params;
  /** Hidden by another param of its node, as on the node itself: its knob is not shown. */
  hidden: boolean;
  section?: string;
  /** The node it sets in the end, by the path to it from inside the subpatch, and the param it sets there. */
  target: { path: NodeId[]; node: PatchNode; param: string };
}

/** The params published on a subpatch that are still inside it, each with what it takes to set it. */
export function publishedParams(subpatch: Pick<PatchNode, "published" | "patch">): PublishedControl[] {
  return (subpatch.published ?? []).flatMap((published) => {
    const inner = subpatch.patch?.nodes.find(({ id }) => id === published.node);
    if (!inner) {
      return [];
    }
    const title = inner.name ?? moduleRegistry[inner.type].title;
    const section = published.section !== undefined && { section: published.section };
    const definition = ownParam(inner, published.param);
    if (definition) {
      return [
        {
          key: publishedKey(published),
          node: published.node,
          param: published.param,
          name: published.name ?? `${title} ${definition.label}`,
          definition,
          value: inner.params[published.param] ?? definition.default,
          params: inner.params,
          hidden: paramHidden(definition, inner.params),
          ...section,
          target: { path: [inner.id], node: inner, param: published.param },
        },
      ];
    }
    const knob = publishedKnob(inner, published.param);
    if (!knob) {
      return [];
    }
    const { section: _inside, ...rest } = knob;
    return [
      {
        ...rest,
        key: publishedKey(published),
        node: published.node,
        param: published.param,
        name: published.name ?? `${title} ${knob.name}`,
        ...section,
        target: { ...knob.target, path: [inner.id, ...knob.target.path] },
      },
    ];
  });
}

/** What the face of a subpatch shows as one: a knob or a select, a screen, or all the rows of a node. */
export interface FaceItem {
  key: string;
  node: NodeId;
  kind: "control" | "screen" | "rows";
  controls: PublishedControl[];
  section?: string;
}

/** The face of a subpatch in order: the rows of a node all where the first one is, each other control on its own. */
export function faceItems(subpatch: Pick<PatchNode, "published" | "patch">): FaceItem[] {
  const items: FaceItem[] = [];
  for (const control of publishedParams(subpatch)) {
    const { kind } = control.definition;
    const rows = kind === "rhythm" ? items.find((item) => item.kind === "rows" && item.node === control.node) : undefined;
    if (rows) {
      rows.controls.push(control);
      continue;
    }
    items.push({
      key: control.key,
      node: control.node,
      kind: kind === "rhythm" ? "rows" : kind === "number" || kind === "select" ? "control" : "screen",
      controls: [control],
      ...(control.section !== undefined && { section: control.section }),
    });
  }
  return items;
}

const holding = (item: FaceItem, key: string) => item.controls.some((control) => control.key === key);

/** The published params of the items, in their order, each in the section of its item. */
function publishedOf(subpatch: Pick<PatchNode, "published">, items: readonly FaceItem[]): PublishedParam[] {
  const entries = subpatch.published ?? [];
  return items.flatMap((item) =>
    item.controls.map((control) => {
      const { section: _section, ...entry } = entries.find((candidate) => publishedKey(candidate) === control.key)!;
      return item.section === undefined ? entry : { ...entry, section: item.section };
    }),
  );
}

/**
 * The published params with the item holding `key` moved to the place of the one holding
 * `target`, after it going down and before it going up, into its section.
 */
export function withPublishedMoved(
  subpatch: Pick<PatchNode, "published" | "patch">,
  key: string,
  target: string,
): PublishedParam[] {
  const items = faceItems(subpatch);
  const from = items.findIndex((item) => holding(item, key));
  const to = items.findIndex((item) => holding(item, target));
  if (from < 0 || to < 0 || from === to) {
    return subpatch.published ?? [];
  }
  const moved = items.filter((_, at) => at !== from);
  const { section: _section, ...item } = items[from];
  moved.splice(to, 0, items[to].section === undefined ? item : { ...item, section: items[to].section });
  return publishedOf(subpatch, moved);
}

/**
 * The published params with a section named from the item holding `key` to the end of the one it
 * was in; an empty name joins them to the section before.
 */
export function withSectionAt(subpatch: Pick<PatchNode, "published" | "patch">, key: string, name: string): PublishedParam[] {
  const items = faceItems(subpatch);
  const from = items.findIndex((item) => holding(item, key));
  if (from < 0) {
    return subpatch.published ?? [];
  }
  const trimmed = name.trim().slice(0, NODE_NAME_MAX_LENGTH);
  const section = trimmed || items[from - 1]?.section;
  const current = items[from].section;
  let end = from;
  while (end < items.length && items[end].section === current) {
    end++;
  }
  return publishedOf(
    subpatch,
    items.map((item, at) => {
      if (at < from || at >= end) {
        return item;
      }
      const { section: _section, ...rest } = item;
      return section === undefined ? rest : { ...rest, section };
    }),
  );
}

/** A name for a new section that none of the published params has. */
export function newSectionName(published: readonly PublishedParam[]): string {
  const taken = new Set(published.map(({ section }) => section));
  let number = 1;
  while (taken.has(number === 1 ? "Section" : `Section ${number}`)) {
    number++;
  }
  return number === 1 ? "Section" : `Section ${number}`;
}

const signalOf = (node: PatchNode) => String(node.params.signal) as PortType;

const VOICE_PORTS: PortDefinition[] = [
  { id: "pitch", type: "control" },
  { id: "gate", type: "trigger" },
  { id: "velocity", type: "control" },
  { id: "notes", type: "notes" },
];

const fromTop = (a: PatchNode, b: PatchNode) => a.position.y - b.position.y || a.position.x - b.position.x;

/** The ports of a node: those of its kind, those an In or an Out carries, or those the In and Out inside a subpatch make. */
export function portsOfNode(node: Pick<PatchNode, "type" | "params" | "patch" | "published">): Ports {
  switch (node.type) {
    case "inlet": {
      const signal = signalOf(node as PatchNode);
      return { inputs: [], outputs: signal === "notes" ? VOICE_PORTS : [{ id: "out", type: signal }] };
    }
    case "outlet":
      return { inputs: [{ id: "in", type: signalOf(node as PatchNode) }], outputs: [] };
    case "subpatch": {
      const inner = node.patch?.nodes ?? [];
      const ports = (type: "inlet" | "outlet", name: string) =>
        inner
          .filter((candidate) => candidate.type === type)
          .sort(fromTop)
          .map((candidate, index) => ({
            id: candidate.id,
            type: signalOf(candidate),
            label: candidate.name ?? `${name} ${index + 1}`,
          }));
      const modulated = publishedParams(node)
        .filter(({ definition }) => definition.kind === "number" && definition.modulationRange !== undefined)
        .map(({ key, name }): PortDefinition => ({ id: key, type: "control", label: name }));
      return { inputs: [...ports("inlet", "in"), ...modulated], outputs: ports("outlet", "out") };
    }
    default:
      return portsOf(node.type);
  }
}

/** The ports of a node once flattened: an In and an Out then also have the port that faces the other side. */
export function flatPortsOf(node: Pick<PatchNode, "type" | "params" | "patch" | "published">): Ports {
  if (node.type === "inlet" || node.type === "outlet") {
    const type = signalOf(node as PatchNode);
    return { inputs: [{ id: "in", type }], outputs: type === "notes" ? VOICE_PORTS : [{ id: "out", type }] };
  }
  return portsOfNode(node);
}

/** The graph at `path`, a list of subpatches from the top; the top one for an empty path. */
export function graphAt(patch: Graph, path: readonly NodeId[]): Graph {
  let graph: Graph = patch;
  for (const id of path) {
    const inner = graph.nodes.find((node) => node.id === id && node.type === "subpatch")?.patch;
    if (!inner) {
      break;
    }
    graph = inner;
  }
  return graph;
}

/** The longest start of `path` whose subpatches all still exist. */
export function validPath(patch: Graph, path: readonly NodeId[]): NodeId[] {
  const valid: NodeId[] = [];
  let graph: Graph = patch;
  for (const id of path) {
    const inner = graph.nodes.find((node) => node.id === id && node.type === "subpatch")?.patch;
    if (!inner) {
      break;
    }
    valid.push(id);
    graph = inner;
  }
  return valid;
}

/** The node at the end of `path`, inside the subpatches before it; undefined if any of them is gone. */
export function nodeAt(patch: Graph, path: readonly NodeId[]): PatchNode | undefined {
  const outside = path.slice(0, -1);
  if (path.length === 0 || validPath(patch, outside).length !== outside.length) {
    return undefined;
  }
  return graphAt(patch, outside).nodes.find((node) => node.id === path.at(-1));
}

/** The patch with the graph at `path` replaced. */
export function withGraphAt<T extends Graph>(patch: T, path: readonly NodeId[], graph: Graph): T {
  if (path.length === 0) {
    return { ...patch, ...graph };
  }
  const [id, ...rest] = path;
  return {
    ...patch,
    nodes: patch.nodes.map((node) =>
      node.id === id && node.patch ? { ...node, patch: withGraphAt(node.patch, rest, graph) } : node,
    ),
  };
}

const voicesOf = (node: PatchNode) => (node.type === "subpatch" ? Number(node.params.voices ?? 1) : 1);

const voicePrefix = (prefix: string, id: NodeId, voice: number) =>
  voice === 1 ? `${prefix}${id}/` : `${prefix}${id}#${voice}/`;

/** The path of a flattened node or cable without the voices of the subpatches it is in: the same for all its copies. */
export const withoutVoices = (id: string) => id.replace(/#\d+\//g, "/");

/** The longest release of the envelopes of a graph, those inside its subpatches too: how long a voice sounds after its note. */
const longestRelease = (graph: Graph) =>
  Math.max(0, ...allNodes(graph).filter((node) => node.type === "envelope").map((node) => Number(node.params.release ?? 0)));

/**
 * A node of a voice of a subpatch: an In of notes learns which voice it plays, of how many, and
 * how long a voice rings after its note; it and each Out of sound learn the voice they belong to.
 */
const withVoice = (node: PatchNode, voice: number, voices: number, group: string, release: number): PatchNode => {
  if (node.type === "inlet" && node.params.signal === "notes") {
    return { ...node, params: { ...node.params, voice, voices, release, group } };
  }
  return node.type === "outlet" && node.params.signal === "audio" ? { ...node, params: { ...node.params, group } } : node;
};

const voicePrefixes = (prefix: string, node: PatchNode) =>
  Array.from({ length: voicesOf(node) }, (_, index) => voicePrefix(prefix, node.id, index + 1));

/** Where a cable into a port of a node ends once flattened: a published param at the node it sets in the end, on every voice down to it. */
function flatTargets(graph: Graph, { nodeId, port }: PortRef, prefix: string): PortRef[] {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (node?.type !== "subpatch") {
    return [{ nodeId: `${prefix}${nodeId}`, port }];
  }
  const entry = node.published?.find((candidate) => publishedKey(candidate) === port);
  return voicePrefixes(prefix, node).flatMap((inside) =>
    entry && node.patch
      ? flatTargets(node.patch, { nodeId: entry.node, port: entry.param }, inside)
      : [{ nodeId: `${inside}${port}`, port: "in" }],
  );
}

/** Where a cable out of a port of a node starts once flattened: at the Out of every voice of a subpatch. */
function flatSources(graph: Graph, { nodeId, port }: PortRef, prefix: string): PortRef[] {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  return node?.type === "subpatch"
    ? voicePrefixes(prefix, node).map((inside) => ({ nodeId: `${inside}${port}`, port: "out" }))
    : [{ nodeId: `${prefix}${nodeId}`, port }];
}

function flattenGraph(graph: Graph, prefix: string): Graph {
  const nodes: PatchNode[] = [];
  const connections: PatchConnection[] = [];
  for (const node of graph.nodes) {
    if (node.type === "subpatch") {
      const count = voicesOf(node);
      const inner = node.patch ?? { nodes: [], connections: [] };
      const release = longestRelease(inner);
      for (let voice = 1; voice <= count; voice++) {
        const group = voicePrefix(prefix, node.id, voice);
        const flat = flattenGraph({ ...inner, nodes: inner.nodes.map((child) => withVoice(child, voice, count, group, release)) }, group);
        nodes.push(...flat.nodes);
        connections.push(...flat.connections);
      }
    } else {
      const { patch: _inner, published: _published, ...rest } = node;
      nodes.push({ ...rest, id: `${prefix}${node.id}` });
    }
  }
  for (const connection of graph.connections) {
    const sources = flatSources(graph, connection.source, prefix);
    const targets = flatTargets(graph, connection.target, prefix);
    sources.forEach((source, from) =>
      targets.forEach((target, to) =>
        connections.push({
          ...connection,
          id: `${prefix}${connection.id}${from === 0 && to === 0 ? "" : `#${from + 1}-${to + 1}`}`,
          source,
          target,
        }),
      ),
    );
  }
  return { nodes, connections };
}

/**
 * The patch as the engine plays it: one graph, with the nodes inside each subpatch next to the
 * others, their ids prefixed with the path to them, and the cables into and out of a subpatch
 * running through its In and Out.
 */
export function flattenPatch(patch: Patch): Patch {
  return { ...patch, ...flattenGraph(patch, "") };
}

const reachable = (graph: Graph, connection: PatchConnection) => {
  const source = graph.nodes.find((node) => node.id === connection.source.nodeId);
  const target = graph.nodes.find((node) => node.id === connection.target.nodeId);
  const from = source && portsOfNode(source).outputs.find(({ id }) => id === connection.source.port);
  const to = target && portsOfNode(target).inputs.find(({ id }) => id === connection.target.port);
  return from !== undefined && to !== undefined && from.type === to.type;
};

/** The patch without the cables whose ports are gone or no longer carry the same signal, at every level. */
export function pruneConnections<T extends Graph>(patch: T): T {
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node.patch) {
      return node;
    }
    const inner = pruneConnections(node.patch);
    if (inner === node.patch) {
      return node;
    }
    changed = true;
    return { ...node, patch: inner };
  });
  const graph = { nodes, connections: patch.connections };
  const connections = patch.connections.filter((connection) => reachable(graph, connection));
  if (!changed && connections.length === patch.connections.length) {
    return patch;
  }
  return { ...patch, nodes, connections };
}

/** Every node of a graph, those inside its subpatches too. */
export function allNodes(graph: Graph): PatchNode[] {
  return graph.nodes.flatMap((node) => [node, ...(node.patch ? allNodes(node.patch) : [])]);
}

/** The patch without the published params whose node or param is gone, at every level. */
export function prunePublished<T extends Graph>(patch: T): T {
  let changed = false;
  const nodes = patch.nodes.map((node) => {
    if (!node.patch) {
      return node;
    }
    const inner = prunePublished(node.patch);
    const kept = (node.published ?? []).filter(({ node: id, param }) => {
      const found = inner.nodes.find((candidate) => candidate.id === id);
      return found !== undefined && publishableParam(found, param) !== undefined;
    });
    if (inner === node.patch && kept.length === (node.published ?? []).length) {
      return node;
    }
    changed = true;
    const { published: _published, ...rest } = node;
    return { ...rest, patch: inner, ...(kept.length > 0 && { published: kept }) };
  });
  return changed ? { ...patch, nodes } : patch;
}
