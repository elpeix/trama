import { useEffect } from "react";
import type { AudioEngine } from "../../audio/AudioEngine";
import { usePatchStore } from "../../store/usePatchStore";

/** Tells the engine to play the song from the cursor in song mode, and nothing of it in pattern mode. */
export function useSongMode(engine: Pick<AudioEngine, "setSongStart">) {
  const songMode = usePatchStore((state) => state.songMode);
  const cursor = usePatchStore((state) => state.songCursor);

  useEffect(() => {
    engine.setSongStart(songMode ? cursor : undefined);
  }, [engine, songMode, cursor]);
}
