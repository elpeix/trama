import { useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import type { BeatAccent } from "../../patch/meter";
import type { RhythmParamDefinition } from "../../patch/registry";
import { formatRhythmSteps, lowerChance, parseRhythmSteps, type RhythmStep } from "../../patch/sequence";
import { EngineContext } from "../EngineContext";

interface RhythmRowProps {
  nodeId: string;
  definition: RhythmParamDefinition;
  value: string;
  length: number;
  /** Whether the row shows its name, when it is one of several. */
  named?: boolean;
  /** What starts on each step: a bar, a group of beats of the meter, a beat, or nothing. */
  accents?: readonly (BeatAccent | undefined)[];
  onChange: (value: string, options?: { merge?: boolean | string }) => void;
}

const times = (retrig: number | undefined) => (retrig ? `, ${retrig} times within the step` : "");
const MAX_RETRIG = 4;

/** The step with one more retrig, or sounding once again after the most. */
const withNextRetrig = ({ retrig = 1, ...step }: RhythmStep): RhythmStep =>
  retrig < MAX_RETRIG ? { ...step, retrig: retrig + 1 } : step;

/**
 * A row of steps that sound or stay silent: click one to switch it, or drag across the row to
 * switch several the way the first one went. The whole drag is a single undo step, and the steps
 * beyond the length are dimmed. In a row with chances, a right click on a step that sounds lowers
 * its chance a quarter at a time, and the step is filled as much as its chance. In a row with
 * retrigs, a Shift-click on a step that sounds plays it 2, 3 or 4 times within itself, the step
 * split in a part for each time.
 */
export function RhythmRow({ nodeId, definition, value, length, named = false, accents = [], onChange }: RhythmRowProps) {
  const engine = useContext(EngineContext);
  const painting = useRef<{ sounds: boolean; steps: RhythmStep[]; name: string } | undefined>(undefined);
  const drags = useRef(0);
  const [position, setPosition] = useState<number | undefined>(undefined);
  const steps: RhythmStep[] =
    parseRhythmSteps(value) ?? Array.from({ length: definition.steps }, () => ({ sounds: true }));

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

  useEffect(() => {
    const stop = () => {
      painting.current = undefined;
    };
    globalThis.addEventListener("pointerup", stop);
    globalThis.addEventListener("pointercancel", stop);
    return () => {
      globalThis.removeEventListener("pointerup", stop);
      globalThis.removeEventListener("pointercancel", stop);
    };
  }, []);

  const toggle = (step: number) => {
    onChange(
      formatRhythmSteps(steps.map((current, index) => (index === step ? { sounds: !current.sounds } : current))),
    );
  };

  const paint = (step: number, first: boolean) => {
    const drag = first ? { sounds: !steps[step].sounds, steps, name: `drag-${++drags.current}` } : painting.current;
    if (!drag || drag.steps[step].sounds === drag.sounds) {
      return;
    }
    const next = drag.steps.map((current, index) => (index === step ? { sounds: drag.sounds } : current));
    painting.current = { ...drag, steps: next };
    onChange(formatRhythmSteps(next), { merge: drag.name });
  };

  const cycleRetrig = (step: number) => {
    onChange(formatRhythmSteps(steps.map((current, index) => (index === step ? withNextRetrig(current) : current))));
  };

  const retrigs = (step: number, shiftKey: boolean) => shiftKey && definition.retrig === true && steps[step].sounds;
  const shiftHint = definition.retrig ? ", Shift-click to play it 2 to 4 times within the step" : "";

  const lower = (step: number) => {
    onChange(
      formatRhythmSteps(
        steps.map((current, index) => (index === step ? { ...current, sounds: true, chance: lowerChance(current.chance) } : current)),
      ),
    );
  };

  return (
    <div className={`rhythm nodrag${named ? " rhythm-named" : ""}`} role="group" aria-label={definition.label}>
      {named && <span className="rhythm-label">{definition.label}</span>}
      {steps.map(({ sounds, chance = 100, retrig }, step) => (
        <button
          key={step}
          type="button"
          className={[
            "rhythm-step",
            sounds && "rhythm-step-on",
            sounds && definition.chance && chance < 100 && "rhythm-step-chance",
            step >= length && "rhythm-step-off",
            step === position && "rhythm-step-playing",
            accents[step] === "beat" && "rhythm-step-beat",
            (accents[step] === "bar" || accents[step] === "group") && "rhythm-step-group",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={`Step ${step + 1}`}
          aria-pressed={sounds}
          data-retrig={retrig}
          {...(definition.chance &&
            sounds && {
              title:
                chance < 100
                  ? `Sounds ${chance}% of the time${times(retrig)}; right-click for less, or always after 25%${shiftHint}`
                  : `Always sounds${times(retrig)}; right-click to make it sound less often${shiftHint}`,
              style: { "--chance": chance / 100 } as CSSProperties,
            })}
          onContextMenu={(event) => {
            if (definition.chance) {
              event.preventDefault();
              if (sounds) {
                lower(step);
              }
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || event.shiftKey) {
              return;
            }
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            paint(step, true);
          }}
          onPointerEnter={(event) => {
            if ((event.buttons & 1) === 1) {
              paint(step, false);
            }
          }}
          onClick={(event) => {
            if (retrigs(step, event.shiftKey)) {
              cycleRetrig(step);
            } else if (event.detail === 0 || event.shiftKey) {
              toggle(step);
            }
          }}
        >
          {sounds && retrig && (
            <span className="rhythm-retrig" aria-hidden="true">
              {Array.from({ length: retrig }, (_, part) => (
                <span key={part} className="rhythm-retrig-part" />
              ))}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
