import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { WindModule } from "./WindModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, string | number> = {}) =>
  new WindModule(context.asAudioContext(), { ...defaultParams("wind"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("WindModule", () => {
  it("plays on the audio thread, in mono, with no audio input", () => {
    const body = Array.from({ length: 32 }, (_, index) => (index === 10 ? 6 : 0));
    const wind = create({
      exciter: "air",
      bore: "cone",
      breath: 0.6,
      detune: 12,
      noise: 0.3,
      brightness: 0.4,
      vibrato: 0.5,
      bell: 3000,
      flare: 0.2,
      attack: 0.7,
      body: body.join(" "),
    });

    expect(worklet().name).toBe("wind");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { exciter: "air", bore: "cone", body },
    });
    expect(param("breath").value).toBe(0.6);
    expect(param("detune").value).toBe(12);
    expect(param("noise").value).toBe(0.3);
    expect(param("brightness").value).toBe(0.4);
    expect(param("vibrato").value).toBe(0.5);
    expect(param("bell").value).toBe(3000);
    expect(param("flare").value).toBe(0.2);
    expect(param("attack").value).toBe(0.7);
    expect(wind.getAudioOutput("audio")).toBe(worklet());
    expect(wind.getAudioInput()).toBeUndefined();
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

  it("lets the breath, the pitch and the brightness be moved by cables", () => {
    const wind = create();

    expect(wind.getAudioParam("breath")).toBe(param("breath"));
    expect(wind.getAudioParam("detune")).toBe(param("detune"));
    expect(wind.getAudioParam("brightness")).toBe(param("brightness"));
    expect(wind.getAudioParam("noise")).toBeUndefined();
    expect(wind.getAudioParam("vibrato")).toBeUndefined();
    expect(wind.getAudioParam("bell")).toBeUndefined();
  });

  it("glides its params", () => {
    const wind = create();

    wind.setParameter("breath", 0.9, 1);
    wind.setParameter("noise", 0.5, 1);
    wind.setParameter("vibrato", 0.3, 1);
    wind.setParameter("bell", 1500, 1);
    wind.setParameter("flare", 0.4, 1);
    wind.setParameter("attack", 0.2, 1);

    expect(param("breath").events).toEqual([{ type: "setTarget", value: 0.9, time: 1 }]);
    expect(param("noise").events).toEqual([{ type: "setTarget", value: 0.5, time: 1 }]);
    expect(param("vibrato").events).toEqual([{ type: "setTarget", value: 0.3, time: 1 }]);
    expect(param("bell").events).toEqual([{ type: "setTarget", value: 1500, time: 1 }]);
    expect(param("flare").events).toEqual([{ type: "setTarget", value: 0.4, time: 1 }]);
    expect(param("attack").events).toEqual([{ type: "setTarget", value: 0.2, time: 1 }]);
  });

  it("tells the audio thread what blows it, its bore and its body, keeping the rest", () => {
    const wind = create({ exciter: "reed", bore: "cylinder" });

    wind.setParameter("exciter", "lips", 1);
    wind.setParameter("bore", "cone", 1);
    wind.setParameter("body", Array.from({ length: 32 }, () => 3).join(" "), 1);

    expect(worklet().port.messages).toEqual([
      { type: "wind", exciter: "lips", bore: "cylinder" },
      { type: "wind", exciter: "lips", bore: "cone" },
      { type: "body", gains: Array.from({ length: 32 }, () => 3) },
    ]);
  });

  it("rejects unknown params", () => {
    expect(() => create().setParameter("frequency", 1, 0)).toThrow(/Wind/);
  });

  it("disconnects and stops the audio thread on dispose", () => {
    const wind = create();

    wind.dispose();

    expect(worklet().port.messages).toEqual([{ type: "stop" }]);
  });
});
