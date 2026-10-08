import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { PianoModule } from "./PianoModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, string | number> = {}) =>
  new PianoModule(context.asAudioContext(), { ...defaultParams("piano"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("PianoModule", () => {
  it("plays on the audio thread, in stereo, with no audio input", () => {
    const piano = create({ brightness: 0.7, decay: 1.5, unison: 2, hammer: 0.4, pedal: 0, body: 0.6 });

    expect(worklet().name).toBe("piano");
    expect(worklet().options).toMatchObject({ numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    expect(param("brightness").value).toBe(0.7);
    expect(param("decay").value).toBe(1.5);
    expect(param("unison").value).toBe(2);
    expect(param("hammer").value).toBe(0.4);
    expect(param("pedal").value).toBe(0);
    expect(param("body").value).toBe(0.6);
    expect(piano.getAudioOutput("audio")).toBe(worklet());
    expect(piano.getAudioInput()).toBeUndefined();
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

  it("lets the pedal and the brightness be moved by cables", () => {
    const piano = create();

    expect(piano.getAudioParam("pedal")).toBe(param("pedal"));
    expect(piano.getAudioParam("brightness")).toBe(param("brightness"));
    expect(piano.getAudioParam("decay")).toBeUndefined();
  });

  it("glides its params, and sets the pedal at once", () => {
    const piano = create();

    piano.setParameter("decay", 2, 1);
    piano.setParameter("body", 0.2, 1);
    piano.setParameter("pedal", 1, 1);

    expect(param("decay").events).toEqual([{ type: "setTarget", value: 2, time: 1 }]);
    expect(param("body").events).toEqual([{ type: "setTarget", value: 0.2, time: 1 }]);
    expect(param("pedal").events).toEqual([{ type: "setValue", value: 1, time: 1 }]);
  });

  it("rejects unknown params", () => {
    expect(() => create().setParameter("frequency", 1, 0)).toThrow(/Piano/);
  });

  it("disconnects and stops the audio thread on dispose", () => {
    const piano = create();

    piano.dispose();

    expect(worklet().port.messages).toEqual([{ type: "stop" }]);
  });
});
