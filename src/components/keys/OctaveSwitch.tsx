import type { ReactNode } from "react";
import { noteName } from "../../patch/pitch";

interface OctaveSwitchProps {
  /** The lowest and highest notes that come out now. */
  from: number;
  to: number;
  onChange: (by: number) => void;
  /** The key that does the same as each button, if any. */
  keys?: { down: string; up: string };
  children?: ReactNode;
}

/** The octave switch of a MIDI keyboard: two buttons, and a screen with the notes they reach. */
export function OctaveSwitch({ from, to, onChange, keys, children }: OctaveSwitchProps) {
  return (
    <div className="keys-controls">
      <button
        type="button"
        className="hw keys-button nodrag"
        aria-label="Octave down"
        title={keys ? `Octave down (${keys.down})` : "Octave down"}
        onClick={() => onChange(-1)}
      >
        ▼{keys && ` ${keys.down}`}
      </button>
      <output className="knob-value keys-range" aria-label="Keys" title="The notes that come out, with the transpose">
        {noteName(from)}–{noteName(to)}
      </output>
      <button
        type="button"
        className="hw keys-button nodrag"
        aria-label="Octave up"
        title={keys ? `Octave up (${keys.up})` : "Octave up"}
        onClick={() => onChange(1)}
      >
        {keys && `${keys.up} `}▲
      </button>
      {children}
    </div>
  );
}
