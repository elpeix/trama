import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePatch } from "../patch/serialization";
import type { Patch } from "../patch/types";
import { AUTOSAVE_BACKUP_KEY, AUTOSAVE_KEY, discardAutosave, restoreAutosave, startAutosave } from "./autosave";
import { createPatchStore, type PatchEngine } from "./patchStore";

const patch: Patch = {
  tempo: 120,
  nodes: [
    { id: "noise-3", type: "noise", position: { x: 0, y: 0 }, params: {} },
    { id: "output-4", type: "output", position: { x: 200, y: 0 }, params: { volume: 1, limiter: "on" } },
  ],
  connections: [
    { id: "noise-3:audio->output-4:audio", source: { nodeId: "noise-3", port: "audio" }, target: { nodeId: "output-4", port: "audio" } },
  ],
};

class MemoryStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

let storage: MemoryStorage;
let store: ReturnType<typeof createPatchStore>;
let sync: ReturnType<typeof vi.fn<PatchEngine["sync"]>>;

const saved = () => {
  const item = storage.getItem(AUTOSAVE_KEY);
  return item === null ? null : JSON.parse(item);
};

beforeEach(() => {
  storage = new MemoryStorage();
  sync = vi.fn<PatchEngine["sync"]>();
  store = createPatchStore({ sync });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("restoreAutosave", () => {
  it("loads the saved patch without an undo step", () => {
    storage.setItem(AUTOSAVE_KEY, JSON.stringify(serializePatch(patch)));

    expect(restoreAutosave(store, [storage])).toBe(true);

    expect(store.getState().toPatch()).toEqual(patch);
    expect(sync).toHaveBeenLastCalledWith(patch);
    expect(store.getState().past).toEqual([]);
    expect(store.getState().addNode("gain", { x: 0, y: 0 }).id).toBe("gain-5");
  });

  it("does nothing when nothing was saved", () => {
    expect(restoreAutosave(store, [storage])).toBe(false);

    expect(sync).not.toHaveBeenCalled();
  });

  it.each([
    ["is not JSON", "{"],
    ["is not a valid patch", JSON.stringify({ version: 1, nodes: [{ id: "x", type: "nope" }], connections: [] })],
  ])("starts empty when the saved patch %s", (_, item) => {
    storage.setItem(AUTOSAVE_KEY, item);

    expect(restoreAutosave(store, [storage])).toBe(false);

    expect(store.getState().nodes).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it("starts empty when the engine rejects the saved patch", () => {
    storage.setItem(AUTOSAVE_KEY, JSON.stringify(serializePatch(patch)));
    sync.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    expect(restoreAutosave(store, [storage])).toBe(false);

    expect(store.getState().nodes).toEqual([]);
    expect(sync).toHaveBeenLastCalledWith({ nodes: [], connections: [], tempo: 120 });
  });

  it("starts empty when the storage cannot be read", () => {
    storage.getItem = () => {
      throw new Error("denied");
    };

    expect(restoreAutosave(store, [storage])).toBe(false);
  });

  it("keeps a copy of the saved patch it cannot open, which the next autosave would overwrite", () => {
    const newer = JSON.stringify({ ...serializePatch(patch), version: 99 });
    storage.setItem(AUTOSAVE_KEY, newer);

    expect(restoreAutosave(store, [storage])).toBe(false);

    expect(storage.getItem(AUTOSAVE_BACKUP_KEY)).toBe(newer);
  });

  it("keeps the copy of an older failure when nothing was saved since", () => {
    storage.setItem(AUTOSAVE_BACKUP_KEY, "older");

    restoreAutosave(store, [storage]);

    expect(storage.getItem(AUTOSAVE_BACKUP_KEY)).toBe("older");
  });
});

describe("discardAutosave", () => {
  it("moves the saved patch aside in every storage, so the next start is empty", () => {
    const tab = new MemoryStorage();
    const item = JSON.stringify(serializePatch(patch));
    storage.setItem(AUTOSAVE_KEY, item);
    tab.setItem(AUTOSAVE_KEY, item);

    discardAutosave([tab, storage]);

    expect(tab.getItem(AUTOSAVE_KEY)).toBeNull();
    expect(storage.getItem(AUTOSAVE_KEY)).toBeNull();
    expect(storage.getItem(AUTOSAVE_BACKUP_KEY)).toBe(item);
    expect(restoreAutosave(store, [tab, storage])).toBe(false);
  });

  it("goes on with the other storages when one fails", () => {
    const broken = new MemoryStorage();
    broken.removeItem = () => {
      throw new Error("denied");
    };
    storage.setItem(AUTOSAVE_KEY, "{}");

    discardAutosave([broken, storage]);

    expect(storage.getItem(AUTOSAVE_KEY)).toBeNull();
  });
});

describe("startAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("saves the patch after changes settle", () => {
    const stop = startAutosave(store, [storage], { delay: 500 });

    store.getState().addNode("noise", { x: 0, y: 0 });
    vi.advanceTimersByTime(300);
    store.getState().moveNode("noise-1", { x: 10, y: 0 });
    vi.advanceTimersByTime(300);
    expect(saved()).toBeNull();

    vi.advanceTimersByTime(200);
    expect(saved()).toEqual(serializePatch(store.getState().toPatch()));
    stop();
  });

  it("saves undo and redo too", () => {
    const stop = startAutosave(store, [storage], { delay: 0 });
    store.getState().addNode("noise", { x: 0, y: 0 });
    vi.runAllTimers();

    store.getState().undo();
    vi.runAllTimers();

    expect(saved().nodes).toEqual([]);
    stop();
  });

  it("saves the knobs pinned to perform", () => {
    store.getState().addNode("filter", { x: 0, y: 0 });
    const stop = startAutosave(store, [storage], { delay: 0 });

    store.getState().togglePinned("filter-1.Q");
    vi.runAllTimers();

    expect(saved().perform).toEqual([{ key: "filter-1.Q" }]);
    stop();
  });

  it("saves the rows hidden from the launcher", () => {
    store.getState().addNode("sequencer", { x: 0, y: 0 });
    const stop = startAutosave(store, [storage], { delay: 0 });

    store.getState().toggleLauncher("sequencer-1");
    vi.runAllTimers();

    expect(saved().hiddenLaunchers).toEqual(["sequencer-1"]);
    stop();
  });

  it("saves the scenes", () => {
    store.getState().addNode("sequencer", { x: 0, y: 0 });
    const stop = startAutosave(store, [storage], { delay: 0 });

    store.getState().saveScene({ "sequencer-1": "B1" });
    vi.runAllTimers();

    expect(saved().scenes).toEqual([{ patterns: { "sequencer-1": "B1" } }]);
    stop();
  });

  it("saves the meta of the piece", () => {
    const stop = startAutosave(store, [storage], { delay: 0 });

    store.getState().setMeta({ title: "Rain" });
    vi.runAllTimers();

    expect(saved().meta).toEqual({ title: "Rain" });
    stop();
  });

  it("ignores view changes", () => {
    store.getState().addNode("noise", { x: 0, y: 0 });
    const stop = startAutosave(store, [storage], { delay: 0 });

    store.getState().setNodeView("noise-1", { selected: true });
    vi.runAllTimers();

    expect(saved()).toBeNull();
    stop();
  });

  it("saves pending changes when the page is hidden", () => {
    const stop = startAutosave(store, [storage], { delay: 500 });
    store.getState().addNode("noise", { x: 0, y: 0 });

    window.dispatchEvent(new Event("pagehide"));

    expect(saved().nodes).toHaveLength(1);
    stop();
  });

  it("keeps working when the storage is full", () => {
    storage.setItem = () => {
      throw new Error("quota");
    };
    const stop = startAutosave(store, [storage], { delay: 0 });

    store.getState().addNode("noise", { x: 0, y: 0 });

    expect(() => vi.runAllTimers()).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
    stop();
  });

  it("saves pending changes and stops listening when stopped", () => {
    const stop = startAutosave(store, [storage], { delay: 500 });
    store.getState().addNode("noise", { x: 0, y: 0 });

    stop();
    expect(saved().nodes).toHaveLength(1);

    store.getState().addNode("gain", { x: 0, y: 0 });
    vi.runAllTimers();
    expect(saved().nodes).toHaveLength(1);
  });
});

describe("an autosave for each tab", () => {
  let tab: MemoryStorage;
  const other = { ...patch, tempo: 90 };
  const item = (source: MemoryStorage) => JSON.parse(source.getItem(AUTOSAVE_KEY)!);

  beforeEach(() => {
    tab = new MemoryStorage();
  });

  it("brings back the patch of the tab itself, not the one another tab saved last", () => {
    tab.setItem(AUTOSAVE_KEY, JSON.stringify(serializePatch(patch)));
    storage.setItem(AUTOSAVE_KEY, JSON.stringify(serializePatch(other)));

    restoreAutosave(store, [tab, storage]);

    expect(store.getState().tempo).toBe(120);
  });

  it("starts a new tab from the patch any tab saved last", () => {
    storage.setItem(AUTOSAVE_KEY, JSON.stringify(serializePatch(other)));

    expect(restoreAutosave(store, [tab, storage])).toBe(true);

    expect(store.getState().tempo).toBe(90);
  });

  it("saves for the tab and for the tabs to come", () => {
    vi.useFakeTimers();
    const stop = startAutosave(store, [tab, storage], { delay: 0 });

    store.getState().addNode("noise", { x: 0, y: 0 });
    vi.runAllTimers();

    expect(item(tab).nodes).toHaveLength(1);
    expect(item(storage).nodes).toHaveLength(1);
    stop();
  });

  it("still saves for the tabs to come when the storage of the tab fails", () => {
    vi.useFakeTimers();
    tab.setItem = () => {
      throw new Error("denied");
    };
    const stop = startAutosave(store, [tab, storage], { delay: 0 });

    store.getState().addNode("noise", { x: 0, y: 0 });
    vi.runAllTimers();

    expect(item(storage).nodes).toHaveLength(1);
    stop();
  });
});
