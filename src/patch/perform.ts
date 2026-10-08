import { controlKey, controlLabel, isChannelKey, nodeLabel, parseControlKey, sourceName, type ChannelControl, type ControlKey } from "./automation";
import { patternIds } from "./patterns";
import { moduleRegistry, type NumberParamDefinition } from "./registry";
import { patternPaths } from "./song";
import type { PatternState } from "../audio/modules/AudioModule";
import { NODE_NAME_MAX_LENGTH, type Graph, type PatchConnection, type PatchNode, type PatternSlot, type PinnedKnob, type Scene } from "./types";

export interface PinnableKnob {
  node: PatchNode;
  definition: NumberParamDefinition;
}

export interface PerformKnob extends PinnableKnob {
  kind: "knob";
  key: ControlKey;
  label: string;
  value: number;
}

export interface PerformChannel {
  /** The path of the cable of the channel. */
  key: string;
  /** The source of the channel. */
  label: string;
  level: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

export interface PerformMixer {
  kind: "mixer";
  /** The path of the mixer. */
  key: string;
  label: string;
  /** The level of everything it sends out. */
  level: number;
  channels: PerformChannel[];
}

export type PerformItem = PerformKnob | PerformMixer;

const nodeAt = (graph: Graph, path: readonly string[]): PatchNode | undefined => {
  const [first, ...rest] = path;
  const node = graph.nodes.find(({ id }) => id === first);
  if (!node || rest.length === 0) {
    return node;
  }
  return node.patch && nodeAt(node.patch, rest);
};

const graphAt = (graph: Graph, path: readonly string[]): Graph | undefined =>
  path.length === 0 ? graph : nodeAt(graph, path)?.patch;

/** The cable a path names, if it brings a channel into a mixer. */
export function pinnableChannel(graph: Graph, path: string): PatchConnection | undefined {
  const steps = path.split("/");
  const inside = graphAt(graph, steps.slice(0, -1));
  const cable = inside?.connections.find(({ id }) => id === steps.at(-1));
  const mixer = cable && inside?.nodes.find(({ id }) => id === cable.target.nodeId);
  return mixer?.type === "mixer" && cable?.target.port === "audio" ? cable : undefined;
}

/** The mixer at a path, to pin with all its channels. */
export function pinnableMixer(graph: Graph, path: string): PatchNode | undefined {
  const node = path.includes("->") ? undefined : nodeAt(graph, path.split("/"));
  return node?.type === "mixer" ? node : undefined;
}

const pinnable = (graph: Graph, key: string) => pinnableKnob(graph, key) !== undefined || pinnableMixer(graph, key) !== undefined;

/** The node and the number param a control is, if it is a knob: not a param of the patterns, nor a mixer channel. */
export function knobAt(graph: Graph, key: ControlKey): PinnableKnob | undefined {
  if (isChannelKey(key)) {
    return undefined;
  }
  const { target, name } = parseControlKey(key);
  const node = nodeAt(graph, target.split("/"));
  const definition = node && moduleRegistry[node.type].params.find(({ id }) => id === name);
  if (!node || definition?.kind !== "number" || patternIds(node.type).includes(name)) {
    return undefined;
  }
  return { node, definition };
}

/** The knob a control is, if it can be pinned on its own: not the level of a mixer, which is pinned with the whole mixer. */
export function pinnableKnob(graph: Graph, key: ControlKey): PinnableKnob | undefined {
  const knob = knobAt(graph, key);
  return knob?.node.type === "mixer" ? undefined : knob;
}

/** The range a control moves over, as its knob turns. */
export type KnobRange = Pick<NumberParamDefinition, "min" | "max" | "step" | "scale">;

const LEVEL_RANGE: KnobRange = { min: 0, max: 1, step: 0.01, scale: "linear" };
const PAN_RANGE: KnobRange = { min: -1, max: 1, step: 0.01, scale: "linear" };

/** A control a scene keeps: its value in the patch, and the range of its knob. */
export interface SceneKnob {
  value: number;
  range: KnobRange;
}

/** The control a scene can keep: a knob of a node, the level of a mixer, or the level or pan of one of its channels. */
export function sceneKnobAt(graph: Graph, key: ControlKey): SceneKnob | undefined {
  const { target, name } = parseControlKey(key);
  if (isChannelKey(key)) {
    const cable = pinnableChannel(graph, target);
    if (!cable) {
      return undefined;
    }
    return name === "level"
      ? { value: cable.amount ?? 1, range: LEVEL_RANGE }
      : name === "pan"
        ? { value: cable.pan ?? 0, range: PAN_RANGE }
        : undefined;
  }
  const knob = knobAt(graph, key);
  if (!knob) {
    return undefined;
  }
  const { min, max, step, scale } = knob.definition;
  return { value: Number(knob.node.params[knob.definition.id] ?? knob.definition.default), range: { min, max, step, scale } };
}

/** The values a scene keeps of what is pinned: each knob, and the level of each mixer with the level and pan of its channels. */
export function sceneKnobs(graph: Graph, pinned: readonly PinnedKnob[]): Record<ControlKey, number> {
  return Object.fromEntries(
    performItems(graph, pinned).flatMap((item): [ControlKey, number][] =>
      item.kind === "knob"
        ? [[item.key, item.value]]
        : [
            [controlKey(item.key, "level"), item.level],
            ...item.channels.flatMap((channel): [ControlKey, number][] => [
              [controlKey(channel.key, "level"), channel.level],
              [controlKey(channel.key, "pan"), channel.pan],
            ]),
          ],
    ),
  );
}

export function performItems(graph: Graph, pinned: readonly PinnedKnob[]): PerformItem[] {
  return pinned.flatMap(({ key, name }): PerformItem[] => {
    const knob = pinnableKnob(graph, key);
    if (knob) {
      const value = Number(knob.node.params[knob.definition.id] ?? knob.definition.default);
      return [{ kind: "knob", ...knob, key, label: name ?? controlLabel(graph, key), value }];
    }
    const mixer = pinnableMixer(graph, key);
    if (mixer) {
      const steps = key.split("/");
      const prefix = steps.slice(0, -1).map((step) => `${step}/`).join("");
      const inside = graphAt(graph, steps.slice(0, -1))!;
      const channels = inside.connections
        .filter((cable) => cable.target.nodeId === mixer.id && cable.target.port === "audio")
        .map((cable): PerformChannel => {
          const source = inside.nodes.find(({ id }) => id === cable.source.nodeId);
          return {
            key: `${prefix}${cable.id}`,
            label: source ? sourceName(source) : cable.id,
            level: cable.amount ?? 1,
            pan: cable.pan ?? 0,
            mute: cable.mute === true,
            solo: cable.solo === true,
          };
        });
      const level = Number(mixer.params.level ?? 1);
      return [{ kind: "mixer", key, label: name ?? nodeLabel(graph, key) ?? key, level, channels }];
    }
    return [];
  });
}

export function withPinToggled(pinned: readonly PinnedKnob[], key: ControlKey): PinnedKnob[] {
  const kept = pinned.filter((knob) => knob.key !== key);
  return kept.length < pinned.length ? kept : [...pinned, { key }];
}

export function withPinName(pinned: PinnedKnob[], key: ControlKey, name: string): PinnedKnob[] {
  if (!pinned.some((knob) => knob.key === key)) {
    return pinned;
  }
  const trimmed = name.trim().slice(0, NODE_NAME_MAX_LENGTH);
  return pinned.map((knob) => (knob.key === key ? { key, ...(trimmed && { name: trimmed }) } : knob));
}

export function withPinMoved(pinned: PinnedKnob[], key: ControlKey, index: number): PinnedKnob[] {
  const from = pinned.findIndex((knob) => knob.key === key);
  const to = Math.max(0, Math.min(index, pinned.length - 1));
  if (from < 0 || from === to) {
    return pinned;
  }
  const moved = pinned.filter((_, at) => at !== from);
  moved.splice(to, 0, pinned[from]);
  return moved;
}

export function prunePinned(pinned: PinnedKnob[], graph: Graph): PinnedKnob[] {
  const kept = pinned.filter(({ key }, at) => pinnable(graph, key) && pinned.findIndex((knob) => knob.key === key) === at);
  return kept.length === pinned.length ? pinned : kept;
}

const withParamAt = <T extends Graph>(graph: T, path: readonly string[], name: string, value: number): T => {
  const [first, ...rest] = path;
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.id !== first) {
        return node;
      }
      return rest.length === 0
        ? { ...node, params: { ...node.params, [name]: value } }
        : { ...node, patch: withParamAt(node.patch!, rest, name, value) };
    }),
  };
};

