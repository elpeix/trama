import type { Params, ParamValue } from "../../../patch/types";
import { MATH_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

/**
 * Combines the control signal it gets with b, the knob plus the cables into it: adds, subtracts,
 * multiplies, or takes the lowest or the highest. It works on the audio thread, a frame at a time.
 */
export class MathModule implements AudioModule {
  private readonly node: AudioWorkletNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.node = new AudioWorkletNode(context, MATH_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      parameterData: { b: Number(params.b) },
      processorOptions: { operation: String(params.operation) },
    });
  }

  getAudioInput() {
    return undefined;
  }

  openInput(port: string) {
    return port === "a" ? this.node : undefined;
  }

  closeInput() {}

  getAudioOutput(port: string) {
    return port === "out" ? this.node : undefined;
  }

  getAudioParam(port: string) {
    return port === "b" ? this.node.parameters.get("b") : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "b":
        return glide(this.node.parameters.get("b")!, value, time);
      case "operation":
        return this.post({ type: "operation", operation: String(value) });
      default:
        unknownParameter("Math", name);
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
