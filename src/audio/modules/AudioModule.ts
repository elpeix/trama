import type { ParamValue, PatternSlot } from "../../patch/types";
import type { Launch } from "../../patch/patterns";
import type { MidiState } from "../MidiInput";
import type { MidiEvent } from "../midiMessage";
import type { StereoAnalyser } from "./stereoAnalyser";

export interface TriggerInput {
  gateOn(time: number): void;
  gateOff(time: number): void;
}

export interface TriggerOutput {
  connect(input: TriggerInput): void;
  disconnect(input: TriggerInput): void;
}

export interface NoteReceiver {
  /** Starts a note, played as hard as `velocity`, from 1 to 127 as in MIDI (DEFAULT_VELOCITY if not given). */
  noteOn(note: number, time: number, velocity?: number): void;
  noteOff(note: number, time: number): void;
  allNotesOff(time: number): void;
  /** Moves a note that sounds into another one over `seconds`, as the same note: no new gate, and the new one ends it. */
  glide?(from: number, to: number, time: number, seconds: number): void;
}

export interface NoteOutput {
  connect(receiver: NoteReceiver): void;
  disconnect(receiver: NoteReceiver): void;
}

/** What a note source is doing, for display: the notes it cycles through and the one sounding now. */
export interface NoteActivity {
  notes: number[];
  playing?: number;
}

/** The pattern a node plays, the one launched that waits to take over, and whether a stop silenced it. */
export interface PatternState {
  playing: PatternSlot;
  queued?: Launch;
  stopped?: boolean;
}

/** What the microphone of an audio input is doing: waiting for permission, listening, blocked, or missing. */
export type InputStatus = "asking" | "on" | "denied" | "unavailable";

/** The file a sampler plays: none loaded, being read, ready, gone from this browser, or not audio. */
export interface SampleState {
  status: "empty" | "loading" | "ready" | "missing" | "invalid";
  name?: string;
  buffer?: AudioBuffer;
}

/** The files a sampler plays, each as it stands, and the place of the one it played last. */
export interface SamplerState {
  samples: SampleState[];
  playing: number;
}

export interface Channel {
  level: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

export interface VoiceUsage {
  voices: number;
  needed: number;
}

export interface AudioModule {
  getAudioInput(port: string): AudioNode | undefined;
  getAudioOutput(port: string): AudioNode | undefined;
  getAudioParam?(port: string): AudioParam | undefined;
  /** An input of its own for each incoming connection, so they are not summed (the traces of a scope). */
  openInput?(port: string, connectionId: string): AudioNode | undefined;
  closeInput?(connectionId: string): void;
  /** The level and switches of the channel an incoming connection opened. */
  setChannel?(connectionId: string, channel: Channel, time: number): void;
  getAnalyser?(): StereoAnalyser;
  /** Brings the volume to `gain` at `time`: along a ramp from where it is, or at once. */
  fade?(gain: number, time: number, ramp: boolean): void;
  getProbe?(connectionId: string): StereoAnalyser | undefined;
  getNotes?(): NoteActivity;
  getPosition?(): number | undefined;
  /** Semitones the computer keys move its notes by, when it follows them; 0 when it does not. */
  getKeyTranspose?(): number;
  getInputStatus?(): InputStatus;
  /** Plays a message from the MIDI devices. */
  receiveMidi?(event: MidiEvent, time: number): void;
  /** Ends the notes the MIDI devices started, as when one goes away. */
  releaseMidi?(time: number): void;
  getMidiState?(): MidiState;
  /** Whether its limiter went quiet because the sound ran away, until unmute. */
  isMuted?(): boolean;
  unmute?(): void;
  /** How many voices the subpatch of an In of notes has, and the most its notes needed at once. */
  getVoiceUsage?(): VoiceUsage | undefined;
  getSample?(): SamplerState;
  getTriggerInput?(port: string): TriggerInput | undefined;
  /** A trigger input for an incoming connection, so the module knows which cables bring it gates. */
  openTrigger?(port: string, connectionId: string): TriggerInput | undefined;
  closeTrigger?(connectionId: string): void;
  getTriggerOutput?(port: string): TriggerOutput | undefined;
  getNoteInput?(port: string): NoteReceiver | undefined;
  getNoteOutput?(port: string): NoteOutput | undefined;
  setParameter(name: string, value: ParamValue, time: number): void;
  /** Sets a param of pattern B, C or D; pattern A is in the params. */
  setPatternParameter?(slot: PatternSlot, name: string, value: ParamValue): void;
  /**
   * Queues a pattern to take over; with `mode`, when it does, instead of its own Launch; with `at`,
   * on that beat of the pattern instead of where the grid is.
   */
  launchPattern?(slot: Launch, mode?: string, at?: number): void;
  getPattern?(): PatternState;
  /** Plays a note out of its outputs until previewOff, to hear it while it is edited; one at a time. */
  previewOn?(note: number, time: number, velocity?: number): void;
  previewOff?(time: number): void;
  /** Stops at once what it plays, keeping what it has loaded, so that a start does not go on with it. */
  hush?(): void;
  dispose(): void;
}

export function isNoteReceiver(module: AudioModule): module is AudioModule & NoteReceiver {
  return "noteOn" in module;
}

export class TriggerBus implements TriggerOutput, TriggerInput {
  private readonly inputs = new Set<TriggerInput>();

  connect(input: TriggerInput) {
    this.inputs.add(input);
  }

  disconnect(input: TriggerInput) {
    this.inputs.delete(input);
  }

  gateOn(time: number) {
    this.inputs.forEach((input) => input.gateOn(time));
  }

  gateOff(time: number) {
    this.inputs.forEach((input) => input.gateOff(time));
  }
}

export class NoteBus implements NoteOutput, NoteReceiver {
  private readonly receivers = new Set<NoteReceiver>();

  connect(receiver: NoteReceiver) {
    this.receivers.add(receiver);
  }

  disconnect(receiver: NoteReceiver) {
    this.receivers.delete(receiver);
  }

  noteOn(note: number, time: number, velocity?: number) {
    this.receivers.forEach((receiver) => receiver.noteOn(note, time, velocity));
  }

  noteOff(note: number, time: number) {
    this.receivers.forEach((receiver) => receiver.noteOff(note, time));
  }

  allNotesOff(time: number) {
    this.receivers.forEach((receiver) => receiver.allNotesOff(time));
  }

  glide(from: number, to: number, time: number, seconds: number) {
    this.receivers.forEach((receiver) => receiver.glide?.(from, to, time, seconds));
  }
}

const GLIDE_TIME_CONSTANT = 0.01;

export function glide(param: AudioParam, value: ParamValue, time: number) {
  param.setTargetAtTime(Number(value), time, GLIDE_TIME_CONSTANT);
}

export function unknownParameter(module: string, name: string): never {
  throw new Error(`${module} has no parameter "${name}"`);
}
