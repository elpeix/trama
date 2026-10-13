import type { Params, ParamValue } from "../../../patch/types";
import type { MidiInput } from "../../MidiInput";
import { ALL_NOTES_OFF, ALL_SOUND_OFF, MOD_WHEEL, pedalDown, SUSTAIN_PEDAL, type MidiEvent } from "../../midiMessage";
import { unknownParameter, type AudioModule, type NoteActivity } from "../AudioModule";
import { KeyboardModule } from "./KeyboardModule";

const MAX_VALUE = 127;

/**
 * Plays the notes of the MIDI devices, from one channel or all of them, as a Keyboard plays the
 * computer keys: the last key held sounds on pitch and gate, and all of them on notes. The pitch
 * wheel bends pitch, the mod wheel and the sustain pedal come out as controls, and while the pedal
 * is down the notes let go keep sounding until it comes up. It has no noteOn of its own, so the
 * computer keys, which play every module with one, leave it alone.
 */
export class MidiModule implements AudioModule {
  private readonly midi: MidiInput;
  private readonly keys: KeyboardModule;
  private readonly pitch: GainNode;
  private readonly bend: ConstantSourceNode;
  private readonly mod: ConstantSourceNode;
  private readonly pedal: ConstantSourceNode;
  /** The note each key held started, by channel and key, so it ends that note whatever changed meanwhile. */
  private readonly sent = new Map<string, number>();
  /** The notes let go while the pedal was down, which end when it comes up. */
  private readonly sustained = new Set<number>();
  private sustaining = false;
  private bendAmount = 0;
  private channel: string;
  private transpose: number;
  private bendRange: number;

  constructor(context: BaseAudioContext, params: Params, midi: MidiInput) {
    this.midi = midi;
    this.channel = String(params.channel);
    this.transpose = Number(params.transpose);
    this.bendRange = Number(params.bend);
    this.keys = new KeyboardModule(context, { transpose: 0 });
    this.pitch = context.createGain();
    this.keys.getAudioOutput("pitch")!.connect(this.pitch);
    this.bend = this.constant(context);
    this.bend.connect(this.pitch);
    this.mod = this.constant(context);
    this.pedal = this.constant(context);
    midi.open();
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    switch (port) {
      case "pitch":
        return this.pitch;
      case "velocity":
        return this.keys.getAudioOutput("velocity");
      case "mod":
        return this.mod;
      case "pedal":
        return this.pedal;
      default:
        return undefined;
    }
  }

  getTriggerOutput(port: string) {
    return this.keys.getTriggerOutput(port);
  }

  getNoteOutput(port: string) {
    return this.keys.getNoteOutput(port);
  }

  getNotes(): NoteActivity {
    return this.keys.getNotes();
  }

  getMidiState() {
    return this.midi.state;
  }

  /** Plays a message from the MIDI devices, if it comes on the channel the module listens to. */
  receiveMidi(event: MidiEvent, time: number) {
    if (this.channel !== "all" && Number(this.channel) !== event.channel) {
      return;
    }
    switch (event.type) {
      case "noteOn":
        return this.press(event.channel, event.note, event.velocity, time);
      case "noteOff":
        return this.release(event.channel, event.note, time);
      case "bend":
        this.bendAmount = event.amount;
        return this.setBend(time);
      case "control":
        return this.control(event.control, event.value, time);
    }
  }

  /** Ends every note, as when a device goes away in the middle of one. */
  releaseMidi(time: number) {
    this.sent.clear();
    this.sustained.clear();
    this.keys.allNotesOff(time);
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "channel":
        this.channel = String(value);
        return this.releaseMidi(time);
      case "transpose":
        this.transpose = Number(value);
        return;
      case "bend":
        this.bendRange = Number(value);
        return this.setBend(time);
      default:
        unknownParameter("MIDI In", name);
    }
  }

  dispose() {
    this.keys.dispose();
    this.pitch.disconnect();
    for (const source of [this.bend, this.mod, this.pedal]) {
      source.stop();
      source.disconnect();
    }
  }

  private press(channel: number, key: number, velocity: number, time: number) {
    const note = key + this.transpose;
    this.sent.set(`${channel} ${key}`, note);
    this.sustained.delete(note);
    this.keys.noteOn(note, time, velocity);
  }

  private release(channel: number, key: number, time: number) {
    const id = `${channel} ${key}`;
    const note = this.sent.get(id);
    if (note === undefined) {
      return;
    }
    this.sent.delete(id);
    if (this.sustaining) {
      this.sustained.add(note);
    } else {
      this.keys.noteOff(note, time);
    }
  }

  private control(control: number, value: number, time: number) {
    switch (control) {
      case MOD_WHEEL:
        this.mod.offset.setValueAtTime(value / MAX_VALUE, time);
        return;
      case SUSTAIN_PEDAL:
        this.pedal.offset.setValueAtTime(value / MAX_VALUE, time);
        return this.setSustain(pedalDown(value), time);
      case ALL_SOUND_OFF:
      case ALL_NOTES_OFF:
        return this.releaseMidi(time);
    }
  }

  private setSustain(down: boolean, time: number) {
    this.sustaining = down;
    if (down) {
      return;
    }
    this.sustained.forEach((note) => this.keys.noteOff(note, time));
    this.sustained.clear();
  }

  private setBend(time: number) {
    this.bend.offset.setValueAtTime((this.bendAmount * this.bendRange) / 12, time);
  }

  private constant(context: BaseAudioContext) {
    const source = context.createConstantSource();
    source.offset.value = 0;
    source.start();
    return source;
  }
}
