import { createStore } from "zustand/vanilla";
import type { AudioEngine } from "../audio/AudioEngine";
import { copyGraph, pasteGraph } from "../patch/clipboard";
import { groupGraph } from "../patch/group";
import { beatsPerBar, DEFAULT_METER, isMeter, sameMeter, withMeter, type Meter } from "../patch/meter";
import { FIRST_SLOT, initialPatterns, withPatternParam } from "../patch/patterns";
import {
  allNodes,
  flattenPatch,
  portsOfNode,
  graphAt,
  newSectionName,
  nodeAt,
  publishableParam,
  publishedKey,
  prunePublished,
  pruneConnections,
  validPath,
  withGraphAt,
  withPublishedMoved,
  withSectionAt,
} from "../patch/subpatch";
import { defaultParams, moduleRegistry } from "../patch/registry";
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
  type NodeId,
  type Graph,
  type NodeType,
  type Patch,
  type PatchConnection,
  type PatchNode,
  type ParamValue,
  type PatternSlot,
  type PatchMeta,
  type PinnedKnob,
  type PortRef,
  type Scene,
  type Position,
  type PublishedParam,
  type Song,
  type SongLoop,
  type SwingGrid,
} from "../patch/types";
import { validateConnection } from "../patch/validation";
import {
  emptySong,
  initialSong,
  laneOf,
  patternPaths,
  pruneAutomation,
  pruneSong,
  withCell,
  withFade,
  withLane,
  withLength,
  withLoop,
  type SongCell,
} from "../patch/song";
import {
  controlTargets,
  isChannelKey,
  parseControlKey,
  withConstant,
  withoutPointsIn,
  withPoint,
  withTake,
  type AutomationPoint,
  type ChannelControl,
  type ControlKey,
} from "../patch/automation";
import {
  pinnableKnob,
  pinnableMixer,
  pruneHidden,
  prunePinned,
  pruneScenes,
  sceneKnobs,
  withHiddenToggled,
  withChannelValue,
  withKnobValue,
  withPinMoved,
  withPinName,
  withPinToggled,
  withScene,
  withSceneName,
  withoutScene,
} from "../patch/perform";
import { withMeta } from "../patch/meta";
import { innerNodes, withPreset, type Preset, type PresetNode } from "../patch/presets";

/** What the store plays the patch on: it syncs every change, and starts afresh for a patch loaded, when it can. */
export type PatchEngine = Pick<AudioEngine, "sync"> & Partial<Pick<AudioEngine, "reset">>;

/** The scenes on the two sides of the crossfader, by their place among the scenes, and where it is, from A (0) to B (1). */
export interface Crossfader {
  a?: number;
  b?: number;
  position: number;
}

const CENTRED: Crossfader = { position: 0.5 };

/** The crossfader with the scene at `index` gone: off the side it was on, and the scenes after it one place earlier. */
function withoutSceneAt(crossfader: Crossfader, index: number): Crossfader {
  const moved = (side: number | undefined) => (side === undefined || side === index ? undefined : side > index ? side - 1 : side);
  const a = moved(crossfader.a);
  const b = moved(crossfader.b);
  return { ...(a !== undefined && { a }), ...(b !== undefined && { b }), position: crossfader.position };
}

export type PanelTab = "song" | "perform";

/** Where the editor looks: how far it is moved and how much it is zoomed. */
export interface EditorViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface NodeView {
  selected?: boolean;
  dragging?: boolean;
  measured?: { width: number; height: number };
}

export interface PatchState {
  /** The graph on show: the whole patch, or the inside of the subpatch at `path`. */
  nodes: PatchNode[];
  connections: PatchConnection[];
  /** The subpatches opened, from the top; empty to show the whole patch. */
  path: NodeId[];
  tempo: number;
  /** The swing of the patch, 50 while straight. */
  swing: number;
  /** The steps the swing holds back, the sixteenths unless the patch swings the eighths. */
  swingGrid: SwingGrid;
  /** The groups of beats of a bar of the patch, [4] in 4/4. */
  meter: Meter;
  /** The params published on the subpatch on show; none on the whole patch. */
  published: PublishedParam[];
  nodeViews: Record<NodeId, NodeView>;
  selectedConnectionIds: string[];
  /** The path to the clip open on the piano roll, from the top, if any; not part of the patch nor of its history. */
  clipEditor?: NodeId[];
  /** The pattern of that clip the piano roll edits. */
  clipPattern: PatternSlot;
  /** The song of the patch, if it has one. */
  song?: Song;
  /** Whether the song panel is open; this and the rest of the song state are not part of the patch. */
  songPanel: boolean;
  /** The tab the panel shows: the song, or the knobs pinned to perform. */
  panelTab: PanelTab;
  /** Whether the panel takes the place of the editor, which is not drawn meanwhile. */
  panelFullscreen: boolean;
  /** Where the editor looks, kept while it is not drawn; not part of the patch. */
  editorViewport: EditorViewport;
  /** The knobs pinned to perform, part of the patch. */
  perform: PinnedKnob[];
  /** The paths of the nodes left out of the launcher, part of the patch. */
  hiddenLaunchers: string[];
  /** The scenes of the launcher, part of the patch. */
  scenes: Scene[];
  /** The title, author, description and link of the piece, part of the patch. */
  meta?: PatchMeta;
  /** Song mode plays the song from the cursor; pattern mode leaves each node on what it is launched. */
  songMode: boolean;
  /** Whether launching a pattern writes it into the song. */
  songRec: boolean;
  /** The bar the song plays from, and where Rec writes while it is stopped. */
  songCursor: number;
  /** The last value of each control touched with Rec on, to copy over the loop or the song. */
  songTouched: Record<ControlKey, number>;
  /** The scenes on each side of the crossfader, by their place, and where it is; out of the patch. */
  crossfader: Crossfader;
  past: Patch[];
  future: Patch[];

