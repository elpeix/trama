import { usePatchStore } from "../../store/usePatchStore";

/** What Start plays: the patterns launched by hand, or the song from the cursor. */
export function SourceControl() {
  const songMode = usePatchStore((state) => state.songMode);
  const setSongMode = usePatchStore((state) => state.setSongMode);

  return (
    <div className="source-control">
      <span className="param-label">Source</span>
      <div className="hw-group" role="radiogroup" aria-label="Source">
        {(["Pattern", "Song"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            className="hw hw-song"
            aria-checked={songMode === (mode === "Song")}
            aria-pressed={songMode === (mode === "Song")}
            title={mode === "Song" ? "Play the song from the cursor" : "Play the patterns launched by hand"}
            onClick={() => setSongMode(mode === "Song")}
          >
            {mode}
          </button>
        ))}
      </div>
    </div>
  );
}
