import { parsePresetNode, serializePresetNode } from "../patch/serialization";
import type { Preset, PresetNode } from "../patch/presets";
import { NODE_NAME_MAX_LENGTH, type NodeType } from "../patch/types";
import { openDatabase, request } from "../storage/database";

/** A preset as it is kept: its node as a patch file writes it, checked again when read. */
export interface StoredPreset {
  id: string;
  name: string;
  node: unknown;
}

/** Where the presets are kept between sessions. */
export interface PresetStorage {
  all(): Promise<StoredPreset[]>;
  put(preset: StoredPreset): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Keeps the presets in memory only: for tests, and where the browser has no IndexedDB. */
export function memoryPresets(initial: StoredPreset[] = []): PresetStorage {
  const presets = new Map(initial.map((preset) => [preset.id, preset]));
  return {
    all: async () => [...presets.values()],
    put: async (preset) => {
      presets.set(preset.id, preset);
    },
    delete: async (id) => {
      presets.delete(id);
    },
  };
}

/** Keeps the presets in IndexedDB, next to the samples, shared by the tabs. */
export function indexedDbPresets(factory: IDBFactory = indexedDB): PresetStorage {
  const store = openDatabase(factory);
  return {
    all: async () => (await request((await store("presets", "readonly")).getAll())) as StoredPreset[],
    put: async (preset) => {
      await request((await store("presets", "readwrite")).put(preset));
    },
    delete: async (id) => {
      await request((await store("presets", "readwrite")).delete(id));
    },
  };
}

const byName = (a: Preset, b: Preset) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** Two names that differ only in case or accents name the same preset. */
const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

const newId = () => `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The presets saved in this browser, of every type of node, sorted by name. The list is the same
 * array until it changes, so components can follow it with `subscribe`.
 */
export class PresetLibrary {
  private readonly storage: PresetStorage;
  private presets: readonly Preset[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(storage: PresetStorage = memoryPresets()) {
    this.storage = storage;
  }

  /** Reads the presets kept, leaving out any that is no longer valid. */
  async load() {
    let stored: StoredPreset[];
    try {
      stored = await this.storage.all();
    } catch (error) {
      console.warn("Could not read the presets", error);
      return;
    }
    const read = stored.flatMap((preset): Preset[] => {
      try {
        return [{ id: preset.id, name: preset.name, node: parsePresetNode(preset.node) }];
      } catch (error) {
        console.warn(`Could not read the preset "${preset.name}"`, error);
        return [];
      }
    });
    // Those saved while it was reading stay.
    const saved = this.presets.filter(({ id }) => !read.some((preset) => preset.id === id));
    this.update([...read, ...saved]);
  }

  list = (): readonly Preset[] => this.presets;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The presets of a type of node. */
  of(type: NodeType): Preset[] {
    return this.presets.filter((preset) => preset.node.type === type);
  }

  /** Saves the settings of a node under a name; one of the same type and name is replaced. */
  save(name: string, node: PresetNode): Preset {
    const trimmed = name.trim().slice(0, NODE_NAME_MAX_LENGTH);
    if (!trimmed) {
      throw new Error("A preset needs a name");
    }
    const same = this.presets.find(
      (preset) => preset.node.type === node.type && sameName(preset.name, trimmed),
    );
    const preset: Preset = { id: same?.id ?? newId(), name: trimmed, node };
    this.update([...this.presets.filter(({ id }) => id !== preset.id), preset]);
    this.keep(() => this.storage.put({ id: preset.id, name: preset.name, node: serializePresetNode(node) }));
    return preset;
  }

  /** Saves presets from a file, replacing those of the same type and name; how many it saved. */
  import(presets: readonly { name: string; node: PresetNode }[]): number {
    presets.forEach(({ name, node }) => this.save(name, node));
    return presets.length;
  }

  remove(id: string) {
    this.update(this.presets.filter((preset) => preset.id !== id));
    this.keep(() => this.storage.delete(id));
  }

  private update(presets: Preset[]) {
    this.presets = [...presets].sort(byName);
    this.listeners.forEach((listener) => listener());
  }

  private keep(action: () => Promise<void>) {
    action().catch((error: unknown) => console.warn("Could not keep the presets for the next session", error));
  }
}
