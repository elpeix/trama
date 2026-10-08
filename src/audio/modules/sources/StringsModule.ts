import { DEFAULT_VELOCITY } from "../../../patch/clip";
import { parseCurve } from "../../../patch/sequence";
import type { Params, ParamValue } from "../../../patch/types";
import { STRINGS_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { glide, unknownParameter, type AudioModule, type NoteReceiver } from "../AudioModule";

/** A string instrument by physical modelling, worked out on the audio thread, played one note at a time by the notes it gets. */
export class StringsModule implements AudioModule, NoteReceiver {
  private readonly node: AudioWorkletNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.node = new AudioWorkletNode(context, STRINGS_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {
        bow: Number(params.bow),
        pressure: Number(params.pressure),
        position: Number(params.position),
        detune: Number(params.detune),
        brightness: Number(params.brightness),
        noise: Number(params.noise),
        vibrato: Number(params.vibrato),
        attack: Number(params.attack),
      },
      processorOptions: { play: String(params.play), body: parseCurve(String(params.body)) ?? [] },
    });
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioParam(port: string) {
    return port === "bow" || port === "pressure" || port === "position" || port === "detune" || port === "brightness" ? this.param(port) : undefined;
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
      case "play":
        return this.post({ type: "play", play: String(value) });
      case "body":
        return this.post({ type: "body", gains: parseCurve(String(value)) ?? [] });
      case "bow":
      case "pressure":
      case "position":
      case "detune":
      case "brightness":
      case "noise":
      case "vibrato":
      case "attack":
        return glide(this.param(name), value, time);
      default:
        unknownParameter("Strings", name);
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
