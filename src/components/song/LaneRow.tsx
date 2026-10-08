import { useMemo, type CSSProperties, type KeyboardEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { pointsIn, valueAt, type AutomationPoint, type ControlKey } from "../../patch/automation";
import { beatsPerBar } from "../../patch/meter";
import { songControlAt, type SongControlInfo } from "../../patch/songControls";
import { usePatchStore } from "../../store/usePatchStore";
import { formatParam, parseParam, toSliderPosition } from "../controls/scale";
import { useValueControl } from "../controls/useValueControl";
import { formatPan, parsePan } from "../displays/pan";

const fullValue = (value: number, { kind, definition }: SongControlInfo) =>
  kind === "pan" ? formatPan(value) : formatParam(value, definition);

const shortValue = (value: number, info: SongControlInfo) => {
  if (info.kind !== "knob" || info.definition.valueNames) {
    return fullValue(value, info);
  }
  return Math.abs(value) >= 1000 ? `${Number((value / 1000).toPrecision(2))}k` : String(Number(value.toPrecision(3)));
};

interface LaneCellProps {
  label: string;
  row: number;
  bar: number;
  info: SongControlInfo;
  /** The value the song gives the control in the bar; undefined before its first point. */
  shown: number | undefined;
  moves: boolean;
  cursor: boolean;
  playing: boolean;
  onChange: (value: number) => void;
  onClear: () => void;
}

const MOVES: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };

function LaneCell({ label, row, bar, info, shown, moves, cursor, playing, onChange, onClear }: LaneCellProps) {
  const value = shown ?? info.value;
  const { definition } = info;
  const { draft, setDraft, displayProps, inputProps } = useValueControl({
    value,
    range: definition,
    onChange,
    parse: (text) => (info.kind === "pan" ? parsePan(text) : parseParam(text, definition)),
  });
  const name = `${label}, bar ${bar + 1}`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = MOVES[event.key];
    if (step !== undefined) {
      event.preventDefault();
      event.currentTarget
        .closest("table")
        ?.querySelector<HTMLElement>(`[data-row="${row}"][data-bar="${bar + step}"]`)
        ?.focus();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onClear();
    } else {
      displayProps.onKeyDown(event);
    }
  };

  return (
    <td data-points={moves || undefined} data-cursor={cursor || undefined} data-playing={playing || undefined}>
      {draft === null ? (
        <div
          {...displayProps}
          className="song-cell song-lane-cell"
          aria-label={name}
          aria-valuetext={fullValue(value, info)}
          title={`${fullValue(value, info)}. Drag, scroll or use the up and down keys to set it on the first beat of the bar; double-click to type; right-click or Delete clears the bar`}
          data-row={row}
          data-bar={bar}
          data-points={moves || undefined}
          data-held={(shown !== undefined && !moves) || undefined}
          style={shown === undefined ? undefined : ({ "--fill": toSliderPosition(shown, definition) } as CSSProperties)}
          onKeyDown={onKeyDown}
          onContextMenu={(event) => {
            event.preventDefault();
            onClear();
          }}
        >
          {shown === undefined ? "" : shortValue(shown, info)}
        </div>
      ) : (
        <input
          {...inputProps}
          className="song-lane-input"
          aria-label={name}
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
    </td>
  );
}

interface LaneRowProps {
  laneKey: ControlKey;
  label: string;
  points: readonly AutomationPoint[];
  bars: number;
  row: number;
  cursor: number;
  playing: number | undefined;
  onRemove: () => void;
}

/**
 * A control the song moves, with the value it has on each bar: on its first beat, or where the bar
 * first sets it, faint where it is held from before. Each value is set like a small screen, on the
 * first beat of its bar.
 */
export function LaneRow({ laneKey, label, points, bars, row, cursor, playing, onRemove }: LaneRowProps) {
  const control = usePatchStore(
    useShallow((state) => {
      const info = songControlAt(state.toPatch(), laneKey);
      return { kind: info?.kind, value: info?.value, definition: info?.definition };
    }),
  );
  const barBeats = usePatchStore((state) => beatsPerBar(state.meter));
  const setControlPoint = usePatchStore((state) => state.setControlPoint);
  const clearControlPoints = usePatchStore((state) => state.clearControlPoints);
  const info = useMemo(
    () => (control.kind && control.definition ? ({ kind: control.kind, value: control.value!, definition: control.definition } as SongControlInfo) : undefined),
    [control.kind, control.value, control.definition],
  );

  return (
    <tr className="song-lane">
      <th scope="row" className="song-row-name" title={laneKey}>
        <span className="song-lane-name">{label}</span>
        <button
          type="button"
          className="song-lane-remove"
          aria-label={`Remove ${label}`}
          title="Take this control out of the song"
          onClick={onRemove}
        >
          ×
        </button>
      </th>
      {Array.from({ length: bars }, (_, bar) => {
        const start = bar * barBeats;
        const inBar = pointsIn(points, start, start + barBeats);
        const shown = valueAt(points, start) ?? inBar[0]?.value;
        const flags = { cursor: bar === cursor, playing: bar === playing };
        return info ? (
          <LaneCell
            key={bar}
            label={label}
            row={row}
            bar={bar}
            info={info}
            shown={shown}
            moves={inBar.length > 0}
            {...flags}
            onChange={(value) => setControlPoint(laneKey, start, value)}
            onClear={() => clearControlPoints(laneKey, start, start + barBeats)}
          />
        ) : (
          <td key={bar} data-points={inBar.length > 0 || undefined} data-cursor={flags.cursor || undefined} data-playing={flags.playing || undefined} />
        );
      })}
    </tr>
  );
}
