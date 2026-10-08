import type { Params, ParamValue } from "../../../patch/types";
import { OUTPUT_LIMITER_PROCESSOR, type LimiterMessage, type ProcessorMessage } from "../../worklets/names";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";
import { createStereoAnalyser, type StereoAnalyser } from "../stereoAnalyser";

const METER_FFT_SIZE = 2048;

export class OutputModule implements AudioModule {
  private readonly input: GainNode;
  /** Keeps the sound under 0 dBFS, and goes quiet when it runs away, unless its param turns it off. */
  private readonly limiter: AudioWorkletNode;
  /** After the volume: what the end of a song fades out, for the speakers, the recording and the meter alike. */
  private readonly fader: GainNode;
  private readonly analyser: StereoAnalyser;
  private muted = false;

  constructor(context: BaseAudioContext, params: Params, recording: AudioNode) {
    this.input = context.createGain();
    this.input.gain.value = Number(params.volume);
    this.limiter = new AudioWorkletNode(context, OUTPUT_LIMITER_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
      processorOptions: { enabled: params.limiter !== "off" },
    });
    this.limiter.port.onmessage = ({ data }: MessageEvent<LimiterMessage>) => {
      if (data.type === "muted") {
        this.muted = true;
      }
    };
    this.fader = context.createGain();
    const meter = createStereoAnalyser(context, METER_FFT_SIZE);
    this.analyser = meter.analyser;
    this.input.connect(this.limiter);
    this.limiter.connect(this.fader);
    this.fader.connect(context.destination);
    this.fader.connect(recording);
    this.fader.connect(meter.input);
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.input : undefined;
  }

  getAudioOutput() {
    return undefined;
  }

  fade(gain: number, time: number, ramp: boolean) {
    if (ramp) {
      this.fader.gain.linearRampToValueAtTime(gain, time);
      return;
    }
    this.fader.gain.cancelScheduledValues(time);
    this.fader.gain.setValueAtTime(gain, time);
  }

  getAnalyser() {
    return this.analyser;
  }

  isMuted() {
    return this.muted;
  }

  unmute() {
    this.muted = false;
    this.post({ type: "unmute" });
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "volume":
        return glide(this.input.gain, value, time);
      case "limiter": {
        const enabled = value !== "off";
        this.muted &&= enabled;
        return this.post({ type: "limiter", enabled });
      }
      default:
        unknownParameter("Output", name);
    }
  }

  dispose() {
    this.input.disconnect();
    this.limiter.disconnect();
    this.fader.disconnect();
    this.post({ type: "stop" });
  }

  private post(message: ProcessorMessage) {
    this.limiter.port.postMessage(message);
  }
}
