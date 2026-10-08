import { useCallback, useContext, useEffect, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { valueAt, type ControlKey } from "../../patch/automation";
import { beatsPerBar, type Meter } from "../../patch/meter";
import { laneOf } from "../../patch/song";
import type { Song } from "../../patch/types";
import { KnobControl } from "../controls/Knob";
import { toSliderPosition } from "../controls/scale";
import { SongControlContext, type SongControl } from "./SongControlContext";

/**
 * The value the song gives a control, read on every frame in song mode: the one the engine plays
 * while the song does, or with Rec while it is stopped, the one it has on the bar of the cursor.
 * Undefined when the song does not set it, and the control shows its own.
 */
function useSongValue(song: SongControl | null, key: ControlKey | undefined): number | undefined {
  const [value, setValue] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!song || !key) {
      return;
    }
    let frame = 0;
    let read: { song: Song | undefined; cursor: number; meter: Meter; value: number | undefined } | undefined;
    const onCursor = () => {
      const { song: current, songCursor, meter } = song.store.getState();
      if (!read || read.song !== current || read.cursor !== songCursor || read.meter !== meter) {
        read = {
          song: current,
          cursor: songCursor,
          meter,
          value: current && valueAt(laneOf(current, key), songCursor * beatsPerBar(meter)),
        };
      }
      return read.value;
    };
    const update = () => {
      frame = requestAnimationFrame(update);
      const { songRec } = song.store.getState();
      const next =
        song.engine.getSongPosition() !== undefined ? song.engine.getControl(key) : songRec ? onCursor() : undefined;
      setValue(next);
    };
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (song.store.getState().songMode) {
        frame = requestAnimationFrame(update);
      } else {
        setValue(undefined);
      }
    };
    follow();
    const unsubscribe = song.store.subscribe((state, previous) => {
      if (state.songMode !== previous.songMode) {
        follow();
      }
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [song, key]);

  return song && key ? value : undefined;
}

/** The value the crossfader plays a control at, while it does. */
function useCrossfaderValue(song: SongControl | null, key: ControlKey | undefined): number | undefined {
  const crossfader = song?.crossfader;
  const subscribe = useCallback((listener: () => void) => crossfader?.subscribe(listener) ?? (() => {}), [crossfader]);
  return useSyncExternalStore(subscribe, () => (key === undefined ? undefined : crossfader?.valueOf(key)));
}

type SongKnobProps = ComponentProps<typeof KnobControl> & {
  /** The control of the song it is; a plain knob without one. */
  control?: ControlKey;
};

/**
 * A knob that is also a control of the song: in song mode it shows the value of the song, and with
 * Rec a drag records into the song instead of changing the patch.
 */
export function SongKnob({ control, value, onChange, range, ...props }: SongKnobProps) {
  const song = useContext(SongControlContext);
  const crossfaded = useCrossfaderValue(song, control);
  const shown = useSongValue(song, control) ?? crossfaded ?? value;
  const recorder = control ? song?.recorder : undefined;

  return (
    <KnobControl
      {...props}
      range={range}
      value={shown}
      onChange={(...change) => {
        if (!recorder?.change(control!, change[0], toSliderPosition(change[0], range))) {
          if (control !== undefined) {
            song?.crossfader?.release(control);
          }
          onChange(...change);
        }
      }}
      onGrab={recorder && (() => recorder.grab(control!, shown, toSliderPosition(shown, range)))}
      onRelease={recorder && (() => recorder.release(control!))}
    />
  );
}

interface SongSwitchProps {
  control?: ControlKey;
  on: boolean;
  onFlip: (on: boolean) => void;
  /** Draws the switch, pressed or not, with what flips it. */
  children: (pressed: boolean, flip: () => void) => ReactNode;
}

/** A switch that is also a control of the song, like a mute: shown and flipped in the song as a knob is. */
export function SongSwitch({ control, on, onFlip, children }: SongSwitchProps) {
  const song = useContext(SongControlContext);
  const value = useSongValue(song, control);
  const pressed = value === undefined ? on : value >= 0.5;

  return children(pressed, () => {
    if (!control || !song?.recorder.flip(control, pressed ? 0 : 1)) {
      onFlip(!pressed);
    }
  });
}
