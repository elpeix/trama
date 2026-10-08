import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { ComposerButton } from "./ComposerButton";

let store: ReturnType<typeof createPatchStore>;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  render(
    <PatchStoreContext value={store}>
      <ComposerButton />
    </PatchStoreContext>,
  );
});

const button = () => screen.getByRole("button", { name: "Composer" });

describe("ComposerButton", () => {
  it("shows a panel under a window and Composer on its button", () => {
    expect(button()).toHaveTextContent(/^Composer$/);
    expect(button().querySelector("svg")).toBeInTheDocument();
  });

  it("opens the panel on the view it showed last, and closes it", async () => {
    store.getState().setPanelTab("perform");
    expect(button()).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(button());
    expect(store.getState().songPanel).toBe(true);
    expect(store.getState().panelTab).toBe("perform");
    expect(button()).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(button());
    expect(store.getState().songPanel).toBe(false);
  });
});
