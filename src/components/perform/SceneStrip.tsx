import { useContext, useEffect, useState, type KeyboardEvent } from "react";
import { FIRST_SLOT } from "../../patch/patterns";
import { sceneStatus } from "../../patch/perform";
import { NODE_NAME_MAX_LENGTH, type PatternSlot } from "../../patch/types";
import { usePatchStore, usePatchStoreApi } from "../../store/usePatchStore";
import { EngineContext } from "../EngineContext";
import { playPattern } from "../sequencing/launch";
import { RemoveIcon } from "../RemoveIcon";

type Status = ReturnType<typeof sceneStatus>;

interface SceneStripProps {
  /** The paths of every node with patterns, those hidden from the launcher too. */
  paths: string[];
}

/**
 * The scenes of the launcher, each saved with the pattern every node plays, or is about to. A
 * click launches the pattern of each node of a scene together, on the next bar, and writes them into the song with Rec as launching them one by one would. The
 * scene playing is lit, and the one launched blinks until it takes over.
 */
export function SceneStrip({ paths }: SceneStripProps) {
  const engine = useContext(EngineContext);
  const store = usePatchStoreApi();
  const scenes = usePatchStore((state) => state.scenes);
  const saveScene = usePatchStore((state) => state.saveScene);
  const renameScene = usePatchStore((state) => state.renameScene);
  const removeScene = usePatchStore((state) => state.removeScene);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [editing, setEditing] = useState<{ index: number; draft: string } | null>(null);

  useEffect(() => {
    if (!engine) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      const next = scenes.map((scene) => sceneStatus(scene, (path) => engine.getPattern(path)));
      setStatuses((previous) =>
        previous.length === next.length && previous.every((status, index) => status === next[index]) ? previous : next,
      );
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [engine, scenes]);

  const save = () => {
    saveScene(
      Object.fromEntries(paths.map((path) => {
        const state = engine?.getPattern(path);
        return [path, state?.queued ?? state?.playing ?? FIRST_SLOT];
      })) as Record<string, PatternSlot>,
    );
  };

  const launch = (patterns: Record<string, PatternSlot>) => {
    for (const [path, slot] of Object.entries(patterns)) {
      playPattern(store, engine, path, path, slot, "bar");
    }
  };

  const finish = (save: boolean) => {
    if (save && editing) {
      renameScene(editing.index, editing.draft);
    }
    setEditing(null);
  };

  return (
    <div className="perform-scenes" role="group" aria-label="Scenes">
      <span className="param-label">Scenes</span>
      <div className="perform-scene-list">
        {scenes.map((scene, index) => {
          const label = scene.name ?? `Scene ${index + 1}`;
          return (
            <span key={index} className="perform-scene">
              {editing?.index === index ? (
                <input
                  className="param-label-input perform-scene-input"
                  aria-label={`Name of ${label}`}
                  value={editing.draft}
                  maxLength={NODE_NAME_MAX_LENGTH}
                  autoFocus
                  onFocus={(event) => event.target.select()}
                  onChange={(event) => setEditing({ index, draft: event.target.value })}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter") {
                      finish(true);
                    } else if (event.key === "Escape") {
                      finish(false);
                    }
                  }}
                  onBlur={() => finish(true)}
                />
              ) : (
                <button
                  type="button"
                  className="pattern-slot perform-scene-launch"
                  aria-label={`Launch ${label}`}
                  title="Click to launch its patterns on the next bar; double-click to rename it"
                  data-playing={statuses[index] === "playing" || undefined}
                  data-queued={statuses[index] === "queued" || undefined}
                  onClick={() => launch(scene.patterns)}
                  onDoubleClick={() => setEditing({ index, draft: label })}
                >
                  <span className="pattern-led" aria-hidden="true" />
                  {label}
                </button>
              )}
              <button
                type="button"
                className="remove-badge perform-remove perform-scene-remove"
                aria-label={`Remove ${label}`}
                title="Take this scene away"
                onClick={() => removeScene(index)}
              >
                <RemoveIcon />
              </button>
            </span>
          );
        })}
        <button
          type="button"
          className="hw clip-editor-action perform-scene-save"
          title="Keep the pattern each node plays now as a scene"
          onClick={save}
        >
          Save scene
        </button>
      </div>
    </div>
  );
}