  addNode(type: NodeType, position: Position): PatchNode;
  moveNode(id: NodeId, position: Position): void;
  /** Moves several nodes of the graph on show at once, as one undo step. */
  moveNodes(positions: Record<NodeId, Position>): void;
  renameNode(id: NodeId, name: string): void;
  removeNode(id: NodeId): void;
  remove(elements: { nodes?: NodeId[]; connections?: string[] }): void;
  /**
   * Quick changes of the same param become one undo step, unless `merge` is false. A name in
   * `merge` groups the changes of a single gesture instead, such as a drag across a grid: they
   * join each other, and never the change before the gesture began. With `pattern`, a param that
   * makes a pattern changes in that pattern only.
   */
  updateParam(
    id: NodeId,
    name: string,
    value: ParamValue,
    options?: { merge?: boolean | string; pattern?: PatternSlot },
  ): void;
  /** Changes several params of a node at once, as one undo step; with `pattern`, as updateParam does. */
  updateParams(id: NodeId, values: Record<string, ParamValue>, options?: { pattern?: PatternSlot }): void;
  /** As updateParam, for the node at the end of `path`, from the top, wherever it is. */
  updateParamAt(
    path: readonly NodeId[],
    name: string,
    value: ParamValue,
    options?: { merge?: boolean | string; pattern?: PatternSlot },
  ): void;
  /** As updateParams, for the node at the end of `path`, from the top, wherever it is. */
  updateParamsAt(path: readonly NodeId[], values: Record<string, ParamValue>, options?: { pattern?: PatternSlot }): void;
  setTempo(tempo: number): void;
  setSwing(swing: number): void;
  setSwingGrid(grid: SwingGrid): void;
  /** Changes the meter, bringing the clips and the lanes of the song along with it. */
  setMeter(meter: Meter): void;
  canConnect(source: PortRef, target: PortRef): boolean;
  connect(source: PortRef, target: PortRef): PatchConnection | null;
  disconnect(id: string): void;
  /** Whether a cable could move to join these ports instead, as if it were not there. */
  canReconnect(id: string, source: PortRef, target: PortRef): boolean;
  /**
   * Moves a cable to join these ports, in its place among the cables, as one undo step. It keeps
   * what it carries for the place it ends at while that stays, and the attenuator of a control
   * cable wherever it goes; a scope holding still on it follows it. Null when it cannot move there.
   */
  reconnect(id: string, source: PortRef, target: PortRef): PatchConnection | null;
  /** Quick changes of the same amount become one undo step, unless `merge` is false. */
  setConnectionAmount(id: string, amount: number, options?: { merge?: boolean }): void;
  /** Quick changes of the same pan become one undo step, unless `merge` is false; the centre leaves none. */
  setConnectionPan(id: string, pan: number, options?: { merge?: boolean }): void;
  /** Turns the mute or the solo of a mixer channel on or off, as one undo step. */
  setConnectionSwitch(id: string, name: "mute" | "solo", on: boolean): void;
  /** Writes a pattern, or a dash, on a bar of the node at `path`, starting a song if there is none. */
  setSongCell(path: string, bar: number, cell: SongCell): void;
  setSongLength(bars: number): void;
  /** Fades the sound out over the last bars of the song; 0 for none. */
  setSongFade(bars: number): void;
  /** Changes fields of the meta of the piece; typing into one joins into a single undo step. */
  setMeta(changes: Partial<PatchMeta>): void;
  setSongLoop(loop: SongLoop | undefined): void;
  /** Starts the song again, as long as it was, with each node on the pattern given from the first bar. */
  initializeSong(playing: Record<string, PatternSlot>): void;
  /** Writes what a control did from `start` up to `end`, in beats of the song, as one undo step. */
  recordTake(key: ControlKey, points: AutomationPoint[], start: number, end: number): void;
  /** Sets a control on a beat of the song; the changes of a control on the same beat join into one undo step. */
  setControlPoint(key: ControlKey, beat: number, value: number): void;
  /** Takes out the points of a control from a beat up to another one, that one left out, as one undo step. */
  clearControlPoints(key: ControlKey, from: number, to: number): void;
  /** Holds each control on its value over the loop, or over the whole song, as one undo step. */
  copyControls(values: Record<ControlKey, number>, over: "loop" | "song"): void;
  removeLane(key: ControlKey): void;
  touchControl(key: ControlKey, value: number): void;
  clearTouched(): void;
  openSongPanel(open: boolean): void;
  setPanelTab(tab: PanelTab): void;
  setPanelFullscreen(on: boolean): void;
  setEditorViewport(viewport: EditorViewport): void;
  /** Pins a knob or a whole mixer to perform at the end, or unpins it, as one undo step; only one that can be pinned. */
  togglePinned(key: ControlKey): void;
  /** Names a pinned knob; an empty name goes back to its own. */
  renamePinned(key: ControlKey, name: string): void;
  movePinned(key: ControlKey, index: number): void;
  /** Sets a knob of a node anywhere in the patch; quick changes of the same knob become one undo step, unless `merge` is false. */
  setKnob(key: ControlKey, value: number, options?: { merge?: boolean }): void;
  /** Hides the row of a node with patterns from the launcher, or shows it again, as one undo step. */
  toggleLauncher(path: string): void;
  /**
   * Sets the level, the pan, the mute or the solo of a mixer channel anywhere in the patch, by the
   * path of its cable; quick changes of the level or the pan become one undo step, unless `merge` is false.
   */
  setChannel(path: string, name: ChannelControl, value: number, options?: { merge?: boolean }): void;
  /** Keeps the pattern of each node as a new scene, as one undo step; only those of nodes with patterns. */
  saveScene(patterns: Record<string, PatternSlot>): void;
  /** Names a scene; an empty name takes its name away. */
  renameScene(index: number, name: string): void;
  removeScene(index: number): void;
  /** Picks the scene on a side of the crossfader, or none with undefined, or moves it, from A (0) to B (1). */
  setCrossfader(change: Partial<Crossfader>): void;
  /** Writes the values of knobs and mixer channels into the patch, as one undo step. */
  applyKnobs(values: Record<ControlKey, number>): void;
  setSongMode(on: boolean): void;
  setSongRec(on: boolean): void;
  setSongCursor(bar: number): void;
  toPatch(): Patch;
  loadPatch(patch: Patch): void;
  undo(): void;
  redo(): void;
  setNodeView(id: NodeId, view: NodeView): void;
  setConnectionSelected(id: string, selected: boolean): void;
  /** Opens the piano roll on a pattern of the clip at `path`, from the top, A1 unless told; undefined closes it. */
  openClipEditor(path: NodeId[] | undefined, pattern?: PatternSlot): void;
  /** Shows the inside of a subpatch of the graph on show; not an undo step. */
  openSubpatch(id: NodeId): void;
  /** Goes back up to the graph `depth` subpatches down from the top; 0 for the whole patch. */
  closeSubpatch(depth: number): void;
  /**
   * Moves nodes of the graph on show into a new subpatch, as one undo step, and returns it;
   * undefined when it cannot (see `groupGraph`).
   */
  groupNodes(ids: NodeId[]): PatchNode | undefined;
  /** Keeps the nodes of the graph on show, and the cables between them, to paste; not an undo step. */
  copyNodes(ids: NodeId[]): void;
  /**
   * Adds what was copied last to the graph on show, a step further each time, as one undo step,
   * and selects it; the In and the Out only inside a subpatch.
   */
  pasteNodes(): PatchNode[];
  /** Copies and pastes nodes of the graph on show in one step, leaving what was copied as it was. */
  duplicateNodes(ids: NodeId[]): PatchNode[];
  /**
   * Gives a node of the graph on show the settings of a preset of its type, as one undo step; a
   * subpatch takes the inside of the preset, and the cables to ports it no longer has go.
   */
  applyPreset(id: NodeId, preset: PresetNode): void;
  /** Adds a node with the settings of a preset, and its name: a subpatch saved as a module of its own. */
  addPreset(preset: Preset, position: Position): PatchNode;
  /**
   * Publishes a param of a node of the subpatch on show on that subpatch, or takes it back. Several
   * params, such as the rows of a Drums, go together: all are taken back while all are published.
   */
  togglePublished(id: NodeId, param: string | readonly string[]): void;
  /** Names a param published on a subpatch of the graph on show; an empty name goes back to its own. */
  renamePublished(subpatchId: NodeId, key: string, name: string): void;
  /** Moves a param published on a subpatch of the graph on show to the place of another, into its section, as one undo step (see `withPublishedMoved`). */
  movePublished(subpatchId: NodeId, key: string, target: string): void;
  /** Starts a new section of the face of a subpatch of the graph on show at a published param, as one undo step. */
  startSection(subpatchId: NodeId, key: string): void;
  /** Names the section of the face of a subpatch that starts at a published param, as one undo step (see `withSectionAt`). */
  nameSection(subpatchId: NodeId, key: string, name: string): void;
  /** Sets a param of a node inside a subpatch of the graph on show, as updateParam does: a control of the subpatch outside. */
  updateInnerParam(
    subpatchId: NodeId,
    id: NodeId,
    name: string,
    value: ParamValue,
    options?: { merge?: boolean | string; pattern?: PatternSlot },
  ): void;
}

