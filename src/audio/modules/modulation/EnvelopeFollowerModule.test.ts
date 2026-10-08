import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { EnvelopeFollowerModule } from "./EnvelopeFollowerModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, number> = {}) =>
  new EnvelopeFollowerModule(context.asAudioContext(), { ...defaultParams("envelopeFollower"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("EnvelopeFollowerModule", () => {
  it("follows on the audio thread a sound in stereo, and gives a single control signal", () => {
    const follower = create();

    expect(worklet().name).toBe("envelope-follower");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    expect(follower.getAudioInput("audio")).toBe(worklet());
    expect(follower.getAudioInput("nope")).toBeUndefined();
    expect(follower.getAudioOutput("out")).toBe(worklet());
    expect(follower.getAudioOutput("audio")).toBeUndefined();
  });

  it("starts with its attack, its release and its gain", () => {
    create({ attack: 0.02, release: 0.4, gain: 2 });

    expect(param("attack").value).toBe(0.02);
    expect(param("release").value).toBe(0.4);
    expect(param("gain").value).toBe(2);
  });

  it("sets its params at the time it is told", () => {
    const follower = create();

    follower.setParameter("attack", 0.05, 1);
    follower.setParameter("release", 1, 1.5);
    follower.setParameter("gain", 3, 2);

    expect(param("attack").events).toEqual([{ type: "setValue", value: 0.05, time: 1 }]);
    expect(param("release").events).toEqual([{ type: "setValue", value: 1, time: 1.5 }]);
    expect(param("gain").events).toEqual([{ type: "setValue", value: 3, time: 2 }]);
  });

  it("throws on an unknown parameter", () => {
    expect(() => create().setParameter("nope", 1, 0)).toThrow(/Envelope Follower/);
  });

  it("disconnects and stops its processor on dispose", () => {
    const follower = create();
    worklet().connect(context.destination);

    follower.dispose();

    expect(worklet().outputs.size).toBe(0);
    expect(worklet().port.messages.at(-1)).toEqual({ type: "stop" });
  });
});
