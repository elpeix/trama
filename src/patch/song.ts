import { formatLane, parseControlKey, parseLane, type AutomationPoint, type ControlKey } from "./automation";
import {
  bankOf,
  FIRST_SLOT,
  isPatternSlot,
  legacySlot,
  numberOf,
  PATTERN_BANKS,
  PATTERNS_PER_BANK,
  patternIds,
  slotOf,
  STOP,
  type Launch,
} from "./patterns";
import { moduleRegistry } from "./registry";
import type { Graph, PatchNode, PatternBank, PatternSlot, Song, SongLoop } from "./types";

/** A bar of a row: the pattern launched on it, a stop, or undefined for a dash. */
export type SongCell = Launch | undefined;

export const DEFAULT_SONG_BARS = 8;
export const MIN_SONG_BARS = 1;
export const MAX_SONG_BARS = 999;

const DASH = "-";
export function parseRow(row: string, bars: number): SongCell[] {
  const tokens = row.split(" ").filter(Boolean);
  return Array.from({ length: bars }, (_, bar) => {
    const token = tokens[bar] ?? DASH;
    return isPatternSlot(token) || token === STOP ? token : legacySlot(token);
  });
}

export function formatRow(cells: readonly SongCell[]): string {
  return cells.map((cell) => cell ?? DASH).join(" ");
}

const cellsOf = (song: Song, path: string) => parseRow(song.rows[path] ?? "", song.bars);

export function cellAt(song: Song, path: string, bar: number): SongCell {
  return cellsOf(song, path)[bar];
}

/** Each bar of a row, read in one go: the cell written on it, and the pattern or the stop that sounds there. */
export function rowCells(song: Song, path: string): { cell: SongCell; sounding: SongCell }[] {
  let sounding: SongCell;
  return cellsOf(song, path).map((cell) => {
    sounding = cell ?? sounding;
    return { cell, sounding };
  });
}

/** The pattern that sounds on a bar, or the stop that silences it: the last one launched at or before it. */
export function slotAt(song: Song, path: string, bar: number): Launch | undefined {
  return cellsOf(song, path)
    .slice(0, bar + 1)
    .findLast((cell) => cell !== undefined);
}

/** The bar the pattern that sounds on a bar was written on: the bar of the last letter at or before it. */
export function launchedOn(song: Song, path: string, bar: number): number | undefined {
  const index = cellsOf(song, path)
    .slice(0, bar + 1)
    .findLastIndex((cell) => cell !== undefined);
  return index === -1 ? undefined : index;
}

const withRow = (song: Song, path: string, cells: readonly SongCell[]): Song => {
  const { [path]: _previous, ...rows } = song.rows;
  return { ...song, rows: cells.some(Boolean) ? { ...rows, [path]: formatRow(cells) } : rows };
};

export function withCell(song: Song, path: string, bar: number, cell: SongCell): Song {
  if (bar < 0 || bar >= song.bars) {
    return song;
  }
  const cells = cellsOf(song, path);
  cells[bar] = cell;
  return withRow(song, path, cells);
}

/** What a click on a cell leaves: A1 on a dash or a stop, the next pattern of the bank, or a dash after the eighth. */
export function cyclePattern(cell: SongCell): SongCell {
  if (cell === undefined || cell === STOP) {
    return FIRST_SLOT;
  }
  const number = numberOf(cell);
  return number < PATTERNS_PER_BANK ? slotOf(bankOf(cell), number + 1) : undefined;
}

const CLEAR_KEYS = ["-", "Delete", "Backspace"];

/**
 * What a key typed on a cell leaves: a letter changes the bank and a digit the number, keeping the
 * other from the cell, or on a dash from the pattern that sounds there, or else from A1; a dot, a
 * stop. Null for a key that clears it; the cell as it was for any other key.
 */
export function typedCell(cell: SongCell, key: string, sounding?: Launch): SongCell | null {
  if (CLEAR_KEYS.includes(key)) {
    return null;
  }
  if (key === STOP) {
    return STOP;
  }
  const kept = cell ?? sounding;
  const from = kept === undefined || kept === STOP ? FIRST_SLOT : kept;
  const bank = key.toUpperCase() as PatternBank;
  if (key.length === 1 && PATTERN_BANKS.includes(bank)) {
    return slotOf(bank, numberOf(from));
  }
  const number = Number(key);
  if (key.length === 1 && number >= 1 && number <= PATTERNS_PER_BANK) {
    return slotOf(bankOf(from), number);
  }
  return cell;
}

const clampBars = (bars: number) => Math.min(MAX_SONG_BARS, Math.max(MIN_SONG_BARS, Math.round(bars)));

const fitLoop = (loop: SongLoop | undefined, bars: number): SongLoop | undefined => {
  if (!loop || loop.start >= bars) {
    return undefined;
  }
  return { start: loop.start, length: Math.max(1, Math.min(loop.length, bars - loop.start)) };
};

const withFittedLoop = (song: Song, loop: SongLoop | undefined): Song => {
  const { loop: _previous, ...rest } = song;
  const fitted = fitLoop(loop, song.bars);
  return fitted ? { ...rest, loop: fitted } : rest;
};

