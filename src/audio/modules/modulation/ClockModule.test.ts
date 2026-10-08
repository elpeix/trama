import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { Transport } from "../../Transport";
import type { TriggerInput } from "../AudioModule";
import { ClockModule } from "./ClockModule";

let context: FakeAudioContext;
let transport: Transport;
let modules: ClockModule[];

const create = (gate = 0.5) => {
  const clock = new ClockModule(context.asAudioContext(), { ...defaultParams("clock"), gate }, transport);
  modules.push(clock);
  return clock;
};

const listen = (clock: ClockModule, port: string) => {
  const heard = { on: [] as number[], off: [] as number[] };
  clock.getTriggerOutput(port)!.connect({ gateOn: (time) => heard.on.push(time), gateOff: (time) => heard.off.push(time) });
  return heard;
};

const advance = (seconds: number) => {
  const end = Math.round((context.currentTime + seconds) * 1000);
  for (let ms = Math.round(context.currentTime * 1000) + 5; ms <= end; ms += 5) {
    context.currentTime = ms / 1000;
    vi.advanceTimersByTime(5);
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  context = new FakeAudioContext();
  transport = new Transport(context.asAudioContext());
  modules = [];
});

afterEach(() => {
  modules.forEach((module) => module.dispose());
  vi.useRealTimers();
});

describe("ClockModule", () => {
  it("opens the gate of each division on its steps of the grid, for the Gate of a step", () => {
    const clock = create();
    const bar = listen(clock, "bar");
    const quarter = listen(clock, "quarter");
    const thirtySecond = listen(clock, "thirtysecond");

    // 120 BPM: a beat is 0.5 s.
    advance(1.9);

    expect(bar).toEqual({ on: [0], off: [1] });
    expect(quarter).toEqual({ on: [0, 0.5, 1, 1.5], off: [0.25, 0.75, 1.25, 1.75] });
    expect(thirtySecond.on.slice(0, 3)).toEqual([0, 0.0625, 0.125]);
    expect(thirtySecond.off[0]).toBeCloseTo(0.03125);
  });

  it("holds each gate open for the Gate of its step", () => {
    const clock = create(0.2);
    const half = listen(clock, "half");

    advance(1.9);

    expect(half).toEqual({ on: [0, 1], off: [0.2, 1.2] });
  });

  it("follows a change of Gate from the next step", () => {
    const clock = create();
    const quarter = listen(clock, "quarter");
    advance(0.3);

    clock.setParameter("gate", 0.9);
    advance(0.5);

    expect(quarter.off).toEqual([0.25, 0.95]);
  });

  describe("with gates coming in", () => {
    const pulse = (input: TriggerInput, time: number) => {
      input.gateOn(time);
      input.gateOff(time + 0.1);
    };

    it("lets through one gate of every 1, 2, 3, 4, 8 and 16, from the first one", () => {
      const clock = create();
      const heard = Object.fromEntries(
        ["thirtysecond", "sixteenth", "eighth", "quarter", "half", "bar"].map((port) => [port, listen(clock, port)]),
      );

      const input = clock.openTrigger("gate", "c")!;
      for (let gate = 0; gate < 9; gate++) {
        pulse(input, gate);
      }

      expect(heard.thirtysecond.on).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(heard.sixteenth.on).toEqual([0, 2, 4, 6, 8]);
      expect(heard.eighth.on).toEqual([0, 3, 6]);
      expect(heard.quarter.on).toEqual([0, 4, 8]);
      expect(heard.half.on).toEqual([0, 8]);
      expect(heard.bar.on).toEqual([0]);
      expect(heard.sixteenth.off).toEqual([0.1, 2.1, 4.1, 6.1, 8.1]);
    });

    it("stops following the grid while a cable brings them", () => {
      const clock = create();
      const quarter = listen(clock, "quarter");
      clock.openTrigger("gate", "c");

      advance(1.9);

      expect(quarter.on).toEqual([]);
    });

    it("goes back to the grid, counting again, once the last cable is gone", () => {
      const clock = create();
      const input = clock.openTrigger("gate", "a")!;
      clock.openTrigger("gate", "b");
      pulse(input, 0);
      clock.closeTrigger("a");
      pulse(input, 1);

      clock.closeTrigger("b");
      const eighth = listen(clock, "eighth");
      advance(0.3);
      pulse(clock.openTrigger("gate", "c")!, 5);

      expect(eighth.on).toEqual([0, 0.25, 5]);
    });

    it("opens no trigger but its gate", () => {
      expect(create().openTrigger("nope", "c")).toBeUndefined();
    });
  });

  it("throws on an unknown parameter", () => {
    expect(() => create().setParameter("nope", 1)).toThrow();
  });

  it("stops on dispose", () => {
    const clock = create();
    const quarter = listen(clock, "quarter");
    advance(0.3);

    clock.dispose();
    advance(1);

    expect(quarter.on).toEqual([0]);
  });
});
