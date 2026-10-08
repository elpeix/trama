import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../store/patchStore";
import { PatchStoreContext } from "../store/usePatchStore";
import { SubpatchPath } from "./SubpatchPath";

const setup = () => {
  const store = createPatchStore({ sync: vi.fn() });
  const outer = store.getState().addNode("subpatch", { x: 0, y: 0 });
  store.getState().renameNode(outer.id, "Voice");
  store.getState().openSubpatch(outer.id);
  const inner = store.getState().addNode("subpatch", { x: 0, y: 0 });
  store.getState().openSubpatch(inner.id);
  render(
    <PatchStoreContext value={store}>
      <SubpatchPath />
    </PatchStoreContext>,
  );
  return store;
};

describe("SubpatchPath", () => {
  it("shows where the graph on show is, from the whole patch down", () => {
    setup();

    const path = screen.getByRole("navigation", { name: "Subpatches" });
    expect(path).toHaveTextContent("Patch›Voice›Subpatch 2");
    expect(screen.getByText("Subpatch 2")).toHaveAttribute("aria-current", "location");
  });

  it("goes back up to any subpatch above, or to the whole patch", async () => {
    const store = setup();

    await userEvent.click(screen.getByRole("button", { name: "Voice" }));
    expect(store.getState().path).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Patch" }));
    expect(store.getState().path).toEqual([]);
  });

  it("shows nothing at the top", () => {
    const store = createPatchStore({ sync: vi.fn() });
    render(
      <PatchStoreContext value={store}>
        <SubpatchPath />
      </PatchStoreContext>,
    );

    expect(screen.queryByRole("navigation", { name: "Subpatches" })).toBeNull();
  });
});
