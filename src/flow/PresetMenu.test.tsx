import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresetsContext } from "../components/PresetsContext";
import { SamplesContext } from "../components/SamplesContext";
import { SampleLibrary } from "../samples/sampleLibrary";
import { serializePresets } from "../patch/serialization";
import { defaultParams } from "../patch/registry";
import { PresetLibrary } from "../presets/presetLibrary";
import type { NodeType } from "../patch/types";
import { createPatchStore } from "../store/patchStore";
import { PatchStoreContext } from "../store/usePatchStore";
import { ModuleNode } from "./ModuleNode";

let store: ReturnType<typeof createPatchStore>;
let presets: PresetLibrary;
let samples: SampleLibrary;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  presets = new PresetLibrary();
  samples = new SampleLibrary();
});

const renderNode = (type: NodeType = "filter") => {
  const { id } = store.getState().addNode(type, { x: 0, y: 0 });
  const draw = () => {
    const node = store.getState().nodes.find((candidate) => candidate.id === id)!;
    return (
      <PatchStoreContext value={store}>
        <PresetsContext value={presets}>
          <SamplesContext value={samples}>
            <ReactFlowProvider>
              <ModuleNode id={id} data={{ type: node.type, name: node.name, params: node.params, patch: node.patch }} />
            </ReactFlowProvider>
          </SamplesContext>
        </PresetsContext>
      </PatchStoreContext>
    );
  };
  const view = render(draw());
  return { id, redraw: () => view.rerender(draw()) };
};

const params = () => store.getState().nodes[0].params;
const menu = () => screen.getByRole("dialog", { name: "Presets of Filter" });
const openMenu = () => userEvent.click(screen.getByRole("button", { name: "Presets of Filter" }));

