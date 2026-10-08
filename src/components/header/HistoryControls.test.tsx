import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { HistoryControls } from "./HistoryControls";

let store: ReturnType<typeof createPatchStore>;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  render(
    <PatchStoreContext value={store}>
      <HistoryControls />
    </PatchStoreContext>,
  );
});

describe("HistoryControls", () => {
  it("disables both buttons with no history", () => {
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("undoes and redoes from the buttons", async () => {
    store.getState().addNode("gain", { x: 0, y: 0 });

    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(store.getState().nodes).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(store.getState().nodes).toHaveLength(1);
  });
});
