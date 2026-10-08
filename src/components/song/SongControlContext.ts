import { createContext } from "react";
import type { AudioEngine } from "../../audio/AudioEngine";
import type { PatchStore } from "../../store/patchStore";
import type { CrossfaderPlayer } from "../perform/CrossfaderPlayer";
import type { SongRecorder } from "./SongRecorder";

/** What the knobs need to show the song and record into it; none outside the app. */
export interface SongControl {
  engine: Pick<AudioEngine, "getControl" | "getSongPosition">;
  store: PatchStore;
  recorder: SongRecorder;
  /** The crossfader of the perform panel, which plays knobs without touching the patch. */
  crossfader?: Pick<CrossfaderPlayer, "valueOf" | "subscribe" | "release">;
}

export const SongControlContext = createContext<SongControl | null>(null);
