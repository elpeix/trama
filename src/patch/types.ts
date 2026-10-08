import type { Meter } from "./meter";

export type NodeId = string;

export type NodeType =
  | "oscillator"
  | "vco"
  | "harmonics"
  | "noise"
  | "audioInput"
  | "sampler"
  | "physicalModel"
  | "modal"
  | "piano"
  | "wind"
  | "strings"
  | "filter"
  | "ladder"
  | "customFilter"
  | "pitchShifter"
  | "spectralFreeze"
  | "granulator"
  | "gain"
  | "delay"
  | "distortion"
  | "reverb"
  | "compressor"
  | "chorus"
  | "flanger"
  | "phaser"
  | "lfo"
  | "envelope"
  | "sampleHold"
  | "quantizer"
  | "math"
  | "slew"
  | "envelopeFollower"
  | "clock"
  | "keyboard"
  | "arpeggiator"
  | "sequencer"
  | "clip"
  | "drums"
  | "mixer"
  | "pan"
  | "output"
  | "scope"
  | "subpatch"
  | "inlet"
  | "outlet";

export type PortType = "audio" | "control" | "trigger" | "notes";

export type ParamValue = number | string;

export type Params = Record<string, ParamValue>;

export type PatternBank = "A" | "B" | "C" | "D";

/** A pattern of a node: a bank, A to D, and its number in the bank, 1 to 8. */
export type PatternSlot = `${PatternBank}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

/** The patterns a node keeps besides pattern A1, which is in its params: only the params that make a pattern. */
export type Patterns = Partial<Record<Exclude<PatternSlot, "A1">, Params>>;

export const NODE_NAME_MAX_LENGTH = 40;

export interface Position {
  x: number;
  y: number;
}

/** A param of a node inside a subpatch, shown on the subpatch to be set from outside. */
export interface PublishedParam {
  node: NodeId;
  param: string;
  /** What the subpatch calls it; the name of the node and of the param while unset. */
  name?: string;
  /** The title it goes under on the subpatch, with the others next to it under the same one. */
  section?: string;
}

export interface PatchNode {
  id: NodeId;
  type: NodeType;
  name?: string;
  position: Position;
  params: Params;
  patterns?: Patterns;
  /** The graph inside a subpatch. */
  patch?: Graph;
  /** The params of the nodes inside a subpatch that it shows. */
  published?: PublishedParam[];
}

export interface Graph {
  nodes: PatchNode[];
  connections: PatchConnection[];
}

export interface PortRef {
  nodeId: NodeId;
  port: string;
}

export interface PatchConnection {
  id: string;
  source: PortRef;
  target: PortRef;
  /** How much of the signal gets through: the attenuator of a control cable, the level of a mixer channel. */
  amount?: number;
  /** Where a mixer channel sits, from -1 (left) to 1 (right); kept only when off the centre. */
  pan?: number;
  /** Switches of a mixer channel, kept only while on. */
  mute?: boolean;
  solo?: boolean;
}

export const DEFAULT_TEMPO = 120;
export const MIN_TEMPO = 30;
export const MAX_TEMPO = 300;

export const DEFAULT_SWING = 50;
export const MIN_SWING = 50;
export const MAX_SWING = 75;

export type SwingGrid = "1/16" | "1/8";
export const SWING_GRIDS: readonly SwingGrid[] = ["1/16", "1/8"];
export const DEFAULT_SWING_GRID: SwingGrid = "1/16";

export interface SongLoop {
  start: number;
  length: number;
}

/**
 * The patterns of each node bar by bar. A row per node with patterns, by its path through the
 * subpatches (`sub-2/seq-1`): a letter or a dash for each bar, a dash going on with what plays.
 */
export interface Song {
  bars: number;
  rows: Record<string, string>;
  loop?: SongLoop;
  /** The controls moved along the song: points of a beat from its start and a value, by control. */
  automation?: Record<string, string>;
  /** The last bars, over which the sound fades out to nothing when the song ends. */
  fade?: number;
}

/**
 * A knob pinned to the perform panel: a number param of a node, by the control of the song it is,
 * or a whole mixer, by its path.
 */
export interface PinnedKnob {
  key: string;
  /** What the panel calls it; the path of the node, and the label of the param of a knob, while unset. */
  name?: string;
}

/**
 * Patterns to launch together from the perform panel, a pattern for each node by its path, and
 * the values of the knobs pinned when it was kept, which the crossfader moves between.
 */
export interface Scene {
  name?: string;
  patterns: Record<string, PatternSlot>;
  knobs?: Record<string, number>;
}

/** What a piece is called, who made it, what it is about and where to find more. */
export interface PatchMeta {
  title?: string;
  author?: string;
  description?: string;
  /** A web page, http or https only. */
  link?: string;
}

export interface Patch {
  nodes: PatchNode[];
  connections: PatchConnection[];
  /** Beats per minute shared by everything that follows a beat: arpeggiators and sequencers. */
  tempo: number;
  /**
   * How far the sixteenths between the eighths are held back, as the percentage of a pair of them
   * the first one lasts: 50 is straight, about 67 a triplet feel. Left out while straight.
   */
  swing?: number;
  /** The steps the swing holds back: the sixteenths between the eighths, or the eighths between the beats. Left out on sixteenths. */
  swingGrid?: SwingGrid;
  /** The groups of quarter beats of a bar, [3, 2] for 3+2/4, or of eighths, { eighths: [3, 3] } for 6/8. Left out in 4/4. */
  meter?: Meter;
  song?: Song;
  /** The knobs pinned to the perform panel, in the order it shows them. */
  perform?: PinnedKnob[];
  /** The paths of the nodes with patterns left out of the launcher of the perform panel. */
  hiddenLaunchers?: string[];
  scenes?: Scene[];
  meta?: PatchMeta;
}
