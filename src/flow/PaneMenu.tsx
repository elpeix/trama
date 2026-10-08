import { useReactFlow } from "@xyflow/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ModuleList } from "../components/header/ModuleList";
import type { Preset } from "../patch/presets";
import type { NodeType, Position } from "../patch/types";
import { usePatchStoreApi } from "../store/usePatchStore";

interface PaneMenuProps {
  /** Where the editor was clicked, on the screen. */
  at: Position;
  onClose(): void;
}

/** The menu of modules opened with a right click on the editor, which adds the one chosen there. */
export function PaneMenu({ at, onClose }: PaneMenuProps) {
  const store = usePatchStoreApi();
  const { screenToFlowPosition } = useReactFlow();
  const root = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState(at);

  useLayoutEffect(() => {
    const { width, height } = root.current!.getBoundingClientRect();
    setPlace({
      x: Math.max(0, Math.min(at.x, window.innerWidth - width)),
      y: Math.max(0, Math.min(at.y, window.innerHeight - height)),
    });
  }, [at]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const add = (type: NodeType) => {
    store.getState().addNode(type, screenToFlowPosition(at));
    onClose();
  };

  const addPreset = (preset: Preset) => {
    store.getState().addPreset(preset, screenToFlowPosition(at));
    onClose();
  };

  return (
    <ModuleList
      ref={root}
      className="pane-menu"
      style={{ left: place.x, top: place.y }}
      onChoose={add}
      onChoosePreset={addPreset}
      onClose={onClose}
    />
  );
}
