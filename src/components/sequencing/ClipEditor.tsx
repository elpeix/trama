import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { DEFAULT_VELOCITY, formatClip, MAX_VELOCITY, parseClip, velocityOf, type ClipNote } from "../../patch/clip";
import { beatsPerBar, groupStarts, maxClipBars, pulseBeats, timeSignature } from "../../patch/meter";
import { MidiFormatError, readMidi, writeMidi } from "../../patch/midi";
import { noteName } from "../../patch/pitch";
import { paramsInPattern } from "../../patch/patterns";
import { moduleRegistry, type ClipParamDefinition } from "../../patch/registry";
import { ROOTS, SCALES } from "../../patch/scales";
import { nodeAt } from "../../patch/subpatch";
import type { NodeId } from "../../patch/types";
import { usePatchStore } from "../../store/usePatchStore";
import { themeStorage } from "../../theme/useTheme";
import {
  addNote,
  changeVelocities,
  clipCell,
  copiedNotes,
  copyNotes,
  duplicateLoop,
  duplicateNotes,
  fitToClip,
  keepCopiedNotes,
  moveNotes,
  noteAt,
  notesIn,
  notesStartingAt,
  pasteNotes,
  quantizeNotes,
  recordedNote,
  removeNotes,
  resizeNotes,
  sortNotes,
  velocityAt,
  type ClipCell,
  type ClipView,
} from "./clipEdit";
import { EngineContext } from "../EngineContext";
import { downloadFile } from "../header/download";
import { LoadIcon, RecordIcon, SaveIcon, SoundIcon } from "../header/icons";
import { KeysContext } from "../keys/KeysContext";
import { RemoveIcon } from "../RemoveIcon";

/** The narrowest a beat gets; when the clip is short, the beats widen to fill the panel. */
const BEAT_WIDTH = 40;
/** The widest a beat gets when zoomed in, and the narrowest when zoomed out as far as it goes. */
const MAX_BEAT_WIDTH = 480;
const MIN_BEAT_WIDTH = 4;
const MIN_ROW_HEIGHT = 10;
const MAX_ROW_HEIGHT = 32;
/** How much a zoom button zooms, and how much a step of the wheel does. */
const ZOOM_STEP = 1.25;
const WHEEL_ZOOM = 0.002;
const RULER_HEIGHT = 18;
const VELOCITY_HEIGHT = 48;
/** How close to the start of a note, in pixels, its bar in the velocity lane is grabbed. */
const VELOCITY_GRAB = 6;
/**
 * How close to its end, in pixels, a note is grabbed to change its length instead of moving it;
 * a third of the note at most, so that a short one can still be moved.
 */
const EDGE = 6;
/** How far, in pixels, the pointer goes before a press becomes a drag. */
const DRAG_THRESHOLD = 3;
const MIN_HEIGHT = 160;
const HEIGHT_STEP = 20;
/** The grids the notes go on, in beats a step; off is a grid so fine it does not show. */
const SNAPS: Record<string, number> = {
  "1/4": 1,
  "1/8": 1 / 2,
  "1/8T": 1 / 3,
  "1/16": 1 / 4,
  "1/16T": 1 / 6,
  "1/32": 1 / 8,
  Off: 1 / 16,
};
/** The lines drawn when the grid is off: every sixteenth. */
const OFF_LINES = 1 / 4;
const NO_SCALE = "off";
const SCALE_NAMES = Object.keys(SCALES).filter((name) => name !== "chromatic");
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const MIDDLE_C = 60;

interface Drag {
  name: string;
  mode: "move" | "resize" | "erase" | "select";
  /** The notes dragged, by their index in `base`, and the one grabbed. */
  indices: number[];
  anchor: number;
  /** The notes as they were when the drag began, or as the eraser has left them so far. */
  base: ClipNote[];
  from: ClipCell;
  pointer: { x: number; y: number };
  moved: boolean;
  /** The length of the note grabbed, which the next note drawn takes. */
  length?: number;
  /** A note clicked in a selection of several, which becomes the only one selected unless it is dragged. */
  narrowTo?: number;
  /** What was selected before a box was drawn, which the box adds to. */
  before?: number[];
}

/** Which notes are selected, by their index, while the notes are the ones written as `text`. */
interface Selection {
  text: string;
  indices: number[];
}

/**
 * The height the panel was left at, kept while the page is open; at first, tall enough to show
 * the rows over the velocity lane.
 */
let panelHeight = 330;

/** The scale lit on the roll, kept while the page is open. */
const shownScale = { scale: NO_SCALE, root: "C" };

