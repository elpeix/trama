import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { LadderModule } from "./LadderModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, string | number> = {}) =>
  new LadderModule(context.asAudioContext(), { ...defaultParams("ladder"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("LadderModule", () => {
  it("filters on the audio thread, in stereo", () => {
    const ladder = create({ frequency: 600, resonance: 0.7, drive: 0.4 });

    expect(worklet().name).toBe("ladder");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    expect(param("frequency").value).toBe(600);
    expect(param("detune").value).toBe(0);
    expect(param("resonance").value).toBe(0.7);
    expect(param("drive").value).toBe(0.4);
    expect(ladder.getAudioInput("audio")).toBe(worklet());
    expect(ladder.getAudioOutput("audio")).toBe(worklet());
  });

  it("modulates the frequency through the detune, in cents, and the resonance directly", () => {
    const ladder = create();

    expect(ladder.getAudioParam("frequency")).toBe(param("detune"));
    expect(ladder.getAudioParam("resonance")).toBe(param("resonance"));
    expect(ladder.getAudioParam("drive")).toBeUndefined();
  });

  it("glides its params to new values", () => {
    const ladder = create();

    ladder.setParameter("frequency", 2000, 1);
    ladder.setParameter("resonance", 0.9, 1);
    ladder.setParameter("drive", 0.5, 1);

    expect(param("frequency").events).toEqual([{ type: "setTarget", value: 2000, time: 1 }]);
    expect(param("resonance").events).toEqual([{ type: "setTarget", value: 0.9, time: 1 }]);
    expect(param("drive").events).toEqual([{ type: "setTarget", value: 0.5, time: 1 }]);
  });

  it("rejects unknown params", () => {
    expect(() => create().setParameter("Q", 1, 0)).toThrow(/Ladder/);
  });

  it("disconnects and stops the audio thread on dispose", () => {
    const ladder = create();

    ladder.dispose();

    expect(worklet().port.messages).toEqual([{ type: "stop" }]);
  });
});
