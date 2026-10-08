import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../store/patchStore";
import { PatchStoreContext } from "../store/usePatchStore";
import { PaneMenu } from "./PaneMenu";

let store: ReturnType<typeof createPatchStore>;
let onClose: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  onClose = vi.fn<() => void>();
});

const setup = () =>
  render(
    <PatchStoreContext value={store}>
      <ReactFlowProvider>
        <PaneMenu at={{ x: 120, y: 80 }} onClose={onClose} />
        <p>Outside</p>
      </ReactFlowProvider>
    </PatchStoreContext>,
  );

const menu = () => screen.getByRole("listbox", { name: "Modules" });
const groupItems = (name: string) =>
  within(within(menu()).getByRole("group", { name }))
    .getAllByRole("option")
    .map((item) => item.getAttribute("aria-label"));

describe("PaneMenu", () => {
  it("opens where it was asked for, with the modules grouped as in the Add module menu", () => {
    setup();

    expect(screen.getByRole("dialog", { name: "Add module" })).toHaveStyle({ left: "120px", top: "80px" });
    expect(groupItems("Processing")).toContain("Filter");
    expect(groupItems("Patch")).toEqual(["Subpatch"]);
    expect(screen.getByRole("combobox", { name: "Search modules" })).toHaveFocus();
  });

  it("adds the module chosen where the menu was opened, and closes", async () => {
    setup();

    await userEvent.click(screen.getByRole("option", { name: "Filter" }));

    expect(store.getState().nodes).toMatchObject([{ type: "filter", position: { x: 120, y: 80 } }]);
    expect(onClose).toHaveBeenCalled();
  });

  it("offers the In and the Out inside a subpatch", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);

    setup();

    expect(groupItems("Patch")).toEqual(["Subpatch", "In", "Out"]);
  });

  it("closes with Escape, or with a click outside, adding nothing", () => {
    setup();

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search modules" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(screen.getByText("Outside"));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.pointerDown(menu());
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(store.getState().nodes).toEqual([]);
  });

  it("adds the module found with the search where the menu was opened", async () => {
    setup();

    await userEvent.keyboard("clock{Enter}");

    expect(store.getState().nodes).toMatchObject([{ type: "clock", position: { x: 120, y: 80 } }]);
    expect(onClose).toHaveBeenCalled();
  });
});
