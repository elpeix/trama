import { beatsPerBar, DEFAULT_METER, isMeter, sameMeter, type Meter } from "./meter";
import {
  defaultParams,
  moduleRegistry,
  type ClipParamDefinition,
  type CurveParamDefinition,
  type NotesParamDefinition,
  type RhythmParamDefinition,
  type SequenceParamDefinition,
} from "./registry";
import { parseClip } from "./clip";
import { FIRST_SLOT, isPatternSlot, legacySlot, OTHER_SLOTS, patternIds, patternOf } from "./patterns";
import { parseCurve, parseNotes, parseRhythm, parseSteps } from "./sequence";
import { controlTargets, formatLane, parseLane } from "./automation";
import { pruneHidden, prunePinned, pruneScenes } from "./perform";
import { isSafeLink, META_FIELDS, META_LIMITS, withMeta } from "./meta";
import { MAX_SONG_BARS, MIN_SONG_BARS, formatRow, parseRow, patternPaths, pruneAutomation, pruneSong } from "./song";
import {
  DEFAULT_SWING,
  DEFAULT_SWING_GRID,
  DEFAULT_TEMPO,
  MAX_SWING,
  MAX_TEMPO,
  MIN_SWING,
  MIN_TEMPO,
  NODE_NAME_MAX_LENGTH,
  SWING_GRIDS,
  type NodeType,
  type Params,
  type Graph,
  type Patch,
  type PatchConnection,
  type Patterns,
  type PatchNode,
  type PatchMeta,
  type PinnedKnob,
  type Scene,
  type PortRef,
  type Position,
  type PublishedParam,
  type Song,
  type SwingGrid,
} from "./types";
import { publishableParam } from "./subpatch";
import { SAMPLE_ID_PATTERN, type SampleRecord } from "../samples/sampleLibrary";
import { fromBase64, parseSampleList, toBase64 } from "./samples";
import type { PresetNode } from "./presets";
import { validateConnection } from "./validation";
import { PatchFormatError } from "./formatError";
import { migrate, PATCH_MIGRATIONS, PRESETS_MIGRATIONS } from "./migrations";

export const PATCH_VERSION = 1;

/** A cable id is made of the two ports it joins; anything longer names no cable of this patch. */
const CABLE_ID_MAX_LENGTH = 200;

/** A sample as a patch file carries it: the bytes of the audio file, in base64. */
export interface SampleFile {
  name: string;
  type: string;
  data: string;
}

export interface PatchFile extends Patch {
  version: typeof PATCH_VERSION;
  /** The samples its samplers play, by id; left out of the autosave, which the browser keeps them for. */
  samples?: Record<string, SampleFile>;
}

export { PatchFormatError };

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const fail = (message: string): never => {
  throw new PatchFormatError(message);
};

const serializeSamples = (samples: readonly SampleRecord[]): Record<string, SampleFile> =>
  Object.fromEntries(samples.map(({ id, name, type, data }) => [id, { name, type, data: toBase64(data) }]));

export function serializePatch(patch: Patch, samples: readonly SampleRecord[] = []): PatchFile {
  const swing = patch.swing ?? DEFAULT_SWING;
  return {
    version: PATCH_VERSION,
    tempo: patch.tempo,
    ...(swing !== DEFAULT_SWING && { swing }),
    ...(patch.swingGrid && patch.swingGrid !== DEFAULT_SWING_GRID && { swingGrid: patch.swingGrid }),
    ...(patch.meter && !sameMeter(patch.meter, DEFAULT_METER) && { meter: patch.meter }),
    ...serializeGraph(patch),
    ...(patch.song && { song: patch.song }),
    ...(patch.perform && patch.perform.length > 0 && { perform: patch.perform }),
    ...(patch.hiddenLaunchers && patch.hiddenLaunchers.length > 0 && { hiddenLaunchers: patch.hiddenLaunchers }),
    ...(patch.scenes && patch.scenes.length > 0 && { scenes: patch.scenes }),
    ...(patch.meta && { meta: patch.meta }),
    ...(samples.length > 0 && { samples: serializeSamples(samples) }),
  };
}

