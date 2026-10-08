import type { Params, ParamValue } from "../../../patch/types";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

const decibelsToGain = (decibels: number) => 10 ** (decibels / 20);

/** Brings a sound down past a threshold, and raises it back by a makeup gain. */
export class CompressorModule implements AudioModule {
  private readonly compressor: DynamicsCompressorNode;
  private readonly makeup: GainNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.compressor = context.createDynamicsCompressor();
    this.makeup = context.createGain();

    this.compressor.threshold.value = Number(params.threshold);
    this.compressor.ratio.value = Number(params.ratio);
    this.compressor.knee.value = Number(params.knee);
    this.compressor.attack.value = Number(params.attack);
    this.compressor.release.value = Number(params.release);
    this.makeup.gain.value = decibelsToGain(Number(params.makeup));

    this.compressor.connect(this.makeup);
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.compressor : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.makeup : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "threshold":
      case "ratio":
      case "knee":
      case "attack":
      case "release":
        return glide(this.compressor[name], value, time);
      case "makeup":
        return glide(this.makeup.gain, decibelsToGain(Number(value)), time);
      default:
        unknownParameter("Compressor", name);
    }
  }

  dispose() {
    this.compressor.disconnect();
    this.makeup.disconnect();
  }
}
