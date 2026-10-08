import type { Params, ParamValue } from "../../../patch/types";
import { unknownParameter, type AudioModule } from "../AudioModule";
import { QUANTIZER_RANGE, quantizerCurve } from "./quantizerCurve";

/** Rounds the pitch it gets to the nearest note of a scale, through a wave shaper shaped as a staircase. */
export class QuantizerModule implements AudioModule {
  private readonly input: GainNode;
  private readonly scale: GainNode;
  private readonly shaper: WaveShaperNode;
  private params: Params;

  constructor(context: BaseAudioContext, params: Params) {
    this.params = { ...params };
    this.input = context.createGain();
    this.scale = context.createGain();
    this.shaper = context.createWaveShaper();

    this.scale.gain.value = 1 / QUANTIZER_RANGE;
    this.shaper.curve = this.curve();

    this.input.connect(this.scale);
    this.scale.connect(this.shaper);
  }

  getAudioInput() {
    return undefined;
  }

  openInput(port: string) {
    return port === "in" ? this.input : undefined;
  }

  closeInput() {}

  getAudioOutput(port: string) {
    return port === "out" ? this.shaper : undefined;
  }

  setParameter(name: string, value: ParamValue) {
    if (name !== "root" && name !== "scale") {
      unknownParameter("Quantizer", name);
    }
    this.params = { ...this.params, [name]: value };
    this.shaper.curve = this.curve();
  }

  dispose() {
    for (const node of [this.input, this.scale, this.shaper]) {
      node.disconnect();
    }
  }

  private curve() {
    return quantizerCurve(String(this.params.root), String(this.params.scale));
  }
}
