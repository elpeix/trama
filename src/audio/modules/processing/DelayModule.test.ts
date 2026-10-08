import { beforeEach, describe, expect, it } from "vitest";
import { FakeAudioContext, FakeAudioNode, FakeGainNode } from "../../../test/fakeAudioContext";
import { Transport } from "../../Transport";
import { DelayModule } from "./DelayModule";

let context: FakeAudioContext;
let transport: Transport;
let delay: DelayModule;
let input: FakeGainNode;
let output: FakeGainNode;

const others = (node: FakeAudioNode, excluded: unknown) =>
  [...node.outputs].filter((destination) => destination !== excluded) as FakeGainNode[];

beforeEach(() => {
  context = new FakeAudioContext();
  transport = new Transport(context.asAudioContext());
  delay = new DelayModule(context.asAudioContext(), { sync: "free", time: 0.25, feedback: 0.4, mix: 0.3 }, transport);
  input = delay.getAudioInput("audio") as unknown as FakeGainNode;
  output = delay.getAudioOutput("audio") as unknown as FakeGainNode;
});

const topology = () => {
  const [line] = context.delays;
  const [dry] = others(input, line);
  const wet = [...line.outputs].find((node) => (node as FakeGainNode).outputs.has(output)) as FakeGainNode;
  const feedback = [...line.outputs].find((node) => (node as FakeGainNode).outputs.has(line)) as FakeGainNode;
  return { line, dry, wet, feedback };
};

describe("DelayModule", () => {
  it("wires dry, wet and feedback paths", () => {
    const { line, dry, wet, feedback } = topology();

    expect(input.outputs.has(line)).toBe(true);
    expect(dry.outputs.has(output)).toBe(true);
    expect(wet.outputs.has(output)).toBe(true);
    expect(feedback.outputs.has(line)).toBe(true);
    expect(line.maxDelayTime).toBe(4);
  });

  it("applies its params", () => {
    const { line, dry, wet, feedback } = topology();

    expect(line.delayTime.value).toBe(0.25);
    expect(feedback.gain.value).toBe(0.4);
    expect(dry.gain.value).toBeCloseTo(0.7);
    expect(wet.gain.value).toBe(0.3);
  });

  it("glides the time and the feedback", () => {
    delay.setParameter("time", 0.5, 1);
    delay.setParameter("feedback", 0.8, 1);
    const { line, feedback } = topology();

    expect(line.delayTime.events).toEqual([{ type: "setTarget", value: 0.5, time: 1 }]);
    expect(feedback.gain.value).toBe(0.8);
  });

  it("crossfades dry and wet with the mix", () => {
    delay.setParameter("mix", 1, 0);
    const { dry, wet } = topology();

    expect(dry.gain.value).toBe(0);
    expect(wet.gain.value).toBe(1);
  });

  describe("synced", () => {
    const line = () => context.delays.at(-1)!;
    const synced = (sync: string) =>
      new DelayModule(context.asAudioContext(), { sync, time: 0.25, feedback: 0.4, mix: 0.3 }, transport);

    it("repeats after a division of the tempo", () => {
      synced("3/16");

      // 120 BPM: a dotted eighth is 0.375 s.
      expect(line().delayTime.value).toBe(0.375);
    });

    it("follows tempo changes and ignores its Time", () => {
      const module = synced("1/4");
      context.currentTime = 2;

      transport.setTempo(100);
      module.setParameter("time", 1, 2);

      expect(line().delayTime.events).toEqual([{ type: "setTarget", value: 0.6, time: 2 }]);
    });

    it("switches between free and synced", () => {
      delay.setParameter("sync", "1/4", 1);
      delay.setParameter("sync", "free", 2);

      expect(context.delays[0].delayTime.events).toEqual([
        { type: "setTarget", value: 0.5, time: 1 },
        { type: "setTarget", value: 0.25, time: 2 },
      ]);
    });

    it("stays within the length of its line at slow tempos", () => {
      transport.setTempo(30);

      synced("1/2");

      expect(line().delayTime.value).toBe(4);
    });

    it("stops following the tempo on dispose", () => {
      const module = synced("1/4");

      module.dispose();
      transport.setTempo(90);

      expect(line().delayTime.events).toEqual([]);
    });
  });

  it("ignores tempo changes when free", () => {
    transport.setTempo(90);

    expect(context.delays[0].delayTime.events).toEqual([]);
  });

  it("throws on an unknown parameter", () => {
    expect(() => delay.setParameter("nope", 1, 0)).toThrow();
  });

  it("disconnects everything on dispose", () => {
    delay.dispose();

    expect(input.outputs.size).toBe(0);
    expect(output.outputs.size).toBe(0);
    expect(context.delays[0].outputs.size).toBe(0);
  });
});
