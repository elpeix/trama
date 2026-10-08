import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { SlewModule } from "./SlewModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, number> = {}) =>
  new SlewModule(context.asAudioContext(), { ...defaultParams("slew"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("SlewModule", () => {
  it("slides on the audio thread a single control signal, the sum of its cables", () => {
    const slew = create();

    expect(worklet().name).toBe("slew");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
    });
    expect(slew.openInput("in")).toBe(worklet());
    expect(slew.openInput("nope")).toBeUndefined();
    expect(slew.getAudioInput()).toBeUndefined();
    expect(slew.getAudioOutput("out")).toBe(worklet());
    expect(slew.getAudioOutput("nope")).toBeUndefined();
  });

  it("starts with its rise and its fall", () => {
    create({ rise: 0.2, fall: 1.5 });

    expect(param("rise").value).toBe(0.2);
    expect(param("fall").value).toBe(1.5);
  });

  it("sets its rise and its fall at the time it is told", () => {
    const slew = create();

    slew.setParameter("rise", 0.4, 2);
    slew.setParameter("fall", 3, 2.5);

    expect(param("rise").events).toEqual([{ type: "setValue", value: 0.4, time: 2 }]);
    expect(param("fall").events).toEqual([{ type: "setValue", value: 3, time: 2.5 }]);
  });

  it("throws on an unknown parameter", () => {
    expect(() => create().setParameter("nope", 1, 0)).toThrow(/Slew/);
  });

  it("disconnects and stops its processor on dispose", () => {
    const slew = create();
    worklet().connect(context.destination);

    slew.dispose();

    expect(worklet().outputs.size).toBe(0);
    expect(worklet().port.messages.at(-1)).toEqual({ type: "stop" });
  });
});
