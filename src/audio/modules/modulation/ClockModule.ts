import { CLOCK_OUTPUTS } from "../../../patch/registry";
import type { Params, ParamValue } from "../../../patch/types";
import type { Transport } from "../../Transport";
import { TriggerBus, unknownParameter, type AudioModule, type TriggerInput } from "../AudioModule";
import { StepClock } from "../StepClock";

/**
 * A gate for each division of the grid, open for the Gate of its step. While cables bring it gates,
 * it leaves the grid and divides them instead: each output lets through one of every so many,
 * from the first one, for as long as that gate stays open.
 */
export class ClockModule implements AudioModule {
  private readonly context: BaseAudioContext;
  private readonly buses = new Map(CLOCK_OUTPUTS.map(({ id }) => [id, new TriggerBus()]));
  private readonly clocks: StepClock[];
  private readonly starting: ReturnType<typeof setTimeout>;
  private readonly cables = new Set<string>();
  private readonly opened = new Set<TriggerBus>();
  private readonly input: TriggerInput = {
    gateOn: (time) => this.divideOn(time),
    gateOff: (time) => this.divideOff(time),
  };
  private gate: number;
  private count = 0;

  constructor(context: BaseAudioContext, params: Params, transport: Transport) {
    this.context = context;
    this.gate = Number(params.gate);
    this.clocks = CLOCK_OUTPUTS.map(({ id, beats }) => {
      const bus = this.buses.get(id)!;
      return new StepClock(
        context,
        transport,
        () => beats,
        (time, duration) => {
          if (this.cables.size === 0) {
            bus.gateOn(time);
            bus.gateOff(time + duration * this.gate);
          }
        },
      );
    });
    const created = context.currentTime;
    this.starting = setTimeout(() => this.clocks.forEach((clock) => clock.start(created)));
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput() {
    return undefined;
  }

  getTriggerOutput(port: string) {
    return this.buses.get(port);
  }

  openTrigger(port: string, connectionId: string): TriggerInput | undefined {
    if (port !== "gate") {
      return undefined;
    }
    if (this.cables.size === 0) {
      this.count = 0;
    }
    this.cables.add(connectionId);
    return this.input;
  }

  closeTrigger(connectionId: string) {
    this.cables.delete(connectionId);
    if (this.cables.size === 0) {
      this.divideOff(this.context.currentTime);
    }
  }

  setParameter(name: string, value: ParamValue) {
    if (name !== "gate") {
      unknownParameter("Clock", name);
    }
    this.gate = Number(value);
  }

  dispose() {
    clearTimeout(this.starting);
    this.clocks.forEach((clock) => clock.stop());
  }

  private divideOn(time: number) {
    for (const { id, divide } of CLOCK_OUTPUTS) {
      if (this.count % divide === 0) {
        const bus = this.buses.get(id)!;
        bus.gateOn(time);
        this.opened.add(bus);
      }
    }
    this.count++;
  }

  private divideOff(time: number) {
    this.opened.forEach((bus) => bus.gateOff(time));
    this.opened.clear();
  }
}
