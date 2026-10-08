import { moduleRegistry, type NumberParamDefinition, type ParamDefinition } from "./registry";
import { OCTAVE_CENTS } from "./pitch";
import { ROOTS } from "./scales";
import { formatSequence, parseSequence, transposeSequence } from "./sequence";
import { syncedRate, syncedSeconds } from "./tempo";
import type { NodeId, Params, ParamValue, PatchConnection, PatchNode } from "./types";

const PITCH_PORT = "pitch";

/**
 * The params of a node after setting one of them, including any other param that follows from it:
 * changing the root of a sequencer transposes its steps into the new key.
 */
export function withParam(node: PatchNode, name: string, value: ParamValue): Params {
  const params = { ...node.params, [name]: value };
  const sequence = moduleRegistry[node.type].params.find((param) => param.kind === "sequence");
  if (name !== "root" || !sequence || sequence.kind !== "sequence") {
    return params;
  }
  const steps = parseSequence(String(node.params[sequence.id]));
  const from = ROOTS.indexOf(String(node.params.root));
  const to = ROOTS.indexOf(String(value));
  if (!steps || from === -1 || to === -1) {
    return params;
  }
  const transposed = transposeSequence(steps, to - from, sequence.lowest, sequence.highest);
  return { ...params, [sequence.id]: formatSequence(transposed) };
}

/**
 * When a number param is set by another one instead of its slider, the value it takes and how to
 * show it: an oscillator in keyboard mode, or an LFO synced to the tempo.
 */
export function paramLock(
  definition: ParamDefinition,
  params: Params,
  tempo: number,
  beatsPerBar: number,
): { value: number; label: string } | undefined {
  if (definition.kind !== "number") {
    return undefined;
  }
  const { lockedWhen, sync } = definition;
  if (lockedWhen && params[lockedWhen.param] === lockedWhen.value) {
    return { value: lockedWhen.to, label: lockedWhen.label };
  }
  if (!sync) {
    return undefined;
  }
  const division = String(params[sync.param]);
  const value = sync.as === "rate" ? syncedRate(division, tempo, beatsPerBar) : syncedSeconds(division, tempo, beatsPerBar);
  if (value === undefined) {
    return undefined;
  }
  const digits = sync.as === "rate" ? 2 : 3;
  return { value, label: `${value.toFixed(digits)} ${definition.unit ?? ""}`.trim() };
}

/**
 * The value a param reaches with what its control cables add to it: added in its own units, or
 * multiplied for a frequency modulated in cents.
 */
export function modulatedValue(definition: NumberParamDefinition, value: number, modulation: number): number {
  return definition.modulationInCents ? value * 2 ** (modulation / OCTAVE_CENTS) : value + modulation;
}

/**
 * The params of a node that more than one note source reaches. Control cables add up, so the two
 * pitches are heard as a single transposed one: a Keyboard and a Seq on the same oscillator do
 * not play two parts, each part needs its own chain.
 */
export function addedPitches(nodeId: NodeId, connections: PatchConnection[]): string[] {
  const sources = new Map<string, number>();
  for (const { source, target } of connections) {
    if (source.port === PITCH_PORT && target.nodeId === nodeId) {
      sources.set(target.port, (sources.get(target.port) ?? 0) + 1);
    }
  }
  return [...sources].filter(([, count]) => count > 1).map(([port]) => port);
}
