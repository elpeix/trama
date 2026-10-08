import { useContext, useEffect, useEffectEvent, useRef, useState, type ChangeEvent } from "react";
import { isPresetsFile, parsePatch, parseSamples, PatchFormatError } from "../../patch/serialization";
import { SamplesContext } from "../SamplesContext";
import { DEFAULT_TEMPO } from "../../patch/types";
import { loadExample } from "../../patch/exampleCatalog";
import { savePatch } from "./savePatch";
import { ExamplesMenu } from "./ExamplesMenu";
import { LoadIcon, NewIcon, SaveIcon } from "./icons";
import { usePatchStore, usePatchStoreApi } from "../../store/usePatchStore";

export function PatchFileControls() {
  const store = usePatchStoreApi();
  const samples = useContext(SamplesContext);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const isEmpty = usePatchStore((state) => state.nodes.length === 0);

  const clear = () => {
    store.getState().loadPatch({ nodes: [], connections: [], tempo: DEFAULT_TEMPO });
    setError(null);
  };

  const save = () => savePatch(store.getState().toPatch(), samples ?? undefined);

  const onSaveShortcut = useEffectEvent((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onSaveShortcut);
    return () => window.removeEventListener("keydown", onSaveShortcut);
  }, []);

  /** Opens a patch read from `name`, with its samples, in place of the current one. */
  const open = async (name: string, read: () => Promise<unknown>) => {
    try {
      const input = await read();
      if (isPresetsFile(input)) {
        setError(`${name} holds presets, not a patch: import it from the presets menu of a module`);
        return;
      }
      const patch = parsePatch(input);
      await Promise.all(parseSamples(input).map((record) => samples?.put(record)));
      store.getState().loadPatch(patch);
      setError(null);
    } catch (cause) {
      setError(cause instanceof PatchFormatError ? cause.message : `${name} is not a valid patch file`);
    }
  };

  const load = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      await open(file.name, async () => JSON.parse(await file.text()) as unknown);
    }
  };

  return (
    <div className="patch-file">
      <div className="hw-group" role="group" aria-label="Patch file">
        <button
          type="button"
          className="hw"
          onClick={clear}
          disabled={isEmpty}
          aria-label="New"
          title="New: start an empty patch (can be undone)"
        >
          <NewIcon />
        </button>
        <button type="button" className="hw" onClick={save} aria-label="Save" title="Save the patch as a file">
          <SaveIcon />
        </button>
        <button
          type="button"
          className="hw"
          onClick={() => input.current?.click()}
          aria-label="Load"
          title="Load a patch file"
        >
          <LoadIcon />
        </button>
        <ExamplesMenu onChoose={(id) => open(`The example ${id}`, () => loadExample(id))} />
      </div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        aria-label="Load patch file"
        hidden
        onChange={load}
      />
      {error && (
        <span role="alert" className="patch-file-error">
          {error}
        </span>
      )}
    </div>
  );
}
