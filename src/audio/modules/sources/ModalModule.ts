import { MIDDLE_C_HZ } from "../../../patch/pitch";
import type { Params, ParamValue } from "../../../patch/types";
import { MODAL_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { glide, unknownParameter, type AudioModule, type TriggerInput } from "../AudioModule";

/** A struck bell, bar or gong by modal synthesis, worked out on the audio thread: each gate strikes it, and it rings on its own. */
export class ModalModule implements AudioModule, TriggerInput {
  private readonly node: AudioWorkletNode;
  private mode: string;
  private frequency: number;

  constructor(context: BaseAudioContext, params: Params) {
    this.mode = String(params.mode);
    this.frequency = Number(params.frequency);
    this.node = new AudioWorkletNode(context, MODAL_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {
        frequency: this.baseFrequency(),
        detune: Number(params.detune),
        decay: Number(params.decay),
        brightness: Number(params.brightness),
        hit: Number(params.hit),
        stretch: Number(params.stretch),
      },
      processorOptions: { model: String(params.model) },
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
    this.post({ type: "strike", time });
  }

  gateOff(_time: number) {}

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "model":
        return this.post({ type: "model", model: String(value) });
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
      case "brightness":
      case "hit":
      case "stretch":
        return glide(this.param(name), value, time);
      default:
        unknownParameter("Modal", name);
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
