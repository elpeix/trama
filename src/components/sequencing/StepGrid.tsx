import { useContext, useEffect, useRef, useState } from "react";
import type { BeatAccent } from "../../patch/meter";
import type { SequenceParamDefinition } from "../../patch/registry";
import { noteName } from "../../patch/pitch";
import { gridRows, ROOTS } from "../../patch/scales";
import { formatSequence, parseSequence, type SequenceStep } from "../../patch/sequence";
import { EngineContext } from "../EngineContext";

interface StepGridProps {
  nodeId: string;
  definition: SequenceParamDefinition;
  value: string;
  length: number;
  /**
   * Shift of the whole pattern, in octaves: the rows are labelled with the notes that sound, with
   * the transpose of the computer keys too.
   */
  octave: number;
  scale: string;
  root: string;
  /** What starts on each step: a bar, a group of beats of the meter, a beat, or nothing. */
  accents?: readonly (BeatAccent | undefined)[];
  onChange: (value: string, options?: { merge?: boolean | string }) => void;
}

const isBlackKey = (note: number) => [1, 3, 6, 8, 10].includes(note % 12);

/**
 * A grid of steps (columns) by notes (rows): click a cell to play that note on that step, or drag
 * across the grid to fill several at once. Dragging does what the cell it starts on did — placing
 * notes, or taking them away — and the whole drag is a single undo step. The rows are the notes of
 * the chosen scale, so every note placed is in key.
 */
/** The note each step sounds, following the ties that only hold back to their note; null for silence. */
function heldNotes(steps: readonly SequenceStep[]): (number | null)[] {
  const held: (number | null)[] = [];
  steps.forEach((step, index) => {
    held.push(step.tie && step.note === null ? (index > 0 ? held[index - 1] : null) : step.note);
  });
  return held;
}

/**
 * A step with `note` placed on it. A tied step keeps its tie and glides into the note, unless it
 * is the note it already holds.
 */
function placed(step: SequenceStep, note: number, holding: number | null): SequenceStep {
  if (!step.tie) {
    return { note };
  }
  return note === holding ? { note: null, tie: true } : { note, tie: true, accent: step.accent };
}

/** A step with its note taken away: a tied step goes back to holding the note before it. */
const cleared = (step: SequenceStep): SequenceStep => (step.tie ? { note: null, tie: true } : { note: null });

export function StepGrid({ nodeId, definition, value, length, octave, scale, root, accents = [], onChange }: StepGridProps) {
  const engine = useContext(EngineContext);
  /** The drag going on: whether it places notes or takes them away, and the pattern so far. */
  const painting = useRef<{ placing: boolean; steps: SequenceStep[]; name: string } | undefined>(undefined);
  const drags = useRef(0);
  const [position, setPosition] = useState<number | undefined>(undefined);
  // The computer keys can transpose the pattern: the rows then show the notes that sound.
  const [keyTranspose, setKeyTranspose] = useState(0);
  const steps: SequenceStep[] = parseSequence(value) ?? Array.from({ length: definition.steps }, () => ({ note: null }));
  const rows = gridRows(
    scale,
    root,
    definition.lowest,
    steps.map((step) => step.note),
  );
  const held = heldNotes(steps);

  useEffect(() => {
    if (!engine) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      setPosition(engine.getPosition(nodeId));
      setKeyTranspose(engine.getKeyTranspose(nodeId) ?? 0);
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

  const toggle = (step: number, note: number) => {
    const next = steps.map((current, index) =>
      index !== step ? current : current.note === note ? cleared(current) : placed(current, note, held[index - 1] ?? null),
    );
    onChange(formatSequence(next));
  };

  /**
   * Writes the cell the pointer is on. The first cell of a drag decides whether the rest place a
   * note or clear one, and the drag carries its own pattern along, so no cell is lost however the
   * changes come back.
   */
  const paint = (step: number, note: number, first: boolean) => {
    const drag = first
      ? { placing: steps[step].note !== note, steps, name: `drag-${++drags.current}` }
      : painting.current;
    if (!drag) {
      return;
    }
    const next = drag.steps.map((current, index) =>
      index !== step
        ? current
        : drag.placing
          ? placed(current, note, held[index - 1] ?? null)
          : current.note === note
            ? cleared(current)
            : current,
    );
    painting.current = { ...drag, steps: next };
    const pattern = formatSequence(next);
    if (pattern !== formatSequence(drag.steps)) {
      // The cells of one drag, and only those, merge into a single undo step.
      onChange(pattern, { merge: drag.name });
    }
  };

  return (
    <div className="step-grid nodrag" role="grid" aria-label={definition.label}>
      {rows.map(({ note, inScale }) => (
        <div
          key={note}
          role="row"
          className={[
            "step-row",
            scale === "chromatic" && isBlackKey(note) && "step-row-black",
            note % 12 === ROOTS.indexOf(root) && "step-row-root",
            !inScale && "step-row-outside",
          ]
            .filter(Boolean)
            .join(" ")}
          title={inScale ? undefined : "This note is not in the scale"}
        >
          <span role="rowheader" className="step-note">
            {noteName(note + 12 * octave + keyTranspose)}
          </span>
          {steps.map((current, step) => {
            const classes = [
              "step-cell",
              current.note === note && "step-cell-on",
              current.note === note && current.accent && "step-cell-accent",
              current.tie && current.note === null && held[step] === note && "step-cell-tie",
              current.tie && current.note === note && "step-cell-slide",
              step >= length && "step-cell-off",
              step === position && "step-cell-playing",
              accents[step] === "beat" && "step-cell-beat",
              (accents[step] === "bar" || accents[step] === "group") && "step-cell-group",
            ];
            return (
              <button
                key={step}
                type="button"
                role="gridcell"
                className={classes.filter(Boolean).join(" ")}
                aria-label={`Step ${step + 1} ${noteName(note + 12 * octave)}`}
                aria-pressed={current.note === note}
                onPointerDown={(event) => {
                  // Let the pointer move on to the other cells instead of sticking to this one.
                  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  paint(step, note, true);
                }}
                onPointerEnter={(event) => {
                  if (event.buttons !== 0) {
                    paint(step, note, false);
                  }
                }}
                // The pointer has written this cell already; a click with none behind it is the keyboard.
                onClick={(event) => event.detail === 0 && toggle(step, note)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
