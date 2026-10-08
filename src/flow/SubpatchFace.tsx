import { Handle, Position } from "@xyflow/react";
import { useContext, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { ParamControl, type ParamControlProps } from "../components/controls/ParamControl";
import { EngineContext } from "../components/EngineContext";
import { scopedEngine } from "../components/scopedEngine";
import { PatternSlots } from "../components/sequencing/PatternSlots";
import type { ControlKey } from "../patch/automation";
import { FIRST_SLOT, paramsInPattern, patternIds } from "../patch/patterns";
import { moduleRegistry, type RhythmParamDefinition, type SelectParamDefinition } from "../patch/registry";
import { faceItems, type FaceItem } from "../patch/subpatch";
import { NODE_NAME_MAX_LENGTH, type NodeId, type PatchNode, type ParamValue, type PatternSlot } from "../patch/types";
import { usePatchStore } from "../store/usePatchStore";
import { ParamScreen, RhythmScreen, type ScreenParamDefinition } from "./ParamScreen";

interface SubpatchFaceProps {
  id: NodeId;
  subpatch: Pick<PatchNode, "published" | "patch">;
  /** The ports of the subpatch, to give a published knob that modulates its input. */
  inputs: readonly string[];
  modulated: readonly string[];
  songControl: (nodeId: string, name: string) => ControlKey;
  pinOf: (key: ControlKey | undefined) => ParamControlProps["pin"];
  /** A switch to publish a knob of the face on the subpatch this one is in; undefined outside any. */
  publishOf?: (key: string) => ParamControlProps["publish"];
}

const STEPS: Record<string, number> = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };

const launchOf = (node: PatchNode) =>
  moduleRegistry[node.type].params.find(
    (param): param is SelectParamDefinition => param.id === "launch" && param.kind === "select",
  );

/** The items that show on the face: not a knob hidden inside, nor the notes of a node that plays others. */
function shown(item: FaceItem, node: PatchNode) {
  const [control] = item.controls;
  if (item.kind === "control") {
    return !control.hidden;
  }
  const { definition } = control;
  return definition.kind !== "notes" || node.params[definition.when.param] === definition.when.value;
}

/** Items one after the other with the same section. */
function sectionsOf(items: readonly FaceItem[]) {
  const sections: { section?: string; items: FaceItem[] }[] = [];
  for (const item of items) {
    const last = sections.at(-1);
    if (last && last.section === item.section) {
      last.items.push(item);
    } else {
      sections.push({ section: item.section, items: [item] });
    }
  }
  return sections;
}

function SectionTitle({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);

  const finish = (save: boolean) => {
    if (draft !== null && save) {
      onRename(draft);
    }
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      finish(true);
    } else if (event.key === "Escape") {
      finish(false);
    }
  };

  if (draft !== null) {
    return (
      <input
        className="face-section-input nodrag"
        aria-label={`Name of section ${name}`}
        value={draft}
        maxLength={NODE_NAME_MAX_LENGTH}
        autoFocus
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => finish(true)}
      />
    );
  }
  return (
    <h3 className="face-section" title="Double-click to rename; clear the name to take the title away" onDoubleClick={() => setDraft(name)}>
      {name}
    </h3>
  );
}

interface FaceHandleProps {
  label: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onStep: (step: number) => void;
  onNewSection: () => void;
}

