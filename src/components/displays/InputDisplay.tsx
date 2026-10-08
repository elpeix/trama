import { useContext, useEffect, useState } from "react";
import type { InputStatus } from "../../audio/modules/AudioModule";
import { EngineContext } from "../EngineContext";
import { MeterDisplay } from "./MeterDisplay";

const POLL_MS = 250;

const MESSAGES: Record<InputStatus, string> = {
  asking: "Asking for the microphone…",
  on: "Listening",
  denied: "The microphone is blocked: allow it in the settings of the site, and add the module again",
  unavailable: "No microphone to listen to",
};

interface InputDisplayProps {
  nodeId: string;
}

/** What the microphone of an audio input is doing, and the level of what it hears. */
export function InputDisplay({ nodeId }: InputDisplayProps) {
  const engine = useContext(EngineContext);
  const [status, setStatus] = useState(() => engine?.getInputStatus(nodeId));

  useEffect(() => {
    if (!engine) {
      return;
    }
    const timer = setInterval(() => setStatus(engine.getInputStatus(nodeId)), POLL_MS);
    return () => clearInterval(timer);
  }, [engine, nodeId]);

  return (
    <>
      {status && (
        <p className="input-status" role="status" aria-label="Microphone" data-status={status}>
          <span className="input-led" aria-hidden="true" />
          {MESSAGES[status]}
        </p>
      )}
      <MeterDisplay nodeId={nodeId} label="Input level" />
    </>
  );
}
