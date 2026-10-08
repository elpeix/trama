import { Modal, type ModalModel } from "./modal";
import { MODAL_PROCESSOR, type ProcessorMessage } from "../../worklets/names";

class ModalProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [
    { name: "frequency", defaultValue: 440, minValue: 20, maxValue: 20000, automationRate: "a-rate" },
    { name: "detune", defaultValue: 0, minValue: -9600, maxValue: 9600, automationRate: "a-rate" },
    { name: "decay", defaultValue: 3, minValue: 0.1, maxValue: 10, automationRate: "k-rate" },
    { name: "brightness", defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "hit", defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "stretch", defaultValue: 0, minValue: -1, maxValue: 1, automationRate: "k-rate" },
  ];

  private readonly modal = new Modal(sampleRate);
  private model: ModalModel;
  private running = true;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    this.model = (options?.processorOptions?.model ?? "tubular") as ModalModel;
    this.port.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      if (data.type === "strike") {
        this.modal.strike(Math.max(currentFrame, Math.round(data.time * sampleRate)));
      } else if (data.type === "model") {
        this.model = data.model as ModalModel;
      } else if (data.type === "stop") {
        this.running = false;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const output = outputs[0]?.[0];
    if (output) {
      this.modal.process(output, currentFrame, {
        model: this.model,
        frequency: parameters.frequency,
        detune: parameters.detune,
        decay: parameters.decay[0],
        brightness: parameters.brightness[0],
        hit: parameters.hit[0],
        stretch: parameters.stretch[0],
      });
    }
    return this.running;
  }
}

registerProcessor(MODAL_PROCESSOR, ModalProcessor);
