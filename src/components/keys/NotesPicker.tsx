import { NOTE_NAMES, noteName } from "../../patch/pitch";
import type { NotesParamDefinition } from "../../patch/registry";
import { formatNotes, parseNotes } from "../../patch/sequence";
import { OctaveSwitch } from "./OctaveSwitch";
import { Piano } from "./Piano";
import { keyOf, usePlayingNote } from "./usePlayingNote";

interface NotesPickerProps {
  nodeId: string;
  definition: NotesParamDefinition;
  value: string;
  onChange: (value: string) => void;
  /** The octave the notes are moved by, and the semitones of the transpose, which it shows. */
  octave: number;
  transpose: number;
  onOctaveChange: (octave: number) => void;
  /** The lowest and highest octave. */
  octaves: { min: number; max: number };
}

/**
 * The notes a node plays on its own, on a piano: a click on a key adds its note or takes it away,
 * and a light marks the note sounding now. The octave switch under it moves them all an octave.
 */
export function NotesPicker({
  nodeId,
  definition,
  value,
  onChange,
  octave,
  transpose,
  onOctaveChange,
  octaves,
}: NotesPickerProps) {
  const { lowest, highest } = definition;
  const notes = parseNotes(value) ?? [];
  const { playing, keyTranspose } = usePlayingNote(nodeId);
  const first = lowest + 12 * octave + transpose + keyTranspose;
  const count = highest - lowest + 1;
  const playingKey = playing === undefined ? undefined : keyOf(playing, first, count);
  const toggle = (note: number) =>
    onChange(formatNotes(notes.includes(note) ? notes.filter((other) => other !== note) : [...notes, note]));

  return (
    <div className="keys-panel" title="Click a key to add its note, click it again to take it away">
      <Piano
        label="Notes to play"
        playing={playing === undefined ? undefined : noteName(playing)}
        keys={Array.from({ length: count }, (_, semitone) => {
          const name = NOTE_NAMES[(lowest + semitone) % 12];
          return {
            semitone,
            label: name.length === 1 ? name : "",
            lit: notes.includes(lowest + semitone),
            playing: semitone === playingKey,
          };
        })}
        onPress={(semitone) => toggle(lowest + semitone)}
      />
      <OctaveSwitch
        from={first}
        to={first + count - 1}
        onChange={(by) => onOctaveChange(Math.min(octaves.max, Math.max(octaves.min, octave + by)))}
      />
    </div>
  );
}
