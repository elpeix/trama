import { useContext, useEffect, useState } from "react";
import type { MidiState } from "../../audio/MidiInput";
import type { NoteActivity } from "../../audio/modules/AudioModule";
import { noteName } from "../../patch/pitch";
import { EngineContext } from "../EngineContext";

const POLL_MS = 250;

/** What the MIDI input is doing, in words. */
function midiMessage({ status, devices }: MidiState): string {
  switch (status) {
    case "asking":
      return "Asking for the MIDI devices…";
    case "denied":
      return "MIDI is blocked: allow it in the settings of the site, and add the module again";
    case "unavailable":
      return "This browser has no MIDI: use Chrome, Edge or Firefox";
    case "on":
      return devices.length === 0 ? "No MIDI device plugged in" : devices.join(", ");
  }
}

interface MidiDisplayProps {
  nodeId: string;
}

/**
 * The MIDI devices a MIDI In hears, lit while there are any, and the keys held, the one sounding
 * marked. It takes the width of the node without widening it: long names wrap.
 */
export function MidiDisplay({ nodeId }: MidiDisplayProps) {
  const engine = useContext(EngineContext);
  const [state, setState] = useState(() => engine?.getMidiState(nodeId));
  const [activity, setActivity] = useState<NoteActivity>();

  useEffect(() => {
    if (!engine) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      const next = engine.getNotes(nodeId);
      // Only a change renders again, not every frame.
      setActivity((current) => (sameActivity(current, next) ? current : next));
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [engine, nodeId]);

  useEffect(() => {
    if (!engine) {
      return;
    }
    const timer = setInterval(() => setState(engine.getMidiState(nodeId)), POLL_MS);
    return () => clearInterval(timer);
  }, [engine, nodeId]);

  if (!state) {
    return null;
  }
  // Listening to no device is not lit: nothing plays it yet.
  const status = state.status === "on" && state.devices.length === 0 ? "idle" : state.status;
  const held = [...new Set(activity?.notes ?? [])].sort((a, b) => a - b);
  return (
    <div className="midi-display">
      <p className="input-status" role="status" aria-label="MIDI" data-status={status}>
        <span className="input-led" aria-hidden="true" />
        {midiMessage(state)}
      </p>
      <p className="midi-notes" aria-label="Notes held">
        {held.map((note) => (
          <span key={note} data-playing={note === activity?.playing || undefined}>
            {noteName(note)}
          </span>
        ))}
      </p>
    </div>
  );
}

function sameActivity(a: NoteActivity | undefined, b: NoteActivity | undefined): boolean {
  return a?.playing === b?.playing && a?.notes.length === b?.notes.length && (a?.notes ?? []).every((note, index) => note === b?.notes[index]);
}
