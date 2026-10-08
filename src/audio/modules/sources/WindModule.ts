import { DEFAULT_VELOCITY } from "../../../patch/clip";
import { parseCurve } from "../../../patch/sequence";
import type { Params, ParamValue } from "../../../patch/types";
import { WIND_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { glide, unknownParameter, type AudioModule, type NoteReceiver } from "../AudioModule";

/** A wind instrument by physical modelling, worked out on the audio thread, played one note at a time by the notes it gets. */
export class WindModule implements AudioModule, NoteReceiver {
  private readonly node: AudioWorkletNode;
  private exciter: string;
  private bore: string;

  constructor(context: BaseAudioContext, params: Params) {
    this.exciter = String(params.exciter);
    this.bore = String(params.bore);
    this.node = new AudioWorkletNode(context, WIND_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {
        breath: Number(params.breath),
        detune: Number(params.detune),
        noise: Number(params.noise),
        brightness: Number(params.brightness),
        vibrato: Number(params.vibrato),
        bell: Number(params.bell),
        flare: Number(params.flare),
        attack: Number(params.attack),
      },
      processorOptions: { exciter: this.exciter, bore: this.bore, body: parseCurve(String(params.body)) ?? [] },
    });
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioParam(port: string) {
    return port === "breath" || port === "detune" || port === "brightness" ? this.param(port) : undefined;
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
      case "exciter":
        this.exciter = String(value);
        return this.post({ type: "wind", exciter: this.exciter, bore: this.bore });
      case "bore":
        this.bore = String(value);
        return this.post({ type: "wind", exciter: this.exciter, bore: this.bore });
      case "body":
        return this.post({ type: "body", gains: parseCurve(String(value)) ?? [] });
      case "breath":
      case "detune":
      case "noise":
      case "brightness":
      case "vibrato":
      case "bell":
      case "flare":
      case "attack":
        return glide(this.param(name), value, time);
      default:
        unknownParameter("Wind", name);
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
