import type { Params, ParamValue } from "../../../patch/types";
import { CHORUS_PROCESSOR, FLANGER_PROCESSOR, PHASER_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { unknownParameter, type AudioModule } from "../AudioModule";

/** An effect on a sound in stereo, worked out on the audio thread by the processor it names. */
class StereoEffectModule implements AudioModule {
  private readonly node: AudioWorkletNode;
  private readonly title: string;
  private readonly names: readonly string[];

  constructor(context: BaseAudioContext, processor: string, title: string, names: readonly string[], params: Params) {
    this.title = title;
    this.names = names;
    this.node = new AudioWorkletNode(context, processor, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
      parameterData: Object.fromEntries(names.map((name) => [name, Number(params[name])])),
    });
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    if (!this.names.includes(name)) {
      unknownParameter(this.title, name);
    }
    this.node.parameters.get(name)!.setValueAtTime(Number(value), time);
  }

  dispose() {
    this.node.disconnect();
    this.post({ type: "stop" });
  }

  private post(message: ProcessorMessage) {
    this.node.port.postMessage(message);
  }
}

/** Copies of the sound a little late, swept by an LFO: a wider, thicker sound. */
export class ChorusModule extends StereoEffectModule {
  constructor(context: BaseAudioContext, params: Params) {
    super(context, CHORUS_PROCESSOR, "Chorus", ["rate", "depth", "delay", "voices", "mix"], params);
  }
}

/** A very short swept delay fed back into itself: a comb of notches that sweeps. */
export class FlangerModule extends StereoEffectModule {
  constructor(context: BaseAudioContext, params: Params) {
    super(context, FLANGER_PROCESSOR, "Flanger", ["rate", "depth", "delay", "feedback", "mix"], params);
  }
}

/** Allpass stages swept by an LFO and mixed with the dry sound: notches that move. */
export class PhaserModule extends StereoEffectModule {
  constructor(context: BaseAudioContext, params: Params) {
    super(context, PHASER_PROCESSOR, "Phaser", ["rate", "depth", "frequency", "stages", "feedback", "mix"], params);
  }
}
