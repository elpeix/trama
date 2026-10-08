import { useContext, useEffect, useRef } from "react";
import { beatAccent, pulseBeats } from "../../patch/meter";
import { MAX_TEMPO, MIN_TEMPO } from "../../patch/types";
import { usePatchStore } from "../../store/usePatchStore";
import { EngineContext } from "../EngineContext";
import { TapTempo } from "./tapTempo";
import { useValueControl } from "../controls/useValueControl";

const TEMPO_RANGE = { min: MIN_TEMPO, max: MAX_TEMPO, step: 1, scale: "linear" } as const;
/** How long the beat light stays on, as a fraction of a pulse. */
const FLASH = 0.15;

/**
 * The tempo of the patch, shown like the display of a hardware synth: drag it up or down, scroll
 * it, use the arrow keys, double-click it to type a value, or tap the tempo. A light flashes on
 * every beat while the sound runs, brighter on the first beat of each bar, and of each group of
 * beats of the meter.
 */
export function TempoControl() {
  const engine = useContext(EngineContext);
  const tempo = usePatchStore((state) => state.tempo);
  const meter = usePatchStore((state) => state.meter);
  const setTempo = usePatchStore((state) => state.setTempo);
  const light = useRef<HTMLSpanElement>(null);
  const tapper = useRef(new TapTempo());
  const { draft, setDraft, displayProps, inputProps } = useValueControl({
    value: tempo,
    range: TEMPO_RANGE,
    onChange: setTempo,
  });

  useEffect(() => {
    const element = light.current;
    if (!engine || !element) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      const beat = engine.getBeat();
      const pulse = pulseBeats(meter);
      const flashing = beat !== undefined && beat % pulse < FLASH * pulse;
      element.dataset.beat = !flashing ? "off" : beatAccent(beat, meter);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [engine, meter]);

  const tap = () => {
    const tapped = tapper.current.tap(performance.now());
    if (tapped !== undefined) {
      setTempo(tapped);
    }
  };

  return (
    <div className="tempo hw-group">
      <div className="tempo-screen">
        <span ref={light} className="tempo-light" data-beat="off" aria-hidden="true" />
        {draft === null ? (
          <div
            {...displayProps}
            className="tempo-value"
            aria-label="Tempo"
            aria-valuetext={`${tempo} BPM`}
            title="Drag up or down, scroll or use the arrow keys; double-click to type"
          >
            {tempo}
          </div>
        ) : (
          <input
            {...inputProps}
            className="tempo-input"
            aria-label="Tempo"
            inputMode="numeric"
            onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          />
        )}
        <span className="tempo-unit">BPM</span>
      </div>
      <button type="button" className="hw tempo-tap" title="Tap a few times to set the tempo" onClick={tap}>
        Tap
      </button>
    </div>
  );
}
