import { defaultParams, moduleRegistry } from "./registry";
import { sampleIds } from "./samples";
import { allNodes } from "./subpatch";
import type { NodeType, PatchNode } from "./types";

/**
 * What a preset keeps of a node: its type and its settings, the patterns B to D of one that has
 * them, and the inside of a subpatch with the params it publishes. Not its id, its name nor where
 * it is.
 */
export type PresetNode = Pick<PatchNode, "type" | "params" | "patterns" | "patch" | "published">;

export interface Preset {
  id: string;
  name: string;
  node: PresetNode;
}

/** The In and the Out belong to the subpatch they are in: they have no presets. */
export const hasPresets = (type: NodeType) => type !== "inlet" && type !== "outlet";

/**
 * The settings of a node to keep as a preset. The cable a scope holds still on belongs to the
 * patch it is in, so it goes back to its default.
 */
export function presetOf({ type, params, patterns, patch, published }: PatchNode): PresetNode {
  const cables = moduleRegistry[type].params.filter((param) => param.kind === "cable");
  return {
    type,
    params: { ...params, ...Object.fromEntries(cables.map((param) => [param.id, param.default])) },
    ...(patterns && { patterns }),
    ...(patch && { patch }),
    ...(published && { published }),
  };
}

/**
 * A node with the settings of a preset of its type, keeping its id, its name and its place: the
 * params the preset lacks go back to their defaults, and a subpatch takes the inside of the preset.
 */
export function withPreset(node: PatchNode, preset: PresetNode): PatchNode {
  const { patterns: _patterns, patch: _patch, published: _published, ...rest } = node;
  return {
    ...rest,
    params: { ...defaultParams(node.type), ...preset.params },
    ...(preset.patterns && { patterns: preset.patterns }),
    ...(node.type === "subpatch" && { patch: preset.patch ?? { nodes: [], connections: [] } }),
    ...(preset.published && { published: preset.published }),
  };
}

/** The ids inside a preset, which the ids given to new nodes must go past. */
export const innerNodes = (preset: PresetNode): PatchNode[] => (preset.patch ? allNodes(preset.patch) : []);

/** The samples the samplers of some presets play, those inside subpatches too, each once. */
export const presetSampleIds = (presets: readonly PresetNode[]): string[] =>
  sampleIds({
    nodes: presets.map((node, index) => ({ ...node, id: `preset-${index}`, position: { x: 0, y: 0 } })),
    connections: [],
  });
