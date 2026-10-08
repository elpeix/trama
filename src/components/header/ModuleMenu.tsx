import { useStoreApi } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { NEW_NODE_SIZE, newNodePosition } from "../../flow/placement";
import type { Preset } from "../../patch/presets";
import type { NodeType } from "../../patch/types";
import { usePatchStoreApi } from "../../store/usePatchStore";
import { AddIcon } from "./icons";
import { ModuleList } from "./ModuleList";

/** The "Add module" button and its menu, with the modules grouped by what they do. */
export function ModuleMenu() {
  const store = usePatchStoreApi();
  const flow = useStoreApi();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = (focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) {
      trigger.current?.focus();
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  /** Where a new node goes: in view, clear of the nodes there. */
  const place = () => {
    const { nodes, nodeViews } = store.getState();
    const existing = nodes.map((node) => ({
      ...node.position,
      ...NEW_NODE_SIZE,
      ...nodeViews[node.id]?.measured,
    }));
    return newNodePosition(flow.getState(), existing);
  };

  const add = (type: NodeType) => {
    store.getState().addNode(type, place());
    close(true);
  };

  const addPreset = (preset: Preset) => {
    store.getState().addPreset(preset, place());
    close(true);
  };

  return (
    <div className="module-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="hw hw-labelled module-menu-trigger"
        aria-label="Add module"
        title="Add module"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <AddIcon />
        <span className="module-menu-label">Add module</span>
      </button>
      {open && <ModuleList onChoose={add} onChoosePreset={addPreset} onClose={(key) => close(key === "Escape")} />}
    </div>
  );
}
