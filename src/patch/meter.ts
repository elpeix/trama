import type { AutomationPoint } from "./automation";
import { CLIP_MAX_BEATS } from "./clip";
import { laneOf, withLane } from "./song";
import type { Graph, Params, Patch, PatchNode, Song } from "./types";

export type Meter = readonly number[] | { readonly eighths: readonly number[] };
export type BeatAccent = "bar" | "group" | "beat";
export interface TimeSignature {
  numerator: number;
  denominator: number;
  clocks: number;
}

export const DEFAULT_METER: Meter = [4];
export const METERS: Meter[] = [
  [2],
  [3],
  [4],
  [3, 2],
  [2, 3],
  [6],
  [4, 3],
  [3, 4],
  [2, 2, 3],
  { eighths: [3, 3] },
  { eighths: [3, 3, 3, 3] },
];

const MAX_BEATS_PER_BAR = 16;
const MAX_CLIP_BARS = 16;
const LAST_EIGHTH = 1 / 2;
const EIGHTHS_PER_PULSE = 3;
const QUARTER_CLOCKS = 24;
const EPSILON = 1e-6;

const isEighths = (meter: Meter): meter is { readonly eighths: readonly number[] } => !Array.isArray(meter);
const groupsOf = (meter: Meter): readonly number[] => (isEighths(meter) ? meter.eighths : meter);
const sum = (groups: readonly number[]) => groups.reduce((total, group) => total + group, 0);

export function beatsPerBar(meter: Meter = DEFAULT_METER): number {
  return isEighths(meter) ? sum(meter.eighths) / 2 : sum(meter);
}

/** The beats between two pulses of the meter: a quarter, or a dotted quarter in eighths. */
export function pulseBeats(meter: Meter = DEFAULT_METER): number {
  return isEighths(meter) ? EIGHTHS_PER_PULSE / 2 : 1;
}

export function beatAccent(beat: number, meter: Meter): BeatAccent {
  const inBar = Math.floor((beat % beatsPerBar(meter)) / pulseBeats(meter) + EPSILON);
  if (inBar === 0) {
    return "bar";
  }
  if (isEighths(meter)) {
    return "beat";
  }
  let start = 0;
  for (const group of meter) {
    start += group;
    if (start === inBar) {
      return "group";
    }
  }
  return "beat";
}

export function groupStarts(meter: Meter): number[] {
  if (isEighths(meter)) {
    return [];
  }
  return meter.slice(0, -1).map((_, index) => sum(meter.slice(0, index + 1)));
}

export function stepAccents(count: number, stepBeats: number, meter: Meter): (BeatAccent | undefined)[] {
  const pulse = pulseBeats(meter);
  return Array.from({ length: count }, (_, step) => {
    const pulses = (step * stepBeats) / pulse;
    return Math.abs(pulses - Math.round(pulses)) < EPSILON ? beatAccent(Math.round(pulses) * pulse, meter) : undefined;
  });
}

const isGroups = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length > 0 && value.every((group) => Number.isInteger(group) && group > 0);

export function isMeter(value: unknown): value is Meter {
  if (isGroups(value)) {
    return beatsPerBar(value) <= MAX_BEATS_PER_BAR;
  }
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 1 || !("eighths" in value)) {
    return false;
  }
  const { eighths } = value;
  return (
    isGroups(eighths) &&
    eighths.every((group) => group === EIGHTHS_PER_PULSE) &&
    sum(eighths) % 2 === 0 &&
    sum(eighths) / 2 <= MAX_BEATS_PER_BAR
  );
}

export function meterLabel(meter: Meter): string {
  return isEighths(meter) ? `${sum(meter.eighths)}/8` : `${meter.join("+")}/4`;
}

/** The time signature of a MIDI file: its MIDI clocks go 24 to the quarter, one click a pulse. */
export function timeSignature(meter: Meter): TimeSignature {
  return isEighths(meter)
    ? { numerator: sum(meter.eighths), denominator: 8, clocks: QUARTER_CLOCKS * pulseBeats(meter) }
    : { numerator: sum(meter), denominator: 4, clocks: QUARTER_CLOCKS };
}

export function sameMeter(a: Meter = DEFAULT_METER, b: Meter = DEFAULT_METER): boolean {
  const groups = groupsOf(a);
  const others = groupsOf(b);
  return (
    isEighths(a) === isEighths(b) &&
    groups.length === others.length &&
    groups.every((group, index) => group === others[index])
  );
}

const copyOf = (meter: Meter): Meter => (isEighths(meter) ? { eighths: [...meter.eighths] } : [...meter]);

export function maxClipBars(beats: number): number {
  return Math.min(MAX_CLIP_BARS, Math.floor(CLIP_MAX_BEATS / beats));
}

export function clipBarsFor(bars: number, from: number, to: number): number {
  return Math.min(maxClipBars(to), Math.max(1, Math.ceil((bars * from) / to - EPSILON)));
}

export function convertLane(points: readonly AutomationPoint[], from: number, to: number): AutomationPoint[] {
  return points.reduce<AutomationPoint[]>((converted, point) => {
    const bar = Math.floor(point.beat / from + EPSILON);
    const offset = point.beat - bar * from;
    const fits = offset < to - EPSILON;
    const last = converted.at(-1)?.beat ?? 0;
    const beat = fits ? bar * to + offset : Math.max(bar * to + to - LAST_EIGHTH, last);
    const kept = Math.abs(beat - last) < EPSILON && converted.length > 0 ? converted.slice(0, -1) : converted;
    return [...kept, { ...point, beat }];
  }, []);
}

const convertSong = (song: Song, from: number, to: number): Song =>
  Object.keys(song.automation ?? {}).reduce(
    (current, key) => withLane(current, key, convertLane(laneOf(song, key), from, to)),
    song,
  );

const withClipBars = (params: Params, from: number, to: number): Params =>
  params.bars === undefined ? params : { ...params, bars: clipBarsFor(Number(params.bars), from, to) };

function convertNode(node: PatchNode, from: number, to: number): PatchNode {
  if (node.patch) {
    return { ...node, patch: convertGraph(node.patch, from, to) };
  }
  if (node.type !== "clip") {
    return node;
  }
  const patterns =
    node.patterns &&
    Object.fromEntries(Object.entries(node.patterns).map(([slot, params]) => [slot, withClipBars(params!, from, to)]));
  return { ...node, params: withClipBars(node.params, from, to), ...(patterns && { patterns }) };
}

function convertGraph<T extends Graph>(graph: T, from: number, to: number): T {
  return { ...graph, nodes: graph.nodes.map((node) => convertNode(node, from, to)) };
}

/** The patch in another meter: its clips hold all they lasted, and the points of its song stay on their bars. */
export function withMeter(patch: Patch, meter: Meter): Patch {
  if (sameMeter(patch.meter, meter)) {
    return patch;
  }
  const from = beatsPerBar(patch.meter);
  const to = beatsPerBar(meter);
  const { meter: _previous, ...rest } = convertGraph(patch, from, to);
  const converted = { ...rest, ...(rest.song && { song: convertSong(rest.song, from, to) }) };
  return sameMeter(meter, DEFAULT_METER) ? converted : { ...converted, meter: copyOf(meter) };
}
