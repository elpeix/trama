import { useContext, useEffect, useState } from "react";
import { EngineContext } from "../EngineContext";

const POLL_MS = 500;

interface VoiceUsageDisplayProps {
  nodeId: string;
}

/** A warning on a subpatch whose notes, their release included, needed more voices than it has. */
export function VoiceUsageDisplay({ nodeId }: VoiceUsageDisplayProps) {
  const engine = useContext(EngineContext);
  const [usage, setUsage] = useState(() => engine?.getVoiceUsage(nodeId));

  useEffect(() => {
    if (!engine) {
      return;
    }
    const timer = setInterval(() => setUsage(engine.getVoiceUsage(nodeId)), POLL_MS);
    return () => clearInterval(timer);
  }, [engine, nodeId]);

  if (!usage || usage.needed <= usage.voices) {
    return null;
  }
  return (
    <p className="input-status voice-usage" role="status" aria-label="Voices">
      <span className="input-led" aria-hidden="true" />
      Its notes needed {usage.needed} voices at once: with {usage.voices}, the oldest tails fade out early
    </p>
  );
}
