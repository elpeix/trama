import { beforeEach, describe, expect, it } from "vitest";
import { FakeAudioContext, FakeGainNode } from "../../../test/fakeAudioContext";
import { DRIVE_RANGE, distortionCurve } from "./distortionCurve";
import { DistortionModule } from "./DistortionModule";

const SHAPE = "-1 -0.5 0 0.8 1";

let context: FakeAudioContext;
let distortion: DistortionModule;
let input: FakeGainNode;
let output: FakeGainNode;

beforeEach(() => {
  context = new FakeAudioContext();
  distortion = new DistortionModule(context.asAudioContext(), {
    mode: "soft",
    drive: 4,
    shape: SHAPE,
    tone: 8000,
    mix: 0.8,
  });
  input = distortion.getAudioInput("audio") as unknown as FakeGainNode;
  output = distortion.getAudioOutput("audio") as unknown as FakeGainNode;
});

const topology = () => {
  const [shaper] = context.waveShapers;
  const [tone] = context.filters;
  const drive = [...input.outputs].find((node) => (node as FakeGainNode).outputs.has(output) === false) as FakeGainNode;
  const dry = [...input.outputs].find((node) => node !== drive) as FakeGainNode;
  const scale = [...drive.outputs][0] as FakeGainNode;
  const wet = [...tone.outputs][0] as FakeGainNode;
  return { drive, scale, shaper, tone, dry, wet };
};

describe("DistortionModule", () => {
  it("sends the sound dry, and wet through the drive, the shaper and a tone filter", () => {
    const { drive, scale, shaper, tone, dry, wet } = topology();

    expect(scale.outputs.has(shaper)).toBe(true);
    expect(shaper.outputs.has(tone)).toBe(true);
    expect(wet.outputs.has(output)).toBe(true);
    expect(dry.outputs.has(output)).toBe(true);
    expect(drive).not.toBe(dry);
    expect(tone.type).toBe("lowpass");
    expect(shaper.oversample).toBe("4x");
  });

  it("applies its params", () => {
    const { drive, scale, shaper, tone, dry, wet } = topology();

    expect(drive.gain.value).toBe(4);
    expect(scale.gain.value).toBe(1 / DRIVE_RANGE);
    expect(shaper.curve).toEqual(distortionCurve("soft", []));
    expect(tone.frequency.value).toBe(8000);
    expect(dry.gain.value).toBeCloseTo(0.2);
    expect(wet.gain.value).toBe(0.8);
  });

  it("changes the curve with the mode, and with the shape drawn while drawn", () => {
    distortion.setParameter("mode", "fold", 0);
    expect(topology().shaper.curve).toEqual(distortionCurve("fold", []));

    distortion.setParameter("mode", "drawn", 0);
    expect(topology().shaper.curve).toEqual(distortionCurve("drawn", [-1, -0.5, 0, 0.8, 1]));

    distortion.setParameter("shape", "1 0 -1", 0);
    expect(topology().shaper.curve).toEqual(distortionCurve("drawn", [1, 0, -1]));
  });

  it("glides the drive, the tone and the mix", () => {
    distortion.setParameter("drive", 10, 1);
    distortion.setParameter("tone", 2000, 1);
    distortion.setParameter("mix", 1, 1);
    const { drive, tone, dry, wet } = topology();

    expect(drive.gain.events).toEqual([{ type: "setTarget", value: 10, time: 1 }]);
    expect(tone.frequency.events).toEqual([{ type: "setTarget", value: 2000, time: 1 }]);
    expect(dry.gain.value).toBe(0);
    expect(wet.gain.value).toBe(1);
  });

  it("modulates the drive, and the tone in cents", () => {
    const { drive, tone } = topology();

    expect(distortion.getAudioParam("drive")).toBe(drive.gain);
    expect(distortion.getAudioParam("tone")).toBe(tone.detune);
    expect(distortion.getAudioParam("mix")).toBeUndefined();
  });

  it("throws on an unknown parameter", () => {
    expect(() => distortion.setParameter("nope", 1, 0)).toThrow();
  });

  it("disconnects everything on dispose", () => {
    const { drive, scale, shaper, tone } = topology();

    distortion.dispose();

    expect([input, output, drive, scale, shaper, tone].map((node) => node.outputs.size)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
