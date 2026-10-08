import { usePatchStore } from "../../store/usePatchStore";
import { RedoIcon, UndoIcon } from "./icons";

export function HistoryControls() {
  const canUndo = usePatchStore((state) => state.past.length > 0);
  const canRedo = usePatchStore((state) => state.future.length > 0);
  const undo = usePatchStore((state) => state.undo);
  const redo = usePatchStore((state) => state.redo);

  return (
    <div className="hw-group" role="group" aria-label="History">
      <button
        type="button"
        className="hw"
        onClick={undo}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo (⌘Z / Ctrl+Z)"
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className="hw"
        onClick={redo}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo (⇧⌘Z / Ctrl+Y)"
      >
        <RedoIcon />
      </button>
    </div>
  );
}
