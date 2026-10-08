import { HARMONIC_COUNT, harmonicTilt, isEvenHarmonic } from "../../../patch/harmonics";
import { MIDDLE_C_HZ } from "../../../patch/pitch";
import { parseCurve } from "../../../patch/sequence";
import type { Params, ParamValue } from "../../../patch/types";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

interface Harmonic {
  oscillator: OscillatorNode;
  /** Its level, tilted by the brightness. */
  tilt: GainNode;
  /** How much the modulation of the brightness moves the tilt. */
  brightnessScale?: GainNode;
  /** For an even harmonic, how much of it gets through. */
  parity?: GainNode;
}

/**
 * An additive oscillator: a sine for each of the first sixteen harmonics, each at the level drawn
 * for it. Two macros shape them while it plays, and both can be modulated: the brightness takes
 * the higher harmonics down, and the even param lets the even ones through or not. The params
 * set the gains directly; their modulation comes in through a source of its own that starts at 0
 * and adds to them, scaled for each harmonic, so what sounds is always the param plus the cable.
 */
export class HarmonicsModule implements AudioModule {
  private readonly harmonics: Harmonic[];
  private readonly detune: ConstantSourceNode;
  private readonly brightnessModulation: ConstantSourceNode;
  private readonly evenModulation: ConstantSourceNode;
  private readonly output: GainNode;
  private mode: string;
  private frequency: number;
  private levels: number[];
  private brightness: number;
  private even: number;

  constructor(context: BaseAudioContext, params: Params) {
    this.mode = String(params.mode);
    this.frequency = Number(params.frequency);
    this.levels = this.levelsOf(params.harmonics);
    this.brightness = Number(params.brightness);
    this.even = Number(params.even);

    this.output = context.createGain();
    this.detune = this.source(context, Number(params.detune));
    this.brightnessModulation = this.source(context, 0);
    this.evenModulation = this.source(context, 0);

    this.harmonics = Array.from({ length: HARMONIC_COUNT }, (_, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = this.baseFrequency() * (index + 1);
      this.detune.connect(oscillator.detune);
      const tilt = context.createGain();
      oscillator.connect(tilt);
      const harmonic: Harmonic = { oscillator, tilt };
      if (index > 0) {
        harmonic.brightnessScale = context.createGain();
        this.brightnessModulation.connect(harmonic.brightnessScale);
        harmonic.brightnessScale.connect(tilt.gain);
      }
      if (isEvenHarmonic(index)) {
        harmonic.parity = context.createGain();
        harmonic.parity.gain.value = this.even;
        this.evenModulation.connect(harmonic.parity.gain);
        tilt.connect(harmonic.parity);
        harmonic.parity.connect(this.output);
      } else {
        tilt.connect(this.output);
      }
      oscillator.start();
      return harmonic;
    });
    this.harmonics.forEach((harmonic, index) => {
      harmonic.tilt.gain.value = this.tiltedLevel(index);
      if (harmonic.brightnessScale) {
        harmonic.brightnessScale.gain.value = this.levels[index] * harmonicTilt(index);
      }
    });
    this.output.gain.value = this.normalization();
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.output : undefined;
  }

  getAudioParam(port: string) {
    switch (port) {
      case "frequency":
      case "detune":
        return this.detune.offset;
      case "brightness":
        return this.brightnessModulation.offset;
      case "even":
        return this.evenModulation.offset;
      default:
        return undefined;
    }
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "mode":
        this.mode = String(value);
        return this.retune(time);
      case "frequency":
        this.frequency = Number(value);
        return this.mode === "free" ? this.retune(time) : undefined;
      case "detune":
        return glide(this.detune.offset, value, time);
      case "harmonics":
        this.levels = this.levelsOf(value);
        this.harmonics.forEach(({ brightnessScale }, index) =>
          brightnessScale ? glide(brightnessScale.gain, this.levels[index] * harmonicTilt(index), time) : undefined,
        );
        glide(this.output.gain, this.normalization(), time);
        return this.retilt(time);
      case "brightness":
        this.brightness = Number(value);
        return this.retilt(time);
      case "even":
        this.even = Number(value);
        this.harmonics.forEach(({ parity }) => (parity ? glide(parity.gain, this.even, time) : undefined));
        return;
      default:
        unknownParameter("Harmonics", name);
    }
  }

  dispose() {
    this.harmonics.forEach(({ oscillator }) => oscillator.stop());
    [this.detune, this.brightnessModulation, this.evenModulation].forEach((source) => source.stop());
    this.output.disconnect();
  }

  private source(context: BaseAudioContext, value: number) {
    const source = context.createConstantSource();
    source.offset.value = value;
    source.start();
    return source;
  }

  private levelsOf(value: ParamValue) {
    const levels = parseCurve(String(value)) ?? [];
    return Array.from({ length: HARMONIC_COUNT }, (_, index) => levels[index] ?? 0);
  }

  private tiltedLevel(index: number) {
    return this.levels[index] * (1 - harmonicTilt(index) * (1 - this.brightness));
  }

  private normalization() {
    return 1 / Math.max(1, this.levels.reduce((sum, level) => sum + level, 0));
  }

  private retilt(time: number) {
    this.harmonics.forEach(({ tilt }, index) => glide(tilt.gain, this.tiltedLevel(index), time));
  }

  private retune(time: number) {
    this.harmonics.forEach(({ oscillator }, index) =>
      glide(oscillator.frequency, this.baseFrequency() * (index + 1), time),
    );
  }

  private baseFrequency() {
    return this.mode === "keyboard" ? MIDDLE_C_HZ : this.frequency;
  }
}
