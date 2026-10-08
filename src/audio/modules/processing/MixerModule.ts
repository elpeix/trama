import type { Params, ParamValue } from "../../../patch/types";
import { glide, unknownParameter, type AudioModule, type Channel } from "../AudioModule";
import { createStereoAnalyser, type StereoAnalyser } from "../stereoAnalyser";

const METER_FFT_SIZE = 2048;

interface Strip {
  level: GainNode;
  pan: StereoPannerNode;
  meter: GainNode;
  probe: StereoAnalyser;
  gate: GainNode;
  open: boolean;
  mute: boolean;
  solo: boolean;
}

/**
 * Sums the cables that reach it, each through a channel of its own: a level, a pan, a meter of each
 * side after them, and a gate that mute and solo close. While a channel is in solo, only the channels in solo sound;
 * a muted one never does. What it sends out is metered once something asks for it.
 */
export class MixerModule implements AudioModule {
  private readonly context: BaseAudioContext;
  private readonly master: GainNode;
  private readonly strips = new Map<string, Strip>();
  private analyser?: StereoAnalyser;

  constructor(context: BaseAudioContext, params: Params) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = Number(params.level);
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.master : undefined;
  }

  getAudioParam(port: string) {
    return port === "level" ? this.master.gain : undefined;
  }

  openInput(port: string, connectionId: string) {
    if (port !== "audio") {
      return undefined;
    }
    const level = this.context.createGain();
    const pan = this.context.createStereoPanner();
    const gate = this.context.createGain();
    const { input: meter, analyser: probe } = createStereoAnalyser(this.context, METER_FFT_SIZE);
    level.connect(pan);
    pan.connect(meter);
    pan.connect(gate);
    gate.connect(this.master);
    this.strips.set(connectionId, { level, pan, meter, probe, gate, open: true, mute: false, solo: false });
    this.updateGates(this.context.currentTime);
    return level;
  }

  closeInput(connectionId: string) {
    const strip = this.strips.get(connectionId);
    if (!strip) {
      return;
    }
    strip.level.disconnect();
    strip.pan.disconnect();
    strip.meter.disconnect();
    strip.gate.disconnect();
    this.strips.delete(connectionId);
    this.updateGates(this.context.currentTime);
  }

  setChannel(connectionId: string, { level, pan, mute, solo }: Channel, time: number) {
    const strip = this.strips.get(connectionId);
    if (!strip) {
      return;
    }
    glide(strip.level.gain, level, time);
    glide(strip.pan.pan, pan, time);
    strip.mute = mute;
    strip.solo = solo;
    this.updateGates(time);
  }

  getAnalyser() {
    if (!this.analyser) {
      const meter = createStereoAnalyser(this.context, METER_FFT_SIZE);
      this.master.connect(meter.input);
      this.analyser = meter.analyser;
    }
    return this.analyser;
  }

  getProbe(connectionId: string) {
    return this.strips.get(connectionId)?.probe;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    if (name !== "level") {
      unknownParameter("Mixer", name);
    }
    glide(this.master.gain, value, time);
  }

  dispose() {
    for (const id of [...this.strips.keys()]) {
      this.closeInput(id);
    }
    this.master.disconnect();
  }

  private updateGates(time: number) {
    const soloing = [...this.strips.values()].some((strip) => strip.solo);
    for (const strip of this.strips.values()) {
      const open = !strip.mute && (!soloing || strip.solo);
      if (strip.open !== open) {
        strip.open = open;
        glide(strip.gate.gain, open ? 1 : 0, time);
      }
    }
  }
}
