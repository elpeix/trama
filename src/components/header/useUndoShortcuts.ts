import { useEffect } from "react";
import type { PatchStore } from "../../store/patchStore";
import { isTyping } from "../isTyping";

export function useUndoShortcuts(store: PatchStore) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || isTyping(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      const redo = (key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey);
      if (key !== "z" && !redo) {
        return;
      }
      event.preventDefault();
      if (redo) {
        store.getState().redo();
      } else {
        store.getState().undo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}
