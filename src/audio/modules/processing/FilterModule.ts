import type { Params, ParamValue } from "../../../patch/types";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

export class FilterModule implements AudioModule {
  private readonly filter: BiquadFilterNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.filter = context.createBiquadFilter();
    this.filter.type = params.type as BiquadFilterType;
    this.filter.frequency.value = Number(params.frequency);
    this.filter.Q.value = Number(params.Q);
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.filter : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.filter : undefined;
  }

  getAudioParam(port: string) {
    if (port === "frequency") {
      return this.filter.detune;
    }
    if (port === "Q") {
      return this.filter.Q;
    }
    return undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "type":
        this.filter.type = value as BiquadFilterType;
        return;
      case "frequency":
        return glide(this.filter.frequency, value, time);
      case "Q":
        return glide(this.filter.Q, value, time);
      default:
        unknownParameter("Filter", name);
    }
  }

  dispose() {
    this.filter.disconnect();
  }
}
