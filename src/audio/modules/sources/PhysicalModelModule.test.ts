import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIDDLE_C_HZ } from "../../../patch/pitch";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { PhysicalModelModule } from "./PhysicalModelModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, string | number> = {}) =>
  new PhysicalModelModule(context.asAudioContext(), { ...defaultParams("physicalModel"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("PhysicalModelModule", () => {
  it("runs the string on the audio thread, with a single output and no input", () => {
    const string = create({ frequency: 330, decay: 2, damp: 0.2, brightness: 0.3 });

    expect(worklet().name).toBe("physical-model");
    expect(worklet().options).toMatchObject({ numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    expect(param("frequency").value).toBe(330);
    expect(param("decay").value).toBe(2);
    expect(param("damp").value).toBe(0.2);
    expect(param("brightness").value).toBe(0.3);
    expect(string.getAudioOutput("audio")).toBe(worklet());
    expect(string.getAudioInput()).toBeUndefined();
  });

  it("plucks the string when its gate opens, and damps it when it closes", () => {
    const string = create();

    string.getTriggerInput("gate")!.gateOn(1.5);
    string.getTriggerInput("gate")!.gateOff(2);

    expect(worklet().port.messages).toEqual([
      { type: "pluck", time: 1.5 },
      { type: "release", time: 2 },
    ]);
  });

  it("starts at middle C in keyboard mode, and keeps Freq for free mode", () => {
    const string = create({ mode: "keyboard", frequency: 500 });
    expect(param("frequency").value).toBe(MIDDLE_C_HZ);

    string.setParameter("frequency", 600, 1);
    expect(param("frequency").value).toBe(MIDDLE_C_HZ);

    string.setParameter("mode", "free", 2);
    expect(param("frequency").events).toEqual([{ type: "setTarget", value: 600, time: 2 }]);
  });

  it("modulates the frequency through the detune, and the brightness directly", () => {
    const string = create();

    expect(string.getAudioParam("frequency")).toBe(param("detune"));
    expect(string.getAudioParam("detune")).toBe(param("detune"));
    expect(string.getAudioParam("brightness")).toBe(param("brightness"));
    expect(string.getAudioParam("decay")).toBeUndefined();
  });

  it("glides its params to new values", () => {
    const string = create();

    string.setParameter("decay", 4, 1);
    string.setParameter("damp", 0.3, 1);
    string.setParameter("brightness", 0.9, 1);
    string.setParameter("detune", 100, 1);

    expect(param("decay").events).toEqual([{ type: "setTarget", value: 4, time: 1 }]);
    expect(param("damp").events).toEqual([{ type: "setTarget", value: 0.3, time: 1 }]);
    expect(param("brightness").events).toEqual([{ type: "setTarget", value: 0.9, time: 1 }]);
    expect(param("detune").events).toEqual([{ type: "setTarget", value: 100, time: 1 }]);
  });

  it("rejects a param it does not have", () => {
    expect(() => create().setParameter("waveform", "sine", 0)).toThrow(/Physical Model/);
  });

  it("disconnects and stops its processor when removed", () => {
    const string = create();
    worklet().connect(context.destination);

    string.dispose();

    expect(worklet().outputs.size).toBe(0);
    expect(worklet().port.messages).toEqual([{ type: "stop" }]);
  });
});