/** What moves an item of the face: dragged onto another or with the arrows, and a click opens its menu. */
function FaceHandle({ label, onDragStart, onDragEnd, onStep, onNewSection }: FaceHandleProps) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="face-handle nodrag"
        draggable
        aria-label={`Move ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Drag onto another one, or use the arrows, to move it; click for more"
        onClick={() => setOpen((previous) => !previous)}
        onDragStart={(event) => {
          setOpen(false);
          onDragStart();
          event.dataTransfer?.setData("text/plain", label);
        }}
        onDragEnd={onDragEnd}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            setOpen(false);
            return;
          }
          const step = STEPS[event.key];
          if (step !== undefined) {
            event.preventDefault();
            onStep(step);
          }
        }}
      >
        ⠿
      </button>
      {open && (
        <div ref={menu} className="face-menu nodrag" role="menu" aria-label={label}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNewSection();
            }}
          >
            New section here
          </button>
        </div>
      )}
    </>
  );
}

/**
 * What a subpatch shows of the nodes inside, in the order of the params published and under the
 * titles of their sections: knobs and selects, screens, and the rows of a node together. The
 * patterns of a node come before its first control that makes them. Each node edits a pattern of
 * its own, as it does on itself, which need not be the one playing.
 */
export function SubpatchFace({ id, subpatch, inputs, modulated, songControl, pinOf, publishOf }: SubpatchFaceProps) {
  const engine = useContext(EngineContext);
  const engineInside = useMemo(() => engine && scopedEngine(engine, [id]), [engine, id]);
  const path = usePatchStore((state) => state.path);
  const updateInnerParam = usePatchStore((state) => state.updateInnerParam);
  const updateParamAt = usePatchStore((state) => state.updateParamAt);
  const updateParamsAt = usePatchStore((state) => state.updateParamsAt);
  const renamePublished = usePatchStore((state) => state.renamePublished);
  const openClipEditor = usePatchStore((state) => state.openClipEditor);
  const movePublished = usePatchStore((state) => state.movePublished);
  const startSection = usePatchStore((state) => state.startSection);
  const nameSection = usePatchStore((state) => state.nameSection);
  const [editing, setEditing] = useState<Record<NodeId, PatternSlot>>({});
  const dragged = useRef<string | undefined>(undefined);

  const inside = subpatch.patch?.nodes ?? [];
  const nodeOf = (item: FaceItem) => inside.find((node) => node.id === item.node)!;
  const slotOf = (node: NodeId) => editing[node] ?? FIRST_SLOT;
  const paramsOf = (node: PatchNode) => paramsInPattern(node, slotOf(node.id));
  const write = (node: NodeId) => (name: string, value: ParamValue, options?: { merge?: boolean | string }) =>
    updateInnerParam(id, node, name, value, { ...options, pattern: slotOf(node) });

  const screenTitle = (node: PatchNode) => `${node.name ?? moduleRegistry[node.type].title} · ${slotOf(node.id)}`;

  const items = faceItems(subpatch).filter((item) => shown(item, nodeOf(item)));
  const labelOf = (item: FaceItem) => {
    const node = nodeOf(item);
    return item.kind === "rows" ? `${node.name ?? moduleRegistry[node.type].title} Rows` : item.controls[0].name;
  };
  const makesPatterns = (item: FaceItem) =>
    item.controls.some((control) => patternIds(nodeOf(item).type).includes(control.param));
  const patternsAt = new Map<string, PatchNode>();
  for (const item of items) {
    const node = nodeOf(item);
    if (launchOf(node) && makesPatterns(item) && ![...patternsAt.values()].includes(node)) {
      patternsAt.set(item.key, node);
    }
  }

  const patternSlots = (node: PatchNode) => {
    const launch = launchOf(node)!;
    return (
      <EngineContext key={`patterns-${node.id}`} value={engineInside}>
        <PatternSlots
          nodeId={node.id}
          editing={slotOf(node.id)}
          onEdit={(slot) => setEditing((previous) => ({ ...previous, [node.id]: slot }))}
          launch={launch}
          launchMode={String(paramsOf(node)[launch.id])}
          onLaunchMode={(mode) => updateInnerParam(id, node.id, launch.id, mode)}
          songPath={[...path, id, node.id].join("/")}
        />
      </EngineContext>
    );
  };

  const handle = (item: FaceItem) => (
    <FaceHandle
      label={labelOf(item)}
      onDragStart={() => {
        dragged.current = item.key;
      }}
      onDragEnd={() => {
        dragged.current = undefined;
      }}
      onStep={(step) => {
        const neighbour = items[items.indexOf(item) + step];
        if (neighbour) {
          movePublished(id, item.key, neighbour.key);
        }
      }}
      onNewSection={() => startSection(id, item.key)}
    />
  );

  const dropTarget = (item: FaceItem) => ({
    "data-face-item": item.key,
    onDragOver: (event: DragEvent) => {
      if (dragged.current) {
        event.preventDefault();
      }
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      if (dragged.current) {
        movePublished(id, dragged.current, item.key);
      }
      dragged.current = undefined;
    },
  });

  const control = (item: FaceItem) => {
    const [published] = item.controls;
    const { target } = published;
    const at = [id, ...target.path].join("/");
    const slot = target.path.length === 1 ? slotOf(target.node.id) : FIRST_SLOT;
    const automated =
      published.definition.kind === "number" && !patternIds(target.node.type).includes(target.param)
        ? songControl(at, target.param)
        : undefined;
    return (
      <div key={item.key} className="module-row face-item face-item-control" {...dropTarget(item)}>
        {inputs.includes(published.key) && (
          <Handle id={published.key} type="target" position={Position.Left} className="port port-control" />
        )}
        <ParamControl
          definition={{ ...published.definition, label: published.name }}
          value={paramsInPattern(target.node, slot)[target.param] ?? published.definition.default}
          onChange={(value, options) => updateParamAt([...path, id, ...target.path], target.param, value, { ...options, pattern: slot })}
          control={automated}
          pin={pinOf(automated)}
          publish={publishOf?.(published.key)}
          modulation={
            engine && modulated.includes(published.key) ? () => engine.getModulation(at, target.param) : undefined
          }
          onRename={(name) => renamePublished(id, published.key, name)}
        />
        {handle(item)}
      </div>
    );
  };

  const screen = (item: FaceItem) => {
    const node = nodeOf(item);
    const params = paramsOf(node);
    return (
      <div key={item.key} className="face-item face-item-screen" {...dropTarget(item)}>
        <EngineContext value={engineInside}>
          {item.kind === "rows" ? (
            <RhythmScreen
              nodeId={node.id}
              title={screenTitle(node)}
              rhythms={item.controls.map((rhythm) => rhythm.definition as RhythmParamDefinition)}
              params={params}
              onChange={write(node.id)}
              onChanges={(values) => updateParamsAt([...path, id, node.id], values, { pattern: slotOf(node.id) })}
            />
          ) : (
            <ParamScreen
              type={node.type}
              nodeId={node.id}
              title={screenTitle(node)}
              definition={item.controls[0].definition as ScreenParamDefinition}
              params={params}
              onChange={write(node.id)}
              onEdit={() => openClipEditor([...path, id, node.id], slotOf(node.id))}
            />
          )}
        </EngineContext>
        {handle(item)}
      </div>
    );
  };

  return sectionsOf(items).map(({ section, items: inSection }) => {
    const parts: ReactNode[] = [];
    let controls: ReactNode[] = [];
    const endControls = () => {
      if (controls.length > 0) {
        parts.push(
          <div key={`params-${parts.length}`} className="module-params">
            {controls}
          </div>,
        );
        controls = [];
      }
    };
    for (const item of inSection) {
      const patterns = patternsAt.get(item.key);
      if (patterns) {
        endControls();
        parts.push(patternSlots(patterns));
      }
      if (item.kind === "control") {
        controls.push(control(item));
      } else {
        endControls();
        parts.push(screen(item));
      }
    }
    endControls();
    return (
      <div key={inSection[0].key} className="face-group">
        {section !== undefined && <SectionTitle name={section} onRename={(name) => nameSection(id, inSection[0].key, name)} />}
        {parts}
      </div>
    );
  });
}
