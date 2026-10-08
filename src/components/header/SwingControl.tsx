import { MAX_SWING, MIN_SWING, SWING_GRIDS, type SwingGrid } from "../../patch/types";
import { usePatchStore } from "../../store/usePatchStore";
import { useValueControl } from "../controls/useValueControl";

const SWING_RANGE = { min: MIN_SWING, max: MAX_SWING, step: 1, scale: "linear" } as const;

/**
 * The swing of the patch, on a display like the tempo's: drag it up or down, scroll it, use the
 * arrow keys or double-click it to type a value. Next to it, whether it swings the sixteenths or the eighths.
 */
export function SwingControl() {
  const swing = usePatchStore((state) => state.swing);
  const setSwing = usePatchStore((state) => state.setSwing);
  const swingGrid = usePatchStore((state) => state.swingGrid);
  const setSwingGrid = usePatchStore((state) => state.setSwingGrid);
  const { draft, setDraft, displayProps, inputProps } = useValueControl({
    value: swing,
    range: SWING_RANGE,
    onChange: setSwing,
  });

  return (
    <div className="tempo-screen swing-screen">
      {draft === null ? (
        <div
          {...displayProps}
          className="tempo-value swing-value"
          aria-label="Swing"
          aria-valuetext={`${swing} %`}
          title="Swing: holds back the sixteenths between the eighths, or the eighths between the beats. Drag, scroll or use the arrow keys; double-click to type"
        >
          {swing}%
        </div>
      ) : (
        <input
          {...inputProps}
          className="tempo-input swing-input"
          aria-label="Swing"
          inputMode="numeric"
          onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
        />
      )}
      <span className="swing-legend">
        <span className="tempo-unit">SWING</span>
        <select
          className="meter-value swing-grid"
          aria-label="Swing grid"
          title="Swing the sixteenths, or the eighths as in jazz"
          value={swingGrid}
          onChange={(event) => setSwingGrid(event.target.value as SwingGrid)}
        >
          {SWING_GRIDS.map((grid) => (
            <option key={grid} value={grid}>
              {grid}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}
