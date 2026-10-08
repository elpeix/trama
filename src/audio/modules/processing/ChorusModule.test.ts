import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { ChorusModule } from "./StereoEffectModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, number> = {}) =>
  new ChorusModule(context.asAudioContext(), { ...defaultParams("chorus"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("ChorusModule", () => {
  it("works on the audio thread, in stereo, a sound in mono reaching both sides", () => {
    const module = create();

    expect(worklet().name).toBe("chorus");
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
    create({ rate: 2, depth: 0.3, delay: 25, voices: 3, mix: 0.4 });

    expect(param("rate").value).toBe(2);
    expect(param("depth").value).toBe(0.3);
    expect(param("delay").value).toBe(25);
    expect(param("voices").value).toBe(3);
    expect(param("mix").value).toBe(0.4);
  });

  it("sets its params at the time it is told", () => {
    const module = create();

    module.setParameter("rate", 2, 1);
    module.setParameter("depth", 0.3, 2);
    module.setParameter("delay", 25, 3);
    module.setParameter("voices", 3, 4);
    module.setParameter("mix", 0.4, 5);

    expect(param("rate").events).toEqual([{ type: "setValue", value: 2, time: 1 }]);
    expect(param("depth").events).toEqual([{ type: "setValue", value: 0.3, time: 2 }]);
    expect(param("delay").events).toEqual([{ type: "setValue", value: 25, time: 3 }]);
    expect(param("voices").events).toEqual([{ type: "setValue", value: 3, time: 4 }]);
    expect(param("mix").events).toEqual([{ type: "setValue", value: 0.4, time: 5 }]);
  });

  it("throws on an unknown parameter", () => {
    expect(() => create().setParameter("nope", 1, 0)).toThrow(/Chorus/);
  });

  it("disconnects and stops its processor on dispose", () => {
    const module = create();
    worklet().connect(context.destination);

    module.dispose();

    expect(worklet().outputs.size).toBe(0);
    expect(worklet().port.messages.at(-1)).toEqual({ type: "stop" });
  });
});
