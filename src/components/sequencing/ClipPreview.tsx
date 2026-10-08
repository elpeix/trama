import { useContext, useEffect, useState } from "react";
import { parseClip, type ClipNote } from "../../patch/clip";
import { beatsPerBar } from "../../patch/meter";
import type { ClipParamDefinition } from "../../patch/registry";
import { usePatchStore } from "../../store/usePatchStore";
import { EngineContext } from "../EngineContext";

/** The fewest notes the preview spans, so that a few close notes are not drawn huge. */
const SHOWN_NOTES = 37;
const MIDDLE_C = 60;

/** The notes the preview spans: those of the clip, widened about them to SHOWN_NOTES, inside the range of the param. */
function shownRange(notes: readonly ClipNote[], definition: ClipParamDefinition) {
  const pitches = notes.map((note) => note.note);
  const low = pitches.length > 0 ? Math.min(...pitches) : MIDDLE_C;
  const high = pitches.length > 0 ? Math.max(...pitches) : MIDDLE_C;
  const missing = Math.max(0, SHOWN_NOTES - (high - low + 1));
  const highest = Math.min(definition.highest, high + Math.ceil(missing / 2));
  const lowest = Math.max(definition.lowest, Math.min(low - Math.floor(missing / 2), highest - SHOWN_NOTES + 1));
  return { lowest, highest: Math.max(highest, Math.min(definition.highest, lowest + SHOWN_NOTES - 1)) };
}

interface ClipPreviewProps {
  nodeId: string;
  definition: ClipParamDefinition;
  value: string;
  bars: number;
  onEdit: () => void;
}

/** The notes of a clip drawn small, with a line where it is while it plays, and a key to open the piano roll. */
export function ClipPreview({ nodeId, definition, value, bars, onEdit }: ClipPreviewProps) {
  const engine = useContext(EngineContext);
  const [position, setPosition] = useState<number | undefined>(undefined);
  const barBeats = usePatchStore((state) => beatsPerBar(state.meter));
  const notes = parseClip(value) ?? [];
  const beats = bars * barBeats;
  const { lowest, highest } = shownRange(notes, definition);
  const range = highest - lowest + 1;

  useEffect(() => {
    if (!engine) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      setPosition(engine.getPosition(nodeId));
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [engine, nodeId]);

  return (
    <div className="clip-preview nodrag">
      <svg
        className="clip-preview-screen"
        role="img"
        aria-label="Clip notes"
        viewBox={`0 0 ${beats} ${range}`}
        preserveAspectRatio="none"
        onDoubleClick={onEdit}
      >
        {Array.from({ length: bars - 1 }, (_, bar) => (
          <line key={bar} className="clip-preview-bar" x1={(bar + 1) * barBeats} x2={(bar + 1) * barBeats} y1={0} y2={range} />
        ))}
        {notes
          .filter((note) => note.start < beats)
          .map((note, index) => (
            <rect
              key={index}
              data-clip-note=""
              className="clip-preview-note"
              x={note.start}
              y={highest - note.note}
              width={Math.min(note.length, beats - note.start)}
              height={1.5}
            />
          ))}
        {position !== undefined && (
          <line className="clip-preview-playhead" x1={position} x2={position} y1={0} y2={range} />
        )}
      </svg>
      <button type="button" className="hw clip-preview-edit" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}
