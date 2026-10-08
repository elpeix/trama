import { beforeEach, describe, expect, it } from "vitest";
import { FakeAudioContext, FakeGainNode } from "../../../test/fakeAudioContext";
import { ReverbModule } from "./ReverbModule";

let context: FakeAudioContext;
let reverb: ReverbModule;
let input: FakeGainNode;
let output: FakeGainNode;

beforeEach(() => {
  context = new FakeAudioContext();
  reverb = new ReverbModule(context.asAudioContext(), { decay: 2, predelay: 0.02, tone: 6000, mix: 0.3 });
  input = reverb.getAudioInput("audio") as unknown as FakeGainNode;
  output = reverb.getAudioOutput("audio") as unknown as FakeGainNode;
});

const topology = () => {
  const [predelay] = context.delays;
  const [convolver] = context.convolvers;
  const [tone] = context.filters;
  const dry = [...input.outputs].find((node) => node !== predelay) as FakeGainNode;
  const wet = [...tone.outputs][0] as FakeGainNode;
  return { predelay, convolver, tone, dry, wet };
};

describe("ReverbModule", () => {
  it("sends the sound dry, and wet through a pre-delay, the room and a tone filter", () => {
    const { predelay, convolver, tone, dry, wet } = topology();

    expect(input.outputs.has(predelay)).toBe(true);
    expect(predelay.outputs.has(convolver)).toBe(true);
    expect(convolver.outputs.has(tone)).toBe(true);
    expect(wet.outputs.has(output)).toBe(true);
    expect(dry.outputs.has(output)).toBe(true);
    expect(tone.type).toBe("lowpass");
  });

  it("applies its params", () => {
    const { predelay, convolver, tone, dry, wet } = topology();

    expect(convolver.buffer?.numberOfChannels).toBe(2);
    expect(convolver.buffer?.length).toBe(2 * context.sampleRate);
    expect(predelay.delayTime.value).toBe(0.02);
    expect(tone.frequency.value).toBe(6000);
    expect(dry.gain.value).toBeCloseTo(0.7);
    expect(wet.gain.value).toBe(0.3);
  });

  it("builds a new room when the decay changes", () => {
    reverb.setParameter("decay", 4, 1);

    expect(topology().convolver.buffer?.length).toBe(4 * context.sampleRate);
  });

  it("glides the pre-delay and the tone", () => {
    reverb.setParameter("predelay", 0.1, 1);
    reverb.setParameter("tone", 2000, 1);
    const { predelay, tone } = topology();

    expect(predelay.delayTime.events).toEqual([{ type: "setTarget", value: 0.1, time: 1 }]);
    expect(tone.frequency.events).toEqual([{ type: "setTarget", value: 2000, time: 1 }]);
  });

  it("crossfades dry and wet with the mix", () => {
    reverb.setParameter("mix", 1, 0);
    const { dry, wet } = topology();

    expect(dry.gain.value).toBe(0);
    expect(wet.gain.value).toBe(1);
  });

  it("modulates the tone in cents", () => {
    expect(reverb.getAudioParam("tone")).toBe(topology().tone.detune);
    expect(reverb.getAudioParam("mix")).toBeUndefined();
  });

  it("throws on an unknown parameter", () => {
    expect(() => reverb.setParameter("nope", 1, 0)).toThrow();
  });

  it("disconnects everything on dispose", () => {
    reverb.dispose();
    const { predelay, convolver, tone } = topology();

    expect(input.outputs.size).toBe(0);
    expect(output.outputs.size).toBe(0);
    expect(predelay.outputs.size).toBe(0);
    expect(convolver.outputs.size).toBe(0);
    expect(tone.outputs.size).toBe(0);
  });
});
