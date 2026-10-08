import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { moduleRegistry, type ClipParamDefinition } from "../../patch/registry";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { ClipPreview } from "./ClipPreview";

const definition = moduleRegistry.clip.params.find((param): param is ClipParamDefinition => param.kind === "clip")!;

let store: ReturnType<typeof createPatchStore>;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
});

const show = (bars: number) =>
  render(
    <PatchStoreContext value={store}>
      <ClipPreview nodeId="clip-1" definition={definition} value="C4@0+1 E4@5+1" bars={bars} onEdit={() => {}} />
    </PatchStoreContext>,
  );

const barLines = () => [...document.querySelectorAll(".clip-preview-bar")].map((line) => line.getAttribute("x1"));

describe("ClipPreview", () => {
  it("draws the whole loop, with a line between its bars of four beats", () => {
    show(2);

    expect(screen.getByRole("img", { name: "Clip notes" }).getAttribute("viewBox")).toMatch(/^0 0 8 /);
    expect(barLines()).toEqual(["4"]);
  });

  it("draws the bars of the meter of the patch", () => {
    store.getState().setMeter([3]);
    show(3);

    expect(screen.getByRole("img", { name: "Clip notes" }).getAttribute("viewBox")).toMatch(/^0 0 9 /);
    expect(barLines()).toEqual(["3", "6"]);
  });
});
