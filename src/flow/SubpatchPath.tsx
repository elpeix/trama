import { Fragment } from "react";
import { moduleRegistry } from "../patch/registry";
import { graphAt } from "../patch/subpatch";
import { usePatchStore, usePatchStoreApi } from "../store/usePatchStore";

const idNumber = (id: string) => id.match(/-(\d+)$/)?.[1];

/** Where the graph on show is, from the whole patch down through the subpatches opened: click one to go back up to it. */
export function SubpatchPath() {
  const store = usePatchStoreApi();
  const path = usePatchStore((state) => state.path);
  usePatchStore((state) => state.nodes);
  const closeSubpatch = usePatchStore((state) => state.closeSubpatch);
  if (path.length === 0) {
    return null;
  }
  const root = store.getState().toPatch();
  const names = path.map((id, depth) => {
    const node = graphAt(root, path.slice(0, depth)).nodes.find((candidate) => candidate.id === id);
    return node?.name ?? [moduleRegistry.subpatch.title, idNumber(id)].filter(Boolean).join(" ");
  });

  return (
    <nav className="subpatch-path" aria-label="Subpatches">
      <button type="button" className="subpatch-path-step" onClick={() => closeSubpatch(0)}>
        Patch
      </button>
      {names.map((name, depth) => (
        <Fragment key={path[depth]}>
          <span className="subpatch-path-separator" aria-hidden="true">
            ›
          </span>
          {depth === names.length - 1 ? (
            <span className="subpatch-path-current" aria-current="location">
              {name}
            </span>
          ) : (
            <button type="button" className="subpatch-path-step" onClick={() => closeSubpatch(depth + 1)}>
              {name}
            </button>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
