import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import type { ParamValue } from "../../../patch/types";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { GranulatorModule } from "./GranulatorModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, ParamValue> = {}) =>
  new GranulatorModule(context.asAudioContext(), { ...defaultParams("granulator"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("GranulatorModule", () => {
  it("runs the grains on the audio thread, in stereo, a sound in mono reaching both sides", () => {
    const granulator = create({ position: 1.5, size: 200, density: 10, pitch: -5, spread: 0.4, mix: 0.3 });

    expect(worklet().name).toBe("granulator");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    expect(["position", "size", "density", "pitch", "spread", "mix", "freeze"].map((name) => param(name).value)).toEqual([
      1.5, 200, 10, -5, 0.4, 0.3, 0,
    ]);
    expect(granulator.getAudioInput("audio")).toBe(worklet());
    expect(granulator.getAudioOutput("audio")).toBe(worklet());
  });

  it("modulates the position, the pitch and the spread", () => {
    const granulator = create();

    expect(["position", "pitch", "spread"].map((port) => granulator.getAudioParam(port))).toEqual([
      param("position"),
      param("pitch"),
      param("spread"),
    ]);
    expect(granulator.getAudioParam("size")).toBeUndefined();
  });

  it("glides its params, and freezes right away", () => {
    const granulator = create();

    granulator.setParameter("density", 50, 1);
    granulator.setParameter("freeze", "on", 2);

    expect(param("density").events).toEqual([{ type: "setTarget", value: 50, time: 1 }]);
    expect(param("freeze").events).toEqual([{ type: "setValue", value: 1, time: 2 }]);
  });

  it("rejects a param it does not have", () => {
    expect(() => create().setParameter("decay", 1, 0)).toThrow(/Granulator/);
  });

  it("disconnects and stops its processor when removed", () => {
    const granulator = create();
    worklet().connect(context.destination);

    granulator.dispose();

    expect(worklet().outputs.size).toBe(0);
    expect(worklet().port.messages).toEqual([{ type: "stop" }]);
  });
});
