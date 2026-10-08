import { useEffect, useState } from "react";
import type { PatternState } from "../../audio/modules/AudioModule";
import { emptySong, nextBar } from "../../patch/song";
import type { PatternSlot } from "../../patch/types";
import type { PatchStore } from "../../store/patchStore";
import type { DisplayEngine } from "../EngineContext";

/**
 * Plays a pattern of a node, by the id the engine knows it by and the path the song does. With
 * the Rec of the song on, it also writes it into the song: on the bar of the cursor while the song
 * is stopped, or on the next bar, launched for it, while it plays. A `mode` launches it that way
 * instead of the one of the node.
 */
export function playPattern(
  store: PatchStore,
  engine: Pick<DisplayEngine, "launchPattern" | "getSongBar"> | null,
  nodeId: string,
  songPath: string,
  slot: PatternSlot,
  mode?: string,
) {
  const launch = (launchMode = mode) =>
    launchMode === undefined ? engine?.launchPattern(nodeId, slot) : engine?.launchPattern(nodeId, slot, launchMode);
  const { songRec, songCursor, song, setSongCell } = store.getState();
  if (!songRec) {
    launch();
    return;
  }
  const playing = engine?.getSongBar();
  if (playing === undefined) {
    setSongCell(songPath, songCursor, slot);
    launch();
    return;
  }
  const bar = nextBar(song ?? emptySong(), playing);
  if (bar !== undefined) {
    setSongCell(songPath, bar, slot);
  }
  launch("bar");
}

/** The pattern that sounds on a node: the one it plays, unless a stop of the song silenced it. */
export function soundingSlot(state: PatternState | undefined): PatternSlot | undefined {
  return state && !state.stopped ? state.playing : undefined;
}

/** The pattern a node plays and the one launched to take over, read from the engine on every frame. */
export function usePatternState(engine: Pick<DisplayEngine, "getPattern"> | null, nodeId: string): PatternState | undefined {
  const [state, setState] = useState<PatternState | undefined>(undefined);

  useEffect(() => {
    if (!engine) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      const next = engine.getPattern(nodeId);
      setState((previous) =>
        previous?.playing === next?.playing && previous?.queued === next?.queued && previous?.stopped === next?.stopped
          ? previous
          : next,
      );
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [engine, nodeId]);

  return state;
}
