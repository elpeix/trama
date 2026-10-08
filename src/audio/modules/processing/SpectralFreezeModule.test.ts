import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { SpectralFreezeModule } from "./SpectralFreezeModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, number> = {}) =>
  new SpectralFreezeModule(context.asAudioContext(), { ...defaultParams("spectralFreeze"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("SpectralFreezeModule", () => {
  it("freezes on the audio thread, in stereo, a sound in mono reaching both sides", () => {
    const freeze = create({ mix: 0.7, release: 2 });

    expect(worklet().name).toBe("spectral-freeze");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    expect(param("mix").value).toBe(0.7);
    expect(param("release").value).toBe(2);
    expect(freeze.getAudioInput("audio")).toBe(worklet());
    expect(freeze.getAudioOutput("audio")).toBe(worklet());
  });

  it("freezes when its gate opens and lets go when it closes", () => {
    const freeze = create();

    freeze.getTriggerInput("gate")!.gateOn(1);
    freeze.getTriggerInput("gate")!.gateOff(2.5);

    expect(worklet().port.messages).toEqual([
      { type: "freeze", time: 1 },
      { type: "release", time: 2.5 },
    ]);
  });

  it("glides its params to new values", () => {
    const freeze = create();

    freeze.setParameter("mix", 1, 1);
    freeze.setParameter("release", 3, 1);

    expect(param("mix").events).toEqual([{ type: "setTarget", value: 1, time: 1 }]);
    expect(param("release").events).toEqual([{ type: "setTarget", value: 3, time: 1 }]);
  });

  it("rejects a param it does not have", () => {
    expect(() => create().setParameter("shift", 1, 0)).toThrow(/Spectral Freeze/);
  });

  it("disconnects and stops its processor when removed", () => {
    const freeze = create();
    worklet().connect(context.destination);

    freeze.dispose();

    expect(worklet().outputs.size).toBe(0);
    expect(worklet().port.messages).toEqual([{ type: "stop" }]);
  });
});
