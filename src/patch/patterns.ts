import { withParam } from "./params";
import { moduleRegistry } from "./registry";
import type { NodeType, Params, ParamValue, PatchNode, PatternBank, Patterns, PatternSlot } from "./types";

export const PATTERN_BANKS: readonly PatternBank[] = ["A", "B", "C", "D"];
export const PATTERNS_PER_BANK = 8;

export function slotOf(bank: PatternBank, number: number): PatternSlot {
  return `${bank}${number}` as PatternSlot;
}

export function bankOf(slot: PatternSlot): PatternBank {
  return slot[0] as PatternBank;
}

export function numberOf(slot: PatternSlot): number {
  return Number(slot.slice(1));
}

export const PATTERN_SLOTS: readonly PatternSlot[] = PATTERN_BANKS.flatMap((bank) =>
  Array.from({ length: PATTERNS_PER_BANK }, (_, index) => slotOf(bank, index + 1)),
);
export const FIRST_SLOT: PatternSlot = "A1";
export const OTHER_SLOTS = PATTERN_SLOTS.slice(1) as readonly Exclude<PatternSlot, "A1">[];

/** What a node is launched to silence it, until a pattern is launched again. */
export const STOP = ".";
export type Launch = PatternSlot | typeof STOP;

export function isPatternSlot(name: string): name is PatternSlot {
  return (PATTERN_SLOTS as readonly string[]).includes(name);
}

/** The pattern that a pattern of a file from before the banks is now: A to D became A1 to A4. */
export function legacySlot(name: string): PatternSlot | undefined {
  const index = PATTERN_BANKS.indexOf(name as PatternBank);
  return index === -1 ? undefined : slotOf("A", index + 1);
}

export function patternIds(type: NodeType): readonly string[] {
  return moduleRegistry[type].patterns ?? [];
}

export function patternOf(params: Params, ids: readonly string[]): Params {
  return Object.fromEntries(ids.map((id) => [id, params[id]]));
}

/** Every pattern but A1 as a copy of what the node plays, for a module that has patterns. */
export function initialPatterns(type: NodeType, params: Params): Patterns | undefined {
  const ids = patternIds(type);
  if (ids.length === 0) {
    return undefined;
  }
  return Object.fromEntries(OTHER_SLOTS.map((slot) => [slot, patternOf(params, ids)]));
}

/** A pattern a node keeps besides A1; undefined for A1, which is in its params. */
export function patternAt(patterns: Patterns | undefined, slot: PatternSlot): Params | undefined {
  return slot === FIRST_SLOT ? undefined : patterns?.[slot as Exclude<PatternSlot, "A1">];
}

/** The params of a node as they are while `slot` plays or is edited. */
export function paramsInPattern(node: PatchNode, slot: PatternSlot): Params {
  const pattern = patternAt(node.patterns, slot);
  return pattern ? { ...node.params, ...pattern } : node.params;
}

/** The node after setting a param of one of its patterns, or of the node itself if it is not in them. */
export function withPatternParam(node: PatchNode, slot: PatternSlot, name: string, value: ParamValue): PatchNode {
  const ids = patternIds(node.type);
  if (!ids.includes(name) || !patternAt(node.patterns, slot)) {
    return { ...node, params: withParam(node, name, value) };
  }
  const params = withParam({ ...node, params: paramsInPattern(node, slot) }, name, value);
  return { ...node, patterns: { ...node.patterns, [slot]: patternOf(params, ids) } };
}
