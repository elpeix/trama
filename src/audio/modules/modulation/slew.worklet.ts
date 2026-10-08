import { SLEW_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { Slew } from "./slew";

class SlewProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [
    { name: "rise", defaultValue: 0.1, minValue: 0, automationRate: "k-rate" },
    { name: "fall", defaultValue: 0.1, minValue: 0, automationRate: "k-rate" },
  ];

  private readonly slew = new Slew(sampleRate);
  private running = true;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      if (data.type === "stop") {
        this.running = false;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const output = outputs[0]?.[0];
    if (output) {
      this.slew.process(inputs[0]?.[0], output, parameters.rise[0], parameters.fall[0]);
    }
    return this.running;
  }
}

registerProcessor(SLEW_PROCESSOR, SlewProcessor);
