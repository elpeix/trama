import { MIDDLE_C_HZ } from "../../../patch/pitch";
import type { Params, ParamValue } from "../../../patch/types";
import { VCO_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

/**
 * An oscillator in the manner of the analog ones, worked out on the audio thread: waves without
 * aliasing, a square whose width the cables move, detuned voices spread across the stereo field,
 * hard sync from the sound into its sync input, and a little drift.
 */
export class VcoModule implements AudioModule {
  private readonly node: AudioWorkletNode;
  private mode: string;
  private frequency: number;

  constructor(context: BaseAudioContext, params: Params) {
    this.mode = String(params.mode);
    this.frequency = Number(params.frequency);
    this.node = new AudioWorkletNode(context, VCO_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 1,
      channelCountMode: "explicit",
      parameterData: {
        frequency: this.baseFrequency(),
        detune: Number(params.detune),
        width: Number(params.width),
        voices: Number(params.voices),
        spread: Number(params.spread),
        drift: Number(params.drift),
      },
      processorOptions: { wave: String(params.waveform) },
    });
  }

  getAudioInput(port: string) {
    return port === "sync" ? this.node : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioParam(port: string) {
    if (port === "frequency" || port === "detune") {
      return this.param("detune");
    }
    return port === "width" ? this.param("width") : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "waveform":
        return this.post({ type: "wave", wave: String(value) });
      case "mode":
        this.mode = String(value);
        return glide(this.param("frequency"), this.baseFrequency(), time);
      case "frequency":
        this.frequency = Number(value);
        if (this.mode === "free") {
          glide(this.param("frequency"), value, time);
        }
        return;
      case "voices":
        this.param("voices").setValueAtTime(Number(value), time);
        return;
      case "detune":
      case "width":
      case "spread":
      case "drift":
        return glide(this.param(name), value, time);
      default:
        unknownParameter("VCO", name);
    }
  }

  dispose() {
    this.node.disconnect();
    this.post({ type: "stop" });
  }

  private param(name: string) {
    return this.node.parameters.get(name)!;
  }

  private post(message: ProcessorMessage) {
    this.node.port.postMessage(message);
  }

  private baseFrequency() {
    return this.mode === "keyboard" ? MIDDLE_C_HZ : this.frequency;
  }
}
