import { useContext, useMemo, useRef, type KeyboardEvent } from "react";
import { parseControlKey, type ControlKey } from "../../patch/automation";
import { beatsPerBar } from "../../patch/meter";
import { paramLock } from "../../patch/params";
import { performItems, type PerformItem } from "../../patch/perform";
import { patternPaths } from "../../patch/song";
import { usePatchStore } from "../../store/usePatchStore";
import { ParamControl } from "../controls/ParamControl";
import { MixerBlock } from "./MixerBlock";
import { EngineContext, type DisplayEngine } from "../EngineContext";
import { PanelFullscreenButton } from "../song/PanelFullscreenButton";
import { PanelTabs } from "../song/PanelTabs";
import { LauncherRow } from "./LauncherRow";
import { SceneStrip } from "./SceneStrip";
import { Crossfader } from "./Crossfader";
import { RemoveIcon } from "../RemoveIcon";

/** The nodes down to a knob or a channel, and its own name; a name given is shown whole. */
const splitLabel = (label: string, named: boolean): { context?: string; name: string } => {
  const cut = label.lastIndexOf(" › ");
  return named || cut < 0 ? { name: label } : { context: label.slice(0, cut), name: label.slice(cut + 3) };
};

interface PinnedKnobControlProps {
  item: Extract<PerformItem, { kind: "knob" }>;
  name: string;
  context?: string;
  tempo: number;
  beats: number;
  engine: DisplayEngine | null;
  onChange: (value: number, options?: { merge?: boolean }) => void;
  onRename: (name: string) => void;
}

/** A knob pinned: the param of its node, locked and modulated as it is there. */
function PinnedKnobControl({ item, name, context, tempo, beats, engine, onChange, onRename }: PinnedKnobControlProps) {
  const { key, definition, node, value } = item;
  const { target, name: param } = parseControlKey(key);
  return (
    <ParamControl
      definition={{ ...definition, label: name }}
      context={context}
      value={value}
      onChange={(changed, options) => onChange(Number(changed), options)}
      control={key}
      locked={paramLock(definition, node.params, tempo, beats)}
      modulation={engine ? () => engine.getModulation(target, param) : undefined}
      onRename={onRename}
    />
  );
}

const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/**
 * What to play without going round the patch: the patterns of every node that has them, and the
 * knobs pinned from the nodes, wherever they are. Each knob is the param of its node: it changes,
 * records and undoes as it does there.
 */
export function PerformPanel() {
  const engine = useContext(EngineContext);
  const patch = usePatchStore((state) => state.toPatch());
  const pinned = usePatchStore((state) => state.perform);
  const tempo = usePatchStore((state) => state.tempo);
  const beats = usePatchStore((state) => beatsPerBar(state.meter));
  const setKnob = usePatchStore((state) => state.setKnob);
  const togglePinned = usePatchStore((state) => state.togglePinned);
  const renamePinned = usePatchStore((state) => state.renamePinned);
  const movePinned = usePatchStore((state) => state.movePinned);
  const openSongPanel = usePatchStore((state) => state.openSongPanel);
  const hidden = usePatchStore((state) => state.hiddenLaunchers);
  const toggleLauncher = usePatchStore((state) => state.toggleLauncher);
  const rows = useMemo(() => patternPaths(patch).map(({ path, names }) => ({ path, name: names.join(" › ") })), [patch]);
  const items = useMemo(() => performItems(patch, pinned), [patch, pinned]);
  const knobs = items.filter((item) => item.kind === "knob");
  const mixers = items.filter((item) => item.kind === "mixer");
  const dragged = useRef<ControlKey | undefined>(undefined);
  const placeOf = (key: string) => pinned.findIndex((knob) => knob.key === key);

  const moveWithKeys = (event: KeyboardEvent<HTMLButtonElement>, key: ControlKey, group: PerformItem[], index: number) => {
    const step = STEPS[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const neighbour = group[index + step];
    if (neighbour) {
      movePinned(key, placeOf(neighbour.key));
    }
  };

  const renderItem = (item: PerformItem, group: PerformItem[], index: number) => {
    const { key, label } = item;
    const { context, name } = splitLabel(label, pinned[placeOf(key)]?.name !== undefined);
    return (
      <li
        key={key}
        className={item.kind === "mixer" ? "perform-knob perform-mixer-item" : "perform-knob"}
        onDragOver={(event) => {
          if (dragged.current) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (dragged.current) {
            movePinned(dragged.current, placeOf(key));
          }
          dragged.current = undefined;
        }}
      >
        <button
          type="button"
          className="perform-knob-handle"
          draggable
          aria-label={`Move ${label}`}
          title="Drag onto another one, or use the arrows, to move it"
          onDragStart={(event) => {
            dragged.current = key;
            event.dataTransfer?.setData("text/plain", key);
          }}
          onDragEnd={() => {
            dragged.current = undefined;
          }}
          onKeyDown={(event) => moveWithKeys(event, key, group, index)}
        >
          ⠿
        </button>
        {item.kind === "knob" ? (
          <PinnedKnobControl
            item={item}
            name={name}
            context={context}
            tempo={tempo}
            beats={beats}
            engine={engine}
            onChange={(changed, options) => setKnob(key, changed, options)}
            onRename={(renamed) => renamePinned(key, renamed)}
          />
        ) : (
          <MixerBlock item={item} name={name} context={context} onRename={(renamed) => renamePinned(key, renamed)} />
        )}
        <button
          type="button"
          className="remove-badge perform-remove perform-knob-remove"
          aria-label={`Unpin ${label}`}
          title="Take it out of the panel"
          onClick={() => togglePinned(key)}
        >
          <RemoveIcon />
        </button>
      </li>
    );
  };

  return (
    <section className="clip-editor song-panel perform-panel" aria-label="Perform panel">
      <header className="clip-editor-bar">
        <PanelTabs />
        <PanelFullscreenButton />
        <button type="button" className="remove-badge clip-editor-close" aria-label="Close perform" onClick={() => openSongPanel(false)}>
          <RemoveIcon />
        </button>
      </header>
      <div className="clip-editor-body perform-body">
        {rows.length > 0 && (
          <div className="perform-launcher">
            <SceneStrip paths={rows.map(({ path }) => path)} />
            <Crossfader />
            <ul className="perform-launch-rows" aria-label="Launcher">
              {rows
                .filter(({ path }) => !hidden.includes(path))
                .map(({ path, name }) => (
                  <li key={path}>
                    <LauncherRow path={path} name={name} onHide={() => toggleLauncher(path)} />
                  </li>
                ))}
            </ul>
            {hidden.length > 0 && (
              <div className="perform-hidden" role="group" aria-label="Hidden from the launcher">
                <span className="param-label">Hidden</span>
                {rows
                  .filter(({ path }) => hidden.includes(path))
                  .map(({ path, name }) => (
                    <button
                      key={path}
                      type="button"
                      className="hw clip-editor-action perform-show"
                      aria-label={`Show ${name}`}
                      title="Show this node on the launcher again"
                      onClick={() => toggleLauncher(path)}
                    >
                      {name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
        {items.length === 0 ? (
          <p className="song-empty">Right-click a knob or a mixer and pick Pin to Perform to play it from here.</p>
        ) : (
          <>
            {knobs.length > 0 && (
              <ul className="perform-knobs" aria-label="Pinned knobs">
                {knobs.map((item, index) => renderItem(item, knobs, index))}
              </ul>
            )}
            {mixers.length > 0 && (
              <ul className="perform-knobs perform-mixers" aria-label="Mixers">
                {mixers.map((item, index) => renderItem(item, mixers, index))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
