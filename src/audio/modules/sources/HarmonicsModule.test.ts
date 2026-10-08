import { beforeEach, describe, expect, it } from "vitest";
import { MIDDLE_C_HZ } from "../../../patch/pitch";
import { defaultParams } from "../../../patch/registry";
import type { Params } from "../../../patch/types";
import { FakeAudioContext, type FakeGainNode } from "../../../test/fakeAudioContext";
import { HarmonicsModule } from "./HarmonicsModule";

let context: FakeAudioContext;
let current: HarmonicsModule;

beforeEach(() => {
  context = new FakeAudioContext();
});

const levels = (...values: number[]) => [...values, ...Array(16 - values.length).fill(0)].join(" ");

const create = (params: Partial<Params> = {}) => {
  current = new HarmonicsModule(context.asAudioContext(), {
    ...defaultParams("harmonics"),
    frequency: 100,
    harmonics: levels(1, 0.5, 0.25, 0.25),
    brightness: 1,
    even: 1,
    ...params,
  });
  return current;
};

const output = () => current.getAudioOutput("audio") as unknown as FakeGainNode;

const harmonic = (n: number) => context.oscillators[n - 1];
/** The gain each harmonic goes through first: its level, tilted by the brightness. */
const tilt = (n: number) => context.gains.find((gain) => harmonic(n).outputs.has(gain))!;
/** The gain after it that lets an even harmonic through as far as the even param says. */
const parity = (n: number) => context.gains.find((gain) => tilt(n).outputs.has(gain) && gain !== output());
const busOf = (param: AudioParam) => context.constantSources.find((source) => source.offset === (param as unknown))!;
const scalesFrom = (bus: { outputs: Set<unknown> }) => [...bus.outputs] as FakeGainNode[];

describe("HarmonicsModule", () => {
  it("plays sixteen started sines on the harmonics of its frequency", () => {
    create();

    expect(context.oscillators).toHaveLength(16);
    expect(context.oscillators.map((oscillator) => oscillator.frequency.value)).toEqual(
      Array.from({ length: 16 }, (_, index) => 100 * (index + 1)),
    );
    expect(context.oscillators.every((oscillator) => oscillator.type === "sine" && oscillator.started)).toBe(true);
  });

  it("gives each harmonic the level drawn for it, and keeps their sum from clipping", () => {
    create();

    expect([1, 2, 3, 5].map((n) => tilt(n).gain.value)).toEqual([1, 0.5, 0.25, 0]);
    expect(output().gain.value).toBe(0.5);
  });

  it("detunes and modulates every harmonic together, in cents", () => {
    const module = create({ detune: 30 });
    const detune = module.getAudioParam("frequency")!;

    expect(module.getAudioParam("detune")).toBe(detune);
    expect(detune.value).toBe(30);
    expect(context.oscillators.every((oscillator) => busOf(detune).outputs.has(oscillator.detune))).toBe(true);
  });

  it("starts at middle C in keyboard mode", () => {
    create({ mode: "keyboard" });

    expect(harmonic(1).frequency.value).toBe(MIDDLE_C_HZ);
    expect(harmonic(3).frequency.value).toBeCloseTo(3 * MIDDLE_C_HZ);
  });

  it("tilts the harmonics with less brightness, the higher ones more, leaving the fundamental alone", () => {
    create({ brightness: 0, harmonics: levels(...Array(16).fill(1)) });

    expect(tilt(1).gain.value).toBe(1);
    expect(tilt(6).gain.value).toBeCloseTo(1 - 5 / 15);
    expect(tilt(16).gain.value).toBeCloseTo(0);
  });

  it("adds the modulation of the brightness to every harmonic but the fundamental, as far as it tilts it", () => {
    const module = create({ harmonics: levels(...Array(16).fill(1)) });
    const bus = busOf(module.getAudioParam("brightness")!);

    expect(bus.offset.value).toBe(0);
    const scales = scalesFrom(bus);
    expect(scales).toHaveLength(15);
    for (const n of [2, 6, 16]) {
      const scale = scales.find((candidate) => candidate.outputs.has(tilt(n).gain))!;
      expect(scale.gain.value).toBeCloseTo((n - 1) / 15);
    }
  });

  it("lets the even harmonics through as far as its even param says, and adds its modulation", () => {
    const module = create({ even: 0.25 });
    const bus = busOf(module.getAudioParam("even")!);

    expect(parity(1)).toBeUndefined();
    expect(parity(2)?.gain.value).toBe(0.25);
    expect(parity(16)?.gain.value).toBe(0.25);
    expect([...bus.outputs]).toEqual([2, 4, 6, 8, 10, 12, 14, 16].map((n) => parity(n)!.gain));
  });

  it("follows new levels, frequency and macros", () => {
    const module = create();

    module.setParameter("harmonics", levels(0.5, 1), 1);
    module.setParameter("frequency", 200, 1);
    module.setParameter("brightness", 0, 2);
    module.setParameter("even", 0.5, 2);

    expect(tilt(1).gain.events).toContainEqual({ type: "setTarget", value: 0.5, time: 1 });
    expect(harmonic(2).frequency.events.at(-1)).toEqual({ type: "setTarget", value: 400, time: 1 });
    expect(tilt(2).gain.events.at(-1)).toEqual({ type: "setTarget", value: 1 - 1 / 15, time: 2 });
    expect(parity(2)?.gain.events.at(-1)).toEqual({ type: "setTarget", value: 0.5, time: 2 });
    expect(output().gain.events.at(-1)).toEqual({
      type: "setTarget",
      value: 1 / 1.5,
      time: 1,
    });
  });

  it("rejects a param it does not have", () => {
    expect(() => create().setParameter("waveform", "sine", 0)).toThrow(/Harmonics/);
  });

  it("stops every source when removed", () => {
    const module = create();

    module.dispose();

    expect(context.oscillators.every((oscillator) => oscillator.stopped)).toBe(true);
    expect(context.constantSources.every((source) => source.stopped)).toBe(true);
  });
});