export function withKnobValue<T extends Graph>(graph: T, key: ControlKey, value: number): T {
  if (!knobAt(graph, key)) {
    return graph;
  }
  const { target, name } = parseControlKey(key);
  return withParamAt(graph, target.split("/"), name, value);
}

export function withHiddenToggled(hidden: readonly string[], path: string): string[] {
  const kept = hidden.filter((shown) => shown !== path);
  return kept.length < hidden.length ? kept : [...hidden, path];
}

export function pruneHidden(hidden: string[], graph: Graph): string[] {
  const paths = new Set(patternPaths(graph).map(({ path }) => path));
  const kept = hidden.filter((path, at) => paths.has(path) && hidden.indexOf(path) === at);
  return kept.length === hidden.length ? hidden : kept;
}

export function withScene(scenes: readonly Scene[], patterns: Record<string, PatternSlot>, knobs: Record<ControlKey, number> = {}): Scene[] {
  return [...scenes, { patterns, ...(Object.keys(knobs).length > 0 && { knobs }) }];
}

export function withoutScene(scenes: Scene[], index: number): Scene[] {
  return index in scenes ? scenes.filter((_, at) => at !== index) : scenes;
}

export function withSceneName(scenes: Scene[], index: number, name: string): Scene[] {
  if (!(index in scenes)) {
    return scenes;
  }
  const trimmed = name.trim().slice(0, NODE_NAME_MAX_LENGTH);
  return scenes.map((scene, at) => {
    if (at !== index) {
      return scene;
    }
    const { name: _previous, ...rest } = scene;
    return trimmed ? { name: trimmed, ...rest } : rest;
  });
}

