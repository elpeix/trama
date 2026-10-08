import { AMOUNT, amountCable, CHANNEL_CONTROLS, isChannelKey, parseControlKey, type ControlKey } from "./automation";
import { isSafeLink } from "./meta";
import { patternIds } from "./patterns";
import { pinnableChannel, pinnableKnob, pinnableMixer, sceneKnobAt } from "./perform";
import { moduleRegistry } from "./registry";
import { parsePatch } from "./serialization";
import { patternPaths } from "./song";
import { nodeAt } from "./subpatch";
import { parseRhythmSteps } from "./sequence";
import type { Graph, NodeType, Params, PatchNode } from "./types";

type Json = Record<string, unknown>;

const PIECE_FIELDS = [
  "version",
  "tempo",
  "swing",
  "swingGrid",
  "meter",
  "nodes",
  "connections",
  "song",
  "perform",
  "hiddenLaunchers",
  "scenes",
  "meta",
  "samples",
];

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const records = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isRecord) : []);

/** The lowest and highest a control output can give, for the modules that tell. */
const OUTPUT_RANGES: Partial<Record<NodeType, (node: PatchNode, port: string) => [number, number] | undefined>> = {
  lfo: () => [-1, 1],
  envelope: () => [0, 1],
  envelopeFollower: (node) => [0, Number(node.params.gain)],
  clip: (_node, port) => (port === "velocity" ? [0, 1] : undefined),
  sequencer: (_node, port) => (port === "accent" ? [0, 1] : undefined),
};

/**
 * What a piece has that is lost on loading it, or that loads but does nothing: rows, lanes, pins
 * and scenes of nodes it has not, params a module has not, fields with a typo. Empty when the
 * piece loads whole; the reason it does not load, when it does not.
 */
export function checkPatch(input: unknown): string[] {
  let graph: Graph;
  try {
    graph = parsePatch(input);
  } catch (error) {
    return [`The piece does not load: ${error instanceof Error ? error.message : String(error)}`];
  }
  const piece = input as Json;
  const withPatterns = new Set(patternPaths(graph).map(({ path }) => path));
  const song = isRecord(piece.song) ? piece.song : {};
  return [
    ...Object.keys(piece)
      .filter((field) => !PIECE_FIELDS.includes(field))
      .map((field) => `Unknown field "${field}" of the piece`),
    ...nodeProblems(records(piece.nodes)),
    ...Object.keys(isRecord(song.rows) ? song.rows : {})
      .filter((path) => !withPatterns.has(path))
      .map((path) => `Song row "${path}" is for no node with patterns`),
    ...Object.keys(isRecord(song.automation) ? song.automation : {})
      .filter((key) => !moves(graph, key))
      .map((key) => `Song lane "${key}" moves nothing in the piece`),
    ...pinProblems(graph, records(piece.perform)),
    ...(Array.isArray(piece.hiddenLaunchers) ? piece.hiddenLaunchers : [])
      .filter((path) => !withPatterns.has(path))
      .map((path) => `Hidden launcher row "${path}" is for no node with patterns`),
    ...records(piece.scenes).flatMap((scene, index) => {
      const name = scene.name ? `"${scene.name}"` : index + 1;
      return [
        ...Object.keys(isRecord(scene.patterns) ? scene.patterns : {})
          .filter((path) => !withPatterns.has(path))
          .map((path) => `Scene ${name} plays a pattern on "${path}", which has no patterns`),
        ...Object.keys(isRecord(scene.knobs) ? scene.knobs : {})
          .filter((key) => sceneKnobAt(graph, key) === undefined)
          .map((key) => `Scene ${name} keeps the knob "${key}", which is not in the piece`),
      ];
    }),
    ...gainProblems(graph),
    ...rhythmProblems(graph),
    ...linkProblems(piece.meta),
  ];
}

