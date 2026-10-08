import { KarplusStrong } from "./karplusStrong";
import { PHYSICAL_MODEL_PROCESSOR, type ProcessorMessage } from "../../worklets/names";

class PhysicalModelProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [
    { name: "frequency", defaultValue: 220, minValue: 20, maxValue: 20000, automationRate: "a-rate" },
    { name: "detune", defaultValue: 0, minValue: -9600, maxValue: 9600, automationRate: "a-rate" },
    { name: "decay", defaultValue: 1.5, minValue: 0.05, maxValue: 10, automationRate: "k-rate" },
    { name: "damp", defaultValue: 0.08, minValue: 0.005, maxValue: 2, automationRate: "k-rate" },
    { name: "brightness", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
  ];

  private readonly string = new KarplusStrong(sampleRate);
  private running = true;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      const frame = "time" in data ? Math.max(currentFrame, Math.round(data.time * sampleRate)) : 0;
      if (data.type === "pluck") {
        this.string.pluck(frame);
      } else if (data.type === "release") {
        this.string.damp(frame);
      } else {
        this.running = false;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const output = outputs[0]?.[0];
    if (output) {
      this.string.process(output, currentFrame, {
        frequency: parameters.frequency,
        detune: parameters.detune,
        decay: parameters.decay[0],
        damp: parameters.damp[0],
        brightness: parameters.brightness[0],
      });
    }
    return this.running;
  }
}

registerProcessor(PHYSICAL_MODEL_PROCESSOR, PhysicalModelProcessor);
