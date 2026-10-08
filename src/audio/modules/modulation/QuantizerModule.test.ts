import { beforeEach, describe, expect, it } from "vitest";
import { FakeAudioContext, FakeGainNode } from "../../../test/fakeAudioContext";
import { QUANTIZER_RANGE, quantizerCurve } from "./quantizerCurve";
import { QuantizerModule } from "./QuantizerModule";

let context: FakeAudioContext;
let quantizer: QuantizerModule;

beforeEach(() => {
  context = new FakeAudioContext();
  quantizer = new QuantizerModule(context.asAudioContext(), { root: "A", scale: "minor" });
});

const shaper = () => context.waveShapers[0];

describe("QuantizerModule", () => {
  it("takes the pitch from all its cables, scaled into the curve of the scale", () => {
    const input = quantizer.openInput("in") as unknown as FakeGainNode;
    const [scale] = [...input.outputs] as FakeGainNode[];

    expect(quantizer.openInput("in")).toBe(input);
    expect(quantizer.openInput("nope")).toBeUndefined();
    expect(scale.gain.value).toBe(1 / QUANTIZER_RANGE);
    expect(scale.outputs.has(shaper())).toBe(true);
    expect(quantizer.getAudioOutput("out")).toBe(shaper());
    expect(shaper().curve).toEqual(quantizerCurve("A", "minor"));
    expect(shaper().oversample).toBe("none");
  });

  it("moves to another root or scale", () => {
    quantizer.setParameter("root", "C");
    expect(shaper().curve).toEqual(quantizerCurve("C", "minor"));

    quantizer.setParameter("scale", "blues");
    expect(shaper().curve).toEqual(quantizerCurve("C", "blues"));
  });

  it("throws on an unknown parameter", () => {
    expect(() => quantizer.setParameter("nope", 1)).toThrow();
  });

  it("disconnects everything on dispose", () => {
    const input = quantizer.openInput("in") as unknown as FakeGainNode;
    const [scale] = [...input.outputs] as FakeGainNode[];

    quantizer.dispose();

    expect([input, scale, shaper()].map((node) => node.outputs.size)).toEqual([0, 0, 0]);
  });
});
