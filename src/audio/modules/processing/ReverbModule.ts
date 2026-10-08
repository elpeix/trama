import type { Params, ParamValue } from "../../../patch/types";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";
import { reverbImpulse } from "./reverbImpulse";

const MAX_PREDELAY_SECONDS = 0.25;

/** A room: the sound convolved with a tail of noise, after a pre-delay and through a tone filter. */
export class ReverbModule implements AudioModule {
  private readonly context: BaseAudioContext;
  private readonly input: GainNode;
  private readonly predelay: DelayNode;
  private readonly convolver: ConvolverNode;
  private readonly tone: BiquadFilterNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly output: GainNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.context = context;
    this.input = context.createGain();
    this.predelay = context.createDelay(MAX_PREDELAY_SECONDS);
    this.convolver = context.createConvolver();
    this.tone = context.createBiquadFilter();
    this.dry = context.createGain();
    this.wet = context.createGain();
    this.output = context.createGain();

    this.tone.type = "lowpass";
    this.convolver.buffer = this.room(Number(params.decay));
    this.predelay.delayTime.value = Number(params.predelay);
    this.tone.frequency.value = Number(params.tone);
    this.dry.gain.value = 1 - Number(params.mix);
    this.wet.gain.value = Number(params.mix);

    this.input.connect(this.dry);
    this.input.connect(this.predelay);
    this.predelay.connect(this.convolver);
    this.convolver.connect(this.tone);
    this.tone.connect(this.wet);
    this.dry.connect(this.output);
    this.wet.connect(this.output);
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.input : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.output : undefined;
  }

  getAudioParam(port: string) {
    return port === "tone" ? this.tone.detune : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "decay":
        this.convolver.buffer = this.room(Number(value));
        return;
      case "predelay":
        return glide(this.predelay.delayTime, value, time);
      case "tone":
        return glide(this.tone.frequency, value, time);
      case "mix":
        glide(this.dry.gain, 1 - Number(value), time);
        return glide(this.wet.gain, value, time);
      default:
        unknownParameter("Reverb", name);
    }
  }

  dispose() {
    for (const node of [this.input, this.predelay, this.convolver, this.tone, this.dry, this.wet, this.output]) {
      node.disconnect();
    }
  }

  private room(decay: number) {
    const channels = reverbImpulse(decay, this.context.sampleRate);
    const buffer = this.context.createBuffer(channels.length, channels[0].length, this.context.sampleRate);
    channels.forEach((samples, channel) => buffer.getChannelData(channel).set(samples));
    return buffer;
  }
}