/** The retrigs and chances written in a rhythm whose module plays every step once. */
function rhythmProblems(graph: Graph, prefix = ""): string[] {
  return graph.nodes.flatMap((node) => {
    const path = `${prefix}${node.id}`;
    if (node.patch) {
      return rhythmProblems(node.patch, `${path}/`);
    }
    const rhythms = moduleRegistry[node.type].params.filter((definition) => definition.kind === "rhythm");
    const sources: [string, Params][] = [
      [`Node "${path}"`, node.params],
      ...Object.entries(node.patterns ?? {}).map(([slot, pattern]): [string, Params] => [`Pattern ${slot} of node "${path}"`, pattern ?? {}]),
    ];
    return sources.flatMap(([where, params], index) =>
      rhythms.flatMap((definition) => {
        const rhythm = params[definition.id];
        if (index > 0 && rhythm === node.params[definition.id]) {
          return [];
        }
        const steps = parseRhythmSteps(String(rhythm ?? "")) ?? [];
        const lost = [
          ...(!definition.retrig && steps.some(({ retrig }) => retrig) ? ["retrigs"] : []),
          ...(!definition.chance && steps.some(({ chance }) => chance !== undefined) ? ["chances"] : []),
        ];
        return lost.map((marks) => `${where} plays "${definition.id}" without its ${marks}: only the Drums play them`);
      }),
    );
  });
}

/** The Gains whose modulation can take them below 0, where they invert the sound instead of silencing it. */
function gainProblems(graph: Graph, prefix = ""): string[] {
  return graph.nodes.flatMap((node) => {
    const path = `${prefix}${node.id}`;
    if (node.patch) {
      return gainProblems(node.patch, `${path}/`);
    }
    const lowest = node.type === "gain" ? lowestGain(graph, node) : undefined;
    return lowest !== undefined && lowest < 0
      ? [`Gain "${path}" goes down to ${Math.round(lowest * 100) / 100} with what modulates it: below 0 it inverts the sound instead of silencing it`]
      : [];
  });
}

/** The lowest a Gain can go with the cables into its gain, or undefined when one comes from an output of unknown range. */
function lowestGain(graph: Graph, gain: PatchNode): number | undefined {
  const definition = moduleRegistry.gain.params.find(({ id }) => id === "gain");
  const range = definition?.kind === "number" ? (definition.modulationRange ?? 1) : 1;
  let lowest = Number(gain.params.gain);
  for (const cable of graph.connections.filter(({ target }) => target.nodeId === gain.id && target.port === "gain")) {
    const source = graph.nodes.find(({ id }) => id === cable.source.nodeId);
    const output = source && OUTPUT_RANGES[source.type]?.(source, cable.source.port);
    if (!output) {
      return undefined;
    }
    const amount = (cable.amount ?? 1) * range;
    lowest += Math.min(amount * output[0], amount * output[1]);
  }
  return lowest;
}

function nodeProblems(nodes: Json[], prefix = ""): string[] {
  return nodes.flatMap((node) => {
    const path = `${prefix}${node.id}`;
    const type = node.type as NodeType;
    const known = moduleRegistry[type].params.map(({ id }) => id);
    const kept = patternIds(type);
    const inner = isRecord(node.patch) ? records(node.patch.nodes) : [];
    return [
      ...Object.keys(isRecord(node.params) ? node.params : {})
        .filter((name) => !known.includes(name))
        .map((name) => `Node "${path}" has no param "${name}"`),
      ...Object.entries(isRecord(node.patterns) ? node.patterns : {}).flatMap(([slot, pattern]) =>
        Object.keys(isRecord(pattern) ? pattern : {})
          .filter((name) => !kept.includes(name))
          .map((name) => `Pattern ${slot} of node "${path}" does not keep "${name}"`),
      ),
      ...nodeProblems(inner, `${path}/`),
    ];
  });
}

function moves(graph: Graph, key: ControlKey): boolean {
  const { target, name } = parseControlKey(key);
  if (isChannelKey(key) && name === AMOUNT) {
    return amountCable(graph, target) !== undefined;
  }
  if (isChannelKey(key)) {
    return pinnableChannel(graph, target) !== undefined && (CHANNEL_CONTROLS as readonly string[]).includes(name);
  }
  const node = nodeAt(graph, target.split("/"));
  return node !== undefined && moduleRegistry[node.type].params.some(({ id, kind }) => id === name && kind === "number");
}

function pinProblems(graph: Graph, pinned: Json[]): string[] {
  const keys = pinned.map(({ key }) => String(key));
  return keys.flatMap((key, index) => {
    if (keys.indexOf(key) !== index) {
      return [`Pinned knob "${key}" is pinned twice`];
    }
    return pinnableKnob(graph, key) || pinnableMixer(graph, key) ? [] : [`Pinned knob "${key}" is not in the piece`];
  });
}

function linkProblems(meta: unknown): string[] {
  const link = isRecord(meta) ? meta.link : undefined;
  return typeof link === "string" && !isSafeLink(link.trim()) ? [`The link "${link}" is not a web page`] : [];
}
