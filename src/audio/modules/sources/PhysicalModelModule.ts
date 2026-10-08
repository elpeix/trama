import { MIDDLE_C_HZ } from "../../../patch/pitch";
import type { Params, ParamValue } from "../../../patch/types";
import { PHYSICAL_MODEL_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { glide, unknownParameter, type AudioModule, type TriggerInput } from "../AudioModule";

export class PhysicalModelModule implements AudioModule, TriggerInput {
  private readonly node: AudioWorkletNode;
  private mode: string;
  private frequency: number;

  constructor(context: BaseAudioContext, params: Params) {
    this.mode = String(params.mode);
    this.frequency = Number(params.frequency);
    this.node = new AudioWorkletNode(context, PHYSICAL_MODEL_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {
        frequency: this.baseFrequency(),
        detune: Number(params.detune),
        decay: Number(params.decay),
        damp: Number(params.damp),
        brightness: Number(params.brightness),
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
    if (port === "frequency" || port === "detune") {
      return this.param("detune");
    }
    return port === "brightness" ? this.param("brightness") : undefined;
  }

  getTriggerInput(port: string) {
    return port === "gate" ? this : undefined;
  }

  gateOn(time: number) {
    this.post({ type: "pluck", time });
  }

  gateOff(time: number) {
    this.post({ type: "release", time });
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "mode":
        this.mode = String(value);
        return glide(this.param("frequency"), this.baseFrequency(), time);
      case "frequency":
        this.frequency = Number(value);
        if (this.mode === "free") {
          glide(this.param("frequency"), value, time);
        }
        return;
      case "detune":
      case "decay":
      case "damp":
      case "brightness":
        return glide(this.param(name), value, time);
      default:
        unknownParameter("Physical Model", name);
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

  private baseFrequency() {
    return this.mode === "keyboard" ? MIDDLE_C_HZ : this.frequency;
  }
}
