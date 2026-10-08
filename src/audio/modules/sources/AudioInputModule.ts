import type { Params, ParamValue } from "../../../patch/types";
import { glide, unknownParameter, type AudioModule, type InputStatus } from "../AudioModule";
import { createStereoAnalyser, type StereoAnalyser } from "../stereoAnalyser";

const METER_FFT_SIZE = 2048;

const BLOCKED = ["NotAllowedError", "SecurityError"];

/**
 * The microphone or the sound card, through a gain. It asks for it as soon as it is added, as it
 * is, without the echo cancelling, noise suppression and level control meant for calls.
 */
export class AudioInputModule implements AudioModule {
  private readonly context: BaseAudioContext;
  private readonly output: GainNode;
  private readonly analyser: StereoAnalyser;
  private source: MediaStreamAudioSourceNode | undefined;
  private stream: MediaStream | undefined;
  private status: InputStatus;
  private disposed = false;

  constructor(context: BaseAudioContext, params: Params, media: MediaDevices | undefined = globalThis.navigator?.mediaDevices) {
    this.context = context;
    this.output = context.createGain();
    this.output.gain.value = Number(params.gain);
    const meter = createStereoAnalyser(context, METER_FFT_SIZE);
    this.analyser = meter.analyser;
    this.output.connect(meter.input);

    if (!media?.getUserMedia) {
      this.status = "unavailable";
      return;
    }
    this.status = "asking";
    media
      .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(
        (stream) => this.listen(stream),
        (error: unknown) => {
          this.status = error instanceof DOMException && BLOCKED.includes(error.name) ? "denied" : "unavailable";
        },
      );
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.output : undefined;
  }

  getAnalyser() {
    return this.analyser;
  }

  getInputStatus() {
    return this.status;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    if (name !== "gain") {
      unknownParameter("Audio Input", name);
    }
    glide(this.output.gain, value, time);
  }

  dispose() {
    this.disposed = true;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source?.disconnect();
    this.output.disconnect();
  }

  private listen(stream: MediaStream) {
    if (this.disposed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    this.source = (this.context as AudioContext).createMediaStreamSource(stream);
    this.source.connect(this.output);
    this.status = "on";
  }
}
