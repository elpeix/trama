import { moduleRegistry } from "./registry";
import { portsOfNode } from "./subpatch";
import type { Graph, PatchConnection, PatchNode } from "./types";

/**
 * A control the song moves: a param of a node, or the level, pan, mute or solo of a mixer channel,
 * named by the path of its node or of its cable through the subpatches, a dot, and its name.
 */
export type ControlKey = string;

export interface AutomationPoint {
  /** Beats from the start of the song. */
  beat: number;
  value: number;
  /** Whether it is reached in a straight line from the point before, and not jumped to. */
  ramp?: boolean;
}

export const CHANNEL_CONTROLS = ["level", "pan", "mute", "solo"] as const;
export type ChannelControl = (typeof CHANNEL_CONTROLS)[number];

/** The control of a cable that brings a control signal: how much of it reaches its param. */
export const AMOUNT = "amount";

const EPSILON = 1e-6;
const POINT = /^(\d+(?:\.\d+)?)([:~])(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)$/;
const RAMP = "~";
/** How often a ramp moves its control, in beats. */
const RAMP_STEP_BEATS = 1 / 16;

export function controlKey(target: string, name: string): ControlKey {
  return `${target}.${name}`;
}

export function parseControlKey(key: ControlKey): { target: string; name: string } {
  const dot = key.lastIndexOf(".");
  return { target: key.slice(0, dot), name: key.slice(dot + 1) };
}

export function isChannelKey(key: ControlKey): boolean {
  return parseControlKey(key).target.includes("->");
}

export function parseLane(text: string): AutomationPoint[] | undefined {
  const tokens = text.split(" ").filter(Boolean);
  const points = tokens.map((token) => token.match(POINT));
  if (tokens.length === 0 || points.some((match) => !match)) {
    return undefined;
  }
  return points
    .map((match) => ({ beat: Number(match![1]), value: Number(match![3]), ...(match![2] === RAMP && { ramp: true }) }))
    .sort((a, b) => a.beat - b.beat);
}

export function formatLane(points: readonly AutomationPoint[]): string {
  return points
    .map(({ beat, value, ramp }) => `${Math.round(beat * 1000) / 1000}${ramp ? RAMP : ":"}${Number(value.toPrecision(6))}`)
    .join(" ");
}

const along = (from: AutomationPoint, to: AutomationPoint, beat: number) =>
  from.value + ((to.value - from.value) * (beat - from.beat)) / (to.beat - from.beat);

export function valueAt(points: readonly AutomationPoint[], beat: number): number | undefined {
  const index = points.findLastIndex((point) => point.beat <= beat + EPSILON);
  const next = points[index + 1];
  return index !== -1 && next?.ramp ? along(points[index], next, beat) : points[index]?.value;
}

export function pointsIn(points: readonly AutomationPoint[], from: number, to: number): AutomationPoint[] {
  return points.filter((point) => point.beat >= from - EPSILON && point.beat < to - EPSILON);
}

/** The values a control takes from a beat up to another one, that one left out: its points, and the steps along its ramps. */
export function changesIn(points: readonly AutomationPoint[], from: number, to: number): AutomationPoint[] {
  const steps = points.flatMap((point, index) => {
    const previous = points[index - 1];
    if (!point.ramp || !previous) {
      return [];
    }
    const end = Math.min(point.beat, to);
    const changes: AutomationPoint[] = [];
    for (let step = Math.ceil(Math.max(previous.beat, from) / RAMP_STEP_BEATS - EPSILON); step * RAMP_STEP_BEATS < end - EPSILON; step++) {
      const beat = step * RAMP_STEP_BEATS;
      if (beat > previous.beat + EPSILON) {
        changes.push({ beat, value: along(previous, point, beat) });
      }
    }
    return changes;
  });
  const own = pointsIn(points, from, to).map(({ beat, value }) => ({ beat, value }));
  return [...own, ...steps].sort((a, b) => a.beat - b.beat);
}

const sorted = (points: AutomationPoint[]) => points.sort((a, b) => a.beat - b.beat);

export function withPoint(points: readonly AutomationPoint[], beat: number, value: number): AutomationPoint[] {
  return sorted([...points.filter((point) => Math.abs(point.beat - beat) > EPSILON), { beat, value }]);
}

export function withoutPointsIn(points: readonly AutomationPoint[], from: number, to: number): AutomationPoint[] {
  const taken = new Set(pointsIn(points, from, to));
  return points.filter((point) => !taken.has(point));
}

/**
 * The lane with what was from `start` up to `end` replaced by a take; after the take, it goes
 * back to the value the lane had at `end`.
 */
export function withTake(
  points: readonly AutomationPoint[],
  take: readonly AutomationPoint[],
  start: number,
  end: number,
): AutomationPoint[] {
  const kept = points.filter((point) => point.beat < start - EPSILON || point.beat >= end - EPSILON);
  const back = valueAt(points, end);
  const keepsOwnEnd = points.some((point) => Math.abs(point.beat - end) <= EPSILON);
  const ending = take.at(-1)?.value;
  const restore = back !== undefined && !keepsOwnEnd && back !== ending ? [{ beat: end, value: back }] : [];
  return sorted([...kept, ...take, ...restore]);
}