/** How tall the rows are, kept while the page is open. */
const shownRows = { height: 16 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const HEAR_KEY = "trama:hear-notes";

/** Whether the notes sound while they are edited, as this browser keeps it. */
const readHear = () => {
  try {
    return themeStorage()?.getItem(HEAR_KEY) !== "off";
  } catch {
    return true;
  }
};

const saveHear = (on: boolean) => {
  try {
    themeStorage()?.setItem(HEAR_KEY, on ? "on" : "off");
  } catch {
    return;
  }
};
/** How long a note sounds when it moves from the keys, in milliseconds. */
const KEYED_PREVIEW = 200;

const maxHeight = () => Math.max(MIN_HEIGHT, Math.round(window.innerHeight * 0.8));

/**
 * The piano roll of a clip, at the bottom of the screen: drag on an empty place to draw a note as
 * long as the drag (a click draws one as long as the last note touched), drag a note to move it,
 * drag its end to change its length, and double-click it or right-click it to take it away (a drag
 * with the right button erases all it goes over). A click selects a note, Shift and a click adds
 * or takes one from the selection, and Shift and a drag on an empty place selects those in a box;
 * the selected notes move and change length together, and Alt and a drag moves a copy of them.
 * With the roll focused, the keys delete, move, transpose, copy, paste and duplicate them (see
 * `keyDown`). Every gesture is a single undo step, and the notes go on the grid chosen. The top
 * edge of the panel is dragged to make it taller. While Hear is on, the clip plays the note
 * grabbed, drawn or moved, and a key on the left while it is pressed. Rec adds what is played on
 * the computer keys while the clip loops, as it is played, to the notes already there.
 * It edits the pattern of the clip being edited on its node, which need not be the one playing.
 */
export function ClipEditor({ path }: { path: NodeId[] }) {
  const nodeId = path.at(-1)!;
  const node = usePatchStore((state) => nodeAt(state.toPatch(), path));
  const pattern = usePatchStore((state) => state.clipPattern);
  const updateParamAt = usePatchStore((state) => state.updateParamAt);
  const openClipEditor = usePatchStore((state) => state.openClipEditor);
  const engine = useContext(EngineContext);
  const updateParamsAt = usePatchStore((state) => state.updateParamsAt);
  const tempo = usePatchStore((state) => state.tempo);
  const meter = usePatchStore((state) => state.meter);
  const barBeats = beatsPerBar(meter);
  const midiInput = useRef<HTMLInputElement>(null);
  /** What the last MIDI file imported left out, or why it could not be read. */
  const [midiMessage, setMidiMessage] = useState<string | undefined>(undefined);
  const [snap, setSnap] = useState("1/16");
  const [scale, setScale] = useState(shownScale);
  const [position, setPosition] = useState<number | undefined>(undefined);
  const drag = useRef<Drag | undefined>(undefined);
  const drags = useRef(0);
  const lastLength = useRef<number | undefined>(undefined);
  /** The velocity of the last note touched, which the next note drawn takes. */
  const lastVelocity = useRef(DEFAULT_VELOCITY);
  const velocityDrag = useRef<{ name: string; base: ClipNote[]; indices: number[]; anchor: number } | undefined>(
    undefined,
  );
  /** The note whose velocity is being dragged, to show its value. */
  const [velocityShown, setVelocityShown] = useState<number | undefined>(undefined);
  const [height, setHeight] = useState(() => Math.min(panelHeight, maxHeight()));
  const resizing = useRef<{ y: number; height: number } | undefined>(undefined);
  const body = useRef<HTMLDivElement>(null);
  const keys = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  const [rowHeight, setRowHeight] = useState(shownRows.height);
  /** The width of a beat chosen by zooming, if any; otherwise the clip fills the panel, at BEAT_WIDTH at least. */
  const [beatZoom, setBeatZoom] = useState<number | undefined>(undefined);
  /** Where the roll scrolls to once a zoom is drawn, to keep what was under the pointer there. */
  const zoomScroll = useRef<{ left?: number; top?: number } | undefined>(undefined);
  const wheel = useRef<(event: WheelEvent) => void>(() => {});
  /** The note under the pointer, lit on the keys and across the roll. */
  const [hovered, setHovered] = useState<number | undefined>(undefined);
  /** The beat under the pointer, where the notes copied are pasted. */
  const pointerBeat = useRef<number | undefined>(undefined);
  const [selection, setSelection] = useState<Selection>({ text: "", indices: [] });
  const [box, setBox] = useState<{ from: ClipCell; to: ClipCell } | undefined>(undefined);
  const [hear, setHear] = useState(readHear);
  /** The note the clip is playing to be heard, and when it stops if it is not held. */
  const previewing = useRef<number | undefined>(undefined);
  const previewEnd = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const playingKey = useRef(false);
  const { held } = useContext(KeysContext);
  const [recording, setRecording] = useState(false);
  /** The notes held on the keys while recording, by key, with where the loop and the transport were. */
  const takes = useRef(new Map<string, { note: number; position: number; from: number }>());
  const lastHeld = useRef(held);
  /** Each recording is an undo step of its own, or a few when its notes are far apart. */
  const recordings = useRef(0);

  const definition = moduleRegistry.clip.params.find((param): param is ClipParamDefinition => param.kind === "clip")!;
  const params = node ? paramsInPattern(node, pattern) : {};
  const text = String(params[definition.id] ?? "");
  const notes = parseClip(text) ?? [];
  // A selection holds only while the notes are those it was made on: undo, or another pattern, drops it.
  const selected = selection.text === text ? selection.indices : [];
  const isSelected = new Set(selected);
  const bars = Number(params.bars ?? 1);
  const beats = bars * barBeats;
  // Zoomed out as far as it goes, the whole clip fits the panel.
  const fitWidth = Math.max(MIN_BEAT_WIDTH, Math.floor(room / beats));
  const beatWidth = clamp(beatZoom ?? Math.max(BEAT_WIDTH, fitWidth), fitWidth, MAX_BEAT_WIDTH);
  const view: ClipView = {
    beatWidth,
    rowHeight,
    lowest: definition.lowest,
    highest: definition.highest,
    beats,
  };
  const snapBeats = SNAPS[snap];
  const maxBars = maxClipBars(barBeats);
  const intervals = scale.scale === NO_SCALE ? undefined : SCALES[scale.scale];
  const tonic = ROOTS.indexOf(scale.root);
  /** Whether a note is in the scale lit, or its root, when there is one. */
  const degreeOf = (note: number) => {
    const interval = (note - tonic + 12) % 12;
    return intervals === undefined ? undefined : interval === 0 ? "root" : intervals.includes(interval) ? "in" : "out";
  };
  const rows = Array.from({ length: view.highest - view.lowest + 1 }, (_, index) => view.highest - index);

  const topNote = Math.max(MIDDLE_C + 7, ...notes.map((note) => note.note));
  const [openedAt] = useState(() => Math.max(0, (view.highest - topNote - 2) * rowHeight));
  useEffect(() => {
    body.current?.scrollTo?.({ top: openedAt });
  }, [openedAt]);

  // After a zoom, scrolls so that what was under the pointer is under it still.
  useLayoutEffect(() => {
    const element = body.current;
    const scroll = zoomScroll.current;
    zoomScroll.current = undefined;
    if (element && scroll) {
      if (scroll.left !== undefined) {
        element.scrollLeft = scroll.left;
      }
      if (scroll.top !== undefined) {
        element.scrollTop = scroll.top;
      }
    }
  }, [beatWidth, rowHeight]);

  /**
   * Zooms in time by `factor`, keeping the beat at `x` pixels into the panel where it is; the
   * middle of the roll when not given.
   */
  const zoomTime = (factor: number, x?: number) => {
    const element = body.current;
    const keysWidth = keys.current?.offsetWidth ?? 0;
    const at = x ?? keysWidth + (element ? (element.clientWidth - keysWidth) / 2 : 0);
    const next = clamp(beatWidth * factor, fitWidth, MAX_BEAT_WIDTH);
    if (element) {
      const beat = (element.scrollLeft + at - keysWidth) / beatWidth;
      zoomScroll.current = { left: Math.max(0, keysWidth + beat * next - at) };
    }
    setBeatZoom(next);
  };

  /** Makes the rows taller or shorter by `factor`, keeping the note at `y` pixels into the panel where it is. */
  const zoomRows = (factor: number, y: number) => {
    const element = body.current;
    // Whole pixels keep the rows sharp; a small step of the wheel still moves them by one.
    const rounded = Math.round(rowHeight * factor);
    const stepped = rounded === rowHeight ? rowHeight + Math.sign(factor - 1) : rounded;
    const next = clamp(stepped, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
    if (element) {
      const row = (element.scrollTop + y - RULER_HEIGHT) / rowHeight;
      zoomScroll.current = { top: Math.max(0, RULER_HEIGHT + row * next - y) };
    }
    shownRows.height = next;
    setRowHeight(next);
  };

  // Ctrl or Cmd and the wheel (a pinch on a trackpad) zoom in time, Alt and the wheel the rows.
  useEffect(() => {
    wheel.current = (event: WheelEvent) => {
      const element = body.current;
      if (!element || !(event.ctrlKey || event.metaKey || event.altKey)) {
        return;
      }
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM);
      if (event.altKey) {
        zoomRows(factor, event.clientY - rect.top);
      } else {
        zoomTime(factor, event.clientX - rect.left);
      }
    };
  });

  useEffect(() => {
    const element = body.current;
    const listener = (event: WheelEvent) => wheel.current(event);
    element?.addEventListener("wheel", listener, { passive: false });
    return () => element?.removeEventListener("wheel", listener);
  }, []);

  useEffect(() => {
    const element = body.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => setRoom(element.clientWidth - (keys.current?.offsetWidth ?? 0)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!engine) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      setPosition(engine.getPosition(nodeId));
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [engine, nodeId]);

  // Lets go of the note being heard when the piano roll closes.
  useEffect(
    () => () => {
      clearTimeout(previewEnd.current);
      if (previewing.current !== undefined) {
        engine?.stopPreview(nodeId);
      }
    },
    [engine, nodeId],
  );

  /** Plays a note until `preview(undefined)`, or for `milliseconds`; a note already sounding goes on. */
  const preview = (note: number | undefined, milliseconds?: number, velocity?: number) => {
    clearTimeout(previewEnd.current);
    if (note === undefined || !hear) {
      if (previewing.current !== undefined) {
        engine?.stopPreview(nodeId);
        previewing.current = undefined;
      }
      return;
    }
    if (note !== previewing.current) {
      engine?.previewNote(nodeId, note, velocity);
      previewing.current = note;
    }
    if (milliseconds !== undefined) {
      previewEnd.current = setTimeout(() => preview(undefined), milliseconds);
    }
  };

  /** Ends the notes held on the keys named, and writes them into the clip. */
  const endTakes = (keys: Iterable<string>) => {
    const to = engine?.getBeat();
    const finished: ClipNote[] = [];
    for (const key of keys) {
      const take = takes.current.get(key);
      takes.current.delete(key);
      if (take && to !== undefined) {
        finished.push(recordedNote(take.note, take.position, take.from, to, beats));
      }
    }
    if (finished.length > 0) {
      updateParamAt(path, definition.id, formatClip([...notes, ...finished]), {
        merge: `record-${recordings.current}`,
        pattern,
      });
    }
  };

  // While recording, a key pressed starts a note where the loop is, and letting it go writes it.
  useEffect(() => {
    const before = lastHeld.current;
    if (before === held) {
      return;
    }
    lastHeld.current = held;
    if (!recording) {
      return;
    }
    endTakes([...before].filter(([key, note]) => held.get(key) !== note).map(([key]) => key));
    for (const [key, note] of held) {
      const position = engine?.getPosition(nodeId);
      const from = engine?.getBeat();
      const inRange = note >= definition.lowest && note <= definition.highest;
      if (before.get(key) !== note && position !== undefined && from !== undefined && inRange) {
        takes.current.set(key, { note, position, from });
        preview(note);
      }
    }
    if (held.size === 0) {
      preview(undefined);
    }
  });

  if (!node) {
    return null;
  }

  const keyAt = (event: PointerEvent<HTMLDivElement>) => {
    const top = event.currentTarget.getBoundingClientRect().top + RULER_HEIGHT;
    const row = Math.floor((event.clientY - top) / rowHeight);
    return row < 0 || row >= rows.length ? undefined : rows[row];
  };

  const select = (indices: number[]) => setSelection({ text, indices });

  /** Writes the notes, as a single undo step with the other writes of the same `merge`, and selects some of them. */
  const save = (next: ClipNote[], chosen: number[], merge: string | false) => {
    const sorted = sortNotes(next, chosen);
    const written = formatClip(sorted.notes);
    if (written !== text) {
      updateParamAt(path, definition.id, written, { merge, pattern });
    }
    setSelection({ text: written, indices: sorted.selected });
  };

  const cellOf = (event: MouseEvent<HTMLElement>) =>
    clipCell(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY, view);

  const erase = (current: Drag, cell: ClipCell) => {
    const index = noteAt(current.base, cell.beat, cell.note);
    if (index !== undefined) {
      current.base = removeNotes(current.base, [index]);
      save(current.base, [], current.name);
    }
  };

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const cell = cellOf(event);
    const name = `clip-${++drags.current}`;
    const pointer = { x: event.clientX, y: event.clientY };
    const drawn = { name, base: notes, from: cell, pointer, moved: false };
    if (event.button === 2) {
      drag.current = { ...drawn, mode: "erase", indices: [], anchor: -1, moved: true };
      erase(drag.current, cell);
      return;
    }
    const index = noteAt(notes, cell.beat, cell.note);
    if (event.shiftKey) {
      if (index === undefined) {
        drag.current = { ...drawn, mode: "select", indices: [], anchor: -1, before: selected };
      } else {
        select(isSelected.has(index) ? selected.filter((chosen) => chosen !== index) : [...selected, index]);
      }
      return;
    }
    if (index === undefined) {
      const length = lastLength.current ?? snapBeats;
      const added = addNote(notes, cell.beat, cell.note, length, snapBeats, view, lastVelocity.current);
      drag.current = {
        ...drawn,
        mode: "resize",
        indices: [added.index],
        anchor: added.index,
        base: added.notes,
        length: added.notes[added.index].length,
      };
      save(added.notes, [added.index], name);
      preview(cell.note, undefined, lastVelocity.current);
      return;
    }
    const note = notes[index];
    lastVelocity.current = velocityOf(note);
    preview(note.note, undefined, velocityOf(note));
    const edge = Math.min(EDGE, (note.length * beatWidth) / 3);
    const nearEnd = !event.altKey && (note.start + note.length - cell.beat) * beatWidth <= edge;
    const indices = isSelected.has(index) ? selected : [index];
    if (!isSelected.has(index)) {
      select(indices);
    }
    const grabbed = { ...drawn, mode: nearEnd ? "resize" : "move", length: note.length } as const;
    if (event.altKey) {
      // The copies are the notes dragged, and the notes stay where they were.
      const copies = indices.map((chosen) => notes[chosen]);
      drag.current = {
        ...grabbed,
        base: [...notes, ...copies],
        indices: copies.map((_, copy) => notes.length + copy),
        anchor: notes.length + indices.indexOf(index),
      };
      return;
    }
    drag.current = { ...grabbed, indices, anchor: index, narrowTo: indices.length > 1 ? index : undefined };
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const cell = cellOf(event);
    setHovered(cell.note);
    pointerBeat.current = cell.beat;
    const current = drag.current;
    if (!current) {
      return;
    }
    if (!current.moved) {
      if (Math.hypot(event.clientX - current.pointer.x, event.clientY - current.pointer.y) < DRAG_THRESHOLD) {
        return;
      }
      current.moved = true;
    }
    if (current.mode === "erase") {
      erase(current, cell);
      return;
    }
    if (current.mode === "select") {
      setBox({ from: current.from, to: cell });
      select([...new Set([...(current.before ?? []), ...notesIn(notes, current.from, cell)])]);
      return;
    }
    const next =
      current.mode === "move"
        ? moveNotes(
            current.base,
            current.indices,
            { beats: cell.beat - current.from.beat, notes: cell.note - current.from.note },
            snapBeats,
            view,
          )
        : resizeNotes(current.base, current.indices, current.anchor, cell.beat, snapBeats, view);
    current.length = next[current.anchor].length;
    save(next, current.indices, current.name);
    if (current.mode === "move") {
      preview(next[current.anchor].note, undefined, velocityOf(next[current.anchor]));
    }
  };

  const stop = () => {
    const current = drag.current;
    if (current?.length !== undefined) {
      lastLength.current = current.length;
    }
    if (current?.narrowTo !== undefined && !current.moved) {
      select([current.narrowTo]);
    }
    drag.current = undefined;
    setBox(undefined);
    preview(undefined);
  };

  /**
   * The keys of the focused roll: Delete or Backspace takes the selected notes away, the arrows
   * move them a step of the grid or a semitone (with Shift, a bar or an octave), Escape lets them
   * go, and with Ctrl or Cmd, A selects them all, C copies, X cuts, V pastes where the pointer is
   * (or at the start) and D duplicates the selection after itself.
   */
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (command && !event.altKey && !event.shiftKey && ["a", "c", "x", "v", "d"].includes(key)) {
      handled();
      if (key === "a") {
        select(notes.map((_, index) => index));
      } else if (key === "v") {
        if (copiedNotes().length > 0) {
          const at = Math.floor((pointerBeat.current ?? 0) / snapBeats + 1e-4) * snapBeats;
          const pasted = pasteNotes(notes, copiedNotes(), at, view);
          save(pasted.notes, pasted.selected, false);
        }
      } else if (selected.length > 0) {
        if (key === "c" || key === "x") {
          keepCopiedNotes(copyNotes(notes, selected));
        }
        if (key === "x") {
          save(removeNotes(notes, selected), [], false);
        } else if (key === "d") {
          const duplicated = duplicateNotes(notes, selected, snapBeats, view);
          save(duplicated.notes, duplicated.selected, false);
        }
      }
      return;
    }
    if (command || event.altKey) {
      return;
    }
    if (event.key === "Escape" && selected.length > 0) {
      handled();
      select([]);
    } else if ((event.key === "Delete" || event.key === "Backspace") && selected.length > 0) {
      handled();
      save(removeNotes(notes, selected), [], false);
    } else if (event.key.startsWith("Arrow") && selected.length > 0) {
      handled();
      const across = event.shiftKey ? barBeats : snapBeats;
      const up = event.shiftKey ? 12 : 1;
      const by = {
        ArrowLeft: { beats: -across, notes: 0 },
        ArrowRight: { beats: across, notes: 0 },
        ArrowUp: { beats: 0, notes: up },
        ArrowDown: { beats: 0, notes: -up },
      }[event.key];
      if (by) {
        const moved = moveNotes(notes, selected, by, snapBeats, view);
        save(moved, selected, false);
        if (by.notes !== 0) {
          preview(moved[selected[0]].note, KEYED_PREVIEW, velocityOf(moved[selected[0]]));
        }
      }
    }
  };

  const resize = (to: number) => {
    const next = Math.round(Math.min(maxHeight(), Math.max(MIN_HEIGHT, to)));
    panelHeight = next;
    setHeight(next);
  };

  const resizeByKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const by = { ArrowUp: HEIGHT_STEP, ArrowDown: -HEIGHT_STEP }[event.key];
    if (by !== undefined) {
      event.preventDefault();
      resize(height + by);
    }
  };

  const chooseScale = (next: Partial<typeof scale>) => {
    Object.assign(shownScale, next);
    setScale({ ...shownScale });
  };

  const quantize = () => {
    const chosen = selected.length > 0 ? selected : notes.map((_, index) => index);
    save(quantizeNotes(notes, chosen, snapBeats, view), selected, false);
  };

  const doubleLoop = () =>
    updateParamsAt(path, { bars: bars * 2, [definition.id]: formatClip(duplicateLoop(notes, beats)) }, { pattern });

  /**
   * The velocity lane: pressing near the start of a note sets its velocity from the height, and
   * dragging changes it; the notes that start there together go along, or the notes selected
   * when it is one of them, each by as much. A drag is a single undo step.
   */
  const velocityDown = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const beat = (event.clientX - rect.left) / beatWidth;
    const found = notesStartingAt(notes, beat, VELOCITY_GRAB / beatWidth).filter((index) => notes[index].start < beats);
    if (event.button !== 0 || found.length === 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const anchor = found.find((index) => isSelected.has(index)) ?? found[0];
    const indices = isSelected.has(anchor) ? selected : found;
    velocityDrag.current = { name: `velocity-${++drags.current}`, base: notes, indices, anchor };
    velocityMove(event);
  };

  const velocityMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = velocityDrag.current;
    if (!current) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const to = velocityAt(event.clientY - rect.top, VELOCITY_HEIGHT);
    save(changeVelocities(current.base, current.indices, current.anchor, to), selected, current.name);
    lastVelocity.current = to;
    setVelocityShown(current.anchor);
  };

  const velocityUp = () => {
    velocityDrag.current = undefined;
    setVelocityShown(undefined);
  };

  const title = node.name ?? moduleRegistry.clip.title;
  const sounding = notes.filter((note) => note.start < beats);

  const exportMidi = () => {
    const bytes = writeMidi(sounding, { tempo, beats, name: title, signature: timeSignature(meter) });
    const name = `${title.replace(/[^\w-]+/g, "-").toLowerCase()}-${pattern}.mid`;
    downloadFile(new Blob([bytes], { type: "audio/midi" }), name);
  };

  /** Puts the notes of a MIDI file in the pattern edited, in place of its own, as one undo step. */
  const importMidi = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const read = readMidi(new Uint8Array(await file.arrayBuffer()));
      const maxRange = { lowest: definition.lowest, highest: definition.highest, maxBars, beatsPerBar: barBeats };
      const fitted = fitToClip(read.notes, maxRange, read.beats);
      if (fitted.notes.length === 0) {
        setMidiMessage(`${file.name} has no notes the clip can play`);
        return;
      }
      updateParamsAt(path, { bars: fitted.bars, [definition.id]: formatClip(fitted.notes) }, { pattern });
      const range = `${noteName(definition.lowest)}–${noteName(definition.highest)}`;
      setMidiMessage(
        fitted.left > 0 ? `${fitted.left} notes out of ${range} or past ${maxBars} bars were left out` : undefined,
      );
    } catch (cause) {
      setMidiMessage(cause instanceof MidiFormatError ? cause.message : `${file.name} is not a MIDI file`);
    }
  };

  return (
    <section className="clip-editor nokey" aria-label={`Clip ${node.name ?? node.id}`} style={{ height }}>
      <div
        className="clip-editor-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize piano roll"
        aria-valuenow={height}
        aria-valuemin={MIN_HEIGHT}
        tabIndex={0}
        onKeyDown={resizeByKeys}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          resizing.current = { y: event.clientY, height };
        }}
        onPointerMove={(event) => {
          if (resizing.current) {
            resize(resizing.current.height + resizing.current.y - event.clientY);
          }
        }}
        onPointerUp={() => (resizing.current = undefined)}
        onPointerCancel={() => (resizing.current = undefined)}
      />
      <header className="clip-editor-bar">
        <span className="clip-editor-title">{title}</span>
        <span className="clip-editor-pattern" aria-label="Pattern edited">
          Pattern {pattern}
        </span>
        {midiMessage && (
          <span role="alert" className="clip-editor-message">
            {midiMessage}
          </span>
        )}
        <label className="clip-editor-field">
          <span className="param-label">Scale</span>
          <select
            aria-label="Scale"
            value={scale.scale}
            onChange={(event) => chooseScale({ scale: event.target.value })}
          >
            {[NO_SCALE, ...SCALE_NAMES].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            aria-label="Root"
            value={scale.root}
            disabled={intervals === undefined}
            onChange={(event) => chooseScale({ root: event.target.value })}
          >
            {ROOTS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="clip-editor-field" role="group" aria-label="Zoom">
          <span className="param-label">Zoom</span>
          <button
            type="button"
            className="hw clip-editor-action"
            aria-label="Zoom out"
            title="Zoom out in time (Ctrl or Cmd and the wheel; Alt and the wheel for the rows)"
            disabled={beatWidth <= fitWidth}
            onClick={() => zoomTime(1 / ZOOM_STEP)}
          >
            −
          </button>
          <button
            type="button"
            className="hw clip-editor-action"
            aria-label="Zoom in"
            title="Zoom in in time (Ctrl or Cmd and the wheel; Alt and the wheel for the rows)"
            disabled={beatWidth >= MAX_BEAT_WIDTH}
            onClick={() => zoomTime(ZOOM_STEP)}
          >
            +
          </button>
          <button
            type="button"
            className="hw clip-editor-action"
            aria-label="Fit the clip"
            title="Show the whole clip"
            disabled={beatWidth <= fitWidth}
            onClick={() => {
              zoomScroll.current = { left: 0 };
              setBeatZoom(fitWidth);
            }}
          >
            Fit
          </button>
        </div>
        <label className="clip-editor-field">
          <span className="param-label">Snap</span>
          <select aria-label="Snap" value={snap} onChange={(event) => setSnap(event.target.value)}>
            {Object.keys(SNAPS).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="hw clip-editor-action"
          title="Move the start of the selected notes, or of all of them, to the grid"
          disabled={notes.length === 0}
          onClick={quantize}
        >
          Quantize
        </button>
        <button
          type="button"
          className="hw clip-editor-action"
          aria-label="Duplicate loop"
          title="Double the bars, with a copy of the notes"
          disabled={bars * 2 > maxBars}
          onClick={doubleLoop}
        >
          ×2
        </button>
        <button
          type="button"
          className="hw clip-editor-action"
          disabled={notes.length === 0}
          onClick={() => save([], [], false)}
        >
          Clear
        </button>
        <button
          type="button"
          className="hw clip-editor-action"
          aria-pressed={hear}
          title="Play the notes while they are edited"
          onClick={() => {
            saveHear(!hear);
            setHear(!hear);
          }}
        >
          <SoundIcon />
          Hear
        </button>
        <button
          type="button"
          className="hw clip-editor-action clip-editor-record"
          aria-label="Record notes"
          aria-pressed={recording}
          title={
            position === undefined && !recording
              ? "Start the audio to record"
              : "Add the notes played on the computer keys while the clip loops"
          }
          disabled={position === undefined && !recording}
          onClick={() => {
            if (recording) {
              endTakes([...takes.current.keys()]);
              preview(undefined);
            } else {
              recordings.current += 1;
            }
            setRecording(!recording);
          }}
        >
          <RecordIcon />
          Rec
        </button>
        <button
          type="button"
          className="hw clip-editor-action"
          aria-label="Import MIDI"
          title="Put the notes of a MIDI file in this pattern, in place of its own"
          onClick={() => midiInput.current?.click()}
        >
          <LoadIcon />
          MIDI
        </button>
        <button
          type="button"
          className="hw clip-editor-action"
          aria-label="Export MIDI"
          title="Save the notes of this pattern as a MIDI file"
          disabled={sounding.length === 0}
          onClick={exportMidi}
        >
          <SaveIcon />
          MIDI
        </button>
        <input
          ref={midiInput}
          type="file"
          accept="audio/midi,audio/x-midi,.mid,.midi"
          aria-label="Import MIDI file"
          hidden
          onChange={importMidi}
        />
        <button
          type="button"
          className="remove-badge clip-editor-close"
          aria-label="Close piano roll"
          onClick={() => openClipEditor(undefined)}
        >
          <RemoveIcon />
        </button>
      </header>
      <div
        className="clip-editor-body"
        ref={body}
        style={{
          ["--row" as string]: `${rowHeight}px`,
          ["--ruler" as string]: `${RULER_HEIGHT}px`,
          ["--velocity-lane" as string]: `${VELOCITY_HEIGHT}px`,
        }}
      >
        <div
          className="clip-keys"
          aria-hidden="true"
          data-testid="clip-keys"
          ref={keys}
          onPointerDown={(event) => {
            const note = keyAt(event);
            if (event.button === 0 && note !== undefined) {
              event.currentTarget.setPointerCapture(event.pointerId);
              playingKey.current = true;
              setHovered(note);
              preview(note);
            }
          }}
          onPointerMove={(event) => {
            const note = keyAt(event);
            setHovered(note);
            if (playingKey.current && note !== undefined) {
              preview(note);
            }
          }}
          onPointerUp={() => {
            playingKey.current = false;
            preview(undefined);
          }}
          onPointerCancel={() => {
            playingKey.current = false;
            preview(undefined);
          }}
          onPointerLeave={() => setHovered(undefined)}
        >
          <div className="clip-corner" />
          {rows.map((note) => (
            <div
              key={note}
              className="clip-key"
              data-black={BLACK_KEYS.has(note % 12) || undefined}
              data-degree={degreeOf(note)}
              data-hovered={note === hovered || undefined}
            >
              {noteName(note)}
            </div>
          ))}
          <div className="clip-corner clip-velocity-corner">Vel</div>
        </div>
        <div className="clip-lane">
          <div className="clip-ruler" aria-label="Bars" style={{ width: view.beats * beatWidth }}>
            {Array.from({ length: bars }, (_, bar) => (
              <span key={bar} className="clip-bar" style={{ left: bar * barBeats * beatWidth }}>
                {bar + 1}
              </span>
            ))}
          </div>
          <div
            className="clip-roll"
            role="application"
            aria-label="Piano roll"
            tabIndex={0}
            style={{
              width: view.beats * beatWidth,
              height: rows.length * rowHeight,
              ["--beat" as string]: `${beatWidth}px`,
              ["--bar" as string]: `${barBeats * beatWidth}px`,
              ["--pulse" as string]: `${pulseBeats(meter) * beatWidth}px`,
              ["--step" as string]: `${beatWidth * (snap === "Off" ? OFF_LINES : snapBeats)}px`,
            }}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
            onPointerLeave={() => {
              setHovered(undefined);
              pointerBeat.current = undefined;
            }}
            onKeyDown={keyDown}
            onContextMenu={(event) => event.preventDefault()}
            onDoubleClick={(event) => {
              const cell = cellOf(event);
              const index = noteAt(notes, cell.beat, cell.note);
              if (index !== undefined) {
                save(removeNotes(notes, [index]), [], false);
              }
            }}
          >
            {rows.map((note) => (
              <div
                key={note}
                className="clip-row"
                data-black={BLACK_KEYS.has(note % 12) || undefined}
                data-degree={degreeOf(note)}
                data-hovered={note === hovered || undefined}
              />
            ))}
            {Array.from({ length: bars }, (_, bar) =>
              groupStarts(meter).map((start) => (
                <span key={`${bar}-${start}`} className="clip-group-line" style={{ left: (bar * barBeats + start) * beatWidth }} />
              )),
            )}
            {notes.map((note, index) => (
              <div
                key={index}
                className="clip-note"
                data-outside={note.start >= view.beats || undefined}
                data-selected={isSelected.has(index) || undefined}
                style={{
                  left: note.start * beatWidth,
                  top: (view.highest - note.note) * rowHeight,
                  width: note.length * beatWidth,
                  ["--velocity" as string]: velocityOf(note) / MAX_VELOCITY,
                }}
              />
            ))}
            {box && (
              <div
                className="clip-box"
                data-testid="clip-box"
                style={{
                  left: Math.min(box.from.beat, box.to.beat) * beatWidth,
                  top: (view.highest - Math.max(box.from.note, box.to.note)) * rowHeight,
                  width: Math.abs(box.to.beat - box.from.beat) * beatWidth,
                  height: (Math.abs(box.to.note - box.from.note) + 1) * rowHeight,
                }}
              />
            )}
            {position !== undefined && (
              <div
                className="clip-playhead"
                data-testid="clip-playhead"
                style={{ transform: `translateX(${position * beatWidth}px)` }}
              />
            )}
          </div>
          <div
            className="clip-velocity"
            aria-label="Velocity"
            data-testid="clip-velocity"
            style={{ width: view.beats * beatWidth, ["--beat" as string]: `${beatWidth}px`, ["--bar" as string]: `${barBeats * beatWidth}px` }}
            onPointerDown={velocityDown}
            onPointerMove={velocityMove}
            onPointerUp={velocityUp}
            onPointerCancel={velocityUp}
          >
            {notes.map((note, index) =>
              note.start < beats ? (
                <div
                  key={index}
                  className="clip-velocity-bar"
                  data-selected={isSelected.has(index) || undefined}
                  style={{ left: note.start * beatWidth, height: `${(velocityOf(note) / MAX_VELOCITY) * 100}%` }}
                >
                  {velocityShown === index && <span className="clip-velocity-value">{velocityOf(note)}</span>}
                </div>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
