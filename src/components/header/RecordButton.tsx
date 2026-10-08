import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AudioEngine } from "../../audio/AudioEngine";
import { downloadFile } from "./download";
import { RecordIcon } from "./icons";
import { formatElapsed, recordingFileName, recordingMimeType } from "./recording";

interface RecordButtonProps {
  engine: Pick<AudioEngine, "start" | "state" | "subscribe" | "recordingStream">;
}

const TICK_MS = 250;

/**
 * Records what reaches the outputs and saves it as an audio file when the recording stops, or
 * when the sound does. Starts the sound if it was stopped.
 */
export function RecordButton({ engine }: RecordButtonProps) {
  const recorder = useRef<MediaRecorder | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const running = useSyncExternalStore(engine.subscribe, () => engine.state === "running");
  const supported = typeof MediaRecorder !== "undefined";

  const stop = useCallback(() => recorder.current?.stop(), []);

  useEffect(() => {
    if (!running) {
      stop();
    }
  }, [running, stop]);

  useEffect(() => {
    if (startedAt === null) {
      return;
    }
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), TICK_MS);
    return () => clearInterval(timer);
  }, [startedAt]);

  const record = async () => {
    if (engine.state !== "running") {
      await engine.start();
    }
    const mimeType = recordingMimeType((type) => MediaRecorder.isTypeSupported(type));
    const next = new MediaRecorder(engine.recordingStream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const start = new Date();
    next.addEventListener("dataavailable", (event) => chunks.push(event.data));
    next.addEventListener("stop", () => {
      const type = next.mimeType || mimeType || "";
      downloadFile(new Blob(chunks, { type }), recordingFileName(start, type));
      recorder.current = null;
      setStartedAt(null);
    });
    recorder.current = next;
    next.start();
    setElapsed(0);
    setStartedAt(start.getTime());
  };

  const recording = startedAt !== null;

  return (
    <div className="record">
      {recording && (
        <span role="timer" className="record-time" aria-label="Recording time">
          {formatElapsed(elapsed)}
        </span>
      )}
      <button
        type="button"
        className={recording ? "hw hw-record recording" : "hw hw-record"}
        onClick={recording ? stop : record}
        disabled={!supported}
        aria-label={recording ? "Stop recording" : "Record"}
        title={
          !supported
            ? "This browser cannot record"
            : recording
              ? "Stop recording and save it as a file"
              : "Record what sounds (starts the sound)"
        }
      >
        <RecordIcon />
      </button>
    </div>
  );
}
