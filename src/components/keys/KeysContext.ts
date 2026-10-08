import { createContext } from "react";
import type { KeysState } from "./useComputerKeyboard";

/** What the computer keys are doing: their octave, whether they play one up, and the keys that are down. */
export const KeysContext = createContext<KeysState>({
  octave: 0,
  up: false,
  held: new Map(),
  changeOctave: () => {},
  press: () => {},
  release: () => {},
});
