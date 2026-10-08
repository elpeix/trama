import type { Params, ParamValue } from "../../../patch/types";
import { PITCH_SHIFTER_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

export class PitchShifterModule implements AudioModule {
  private readonly node: AudioWorkletNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.node = new AudioWorkletNode(context, PITCH_SHIFTER_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
      parameterData: {
        shift: Number(params.shift),
        window: Number(params.window),
        mix: Number(params.mix),
      },
    });
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioParam(port: string) {
    return port === "shift" ? this.param("shift") : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "shift":
      case "window":
      case "mix":
        return glide(this.param(name), value, time);
      default:
        unknownParameter("Pitch Shifter", name);
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
