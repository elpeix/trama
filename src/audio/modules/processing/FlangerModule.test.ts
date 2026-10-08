import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { FlangerModule } from "./StereoEffectModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, number> = {}) =>
  new FlangerModule(context.asAudioContext(), { ...defaultParams("flanger"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("FlangerModule", () => {
  it("works on the audio thread, in stereo, a sound in mono reaching both sides", () => {
    const module = create();

    expect(worklet().name).toBe("flanger");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    expect(module.getAudioInput("audio")).toBe(worklet());
    expect(module.getAudioInput("nope")).toBeUndefined();
    expect(module.getAudioOutput("audio")).toBe(worklet());
    expect(module.getAudioOutput("nope")).toBeUndefined();
  });

  it("starts with its params", () => {
    create({ rate: 0.2, depth: 0.9, delay: 4, feedback: -0.6, mix: 0.7 });

    expect(param("rate").value).toBe(0.2);
    expect(param("depth").value).toBe(0.9);
    expect(param("delay").value).toBe(4);
    expect(param("feedback").value).toBe(-0.6);
    expect(param("mix").value).toBe(0.7);
  });

  it("sets its params at the time it is told", () => {
    const module = create();

    module.setParameter("rate", 0.2, 1);
    module.setParameter("depth", 0.9, 2);
    module.setParameter("delay", 4, 3);
    module.setParameter("feedback", -0.6, 4);
    module.setParameter("mix", 0.7, 5);

    expect(param("rate").events).toEqual([{ type: "setValue", value: 0.2, time: 1 }]);
    expect(param("depth").events).toEqual([{ type: "setValue", value: 0.9, time: 2 }]);
    expect(param("delay").events).toEqual([{ type: "setValue", value: 4, time: 3 }]);
    expect(param("feedback").events).toEqual([{ type: "setValue", value: -0.6, time: 4 }]);
    expect(param("mix").events).toEqual([{ type: "setValue", value: 0.7, time: 5 }]);
  });

  it("throws on an unknown parameter", () => {
    expect(() => create().setParameter("nope", 1, 0)).toThrow(/Flanger/);
  });

  it("disconnects and stops its processor on dispose", () => {
    const module = create();
    worklet().connect(context.destination);

    module.dispose();

    expect(worklet().outputs.size).toBe(0);
    expect(worklet().port.messages.at(-1)).toEqual({ type: "stop" });
  });
});
