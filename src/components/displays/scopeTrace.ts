import { moduleRegistry } from "../../patch/registry";
import { portsOfNode } from "../../patch/subpatch";
import type { PatchConnection, PatchNode } from "../../patch/types";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const HYSTERESIS = 0.15;
const MINIMUM_LOOKBACK_SECONDS = 0.05;

/**
 * How far back the trigger may look for a crossing: a whole window, so that anything slow enough
 * to be seen on screen still holds still, and never less than a few tens of milliseconds, so that
 * a short window of a low note holds still too. Whatever is left of the history beyond the window
 * is the limit; when nothing is left, the trace simply ends at the newest sample.
 */
export function triggerLookback(length: number, capacity: number, sampleRate: number): number {
  const wanted = Math.max(length, Math.round(MINIMUM_LOOKBACK_SECONDS * sampleRate));
  return Math.max(0, Math.min(wanted, capacity - length));
}

/**
 * Where to start drawing the latest `length` samples so that a periodic signal stays still:
 * the most recent rising crossing of its middle, looking back at most `lookback` samples.
 *
 * The middle is halfway between the peaks of what was looked at, not zero, so a signal that
 * never goes negative — an envelope, a control with an offset — holds still as well. A crossing
 * only counts after the signal has dipped a fraction of the way down to its lowest peak, so
 * small wiggles around the middle (noise, harmonics) do not make the trace jump. Without a
 * crossing, the window simply ends at the newest sample.
 */
export function triggerStart(samples: Float32Array, length: number, lookback: number): number {
  const latest = samples.length - length;
  if (latest <= 0) {
    return 0;
  }
  const earliest = Math.max(1, latest - lookback);
  let lowest = Infinity;
  let highest = -Infinity;
  for (let index = earliest - 1; index <= latest; index++) {
    lowest = Math.min(lowest, samples[index]);
    highest = Math.max(highest, samples[index]);
  }
  const middle = (lowest + highest) / 2;
  const dip = middle - (middle - lowest) * HYSTERESIS;

  let armed = false;
  let found = -1;
  for (let index = earliest; index <= latest; index++) {
    if (samples[index - 1] <= dip) {
      armed = true;
    }
    if (armed && samples[index - 1] < middle && samples[index] >= middle) {
      found = index;
      armed = false;
    }
  }
  return found >= 0 ? found : latest;
}

/** The last seconds of a signal, fed with the new samples of each frame. */
export class SampleHistory {
  private readonly data: Float32Array;
  private written = 0;

  constructor(capacity: number) {
    this.data = new Float32Array(capacity);
  }

  get capacity() {
    return this.data.length;
  }

  push(samples: Float32Array) {
    const tail = samples.subarray(Math.max(0, samples.length - this.capacity));
    const offset = this.written % this.capacity;
    const first = Math.min(tail.length, this.capacity - offset);
    this.data.set(tail.subarray(0, first), offset);
    this.data.set(tail.subarray(first), 0);
    this.written += tail.length;
  }

  /** Fills `target` with the newest samples, oldest first; zeros where nothing was written yet. */
  latest(target: Float32Array) {
    const available = Math.min(target.length, this.capacity, this.written);
    const head = target.length - available;
    target.fill(0, 0, head);
    const offset = (this.written - available) % this.capacity;
    const first = Math.min(available, this.capacity - offset);
    target.set(this.data.subarray(offset, offset + first), head);
    target.set(this.data.subarray(0, available - first), head + first);
  }
}

export interface TracePoint {
  x: number;
  y: number;
}

/**
 * Turns samples into the points of a line `width` × `height` pixels, with ±`range` at the edges.
 * When there are more samples than pixels, each column keeps its minimum and maximum so peaks
 * do not disappear.
 */
export function tracePoints(samples: Float32Array, width: number, height: number, range: number): TracePoint[] {
  const toY = (value: number) => clamp(height / 2 - (value / range) * (height / 2), 0, height);
  if (samples.length < 2) {
    return [];
  }
  if (samples.length <= width) {
    const step = width / (samples.length - 1);
    return Array.from(samples, (value, index) => ({ x: index * step, y: toY(value) }));
  }
  const points: TracePoint[] = [];
  const perColumn = samples.length / width;
  for (let x = 0; x < width; x++) {
    let min = Infinity;
    let max = -Infinity;
    const end = Math.min(samples.length, Math.ceil((x + 1) * perColumn));
    for (let index = Math.floor(x * perColumn); index < end; index++) {
      min = Math.min(min, samples[index]);
      max = Math.max(max, samples[index]);
    }
    points.push({ x, y: toY(max) }, { x, y: toY(min) });
  }
  return points;
}

export interface ScopeTrace {
  /** The connection that brings the signal. */
  id: string;
  label: string;
  /** The CSS variable of its colour: a family for the kind of signal, a shade to tell two apart. */
  color: string;
}

const SHADES = 3;

/**
 * The traces of a scope: one per incoming connection, in patch order, named after their source and
 * coloured after the port they arrive at, so audio and control are told apart at a glance.
 */
export function scopeTraces(scopeId: string, nodes: PatchNode[], connections: PatchConnection[]): ScopeTrace[] {
  const scope = nodes.find((node) => node.id === scopeId);
  const shades = new Map<string, number>();
  return connections
    .filter((connection) => connection.target.nodeId === scopeId)
    .map((connection) => {
      const source = nodes.find((node) => node.id === connection.source.nodeId);
      const port = scope && portsOfNode(scope).inputs.find(({ id }) => id === connection.target.port);
      const family = port?.type === "control" ? "control" : "audio";
      const shade = shades.get(family) ?? 0;
      shades.set(family, shade + 1);
      return {
        id: connection.id,
        label: source ? traceLabel(source, connection.source.port) : connection.id,
        color: `--trace-${family}-${(shade % SHADES) + 1}`,
      };
    });
}

export function traceLabel(node: PatchNode, port: string): string {
  const number = node.id.match(/-(\d+)$/)?.[1];
  const base = node.name ?? [moduleRegistry[node.type].title, number].filter(Boolean).join(" ");
  const outputs = portsOfNode(node).outputs;
  if (outputs.length <= 1) {
    return base;
  }
  return `${base} · ${outputs.find(({ id }) => id === port)?.label ?? port}`;
}

/** Below this, the two sides of a signal are drawn as one: a difference too small to see. */
const SIDE_TOLERANCE = 0.001;

/** The audio is worked out in blocks of this many samples; the two sides can be read a few blocks apart. */
const RENDER_BLOCK = 128;
const BLOCKS_APART = 3;

/** Whether the right side matches the left one `shift` samples later, over all they share. */
const sameShifted = (left: Float32Array, right: Float32Array, shift: number) => {
  const from = Math.max(0, -shift);
  const to = Math.min(left.length, right.length - shift);
  if (to <= from) {
    return false;
  }
  for (let index = from; index < to; index++) {
    if (Math.abs(left[index] - right[index + shift]) > SIDE_TOLERANCE) {
      return false;
    }
  }
  return true;
};

/**
 * Whether the right side of a signal is worth drawing apart from the left: a stereo signal. Its two
 * analysers are read one after the other, so the same sound can show a few blocks of the audio
 * apart on each: that is still one sound, but a pan or a delay shorter than a block is not.
 */
export function sidesDiffer(left: Float32Array, right: Float32Array): boolean {
  for (let blocks = -BLOCKS_APART; blocks <= BLOCKS_APART; blocks++) {
    if (sameShifted(left, right, blocks * RENDER_BLOCK)) {
      return false;
    }
  }
  return true;
}

