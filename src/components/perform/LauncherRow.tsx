import { useContext, useState } from "react";
import { bankOf, FIRST_SLOT, numberOf, PATTERN_BANKS, PATTERNS_PER_BANK, slotOf, STOP } from "../../patch/patterns";
import type { PatternBank } from "../../patch/types";
import { usePatchStoreApi } from "../../store/usePatchStore";
import { EngineContext } from "../EngineContext";
import { playPattern, soundingSlot, usePatternState } from "../sequencing/launch";
import { RemoveIcon } from "../RemoveIcon";

interface LauncherRowProps {
  /** The path of the node through the subpatches, which the engine and the song know it by. */
  path: string;
  name: string;
  onHide: () => void;
}

/**
 * The patterns of a node on the launcher: its banks and the eight patterns of the bank shown, the
 * one of the pattern playing until another is picked. A click plays a pattern, as a double-click
 * does on the node, and so writes it into the song with Rec.
 */
export function LauncherRow({ path, name, onHide }: LauncherRowProps) {
  const engine = useContext(EngineContext);
  const store = usePatchStoreApi();
  const state = usePatternState(engine, path);
  const sounding = soundingSlot(state);
  const [picked, setPicked] = useState<PatternBank | undefined>(undefined);
  const bank = picked ?? bankOf(state?.playing ?? FIRST_SLOT);

  return (
    <div className="perform-launch" role="group" aria-label={`Patterns of ${name}`}>
      <span className="perform-launch-name" title={name}>
        {name}
      </span>
      <div className="pattern-pads perform-launch-banks" role="group" aria-label="Banks">
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
            onClick={() => setPicked(shown)}
          >
            <span className="pattern-led" aria-hidden="true" />
            {shown}
          </button>
        ))}
      </div>
      <div className="pattern-pads perform-launch-pads" data-bank={bank}>
        {Array.from({ length: PATTERNS_PER_BANK }, (_, index) => slotOf(bank, index + 1)).map((slot) => (
          <button
            key={slot}
            type="button"
            className="pattern-slot"
            aria-label={`Pattern ${slot}`}
            title="Click to play"
            data-playing={sounding === slot || undefined}
            data-queued={state?.queued === slot || undefined}
            onClick={() => playPattern(store, engine, path, path, slot)}
          >
            <span className="pattern-led" aria-hidden="true" />
            {numberOf(slot)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="remove-badge perform-remove perform-launch-hide"
        aria-label={`Hide ${name}`}
        title="Hide this node from the launcher"
        onClick={onHide}
      >
        <RemoveIcon />
      </button>
    </div>
  );
}
