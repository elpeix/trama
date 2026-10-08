import type { Params, ParamValue } from "../../../patch/types";
import { SPECTRAL_FREEZE_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { glide, unknownParameter, type AudioModule, type TriggerInput } from "../AudioModule";

export class SpectralFreezeModule implements AudioModule, TriggerInput {
  private readonly node: AudioWorkletNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.node = new AudioWorkletNode(context, SPECTRAL_FREEZE_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
      parameterData: {
        mix: Number(params.mix),
        release: Number(params.release),
      },
    });
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getTriggerInput(port: string) {
    return port === "gate" ? this : undefined;
  }

  gateOn(time: number) {
    this.post({ type: "freeze", time });
  }

  gateOff(time: number) {
    this.post({ type: "release", time });
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "mix":
      case "release":
        return glide(this.node.parameters.get(name)!, value, time);
      default:
        unknownParameter("Spectral Freeze", name);
    }
  }

  dispose() {
    this.node.disconnect();
    this.post({ type: "stop" });
  }

  private post(message: ProcessorMessage) {
    this.node.port.postMessage(message);
  }
}
