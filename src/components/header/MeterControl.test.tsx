import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { MeterControl } from "./MeterControl";

let store: ReturnType<typeof createPatchStore>;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  render(
    <PatchStoreContext value={store}>
      <MeterControl />
    </PatchStoreContext>,
  );
});

const select = () => screen.getByRole("combobox", { name: "Meter" });

describe("MeterControl", () => {
  it("shows the meter of the patch, among the usual ones", () => {
    expect(select()).toHaveValue("4/4");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "2/4",
      "3/4",
      "4/4",
      "3+2/4",
      "2+3/4",
      "6/4",
      "4+3/4",
      "3+4/4",
      "2+2+3/4",
      "6/8",
      "12/8",
    ]);
  });

  it("changes the meter of the patch", async () => {
    await userEvent.selectOptions(select(), "3+2/4");

    expect(store.getState().meter).toEqual([3, 2]);
    expect(select()).toHaveValue("3+2/4");
  });

  it("changes the meter of the patch to one in eighths", async () => {
    await userEvent.selectOptions(select(), "6/8");

    expect(store.getState().meter).toEqual({ eighths: [3, 3] });
    expect(select()).toHaveValue("6/8");
  });

  it("follows the meter of the patch, after an undo for instance", async () => {
    await userEvent.selectOptions(select(), "3/4");

    act(() => store.getState().undo());

    expect(select()).toHaveValue("4/4");
  });

  it("shows a meter of a loaded piece that is not among the usual ones", () => {
    act(() => store.getState().loadPatch({ tempo: 120, nodes: [], connections: [], meter: [5] }));

    expect(select()).toHaveValue("5/4");
    expect(screen.getByRole("option", { name: "5/4" })).toBeInTheDocument();
  });
});
