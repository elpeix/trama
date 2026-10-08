import { parseCurve } from "../../../patch/sequence";
import type { Params, ParamValue } from "../../../patch/types";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";
import { DRIVE_RANGE, distortionCurve, type DistortionMode } from "./distortionCurve";

/**
 * Bends the sound through a curve, after a drive that pushes it into it, and through a tone
 * filter. The curve spans all the drive can reach, so the drive is a gain that can be modulated.
 */
export class DistortionModule implements AudioModule {
  private readonly input: GainNode;
  private readonly drive: GainNode;
  private readonly scale: GainNode;
  private readonly shaper: WaveShaperNode;
  private readonly tone: BiquadFilterNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly output: GainNode;
  private mode: DistortionMode;
  private shape: number[];

  constructor(context: BaseAudioContext, params: Params) {
    this.input = context.createGain();
    this.drive = context.createGain();
    this.scale = context.createGain();
    this.shaper = context.createWaveShaper();
    this.tone = context.createBiquadFilter();
    this.dry = context.createGain();
    this.wet = context.createGain();
    this.output = context.createGain();
    this.mode = String(params.mode) as DistortionMode;
    this.shape = parseCurve(String(params.shape)) ?? [];

    this.drive.gain.value = Number(params.drive);
    this.scale.gain.value = 1 / DRIVE_RANGE;
    this.shaper.oversample = "4x";
    this.shaper.curve = distortionCurve(this.mode, this.shape);
    this.tone.type = "lowpass";
    this.tone.frequency.value = Number(params.tone);
    this.dry.gain.value = 1 - Number(params.mix);
    this.wet.gain.value = Number(params.mix);

    this.input.connect(this.dry);
    this.input.connect(this.drive);
    this.drive.connect(this.scale);
    this.scale.connect(this.shaper);
    this.shaper.connect(this.tone);
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
    if (port === "drive") {
      return this.drive.gain;
    }
    return port === "tone" ? this.tone.detune : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "mode":
        this.mode = String(value) as DistortionMode;
        this.shaper.curve = distortionCurve(this.mode, this.shape);
        return;
      case "shape":
        this.shape = parseCurve(String(value)) ?? this.shape;
        this.shaper.curve = distortionCurve(this.mode, this.shape);
        return;
      case "drive":
        return glide(this.drive.gain, value, time);
      case "tone":
        return glide(this.tone.frequency, value, time);
      case "mix":
        glide(this.dry.gain, 1 - Number(value), time);
        return glide(this.wet.gain, value, time);
      default:
        unknownParameter("Distortion", name);
    }
  }

  dispose() {
    for (const node of [this.input, this.drive, this.scale, this.shaper, this.tone, this.dry, this.wet, this.output]) {
      node.disconnect();
    }
  }
}
