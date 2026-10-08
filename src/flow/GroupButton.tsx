import { useEffect } from "react";
import { isTyping } from "../components/isTyping";
import { usePatchStore, usePatchStoreApi } from "../store/usePatchStore";

const selectedIds = (views: Record<string, { selected?: boolean }>) =>
  Object.entries(views)
    .filter(([, view]) => view.selected)
    .map(([id]) => id);

/** Groups the selected nodes into a subpatch, with its button or with Ctrl or Cmd and G. */
export function GroupButton() {
  const store = usePatchStoreApi();
  const selected = usePatchStore((state) => selectedIds(state.nodeViews).length > 0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g" && !isTyping(event.target)) {
        const ids = selectedIds(store.getState().nodeViews);
        if (ids.length > 0) {
          event.preventDefault();
          store.getState().groupNodes(ids);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);

  if (!selected) {
    return null;
  }

  return (
    <button
      type="button"
      className="hw group-button"
      title="Group the selected modules into a subpatch (Ctrl or Cmd + G)"
      onClick={() => store.getState().groupNodes(selectedIds(store.getState().nodeViews))}
    >
      Group
    </button>
  );
}
