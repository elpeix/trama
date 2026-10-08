import type { Params, ParamValue } from "../../../patch/types";
import { SLEW_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { unknownParameter, type AudioModule } from "../AudioModule";

/**
 * Smooths the jumps of the control signal it gets: it rises and falls towards it at a steady rate,
 * on the audio thread. On a pitch, a portamento.
 */
export class SlewModule implements AudioModule {
  private readonly node: AudioWorkletNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.node = new AudioWorkletNode(context, SLEW_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      parameterData: { rise: Number(params.rise), fall: Number(params.fall) },
    });
  }

  getAudioInput() {
    return undefined;
  }

  openInput(port: string) {
    return port === "in" ? this.node : undefined;
  }

  closeInput() {}

  getAudioOutput(port: string) {
    return port === "out" ? this.node : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    if (name !== "rise" && name !== "fall") {
      unknownParameter("Slew", name);
    }
    this.node.parameters.get(name)!.setValueAtTime(Number(value), time);
  }

  dispose() {
    this.node.disconnect();
    this.post({ type: "stop" });
  }

  private post(message: ProcessorMessage) {
    this.node.port.postMessage(message);
  }
}