function serializeGraph(graph: Graph): Graph {
  return {
    nodes: graph.nodes.map(({ patterns, patch, ...node }) => {
      const changed = patterns && changedPatterns(node.type, node.params, patterns);
      return {
        ...node,
        params: withoutDefaultCurves(node.type, node.params),
        ...(changed && { patterns: changed }),
        ...(patch && { patch: serializeGraph(patch) }),
      };
    }),
    connections: graph.connections,
  };
}

function changedPatterns(type: NodeType, params: Params, patterns: Patterns): Patterns | undefined {
  const ids = patternIds(type);
  const first = patternOf(params, ids);
  const changed = Object.entries(patterns).filter(([, pattern]) =>
    ids.some((id) => pattern?.[id] !== first[id]),
  );
  return changed.length > 0 ? Object.fromEntries(changed) : undefined;
}

function withoutDefaultCurves(type: NodeType, params: Params): Params {
  const unchanged = new Set(
    moduleRegistry[type].params
      .filter((definition) => definition.kind === "curve" && params[definition.id] === definition.default)
      .map((definition) => definition.id),
  );
  return Object.fromEntries(Object.entries(params).filter(([name]) => !unchanged.has(name)));
}

export function parsePatch(file: unknown): Patch {
  if (!isRecord(file)) {
    return fail("The file does not contain a patch");
  }
  const input = migrate(file, { what: "patch", current: PATCH_VERSION, migrations: PATCH_MIGRATIONS });
  if (!Array.isArray(input.nodes) || !Array.isArray(input.connections)) {
    return fail("The patch needs a list of nodes and a list of connections");
  }

  const swing = parseSwing(input);
  const swingGrid = parseSwingGrid(input);
  const meter = parseMeter(input);
  const graph = parseGraph(input.nodes, input.connections);
  const song = input.song === undefined ? undefined : parseSong(input.song, graph, beatsPerBar(meter));
  const perform = input.perform === undefined ? [] : parsePerform(input.perform, graph);
  const hiddenLaunchers = input.hiddenLaunchers === undefined ? [] : parseHiddenLaunchers(input.hiddenLaunchers, graph);
  const scenes = input.scenes === undefined ? [] : parseScenes(input.scenes, graph);
  const meta = input.meta === undefined ? undefined : parseMeta(input.meta);
  return {
    ...graph,
    tempo: parseTempo(input),
    ...(swing !== undefined && { swing }),
    ...(swingGrid && { swingGrid }),
    ...(meter && { meter }),
    ...(song && { song }),
    ...(perform.length > 0 && { perform }),
    ...(hiddenLaunchers.length > 0 && { hiddenLaunchers }),
    ...(scenes.length > 0 && { scenes }),
    ...(meta && { meta }),
  };
}

const PRESET_ID = "preset";
const PRESET_PLACE = { x: 0, y: 0 };

/** A preset as it is kept: like a node of a patch file, without its id, name and place. */
export function serializePresetNode(node: PresetNode): Json {
  const [saved] = serializeGraph({ nodes: [{ ...node, id: PRESET_ID, position: PRESET_PLACE }], connections: [] }).nodes;
  const { id: _id, position: _position, ...kept } = saved;
  return kept as Json;
}

/** A preset kept, checked like a node of a patch file; throws a PatchFormatError when it is not one. */
export function parsePresetNode(input: unknown): PresetNode {
  if (!isRecord(input)) {
    return fail("The preset is not a node");
  }
  const { type, params, patterns, patch, published } = parseNode({ ...input, id: PRESET_ID, position: PRESET_PLACE });
  return {
    type,
    params,
    ...(patterns && { patterns }),
    ...(patch && { patch }),
    ...(published && { published }),
  };
}

/** What a presets file says it is, so that it is not taken for a patch. */
export const PRESETS_KIND = "trama-presets";
const LEGACY_PRESETS_KIND = "audiojac-presets";
export const PRESETS_VERSION = 1;