interface StoreOptions {
  now?: () => number;
}

const HISTORY_LIMIT = 100;
const PASTE_STEP = 40;
const MERGE_WINDOW_MS = 1000;

const connectionId = (source: PortRef, target: PortRef) =>
  `${source.nodeId}:${source.port}->${target.nodeId}:${target.port}`;

/** The subpatch at the end of `path`. */
const subpatchAt = (patch: Patch, path: readonly NodeId[]) =>
  graphAt(patch, path.slice(0, -1)).nodes.find((node) => node.id === path.at(-1))!;

const idNumber = (id: string) => Number(id.match(/-(\d+)$/)?.[1] ?? 0);

/** The patch without the rows of its song whose node is gone. */
const pruneSongRows = (patch: Patch): Patch => {
  if (!patch.song) {
    return patch;
  }
  const song = pruneAutomation(
    pruneSong(patch.song, new Set(patternPaths(patch).map(({ path }) => path))),
    controlTargets(patch),
  );
  return song === patch.song ? patch : { ...patch, song };
};

const NO_PINS: PinnedKnob[] = [];
const NONE_HIDDEN: string[] = [];
const NO_SCENES: Scene[] = [];

const withPerform = (patch: Patch, perform: PinnedKnob[]): Patch => {
  const { perform: _previous, ...rest } = patch;
  return perform.length > 0 ? { ...rest, perform } : rest;
};

