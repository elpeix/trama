import { beforeEach, describe, expect, it } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { CompressorModule } from "./CompressorModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
});

const create = (params: Record<string, number> = {}) =>
  new CompressorModule(context.asAudioContext(), { ...defaultParams("compressor"), ...params });

const compressor = () => context.compressors[0];
const makeup = () => context.gains[0];

describe("CompressorModule", () => {
  it("compresses the sound it gets, and raises it back by the makeup", () => {
    const module = create();

    expect(module.getAudioInput("audio")).toBe(compressor());
    expect(module.getAudioInput("nope")).toBeUndefined();
    expect(compressor().outputs.has(makeup())).toBe(true);
    expect(module.getAudioOutput("audio")).toBe(makeup());
    expect(module.getAudioOutput("nope")).toBeUndefined();
  });

  it("starts with its params, the makeup in dB", () => {
    create({ threshold: -30, ratio: 8, knee: 3, attack: 0.01, release: 0.4, makeup: 6 });

    expect(compressor().threshold.value).toBe(-30);
    expect(compressor().ratio.value).toBe(8);
    expect(compressor().knee.value).toBe(3);
    expect(compressor().attack.value).toBe(0.01);
    expect(compressor().release.value).toBe(0.4);
    expect(makeup().gain.value).toBeCloseTo(1.995, 3);
  });

  it("does not raise the sound with no makeup", () => {
    create({ makeup: 0 });

    expect(makeup().gain.value).toBe(1);
  });

  it("glides its params to new values", () => {
    const module = create();

    module.setParameter("threshold", -12, 1);
    module.setParameter("ratio", 2, 1);
    module.setParameter("knee", 10, 1);
    module.setParameter("attack", 0.1, 1);
    module.setParameter("release", 0.5, 1);
    module.setParameter("makeup", 20, 2);

    expect(compressor().threshold.events).toEqual([{ type: "setTarget", value: -12, time: 1 }]);
    expect(compressor().ratio.events).toEqual([{ type: "setTarget", value: 2, time: 1 }]);
    expect(compressor().knee.events).toEqual([{ type: "setTarget", value: 10, time: 1 }]);
    expect(compressor().attack.events).toEqual([{ type: "setTarget", value: 0.1, time: 1 }]);
    expect(compressor().release.events).toEqual([{ type: "setTarget", value: 0.5, time: 1 }]);
    expect(makeup().gain.events).toEqual([{ type: "setTarget", value: 10, time: 2 }]);
  });

  it("throws on an unknown parameter", () => {
    expect(() => create().setParameter("nope", 1, 0)).toThrow(/Compressor/);
  });

  it("disconnects everything on dispose", () => {
    const module = create();
    makeup().connect(context.destination);

    module.dispose();

    expect([compressor(), makeup()].map((node) => node.outputs.size)).toEqual([0, 0]);
  });
});
