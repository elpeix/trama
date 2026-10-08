import { SAMPLE_HOLD_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { SampleHold } from "./sampleHold";

class SampleHoldProcessor extends AudioWorkletProcessor {
  private readonly hold = new SampleHold();
  private running = true;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      if (data.type === "sample") {
        this.hold.sample(Math.max(currentFrame, Math.round(data.time * sampleRate)));
      } else if (data.type === "stop") {
        this.running = false;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0]?.[0];
    if (output) {
      this.hold.process(inputs[0]?.[0], output, currentFrame);
    }
    return this.running;
  }
}

registerProcessor(SAMPLE_HOLD_PROCESSOR, SampleHoldProcessor);
