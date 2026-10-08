import type { Params, ParamValue } from "../../../patch/types";
import { LADDER_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

/** The low-pass of a Moog, worked out on the audio thread in stereo: 24 dB an octave, saturating, and singing at full resonance. */
export class LadderModule implements AudioModule {
  private readonly node: AudioWorkletNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.node = new AudioWorkletNode(context, LADDER_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
      parameterData: {
        frequency: Number(params.frequency),
        detune: 0,
        resonance: Number(params.resonance),
        drive: Number(params.drive),
      },
    });
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioParam(port: string) {
    if (port === "frequency") {
      return this.param("detune");
    }
    return port === "resonance" ? this.param("resonance") : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "frequency":
      case "resonance":
      case "drive":
        return glide(this.param(name), value, time);
      default:
        unknownParameter("Ladder", name);
    }
  }

  dispose() {
    this.node.disconnect();
    this.post({ type: "stop" });
  }

  private param(name: string) {
    return this.node.parameters.get(name)!;
  }

  private post(message: ProcessorMessage) {
    this.node.port.postMessage(message);
  }
}