const withHiddenLaunchers = (patch: Patch, hidden: string[]): Patch => {
  const { hiddenLaunchers: _previous, ...rest } = patch;
  return hidden.length > 0 ? { ...rest, hiddenLaunchers: hidden } : rest;
};

const withScenes = (patch: Patch, scenes: Scene[]): Patch => {
  const { scenes: _previous, ...rest } = patch;
  return scenes.length > 0 ? { ...rest, scenes } : rest;
};

/** The patch without the knobs pinned, the rows hidden and the patterns of scenes whose node or param is gone. */
const prunePerform = (patch: Patch): Patch => {
  const perform = patch.perform && prunePinned(patch.perform, patch);
  const hidden = patch.hiddenLaunchers && pruneHidden(patch.hiddenLaunchers, patch);
  const scenes = patch.scenes && pruneScenes(patch.scenes, patch);
  const pinned = perform === patch.perform ? patch : withPerform(patch, perform!);
  const shown = hidden === patch.hiddenLaunchers ? pinned : withHiddenLaunchers(pinned, hidden!);
  return scenes === patch.scenes ? shown : withScenes(shown, scenes!);
};

/** The clip open on the piano roll while it is still in the patch. */
const openClip = (patch: Graph, path: NodeId[] | undefined) =>
  path && nodeAt(patch, path)?.type === "clip" ? path : undefined;

const barsOf = (song: Song | undefined) => (song ?? emptySong()).bars;

