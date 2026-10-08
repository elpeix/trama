import { syncBeats, syncedRate } from "../../../patch/tempo";
import type { Params, ParamValue } from "../../../patch/types";
import type { Transport } from "../../Transport";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

/**
 * A low-frequency oscillator. Free, it runs at its Rate. Synced, it does one cycle per division of
 * the tempo, and each cycle starts on the grid of the transport: a synced wobble lands on the beat.
 *
 * An OscillatorNode cannot jump to a phase, so to line up with the grid a new one starts on the next
 * cycle boundary and the old one stops there. They all feed one output, so connections stay put.
 */
export class LfoModule implements AudioModule {
  private readonly context: BaseAudioContext;
  private readonly transport: Transport;
  private readonly output: GainNode;
  private readonly unsubscribe: () => void;
  private oscillators: OscillatorNode[] = [];
  private params: Params;

  constructor(context: BaseAudioContext, params: Params, transport: Transport) {
    this.context = context;
    this.transport = transport;
    this.params = { ...params };
    this.output = context.createGain();
    this.startOscillator(context.currentTime);
    if (this.synced) {
      this.align();
    }
    this.unsubscribe = transport.subscribe(() => {
      if (this.synced) {
        this.align();
      }
    });
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "out" ? this.output : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    if (!(name in this.params)) {
      unknownParameter("LFO", name);
    }
    this.params = { ...this.params, [name]: value };
    switch (name) {
      case "waveform":
        this.oscillators.forEach((oscillator) => (oscillator.type = value as OscillatorType));
        return;
      case "sync":
        if (this.synced) {
          this.align();
        } else {
          this.oscillators.forEach((oscillator) => glide(oscillator.frequency, this.rate, time));
        }
        return;
      case "rate":
        if (!this.synced) {
          this.oscillators.forEach((oscillator) => glide(oscillator.frequency, value, time));
        }
        return;
    }
  }

  dispose() {
    this.unsubscribe();
    this.oscillators.forEach((oscillator) => {
      oscillator.stop();
      oscillator.disconnect();
    });
    this.output.disconnect();
  }

  private get synced() {
    return this.cycle !== undefined;
  }

  private get rate() {
    return syncedRate(String(this.params.sync), this.transport.tempo, this.transport.beatsPerBar) ?? Number(this.params.rate);
  }

  private get cycle() {
    return syncBeats(String(this.params.sync), this.transport.beatsPerBar);
  }

  /** Runs at the synced rate from now, and starts a fresh cycle on the next boundary of the grid. */
  private align() {
    const now = this.context.currentTime;
    const cycle = this.cycle!;
    const boundary = this.transport.timeAt(Math.ceil(this.transport.beatAt(now) / cycle - 1e-6) * cycle);
    this.oscillators.forEach((oscillator) => {
      oscillator.frequency.setValueAtTime(this.rate, now);
      oscillator.stop(boundary);
    });
    this.startOscillator(boundary);
  }

  private startOscillator(time: number) {
    const oscillator = this.context.createOscillator();
    oscillator.type = this.params.waveform as OscillatorType;
    oscillator.frequency.value = this.rate;
    oscillator.connect(this.output);
    oscillator.start(time);
    oscillator.onended = () => {
      oscillator.disconnect();
      this.oscillators = this.oscillators.filter((other) => other !== oscillator);
    };
    this.oscillators = [...this.oscillators, oscillator];
  }
}
