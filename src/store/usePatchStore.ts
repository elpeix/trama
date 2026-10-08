import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { PatchState, PatchStore } from "./patchStore";

export const PatchStoreContext = createContext<PatchStore | null>(null);

export function usePatchStore<T>(selector: (state: PatchState) => T): T {
  const store = useContext(PatchStoreContext);
  if (!store) {
    throw new Error("usePatchStore needs a PatchStoreContext");
  }
  return useStore(store, selector);
}

export function usePatchStoreApi(): PatchStore {
  const store = useContext(PatchStoreContext);
  if (!store) {
    throw new Error("usePatchStoreApi needs a PatchStoreContext");
  }
  return store;
}
