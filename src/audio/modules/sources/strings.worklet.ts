import { Strings } from "./strings";
import type { StringsPlay } from "../../../patch/effects";
import { STRINGS_PROCESSOR, type ProcessorMessage } from "../../worklets/names";

class StringsProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [
    { name: "bow", defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: "a-rate" },
    { name: "pressure", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "position", defaultValue: 0.12, minValue: 0.06, maxValue: 0.25, automationRate: "k-rate" },
    { name: "detune", defaultValue: 0, minValue: -9600, maxValue: 9600, automationRate: "a-rate" },
    { name: "brightness", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "noise", defaultValue: 0.15, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "vibrato", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "attack", defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: "k-rate" },
  ];

  private readonly strings = new Strings(sampleRate);
  private play: StringsPlay;
  private running = true;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    this.play = (options?.processorOptions?.play ?? "bowed") as StringsPlay;
    this.strings.setBody(options?.processorOptions?.body ?? []);
    this.port.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      const frame = "time" in data ? Math.max(currentFrame, Math.round(data.time * sampleRate)) : 0;
      if (data.type === "noteOn") {
        this.strings.noteOn(data.note, frame, data.velocity);
      } else if (data.type === "noteOff") {
        this.strings.noteOff(data.note, frame);
      } else if (data.type === "allNotesOff") {
        this.strings.allNotesOff(frame);
      } else if (data.type === "play") {
        this.play = data.play as StringsPlay;
      } else if (data.type === "body") {
        this.strings.setBody(data.gains);
      } else if (data.type === "stop") {
        this.running = false;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const output = outputs[0]?.[0];
    if (output) {
      this.strings.process(output, currentFrame, {
        play: this.play,
        bow: parameters.bow,
        pressure: parameters.pressure[0],
        position: parameters.position[0],
        detune: parameters.detune,
        brightness: parameters.brightness[0],
        noise: parameters.noise[0],
        vibrato: parameters.vibrato[0],
        attack: parameters.attack[0],
      });
    }
    return this.running;
  }
}

registerProcessor(STRINGS_PROCESSOR, StringsProcessor);
