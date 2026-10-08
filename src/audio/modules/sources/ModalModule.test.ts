import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIDDLE_C_HZ } from "../../../patch/pitch";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { ModalModule } from "./ModalModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, string | number> = {}) =>
  new ModalModule(context.asAudioContext(), { ...defaultParams("modal"), ...params });

const worklet = () => context.workletNodes[0];
const param = (name: string) => worklet().parameters.get(name)!;

describe("ModalModule", () => {
  it("rings on the audio thread, with a single output and no audio input", () => {
    const modal = create({ model: "bell", frequency: 330, decay: 4, brightness: 0.3, hit: 0.6, stretch: -0.2 });

    expect(worklet().name).toBe("modal");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { model: "bell" },
    });
    expect(param("frequency").value).toBe(330);
    expect(param("decay").value).toBe(4);
    expect(param("brightness").value).toBe(0.3);
    expect(param("hit").value).toBe(0.6);
    expect(param("stretch").value).toBe(-0.2);
    expect(modal.getAudioOutput("audio")).toBe(worklet());
    expect(modal.getAudioInput()).toBeUndefined();
  });

  it("is struck when its gate opens, and lets the gate close without cutting it", () => {
    const modal = create();

    modal.getTriggerInput("gate")!.gateOn(1.5);
    modal.getTriggerInput("gate")!.gateOff(2);

    expect(worklet().port.messages).toEqual([{ type: "strike", time: 1.5 }]);
  });

  it("starts at middle C in keyboard mode, and keeps Freq for free mode", () => {
    const modal = create({ mode: "keyboard", frequency: 500 });
    expect(param("frequency").value).toBe(MIDDLE_C_HZ);

    modal.setParameter("frequency", 600, 1);
    expect(param("frequency").value).toBe(MIDDLE_C_HZ);

    modal.setParameter("mode", "free", 2);
    expect(param("frequency").events).toEqual([{ type: "setTarget", value: 600, time: 2 }]);
  });

  it("modulates the frequency through the detune, and the brightness directly", () => {
    const modal = create();

    expect(modal.getAudioParam("frequency")).toBe(param("detune"));
    expect(modal.getAudioParam("detune")).toBe(param("detune"));
    expect(modal.getAudioParam("brightness")).toBe(param("brightness"));
    expect(modal.getAudioParam("decay")).toBeUndefined();
  });

  it("glides its params to new values, and tells the audio thread the model", () => {
    const modal = create();

    modal.setParameter("decay", 6, 1);
    modal.setParameter("hit", 0.2, 1);
    modal.setParameter("stretch", 0.4, 1);
    modal.setParameter("model", "gong", 1);

    expect(param("decay").events).toEqual([{ type: "setTarget", value: 6, time: 1 }]);
    expect(param("hit").events).toEqual([{ type: "setTarget", value: 0.2, time: 1 }]);
    expect(param("stretch").events).toEqual([{ type: "setTarget", value: 0.4, time: 1 }]);
    expect(worklet().port.messages).toEqual([{ type: "model", model: "gong" }]);
  });

  it("rejects unknown params", () => {
    expect(() => create().setParameter("damp", 1, 0)).toThrow(/Modal/);
  });

  it("disconnects and stops the audio thread on dispose", () => {
    const modal = create();

    modal.dispose();

    expect(worklet().port.messages).toEqual([{ type: "stop" }]);
  });
});
