import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioEngine } from "../../audio/AudioEngine";
import { isTyping } from "../isTyping";

export type NotePlayer = Pick<AudioEngine, "noteOn" | "noteOff" | "allNotesOff">;

/** The keys that play, from C4 to C5: the white keys on the home row, the black ones above. */
export const KEYS = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k"];

export const FIRST_NOTE = 60;
const OCTAVE = 12;
export const MIN_KEYS_OCTAVE = -3;
export const MAX_KEYS_OCTAVE = 3;

const OCTAVE_KEYS: Record<string, number> = { z: -1, x: 1 };

/** What the computer keys are doing, for the nodes that are played from them. */
export interface KeysState {
  /** The octave of the keys, from 0 for C4; Z and X move it. */
  octave: number;
  /** Whether the keys play one octave up: while Shift is held, or Caps Lock is on, but not both. */
  up: boolean;
  /** The keys that are down, by letter, with the note each one started. */
  held: ReadonlyMap<string, number>;
  /** Moves the keys an octave down (-1) or up (1), like Z and X. */
  changeOctave: (by: number) => void;
  /** Plays a key from elsewhere than its letter, by its place from A: a key of the piano pressed with the mouse. */
  press: (index: number) => void;
  /** Stops a key that `press` played. */
  release: (index: number) => void;
}

/**
 * Plays notes from the computer keys, from C4 to C5 on A to K. Z and X move the keys an octave
 * down or up until moved back, like in Ableton Live, and holding Shift plays one octave up. Caps
 * Lock keeps them one octave up, and then Shift brings them back down. Each key stops the note it
 * started, even when Shift, Caps Lock or the octave changed in between. The keys can be pressed
 * from elsewhere too, like the piano of a node under the mouse, and play as their letters would.
 */
export function useComputerKeyboard(player: NotePlayer): KeysState {
  const [octave, setOctave] = useState(0);
  const [up, setUp] = useState(false);
  const [held, setHeld] = useState<ReadonlyMap<string, number>>(new Map());
  const latestOctave = useRef(octave);
  const latestUp = useRef(up);
  // The note each key started, so it stops that same note whatever happened meanwhile.
  const sounding = useRef(new Map<string, number>());
  const pressed = useRef(new Set<string>());

  useEffect(() => {
    latestOctave.current = octave;
  }, [octave]);

  useEffect(() => {
    latestUp.current = up;
  }, [up]);

  const press = useCallback(
    (index: number) => {
      const key = KEYS[index];
      if (key === undefined || sounding.current.has(key)) {
        return;
      }
      const note = FIRST_NOTE + index + OCTAVE * (latestOctave.current + (latestUp.current ? 1 : 0));
      sounding.current.set(key, note);
      pressed.current.add(key);
      setHeld(new Map(sounding.current));
      player.noteOn(note);
    },
    [player],
  );

  const release = useCallback(
    (index: number) => {
      const key = KEYS[index];
      const note = sounding.current.get(key);
      if (!pressed.current.delete(key) || note === undefined) {
        return;
      }
      sounding.current.delete(key);
      setHeld(new Map(sounding.current));
      player.noteOff(note);
    },
    [player],
  );

  const changeOctave = useCallback((by: number) => {
    setOctave((current) => Math.min(MAX_KEYS_OCTAVE, Math.max(MIN_KEYS_OCTAVE, current + by)));
  }, []);

  useEffect(() => {
    const notes = sounding.current;
    const showHeld = () => setHeld(new Map(notes));

    // Caps Lock is only known from the events of the keys, including its own.
    const isUp = (event: KeyboardEvent) => event.shiftKey !== event.getModifierState("CapsLock");

    const onKeyDown = (event: KeyboardEvent) => {
      const octaveUp = isUp(event);
      setUp(octaveUp);
      const key = event.key.toLowerCase();
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) {
        return;
      }
      // Without Shift only: Shift+Z is not a note either, and must not change the octave.
      if (key in OCTAVE_KEYS && !event.shiftKey) {
        if (!event.repeat) {
          changeOctave(OCTAVE_KEYS[key]);
        }
        return;
      }
      const index = KEYS.indexOf(key);
      if (index === -1 || event.repeat || notes.has(key)) {
        return;
      }
      const note = FIRST_NOTE + index + OCTAVE * (latestOctave.current + (octaveUp ? 1 : 0));
      notes.set(key, note);
      showHeld();
      player.noteOn(note);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      setUp(isUp(event));
      const key = event.key.toLowerCase();
      const note = notes.get(key);
      if (note !== undefined && !pressed.current.has(key)) {
        notes.delete(key);
        showHeld();
        player.noteOff(note);
      }
    };

    const onBlur = () => {
      notes.clear();
      pressed.current.clear();
      showHeld();
      setUp(false);
      player.allNotesOff();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [player, changeOctave]);

  return useMemo(
    () => ({ octave, up, held, changeOctave, press, release }),
    [octave, up, held, changeOctave, press, release],
  );
}
