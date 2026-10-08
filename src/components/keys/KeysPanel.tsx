import { useContext } from "react";
import { noteName } from "../../patch/pitch";
import { KeysContext } from "./KeysContext";
import { OctaveSwitch } from "./OctaveSwitch";
import { Piano } from "./Piano";
import { FIRST_NOTE, KEYS } from "./useComputerKeyboard";
import { keyOf, usePlayingNote } from "./usePlayingNote";

interface KeysPanelProps {
  nodeId: string;
  /** The semitones the node adds to the notes of the keys. */
  transpose: number;
}

/**
 * The computer keys drawn as the piano keys they play, lit while down, and played with the mouse
 * too, like their letters, with a light on the note
 * the node is sounding, and the octave switch of a MIDI keyboard under them: Z and X, or their
 * buttons, move the notes an octave, and an UP light shows while Shift or Caps Lock play one octave
 * up. Its screen shows the notes that come out of the node, with its transpose.
 */
export function KeysPanel({ nodeId, transpose }: KeysPanelProps) {
  const { octave, up, held, changeOctave, press, release } = useContext(KeysContext);
  const { playing } = usePlayingNote(nodeId);
  const first = FIRST_NOTE + 12 * octave + transpose;
  // The key that started the note, when one did: with Shift, A plays the C above its own key.
  const startedBy = KEYS.findIndex((letter) => {
    const note = held.get(letter);
    return note !== undefined && note + transpose === playing;
  });
  const playingKey =
    playing === undefined ? undefined : startedBy !== -1 ? startedBy : keyOf(playing, first, KEYS.length);

  return (
    <div className="keys-panel">
      <Piano
        label={`Computer keys: ${KEYS.join(" ").toUpperCase()}`}
        playing={playing === undefined ? undefined : noteName(playing)}
        keys={KEYS.map((letter, semitone) => ({
          semitone,
          label: letter.toUpperCase(),
          lit: held.has(letter),
          playing: semitone === playingKey,
        }))}
        onPlay={press}
        onStop={release}
      />
      <OctaveSwitch from={first} to={first + KEYS.length - 1} onChange={changeOctave} keys={{ down: "Z", up: "X" }}>
        <span className="keys-up" title="Hold Shift, or turn Caps Lock on, to play one octave up" data-on={up}>
          <span className="keys-led" aria-hidden="true" />
          Up
        </span>
      </OctaveSwitch>
    </div>
  );
}
