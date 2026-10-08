import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { OutputModule } from "./OutputModule";

beforeEach(() => {
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (context: FakeAudioContext, params: Record<string, number | string> = {}) =>
  new OutputModule(context.asAudioContext(), { volume: 1, limiter: "on", ...params }, context.createMediaStreamDestination() as unknown as AudioNode);

describe("OutputModule", () => {
  it("sends its input to the speakers, the recording and a meter, after the volume, the limiter and the fade", () => {
    const context = new FakeAudioContext();
    const recording = context.createMediaStreamDestination();
    const output = new OutputModule(context.asAudioContext(), { volume: 0.8, limiter: "on" }, recording as unknown as AudioNode);

    const [input, fade, meter] = context.gains;
    const [limiter] = context.workletNodes;
    const [left, right] = context.analysers;
    expect(output.getAudioInput("audio")).toBe(input);
    expect(input.gain.value).toBe(0.8);
    expect(input.outputs).toEqual(new Set([limiter]));
    expect(limiter.outputs).toEqual(new Set([fade]));
    expect(fade.gain.value).toBe(1);
    expect(fade.outputs.has(context.destination)).toBe(true);
    expect(fade.outputs.has(recording)).toBe(true);
    expect(fade.outputs.has(meter)).toBe(true);
    expect(output.getAnalyser()).toEqual({ left, right });
  });

  it("limits the stereo sound on the audio thread, turned on or off by its param", () => {
    const context = new FakeAudioContext();
    create(context, { limiter: "off" });

    const [limiter] = context.workletNodes;
    expect(limiter.name).toBe("output-limiter");
    expect(limiter.options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
      processorOptions: { enabled: false },
    });
  });

  it("turns the limiter on and off", () => {
    const context = new FakeAudioContext();
    const output = create(context);

    output.setParameter("limiter", "off", 1);
    output.setParameter("limiter", "on", 2);

    expect(context.workletNodes[0].port.messages).toEqual([
      { type: "limiter", enabled: false },
      { type: "limiter", enabled: true },
    ]);
  });

  it("knows when the limiter went quiet, and sounds again once unmuted", () => {
    const context = new FakeAudioContext();
    const output = create(context);
    const [limiter] = context.workletNodes;

    expect(output.isMuted()).toBe(false);
    limiter.port.receive({ type: "muted" });
    expect(output.isMuted()).toBe(true);

    output.unmute();

    expect(output.isMuted()).toBe(false);
    expect(limiter.port.messages).toEqual([{ type: "unmute" }]);
  });

  it("is no longer muted once the limiter is off", () => {
    const context = new FakeAudioContext();
    const output = create(context);
    context.workletNodes[0].port.receive({ type: "muted" });

    output.setParameter("limiter", "off", 0);

    expect(output.isMuted()).toBe(false);
  });

  it("fades along a ramp, or sets the fade at once", () => {
    const context = new FakeAudioContext();
    const output = create(context);
    const fade = context.gains[1];

    output.fade(0.5, 2, true);
    output.fade(1, 3, false);

    expect(fade.gain.events).toEqual([
      { type: "linearRamp", value: 0.5, time: 2 },
      { type: "cancel", time: 3 },
      { type: "setValue", value: 1, time: 3 },
    ]);
  });

  it("glides to a new volume", () => {
    const context = new FakeAudioContext();
    const output = create(context);

    output.setParameter("volume", 0.25, 3);

    expect(context.gains[0].gain.events).toEqual([{ type: "setTarget", value: 0.25, time: 3 }]);
    expect(() => output.setParameter("gain", 1, 0)).toThrow(/Output/);
  });

  it("disconnects, and stops the limiter, on dispose", () => {
    const context = new FakeAudioContext();
    const output = create(context);
    const [limiter] = context.workletNodes;

    output.dispose();

    expect(context.gains[0].outputs.size).toBe(0);
    expect(limiter.outputs.size).toBe(0);
    expect(limiter.port.messages).toEqual([{ type: "stop" }]);
  });
});
