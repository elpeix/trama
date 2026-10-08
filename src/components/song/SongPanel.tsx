import { useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { controlLabel } from "../../patch/automation";
import {
  cellAt,
  cyclePattern,
  emptySong,
  laneOf,
  MAX_SONG_BARS,
  MIN_SONG_BARS,
  patternPaths,
  rowCells,
  slotAt,
  typedCell,
} from "../../patch/song";
import { bankOf, FIRST_SLOT, STOP } from "../../patch/patterns";
import type { PatternSlot } from "../../patch/types";
import { useShallow } from "zustand/react/shallow";
import { usePatchStore, usePatchStoreApi } from "../../store/usePatchStore";
import { songControlAt } from "../../patch/songControls";
import { EngineContext } from "../EngineContext";
import { LoopIcon, RecordIcon } from "../header/icons";
import { NumberScreen } from "../controls/NumberScreen";
import { ActionsMenu } from "./ActionsMenu";
import { ControlMenu } from "./ControlMenu";
import { LaneRow } from "./LaneRow";
import { PanelFullscreenButton } from "./PanelFullscreenButton";
import { PanelTabs } from "./PanelTabs";
import { RemoveIcon } from "../RemoveIcon";
import { themeStorage } from "../../theme/useTheme";
import { followScroll } from "./follow";
import { useTooltip } from "../useTooltip";

const DEFAULT_LOOP_BARS = 4;

export const SONG_FOLLOW_KEY = "trama:song-follow";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const readFollow = (storage: Storage | undefined) => {
  try {
    return storage?.getItem(SONG_FOLLOW_KEY) !== "off";
  } catch {
    return true;
  }
};

const saveFollow = (storage: Storage | undefined, on: boolean) => {
  try {
    storage?.setItem(SONG_FOLLOW_KEY, on ? "on" : "off");
  } catch {
    return;
  }
};

const follow = (grid: HTMLTableElement, bar: number) => {
  const body = grid.parentElement;
  const header = grid.tHead?.rows[0];
  const button = header?.cells[bar + 1]?.firstElementChild;
  if (!body || !header || !button) {
    return;
  }
  const rect = button.getBoundingClientRect();
  const scrollLeft = followScroll(
    { scrollLeft: body.scrollLeft, width: body.clientWidth, names: header.cells[0].getBoundingClientRect().width },
    { left: rect.left - body.getBoundingClientRect().left + body.scrollLeft, width: rect.width },
  );
  if (scrollLeft !== undefined) {
    body.scrollLeft = scrollLeft;
  }
};

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * The song bar by bar: a row for each node with patterns, a column for each bar. A click on a cell
 * goes through A, B, C, D and a dash, and a right click leaves a dash; a dash goes on with what
 * sounds, shown faint. The bar numbers move the cursor the song plays from in song mode, and the
 * bar that plays is lit and, with Follow on, kept in sight.
 */
export function SongPanel({ storage = themeStorage() }: { storage?: Storage }) {
  const engine = useContext(EngineContext);
  const stored = usePatchStore((state) => state.song);
  const songRec = usePatchStore((state) => state.songRec);
  const cursor = usePatchStore((state) => state.songCursor);
  const setSongCell = usePatchStore((state) => state.setSongCell);
  const setSongLength = usePatchStore((state) => state.setSongLength);
  const setSongFade = usePatchStore((state) => state.setSongFade);
  const setSongLoop = usePatchStore((state) => state.setSongLoop);
  const initializeSong = usePatchStore((state) => state.initializeSong);
  const setSongRec = usePatchStore((state) => state.setSongRec);
  const setSongCursor = usePatchStore((state) => state.setSongCursor);
  const openSongPanel = usePatchStore((state) => state.openSongPanel);
  const touched = usePatchStore((state) => state.songTouched);
  const copyControls = usePatchStore((state) => state.copyControls);
  const removeLane = usePatchStore((state) => state.removeLane);
  const setControlPoint = usePatchStore((state) => state.setControlPoint);
  const store = usePatchStoreApi();
  const [playing, setPlaying] = useState<number | undefined>(undefined);
  const grid = useRef<HTMLTableElement>(null);
  const [following, setFollowing] = useState(() => readFollow(storage));
  const { triggerProps: followTrigger, tooltip: followTooltip } = useTooltip(
    <>
      <strong>Follow: {following ? "On" : "Off"}</strong>
      <br />
      While the song plays, the grid turns the page to the bar that plays when it goes out of sight.
    </>,
  );

  const song = stored ?? emptySong();
  const rowNames = usePatchStore(
    useShallow((state) => patternPaths(state.toPatch()).flatMap(({ path, names }) => [path, names.join(" › ")])),
  );
  const rows = useMemo(
    () => Array.from({ length: rowNames.length / 2 }, (_, row) => ({ path: rowNames[2 * row], name: rowNames[2 * row + 1] })),
    [rowNames],
  );
  const laneLabels = usePatchStore(
    useShallow((state) => Object.keys(state.song?.automation ?? {}).map((key) => controlLabel(state.toPatch(), key))),
  );
  const lanes = useMemo(
    () =>
      Object.keys(song.automation ?? {}).map((key, index) => ({
        key,
        label: laneLabels[index] ?? key,
        points: laneOf(song, key),
      })),
    [song, laneLabels],
  );
  const hasTouched = Object.keys(touched).length > 0;
  const bars = Array.from({ length: song.bars }, (_, bar) => bar);
  const inLoop = (bar: number) => song.loop !== undefined && bar >= song.loop.start && bar < song.loop.start + song.loop.length;

  useEffect(() => {
    if (!engine) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      setPlaying(engine.getSongBar());
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [engine]);

  useEffect(() => {
    if (following && playing !== undefined && grid.current) {
      follow(grid.current, playing);
    }
  }, [following, playing]);

  const fromPatterns = () => {
    initializeSong(
      Object.fromEntries(rows.map(({ path }) => [path, engine?.getPattern(path)?.playing ?? FIRST_SLOT])) as Record<string, PatternSlot>,
    );
  };

  const typeOnCell = (event: KeyboardEvent<HTMLButtonElement>, path: string, row: number, bar: number) => {
    const step = ARROWS[event.key];
    if (step) {
      grid.current?.querySelector<HTMLButtonElement>(`[data-row="${row + step[0]}"][data-bar="${bar + step[1]}"]`)?.focus();
    } else {
      const cell = cellAt(song, path, bar);
      const next = typedCell(cell, event.key, slotAt(song, path, bar));
      if (next === cell) {
        return;
      }
      setSongCell(path, bar, next ?? undefined);
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const addLane = (key: string) => {
    const info = songControlAt(store.getState().toPatch(), key);
    if (info) {
      setControlPoint(key, 0, info.value);
    }
  };

  const toggleLoop = () => {
    setSongLoop(song.loop ? undefined : { start: cursor, length: DEFAULT_LOOP_BARS });
  };

  return (
    <section className="clip-editor song-panel nokey" aria-label="Song panel">
      <header className="clip-editor-bar">
        <PanelTabs />
        <div className="song-bar-group">
          <button
            type="button"
            className="hw clip-editor-action song-rec"
            aria-pressed={songRec}
            title="Write into the song the patterns launched and, in song mode, the knobs moved: on the cursor while stopped, as it plays otherwise"
            onClick={() => setSongRec(!songRec)}
          >
            <RecordIcon />
            Rec
          </button>
        </div>
        <div className="clip-editor-field song-bar-group" role="group" aria-label="Position">
          <button
            type="button"
            className="hw clip-editor-action"
            aria-label="Previous bar"
            disabled={cursor === 0}
            onClick={() => setSongCursor(cursor - 1)}
          >
            ‹
          </button>
          <output className="song-cursor" aria-label="Cursor">
            {cursor + 1}
          </output>
          <button
            type="button"
            className="hw clip-editor-action"
            aria-label="Next bar"
            disabled={cursor === song.bars - 1}
            onClick={() => setSongCursor(cursor + 1)}
          >
            ›
          </button>
        </div>
        <div className="song-bar-group">
          <button
            {...followTrigger}
            type="button"
            className="hw clip-editor-action"
            aria-pressed={following}
            onClick={() => {
              saveFollow(storage, !following);
              setFollowing(!following);
            }}
          >
            Follow
          </button>
          {followTooltip}
        </div>
        <div className="song-bar-group">
          <div className="clip-editor-field">
            <span className="param-label">Bars</span>
            <NumberScreen
              label="Bars"
              title="How long the song is"
              value={song.bars}
              min={MIN_SONG_BARS}
              max={MAX_SONG_BARS}
              onChange={setSongLength}
            />
          </div>
          <div className="clip-editor-field">
            <span className="param-label">Fade</span>
            <NumberScreen
              label="Fade"
              title={
                song.loop
                  ? "Bars fading out at the end; none while the loop goes round, as the song does not end"
                  : "Bars fading out to silence at the end of the song; 0 for none"
              }
              value={song.fade ?? 0}
              min={0}
              max={song.bars}
              onChange={setSongFade}
            />
          </div>
        </div>
        <div className="clip-editor-field song-bar-group" role="group" aria-label="Loop">
          <button
            type="button"
            className="hw clip-editor-action"
            aria-pressed={song.loop !== undefined}
            title="Play a stretch of the song over and over"
            onClick={toggleLoop}
          >
            <LoopIcon />
            Loop
          </button>
          {song.loop && (
            <>
              <span className="param-label">From</span>
              <NumberScreen
                label="Loop start"
                title="The bar the loop starts on"
                value={song.loop.start + 1}
                min={1}
                max={song.bars}
                onChange={(bar) => setSongLoop({ ...song.loop!, start: bar - 1 })}
              />
              <span className="param-label">Length</span>
              <NumberScreen
                label="Loop length"
                title="The bars the loop lasts"
                value={song.loop.length}
                min={1}
                max={song.bars - song.loop.start}
                onChange={(length) => setSongLoop({ ...song.loop!, length })}
              />
            </>
          )}
        </div>
        <div className="song-bar-group">
          <ControlMenu onChoose={addLane} />
          <ActionsMenu
            label="Song actions"
            actions={[
              {
                label: "From patterns",
                title: "Start the song again from the pattern each node plays now",
                onSelect: fromPatterns,
              },
              {
                label: "Copy to loop",
                title: "Hold the controls touched with Rec on their last value over the loop",
                disabled: !hasTouched || !song.loop,
                onSelect: () => copyControls(touched, "loop"),
              },
              {
                label: "Copy to song",
                title: "Hold the controls touched with Rec on their last value over the whole song",
                disabled: !hasTouched,
                onSelect: () => copyControls(touched, "song"),
              },
            ]}
          />
        </div>
        <PanelFullscreenButton />
        <button type="button" className="remove-badge clip-editor-close" aria-label="Close song" onClick={() => openSongPanel(false)}>
          <RemoveIcon />
        </button>
      </header>
      <div className="clip-editor-body song-body">
        {rows.length === 0 && lanes.length === 0 && (
          <p className="song-empty">
            Add a Seq, an Arp, Drums or a Clip to write a song with their patterns, or record knobs with Rec in song mode.
          </p>
        )}
        <table ref={grid} className="song-grid" aria-label="Song">
          <thead>
            <tr>
              <th className="song-corner" />
              {bars.map((bar) => (
                <th key={bar} scope="col">
                  <button
                    type="button"
                    className="song-bar"
                    aria-label={`Bar ${bar + 1}`}
                    data-cursor={bar === cursor || undefined}
                    data-playing={bar === playing || undefined}
                    data-loop={inLoop(bar) || undefined}
                    onClick={() => setSongCursor(bar)}
                  >
                    {bar + 1}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ path, name }, row) => {
              const cells = rowCells(song, path);
              return (
                <tr key={path}>
                  <th scope="row" className="song-row-name" title={path}>
                    {name}
                  </th>
                  {bars.map((bar) => {
                    const { cell, sounding: playsOn } = cells[bar];
                    const sounding = cell === undefined ? playsOn : undefined;
                    const held = sounding === STOP ? undefined : sounding;
                    const shown = cell ?? held;
                    return (
                      <td key={bar} data-cursor={bar === cursor || undefined} data-playing={bar === playing || undefined}>
                        <button
                          type="button"
                          className="song-cell"
                          aria-label={`${name}, bar ${bar + 1}`}
                          title="Click for the next pattern of the bank; type a bank A to D, a number 1 to 8, a dot to stop the node, or a dash"
                          data-row={row}
                          data-bar={bar}
                          data-held={held !== undefined || undefined}
                          data-stop={cell === STOP || undefined}
                          data-bank={shown && shown !== STOP ? bankOf(shown) : undefined}
                          onKeyDown={(event) => typeOnCell(event, path, row, bar)}
                          onClick={() => setSongCell(path, bar, cyclePattern(cell))}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setSongCell(path, bar, undefined);
                          }}
                        >
                          {shown ?? ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {lanes.map(({ key, label, points }, index) => (
              <LaneRow
                key={key}
                laneKey={key}
                label={label}
                points={points}
                bars={song.bars}
                row={rows.length + index}
                cursor={cursor}
                playing={playing}
                onRemove={() => removeLane(key)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
