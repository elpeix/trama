import type { Params, ParamValue } from "../../../patch/types";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

export class PanModule implements AudioModule {
  private readonly panner: StereoPannerNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.panner = context.createStereoPanner();
    this.panner.pan.value = Number(params.pan);
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.panner : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.panner : undefined;
  }

  getAudioParam(port: string) {
    return port === "pan" ? this.panner.pan : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    if (name !== "pan") {
      unknownParameter("Pan", name);
    }
    glide(this.panner.pan, value, time);
  }

  dispose() {
    this.panner.disconnect();
  }
}
