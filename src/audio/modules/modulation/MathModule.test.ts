import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext, FakeAudioWorkletNode } from "../../../test/fakeAudioContext";
import { MathModule } from "./MathModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const create = (params: Record<string, number | string> = {}) =>
  new MathModule(context.asAudioContext(), { ...defaultParams("math"), ...params });

const worklet = () => context.workletNodes[0];
const b = () => worklet().parameters.get("b")!;

describe("MathModule", () => {
  it("works on the audio thread on a single control signal, the sum of the cables into a", () => {
    const math = create();

    expect(worklet().name).toBe("math");
    expect(worklet().options).toMatchObject({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
    });
    expect(math.openInput("a")).toBe(worklet());
    expect(math.openInput("nope")).toBeUndefined();
    expect(math.getAudioInput()).toBeUndefined();
    expect(math.getAudioOutput("out")).toBe(worklet());
    expect(math.getAudioOutput("nope")).toBeUndefined();
  });

  it("starts with its operation and its b", () => {
    create({ operation: "multiply", b: -0.5 });

    expect(worklet().options.processorOptions).toEqual({ operation: "multiply" });
    expect(b().value).toBe(-0.5);
  });

  it("modulates b with the cables into it", () => {
    const math = create();

    expect(math.getAudioParam("b")).toBe(b());
    expect(math.getAudioParam("operation")).toBeUndefined();
  });

  it("glides b to a new value", () => {
    const math = create();

    math.setParameter("b", 0.8, 2);

    expect(b().events).toEqual([{ type: "setTarget", value: 0.8, time: 2 }]);
  });

  it("changes its operation", () => {
    const math = create();

    math.setParameter("operation", "max", 1.5);

    expect(worklet().port.messages).toEqual([{ type: "operation", operation: "max" }]);
  });

  it("throws on an unknown parameter", () => {
    expect(() => create().setParameter("nope", 1, 0)).toThrow(/Math/);
  });

  it("disconnects and stops its processor on dispose", () => {
    const math = create();
    worklet().connect(context.destination);

    math.dispose();

    expect(worklet().outputs.size).toBe(0);
    expect(worklet().port.messages.at(-1)).toEqual({ type: "stop" });
  });
});
