import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIDDLE_C_HZ } from "../../../patch/pitch";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { VcoModule } from "./VcoModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, string | number> = {}) =>
  new VcoModule(context.asAudioContext(), { ...defaultParams("vco"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("VcoModule", () => {
  it("runs on the audio thread, with an input for sync and a stereo output", () => {
    const vco = create({ waveform: "square", frequency: 330, width: 0.3, voices: 5, spread: 25, drift: 0.4 });

    expect(worklet().name).toBe("vco");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 1,
      channelCountMode: "explicit",
      processorOptions: { wave: "square" },
    });
    expect(param("frequency").value).toBe(330);
    expect(param("width").value).toBe(0.3);
    expect(param("voices").value).toBe(5);
    expect(param("spread").value).toBe(25);
    expect(param("drift").value).toBe(0.4);
    expect(vco.getAudioOutput("audio")).toBe(worklet());
    expect(vco.getAudioInput("sync")).toBe(worklet());
    expect(vco.getAudioInput("audio")).toBeUndefined();
  });

  it("starts at middle C in keyboard mode, and keeps Freq for free mode", () => {
    const vco = create({ mode: "keyboard", frequency: 500 });
    expect(param("frequency").value).toBe(MIDDLE_C_HZ);

    vco.setParameter("frequency", 600, 1);
    expect(param("frequency").value).toBe(MIDDLE_C_HZ);

    vco.setParameter("mode", "free", 2);
    expect(param("frequency").events).toEqual([{ type: "setTarget", value: 600, time: 2 }]);
  });

  it("modulates the frequency through the detune, and the width directly", () => {
    const vco = create();

    expect(vco.getAudioParam("frequency")).toBe(param("detune"));
    expect(vco.getAudioParam("detune")).toBe(param("detune"));
    expect(vco.getAudioParam("width")).toBe(param("width"));
    expect(vco.getAudioParam("voices")).toBeUndefined();
  });

  it("glides its params to new values, and sets the number of voices at once", () => {
    const vco = create();

    vco.setParameter("detune", 100, 1);
    vco.setParameter("width", 0.2, 1);
    vco.setParameter("spread", 40, 1);
    vco.setParameter("drift", 0.5, 1);
    vco.setParameter("voices", 3, 1);

    expect(param("detune").events).toEqual([{ type: "setTarget", value: 100, time: 1 }]);
    expect(param("width").events).toEqual([{ type: "setTarget", value: 0.2, time: 1 }]);
    expect(param("spread").events).toEqual([{ type: "setTarget", value: 40, time: 1 }]);
    expect(param("drift").events).toEqual([{ type: "setTarget", value: 0.5, time: 1 }]);
    expect(param("voices").events).toEqual([{ type: "setValue", value: 3, time: 1 }]);
  });

  it("tells the audio thread the wave to play", () => {
    create().setParameter("waveform", "triangle", 1);

    expect(worklet().port.messages).toEqual([{ type: "wave", wave: "triangle" }]);
  });

  it("rejects unknown params", () => {
    expect(() => create().setParameter("shape", 1, 0)).toThrow(/VCO/);
  });

  it("disconnects and stops the audio thread on dispose", () => {
    const vco = create();

    vco.dispose();

    expect(worklet().port.messages).toEqual([{ type: "stop" }]);
  });
});
