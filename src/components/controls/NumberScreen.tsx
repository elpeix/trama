import { useValueControl } from "./useValueControl";

interface NumberScreenProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  title?: string;
  /** How the value shows; the number itself while unset. */
  format?: (value: number) => string;
}

/**
 * A whole number on a small screen like the tempo's: drag it up or down, scroll it, use the arrow
 * keys or double-click it to type a value, always within its range.
 */
export function NumberScreen({ label, value, min, max, onChange, title, format = String }: NumberScreenProps) {
  const { draft, setDraft, displayProps, inputProps } = useValueControl({
    value,
    range: { min, max, step: 1, scale: "linear" },
    onChange,
  });

  return (
    <div className="number-screen">
      {draft === null ? (
        <div
          {...displayProps}
          className="number-screen-value"
          aria-label={label}
          aria-valuetext={format(value)}
          title={`${title ? `${title}. ` : ""}Drag, scroll or use the arrow keys; double-click to type`}
        >
          {format(value)}
        </div>
      ) : (
        <input
          {...inputProps}
          className="number-screen-input"
          aria-label={label}
          inputMode="numeric"
          onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
        />
      )}
    </div>
  );
}
