import { describe, expect, it, vi } from "vitest";
import { defaultParams } from "../patch/registry";
import { memoryPresets, PresetLibrary, type PresetStorage } from "./presetLibrary";

const filter = (frequency: number) => ({ type: "filter" as const, params: { ...defaultParams("filter"), frequency } });

describe("PresetLibrary", () => {
  it("saves presets sorted by name, and tells whoever follows it", () => {
    const library = new PresetLibrary();
    const listener = vi.fn();
    library.subscribe(listener);

    library.save("dark", filter(300));
    library.save("Bright", filter(8000));

    expect(library.list().map(({ name }) => name)).toEqual(["Bright", "dark"]);
    expect(library.of("filter")).toHaveLength(2);
    expect(library.of("gain")).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the same list until it changes", () => {
    const library = new PresetLibrary();
    library.save("Dark", filter(300));

    expect(library.list()).toBe(library.list());
  });

  it("replaces a preset of the same type and name, whatever its case, and trims the name", () => {
    const library = new PresetLibrary();
    const first = library.save("Dark", filter(300));

    const second = library.save("  dark ", filter(200));
    library.save("Dark", { type: "gain", params: { gain: 0.2 } });

    expect(second.id).toBe(first.id);
    expect(library.of("filter")).toEqual([{ id: first.id, name: "dark", node: filter(200) }]);
    expect(library.list()).toHaveLength(2);
    expect(() => library.save("  ", filter(1))).toThrow();
  });

  it("keeps the presets in its storage, where another library reads them back", async () => {
    const storage = memoryPresets();
    const library = new PresetLibrary(storage);
    const kept = library.save("Dark", filter(300));
    library.save("Gone", filter(100));
    library.remove(library.list().find(({ name }) => name === "Gone")!.id);
    await new Promise((resolve) => setTimeout(resolve));

    const other = new PresetLibrary(storage);
    await other.load();

    expect(other.list()).toEqual([kept]);
  });

  it("leaves out a preset kept that is no longer valid", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const library = new PresetLibrary(
      memoryPresets([
        { id: "a", name: "Old", node: { type: "theremin", params: {} } },
        { id: "b", name: "Good", node: { type: "gain", params: { gain: 0.2 } } },
      ]),
    );

    await library.load();

    expect(library.list().map(({ name }) => name)).toEqual(["Good"]);
    warn.mockRestore();
  });

  it("keeps the presets saved while it reads the stored ones", async () => {
    let answer: (presets: []) => void = () => {};
    const storage: PresetStorage = { ...memoryPresets(), all: () => new Promise((resolve) => (answer = resolve)) };
    const library = new PresetLibrary(storage);

    const loading = library.load();
    library.save("Dark", filter(300));
    answer([]);
    await loading;

    expect(library.list().map(({ name }) => name)).toEqual(["Dark"]);
  });

  it("keeps working for the session when the storage fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing: PresetStorage = {
      all: () => Promise.reject(new Error("no")),
      put: () => Promise.reject(new Error("full")),
      delete: () => Promise.reject(new Error("no")),
    };
    const library = new PresetLibrary(failing);

    await library.load();
    library.save("Dark", filter(300));
    await new Promise((resolve) => setTimeout(resolve));

    expect(library.list()).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("imports presets, replacing those of the same type and name, and tells how many", () => {
    const library = new PresetLibrary();
    const dark = library.save("Dark", filter(300));

    const count = library.import([
      { name: "dark", node: filter(200) },
      { name: "Bright", node: filter(8000) },
    ]);

    expect(count).toBe(2);
    expect(library.list().map(({ name, node }) => [name, node.params.frequency])).toEqual([
      ["Bright", 8000],
      ["dark", 200],
    ]);
    expect(library.list()[1].id).toBe(dark.id);
  });
});