/** The scenes without the patterns and the knobs of what the patch has not, nor the scenes left empty. */
export function pruneScenes(scenes: Scene[], graph: Graph): Scene[] {
  const paths = new Set(patternPaths(graph).map(({ path }) => path));
  let changed = false;
  const kept = scenes.flatMap((scene) => {
    const entries = Object.entries(scene.patterns);
    const inPatch = entries.filter(([path]) => paths.has(path));
    const knobs = Object.entries(scene.knobs ?? {});
    const knobsInPatch = knobs.filter(([key]) => sceneKnobAt(graph, key) !== undefined);
    if (inPatch.length === entries.length && knobsInPatch.length === knobs.length) {
      return [scene];
    }
    changed = true;
    if (inPatch.length === 0) {
      return [];
    }
    const { knobs: _knobs, ...rest } = scene;
    return [
      {
        ...rest,
        patterns: Object.fromEntries(inPatch),
        ...(knobsInPatch.length > 0 && { knobs: Object.fromEntries(knobsInPatch) }),
      },
    ];
  });
  return changed ? kept : scenes;
}

/** Whether every node of a scene plays its pattern, or plays it or is about to. */
export function sceneStatus(scene: Scene, read: (path: string) => PatternState | undefined): "playing" | "queued" | undefined {
  const entries = Object.entries(scene.patterns);
  const states = entries.map(([path, slot]) => ({ slot, state: read(path) }));
  const plays = (slot: PatternSlot, state: PatternState | undefined) => state?.playing === slot && !state.stopped;
  if (states.every(({ slot, state }) => plays(slot, state))) {
    return "playing";
  }
  if (states.every(({ slot, state }) => plays(slot, state) || state?.queued === slot)) {
    return "queued";
  }
  return undefined;
}

const withCableAt = <T extends Graph>(graph: T, path: readonly string[], change: (cable: PatchConnection) => PatchConnection): T => {
  const [first, ...rest] = path;
  if (rest.length === 0) {
    return { ...graph, connections: graph.connections.map((cable) => (cable.id === first ? change(cable) : cable)) };
  }
  return { ...graph, nodes: graph.nodes.map((node) => (node.id === first ? { ...node, patch: withCableAt(node.patch!, rest, change) } : node)) };
};

/** The graph with a setting of a mixer channel changed; mute and solo are on from 0.5 up, and the centre leaves no pan. */
export function withChannelValue<T extends Graph>(graph: T, path: string, name: ChannelControl, value: number): T {
  if (!pinnableChannel(graph, path)) {
    return graph;
  }
  return withCableAt(graph, path.split("/"), (cable) => {
    if (name === "level") {
      return { ...cable, amount: value };
    }
    const { [name]: _previous, ...rest } = cable;
    if (name === "pan") {
      return value === 0 ? rest : { ...rest, pan: value };
    }
    return value >= 0.5 ? { ...rest, [name]: true } : rest;
  });
}
