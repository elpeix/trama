import type { Params, ParamValue } from "../../../patch/types";
import type { Transport } from "../../Transport";
import { SAMPLE_HOLD_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { unknownParameter, type AudioModule, type TriggerInput } from "../AudioModule";
import { beatsPerStep, StepClock } from "../StepClock";

const GATE = "gate";

/**
 * Holds the value of the control signal it gets, or a random one without it, on each gate or on
 * each step of the grid. The sampling runs on the audio thread, on the exact frame of the step.
 */
export class SampleHoldModule implements AudioModule, TriggerInput {
  private readonly node: AudioWorkletNode;
  private readonly clock: StepClock;
  private readonly starting: ReturnType<typeof setTimeout>;
  private mode: string;

  constructor(context: BaseAudioContext, params: Params, transport: Transport) {
    this.mode = String(params.clock);
    this.node = new AudioWorkletNode(context, SAMPLE_HOLD_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
    });
    this.clock = new StepClock(
      context,
      transport,
      () => beatsPerStep(this.mode),
      (time) => {
        if (this.mode !== GATE) {
          this.post({ type: "sample", time });
        }
      },
    );
    const created = context.currentTime;
    this.starting = setTimeout(() => this.clock.start(created));
  }

  getAudioInput() {
    return undefined;
  }

  openInput(port: string) {
    return port === "in" ? this.node : undefined;
  }

  closeInput() {}

  getAudioOutput(port: string) {
    return port === "out" ? this.node : undefined;
  }

  getTriggerInput(port: string): TriggerInput | undefined {
    return port === "gate" ? this : undefined;
  }

  gateOn(time: number) {
    if (this.mode === GATE) {
      this.post({ type: "sample", time });
    }
  }

  gateOff() {}

  setParameter(name: string, value: ParamValue) {
    if (name !== "clock") {
      unknownParameter("Sample & Hold", name);
    }
    this.mode = String(value);
  }

  dispose() {
    clearTimeout(this.starting);
    this.clock.stop();
    this.node.disconnect();
    this.post({ type: "stop" });
  }

  private post(message: ProcessorMessage) {
    this.node.port.postMessage(message);
  }
}
