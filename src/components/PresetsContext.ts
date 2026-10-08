import { createContext, useContext, useSyncExternalStore } from "react";
import type { Preset } from "../patch/presets";
import type { PresetLibrary } from "../presets/presetLibrary";

/** The presets saved in this browser: of each node, and the subpatches saved as modules of their own. */
export const PresetsContext = createContext<PresetLibrary | null>(null);

const NONE: readonly Preset[] = [];
const nothing = () => () => {};

/** The presets, followed as they change; none without a library. */
export function usePresets(): { library: PresetLibrary | null; presets: readonly Preset[] } {
  const library = useContext(PresetsContext);
  const presets = useSyncExternalStore(library?.subscribe ?? nothing, library?.list ?? (() => NONE));
  return { library, presets };
}
