import { syncedSeconds } from "../../../patch/tempo";
import type { Params, ParamValue } from "../../../patch/types";
import type { Transport } from "../../Transport";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

/** Long enough for a synced half note at the slowest tempo: 2 beats at 30 BPM. */
const MAX_DELAY_SECONDS = 4;

/** An echo with feedback. Synced, it repeats after a division of the tempo and follows its changes. */
export class DelayModule implements AudioModule {
  private readonly transport: Transport;
  private readonly unsubscribe: () => void;
  private params: Params;
  private readonly input: GainNode;
  private readonly line: DelayNode;
  private readonly feedback: GainNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly output: GainNode;

  constructor(context: BaseAudioContext, params: Params, transport: Transport) {
    this.transport = transport;
    this.params = { ...params };
    this.input = context.createGain();
    this.line = context.createDelay(MAX_DELAY_SECONDS);
    this.feedback = context.createGain();
    this.dry = context.createGain();
    this.wet = context.createGain();
    this.output = context.createGain();

    this.line.delayTime.value = this.delayTime;
    this.feedback.gain.value = Number(params.feedback);
    this.dry.gain.value = 1 - Number(params.mix);
    this.wet.gain.value = Number(params.mix);

    this.input.connect(this.dry);
    this.input.connect(this.line);
    this.line.connect(this.feedback);
    this.feedback.connect(this.line);
    this.line.connect(this.wet);
    this.dry.connect(this.output);
    this.wet.connect(this.output);

    this.unsubscribe = transport.subscribe(() => {
      if (this.synced) {
        glide(this.line.delayTime, this.delayTime, context.currentTime);
      }
    });
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.input : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.output : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    if (name in this.params) {
      this.params = { ...this.params, [name]: value };
    }
    switch (name) {
      case "sync":
        return glide(this.line.delayTime, this.delayTime, time);
      case "time":
        if (!this.synced) {
          glide(this.line.delayTime, value, time);
        }
        return;
      case "feedback":
        return glide(this.feedback.gain, value, time);
      case "mix":
        glide(this.dry.gain, 1 - Number(value), time);
        return glide(this.wet.gain, value, time);
      default:
        unknownParameter("Delay", name);
    }
  }

  dispose() {
    this.unsubscribe();
    for (const node of [this.input, this.line, this.feedback, this.dry, this.wet, this.output]) {
      node.disconnect();
    }
  }

  private get synced() {
    return syncedSeconds(String(this.params.sync), this.transport.tempo, this.transport.beatsPerBar) !== undefined;
  }

  private get delayTime() {
    const seconds = syncedSeconds(String(this.params.sync), this.transport.tempo, this.transport.beatsPerBar) ?? Number(this.params.time);
    return Math.min(MAX_DELAY_SECONDS, seconds);
  }
}