/** The song with a fade over its last bars, whole and no longer than the song; none at 0. */
export function withFade(song: Song, bars: number): Song {
  const { fade: _previous, ...rest } = song;
  const fade = Math.max(0, Math.min(song.bars, Math.round(bars)));
  return fade > 0 ? { ...rest, fade } : rest;
}

export function withLength(song: Song, bars: number, beatsPerBar: number): Song {
  const length = clampBars(bars);
  const resized = Object.keys(song.rows).reduce(
    (current, path) => withRow(current, path, parseRow(song.rows[path], length)),
    { ...song, bars: length },
  );
  const trimmed = Object.keys(song.automation ?? {}).reduce(
    (current, key) => withLane(current, key, laneOf(song, key).filter((point) => point.beat < length * beatsPerBar)),
    resized,
  );
  const fitted = withFittedLoop(trimmed, song.loop);
  return song.fade === undefined ? fitted : withFade(fitted, song.fade);
}

export function withLoop(song: Song, loop: SongLoop | undefined): Song {
  return withFittedLoop(song, loop);
}

/** The bar that plays after `bar`: back to the start of the loop from its last one; undefined past the end. */
export function nextBar(song: Song, bar: number): number | undefined {
  if (song.loop && bar === song.loop.start + song.loop.length - 1) {
    return song.loop.start;
  }
  return bar + 1 < song.bars ? bar + 1 : undefined;
}

/** How many bars the song plays from `from` until it ends; undefined while a loop keeps it going. */
export function songEnd(song: Song, from: number): number | undefined {
  let bar: number | undefined = from;
  for (let played = 0; played <= song.bars; played++) {
    if (bar === undefined) {
      return played;
    }
    bar = nextBar(song, bar);
  }
  return undefined;
}

/**
 * The volume of the sound `beat` beats after the song started on `from`: whole until its fade,
 * and then down to nothing at its end, on a curve that sounds even to the ear.
 */
export function fadeGain(song: Song, from: number, beat: number, beatsPerBar: number): number {
  const end = song.fade ? songEnd(song, from) : undefined;
  if (end === undefined) {
    return 1;
  }
  const left = (end * beatsPerBar - beat) / (song.fade! * beatsPerBar);
  return Math.max(0, Math.min(1, left)) ** 2;
}

/** The bar of the song that plays `played` bars after it started on `from`; undefined once it has ended. */
export function songBarAt(song: Song, from: number, played: number): number | undefined {
  let bar: number | undefined = from;
  for (let count = 0; count < played && bar !== undefined; count++) {
    bar = nextBar(song, bar);
  }
  return bar;
}

export function emptySong(): Song {
  return { bars: DEFAULT_SONG_BARS, rows: {} };
}

/** A song where each node plays on what it plays now, from the first bar to the end. */
export function initialSong(playing: Record<string, PatternSlot>, bars = DEFAULT_SONG_BARS): Song {
  const length = clampBars(bars);
  return Object.entries(playing).reduce(
    (song, [path, slot]) => withCell(song, path, 0, slot),
    { bars: length, rows: {} } as Song,
  );
}

export function pruneSong(song: Song, paths: ReadonlySet<string>): Song {
  const gone = Object.keys(song.rows).filter((path) => !paths.has(path));
  if (gone.length === 0) {
    return song;
  }
  return { ...song, rows: Object.fromEntries(Object.entries(song.rows).filter(([path]) => paths.has(path))) };
}

export interface PatternPath {
  path: string;
  node: PatchNode;
  /** The names of the subpatches down to the node, and its own: the title of its module while unnamed. */
  names: string[];
}

/** Every node with patterns, those inside subpatches too, with the path the song knows it by. */
export function patternPaths(graph: Graph, prefix = "", names: string[] = []): PatternPath[] {
  return graph.nodes.flatMap((node) => {
    const path = `${prefix}${node.id}`;
    const named = [...names, node.name ?? moduleRegistry[node.type].title];
    if (node.patch) {
      return patternPaths(node.patch, `${path}/`, named);
    }
    return patternIds(node.type).length > 0 ? [{ path, node, names: named }] : [];
  });
}

export function laneOf(song: Song, key: ControlKey): AutomationPoint[] {
  const text = song.automation?.[key];
  return (text && parseLane(text)) || [];
}

export function withLane(song: Song, key: ControlKey, points: readonly AutomationPoint[]): Song {
  const { automation = {}, ...rest } = song;
  const { [key]: _previous, ...lanes } = automation;
  const next = points.length > 0 ? { ...automation, [key]: formatLane(points) } : lanes;
  return Object.keys(next).length > 0 ? { ...rest, automation: next } : rest;
}

export function pruneAutomation(song: Song, targets: ReadonlySet<string>): Song {
  const keys = Object.keys(song.automation ?? {});
  const kept = keys.filter((key) => targets.has(parseControlKey(key).target));
  if (kept.length === keys.length) {
    return song;
  }
  const { automation: _automation, ...rest } = song;
  return kept.length === 0 ? rest : { ...rest, automation: Object.fromEntries(kept.map((key) => [key, song.automation![key]])) };
}