/** A preset as a presets file carries it: its name and its node, without an id of its own. */
export interface PresetEntry {
  name: string;
  node: PresetNode;
}

export interface PresetsFile {
  kind: typeof PRESETS_KIND;
  version: typeof PRESETS_VERSION;
  presets: { name: string; node: Json }[];
  /** The samples the samplers of the presets play, by id, as in a patch file. */
  samples?: Record<string, SampleFile>;
}

export function serializePresets(presets: readonly PresetEntry[], samples: readonly SampleRecord[] = []): PresetsFile {
  return {
    kind: PRESETS_KIND,
    version: PRESETS_VERSION,
    presets: presets.map(({ name, node }) => ({ name, node: serializePresetNode(node) })),
    ...(samples.length > 0 && { samples: serializeSamples(samples) }),
  };
}

export const isPresetsFile = (input: unknown) =>
  isRecord(input) && (input.kind === PRESETS_KIND || input.kind === LEGACY_PRESETS_KIND);

/** The presets of a presets file and the samples they play, all checked; throws a PatchFormatError for any error. */
export function parsePresets(input: unknown): { presets: PresetEntry[]; samples: SampleRecord[] } {
  if (!isPresetsFile(input)) {
    return fail("The file does not contain presets");
  }
  const file = migrate(input as Json, { what: "presets", current: PRESETS_VERSION, migrations: PRESETS_MIGRATIONS });
  if (!Array.isArray(file.presets)) {
    return fail("The file needs a list of presets");
  }
  const presets = file.presets.map((raw, index): PresetEntry => {
    const name = isRecord(raw) && typeof raw.name === "string" ? raw.name.trim() : "";
    if (!isRecord(raw) || !name || name.length > NODE_NAME_MAX_LENGTH) {
      return fail(`Preset ${index + 1} needs a name of 1 to ${NODE_NAME_MAX_LENGTH} characters`);
    }
    try {
      return { name, node: parsePresetNode(raw.node) };
    } catch (error) {
      return fail(`Preset "${name}": ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return { presets, samples: parseSamples(file) };
}

/** The samples a patch file carries, each checked; none when it carries none. */
export function parseSamples(input: unknown): SampleRecord[] {
  const samples = isRecord(input) ? input.samples : undefined;
  if (samples === undefined) {
    return [];
  }
  if (!isRecord(samples)) {
    return fail("The samples of the patch are not a list of samples by id");
  }
  return Object.entries(samples).map(([id, sample]): SampleRecord => {
    if (!SAMPLE_ID_PATTERN.test(id)) {
      return fail(`Invalid sample id "${id}"`);
    }
    if (!isRecord(sample) || typeof sample.name !== "string" || typeof sample.type !== "string" || typeof sample.data !== "string") {
      return fail(`Sample "${id}" needs a name, a type and its data`);
    }
    let data: ArrayBuffer;
    try {
      data = fromBase64(sample.data);
    } catch {
      return fail(`Sample "${id}" has data that is not base64`);
    }
    return { id, name: sample.name, type: sample.type, data };
  });
}

/** The nodes and cables of a patch, or of the graph inside a subpatch, each checked. */
function parseGraph(rawNodes: unknown[], rawConnections: unknown[]): Graph {
  const nodes: PatchNode[] = [];
  for (const raw of rawNodes) {
    const node = parseNode(raw);
    if (nodes.some(({ id }) => id === node.id)) {
      fail(`Duplicate node id "${node.id}"`);
    }
    nodes.push(node);
  }

  const graph: Graph = { nodes, connections: [] };
  for (const raw of rawConnections) {
    const connection = parseConnection(raw);
    if (graph.connections.some(({ id }) => id === connection.id)) {
      fail(`Duplicate connection id "${connection.id}"`);
    }
    const result = validateConnection(graph, connection);
    if (!result.ok) {
      fail(`Invalid connection "${connection.id}": ${result.reason}`);
    }
    graph.connections.push(connection);
  }
  return graph;
}

function parseInnerGraph(id: string, raw: unknown): Graph {
  if (raw === undefined) {
    return { nodes: [], connections: [] };
  }
  if (!isRecord(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.connections)) {
    return fail(`Subpatch "${id}" needs a list of nodes and a list of connections`);
  }
  return parseGraph(raw.nodes, raw.connections);
}

const isTempo = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= MIN_TEMPO && value <= MAX_TEMPO;

/**
 * The tempo of the patch. Files from before it was shared kept one in each arpeggiator or sequencer:
 * the first of those becomes the tempo of the whole patch.
 */
function parseTempo(input: Json): number {
  if (input.tempo !== undefined) {
    return isTempo(input.tempo) ? input.tempo : fail(`Invalid tempo: ${JSON.stringify(input.tempo)}`);
  }
  const legacy = (input.nodes as unknown[])
    .map((node) => (isRecord(node) && isRecord(node.params) ? node.params.tempo : undefined))
    .find(isTempo);
  return legacy ?? DEFAULT_TEMPO;
}

function parseSwing(input: Json): number | undefined {
  const { swing } = input;
  if (swing === undefined) {
    return undefined;
  }
  return isFiniteNumber(swing) && swing >= MIN_SWING && swing <= MAX_SWING
    ? swing
    : fail(`Invalid swing: ${JSON.stringify(swing)}`);
}

function parseSwingGrid(input: Json): SwingGrid | undefined {
  const { swingGrid } = input;
  if (swingGrid === undefined) {
    return undefined;
  }
  if (!SWING_GRIDS.includes(swingGrid as SwingGrid)) {
    return fail(`Invalid swing grid: ${JSON.stringify(swingGrid)}`);
  }
  return swingGrid === DEFAULT_SWING_GRID ? undefined : (swingGrid as SwingGrid);
}

const SONG_ROW = /^([A-D][1-8]|-|\.)( ([A-D][1-8]|-|\.))*$/;
const LEGACY_SONG_ROW = /^[ABCD-]( [ABCD-])*$/;
const CONTROL_KEY = /^.+\.[A-Za-z]\w*$/;
const isWholeNumber = (value: unknown): value is number => Number.isInteger(value);

/** The song of a patch, without the rows of nodes it does not have. */
function parseMeter(input: Json): Meter | undefined {
  const { meter } = input;
  if (meter === undefined) {
    return undefined;
  }
  if (!isMeter(meter)) {
    return fail(`Invalid meter: ${JSON.stringify(meter)}`);
  }
  return sameMeter(meter, DEFAULT_METER) ? undefined : meter;
}

function parseSong(raw: unknown, graph: Graph, beats: number): Song {
  if (!isRecord(raw)) {
    return fail("The song needs a number of bars and its rows");
  }
  const { bars, rows, loop, automation, fade } = raw;
  if (!isWholeNumber(bars) || bars < MIN_SONG_BARS || bars > MAX_SONG_BARS) {
    return fail(`Invalid number of bars in the song: ${JSON.stringify(bars)}`);
  }
  if (!isRecord(rows)) {
    return fail("The rows of the song need to be an object");
  }
  const parsedRows = Object.fromEntries(
    Object.entries(rows).map(([path, row]) => {
      if (typeof row !== "string" || !(SONG_ROW.test(row) || LEGACY_SONG_ROW.test(row)) || row.split(" ").length > bars) {
        return fail(`Invalid row "${path}" in the song: ${JSON.stringify(row)}`);
      }
      return [path, formatRow(parseRow(row, bars))];
    }),
  );
  const song: Song = { bars, rows: parsedRows };
  if (loop !== undefined) {
    if (
      !isRecord(loop) ||
      !isWholeNumber(loop.start) ||
      !isWholeNumber(loop.length) ||
      loop.start < 0 ||
      loop.length < 1 ||
      loop.start + loop.length > bars
    ) {
      return fail(`Invalid loop in the song: ${JSON.stringify(loop)}`);
    }
    song.loop = { start: loop.start, length: loop.length };
  }
  if (automation !== undefined) {
    song.automation = parseAutomation(automation, bars * beats);
  }
  if (fade !== undefined) {
    if (!isWholeNumber(fade) || fade < 1 || fade > bars) {
      return fail(`Invalid fade in the song: ${JSON.stringify(fade)}`);
    }
    song.fade = fade;
  }
  return pruneAutomation(pruneSong(song, new Set(patternPaths(graph).map(({ path }) => path))), controlTargets(graph));
}

/** The knobs and mixers pinned to perform, without those the patch does not have or pins twice. */
function parsePerform(raw: unknown, graph: Graph): PinnedKnob[] {
  if (!Array.isArray(raw)) {
    return fail("The knobs pinned to perform need to be a list");
  }
  const pinned = raw.map((knob): PinnedKnob => {
    if (!isRecord(knob) || typeof knob.key !== "string" || knob.key === "") {
      return fail(`Invalid knob pinned to perform: ${JSON.stringify(knob)}`);
    }
    const { key, name } = knob;
    if (name !== undefined && (typeof name !== "string" || name.length > NODE_NAME_MAX_LENGTH)) {
      return fail(`Invalid name of the knob "${key}" pinned to perform: ${JSON.stringify(name)}`);
    }
    return { key, ...(name && { name }) };
  });
  return prunePinned(pinned, graph);
}

/** The rows hidden from the launcher, without those of nodes the patch does not have. */
function parseHiddenLaunchers(raw: unknown, graph: Graph): string[] {
  if (!Array.isArray(raw) || raw.some((path) => typeof path !== "string")) {
    return fail(`Invalid rows hidden from the launcher: ${JSON.stringify(raw)}`);
  }
  return pruneHidden(raw as string[], graph);
}

/** The title, author, description and link of a piece; a link that is not a web page is left out. */
function parseMeta(raw: unknown): PatchMeta | undefined {
  if (!isRecord(raw)) {
    return fail("The meta of the piece needs to be an object");
  }
  for (const field of META_FIELDS) {
    const value = raw[field];
    if (value !== undefined && (typeof value !== "string" || value.trim().length > META_LIMITS[field])) {
      return fail(`Invalid ${field} of the piece: ${JSON.stringify(value)}`);
    }
  }
  const link = typeof raw.link === "string" && isSafeLink(raw.link.trim()) ? raw.link : undefined;
  return withMeta(undefined, { ...(raw as PatchMeta), link });
}

/** The scenes, without the patterns and the knobs of what the patch does not have, nor the scenes left empty. */
function parseScenes(raw: unknown, graph: Graph): Scene[] {
  if (!Array.isArray(raw)) {
    return fail("The scenes need to be a list");
  }
  const scenes = raw.map((scene): Scene => {
    if (!isRecord(scene) || !isRecord(scene.patterns)) {
      return fail(`Invalid scene: ${JSON.stringify(scene)}`);
    }
    const { name, patterns, knobs } = scene;
    if (name !== undefined && (typeof name !== "string" || name.length > NODE_NAME_MAX_LENGTH)) {
      return fail(`Invalid name of a scene: ${JSON.stringify(name)}`);
    }
    if (Object.values(patterns).some((slot) => typeof slot !== "string" || !isPatternSlot(slot))) {
      return fail(`Invalid patterns of a scene: ${JSON.stringify(patterns)}`);
    }
    if (knobs !== undefined && (!isRecord(knobs) || !Object.values(knobs).every(isFiniteNumber))) {
      return fail(`Invalid knobs of a scene: ${JSON.stringify(knobs)}`);
    }
    return {
      ...(name && { name }),
      patterns: patterns as Scene["patterns"],
      ...(knobs !== undefined && Object.keys(knobs).length > 0 && { knobs: knobs as Scene["knobs"] }),
    };
  });
  return pruneScenes(scenes, graph);
}

function parseAutomation(raw: unknown, beats: number): Record<string, string> {
  if (!isRecord(raw)) {
    return fail("The automation of the song needs to be an object");
  }
  return Object.fromEntries(
    Object.entries(raw).map(([key, lane]) => {
      const points = typeof lane === "string" ? parseLane(lane) : undefined;
      if (!CONTROL_KEY.test(key) || !points || points.some((point) => point.beat >= beats)) {
        return fail(`Invalid lane "${key}" in the song: ${JSON.stringify(lane)}`);
      }
      return [key, formatLane(points)];
    }),
  );
}

function parseNode(raw: unknown): PatchNode {
  if (!isRecord(raw) || typeof raw.id !== "string") {
    return fail("Every node needs an id");
  }
  const { id, type } = raw;
  if (typeof type !== "string" || !(type in moduleRegistry)) {
    return fail(`Node "${id}" has an unknown type "${String(type)}"`);
  }
  const name = parseName(id, raw.name);
  const params = parseParams(id, type as NodeType, raw.params);
  const patterns = parsePatterns(id, type as NodeType, params, raw.patterns);
  const patch = type === "subpatch" ? parseInnerGraph(id, raw.patch) : undefined;
  const published = patch && parsePublished(id, raw.published, patch);
  return {
    id,
    type: type as NodeType,
    ...(name && { name }),
    position: parsePosition(id, raw.position),
    params,
    ...(patterns && { patterns }),
    ...(patch && { patch }),
    ...(published && { published }),
  };
}

function parsePublished(id: string, raw: unknown, patch: Graph): PublishedParam[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    return fail(`Subpatch "${id}" has an invalid list of published params`);
  }
  return raw.map((entry): PublishedParam => {
    const inner = isRecord(entry) ? patch.nodes.find((node) => node.id === entry.node) : undefined;
    if (!isRecord(entry) || !inner || typeof entry.param !== "string" || !publishableParam(inner, entry.param)) {
      return fail(`Subpatch "${id}" publishes a param it has not: ${JSON.stringify(entry)}`);
    }
    const name = parseName(`${id}" param "${entry.param}`, entry.name);
    const section = parseName(`${id}" section of "${entry.param}`, entry.section);
    return { node: inner.id, param: entry.param, ...(name && { name }), ...(section && { section }) };
  });
}

/**
 * Every pattern but A1, each from the file or else a copy of pattern A1, for a module that has
 * patterns. The patterns B to D of a file from before the banks are A2 to A4.
 */
function parsePatterns(id: string, type: NodeType, params: Params, raw: unknown): Patterns | undefined {
  const ids = patternIds(type);
  if (ids.length === 0) {
    return undefined;
  }
  if (raw !== undefined && !isRecord(raw)) {
    return fail(`Node "${id}" has invalid patterns`);
  }
  const named = (slot: string) => (isPatternSlot(slot) ? slot : legacySlot(slot));
  const unknown = Object.keys(raw ?? {}).find((slot) => named(slot) === undefined || named(slot) === FIRST_SLOT);
  if (unknown !== undefined) {
    return fail(`Node "${id}" has an unknown pattern "${unknown}"`);
  }
  const values = Object.fromEntries(Object.entries(raw ?? {}).map(([slot, pattern]) => [named(slot), pattern]));
  return Object.fromEntries(
    OTHER_SLOTS.map((slot) => {
      const pattern = values[slot];
      if (pattern !== undefined && !isRecord(pattern)) {
        return fail(`Node "${id}" has an invalid pattern ${slot}`);
      }
      const merged = parseParams(`${id}" pattern "${slot}`, type, { ...params, ...pattern });
      return [slot, patternOf(merged, ids)];
    }),
  );
}

function parseName(id: string, raw: unknown): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "string" || raw.trim().length > NODE_NAME_MAX_LENGTH) {
    return fail(`Node "${id}" has an invalid name`);
  }
  return raw.trim() || undefined;
}

function parsePosition(id: string, raw: unknown): Position {
  if (!isRecord(raw) || !isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) {
    return fail(`Node "${id}" has an invalid position`);
  }
  return { x: raw.x, y: raw.y };
}

function parseParams(id: string, type: NodeType, raw: unknown): Params {
  const values = isRecord(raw) ? raw : {};
  const params = defaultParams(type);
  for (const definition of moduleRegistry[type].params) {
    const value = values[definition.id];
    if (value === undefined) {
      continue;
    }
    const valid =
      definition.kind === "number"
        ? isFiniteNumber(value) && value >= definition.min && value <= definition.max
        : definition.kind === "select"
          ? typeof value === "string" && definition.options.includes(value)
          : definition.kind === "notes"
            ? typeof value === "string" && isNotes(value, definition)
            : definition.kind === "rhythm"
              ? typeof value === "string" && isRhythm(value, definition)
              : definition.kind === "cable"
                ? typeof value === "string" && value.length <= CABLE_ID_MAX_LENGTH
                : definition.kind === "curve"
                  ? typeof value === "string" && isCurve(value, definition)
                  : definition.kind === "clip"
                    ? typeof value === "string" && isClip(value, definition)
                    : definition.kind === "sample"
                      ? typeof value === "string" && parseSampleList(value) !== undefined
                      : typeof value === "string" && isSequence(value, definition);
    if (!valid) {
      fail(`Node "${id}" has an invalid value for "${definition.id}": ${JSON.stringify(value)}`);
    }
    params[definition.id] = value as number | string;
  }
  return params;
}

function isNotes(value: string, definition: NotesParamDefinition): boolean {
  const notes = parseNotes(value);
  return notes !== undefined && notes.every((note) => note >= definition.lowest && note <= definition.highest);
}

function isRhythm(value: string, definition: RhythmParamDefinition): boolean {
  return parseRhythm(value)?.length === definition.steps;
}

function isClip(value: string, definition: ClipParamDefinition): boolean {
  return parseClip(value)?.every(({ note }) => note >= definition.lowest && note <= definition.highest) === true;
}

function isCurve(value: string, definition: CurveParamDefinition): boolean {
  const values = parseCurve(value);
  return (
    values?.length === definition.points &&
    values.every((point) => point >= definition.min && point <= definition.max)
  );
}

function isSequence(value: string, definition: SequenceParamDefinition): boolean {
  const steps = parseSteps(value);
  return (
    steps !== undefined &&
    steps.length === definition.steps &&
    steps.every((step) => step === null || (step >= definition.lowest && step <= definition.highest))
  );
}

function parsePortRef(raw: unknown): PortRef | undefined {
  return isRecord(raw) && typeof raw.nodeId === "string" && typeof raw.port === "string"
    ? { nodeId: raw.nodeId, port: raw.port }
    : undefined;
}

function parseConnection(raw: unknown): PatchConnection {
  const source = isRecord(raw) ? parsePortRef(raw.source) : undefined;
  const target = isRecord(raw) ? parsePortRef(raw.target) : undefined;
  if (!isRecord(raw) || typeof raw.id !== "string" || !source || !target) {
    return fail("Every connection needs an id, a source and a target");
  }
  const { id, amount, pan, mute, solo } = raw;
  for (const [name, value] of Object.entries({ amount, pan })) {
    if (value !== undefined && (!isFiniteNumber(value) || value < -1 || value > 1)) {
      fail(`Connection "${id}" has an invalid ${name}: ${JSON.stringify(value)}`);
    }
  }
  for (const [name, value] of Object.entries({ mute, solo })) {
    if (value !== undefined && typeof value !== "boolean") {
      fail(`Connection "${id}" has an invalid ${name}: ${JSON.stringify(value)}`);
    }
  }
  return {
    id,
    source,
    target,
    ...(amount !== undefined && { amount: amount as number }),
    ...(pan !== undefined && pan !== 0 && { pan: pan as number }),
    ...(mute === true && { mute }),
    ...(solo === true && { solo }),
  };
}
