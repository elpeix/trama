import { Granulator } from "./granulator";
import { GRANULATOR_PROCESSOR, type ProcessorMessage } from "../../worklets/names";

class GranulatorProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [
    { name: "position", defaultValue: 0.3, minValue: 0, maxValue: 4, automationRate: "k-rate" },
    { name: "size", defaultValue: 80, minValue: 10, maxValue: 500, automationRate: "k-rate" },
    { name: "density", defaultValue: 20, minValue: 1, maxValue: 100, automationRate: "k-rate" },
    { name: "pitch", defaultValue: 0, minValue: -48, maxValue: 48, automationRate: "k-rate" },
    { name: "spread", defaultValue: 0.2, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "mix", defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "freeze", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
  ];

  private readonly granulators = [new Granulator(sampleRate), new Granulator(sampleRate)];
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
    const settings = {
      position: parameters.position[0],
      size: parameters.size[0],
      density: parameters.density[0],
      pitch: parameters.pitch[0],
      spread: parameters.spread[0],
      mix: parameters.mix[0],
      freeze: parameters.freeze[0] >= 0.5,
    };
    outputs[0]?.forEach((output, channel) => {
      this.granulators[channel]?.process(inputs[0]?.[channel] ?? inputs[0]?.[0], output, settings);
    });
    return this.running;
  }
}

registerProcessor(GRANULATOR_PROCESSOR, GranulatorProcessor);