/** The lane holding `value` from `start` up to `end`, and back to what it was after. */
export function withConstant(points: readonly AutomationPoint[], value: number, start: number, end: number): AutomationPoint[] {
  return withTake(points, [{ beat: start, value }], start, end);
}

/** The paths of every node and cable, those inside subpatches too: what the controls of a song can be on. */
export function controlTargets(graph: Graph, prefix = ""): Set<string> {
  const targets = new Set<string>();
  for (const node of graph.nodes) {
    targets.add(`${prefix}${node.id}`);
    if (node.patch) {
      controlTargets(node.patch, `${prefix}${node.id}/`).forEach((target) => targets.add(target));
    }
  }
  for (const connection of graph.connections) {
    targets.add(`${prefix}${connection.id}`);
  }
  return targets;
}

const titleOf = (node: PatchNode) => node.name ?? moduleRegistry[node.type].title;

/** The graph a path goes down to through the subpatches, the names of those, and the last step of the path. */
function descend(graph: Graph, target: string): { graph: Graph | undefined; names: string[]; last: string } {
  const steps = target.split("/");
  const names: string[] = [];
  let current: Graph | undefined = graph;
  for (const step of steps.slice(0, -1)) {
    const node: PatchNode | undefined = current?.nodes.find((candidate) => candidate.id === step);
    if (!node) {
      return { graph: undefined, names, last: steps.at(-1)! };
    }
    names.push(titleOf(node));
    current = node.patch;
  }
  return { graph: current, names, last: steps.at(-1)! };
}

/** What a mixer channel is called by what it brings: the name of its source, or its module and number. */
export function sourceName(source: PatchNode): string {
  const number = source.id.match(/-(\d+)$/)?.[1];
  return source.name ?? [moduleRegistry[source.type].title, number].filter(Boolean).join(" ");
}

/** The name of a node to show: the nodes down to it and its own. */
export function nodeLabel(graph: Graph, path: string): string | undefined {
  const { graph: current, names, last } = descend(graph, path);
  const node = current?.nodes.find((candidate) => candidate.id === last);
  return node && [...names, titleOf(node)].join(" › ");
}

/** The name of a mixer channel to show: the nodes down to its mixer, and the source of the channel. */
export function channelLabel(graph: Graph, path: string): string | undefined {
  const { graph: current, names, last } = descend(graph, path);
  const cable = current?.connections.find((connection) => connection.id === last);
  const source = cable && current?.nodes.find((candidate) => candidate.id === cable.source.nodeId);
  const mixer = cable && current?.nodes.find((candidate) => candidate.id === cable.target.nodeId);
  if (!source || !mixer) {
    return undefined;
  }
  return [...names, titleOf(mixer), sourceName(source)].join(" › ");
}

/** The control cable a path names: one that brings a control signal, whose amount the song can move. */
export function amountCable(graph: Graph, path: string): PatchConnection | undefined {
  const { graph: current, last } = descend(graph, path);
  const cable = current?.connections.find((connection) => connection.id === last);
  const source = cable && current?.nodes.find((candidate) => candidate.id === cable.source.nodeId);
  const port = source && portsOfNode(source).outputs.find(({ id }) => id === cable!.source.port);
  return port?.type === "control" ? cable : undefined;
}

/** The name of the amount of a control cable to show: the nodes down to the param it modulates, and its source. */
function amountLabel(graph: Graph, path: string): string | undefined {
  const { graph: current, names, last } = descend(graph, path);
  const cable = current?.connections.find((connection) => connection.id === last);
  const source = cable && current?.nodes.find((candidate) => candidate.id === cable.source.nodeId);
  const target = cable && current?.nodes.find((candidate) => candidate.id === cable.target.nodeId);
  if (!source || !target) {
    return undefined;
  }
  const port = cable!.target.port;
  const param = moduleRegistry[target.type].params.find(({ id }) => id === port)?.label ?? port;
  return `${[...names, titleOf(target), param].join(" › ")} ← ${sourceName(source)}`;
}

/**
 * The name of a control to show: the nodes down to it and the label of its param, its mixer and
 * the source of the channel, or the param a control cable modulates and its source.
 */
export function controlLabel(graph: Graph, key: ControlKey): string {
  const { target, name } = parseControlKey(key);
  const { graph: current, names, last } = descend(graph, target);
  const node = current?.nodes.find((candidate) => candidate.id === last);
  if (node) {
    const label = moduleRegistry[node.type].params.find((param) => param.id === name)?.label ?? name;
    return [...names, titleOf(node), label].join(" › ");
  }
  const cable = name === AMOUNT ? amountLabel(graph, target) : channelLabel(graph, target);
  return cable ? `${cable} ${name}` : key;
}
