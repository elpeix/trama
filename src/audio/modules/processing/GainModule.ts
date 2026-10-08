import type { Params, ParamValue } from "../../../patch/types";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

export class GainModule implements AudioModule {
  private readonly gain: GainNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.gain = context.createGain();
    this.gain.gain.value = Number(params.gain);
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.gain : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.gain : undefined;
  }

  getAudioParam(port: string) {
    if (port === "gain") {
      return this.gain.gain;
    }
    return undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    if (name !== "gain") {
      unknownParameter("Gain", name);
    }
    glide(this.gain.gain, value, time);
  }

  dispose() {
    this.gain.disconnect();
  }
}
