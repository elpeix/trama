import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { Transport } from "../../Transport";
import { SampleHoldModule } from "./SampleHoldModule";

let context: FakeAudioContext;
let transport: Transport;
let modules: SampleHoldModule[];

const create = (clock: string) => {
  const module = new SampleHoldModule(context.asAudioContext(), { ...defaultParams("sampleHold"), clock }, transport);
  modules.push(module);
  return module;
};

const worklet = () => context.workletNodes[0];
const samples = () => worklet().port.messages.filter((message) => (message as { type: string }).type === "sample");

const advance = (seconds: number) => {
  const end = Math.round((context.currentTime + seconds) * 1000);
  for (let ms = Math.round(context.currentTime * 1000) + 5; ms <= end; ms += 5) {
    context.currentTime = ms / 1000;
    vi.advanceTimersByTime(5);
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
  context = new FakeAudioContext();
  transport = new Transport(context.asAudioContext());
  modules = [];
});

afterEach(() => {
  modules.forEach((module) => module.dispose());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SampleHoldModule", () => {
  it("holds on the audio thread a single control signal, the sum of its cables", () => {
    const hold = create("gate");

    expect(worklet().name).toBe("sample-hold");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
    });
    expect(hold.openInput("in")).toBe(worklet());
    expect(hold.openInput("nope")).toBeUndefined();
    expect(hold.getAudioOutput("out")).toBe(worklet());
  });

  it("samples when its gate opens, with the clock on gate", () => {
    const hold = create("gate");

    hold.getTriggerInput("gate")!.gateOn(1.5);
    hold.getTriggerInput("gate")!.gateOff(2);
    advance(0.6);

    expect(samples()).toEqual([{ type: "sample", time: 1.5 }]);
  });

  it("samples on each step of the grid, and ignores its gate, with a division", () => {
    const hold = create("1/8");

    hold.getTriggerInput("gate")!.gateOn(0.1);
    advance(0.6);

    expect(samples()).toEqual([
      { type: "sample", time: 0 },
      { type: "sample", time: 0.25 },
      { type: "sample", time: 0.5 },
    ]);
  });

  it("switches between its gate and the grid", () => {
    const hold = create("gate");
    advance(0.3);

    hold.setParameter("clock", "1/4");
    advance(0.5);
    hold.setParameter("clock", "gate");
    advance(1);

    expect(samples()).toEqual([{ type: "sample", time: 0.5 }]);
  });

  it("throws on an unknown parameter", () => {
    expect(() => create("gate").setParameter("nope", 1)).toThrow();
  });

  it("stops its clock and its processor on dispose", () => {
    const hold = create("1/8");
    advance(0.3);
    const taken = samples().length;

    hold.dispose();
    advance(1);

    expect(samples()).toHaveLength(taken);
    expect(worklet().port.messages.at(-1)).toEqual({ type: "stop" });
  });
});
