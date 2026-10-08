import type { ProcessorMessage } from "../../worklets/names";

/** An effect worked out a channel at a time, from the settings it gets. */
interface ChannelEffect<Settings> {
  process(input: Float32Array | undefined, output: Float32Array, settings: Settings): void;
}

/** The phase of the LFO on the right side, in cycles, a quarter apart from the left one for width. */
const RIGHT_PHASE = 0.25;

/**
 * Registers a processor that runs an effect on each side of a stereo sound, a mono one reaching
 * both, with its LFO a quarter of a cycle apart on the right. Its params are k-rate, one value a block.
 */
export function registerStereoEffect<Settings>(
  name: string,
  descriptors: AudioParamDescriptor[],
  create: (sampleRate: number, phase: number) => ChannelEffect<Settings>,
) {
  class StereoEffectProcessor extends AudioWorkletProcessor {
    static parameterDescriptors = descriptors.map((descriptor) => ({ ...descriptor, automationRate: "k-rate" as const }));

    private readonly sides = [create(sampleRate, 0), create(sampleRate, RIGHT_PHASE)];
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
      const settings = Object.fromEntries(
        descriptors.map(({ name: param }) => [param, parameters[param][0]]),
      ) as Settings;
      outputs[0]?.forEach((output, channel) => {
        this.sides[channel]?.process(inputs[0]?.[channel] ?? inputs[0]?.[0], output, settings);
      });
      return this.running;
    }
  }
  registerProcessor(name, StereoEffectProcessor);
}
