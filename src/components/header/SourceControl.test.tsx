import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { SourceControl } from "./SourceControl";

let store: ReturnType<typeof createPatchStore>;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  render(
    <PatchStoreContext value={store}>
      <SourceControl />
    </PatchStoreContext>,
  );
});

describe("SourceControl", () => {
  it("names what it picks and starts on the patterns", () => {
    expect(screen.getByRole("radiogroup", { name: "Source" })).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Pattern" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Song" })).toHaveAttribute("aria-checked", "false");
  });

  it("plays the song or the patterns launched by hand, with the panel closed", async () => {
    await userEvent.click(screen.getByRole("radio", { name: "Song" }));
    expect(store.getState().songMode).toBe(true);
    expect(store.getState().songPanel).toBe(false);

    await userEvent.click(screen.getByRole("radio", { name: "Pattern" }));
    expect(store.getState().songMode).toBe(false);
  });
});
