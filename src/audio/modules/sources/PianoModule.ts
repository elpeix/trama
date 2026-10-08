import { DEFAULT_VELOCITY } from "../../../patch/clip";
import type { Params, ParamValue } from "../../../patch/types";
import { PIANO_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { glide, unknownParameter, type AudioModule, type NoteReceiver } from "../AudioModule";

/** A grand piano worked out on the audio thread, played by the notes it gets: chords, velocity and a sustain pedal. */
export class PianoModule implements AudioModule, NoteReceiver {
  private readonly node: AudioWorkletNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.node = new AudioWorkletNode(context, PIANO_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      parameterData: {
        brightness: Number(params.brightness),
        decay: Number(params.decay),
        unison: Number(params.unison),
        hammer: Number(params.hammer),
        pedal: Number(params.pedal),
        body: Number(params.body),
      },
    });
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioParam(port: string) {
    return port === "pedal" || port === "brightness" ? this.param(port) : undefined;
  }

  getNoteInput(port: string) {
    return port === "notes" ? this : undefined;
  }

  noteOn(note: number, time: number, velocity = DEFAULT_VELOCITY) {
    this.post({ type: "noteOn", note, time, velocity });
  }

  noteOff(note: number, time: number) {
    this.post({ type: "noteOff", note, time });
  }

  allNotesOff(time: number) {
    this.post({ type: "allNotesOff", time });
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "pedal":
        this.param(name).setValueAtTime(Number(value), time);
        return;
      case "brightness":
      case "decay":
      case "unison":
      case "hammer":
      case "body":
        return glide(this.param(name), value, time);
      default:
        unknownParameter("Piano", name);
    }
  }

  dispose() {
    this.node.disconnect();
    this.post({ type: "stop" });
  }

  private param(name: string) {
    return this.node.parameters.get(name)!;
  }

  private post(message: ProcessorMessage) {
    this.node.port.postMessage(message);
  }
}
