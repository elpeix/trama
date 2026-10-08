import { ENVELOPE_FOLLOWER_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { EnvelopeFollower } from "./envelopeFollower";

class EnvelopeFollowerProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [
    { name: "attack", defaultValue: 0.01, minValue: 0, automationRate: "k-rate" },
    { name: "release", defaultValue: 0.2, minValue: 0, automationRate: "k-rate" },
    { name: "gain", defaultValue: 1, minValue: 0, automationRate: "k-rate" },
  ];

  private readonly follower = new EnvelopeFollower(sampleRate);
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
      this.follower.process(
        inputs[0] ?? [],
        output,
        parameters.attack[0],
        parameters.release[0],
        parameters.gain[0],
      );
    }
    return this.running;
  }
}

registerProcessor(ENVELOPE_FOLLOWER_PROCESSOR, EnvelopeFollowerProcessor);
