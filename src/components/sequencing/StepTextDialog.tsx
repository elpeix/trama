import { useId, useRef, useState } from "react";
import { Modal } from "../../about/Modal";
import { alignRows, type TextReading } from "../../patch/stepText";
import { EditIcon } from "../header/icons";
import { useTooltip } from "../useTooltip";

/** A param of steps edited as text: its name, what it holds, and how a text written by hand is read. */
export interface StepTextRow {
  id: string;
  label: string;
  value: string;
  read: (text: string) => TextReading;
  /** Whether it holds steps, lined up with the steps of the other rows; true unless false. */
  steps?: boolean;
}

interface StepTextDialogProps {
  title: string;
  rows: readonly StepTextRow[];
  /** Gets the rows changed, as they are stored. */
  onApply: (values: Record<string, string>) => void;
  onClose: () => void;
}

/**
 * The steps of a node written as text, a field for each row with the steps lined up, and the
 * arrows up and down moving between rows at the same column. Says what is wrong as it is typed,
 * and applies every row changed at once, with Apply or Enter.
 */
export function StepTextDialog({ title, rows, onApply, onClose }: StepTextDialogProps) {
  const id = useId();
  const [texts, setTexts] = useState(() => {
    const aligned = alignRows(rows.filter((row) => row.steps !== false).map((row) => row.value));
    return rows.map((row) => (row.steps === false ? row.value : aligned.shift()!));
  });
  const fields = useRef<(HTMLInputElement | null)[]>([]);
  const readings = rows.map((row, index) => row.read(texts[index]));
  const wrong = readings.findIndex((reading) => "problem" in reading);

  const apply = () => {
    if (wrong >= 0) {
      const reading = readings[wrong];
      const field = fields.current[wrong];
      if ("problem" in reading && field) {
        field.focus();
        field.setSelectionRange(reading.problem.start, reading.problem.end);
      }
      return;
    }
    const changed = Object.fromEntries(
      rows.flatMap((row, index) => {
        const reading = readings[index];
        return "value" in reading && reading.value !== row.value ? [[row.id, reading.value]] : [];
      }),
    );
    if (Object.keys(changed).length > 0) {
      onApply(changed);
    }
    onClose();
  };

  return (
    <Modal
      title={title}
      label={title}
      className="step-text-card"
      onClose={onClose}
      actions={
        <div className="step-text-actions">
          <button type="button" className="hw" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="hw" disabled={wrong >= 0} onClick={apply}>
            Apply
          </button>
        </div>
      }
    >
      <div className="step-text-rows">
        {rows.map((row, index) => {
          const reading = readings[index];
          const problem = "problem" in reading ? reading.problem : undefined;
          return (
            <div key={row.id} className="step-text-row">
              <label htmlFor={`${id}-field-${index}`} className="step-text-label">
                {row.label}
              </label>
              <input
                id={`${id}-field-${index}`}
                ref={(element) => {
                  fields.current[index] = element;
                }}
                type="text"
                className="step-text-field"
                value={texts[index]}
                spellCheck={false}
                autoComplete="off"
                autoFocus={index === 0}
                aria-invalid={problem !== undefined}
                aria-describedby={problem && `${id}-problem-${index}`}
                onChange={(event) => {
                  const text = event.target.value;
                  setTexts((current) => current.map((old, at) => (at === index ? text : old)));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    apply();
                    return;
                  }
                  const next = fields.current[index + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : NaN)];
                  if (next) {
                    event.preventDefault();
                    const column = event.currentTarget.selectionStart ?? 0;
                    next.focus();
                    next.setSelectionRange(column, column);
                  }
                }}
              />
              {problem && (
                <span id={`${id}-problem-${index}`} className="step-text-problem">
                  {problem.message}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/** The pencil that opens the steps of a node as text, with a tooltip that says so. */
export function StepTextButton(props: Omit<StepTextDialogProps, "onClose">) {
  const [open, setOpen] = useState(false);
  const { triggerProps, tooltip } = useTooltip(
    <>
      <strong>Edit as text</strong>
      <br />
      Write them as text, or paste them
    </>,
  );
  return (
    <>
      <button
        {...triggerProps}
        type="button"
        className="hw step-text-button"
        aria-label="Edit as text"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <EditIcon />
      </button>
      {tooltip}
      {open && <StepTextDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
