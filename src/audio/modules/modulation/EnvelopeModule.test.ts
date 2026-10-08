import { beforeEach, describe, expect, it } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { EnvelopeModule } from "./EnvelopeModule";

let context: FakeAudioContext;
let envelope: EnvelopeModule;

beforeEach(() => {
  context = new FakeAudioContext();
  envelope = new EnvelopeModule(context.asAudioContext(), {
    ...defaultParams("envelope"),
    attack: 0.1,
    decay: 0.2,
    sustain: 0.5,
    release: 1,
  });
});

const offset = () => context.constantSources[0].offset;

describe("EnvelopeModule", () => {
  it("starts a silent constant source", () => {
    expect(context.constantSources[0].started).toBe(true);
    expect(offset().value).toBe(0);
  });

  it("outputs the constant source", () => {
    expect(envelope.getAudioOutput("out")).toBe(context.constantSources[0]);
  });

  it("runs attack and decay on gate on", () => {
    envelope.getTriggerInput("gate")!.gateOn(2);

    expect(offset().events).toEqual([
      { type: "cancel", time: 2 },
      { type: "linearRamp", value: 0, time: 2 },
      { type: "linearRamp", value: 1, time: 2.1 },
      { type: "linearRamp", value: 0.5, time: expect.closeTo(2.3) },
    ]);
  });

  it("runs the release on gate off", () => {
    envelope.getTriggerInput("gate")!.gateOn(2);
    offset().events.length = 0;

    envelope.getTriggerInput("gate")!.gateOff(3);

    expect(offset().events).toEqual([
      { type: "cancel", time: 3 },
      { type: "linearRamp", value: 0.5, time: 3 },
      { type: "linearRamp", value: 0, time: 4 },
    ]);
  });

  it("releases from the level it will have at a gate scheduled ahead of time", () => {
    // Both gates are planned at once, before the attack has even started.
    envelope.getTriggerInput("gate")!.gateOn(2);
    envelope.getTriggerInput("gate")!.gateOff(2.05);

    expect(offset().events.slice(-3)).toEqual([
      { type: "cancel", time: 2.05 },
      { type: "linearRamp", value: expect.closeTo(0.5), time: 2.05 },
      { type: "linearRamp", value: 0, time: 3.05 },
    ]);
  });

  it("restarts the attack from the level in the middle of a planned decay", () => {
    envelope.getTriggerInput("gate")!.gateOn(0);
    envelope.getTriggerInput("gate")!.gateOn(0.2);

    // At 0.2 the decay (1 → 0.5 between 0.1 and 0.3) is halfway: 0.75.
    expect(offset().events.slice(-4, -2)).toEqual([
      { type: "cancel", time: 0.2 },
      { type: "linearRamp", value: expect.closeTo(0.75), time: 0.2 },
    ]);
  });

  it("releases from the sustain level once the decay is over", () => {
    envelope.getTriggerInput("gate")!.gateOn(0);
    envelope.getTriggerInput("gate")!.gateOff(10);
    envelope.getTriggerInput("gate")!.gateOn(20);

    expect(offset().events.slice(-7, -4)).toEqual([
      { type: "cancel", time: 10 },
      { type: "linearRamp", value: 0.5, time: 10 },
      { type: "linearRamp", value: 0, time: 11 },
    ]);
    expect(offset().events.at(-3)).toEqual({ type: "linearRamp", value: 0, time: 20 });
  });

  it("uses updated times on the next gate", () => {
    envelope.setParameter("attack", 0.5);
    envelope.getTriggerInput("gate")!.gateOn(0);

    expect(offset().events[2]).toEqual({ type: "linearRamp", value: 1, time: 0.5 });
  });

  it("has no other trigger inputs", () => {
    expect(envelope.getTriggerInput("nope")).toBeUndefined();
  });

  it("throws on an unknown parameter", () => {
    expect(() => envelope.setParameter("amount", 1)).toThrow();
  });

  it("stops on dispose", () => {
    envelope.dispose();

    expect(context.constantSources[0].stopped).toBe(true);
    expect(context.constantSources[0].outputs.size).toBe(0);
  });

  describe("with an exponential curve", () => {
    beforeEach(() => envelope.setParameter("curve", "exp"));

    /** The level the envelope plans for `time`, from the ramp that ends there. */
    const plannedAt = (time: number) => {
      const ramp = offset().events.find((event) => event.type === "linearRamp" && Math.abs(event.time - time) < 1e-9);
      return ramp && "value" in ramp ? ramp.value : undefined;
    };

    it("moves fast at first and slows down as it nears each level, reaching it on time", () => {
      envelope.getTriggerInput("gate")!.gateOn(0);

      expect(plannedAt(0.05)).toBeCloseTo(0.924, 3);
      expect(plannedAt(0.1)).toBe(1);
      expect(plannedAt(0.2)).toBeCloseTo(0.538, 3);
      expect(plannedAt(0.3)).toBe(0.5);
    });

    it("releases the same way, down to silence at the end of the release", () => {
      envelope.getTriggerInput("gate")!.gateOn(0);
      envelope.getTriggerInput("gate")!.gateOff(10);

      expect(plannedAt(10.5)).toBeCloseTo(0.038, 3);
      expect(offset().events.at(-1)).toEqual({ type: "linearRamp", value: 0, time: 11 });
    });

    it("restarts the attack from the level on the curve", () => {
      envelope.getTriggerInput("gate")!.gateOn(0);
      envelope.getTriggerInput("gate")!.gateOn(0.2);

      const events = offset().events;
      const cancel = events.findIndex((event) => event.type === "cancel" && event.time === 0.2);
      expect(events[cancel + 1]).toEqual({ type: "linearRamp", value: expect.closeTo(0.538, 3), time: 0.2 });
    });

    it("goes back to straight lines on the next gate", () => {
      envelope.setParameter("curve", "linear");
      envelope.getTriggerInput("gate")!.gateOn(0);

      expect(offset().events.filter((event) => event.type === "linearRamp")).toHaveLength(3);
    });
  });

  describe("with a clap curve", () => {
    beforeEach(() => envelope.setParameter("curve", "clap"));

    const plannedAt = (time: number) => {
      const ramp = offset().events.find((event) => event.type === "linearRamp" && Math.abs(event.time - time) < 1e-9);
      return ramp && "value" in ramp ? ramp.value : undefined;
    };

    it("claps three short bursts a few milliseconds apart before the attack", () => {
      envelope.getTriggerInput("gate")!.gateOn(0);

      expect([0.001, 0.011, 0.012, 0.02, 0.021, 0.032].map(plannedAt)).toEqual([1, 0, 1, 0, 1, 0]);
      expect(plannedAt(0.132)).toBe(1);
      expect(plannedAt(0.332)).toBe(0.5);
    });

    it("spaces the bursts by the spread", () => {
      envelope.setParameter("spread", 0.02);
      envelope.getTriggerInput("gate")!.gateOn(0);

      expect([0.001, 0.022, 0.023, 0.04, 0.041, 0.064].map(plannedAt)).toEqual([1, 0, 1, 0, 1, 0]);
    });

    it("spreads the bursts 10 milliseconds apart in a patch saved before the spread", () => {
      const { spread: _, ...params } = defaultParams("envelope");
      context = new FakeAudioContext();
      envelope = new EnvelopeModule(context.asAudioContext(), { ...params, curve: "clap" });
      envelope.getTriggerInput("gate")!.gateOn(0);

      expect(plannedAt(0.032)).toBe(0);
    });

    it("lets each burst die away along the curve", () => {
      envelope.getTriggerInput("gate")!.gateOn(0);

      expect(plannedAt(0.006)).toBeCloseTo(0.076, 3);
    });

    it("draws the attack and the decay along the curve", () => {
      envelope.getTriggerInput("gate")!.gateOn(0);

      expect(plannedAt(0.082)).toBeCloseTo(0.924, 3);
    });

    it("releases from the level of the burst the gate closes on", () => {
      envelope.getTriggerInput("gate")!.gateOn(0);
      envelope.getTriggerInput("gate")!.gateOff(0.001);

      expect(offset().events.find((event) => event.type === "cancel" && event.time === 0.001)).toBeDefined();
      expect(plannedAt(0.001)).toBe(1);
      expect(offset().events.at(-1)).toEqual({ type: "linearRamp", value: 0, time: 1.001 });
    });
  });
});
