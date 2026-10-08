import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { SwingControl } from "./SwingControl";

let store: ReturnType<typeof createPatchStore>;

beforeEach(() => {
  Element.prototype.setPointerCapture ??= () => {};
  store = createPatchStore({ sync: vi.fn() });
  render(
    <PatchStoreContext value={store}>
      <SwingControl />
    </PatchStoreContext>,
  );
});

const display = () => screen.getByRole("spinbutton", { name: "Swing" });
const grid = () => screen.getByRole("combobox", { name: "Swing grid" });

describe("SwingControl", () => {
  it("shows the swing of the patch as a percentage", () => {
    expect(display()).toHaveTextContent("50%");
    expect(display()).toHaveAttribute("aria-valuenow", "50");
  });

  it("changes with the arrow keys", async () => {
    display().focus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");

    expect(store.getState().swing).toBe(52);
    expect(display()).toHaveTextContent("52%");
  });

  it("can be typed after a double-click", async () => {
    await userEvent.dblClick(display());
    const input = screen.getByRole("textbox", { name: "Swing" });
    await userEvent.clear(input);
    await userEvent.type(input, "66{Enter}");

    expect(store.getState().swing).toBe(66);
  });

  it("shows what the swing holds back, the sixteenths or the eighths", () => {
    expect(grid()).toHaveValue("1/16");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["1/16", "1/8"]);
  });

  it("swings the eighths of the patch", async () => {
    await userEvent.selectOptions(grid(), "1/8");

    expect(store.getState().swingGrid).toBe("1/8");
    expect(grid()).toHaveValue("1/8");
  });

  it("follows the grid of the patch, after an undo for instance", async () => {
    await userEvent.selectOptions(grid(), "1/8");

    act(() => store.getState().undo());

    expect(grid()).toHaveValue("1/16");
  });
});
