import { OUTPUT_LIMITER_PROCESSOR, type LimiterMessage, type ProcessorMessage } from "../../worklets/names";
import { OutputLimiter } from "./limiter";

class OutputLimiterProcessor extends AudioWorkletProcessor {
  private readonly limiter = new OutputLimiter(sampleRate);
  private running = true;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    this.limiter.enabled = options?.processorOptions?.enabled ?? true;
    this.port.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      if (data.type === "limiter") {
        this.limiter.enabled = data.enabled;
      } else if (data.type === "unmute") {
        this.limiter.unmute();
      } else if (data.type === "stop") {
        this.running = false;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    if (outputs[0] && this.limiter.process(inputs[0] ?? [], outputs[0])) {
      this.port.postMessage({ type: "muted" } satisfies LimiterMessage);
    }
    return this.running;
  }
}

registerProcessor(OUTPUT_LIMITER_PROCESSOR, OutputLimiterProcessor);
