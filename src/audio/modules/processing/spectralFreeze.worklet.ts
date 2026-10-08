import { SPECTRAL_FREEZE_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { SpectralFreeze } from "./spectralFreeze";

class SpectralFreezeProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [
    { name: "mix", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "release", defaultValue: 1, minValue: 0.01, maxValue: 10, automationRate: "k-rate" },
  ];

  private readonly freezes = [new SpectralFreeze(sampleRate), new SpectralFreeze(sampleRate)];
  private running = true;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      const frame = "time" in data ? Math.max(currentFrame, Math.round(data.time * sampleRate)) : currentFrame;
      if (data.type === "freeze") {
        this.freezes.forEach((freeze) => freeze.freeze(frame));
      } else if (data.type === "release") {
        this.freezes.forEach((freeze) => freeze.release(frame));
      } else if (data.type === "stop") {
        this.running = false;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const settings = { mix: parameters.mix[0], release: parameters.release[0] };
    outputs[0]?.forEach((output, channel) => {
      this.freezes[channel]?.process(inputs[0]?.[channel] ?? inputs[0]?.[0], output, currentFrame, settings);
    });
    return this.running;
  }
}

registerProcessor(SPECTRAL_FREEZE_PROCESSOR, SpectralFreezeProcessor);
