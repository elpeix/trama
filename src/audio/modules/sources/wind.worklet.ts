import { Wind } from "./wind";
import type { WindBore, WindExciter } from "../../../patch/effects";
import { WIND_PROCESSOR, type ProcessorMessage } from "../../worklets/names";

class WindProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [
    { name: "breath", defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: "a-rate" },
    { name: "detune", defaultValue: 0, minValue: -9600, maxValue: 9600, automationRate: "a-rate" },
    { name: "noise", defaultValue: 0.2, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "brightness", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "vibrato", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "bell", defaultValue: 2000, minValue: 300, maxValue: 12000, automationRate: "k-rate" },
    { name: "flare", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "attack", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
  ];

  private readonly wind = new Wind(sampleRate);
  private exciter: WindExciter;
  private bore: WindBore;
  private running = true;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    this.exciter = (options?.processorOptions?.exciter ?? "reed") as WindExciter;
    this.bore = (options?.processorOptions?.bore ?? "cylinder") as WindBore;
    this.wind.setBody(options?.processorOptions?.body ?? []);
    this.port.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      const frame = "time" in data ? Math.max(currentFrame, Math.round(data.time * sampleRate)) : 0;
      if (data.type === "noteOn") {
        this.wind.noteOn(data.note, frame, data.velocity);
      } else if (data.type === "noteOff") {
        this.wind.noteOff(data.note, frame);
      } else if (data.type === "allNotesOff") {
        this.wind.allNotesOff(frame);
      } else if (data.type === "wind") {
        this.exciter = data.exciter as WindExciter;
        this.bore = data.bore as WindBore;
      } else if (data.type === "body") {
        this.wind.setBody(data.gains);
      } else if (data.type === "stop") {
        this.running = false;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const output = outputs[0]?.[0];
    if (output) {
      this.wind.process(output, currentFrame, {
        exciter: this.exciter,
        bore: this.bore,
        breath: parameters.breath,
        detune: parameters.detune,
        noise: parameters.noise[0],
        brightness: parameters.brightness[0],
        vibrato: parameters.vibrato[0],
        bell: parameters.bell[0],
        flare: parameters.flare[0],
        attack: parameters.attack[0],
      });
    }
    return this.running;
  }
}

registerProcessor(WIND_PROCESSOR, WindProcessor);
