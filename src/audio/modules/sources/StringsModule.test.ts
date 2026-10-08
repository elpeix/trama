import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { StringsModule } from "./StringsModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, string | number> = {}) =>
  new StringsModule(context.asAudioContext(), { ...defaultParams("strings"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("StringsModule", () => {
  it("plays on the audio thread, in mono, with no audio input", () => {
    const body = Array.from({ length: 32 }, (_, index) => (index === 10 ? 6 : 0));
    const strings = create({
      play: "plucked",
      bow: 0.6,
      pressure: 0.3,
      position: 0.1,
      detune: 12,
      brightness: 0.4,
      noise: 0.2,
      vibrato: 0.5,
      attack: 0.7,
      body: body.join(" "),
    });

    expect(worklet().name).toBe("strings");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { play: "plucked", body },
    });
    expect(param("bow").value).toBe(0.6);
    expect(param("pressure").value).toBe(0.3);
    expect(param("position").value).toBe(0.1);
    expect(param("detune").value).toBe(12);
    expect(param("brightness").value).toBe(0.4);
    expect(param("noise").value).toBe(0.2);
    expect(param("vibrato").value).toBe(0.5);
    expect(param("attack").value).toBe(0.7);
    expect(strings.getAudioOutput("audio")).toBe(worklet());
    expect(strings.getAudioInput()).toBeUndefined();
  });

  it("passes the notes it gets on to the audio thread, each as hard as it is played", () => {
    const keys = create().getNoteInput("notes")!;

    keys.noteOn(60, 1, 90);
    keys.noteOn(64, 1);
    keys.noteOff(60, 2);
    keys.allNotesOff(3);

    expect(worklet().port.messages).toEqual([
      { type: "noteOn", note: 60, time: 1, velocity: 90 },
      { type: "noteOn", note: 64, time: 1, velocity: 100 },
      { type: "noteOff", note: 60, time: 2 },
      { type: "allNotesOff", time: 3 },
    ]);
  });

  it("lets the bow, the pressure, the position, the pitch and the brightness be moved by cables", () => {
    const strings = create();

    expect(strings.getAudioParam("bow")).toBe(param("bow"));
    expect(strings.getAudioParam("pressure")).toBe(param("pressure"));
    expect(strings.getAudioParam("position")).toBe(param("position"));
    expect(strings.getAudioParam("detune")).toBe(param("detune"));
    expect(strings.getAudioParam("brightness")).toBe(param("brightness"));
    expect(strings.getAudioParam("noise")).toBeUndefined();
    expect(strings.getAudioParam("vibrato")).toBeUndefined();
    expect(strings.getAudioParam("attack")).toBeUndefined();
  });

  it("glides its params", () => {
    const strings = create();

    strings.setParameter("bow", 0.9, 1);
    strings.setParameter("pressure", 0.8, 1);
    strings.setParameter("position", 0.2, 1);
    strings.setParameter("noise", 0.5, 1);
    strings.setParameter("vibrato", 0.3, 1);
    strings.setParameter("attack", 0.2, 1);

    expect(param("bow").events).toEqual([{ type: "setTarget", value: 0.9, time: 1 }]);
    expect(param("pressure").events).toEqual([{ type: "setTarget", value: 0.8, time: 1 }]);
    expect(param("position").events).toEqual([{ type: "setTarget", value: 0.2, time: 1 }]);
    expect(param("noise").events).toEqual([{ type: "setTarget", value: 0.5, time: 1 }]);
    expect(param("vibrato").events).toEqual([{ type: "setTarget", value: 0.3, time: 1 }]);
    expect(param("attack").events).toEqual([{ type: "setTarget", value: 0.2, time: 1 }]);
  });

  it("tells the audio thread how it is played and its body", () => {
    const strings = create({ play: "bowed" });

    strings.setParameter("play", "plucked", 1);
    strings.setParameter("body", Array.from({ length: 32 }, () => 3).join(" "), 1);

    expect(worklet().port.messages).toEqual([
      { type: "play", play: "plucked" },
      { type: "body", gains: Array.from({ length: 32 }, () => 3) },
    ]);
  });

  it("rejects unknown params", () => {
    expect(() => create().setParameter("frequency", 1, 0)).toThrow(/Strings/);
  });

  it("disconnects and stops the audio thread on dispose", () => {
    const strings = create();

    strings.dispose();

    expect(worklet().port.messages).toEqual([{ type: "stop" }]);
  });
});
