import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../store/patchStore";
import { PatchStoreContext } from "../store/usePatchStore";
import { GroupButton } from "./GroupButton";

let store: ReturnType<typeof createPatchStore>;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
});

const setup = () =>
  render(
    <PatchStoreContext value={store}>
      <GroupButton />
      <input aria-label="Name" />
    </PatchStoreContext>,
  );

const select = (...ids: string[]) => ids.forEach((id) => store.getState().setNodeView(id, { selected: true }));
const types = () => store.getState().nodes.map(({ type }) => type);

describe("GroupButton", () => {
  it("shows only while some nodes are selected", async () => {
    const { id } = store.getState().addNode("filter", { x: 0, y: 0 });
    setup();
    expect(screen.queryByRole("button", { name: "Group" })).toBeNull();

    select(id);

    expect(await screen.findByRole("button", { name: "Group" })).toBeInTheDocument();
  });

  it("groups the selected nodes into a subpatch", async () => {
    const filter = store.getState().addNode("filter", { x: 0, y: 0 });
    const gain = store.getState().addNode("gain", { x: 200, y: 0 });
    store.getState().addNode("output", { x: 400, y: 0 });
    select(filter.id, gain.id);
    setup();

    await userEvent.click(await screen.findByRole("button", { name: "Group" }));

    expect(types()).toEqual(["subpatch", "output"]);
  });

  it("groups them with Ctrl or Cmd and G too, but not while typing", () => {
    const filter = store.getState().addNode("filter", { x: 0, y: 0 });
    setup();
    select(filter.id);

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Name" }), { key: "g", ctrlKey: true });
    expect(types()).toEqual(["filter"]);

    fireEvent.keyDown(window, { key: "g", metaKey: true });
    expect(types()).toEqual(["subpatch"]);
  });
});
