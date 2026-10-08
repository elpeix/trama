import { beforeEach, describe, expect, it } from "vitest";
import { defaultParams } from "../../../patch/registry";
import type { Params } from "../../../patch/types";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { Transport } from "../../Transport";
import { LfoModule } from "./LfoModule";

let context: FakeAudioContext;
let transport: Transport;

const create = (params: Partial<Params> = {}) =>
  new LfoModule(
    context.asAudioContext(),
    { ...defaultParams("lfo"), waveform: "triangle", rate: 3, ...params },
    transport,
  );

/** The oscillators that will still be sounding after `time`. */
const playingAfter = (time: number) =>
  context.oscillators.filter((oscillator) => oscillator.stopTime === undefined || oscillator.stopTime > time);

beforeEach(() => {
  context = new FakeAudioContext();
  transport = new Transport(context.asAudioContext());
});

describe("LfoModule", () => {
  describe("free", () => {
    it("outputs an oscillator running at the rate", () => {
      const lfo = create();

      const [oscillator] = context.oscillators;
      expect(oscillator.type).toBe("triangle");
      expect(oscillator.frequency.value).toBe(3);
      expect(oscillator.startTime).toBe(0);
      expect(oscillator.outputs.has(lfo.getAudioOutput("out")! as never)).toBe(true);
    });

    it("glides the rate", () => {
      const lfo = create();

      lfo.setParameter("rate", 5, 1);

      expect(context.oscillators[0].frequency.events).toEqual([{ type: "setTarget", value: 5, time: 1 }]);
    });

    it("ignores tempo changes", () => {
      create();

      transport.setTempo(90);

      expect(context.oscillators).toHaveLength(1);
      expect(context.oscillators[0].frequency.value).toBe(3);
    });
  });

  describe("synced", () => {
    it("runs one cycle per division of the tempo", () => {
      create({ sync: "1/4" });

      // 120 BPM: a quarter note lasts 0.5 s, so 2 Hz.
      expect(playingAfter(0).map((oscillator) => oscillator.frequency.value)).toEqual([2]);
    });

    it("starts each new alignment on a boundary of the grid", () => {
      context.currentTime = 1.3;

      create({ sync: "1 bar" });

      // A bar at 120 BPM is 2 s: the next one starts at 2 s.
      const [first, aligned] = context.oscillators;
      expect(first.stopTime).toBe(2);
      expect(aligned.startTime).toBe(2);
      expect(aligned.frequency.value).toBe(0.5);
    });

    it("runs one cycle per bar of the meter, and lines up on its bars", () => {
      transport.setMeter([3]);
      context.currentTime = 1.3;

      create({ sync: "1 bar" });

      const [first, aligned] = context.oscillators;
      expect(first.stopTime).toBe(1.5);
      expect(aligned.startTime).toBe(1.5);
      expect(aligned.frequency.value).toBe(2 / 3);
    });

    it("follows a change of meter and lines up again", () => {
      create({ sync: "1 bar" });
      context.currentTime = 0.3;

      transport.setMeter([3, 2]);

      const aligned = context.oscillators.at(-1)!;
      expect(aligned.startTime).toBe(2.5);
      expect(aligned.frequency.value).toBe(0.4);
    });

    it("follows the tempo and lines up again", () => {
      create({ sync: "1/8" });
      context.currentTime = 0.3;

      transport.setTempo(60);

      // At 0.3 s the transport is at beat 0.6; the next eighth is beat 1.0, 0.4 s later at 60 BPM.
      const aligned = context.oscillators.at(-1)!;
      expect(aligned.startTime).toBeCloseTo(0.7);
      expect(aligned.frequency.value).toBe(2);
      expect(playingAfter(0.7)).toEqual([aligned]);
    });

    it("lines up again when the transport restarts", () => {
      create({ sync: "1/4" });
      context.currentTime = 7.25;

      transport.restart(7.25);

      expect(context.oscillators.at(-1)!.startTime).toBe(7.25);
      expect(playingAfter(7.25)).toEqual([context.oscillators.at(-1)]);
    });

    it("switches between free and synced", () => {
      const lfo = create();

      lfo.setParameter("sync", "1/16", 0);
      expect(playingAfter(0).map((oscillator) => oscillator.frequency.value)).toEqual([8]);

      lfo.setParameter("sync", "free", 1);
      expect(context.oscillators.at(-1)!.frequency.events.at(-1)).toEqual({ type: "setTarget", value: 3, time: 1 });
    });

    it("ignores the Rate while synced", () => {
      const lfo = create({ sync: "1/4" });
      const before = context.oscillators.map((oscillator) => oscillator.frequency.events.length);

      lfo.setParameter("rate", 10, 0);

      expect(context.oscillators.map((oscillator) => oscillator.frequency.events.length)).toEqual(before);
    });
  });

  it("sets the waveform of every oscillator", () => {
    const lfo = create({ sync: "1/4" });

    lfo.setParameter("waveform", "square", 0);

    expect(context.oscillators.every((oscillator) => oscillator.type === "square")).toBe(true);
  });

  it("throws on an unknown parameter", () => {
    expect(() => create().setParameter("depth", 1, 0)).toThrow();
  });

  it("stops listening to the transport and stops its oscillators on dispose", () => {
    const lfo = create({ sync: "1/4" });

    lfo.dispose();
    transport.setTempo(90);

    expect(context.oscillators.every((oscillator) => oscillator.stopped)).toBe(true);
    expect(context.oscillators.every((oscillator) => oscillator.outputs.size === 0)).toBe(true);
    expect(context.oscillators).toHaveLength(2);
  });
});
