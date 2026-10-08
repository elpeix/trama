import type { Params, ParamValue } from "../../../patch/types";
import { ENVELOPE_FOLLOWER_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { unknownParameter, type AudioModule } from "../AudioModule";

const PARAMS = ["attack", "release", "gain"];

/** Gives the level of the sound it gets as a control signal, followed on the audio thread. */
export class EnvelopeFollowerModule implements AudioModule {
  private readonly node: AudioWorkletNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.node = new AudioWorkletNode(context, ENVELOPE_FOLLOWER_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: "explicit",
      parameterData: Object.fromEntries(PARAMS.map((name) => [name, Number(params[name])])),
    });
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioOutput(port: string) {
    return port === "out" ? this.node : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    if (!PARAMS.includes(name)) {
      unknownParameter("Envelope Follower", name);
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
