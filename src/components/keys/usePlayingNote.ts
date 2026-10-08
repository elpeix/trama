import { useContext, useEffect, useState } from "react";
import { EngineContext } from "../EngineContext";

/**
 * The note a node is playing right now, and the semitones the computer keys transpose it by,
 * followed on every frame.
 */
export function usePlayingNote(nodeId: string): { playing: number | undefined; keyTranspose: number } {
  const engine = useContext(EngineContext);
  const [playing, setPlaying] = useState<number>();
  const [keyTranspose, setKeyTranspose] = useState(0);

  useEffect(() => {
    if (!engine) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      setPlaying(engine.getNotes(nodeId)?.playing);
      setKeyTranspose(engine.getKeyTranspose(nodeId) ?? 0);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [engine, nodeId]);

  return { playing, keyTranspose };
}

/**
 * The key of a piano, from 0 at its first note, that shows a note: its own key when the piano
 * has it, or else the key of the same name, for notes a chord or a span take beyond it.
 */
export function keyOf(note: number, first: number, keys: number): number {
  const semitone = note - first;
  return semitone >= 0 && semitone < keys ? semitone : ((semitone % 12) + 12) % 12;
}