export function createPatchStore(engine: PatchEngine, { now = Date.now }: StoreOptions = {}) {
  let lastId = 0;
  let lastChange: { key: string; time: number } | undefined;
  let clipboard: Graph | undefined;
  let pastes = 0;

  return createStore<PatchState>()((set, get) => {
    /** The whole patch; the state shows only the graph at its path. */
    let root: Patch = { nodes: [], connections: [], tempo: DEFAULT_TEMPO };

    const toPatch = (): Patch => root;

    const syncOrRollback = (next: Patch) => {
      try {
        engine.sync(flattenPatch(next));
      } catch (error) {
        engine.sync(flattenPatch(root));
        throw error;
      }
    };

    const show = (patch: Patch, path: readonly NodeId[] = get().path) => {
      const shown = validPath(patch, path);
      const graph = graphAt(patch, shown);
      const ids = new Set(graph.nodes.map((node) => node.id));
      const connectionIds = new Set(graph.connections.map((connection) => connection.id));
      const samePath = shown.length === get().path.length && shown.every((id, index) => id === get().path[index]);
      root = patch;
      return {
        nodes: graph.nodes,
        connections: graph.connections,
        tempo: patch.tempo,
        swing: patch.swing ?? DEFAULT_SWING,
        swingGrid: patch.swingGrid ?? DEFAULT_SWING_GRID,
        meter: patch.meter ?? DEFAULT_METER,
        song: patch.song,
        perform: patch.perform ?? NO_PINS,
        hiddenLaunchers: patch.hiddenLaunchers ?? NONE_HIDDEN,
        scenes: patch.scenes ?? NO_SCENES,
        meta: patch.meta,
        songCursor: Math.min(get().songCursor, barsOf(patch.song) - 1),
        published: shown.length === 0 ? [] : (subpatchAt(patch, shown).published ?? []),
        path: samePath ? get().path : shown,
        nodeViews: samePath
          ? Object.fromEntries(Object.entries(get().nodeViews).filter(([id]) => ids.has(id)))
          : {},
        selectedConnectionIds: samePath ? get().selectedConnectionIds.filter((id) => connectionIds.has(id)) : [],
        clipEditor: openClip(patch, get().clipEditor),
      };
    };

    const commit = (change: Patch, key?: string) => {
      const next = prunePerform(pruneSongRows(prunePublished(pruneConnections(change))));
      syncOrRollback(next);
      const time = now();
      const merge = key !== undefined && lastChange?.key === key && time - lastChange.time < MERGE_WINDOW_MS;
      lastChange = key === undefined ? undefined : { key, time };
      const previous = root;
      set({
        ...show(next),
        past: merge ? get().past : [...get().past, previous].slice(-HISTORY_LIMIT),
        future: [],
      });
    };

    /** Commits a change to the node at the end of `path`, if it is there. */
    const commitNodeAt = (path: readonly NodeId[], change: (node: PatchNode) => PatchNode, key?: string) => {
      const node = nodeAt(root, path);
      if (!node) {
        return;
      }
      const outside = path.slice(0, -1);
      const graph = graphAt(root, outside);
      commit(withGraphAt(root, outside, { ...graph, nodes: graph.nodes.map((other) => (other === node ? change(node) : other)) }), key);
    };

    /** Commits a change to the params published on a subpatch of the graph on show, if it changes them. */
    const commitPublished = (subpatchId: NodeId, change: (subpatch: PatchNode) => PublishedParam[]) => {
      const subpatch = get().nodes.find((node) => node.id === subpatchId && node.type === "subpatch");
      if (!subpatch) {
        return;
      }
      const published = change(subpatch);
      if (JSON.stringify(published) === JSON.stringify(subpatch.published ?? [])) {
        return;
      }
      commitGraph(
        mapNode(subpatchId, ({ published: _published, ...rest }) => (published.length > 0 ? { ...rest, published } : rest)),
      );
    };

    /** Commits a change to the graph on show. */
    const commitGraph = (graph: Graph, key?: string) => commit(withGraphAt(root, get().path, graph), key);

    const shownGraph = (): Graph => ({ nodes: get().nodes, connections: get().connections });

    const travel = (from: "past" | "future", to: "past" | "future") => {
      const target = get()[from].at(from === "past" ? -1 : 0);
      if (!target) {
        return;
      }
      syncOrRollback(target);
      lastChange = undefined;
      const current = root;
      set({
        ...show(target),
        [from]: from === "past" ? get().past.slice(0, -1) : get().future.slice(1),
        [to]: to === "past" ? [...get().past, current] : [current, ...get().future],
      });
    };

    const mapNode = (id: NodeId, change: (node: PatchNode) => PatchNode): Graph => ({
      ...shownGraph(),
      nodes: get().nodes.map((node) => (node.id === id ? change(node) : node)),
    });

    const paste = (clip: Graph, step: number) => {
      const pasted = pasteGraph(
        shownGraph(),
        clip,
        (type) => `${type}-${++lastId}`,
        { x: step * PASTE_STEP, y: step * PASTE_STEP },
        { ports: get().path.length > 0 },
      );
      if (pasted.ids.length === 0) {
        return [];
      }
      commitGraph(pasted.graph);
      const added = new Set(pasted.ids);
      set({
        nodeViews: Object.fromEntries(
          [...Object.keys(get().nodeViews), ...pasted.ids].map((id) => [id, { ...get().nodeViews[id], selected: added.has(id) }]),
        ),
      });
      return get().nodes.filter(({ id }) => added.has(id));
    };

    /** New ids go past those inside a preset, so none added inside it later takes one of them. */
    const passIds = (preset: PresetNode) => {
      lastId = Math.max(lastId, ...innerNodes(preset).map((node) => idNumber(node.id)));
    };

    const hasNode = (id: NodeId) => get().nodes.some((node) => node.id === id);
    const hasConnection = (id: string) => get().connections.some((connection) => connection.id === id);

    return {
      nodes: [],
      connections: [],
      path: [],
      tempo: DEFAULT_TEMPO,
      swing: DEFAULT_SWING,
      swingGrid: DEFAULT_SWING_GRID,
      meter: DEFAULT_METER,
      published: [],
      nodeViews: {},
      selectedConnectionIds: [],
      clipPattern: FIRST_SLOT,
      songPanel: false,
      panelTab: "song",
      panelFullscreen: false,
      editorViewport: { x: 0, y: 0, zoom: 1 },
      perform: NO_PINS,
      hiddenLaunchers: NONE_HIDDEN,
      scenes: NO_SCENES,
      songMode: false,
      songRec: false,
      songCursor: 0,
      songTouched: {},
      crossfader: CENTRED,
      past: [],
      future: [],

      addNode(type, position) {
        const params = defaultParams(type);
        const patterns = initialPatterns(type, params);
        const node: PatchNode = {
          id: `${type}-${++lastId}`,
          type,
          position,
          params,
          ...(patterns && { patterns }),
          ...(type === "subpatch" && { patch: { nodes: [], connections: [] } }),
        };
        commitGraph({ ...shownGraph(), nodes: [...get().nodes, node] });
        return node;
      },

      applyPreset(id, preset) {
        const node = get().nodes.find((candidate) => candidate.id === id);
        if (!node || node.type !== preset.type) {
          return;
        }
        passIds(preset);
        commitGraph(mapNode(id, (current) => withPreset(current, preset)));
      },

      addPreset(preset, position) {
        const { type } = preset.node;
        passIds(preset.node);
        const node = withPreset({ id: `${type}-${++lastId}`, type, position, name: preset.name, params: {} }, preset.node);
        commitGraph({ ...shownGraph(), nodes: [...get().nodes, node] });
        return node;
      },

      moveNode(id, position) {
        if (hasNode(id)) {
          commitGraph(mapNode(id, (node) => ({ ...node, position })), `move:${id}`);
        }
      },

      moveNodes(positions) {
        if (!get().nodes.some((node) => node.id in positions)) {
          return;
        }
        commitGraph({
          ...shownGraph(),
          nodes: get().nodes.map((node) => (node.id in positions ? { ...node, position: positions[node.id] } : node)),
        });
      },

      renameNode(id, name) {
        const node = get().nodes.find((candidate) => candidate.id === id);
        const trimmed = name.trim().slice(0, NODE_NAME_MAX_LENGTH);
        if (!node || (node.name ?? "") === trimmed) {
          return;
        }
        commitGraph(
          mapNode(id, ({ name: _previous, ...rest }) => (trimmed ? { ...rest, name: trimmed } : rest)),
        );
      },

      removeNode(id) {
        get().remove({ nodes: [id] });
      },

      remove({ nodes = [], connections = [] }) {
        const nodeIds = new Set(nodes.filter(hasNode));
        const connectionIds = new Set(connections.filter(hasConnection));
        if (nodeIds.size === 0 && connectionIds.size === 0) {
          return;
        }
        commitGraph({
          nodes: get().nodes.filter((node) => !nodeIds.has(node.id)),
          connections: get().connections.filter(
            (connection) =>
              !connectionIds.has(connection.id) &&
              !nodeIds.has(connection.source.nodeId) &&
              !nodeIds.has(connection.target.nodeId),
          ),
        });
      },

      updateParam(id, name, value, options) {
        get().updateParamAt([...get().path, id], name, value, options);
      },

      updateParams(id, values, options) {
        get().updateParamsAt([...get().path, id], values, options);
      },

      updateParamAt(path, name, value, { merge = true, pattern = FIRST_SLOT } = {}) {
        const key = `param:${path.join("/")}:${pattern}:${name}`;
        commitNodeAt(
          path,
          (node) => withPatternParam(node, pattern, name, value),
          merge === false ? undefined : merge === true ? key : `${key}:${merge}`,
        );
      },

      updateParamsAt(path, values, { pattern = FIRST_SLOT } = {}) {
        commitNodeAt(path, (node) =>
          Object.entries(values).reduce((changed, [name, value]) => withPatternParam(changed, pattern, name, value), node),
        );
      },

      setTempo(tempo) {
        const clamped = Math.round(Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, tempo)));
        if (Number.isFinite(tempo) && clamped !== get().tempo) {
          commit({ ...root, tempo: clamped }, "tempo");
        }
      },

      setSwing(swing) {
        const clamped = Math.round(Math.min(MAX_SWING, Math.max(MIN_SWING, swing)));
        if (Number.isFinite(swing) && clamped !== get().swing) {
          const { swing: _straight, ...rest } = root;
          commit(clamped === DEFAULT_SWING ? rest : { ...rest, swing: clamped }, "swing");
        }
      },

      setSwingGrid(grid) {
        if (SWING_GRIDS.includes(grid) && grid !== get().swingGrid) {
          const { swingGrid: _sixteenths, ...rest } = root;
          commit(grid === DEFAULT_SWING_GRID ? rest : { ...rest, swingGrid: grid });
        }
      },

      setMeter(meter) {
        if (isMeter(meter) && !sameMeter(meter, get().meter)) {
          commit(withMeter(root, meter));
        }
      },

      canConnect(source, target) {
        return validateConnection(shownGraph(), { source, target }).ok;
      },

      connect(source, target) {
        if (!get().canConnect(source, target)) {
          return null;
        }
        const connection: PatchConnection = { id: connectionId(source, target), source, target };
        commitGraph({ ...shownGraph(), connections: [...get().connections, connection] });
        return connection;
      },

      disconnect(id) {
        get().remove({ connections: [id] });
      },

      canReconnect(id, source, target) {
        const others = { ...shownGraph(), connections: get().connections.filter((connection) => connection.id !== id) };
        return hasConnection(id) && id !== connectionId(source, target) && validateConnection(others, { source, target }).ok;
      },

      reconnect(id, source, target) {
        if (!get().canReconnect(id, source, target)) {
          return null;
        }
        const old = get().connections.find((connection) => connection.id === id)!;
        const { amount, pan: _pan, mute: _mute, solo: _solo, ...cable } = old;
        const sameTarget = old.target.nodeId === target.nodeId && old.target.port === target.port;
        const targetNode = get().nodes.find((node) => node.id === target.nodeId)!;
        const control = portsOfNode(targetNode).inputs.find((port) => port.id === target.port)?.type === "control";
        const moved: PatchConnection = {
          ...(sameTarget ? old : { ...cable, ...(control && amount !== undefined && { amount }) }),
          id: connectionId(source, target),
          source,
          target,
        };
        const following = (node: PatchNode) =>
          moduleRegistry[node.type].params.filter((param) => param.kind === "cable" && node.params[param.id] === id);
        commitGraph({
          nodes: get().nodes.map((node) =>
            following(node).length > 0
              ? {
                  ...node,
                  params: {
                    ...node.params,
                    ...Object.fromEntries(following(node).map((param) => [param.id, moved.id])),
                  },
                }
              : node,
          ),
          connections: get().connections.map((connection) => (connection.id === id ? moved : connection)),
        });
        return moved;
      },

      setConnectionAmount(id, amount, { merge = true } = {}) {
        if (!hasConnection(id)) {
          return;
        }
        commitGraph(
          {
            ...shownGraph(),
            connections: get().connections.map((connection) =>
              connection.id === id ? { ...connection, amount } : connection,
            ),
          },
          merge ? `amount:${id}` : undefined,
        );
      },

      setConnectionPan(id, pan, { merge = true } = {}) {
        if (!hasConnection(id)) {
          return;
        }
        commitGraph(
          {
            ...shownGraph(),
            connections: get().connections.map((connection) => {
              if (connection.id !== id) {
                return connection;
              }
              const { pan: _previous, ...rest } = connection;
              return pan === 0 ? rest : { ...rest, pan };
            }),
          },
          merge ? `pan:${id}` : undefined,
        );
      },

      setConnectionSwitch(id, name, on) {
        const connection = get().connections.find((candidate) => candidate.id === id);
        if (!connection || (connection[name] === true) === on) {
          return;
        }
        const { [name]: _previous, ...rest } = connection;
        const next: PatchConnection = on ? { ...rest, [name]: true } : rest;
        commitGraph({
          ...shownGraph(),
          connections: get().connections.map((candidate) => (candidate.id === id ? next : candidate)),
        });
      },

      setSongCell(path, bar, cell) {
        const song = root.song ?? emptySong();
        const next = withCell(song, path, bar, cell);
        if (next !== song || !root.song) {
          commit({ ...root, song: next });
        }
      },

      setSongLength(bars) {
        commit({ ...root, song: withLength(root.song ?? emptySong(), bars, beatsPerBar(root.meter)) });
      },

      setMeta(changes) {
        const { meta: _previous, ...rest } = root;
        const meta = withMeta(root.meta, changes);
        if (JSON.stringify(meta) === JSON.stringify(root.meta)) {
          return;
        }
        commit(meta ? { ...rest, meta } : rest, `meta:${Object.keys(changes).sort().join(",")}`);
      },

      setSongFade(bars) {
        commit({ ...root, song: withFade(root.song ?? emptySong(), bars) });
      },

      setSongLoop(loop) {
        commit({ ...root, song: withLoop(root.song ?? emptySong(), loop) });
      },

      initializeSong(playing) {
        commit({ ...root, song: initialSong(playing, barsOf(root.song)) });
      },

      recordTake(key, points, start, end) {
        const song = root.song ?? emptySong();
        commit({ ...root, song: withLane(song, key, withTake(laneOf(song, key), points, start, end)) });
      },

      setControlPoint(key, beat, value) {
        const song = root.song ?? emptySong();
        commit({ ...root, song: withLane(song, key, withPoint(laneOf(song, key), beat, value)) }, `point:${key}:${beat}`);
      },

      clearControlPoints(key, from, to) {
        const song = root.song;
        const points = song ? laneOf(song, key) : [];
        const kept = withoutPointsIn(points, from, to);
        if (song && kept.length < points.length) {
          commit({ ...root, song: withLane(song, key, kept) });
        }
      },

      copyControls(values, over) {
        const song = root.song ?? emptySong();
        const { loop } = song;
        if (Object.keys(values).length === 0 || (over === "loop" && !loop)) {
          return;
        }
        const beats = beatsPerBar(root.meter);
        const copied = Object.entries(values).reduce(
          (current, [key, value]) =>
            withLane(
              current,
              key,
              over === "song"
                ? [{ beat: 0, value }]
                : withConstant(laneOf(current, key), value, loop!.start * beats, (loop!.start + loop!.length) * beats),
            ),
          song,
        );
        commit({ ...root, song: copied });
      },

      removeLane(key) {
        if (root.song?.automation?.[key]) {
          commit({ ...root, song: withLane(root.song, key, []) });
        }
      },

      touchControl(key, value) {
        set({ songTouched: { ...get().songTouched, [key]: value } });
      },

      clearTouched() {
        set({ songTouched: {} });
      },

      openSongPanel(open) {
        set({ songPanel: open, ...(!open && { panelFullscreen: false }) });
      },

      setPanelFullscreen(on) {
        set({ panelFullscreen: on });
      },

      setEditorViewport(viewport) {
        set({ editorViewport: viewport });
      },

      setPanelTab(tab) {
        set({ panelTab: tab });
      },

      togglePinned(key) {
        if (pinnableKnob(root, key) || pinnableMixer(root, key)) {
          commit(withPerform(root, withPinToggled(root.perform ?? [], key)));
        }
      },

      renamePinned(key, name) {
        const perform = root.perform ?? [];
        const named = withPinName(perform, key, name);
        if (named.some((knob, index) => knob.name !== perform[index].name)) {
          commit(withPerform(root, named));
        }
      },

      movePinned(key, index) {
        const perform = root.perform ?? [];
        const moved = withPinMoved(perform, key, index);
        if (moved !== perform) {
          commit(withPerform(root, moved));
        }
      },

      setKnob(key, value, { merge = true } = {}) {
        const next = withKnobValue(root, key, value);
        if (next !== root) {
          commit(next, merge ? `knob:${key}` : undefined);
        }
      },

      setChannel(path, name, value, { merge = true } = {}) {
        const next = withChannelValue(root, path, name, value);
        if (next !== root) {
          const continuous = name === "level" || name === "pan";
          commit(next, merge && continuous ? `channel:${path}:${name}` : undefined);
        }
      },

      toggleLauncher(path) {
        if (patternPaths(root).some((row) => row.path === path)) {
          commit(withHiddenLaunchers(root, withHiddenToggled(root.hiddenLaunchers ?? [], path)));
        }
      },

      saveScene(patterns) {
        const paths = new Set(patternPaths(root).map(({ path }) => path));
        const kept = Object.fromEntries(Object.entries(patterns).filter(([path]) => paths.has(path)));
        if (Object.keys(kept).length > 0) {
          commit(withScenes(root, withScene(root.scenes ?? [], kept, sceneKnobs(root, root.perform ?? []))));
        }
      },

      renameScene(index, name) {
        const scenes = root.scenes ?? [];
        const named = withSceneName(scenes, index, name);
        if (named !== scenes && named[index].name !== scenes[index].name) {
          commit(withScenes(root, named));
        }
      },

      removeScene(index) {
        const scenes = root.scenes ?? [];
        const kept = withoutScene(scenes, index);
        if (kept !== scenes) {
          commit(withScenes(root, kept));
          set({ crossfader: withoutSceneAt(get().crossfader, index) });
        }
      },

      setCrossfader(change) {
        const merged = { ...get().crossfader, ...change };
        set({
          crossfader: {
            ...(merged.a !== undefined && { a: merged.a }),
            ...(merged.b !== undefined && { b: merged.b }),
            position: merged.position,
          },
        });
      },

      applyKnobs(values) {
        const applied = Object.entries(values).reduce((patch, [key, value]) => {
          const { target, name } = parseControlKey(key);
          return isChannelKey(key)
            ? withChannelValue(patch, target, name as ChannelControl, value)
            : withKnobValue(patch, key, value);
        }, root);
        if (applied !== root) {
          commit(applied);
        }
      },

      setSongMode(on) {
        set({ songMode: on });
      },

      setSongRec(on) {
        set({ songRec: on });
      },

      setSongCursor(bar) {
        set({ songCursor: Math.max(0, Math.min(Math.round(bar), barsOf(root.song) - 1)) });
      },

      toPatch,

      loadPatch(patch) {
        set({ nodeViews: {}, selectedConnectionIds: [], clipEditor: undefined, path: [], songCursor: 0, songRec: false, crossfader: CENTRED });
        void engine.reset?.();
        commit(patch);
        lastId = Math.max(lastId, ...allNodes(patch).map((node) => idNumber(node.id)));
      },

      undo() {
        travel("past", "future");
      },

      redo() {
        travel("future", "past");
      },

      setNodeView(id, view) {
        set({ nodeViews: { ...get().nodeViews, [id]: { ...get().nodeViews[id], ...view } } });
      },

      openClipEditor(path, pattern = FIRST_SLOT) {
        set({ clipEditor: path, clipPattern: pattern });
      },

      openSubpatch(id) {
        if (get().nodes.some((node) => node.id === id && node.type === "subpatch")) {
          set(show(root, [...get().path, id]));
        }
      },

      closeSubpatch(depth) {
        set(show(root, get().path.slice(0, Math.max(0, depth))));
      },

      togglePublished(id, param) {
        const path = get().path;
        const inner = get().nodes.find((node) => node.id === id);
        const params = typeof param === "string" ? [param] : param;
        if (path.length === 0 || !inner || params.length === 0 || !params.every((name) => publishableParam(inner, name))) {
          return;
        }
        const outside = path.slice(0, -1);
        const graph = graphAt(root, outside);
        const keys = new Set(params.map((name) => publishedKey({ node: id, param: name })));
        commit(
          withGraphAt(root, outside, {
            ...graph,
            nodes: graph.nodes.map((node) => {
              if (node.id !== path.at(-1)) {
                return node;
              }
              const current = node.published ?? [];
              const kept = current.filter((entry) => !keys.has(publishedKey(entry)));
              const added = params
                .filter((name) => !current.some((entry) => publishedKey(entry) === publishedKey({ node: id, param: name })))
                .map((name) => ({ node: id, param: name }));
              const published = added.length === 0 ? kept : [...current, ...added];
              const { published: _published, ...rest } = node;
              return published.length > 0 ? { ...rest, published } : rest;
            }),
          }),
        );
      },

      renamePublished(subpatchId, key, name) {
        const trimmed = name.trim().slice(0, NODE_NAME_MAX_LENGTH);
        commitGraph(
          mapNode(subpatchId, (node) => ({
            ...node,
            published: node.published?.map((entry) => {
              if (publishedKey(entry) !== key) {
                return entry;
              }
              const { name: _name, ...rest } = entry;
              return trimmed ? { ...rest, name: trimmed } : rest;
            }),
          })),
        );
      },

      movePublished(subpatchId, key, target) {
        commitPublished(subpatchId, (subpatch) => withPublishedMoved(subpatch, key, target));
      },

      startSection(subpatchId, key) {
        commitPublished(subpatchId, (subpatch) => withSectionAt(subpatch, key, newSectionName(subpatch.published ?? [])));
      },

      nameSection(subpatchId, key, name) {
        commitPublished(subpatchId, (subpatch) => withSectionAt(subpatch, key, name));
      },

      updateInnerParam(subpatchId, id, name, value, options) {
        get().updateParamAt([...get().path, subpatchId, id], name, value, options);
      },

      groupNodes(ids) {
        const grouped = groupGraph(shownGraph(), ids, (type) => `${type}-${++lastId}`);
        if (!grouped) {
          return undefined;
        }
        commitGraph(grouped.graph);
        return grouped.subpatch;
      },

      copyNodes(ids) {
        const copied = copyGraph(shownGraph(), ids);
        if (copied) {
          clipboard = copied;
          pastes = 0;
        }
      },

      pasteNodes() {
        return clipboard ? paste(clipboard, ++pastes) : [];
      },

      duplicateNodes(ids) {
        const copied = copyGraph(shownGraph(), ids);
        return copied ? paste(copied, 1) : [];
      },

      setConnectionSelected(id, selected) {
        const others = get().selectedConnectionIds.filter((existing) => existing !== id);
        set({ selectedConnectionIds: selected ? [...others, id] : others });
      },
    };
  });
}

export type PatchStore = ReturnType<typeof createPatchStore>;
