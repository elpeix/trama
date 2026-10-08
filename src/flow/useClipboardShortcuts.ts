import { useEffect } from "react";
import { isTyping } from "../components/isTyping";
import type { PatchStore } from "../store/patchStore";

const selectedIds = (views: Record<string, { selected?: boolean }>) =>
  Object.entries(views)
    .filter(([, view]) => view.selected)
    .map(([id]) => id);

/** Copies, pastes and duplicates the selected nodes with Ctrl or Cmd and C, V and D. */
export function useClipboardShortcuts(store: PatchStore) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || isTyping(event.target)) {
        return;
      }
      const state = store.getState();
      const ids = selectedIds(state.nodeViews);
      const key = event.key.toLowerCase();
      if (key === "c" && ids.length > 0) {
        state.copyNodes(ids);
        event.preventDefault();
      } else if (key === "v" && state.pasteNodes().length > 0) {
        event.preventDefault();
      } else if (key === "d" && ids.length > 0) {
        state.duplicateNodes(ids);
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);
}
