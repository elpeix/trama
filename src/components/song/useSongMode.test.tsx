import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { useSongMode } from "./useSongMode";

let store: ReturnType<typeof createPatchStore>;
let engine: { setSongStart: ReturnType<typeof vi.fn<(bar: number | undefined) => void>> };

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  engine = { setSongStart: vi.fn<(bar: number | undefined) => void>() };
});

const wrapper = ({ children }: { children: ReactNode }) => <PatchStoreContext value={store}>{children}</PatchStoreContext>;

describe("useSongMode", () => {
  it("leaves the engine in pattern mode to start with", () => {
    renderHook(() => useSongMode(engine), { wrapper });

    expect(engine.setSongStart).toHaveBeenLastCalledWith(undefined);
  });

  it("plays the song from the cursor in song mode, and follows the cursor", () => {
    renderHook(() => useSongMode(engine), { wrapper });

    act(() => {
      store.getState().setSongCursor(2);
      store.getState().setSongMode(true);
    });
    expect(engine.setSongStart).toHaveBeenLastCalledWith(2);

    act(() => store.getState().setSongCursor(5));
    expect(engine.setSongStart).toHaveBeenLastCalledWith(5);

    act(() => store.getState().setSongMode(false));
    expect(engine.setSongStart).toHaveBeenLastCalledWith(undefined);
  });
});
