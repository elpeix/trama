import { useContext, useEffect, useState } from "react";
import { EngineContext } from "../EngineContext";
import { MeterDisplay } from "./MeterDisplay";

const POLL_MS = 250;

interface OutputDisplayProps {
  nodeId: string;
}

/** The level going to the speakers, and why it went quiet when its limiter muted a sound that ran away. */
export function OutputDisplay({ nodeId }: OutputDisplayProps) {
  const engine = useContext(EngineContext);
  const [muted, setMuted] = useState(() => engine?.isOutputMuted(nodeId) ?? false);

  useEffect(() => {
    if (!engine) {
      return;
    }
    const timer = setInterval(() => setMuted(engine.isOutputMuted(nodeId)), POLL_MS);
    return () => clearInterval(timer);
  }, [engine, nodeId]);

  const unmute = () => {
    engine?.unmuteOutput(nodeId);
    setMuted(false);
  };

  return (
    <>
      {muted && (
        <div className="output-muted">
          <p className="input-status" role="alert" data-status="denied">
            <span className="input-led" aria-hidden="true" />
            Muted: the sound got far too loud. Turn it down, then unmute
          </p>
          <button type="button" className="hw nodrag" onClick={unmute}>
            Unmute
          </button>
        </div>
      )}
      <MeterDisplay nodeId={nodeId} />
    </>
  );
}