describe("PresetMenu", () => {
  it("saves the settings of the node under a name, with the name field focused", async () => {
    renderNode();
    store.getState().updateParam(store.getState().nodes[0].id, "frequency", 300, { merge: false });
    await openMenu();

    expect(within(menu()).getByText("No Filter presets yet")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Preset name" })).toHaveFocus();
    await userEvent.keyboard("Dark{Enter}");

    expect(presets.of("filter")).toMatchObject([{ name: "Dark", node: { type: "filter", params: { frequency: 300 } } }]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("gives the node the settings of a preset chosen, as one undo step", async () => {
    presets.save("Dark", { type: "filter", params: { frequency: 300, Q: 4, type: "lowpass" } });
    presets.save("Loud", { type: "gain", params: { gain: 1 } });
    renderNode();
    await openMenu();

    expect(within(menu()).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Dark×"]);
    await userEvent.click(within(menu()).getByRole("button", { name: "Dark" }));

    expect(params()).toMatchObject({ frequency: 300, Q: 4 });
    store.getState().undo();
    expect(params()).toMatchObject({ frequency: 1200, Q: 1 });
  });

  it("says a name already saved replaces that preset", async () => {
    presets.save("Dark", { type: "filter", params: { frequency: 300 } });
    renderNode();
    await openMenu();

    await userEvent.type(screen.getByRole("textbox", { name: "Preset name" }), "dark");

    expect(screen.getByRole("button", { name: "Replace preset" })).toBeEnabled();
  });

  it("deletes a preset", async () => {
    presets.save("Dark", { type: "filter", params: { frequency: 300 } });
    renderNode();
    await openMenu();

    await userEvent.click(screen.getByRole("button", { name: "Delete preset Dark" }));

    expect(presets.list()).toEqual([]);
    expect(within(menu()).getByText("No Filter presets yet")).toBeInTheDocument();
  });

  it("closes with Escape, giving the focus back to its button", async () => {
    renderNode();
    await openMenu();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Presets of Filter" })).toHaveFocus();
  });

  it("starts the name of a preset from the name of the node, and cannot save without one", async () => {
    const { id, redraw } = renderNode();
    store.getState().renameNode(id, "Bass filter");
    redraw();
    await userEvent.click(screen.getByRole("button", { name: "Presets of Bass filter" }));

    const field = screen.getByRole("textbox", { name: "Preset name" });
    expect(field).toHaveValue("Bass filter");
    await userEvent.clear(field);
    expect(screen.getByRole("button", { name: "Save preset" })).toBeDisabled();
  });

  describe("built in", () => {
    const windMenu = () => screen.getByRole("dialog", { name: "Presets of Wind" });
    const openWindMenu = () => userEvent.click(screen.getByRole("button", { name: "Presets of Wind" }));

    it("lists the presets that come with the module before the saved ones, and loads one as one undo step", async () => {
      presets.save("Mine", { type: "wind", params: { exciter: "lips" } });
      renderNode("wind");
      await openWindMenu();

      const builtIn = within(windMenu()).getByRole("list", { name: "Built-in presets" });
      expect(within(builtIn).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Flute", "Oboe", "Clarinet", "Horn", "Bassoon", "Alto sax", "Alto recorder", "Pan flute", "Flabiol", "Tible", "Tenora", "Fiscorn", "Trumpet", "Trombone"]);
      expect(within(windMenu()).getAllByRole("list").map((list) => list.getAttribute("aria-label"))).toEqual(["Built-in presets", "Saved presets"]);
      await userEvent.click(within(builtIn).getByRole("button", { name: "Oboe" }));

      expect(params()).toMatchObject({ exciter: "double reed", bore: "cone", bell: 4500 });
      expect(screen.queryByRole("dialog")).toBeNull();
      store.getState().undo();
      expect(params()).toMatchObject({ exciter: "reed", bore: "cylinder" });
    });

    it("cannot delete a built-in preset", async () => {
      renderNode("wind");
      await openWindMenu();

      expect(within(windMenu()).queryByRole("button", { name: "Delete preset Oboe" })).toBeNull();
    });

    it("says there are none of your own yet when only the built-in ones are there", async () => {
      renderNode("wind");
      await openWindMenu();

      expect(within(windMenu()).getByText("No Wind presets of your own yet")).toBeInTheDocument();
      expect(within(windMenu()).queryByRole("list", { name: "Saved presets" })).toBeNull();
    });

    it("saves a preset named as a built-in one as one of your own, leaving the built-in one as it is", async () => {
      renderNode("wind");
      await openWindMenu();
      await userEvent.type(screen.getByRole("textbox", { name: "Preset name" }), "Oboe");

      expect(screen.getByRole("button", { name: "Save preset" })).toBeInTheDocument();
      await userEvent.keyboard("{Enter}");

      expect(presets.of("wind")).toMatchObject([{ name: "Oboe", node: { params: { exciter: "reed" } } }]);
      await openWindMenu();
      expect(within(within(windMenu()).getByRole("list", { name: "Built-in presets" })).getByRole("button", { name: "Oboe" })).toBeInTheDocument();
    });

    it("lists none for a module that has none", async () => {
      renderNode();
      await openMenu();

      expect(within(menu()).queryByRole("list", { name: "Built-in presets" })).toBeNull();
    });
  });

  it("offers no presets for the In and the Out of a subpatch", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    renderNode("inlet");

    expect(screen.queryByRole("button", { name: /Presets of/ })).toBeNull();
  });

  describe("files", () => {
    const upload = (content: string) =>
      userEvent.upload(screen.getByLabelText("Import presets file"), new File([content], "presets.json", { type: "application/json" }));

    it("exports every preset, of every module, with the samples they play", async () => {
      let downloaded: Blob | undefined;
      URL.createObjectURL = vi.fn((blob: Blob) => {
        downloaded = blob;
        return "blob:presets";
      });
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const kick = await samples.add("kick.wav", "audio/wav", new Uint8Array([1]).buffer);
      presets.save("Dark", { type: "filter", params: { frequency: 300 } });
      presets.save("Kick", { type: "sampler", params: { ...defaultParams("sampler"), sample: kick } });
      renderNode();
      await openMenu();

      await userEvent.click(screen.getByRole("button", { name: "Export all" }));

      await vi.waitFor(() => expect(downloaded).toBeDefined());
      const file = JSON.parse(await downloaded!.text());
      expect(file.presets.map(({ name }: { name: string }) => name)).toEqual(["Dark", "Kick"]);
      expect(Object.keys(file.samples)).toEqual([kick]);
      vi.restoreAllMocks();
    });

    it("cannot export without presets", async () => {
      renderNode();
      await openMenu();

      expect(screen.getByRole("button", { name: "Export all" })).toBeDisabled();
    });

    it("imports the presets of a file and the samples they play, and tells how many", async () => {
      const id = "0123456789abcdef";
      const file = serializePresets(
        [
          { name: "Bright", node: { type: "filter", params: { ...defaultParams("filter"), frequency: 8000 } } },
          { name: "Kick", node: { type: "sampler", params: { ...defaultParams("sampler"), sample: id } } },
        ],
        [{ id, name: "kick.wav", type: "audio/wav", data: new Uint8Array([1]).buffer }],
      );
      renderNode();
      await openMenu();

      await upload(JSON.stringify(file));

      expect(await screen.findByRole("status", { name: "Presets file" })).toHaveTextContent("Imported 2 presets");
      expect(within(menu()).getByRole("button", { name: "Bright" })).toBeInTheDocument();
      expect(presets.of("sampler")).toHaveLength(1);
      expect(await samples.get(id)).toMatchObject({ name: "kick.wav" });
    });

    it("says what is wrong with a file it cannot import, and imports nothing", async () => {
      renderNode();
      await openMenu();

      await upload(JSON.stringify({ kind: "trama-presets", version: 1, presets: [{ name: "Loud", node: { type: "gain", params: { gain: 9 } } }] }));
      expect(await screen.findByRole("alert", { name: "Presets file" })).toHaveTextContent('Preset "Loud"');

      await upload("not json");
      expect(await screen.findByRole("alert", { name: "Presets file" })).toHaveTextContent("presets.json is not a presets file");
      expect(presets.list()).toEqual([]);
    });
  });
});
