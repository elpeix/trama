import { Ladder } from "./ladder";
import { LADDER_PROCESSOR, type ProcessorMessage } from "../../worklets/names";

class LadderProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [
    { name: "frequency", defaultValue: 800, minValue: 20, maxValue: 20000, automationRate: "a-rate" },
    { name: "detune", defaultValue: 0, minValue: -12000, maxValue: 12000, automationRate: "a-rate" },
    { name: "resonance", defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: "a-rate" },
    { name: "drive", defaultValue: 0.2, minValue: 0, maxValue: 1, automationRate: "k-rate" },
  ];

  private readonly sides = [new Ladder(sampleRate), new Ladder(sampleRate)];
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
    outputs[0]?.forEach((output, channel) => {
      this.sides[channel]?.process(inputs[0]?.[channel] ?? inputs[0]?.[0], output, {
        frequency: parameters.frequency,
        detune: parameters.detune,
        resonance: parameters.resonance,
        drive: parameters.drive[0],
      });
    });
    return this.running;
  }
}

registerProcessor(LADDER_PROCESSOR, LadderProcessor);
