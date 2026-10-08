import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { beatsPerStep } from "../../audio/modules/StepClock";
import { timeSignature } from "../../patch/meter";
import { MidiFormatError, readMidi, writeMidi } from "../../patch/midi";
import type { SequenceParamDefinition } from "../../patch/registry";
import { formatSequence, parseSequence } from "../../patch/sequence";
import { sequenceNotes, stepsFromNotes } from "../../patch/sequenceMidi";
import type { Params, PatternSlot } from "../../patch/types";
import { usePatchStore } from "../../store/usePatchStore";
import { downloadFile } from "../header/download";
import { LoadIcon, SaveIcon } from "../header/icons";
import { useTooltip } from "../useTooltip";

interface SequenceMidiProps {
  nodeId: string;
  name: string;
  definition: SequenceParamDefinition;
  /** The params of the pattern edited on the node. */
  params: Params;
  pattern: PatternSlot;
}

/**
 * Saves the pattern of a Seq edited on its node as a MIDI file, as it sounds: its chords, octave,
 * ties and gate, and its accents as the hardest notes. Puts the notes of a MIDI file in it, a note
 * a step, as one undo step.
 */
export function SequenceMidi({ nodeId, name, definition, params, pattern }: SequenceMidiProps) {
  const updateParams = usePatchStore((state) => state.updateParams);
  const tempo = usePatchStore((state) => state.tempo);
  const meter = usePatchStore((state) => state.meter);
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const stepBeats = beatsPerStep(String(params.division));
  const length = Number(params.length);
  const shift = 12 * Number(params.octave);

  const exportMidi = () => {
    const steps = parseSequence(String(params[definition.id])) ?? [];
    const notes = sequenceNotes(steps, {
      length,
      stepBeats,
      gate: Number(params.gate),
      octave: Number(params.octave),
      chord: String(params.chord),
      scale: String(params.scale),
      root: String(params.root),
    });
    const bytes = writeMidi(notes, { tempo, beats: length * stepBeats, name, signature: timeSignature(meter) });
    downloadFile(
      new Blob([bytes], { type: "audio/midi" }),
      `${name.replace(/[^\w-]+/g, "-").toLowerCase()}-${pattern}.mid`,
    );
  };

  const importMidi = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const read = readMidi(new Uint8Array(await file.arrayBuffer()));
      // The octave of the Seq moves the notes it plays: the steps are an octave shift away from them.
      const unshifted = read.notes.map((note) => ({ ...note, note: note.note - shift }));
      const placed = stepsFromNotes(unshifted, {
        stepBeats,
        steps: definition.steps,
        lowest: definition.lowest,
        highest: definition.highest,
        beats: read.beats,
      });
      if (placed.steps.every((step) => step.note === null)) {
        setMessage(`${file.name} has no notes the Seq can play`);
        return;
      }
      updateParams(nodeId, { [definition.id]: formatSequence(placed.steps), length: placed.length }, { pattern });
      setMessage(
        placed.left > 0
          ? `${placed.left} notes left out: a step plays one note, and there are ${definition.steps} steps`
          : undefined,
      );
    } catch (cause) {
      setMessage(cause instanceof MidiFormatError ? cause.message : `${file.name} is not a MIDI file`);
    }
  };

  return (
    <div className="sequence-midi nodrag">
      <MidiButton
        label="Import MIDI"
        hint="Put the notes of a MIDI file in this pattern, a note a step"
        icon={<LoadIcon />}
        onClick={() => input.current?.click()}
      />
      <MidiButton label="Export MIDI" hint="Save this pattern as a MIDI file, as it sounds" icon={<SaveIcon />} onClick={exportMidi} />
      <input
        ref={input}
        type="file"
        accept="audio/midi,audio/x-midi,.mid,.midi"
        aria-label="Import MIDI file"
        hidden
        onChange={importMidi}
      />
      {message && (
        <span role="alert" className="sequence-midi-message">
          {message}
        </span>
      )}
    </div>
  );
}

interface MidiButtonProps {
  label: string;
  hint: string;
  icon: ReactNode;
  onClick: () => void;
}

/** An arrow and MIDI, with a tooltip that says what the button does. */
function MidiButton({ label, hint, icon, onClick }: MidiButtonProps) {
  const { triggerProps, tooltip } = useTooltip(
    <>
      <strong>{label}</strong>
      <br />
      {hint}
    </>,
  );
  return (
    <>
      <button {...triggerProps} type="button" className="hw clip-preview-edit midi-button" aria-label={label} onClick={onClick}>
        {icon}
        MIDI
      </button>
      {tooltip}
    </>
  );
}
