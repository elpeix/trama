import { filterBandFrequencies } from "../../../patch/filterBands";
import { parseCurve } from "../../../patch/sequence";
import type { Params, ParamValue } from "../../../patch/types";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

export class CustomFilterModule implements AudioModule {
  private readonly bands: BiquadFilterNode[];

  constructor(context: BaseAudioContext, params: Params) {
    const gains = parseCurve(String(params.response)) ?? [];
    const frequencies = filterBandFrequencies(gains.length);
    const ratio = frequencies[1] / frequencies[0];
    const q = Math.sqrt(ratio) / (ratio - 1);
    this.bands = gains.map((gain, index) => {
      const band = context.createBiquadFilter();
      band.type = "peaking";
      band.frequency.value = frequencies[index];
      band.Q.value = q;
      band.gain.value = gain;
      return band;
    });
    this.bands.slice(1).forEach((band, index) => this.bands[index].connect(band));
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.bands[0] : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.bands.at(-1) : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    if (name !== "response") {
      return unknownParameter("Custom Filter", name);
    }
    parseCurve(String(value))?.forEach((gain, index) => {
      const band = this.bands[index];
      if (band) {
        glide(band.gain, gain, time);
      }
    });
  }

  dispose() {
    this.bands.forEach((band) => band.disconnect());
  }
}
