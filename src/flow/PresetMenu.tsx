import { useContext, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { PresetsIcon } from "../components/header/icons";
import { usePresets } from "../components/PresetsContext";
import { downloadFile } from "../components/header/download";
import { SamplesContext } from "../components/SamplesContext";
import { factoryPresetsOf } from "../patch/factoryPresets";
import { presetOf, presetSampleIds } from "../patch/presets";
import { parsePresets, PatchFormatError, serializePresets } from "../patch/serialization";
import type { SampleRecord } from "../samples/sampleLibrary";
import { NODE_NAME_MAX_LENGTH, type NodeId, type NodeType } from "../patch/types";
import { usePatchStoreApi } from "../store/usePatchStore";

const FILE_NAME = "trama-presets.json";
const GAP = 4;
const MARGIN = 8;

interface PresetMenuProps {
  nodeId: NodeId;
  type: NodeType;
  /** What the node is called, to name the menu and to start the name of a preset from. */
  title: string;
  name?: string;
}

/**
 * The presets of a node, opened from its header: first the ones that come with the app for its
 * type, to give it their settings, then the ones saved for its type, to give it theirs or to delete
 * them, and a field to save its own settings as one. A subpatch saved here
 * is also a module of its own in the menu of modules. At its foot, all the presets can be exported
 * to a file, with the samples they play, and imported from one.
 */
export function PresetMenu({ nodeId, type, title, name }: PresetMenuProps) {
  const store = usePatchStoreApi();
  const { library, presets } = usePresets();
  const samples = useContext(SamplesContext);
  const [report, setReport] = useState<{ error: boolean; text: string }>();
  const importer = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [place, setPlace] = useState({ x: 0, y: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const own = presets.filter((preset) => preset.node.type === type);
  const builtIn = factoryPresetsOf(type);
  const replaces = own.find((preset) => preset.name.localeCompare(draft.trim(), undefined, { sensitivity: "base" }) === 0);

  const close = (focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) {
      trigger.current?.focus();
    }
  };

  useLayoutEffect(() => {
    if (!open || !trigger.current || !panel.current) {
      return;
    }
    const button = trigger.current.getBoundingClientRect();
    const { width, height } = panel.current.getBoundingClientRect();
    setPlace({
      x: Math.max(MARGIN, Math.min(button.right - width, window.innerWidth - width - MARGIN)),
      y: Math.max(MARGIN, Math.min(button.bottom + GAP, window.innerHeight - height - MARGIN)),
    });
  }, [open, own.length]);

  useEffect(() => {
    if (!open) {
      return;
    }
    field.current?.focus();
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("wheel", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("wheel", outside);
    };
  }, [open]);

  if (!library) {
    return null;
  }

  const exportAll = async () => {
    const all = library.list();
    const records = samples ? await Promise.all(presetSampleIds(all.map(({ node }) => node)).map((id) => samples.get(id))) : [];
    const kept = records.filter((record): record is SampleRecord => record !== undefined);
    const json = JSON.stringify(serializePresets(all, kept), null, 2);
    downloadFile(new Blob([json], { type: "application/json" }), FILE_NAME);
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const { presets: read, samples: played } = parsePresets(JSON.parse(await file.text()));
      await Promise.all(played.map((record) => samples?.put(record)));
      const count = library.import(read);
      setReport({ error: false, text: `Imported ${count} ${count === 1 ? "preset" : "presets"}` });
    } catch (cause) {
      setReport({
        error: true,
        text: cause instanceof PatchFormatError ? cause.message : `${file.name} is not a presets file`,
      });
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const node = store.getState().nodes.find(({ id }) => id === nodeId);
    if (!node || !draft.trim()) {
      return;
    }
    library.save(draft, presetOf(node));
    close(true);
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="module-presets nodrag"
        aria-label={`Presets of ${name ?? title}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Presets: save these settings, or load saved ones"
        onClick={() => {
          setDraft(name ?? "");
          setReport(undefined);
          setOpen((current) => !current);
        }}
      >
        <PresetsIcon />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            className="preset-menu"
            role="dialog"
            aria-label={`Presets of ${name ?? title}`}
            style={{ left: place.x, top: place.y }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close(true);
              }
            }}
          >
            {builtIn.length > 0 && (
              <ul className="preset-menu-list preset-menu-built-in" aria-label="Built-in presets">
                {builtIn.map((preset) => (
                  <li key={preset.name} className="preset-menu-item">
                    <button
                      type="button"
                      className="preset-menu-load"
                      title={`Give this ${title} the settings of ${preset.name}, which comes with Trama`}
                      onClick={() => {
                        store.getState().applyPreset(nodeId, preset.node);
                        close(true);
                      }}
                    >
                      {preset.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {own.length === 0 ? (
              <p className="preset-menu-empty">{builtIn.length > 0 ? `No ${title} presets of your own yet` : `No ${title} presets yet`}</p>
            ) : (
              <ul className="preset-menu-list" aria-label="Saved presets">
                {own.map((preset) => (
                  <li key={preset.id} className="preset-menu-item">
                    <button
                      type="button"
                      className="preset-menu-load"
                      title={`Give this ${title} the settings of ${preset.name}`}
                      onClick={() => {
                        store.getState().applyPreset(nodeId, preset.node);
                        close(true);
                      }}
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      className="preset-menu-delete"
                      aria-label={`Delete preset ${preset.name}`}
                      title="Delete this preset"
                      onClick={() => library.remove(preset.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="preset-menu-save" onSubmit={save}>
              <input
                ref={field}
                className="preset-menu-name"
                aria-label="Preset name"
                placeholder="Preset name"
                maxLength={NODE_NAME_MAX_LENGTH}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                type="submit"
                className="hw subpatch-open-button"
                aria-label={replaces ? "Replace preset" : "Save preset"}
                disabled={!draft.trim()}
              >
                {replaces ? "Replace" : "Save"}
              </button>
            </form>
            {type === "subpatch" && <p className="preset-menu-hint">Saved subpatches are in the menu of modules too</p>}
            <div className="preset-menu-files">
              <button
                type="button"
                className="preset-menu-file"
                disabled={presets.length === 0}
                title="Save all the presets, of every module, to a file"
                onClick={() => void exportAll()}
              >
                Export all
              </button>
              <button
                type="button"
                className="preset-menu-file"
                title="Add the presets of a file; those with the same module and name are replaced"
                onClick={() => importer.current?.click()}
              >
                Import
              </button>
              <input
                ref={importer}
                type="file"
                accept="application/json,.json"
                aria-label="Import presets file"
                hidden
                onChange={(event) => void importFile(event)}
              />
            </div>
            {report && (
              <p
                className={report.error ? "preset-menu-error" : "preset-menu-hint"}
                role={report.error ? "alert" : "status"}
                aria-label="Presets file"
              >
                {report.text}
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
