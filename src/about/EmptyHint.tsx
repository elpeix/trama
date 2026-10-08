import { useContext } from "react";
import { usePatchStore } from "../store/usePatchStore";
import { GuideContext } from "./GuideContext";

/** What to do with an empty patch, in the middle of the editor, with the way to the guide. */
export function EmptyHint() {
  const empty = usePatchStore((state) => state.path.length === 0 && state.nodes.length === 0);
  const openGuide = useContext(GuideContext);

  if (!empty || !openGuide) {
    return null;
  }

  return (
    <div className="empty-hint">
      <p>Add a module, or open one of the Examples.</p>
      <button type="button" className="hw" onClick={openGuide}>
        Getting started
      </button>
    </div>
  );
}
