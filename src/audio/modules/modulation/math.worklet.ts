import { MATH_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { combine } from "./math";

class MathProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [{ name: "b", defaultValue: 0, automationRate: "a-rate" }];

  private operation: string;
  private running = true;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    this.operation = String(options?.processorOptions?.operation ?? "add");
    this.port.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      if (data.type === "operation") {
        this.operation = data.operation;
      } else if (data.type === "stop") {
        this.running = false;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const output = outputs[0]?.[0];
    if (output) {
      combine(this.operation, inputs[0]?.[0], parameters.b, output);
    }
    return this.running;
  }
}

registerProcessor(MATH_PROCESSOR, MathProcessor);
