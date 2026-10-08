import { useEffect, useState } from "react";
import type { AudioEngine } from "../../audio/AudioEngine";
import { themeStorage } from "../../theme/useTheme";
import { useTooltip } from "../useTooltip";
import { SoundIcon } from "./icons";

export const STOPPED_SOUND_KEY = "trama:sound-while-stopped";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const read = (storage: Storage | undefined) => {
  try {
    return storage?.getItem(STOPPED_SOUND_KEY) !== "off";
  } catch {
    return true;
  }
};

const save = (storage: Storage | undefined, on: boolean) => {
  try {
    storage?.setItem(STOPPED_SOUND_KEY, on ? "on" : "off");
  } catch {
    return;
  }
};

interface StoppedSoundButtonProps {
  engine: Pick<AudioEngine, "setSoundWhileStopped">;
  storage?: Storage;
}

/** Lets the keys and the pianos on the nodes sound with the transport stopped, as this browser chose. */
export function StoppedSoundButton({ engine, storage = themeStorage() }: StoppedSoundButtonProps) {
  const [on, setOn] = useState(() => read(storage));
  const { triggerProps, tooltip } = useTooltip(
    <>
      <strong>Sound without play: {on ? "On" : "Off"}</strong>
      <br />
      The computer keys and the pianos on the nodes sound without pressing play. The sequencers and the song wait
      for play. The notes of the piano roll sound with its own Hear.
    </>,
  );

  useEffect(() => {
    engine.setSoundWhileStopped(on);
  }, [engine, on]);

  return (
    <>
      <button
        {...triggerProps}
        type="button"
        className="hw stopped-sound"
        aria-label="Sound without play"
        aria-pressed={on}
        onClick={() => {
          save(storage, !on);
          setOn(!on);
        }}
      >
        <SoundIcon />
      </button>
      {tooltip}
    </>
  );
}
