import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { AudioEngine } from "../../audio/AudioEngine";
import { PlayIcon, StopIcon } from "./icons";
import { isTyping } from "../isTyping";

interface TransportProps {
  engine: Pick<AudioEngine, "start" | "stop" | "state" | "subscribe">;
}

const isSpace = (event: KeyboardEvent) =>
  event.key === " " && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target);

export function Transport({ engine }: TransportProps) {
  const running = useSyncExternalStore(engine.subscribe, () => engine.state === "running");

  const toggle = useCallback(async () => {
    await (engine.state === "running" ? engine.stop() : engine.start());
  }, [engine]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSpace(event)) {
        return;
      }
      event.preventDefault();
      if (!event.repeat) {
        void toggle();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (isSpace(event)) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [toggle]);

  return (
    <button
      type="button"
      className={running ? "hw hw-transport running" : "hw hw-transport"}
      onClick={toggle}
      aria-label={running ? "Stop" : "Start audio"}
      title={running ? "Stop (Space)" : "Start audio (Space)"}
    >
      {running ? <StopIcon /> : <PlayIcon />}
    </button>
  );
}
