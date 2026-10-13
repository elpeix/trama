import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { ModuleMenu } from "./ModuleMenu";

const setup = () => {
  const store = createPatchStore({ sync: vi.fn() });
  render(
    <PatchStoreContext value={store}>
      <ReactFlowProvider>
        <ModuleMenu />
        <p>Outside</p>
      </ReactFlowProvider>
    </PatchStoreContext>,
  );
  return store;
};

const trigger = () => screen.getByRole("button", { name: "Add module" });
const menu = () => screen.queryByRole("listbox", { name: "Modules" });

describe("ModuleMenu", () => {
  it("opens a menu with the modules grouped by what they do", async () => {
    setup();
    expect(menu()).toBeNull();

    await userEvent.click(trigger());

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    const groups = within(menu()!).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Sources",
      "Processing",
      "Modulation",
      "Notes",
      "Output",
      "Patch",
    ]);
    expect(within(groups[3]).getAllByRole("option").map((item) => item.getAttribute("aria-label"))).toEqual([
      "Keyboard",
      "MIDI In",
      "Arp",
      "Seq",
      "Clip",
      "Drums",
    ]);
    expect(within(groups[1]).getAllByRole("option").map((item) => item.getAttribute("aria-label"))).toContain(
      "Mixer",
    );
    expect(within(menu()!).getAllByRole("option")).toHaveLength(44);
  });

  it("offers the In and the Out of a subpatch only inside one", async () => {
    const store = setup();
    const patchGroup = () =>
      within(within(menu()!).getByRole("group", { name: "Patch" }))
        .getAllByRole("option")
        .map((item) => item.getAttribute("aria-label"));
    await userEvent.click(trigger());
    expect(patchGroup()).toEqual(["Subpatch"]);
    await userEvent.click(trigger());

    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    await userEvent.click(trigger());

    expect(patchGroup()).toEqual(["Subpatch", "In", "Out"]);
  });

  it("describes each module", async () => {
    setup();
    await userEvent.click(trigger());

    expect(screen.getByRole("option", { name: "Seq" })).toHaveAccessibleDescription("A loop of 16 steps");
  });

  it("adds the chosen module and closes", async () => {
    const store = setup();
    await userEvent.click(trigger());

    await userEvent.click(screen.getByRole("option", { name: "LFO" }));

    expect(store.getState().nodes.map((node) => node.type)).toEqual(["lfo"]);
    expect(menu()).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it("places modules added one after the other at different positions", async () => {
    const store = setup();

    for (const name of ["Oscillator", "Filter"]) {
      await userEvent.click(trigger());
      await userEvent.click(screen.getByRole("option", { name }));
    }

    const [first, second] = store.getState().nodes;
    expect(first.position).not.toEqual(second.position);
  });

  it("works with the keyboard", async () => {
    const store = setup();
    trigger().focus();

    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("combobox", { name: "Search modules" })).toHaveFocus();

    await userEvent.keyboard("rev{Enter}");
    expect(store.getState().nodes.map((node) => node.type)).toEqual(["reverb"]);
    expect(menu()).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it("closes with Escape, giving the focus back", async () => {
    setup();
    await userEvent.click(trigger());

    await userEvent.keyboard("{Escape}");

    expect(menu()).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it("closes when clicking elsewhere", async () => {
    setup();
    await userEvent.click(trigger());

    await userEvent.click(screen.getByText("Outside"));

    expect(menu()).toBeNull();
  });
});
