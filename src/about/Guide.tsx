import { Modal } from "./Modal";

interface GuideProps {
  onClose: () => void;
}

/** The first steps with Trama, from an empty patch to a sound, and where to go next. */
export function Guide({ onClose }: GuideProps) {
  return (
    <Modal title="Getting started" label="Getting started" className="guide-card" onClose={onClose}>
      <ol className="guide-steps">
        <li>
          <h3>Add modules</h3>
          <p>
            Click <strong>Add module</strong> on the bar, or right-click the background, and pick one. Start with an{" "}
            <strong>Oscillator</strong> and an <strong>Output</strong>.
          </p>
        </li>
        <li>
          <h3>Connect them</h3>
          <p>
            Drag from an output on the right of a module to an input on the left of another. Only ports of the same kind join:
            audio (blue circle), control (orange square), trigger (green diamond) and notes (magenta).
          </p>
        </li>
        <li>
          <h3>Play</h3>
          <p>
            Press ▶ or <kbd>Space</kbd> to start and stop the sound. With a <strong>Keyboard</strong> module, the keys{" "}
            <kbd>A</kbd> to <kbd>K</kbd> of your computer play notes, and <kbd>Z</kbd> and <kbd>X</kbd> change the octave.
          </p>
        </li>
        <li>
          <h3>Change values</h3>
          <p>
            Drag a knob up or down, scroll on it, or double-click it to type a value. A control cable adds to the knob it
            reaches: an LFO on a filter makes it move.
          </p>
        </li>
        <li>
          <h3>Save your patch</h3>
          <p>
            Your patch is kept in this browser as you work. <strong>Save</strong> downloads it as a file and{" "}
            <strong>Load</strong> opens one. <kbd>⌘Z</kbd> or <kbd>Ctrl+Z</kbd> undoes.
          </p>
        </li>
        <li>
          <h3>Go further</h3>
          <p>
            <strong>Examples</strong>, on the bar, opens ready-made patches: start with <strong>First steps</strong>.{" "}
            <strong>Composer</strong> opens the song, to chain patterns bar by bar, and Perform, to play them live.
          </p>
        </li>
      </ol>
    </Modal>
  );
}
