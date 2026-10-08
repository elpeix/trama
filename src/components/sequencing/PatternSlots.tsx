import { useContext } from "react";
import { bankOf, numberOf, PATTERN_BANKS, PATTERNS_PER_BANK, slotOf, STOP } from "../../patch/patterns";
import type { SelectParamDefinition } from "../../patch/registry";
import type { PatternSlot } from "../../patch/types";
import { usePatchStoreApi } from "../../store/usePatchStore";
import { EngineContext } from "../EngineContext";
import { playPattern, soundingSlot, usePatternState } from "./launch";

interface PatternSlotsProps {
  nodeId: string;
  editing: PatternSlot;
  onEdit: (slot: PatternSlot) => void;
  launch: SelectParamDefinition;
  launchMode: string;
  onLaunchMode: (mode: string) => void;
  /** The path the song knows the node by; that of the node in the graph on show unless told. */
  songPath?: string;
}

/**
 * The patterns of a node, in four banks of eight: a bank shows its eight, click one to edit it,
 * double-click it to play it. The one playing is lit, and the one launched blinks until it takes
 * over; so do their banks. With the Rec of the song on,
 * playing one writes it into the song: on the bar of the cursor while the song is stopped, or on
 * the next bar, launched for it, while it plays.
 */
export function PatternSlots({ nodeId, editing, onEdit, launch, launchMode, onLaunchMode, songPath }: PatternSlotsProps) {
  const engine = useContext(EngineContext);
  const store = usePatchStoreApi();
  const state = usePatternState(engine, nodeId);
  const sounding = soundingSlot(state);

  const play = (slot: PatternSlot) =>
    playPattern(store, engine, nodeId, songPath ?? [...store.getState().path, nodeId].join("/"), slot);

  const bank = bankOf(editing);

  return (
    <div className="patterns nodrag" role="group" aria-label="Patterns">
      <div className="pattern-row">
        <div className="pattern-pads pattern-banks" role="group" aria-label="Banks">
          {PATTERN_BANKS.map((shown) => (
            <button
              key={shown}
              type="button"
              className="pattern-slot pattern-bank"
              aria-label={`Bank ${shown}`}
              data-bank={shown}
              aria-pressed={shown === bank}
              title="Show the eight patterns of this bank"
              data-playing={(sounding && bankOf(sounding) === shown) || undefined}
              data-queued={(state?.queued && state.queued !== STOP && bankOf(state.queued) === shown) || undefined}
              onClick={() => onEdit(slotOf(shown, numberOf(editing)))}
            >
              <span className="pattern-led" aria-hidden="true" />
              {shown}
            </button>
          ))}
        </div>
        <select
          className="pattern-launch"
          aria-label={launch.label}
          title="When a pattern launched takes over"
          value={launchMode}
          onChange={(event) => onLaunchMode(event.target.value)}
        >
          {launch.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="pattern-pads pattern-grid" data-bank={bank}>
        {Array.from({ length: PATTERNS_PER_BANK }, (_, index) => slotOf(bank, index + 1)).map((slot) => (
          <button
            key={slot}
            type="button"
            className="pattern-slot"
            aria-label={`Pattern ${slot}`}
            aria-pressed={slot === editing}
            title="Click to edit, double-click to play"
            data-playing={sounding === slot || undefined}
            data-queued={state?.queued === slot || undefined}
            onClick={() => onEdit(slot)}
            onDoubleClick={() => play(slot)}
          >
            <span className="pattern-led" aria-hidden="true" />
            {numberOf(slot)}
          </button>
        ))}
      </div>
    </div>
  );
}
