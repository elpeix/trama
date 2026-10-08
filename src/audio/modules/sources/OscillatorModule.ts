import { MIDDLE_C_HZ } from "../../../patch/pitch";
import { parseCurve } from "../../../patch/sequence";
import type { Params, ParamValue } from "../../../patch/types";
import { harmonicsWave, shapeWave } from "./periodicWave";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

export class OscillatorModule implements AudioModule {
  private readonly context: BaseAudioContext;
  private readonly oscillator: OscillatorNode;
  private mode: string;
  private frequency: number;
  private waveform: string;
  private shape: string;
  private harmonics: string;

  constructor(context: BaseAudioContext, params: Params) {
    this.context = context;
    this.mode = String(params.mode);
    this.frequency = Number(params.frequency);
    this.waveform = String(params.waveform);
    this.shape = String(params.shape);
    this.harmonics = String(params.harmonics);
    this.oscillator = context.createOscillator();
    this.applyWaveform();
    this.oscillator.frequency.value = this.baseFrequency();
    this.oscillator.detune.value = Number(params.detune);
    this.oscillator.start();
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.oscillator : undefined;
  }

  getAudioParam(port: string) {
    return port === "frequency" || port === "detune" ? this.oscillator.detune : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "waveform":
        this.waveform = String(value);
        return this.applyWaveform();
      case "shape":
        this.shape = String(value);
        return this.waveform === "drawn" ? this.applyWaveform() : undefined;
      case "harmonics":
        this.harmonics = String(value);
        return this.waveform === "harmonics" ? this.applyWaveform() : undefined;
      case "mode":
        this.mode = String(value);
        return glide(this.oscillator.frequency, this.baseFrequency(), time);
      case "frequency":
        this.frequency = Number(value);
        if (this.mode === "free") {
          glide(this.oscillator.frequency, value, time);
        }
        return;
      case "detune":
        return glide(this.oscillator.detune, value, time);
      default:
        unknownParameter("Oscillator", name);
    }
  }

  dispose() {
    this.oscillator.stop();
    this.oscillator.disconnect();
  }

  private applyWaveform() {
    const coefficients =
      this.waveform === "drawn"
        ? shapeWave(parseCurve(this.shape) ?? [])
        : this.waveform === "harmonics"
          ? harmonicsWave(parseCurve(this.harmonics) ?? [])
          : undefined;
    if (!coefficients) {
      this.oscillator.type = this.waveform as OscillatorType;
      return;
    }
    const { real, imag } = coefficients;
    this.oscillator.setPeriodicWave(this.context.createPeriodicWave(real, imag));
  }

  private baseFrequency() {
    return this.mode === "keyboard" ? MIDDLE_C_HZ : this.frequency;
  }
}
