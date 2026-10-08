import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXAMPLE_CATEGORIES, EXAMPLES } from "../../patch/exampleCatalog";
import { serializePatch } from "../../patch/serialization";
import { SampleLibrary } from "../../samples/sampleLibrary";
import { SamplesContext } from "../SamplesContext";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { PatchFileControls } from "./PatchFileControls";

let store: ReturnType<typeof createPatchStore>;
let downloaded: Blob | undefined;
let samples: SampleLibrary;

beforeEach(() => {
  downloaded = undefined;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    downloaded = blob;
    return "blob:patch";
  });
  URL.revokeObjectURL = vi.fn();
  store = createPatchStore({
    sync: vi.fn(),
  });
  samples = new SampleLibrary();
  render(
    <PatchStoreContext value={store}>
      <SamplesContext value={samples}>
        <PatchFileControls />
      </SamplesContext>
    </PatchStoreContext>,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const upload = (content: string) =>
  userEvent.upload(
    screen.getByLabelText("Load patch file"),
    new File([content], "patch.json", { type: "application/json" }),
  );

describe("PatchFileControls", () => {
  it("starts an empty patch that can be undone", async () => {
    store.getState().addNode("gain", { x: 0, y: 0 });
    const before = store.getState().toPatch();

    await userEvent.click(screen.getByRole("button", { name: "New" }));

    expect(store.getState().toPatch()).toEqual({ nodes: [], connections: [], tempo: 120 });
    store.getState().undo();
    expect(store.getState().toPatch()).toEqual(before);
  });

  it("disables New when the patch is empty", async () => {
    expect(screen.getByRole("button", { name: "New" })).toBeDisabled();

    act(() => {
      store.getState().addNode("gain", { x: 0, y: 0 });
    });

    expect(screen.getByRole("button", { name: "New" })).toBeEnabled();
  });

  it("clears the error when starting a new patch", async () => {
    store.getState().addNode("gain", { x: 0, y: 0 });
    await upload("not json");

    await userEvent.click(screen.getByRole("button", { name: "New" }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("downloads the current patch as JSON", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    store.getState().addNode("gain", { x: 0, y: 0 });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(click).toHaveBeenCalled();
    expect(JSON.parse(await downloaded!.text())).toEqual(serializePatch(store.getState().toPatch()));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:patch");
  });

  it("saves the patch file with Ctrl+S or Cmd+S instead of the page, also while typing", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    store.getState().addNode("gain", { x: 0, y: 0 });

    const ctrl = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(ctrl);
    await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(ctrl.defaultPrevented).toBe(true);
    expect(JSON.parse(await downloaded!.text())).toEqual(serializePatch(store.getState().toPatch()));

    const field = document.body.appendChild(document.createElement("input"));
    const cmd = new KeyboardEvent("keydown", { key: "S", metaKey: true, bubbles: true, cancelable: true });
    field.dispatchEvent(cmd);
    await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(2));
    expect(cmd.defaultPrevented).toBe(true);
    field.remove();
  });

  it("leaves other shortcuts with S alone", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    for (const init of [{ key: "s" }, { key: "s", ctrlKey: true, altKey: true }, { key: "s", metaKey: true, shiftKey: true }]) {
      const event = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(click).not.toHaveBeenCalled();
  });

  it("saves the samples the samplers play in the file, and leaves out the ones this browser lost", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const kick = await samples.add("kick.wav", "audio/wav", new Uint8Array([1, 2]).buffer);
    const first = store.getState().addNode("sampler", { x: 0, y: 0 });
    const second = store.getState().addNode("sampler", { x: 0, y: 0 });
    store.getState().updateParam(first.id, "sample", kick);
    store.getState().updateParam(second.id, "sample", "0123456789abcdef");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(downloaded).toBeDefined());
    expect(JSON.parse(await downloaded!.text()).samples).toEqual({
      [kick]: { name: "kick.wav", type: "audio/wav", data: "AQI=" },
    });
  });

  it("keeps the samples of a patch file it loads", async () => {
    const id = "0123456789abcdef";
    const file = {
      ...serializePatch({
        tempo: 120,
        nodes: [{ id: "sampler-1", type: "sampler", position: { x: 0, y: 0 }, params: { sample: id } }],
        connections: [],
      }),
      samples: { [id]: { name: "kick.wav", type: "audio/wav", data: "AQI=" } },
    };

    await upload(JSON.stringify(file));

    await vi.waitFor(() => expect(store.getState().nodes).toHaveLength(1));
    expect(await samples.get(id)).toMatchObject({ name: "kick.wav", type: "audio/wav" });
  });

  it("names the downloaded file", async () => {
    let name = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(name).toBe("trama-patch.json");
  });

  it("names the downloaded file after the title of the piece", async () => {
    let name = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    store.getState().setMeta({ title: "Pluja a la finestra" });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(name).toBe("pluja-a-la-finestra.json");
  });

  it("loads a patch file", async () => {
    const patch = {
      tempo: 90,
      nodes: [{ id: "gain-4", type: "gain" as const, position: { x: 0, y: 0 }, params: { gain: 0.2 } }],
      connections: [],
    };

    await upload(JSON.stringify(serializePatch(patch)));

    expect(store.getState().toPatch()).toEqual(patch);
  });

  it("opens the file picker from the Load button", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click");

    await userEvent.click(screen.getByRole("button", { name: "Load" }));

    expect(click).toHaveBeenCalled();
  });

  it("reports a file that is not JSON", async () => {
    await upload("not json");

    expect(await screen.findByRole("alert")).toHaveTextContent(/not a valid patch/i);
  });

  it("reports an invalid patch and keeps the current one", async () => {
    store.getState().addNode("gain", { x: 0, y: 0 });

    await upload(JSON.stringify({ version: 1, nodes: [{ id: "a", type: "theremin" }], connections: [] }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/theremin/);
    expect(store.getState().nodes).toHaveLength(1);
  });

  it("tells a presets file from a patch, and keeps the current patch", async () => {
    store.getState().addNode("gain", { x: 0, y: 0 });

    await upload(JSON.stringify({ kind: "trama-presets", version: 1, presets: [] }));

    expect(await screen.findByRole("alert")).toHaveTextContent("patch.json holds presets, not a patch");
    expect(store.getState().nodes).toHaveLength(1);
  });

  it("clears the error after a successful load", async () => {
    await upload("not json");
    await upload(JSON.stringify(serializePatch({ nodes: [], connections: [], tempo: 120 })));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  describe("examples", () => {
    const openExamples = async () => {
      await userEvent.click(screen.getByRole("button", { name: "Examples" }));
      return screen.getByRole("dialog", { name: "Examples" });
    };

    it("lists the examples, each with what it does and what it needs to be heard", async () => {
      const menu = await openExamples();

      expect(within(menu).getAllByRole("button")).toHaveLength(EXAMPLES.length);
      expect(within(menu).getByRole("button", { name: /^Basic synth/ })).toHaveTextContent("Play the keys");
      expect(within(menu).getByRole("button", { name: /^Audio input/ })).toHaveTextContent("Uses the microphone");
      expect(within(menu).getByRole("button", { name: /^Sequencer/ })).toHaveTextContent(/16-step bass line/);
      expect(within(menu).getByRole("button", { name: /^Sequencer/ })).not.toHaveTextContent(/Play the keys/);
    });

    const search = () => screen.getByRole("searchbox", { name: "Search examples" });
    const titles = (menu: HTMLElement) =>
      within(menu)
        .queryAllByRole("button")
        .map((button) => button.querySelector(".examples-menu-title")?.textContent);

    it("opens with the search field focused, and the examples in sections by category", async () => {
      const menu = await openExamples();
      const sections = within(menu).getAllByRole("group");

      expect(search()).toHaveFocus();
      expect(sections.map((section) => section.getAttribute("aria-label"))).toEqual(
        EXAMPLE_CATEGORIES.map(({ label }) => label),
      );
      expect(within(sections[0]).getByRole("heading", { name: EXAMPLE_CATEGORIES[0].label })).toBeInTheDocument();
      expect(within(sections[0]).getByRole("button", { name: /^Basic synth/ })).toBeInTheDocument();
      expect(within(sections[1]).getByRole("button", { name: /^Violin/ })).toBeInTheDocument();
    });

    it("narrows the examples to those that match as you type, in a single list", async () => {
      const menu = await openExamples();

      await userEvent.type(search(), "violin");

      expect(within(menu).queryAllByRole("group")).toHaveLength(0);
      expect(titles(menu)).toEqual(["Violin", "Strings"]);
    });

    it("finds the examples of a category by its name", async () => {
      const menu = await openExamples();

      await userEvent.type(search(), "effects");

      expect(titles(menu)).toEqual(
        EXAMPLES.filter(({ category }) => category === "effects").map(({ title }) => title),
      );
    });

    it("says when no example matches", async () => {
      const menu = await openExamples();

      await userEvent.type(search(), "zzz");

      expect(within(menu).queryAllByRole("button")).toHaveLength(0);
      expect(menu).toHaveTextContent("No example matches “zzz”");
    });

    it("loads the best match with Enter", async () => {
      await openExamples();

      await userEvent.type(search(), "seque{Enter}");

      await vi.waitFor(() => expect(store.getState().nodes.some((node) => node.type === "sequencer")).toBe(true));
      expect(screen.queryByRole("dialog", { name: "Examples" })).toBeNull();
    });

    it("clears the search with Escape before closing", async () => {
      const menu = await openExamples();
      await userEvent.type(search(), "violin");

      await userEvent.keyboard("{Escape}");

      expect(search()).toHaveValue("");
      expect(within(menu).getAllByRole("button")).toHaveLength(EXAMPLES.length);
    });

    it("loads the example chosen in place of the patch, and closes", async () => {
      store.getState().addNode("gain", { x: 0, y: 0 });
      const before = store.getState().toPatch();
      const menu = await openExamples();

      await userEvent.click(within(menu).getByRole("button", { name: /^Sequencer/ }));

      await vi.waitFor(() => expect(store.getState().nodes.some((node) => node.type === "sequencer")).toBe(true));
      expect(screen.queryByRole("dialog", { name: "Examples" })).toBeNull();
      store.getState().undo();
      expect(store.getState().toPatch()).toEqual(before);
    });

    it("keeps the samples an example carries", async () => {
      const menu = await openExamples();

      await userEvent.click(within(menu).getByRole("button", { name: /^Sampler/ }));

      await vi.waitFor(() => expect(store.getState().nodes.some((node) => node.type === "sampler")).toBe(true));
      const sampler = store.getState().nodes.find((node) => node.type === "sampler")!;
      expect(await samples.get(String(sampler.params.sample))).toBeDefined();
    });

    it("clears the error of a file once an example loads", async () => {
      await upload("not json");
      const menu = await openExamples();

      await userEvent.click(within(menu).getByRole("button", { name: /^Wind/ }));

      await vi.waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    });

    it("closes with Escape, back on its button", async () => {
      await openExamples();

      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("dialog", { name: "Examples" })).toBeNull();
      expect(screen.getByRole("button", { name: "Examples" })).toHaveFocus();
    });

    it("closes on a click outside it", async () => {
      await openExamples();

      await userEvent.click(document.body);

      expect(screen.queryByRole("dialog", { name: "Examples" })).toBeNull();
    });

    it("toggles from its button", async () => {
      await openExamples();

      await userEvent.click(screen.getByRole("button", { name: "Examples" }));

      expect(screen.queryByRole("dialog", { name: "Examples" })).toBeNull();
    });
  });
});
