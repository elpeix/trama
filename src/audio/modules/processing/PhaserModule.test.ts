import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { PhaserModule } from "./StereoEffectModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, number> = {}) =>
  new PhaserModule(context.asAudioContext(), { ...defaultParams("phaser"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("PhaserModule", () => {
  it("works on the audio thread, in stereo, a sound in mono reaching both sides", () => {
    const module = create();

    expect(worklet().name).toBe("phaser");
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
    create({ rate: 1.5, depth: 0.6, frequency: 1200, stages: 8, feedback: 0.4, mix: 0.6 });

    expect(param("rate").value).toBe(1.5);
    expect(param("depth").value).toBe(0.6);
    expect(param("frequency").value).toBe(1200);
    expect(param("stages").value).toBe(8);
    expect(param("feedback").value).toBe(0.4);
    expect(param("mix").value).toBe(0.6);
  });

  it("sets its params at the time it is told", () => {
    const module = create();

    module.setParameter("rate", 1.5, 1);
    module.setParameter("depth", 0.6, 2);
    module.setParameter("frequency", 1200, 3);
    module.setParameter("stages", 8, 4);
    module.setParameter("feedback", 0.4, 5);
    module.setParameter("mix", 0.6, 6);

    expect(param("rate").events).toEqual([{ type: "setValue", value: 1.5, time: 1 }]);
    expect(param("depth").events).toEqual([{ type: "setValue", value: 0.6, time: 2 }]);
    expect(param("frequency").events).toEqual([{ type: "setValue", value: 1200, time: 3 }]);
    expect(param("stages").events).toEqual([{ type: "setValue", value: 8, time: 4 }]);
    expect(param("feedback").events).toEqual([{ type: "setValue", value: 0.4, time: 5 }]);
    expect(param("mix").events).toEqual([{ type: "setValue", value: 0.6, time: 6 }]);
  });

  it("throws on an unknown parameter", () => {
    expect(() => create().setParameter("nope", 1, 0)).toThrow(/Phaser/);
  });

  it("disconnects and stops its processor on dispose", () => {
    const module = create();
    worklet().connect(context.destination);

    module.dispose();

    expect(worklet().outputs.size).toBe(0);
    expect(worklet().port.messages.at(-1)).toEqual({ type: "stop" });
  });
});
