import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeType } from "../../patch/types";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { ModuleList } from "./ModuleList";
import type { Preset } from "../../patch/presets";
import { PresetLibrary } from "../../presets/presetLibrary";
import { PresetsContext } from "../PresetsContext";

let onChoose: ReturnType<typeof vi.fn<(type: NodeType) => void>>;
let onClose: ReturnType<typeof vi.fn<(key: "Escape" | "Tab") => void>>;

beforeEach(() => {
  onChoose = vi.fn<(type: NodeType) => void>();
  onClose = vi.fn<(key: "Escape" | "Tab") => void>();
  render(
    <PatchStoreContext value={createPatchStore({ sync: vi.fn() })}>
      <ModuleList onChoose={onChoose} onClose={onClose} />
    </PatchStoreContext>,
  );
});

const search = () => screen.getByRole("combobox", { name: "Search modules" });
const list = () => screen.getByRole("listbox", { name: "Modules" });
const options = () => within(list()).queryAllByRole("option").map((option) => option.getAttribute("aria-label"));
const active = () => screen.getByRole("option", { selected: true });
const description = () => screen.getByTestId("module-description");

describe("ModuleList", () => {
  it("opens with the search field focused and the first module marked and described", () => {
    expect(search()).toHaveFocus();
    expect(within(list()).getAllByRole("group")).toHaveLength(6);
    expect(active()).toHaveAccessibleName("Oscillator");
    expect(search()).toHaveAttribute("aria-activedescendant", active().id);
    expect(description()).toHaveTextContent("A tone with a classic waveform");
  });

  it("names each module on a single line, and keeps what it does for its description", () => {
    const seq = screen.getByRole("option", { name: "Seq" });

    expect(seq).toHaveTextContent(/^Seq$/);
    expect(seq).toHaveAccessibleDescription("A loop of 16 steps");
  });

  it("narrows the modules to those that match as you type, the best first, and adds it with Enter", async () => {
    await userEvent.type(search(), "fil");

    expect(within(list()).queryAllByRole("group")).toHaveLength(0);
    expect(options()).toEqual(["Filter", "Custom Filter"]);
    expect(screen.getByRole("option", { name: "Custom Filter" })).toHaveTextContent("A filter with the response you draw");
    expect(active()).toHaveAccessibleName("Filter");

    await userEvent.keyboard("{Enter}");
    expect(onChoose).toHaveBeenCalledWith("filter");
  });

  it("moves the mark with the arrows, round the ends, and describes the module marked", async () => {
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(active()).toHaveAccessibleName("Filter");
    expect(description()).toHaveTextContent("Cuts or boosts a band of frequencies");

    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(active()).toHaveAccessibleName("Subpatch");

    await userEvent.keyboard("{Enter}");
    expect(onChoose).toHaveBeenCalledWith("subpatch");
  });

  it("marks and describes the module under the mouse, and adds the one clicked", async () => {
    fireEvent.mouseEnter(screen.getByRole("option", { name: "Reverb" }));
    expect(active()).toHaveAccessibleName("Reverb");
    expect(description()).toHaveTextContent("The sound of a room");

    await userEvent.click(screen.getByRole("option", { name: "Clock" }));
    expect(onChoose).toHaveBeenCalledWith("clock");
    expect(search()).toHaveFocus();
  });

  it("says when nothing matches, and then adds nothing", async () => {
    await userEvent.type(search(), "zzz{Enter}");

    expect(options()).toEqual([]);
    expect(list()).toHaveTextContent("No module matches “zzz”");
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("clears the search with Escape, and asks to close with Escape again or with Tab", async () => {
    await userEvent.type(search(), "rev{Escape}");
    expect(search()).toHaveValue("");
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenLastCalledWith("Escape");

    await userEvent.keyboard("{Tab}");
    expect(onClose).toHaveBeenLastCalledWith("Tab");
  });
});

describe("ModuleList with modules of your own", () => {
  const renderWith = (onChoosePreset?: (preset: Preset) => void) => {
    cleanup();
    const presets = new PresetLibrary();
    presets.save("Kick voice", {
      type: "subpatch",
      params: { voices: 1 },
      patch: { nodes: [{ id: "gain-1", type: "gain", position: { x: 0, y: 0 }, params: { gain: 0.5 } }], connections: [] },
    });
    presets.save("Dark", { type: "filter", params: { frequency: 300 } });
    render(
      <PatchStoreContext value={createPatchStore({ sync: vi.fn() })}>
        <PresetsContext value={presets}>
          <ModuleList onChoose={onChoose} onChoosePreset={onChoosePreset} onClose={onClose} />
        </PresetsContext>
      </PatchStoreContext>,
    );
    return presets;
  };

  it("lists the subpatches saved as modules of their own, not the presets of other modules", () => {
    renderWith(vi.fn());

    const mine = screen.getByRole("group", { name: "My modules" });
    expect(within(mine).getAllByRole("option").map((option) => option.getAttribute("aria-label"))).toEqual(["Kick voice"]);
    expect(within(mine).getByRole("option")).toHaveAccessibleDescription("A subpatch of yours, 1 module");
  });

  it("finds them as you type, and adds the one chosen", async () => {
    const onChoosePreset = vi.fn();
    const presets = renderWith(onChoosePreset);

    await userEvent.type(search(), "kick");
    expect(options()).toEqual(["Kick voice"]);
    await userEvent.keyboard("{Enter}");

    expect(onChoosePreset).toHaveBeenCalledWith(presets.of("subpatch")[0]);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("leaves them out when it cannot add them", () => {
    renderWith();

    expect(screen.queryByRole("group", { name: "My modules" })).toBeNull();
  });
});
