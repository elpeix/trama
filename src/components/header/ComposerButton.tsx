import { usePatchStore } from "../../store/usePatchStore";
import { ComposerIcon } from "./icons";

/** Opens and closes the composer, the panel under the editor with the song and perform. */
export function ComposerButton() {
  const open = usePatchStore((state) => state.songPanel);
  const openSongPanel = usePatchStore((state) => state.openSongPanel);

  return (
    <button
      type="button"
      className="hw hw-song"
      aria-label="Composer"
      aria-pressed={open}
      title="Show the song and perform under the editor"
      onClick={() => openSongPanel(!open)}
    >
      <ComposerIcon />
      Composer
    </button>
  );
}
