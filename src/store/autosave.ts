import { parsePatch, serializePatch } from "../patch/serialization";
import type { PatchStore } from "./patchStore";

export const AUTOSAVE_KEY = "trama:patch";
/** Where the last autosaved patch that could not be opened, or was discarded, is kept. */
export const AUTOSAVE_BACKUP_KEY = "trama:patch:backup";
const AUTOSAVE_DELAY_MS = 500;

type AutosaveStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface AutosaveOptions {
  delay?: number;
}

/**
 * Loads the patch from the first storage that has one: that of the tab, which a reload keeps,
 * and then the one all tabs share, so a new tab starts from the last patch saved by any of them.
 */
export function restoreAutosave(store: PatchStore, storages: readonly AutosaveStorage[]): boolean {
  let saved: string | null | undefined;
  try {
    saved = storages.map((storage) => storage.getItem(AUTOSAVE_KEY)).find((item) => item !== null);
    if (saved === undefined || saved === null) {
      return false;
    }
    store.getState().loadPatch(parsePatch(JSON.parse(saved)));
    store.setState({ past: [], future: [] });
    return true;
  } catch (error) {
    console.warn("Could not restore the autosaved patch", error);
    if (typeof saved === "string") {
      keepBackup(storages, saved);
    }
    return false;
  }
}

/** Moves the autosaved patch aside, so the next start is empty; for a patch the app cannot work with. */
export function discardAutosave(storages: readonly AutosaveStorage[]) {
  for (const storage of storages) {
    try {
      const saved = storage.getItem(AUTOSAVE_KEY);
      if (saved !== null) {
        storage.setItem(AUTOSAVE_BACKUP_KEY, saved);
      }
      storage.removeItem(AUTOSAVE_KEY);
    } catch (error) {
      console.warn("Could not discard the autosaved patch", error);
    }
  }
}

function keepBackup(storages: readonly AutosaveStorage[], saved: string) {
  for (const storage of storages) {
    try {
      storage.setItem(AUTOSAVE_BACKUP_KEY, saved);
    } catch (error) {
      console.warn("Could not keep a copy of the autosaved patch", error);
    }
  }
}

/** Saves the patch to every storage once changes settle; one that fails does not stop the others. */
export function startAutosave(
  store: PatchStore,
  storages: readonly AutosaveStorage[],
  { delay = AUTOSAVE_DELAY_MS }: AutosaveOptions = {},
) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const save = () => {
    clearTimeout(timer);
    timer = undefined;
    const item = JSON.stringify(serializePatch(store.getState().toPatch()));
    for (const storage of storages) {
      try {
        storage.setItem(AUTOSAVE_KEY, item);
      } catch (error) {
        console.warn("Could not autosave the patch", error);
      }
    }
  };

  const flush = () => {
    if (timer !== undefined) {
      save();
    }
  };

  const unsubscribe = store.subscribe((state, previous) => {
    if (
      state.nodes !== previous.nodes ||
      state.connections !== previous.connections ||
      state.perform !== previous.perform ||
      state.hiddenLaunchers !== previous.hiddenLaunchers ||
      state.scenes !== previous.scenes ||
      state.meta !== previous.meta
    ) {
      clearTimeout(timer);
      timer = setTimeout(save, delay);
    }
  });
  window.addEventListener("pagehide", flush);

  return () => {
    flush();
    unsubscribe();
    window.removeEventListener("pagehide", flush);
  };
}
