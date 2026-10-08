import { Piano } from "./piano";
import { PIANO_PROCESSOR, type ProcessorMessage } from "../../worklets/names";

class PianoProcessor extends AudioWorkletProcessor {
  static parameterDescriptors: AudioParamDescriptor[] = [
    { name: "brightness", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "decay", defaultValue: 1, minValue: 0.25, maxValue: 2, automationRate: "k-rate" },
    { name: "unison", defaultValue: 1, minValue: 0, maxValue: 4, automationRate: "k-rate" },
    { name: "hammer", defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "pedal", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    { name: "body", defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: "k-rate" },
  ];

  private readonly piano = new Piano(sampleRate);
  private running = true;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      const frame = "time" in data ? Math.max(currentFrame, Math.round(data.time * sampleRate)) : 0;
      if (data.type === "noteOn") {
        this.piano.noteOn(data.note, frame, data.velocity);
      } else if (data.type === "noteOff") {
        this.piano.noteOff(data.note, frame);
      } else if (data.type === "allNotesOff") {
        this.piano.allNotesOff(frame);
      } else if (data.type === "stop") {
        this.running = false;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const [left, right] = outputs[0] ?? [];
    if (left) {
      this.piano.process(left, right, currentFrame, {
        brightness: parameters.brightness[0],
        decay: parameters.decay[0],
        unison: parameters.unison[0],
        hammer: parameters.hammer[0],
        pedal: parameters.pedal[0],
        body: parameters.body[0],
      });
    }
    return this.running;
  }
}

registerProcessor(PIANO_PROCESSOR, PianoProcessor);
