import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

/** Semitones from C that are black keys. */
const BLACK = new Set([1, 3, 6, 8, 10]);

export interface PianoKey {
  /** Semitones above the first key, which is a C. */
  semitone: number;
  label: string;
  lit: boolean;
  /** The key of the note sounding now, marked with a light of its own. */
  playing?: boolean;
}

interface PianoProps {
  keys: PianoKey[];
  label: string;
  /** The name of the note sounding now, if any. */
  playing?: string;
  /** Makes the keys buttons, pressed by a click. */
  onPress?: (semitone: number) => void;
  /**
   * Makes the keys buttons played while held instead: with the mouse, sliding from key to key while
   * it stays down, or with Enter. `onStop` comes when let go, wherever, or when the piano goes.
   */
  onPlay?: (semitone: number) => void;
  onStop?: (semitone: number) => void;
}

const PLAY_KEY = "Enter";

/**
 * Piano keys from a C, white and black, lit when they are on: the keys of the computer while they
 * are down, or the notes a node plays. A light on a key marks the note sounding now. With
 * `onPress`, each key is a button that toggles; with `onPlay`, one that plays while held.
 */
export function Piano({ keys, label, playing, onPress, onPlay, onStop }: PianoProps) {
  const whites = keys.filter(({ semitone }) => !BLACK.has(semitone % 12)).length;
  let whiteIndex = 0;
  const held = useRef<number | undefined>(undefined);
  const stop = useRef(onStop);

  useEffect(() => {
    stop.current = onStop;
  }, [onStop]);

  useEffect(() => {
    if (!onPlay) {
      return;
    }
    const letGo = () => {
      if (held.current !== undefined) {
        stop.current?.(held.current);
        held.current = undefined;
      }
    };
    globalThis.addEventListener("pointerup", letGo);
    globalThis.addEventListener("pointercancel", letGo);
    return () => {
      globalThis.removeEventListener("pointerup", letGo);
      globalThis.removeEventListener("pointercancel", letGo);
      letGo();
    };
  }, [onPlay]);

  const hold = (semitone: number) => {
    if (held.current === semitone) {
      return;
    }
    if (held.current !== undefined) {
      onStop?.(held.current);
    }
    held.current = semitone;
    onPlay?.(semitone);
  };

  const played = (semitone: number) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      hold(semitone);
    },
    onPointerEnter: (event: PointerEvent<HTMLButtonElement>) => {
      if ((event.buttons & 1) === 1 && held.current !== undefined) {
        hold(semitone);
      }
    },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === PLAY_KEY) {
        event.preventDefault();
        if (!event.repeat) {
          onPlay?.(semitone);
        }
      }
    },
    onKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === PLAY_KEY) {
        event.preventDefault();
        onStop?.(semitone);
      }
    },
  });

  return (
    <div
      className="piano"
      role={onPress || onPlay ? "group" : "img"}
      aria-label={label}
      data-playing={playing}
      style={{ "--white-keys": whites } as CSSProperties}
    >
      {keys.map(({ semitone, label: name, lit, playing: sounding }) => {
        const black = BLACK.has(semitone % 12);
        // A black key sits on the line between the white key before it and the next one.
        const left = black ? whiteIndex : whiteIndex++;
        const props = {
          className: black ? "piano-key piano-black" : "piano-key piano-white",
          style: { "--at": left } as CSSProperties,
          "data-held": lit || undefined,
          "data-playing": sounding || undefined,
        };
        if (onPlay) {
          return (
            <button
              key={semitone}
              type="button"
              {...props}
              className={`${props.className} nodrag`}
              aria-pressed={lit}
              {...played(semitone)}
            >
              {name}
            </button>
          );
        }
        return onPress ? (
          <button
            key={semitone}
            type="button"
            {...props}
            className={`${props.className} nodrag`}
            aria-pressed={lit}
            onClick={() => onPress(semitone)}
          >
            {name}
          </button>
        ) : (
          <span key={semitone} {...props}>
            {name}
          </span>
        );
      })}
    </div>
  );
}
