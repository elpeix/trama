import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { PitchShifterModule } from "./PitchShifterModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, number> = {}) =>
  new PitchShifterModule(context.asAudioContext(), { ...defaultParams("pitchShifter"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("PitchShifterModule", () => {
  it("shifts on the audio thread, in stereo, a sound in mono reaching both sides", () => {
    const shifter = create({ shift: -5, window: 80, mix: 0.4 });

    expect(worklet().name).toBe("pitch-shifter");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    expect(param("shift").value).toBe(-5);
    expect(param("window").value).toBe(80);
    expect(param("mix").value).toBe(0.4);
    expect(shifter.getAudioInput("audio")).toBe(worklet());
    expect(shifter.getAudioOutput("audio")).toBe(worklet());
  });

  it("is a harmonizer to start with: a fifth up, half and half with the sound it gets", () => {
    create();

    expect(param("shift").value).toBe(7);
    expect(param("mix").value).toBe(0.5);
  });

  it("modulates the shift in semitones", () => {
    const shifter = create();

    expect(shifter.getAudioParam("shift")).toBe(param("shift"));
    expect(shifter.getAudioParam("window")).toBeUndefined();
  });

  it("glides its params to new values", () => {
    const shifter = create();

    shifter.setParameter("shift", 12, 1);
    shifter.setParameter("window", 40, 1);
    shifter.setParameter("mix", 1, 1);

    expect(param("shift").events).toEqual([{ type: "setTarget", value: 12, time: 1 }]);
    expect(param("window").events).toEqual([{ type: "setTarget", value: 40, time: 1 }]);
    expect(param("mix").events).toEqual([{ type: "setTarget", value: 1, time: 1 }]);
  });

  it("rejects a param it does not have", () => {
    expect(() => create().setParameter("decay", 1, 0)).toThrow(/Pitch Shifter/);
  });

  it("disconnects and stops its processor when removed", () => {
    const shifter = create();
    worklet().connect(context.destination);

    shifter.dispose();

    expect(worklet().outputs.size).toBe(0);
    expect(worklet().port.messages).toEqual([{ type: "stop" }]);
  });
});
