import type { CSSProperties } from "react";
import type { BeatAccent } from "../../patch/meter";
import { formatSequence, lowerChance, parseSequence, type SequenceStep } from "../../patch/sequence";

interface StepMarksProps {
  value: string;
  length: number;
  /** What starts on each step: a bar, a group of beats of the meter, a beat, or nothing. */
  accents?: readonly (BeatAccent | undefined)[];
  onChange: (value: string) => void;
}

/** Whether each step sounds a note, or holds one through a tie. */
const holdsNote = (steps: readonly SequenceStep[], index: number) =>
  steps[index] !== undefined && (steps[index].note !== null || steps[index].tie === true);

const LABELS: Record<string, string> = { Accents: "ACC", Ties: "TIE", Chances: "%" };

/**
 * Three rows of steps under the grid of a Seq: one accents the note of a step, one ties a step to
 * the note before it, keeping its gate open: a silent step holds that note, and a step with a note
 * glides into it. The last one lowers the chance of a note that starts a quarter at a time, back
 * to always after a quarter, and fills it as much as its chance. Only notes take an accent, only
 * a step after a note, or after another tie, can be tied, and only a note that is not tied has a
 * chance. Each click is one undo step.
 */
export function StepMarks({ value, length, accents = [], onChange }: StepMarksProps) {
  const steps = parseSequence(value) ?? [];

  const change = (step: number, mark: (current: SequenceStep) => SequenceStep) =>
    onChange(formatSequence(steps.map((current, index) => (index === step ? mark(current) : current))));

  const row = (
    label: string,
    pressed: (step: SequenceStep) => boolean,
    enabled: (index: number) => boolean,
    toggle: (step: SequenceStep) => SequenceStep,
    extra: (step: SequenceStep, index: number) => { className?: string; title?: string; style?: CSSProperties } = () => ({}),
  ) => (
    <div className="step-marks-row" role="group" aria-label={label}>
      <span className="step-marks-label" aria-hidden="true">
        {LABELS[label]}
      </span>
      {steps.map((step, index) => {
        const { className, ...more } = extra(step, index);
        return (
          <button
            key={index}
            type="button"
            className={[
              "step-mark",
              className,
              index >= length && "step-mark-off",
              accents[index] === "beat" && "step-mark-beat",
              (accents[index] === "bar" || accents[index] === "group") && "step-mark-group",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={`Step ${index + 1}`}
            aria-pressed={pressed(step)}
            disabled={!enabled(index)}
            onClick={() => change(index, toggle)}
            {...more}
          />
        );
      })}
    </div>
  );

  return (
    <div className="step-marks nodrag">
      {row(
        "Accents",
        (step) => step.accent === true,
        (index) => steps[index].note !== null,
        (step) => ({ ...step, accent: !step.accent }),
      )}
      {row(
        "Ties",
        (step) => step.tie === true,
        (index) => index > 0 && holdsNote(steps, index - 1),
        (step) =>
          step.tie
            ? step.note === null
              ? { note: null }
              : { note: step.note, accent: step.accent }
            : { note: step.note, accent: step.accent, tie: true },
      )}
      {row(
        "Chances",
        (step) => step.chance !== undefined,
        (index) => steps[index].note !== null && !steps[index].tie,
        (step) => {
          const chance = lowerChance(step.chance);
          return chance < 100 ? { ...step, chance } : { note: step.note, accent: step.accent };
        },
        (step, index) =>
          steps[index].note !== null && !step.tie
            ? {
                className: "step-mark-chance",
                title:
                  step.chance === undefined
                    ? "Always sounds; click to make it sound less often"
                    : `Sounds ${step.chance}% of the time; click for less, or always after 25%`,
                style: { "--chance": (step.chance ?? 100) / 100 } as CSSProperties,
              }
            : {},
      )}
    </div>
  );
}
