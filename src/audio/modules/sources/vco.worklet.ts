import { MAX_VOICES, Vco, type VcoWave } from "./vco";
import { VCO_PROCESSOR, type ProcessorMessage } from "../../worklets/names";

class VcoProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [
    { name: "frequency", defaultValue: 440, minValue: 20, maxValue: 20000, automationRate: "a-rate" },
    { name: "detune", defaultValue: 0, minValue: -9600, maxValue: 9600, automationRate: "a-rate" },
    { name: "width", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "a-rate" },
    { name: "voices", defaultValue: 1, minValue: 1, maxValue: MAX_VOICES, automationRate: "k-rate" },
    { name: "spread", defaultValue: 20, minValue: 0, maxValue: 100, automationRate: "k-rate" },
    { name: "drift", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
  ];

  private readonly vco = new Vco(sampleRate);
  private wave: VcoWave;
  private running = true;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    this.wave = (options?.processorOptions?.wave ?? "sawtooth") as VcoWave;
    this.port.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      if (data.type === "wave") {
        this.wave = data.wave as VcoWave;
      } else if (data.type === "stop") {
        this.running = false;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const [left, right] = outputs[0] ?? [];
    if (left) {
      this.vco.process(left, right, inputs[0]?.[0], {
        wave: this.wave,
        frequency: parameters.frequency,
        detune: parameters.detune,
        width: parameters.width,
        voices: parameters.voices[0],
        spread: parameters.spread[0],
        drift: parameters.drift[0],
      });
    }
    return this.running;
  }
}

registerProcessor(VCO_PROCESSOR, VcoProcessor);
