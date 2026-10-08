import { PITCH_SHIFTER_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { PitchShifter } from "./pitchShifter";

class PitchShifterProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [
    { name: "shift", defaultValue: 7, minValue: -48, maxValue: 48, automationRate: "k-rate" },
    { name: "window", defaultValue: 60, minValue: 20, maxValue: 200, automationRate: "k-rate" },
    { name: "mix", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
  ];

  private readonly shifters = [new PitchShifter(sampleRate), new PitchShifter(sampleRate)];
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
    const settings = { shift: parameters.shift[0], window: parameters.window[0], mix: parameters.mix[0] };
    outputs[0]?.forEach((output, channel) => {
      this.shifters[channel]?.process(inputs[0]?.[channel] ?? inputs[0]?.[0], output, settings);
    });
    return this.running;
  }
}

registerProcessor(PITCH_SHIFTER_PROCESSOR, PitchShifterProcessor);
