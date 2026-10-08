import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STOP } from "../../../patch/patterns";
import { defaultParams } from "../../../patch/registry";
import type { Params } from "../../../patch/types";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { Transport } from "../../Transport";
import { DrumsModule } from "./DrumsModule";

let context: FakeAudioContext;
let transport: Transport;
let modules: DrumsModule[];

const row = (steps: string) => `${steps} ${Array(16 - steps.split(" ").length).fill("-").join(" ")}`.trim();

const create = (params: Partial<Params> = {}, patterns = {}) => {
  const drums = new DrumsModule(
    context.asAudioContext(),
    {
      ...defaultParams("drums"),
      division: "1/8",
      gate: 0.5,
      kick: row("x - x -"),
      snare: row("- x - -"),
      hat: row("- - - -"),
      open: row("- - - -"),
      accent: row("- - x -"),
      ...params,
    },
    transport,
    patterns,
  );
  modules.push(drums);
  return drums;
};

const listen = (drums: DrumsModule, port: string) => {
  const heard = { on: [] as number[], off: [] as number[] };
  drums.getTriggerOutput(port)!.connect({ gateOn: (time) => heard.on.push(time), gateOff: (time) => heard.off.push(time) });
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

describe("DrumsModule", () => {
  it("opens the gate of each row on its steps, for the Gate of a step", () => {
    const drums = create();
    const kick = listen(drums, "kick");
    const snare = listen(drums, "snare");
    const hat = listen(drums, "hat");

    // Steps every 0.25 s: the kick on 0 and 2, the snare on 1.
    advance(0.9);

    expect(kick).toEqual({ on: [0, 0.5], off: [0.125, 0.625] });
    expect(snare).toEqual({ on: [0.25], off: [0.375] });
    expect(hat).toEqual({ on: [], off: [] });
  });

  it("plays a step with retrigs that many times within it, each for the Gate of its part", () => {
    const drums = create({ kick: row("x2 - x4 -"), snare: row("- - - -") });
    const kick = listen(drums, "kick");

    advance(0.9);

    expect(kick).toEqual({ on: [0, 0.125, 0.5, 0.5625, 0.625, 0.6875], off: [0.0625, 0.1875, 0.53125, 0.59375, 0.65625, 0.71875] });
  });

  it("opens the gates of the claps, the rims and the toms on their steps too", () => {
    const drums = create({ clap: row("- x - -"), rim: row("x - - -"), lowtom: row("- - x -"), hightom: row("- - - x") });
    const heard = ["clap", "rim", "lowtom", "hightom"].map((port) => listen(drums, port).on);

    advance(0.9);

    expect(heard).toEqual([[0.25], [0], [0.5], [0.75]]);
  });

  it("outputs 1 on its accent out on the accented steps, and 0 on the others", () => {
    create();
    const accent = context.constantSources[0];

    advance(0.9);

    expect(accent.started).toBe(true);
    expect(accent.offset.events).toEqual([
      { type: "setValue", value: 0, time: 0 },
      { type: "setValue", value: 0, time: 0.25 },
      { type: "setValue", value: 1, time: 0.5 },
      { type: "setValue", value: 0, time: 0.75 },
    ]);
  });

  it("loops over the first Length steps, and tells which one plays", () => {
    const drums = create({ length: 2 });
    const kick = listen(drums, "kick");

    advance(0.9);

    expect(kick.on).toEqual([0, 0.5]);
    expect(drums.getPosition()).toBe(1);
  });

  it("picks up new rows from the next step", () => {
    const drums = create();
    const hat = listen(drums, "hat");

    drums.setParameter("hat", row("x x x x"));
    advance(0.6);

    expect(hat.on).toEqual([0, 0.25, 0.5]);
  });

  it("plays the pattern launched, rows and all", () => {
    const every = row("x x x x x x x x x x x x x x x x");
    const pattern = { length: 16, kick: row("- - - -"), snare: every, hat: row("- -"), open: row("- -"), accent: row("- -") };
    const drums = create({ launch: "now" }, { A2: pattern, A3: pattern, A4: pattern });
    const snare = listen(drums, "snare");
    advance(0.3);

    drums.launchPattern("A2");
    advance(0.5);

    expect(snare.on).toEqual([0.25, 0.5, 0.75]);
    expect(drums.getPattern()).toEqual({ playing: "A2" });
  });

  it("waits for the next bar when launched for it, whatever its own launch", () => {
    const every = row("x x x x x x x x x x x x x x x x");
    const pattern = { length: 16, kick: row("- - - -"), snare: every, hat: row("- -"), open: row("- -"), accent: row("- -") };
    const drums = create({ launch: "now" }, { A2: pattern, A3: pattern, A4: pattern });
    const snare = listen(drums, "snare");
    advance(0.3);

    drums.launchPattern("A2", "bar");
    advance(1.6);
    expect(drums.getPattern()).toEqual({ playing: "A1", queued: "A2" });

    advance(0.3);
    expect(drums.getPattern()).toEqual({ playing: "A2" });
    expect(snare.on.slice(-2)).toEqual([2, 2.25]);
  });

  it("waits for the next bar of the meter when launched for it", () => {
    transport.setMeter([3]);
    const every = row("x x x x x x x x x x x x x x x x");
    const pattern = { length: 16, kick: row("- - - -"), snare: every, hat: row("- -"), open: row("- -"), accent: row("- -") };
    const drums = create({ launch: "now" }, { A2: pattern, A3: pattern, A4: pattern });
    const snare = listen(drums, "snare");
    advance(0.3);

    drums.launchPattern("A2", "bar");
    advance(1);
    expect(drums.getPattern()).toEqual({ playing: "A1", queued: "A2" });

    advance(0.4);
    expect(drums.getPattern()).toEqual({ playing: "A2" });
    expect(snare.on.slice(-2)).toEqual([1.5, 1.75]);
  });

  it("starts a pattern launched for a place from there, not from where the grid is", () => {
    const pattern = { length: 16, kick: row("- -"), snare: row("x"), hat: row("- -"), open: row("- -"), accent: row("- -") };
    const drums = create({ launch: "now", snare: row("- -") }, { A2: pattern, A3: pattern, A4: pattern });
    const snare = listen(drums, "snare");
    advance(0.3);

    drums.launchPattern("A2", "bar", 0);
    advance(2);

    // Step 8 of the grid is step 0 of B, two bars long.
    expect(snare.on).toEqual([2]);
  });

  it("stops on the bar a stop is launched for, and plays again once a pattern is launched", () => {
    const drums = create({ launch: "now", snare: row("x x x x x x x x x x x x x x x x") });
    const snare = listen(drums, "snare");
    advance(0.3);

    drums.launchPattern(STOP, "bar");
    advance(2.2);
    expect(drums.getPattern()).toEqual({ playing: "A1", stopped: true });
    expect(snare.on.filter((time) => time >= 2)).toEqual([]);

    drums.launchPattern("A1");
    advance(0.3);
    expect(drums.getPattern()).toEqual({ playing: "A1" });
    expect(snare.on.filter((time) => time >= 2)).not.toEqual([]);
  });

  it("has no gate but those of its rows", () => {
    expect(create().getTriggerOutput("pitch")).toBeUndefined();
  });

  it("rejects unknown params", () => {
    expect(() => create().setParameter("steps", "x")).toThrow(/Drums/);
  });

  it("stops the clock and the accent on dispose", () => {
    const drums = create();
    const kick = listen(drums, "kick");
    advance(0.1);

    drums.dispose();
    advance(1);

    expect(kick.on).toEqual([0]);
    expect(context.constantSources[0].stopped).toBe(true);
  });
});

describe("DrumsModule steps marked by gates", () => {
  it("plays a step on each gate into clock, its drums open as long as that gate, and none on the grid", () => {
    const drums = create({ division: "gate" });
    const kick = listen(drums, "kick");
    const snare = listen(drums, "snare");
    const clock = drums.getTriggerInput("clock")!;
    advance(1);

    clock.gateOn(2);
    clock.gateOff(2.2);
    clock.gateOn(3);
    clock.gateOff(3.05);
    clock.gateOn(4);
    clock.gateOff(4.1);

    expect(kick).toEqual({ on: [2, 4], off: [2.2, 4.1] });
    expect(snare).toEqual({ on: [3], off: [3.05] });
    expect(context.constantSources[0].offset.events.slice(-3).map((event) => ("value" in event ? event.value : 0))).toEqual([0, 0, 1]);
  });

  it("plays a step with retrigs once on a gate, as it does not know how long the step lasts", () => {
    const drums = create({ division: "gate", kick: row("x3 - - -") });
    const kick = listen(drums, "kick");
    advance(1);

    drums.getTriggerInput("clock")!.gateOn(2);
    drums.getTriggerInput("clock")!.gateOff(2.2);

    expect(kick).toEqual({ on: [2], off: [2.2] });
  });

  it("closes the gates it opened when it goes back to the grid", () => {
    const drums = create({ division: "gate" });
    const kick = listen(drums, "kick");
    context.currentTime = 1;
    drums.getTriggerInput("clock")!.gateOn(1);

    drums.setParameter("division", "1/8");

    expect(kick).toEqual({ on: [1], off: [1] });
  });
});

describe("DrumsModule chances", () => {
  const withRolls = (params: Partial<Params>, rolls: number[]) => {
    const random = vi.fn(() => rolls.shift() ?? 0.99);
    const drums = new DrumsModule(
      context.asAudioContext(),
      {
        ...defaultParams("drums"),
        division: "1/8",
        gate: 0.5,
        kick: row("x - x -"),
        snare: row("- - - -"),
        hat: row("- - - -"),
        open: row("- - - -"),
        accent: row("- - - -"),
        ...params,
      },
      transport,
      {},
      random,
    );
    modules.push(drums);
    return { drums, random };
  };

  it("sounds a step with a chance only when the dice fall under it, each row on its own", () => {
    const { drums } = withRolls({ kick: row("x x x -"), hat: row("x?25 x?25 x?25 -") }, [0.1, 0.6, 0.2]);
    const kick = listen(drums, "kick");
    const hat = listen(drums, "hat");

    advance(0.9);

    expect(kick.on).toEqual([0, 0.25, 0.5]);
    expect(hat.on).toEqual([0, 0.5]);
  });

  it("rolls no dice for the steps that always sound", () => {
    const { random } = withRolls({}, []);

    advance(0.9);

    expect(random).not.toHaveBeenCalled();
  });

  it("accents a step with a chance on the accent row only when the dice fall under it", () => {
    withRolls({ accent: row("x?50 x?50 - -") }, [0.8, 0.2]);
    const accent = context.constantSources[0];

    advance(0.4);

    expect(accent.offset.events.map((event) => ("value" in event ? event.value : undefined))).toEqual([0, 1]);
  });

  it("leaves a step with a chance silent on the gates into clock too", () => {
    const { drums } = withRolls({ division: "gate", kick: row("x?50 x -") }, [0.9]);
    const kick = listen(drums, "kick");

    drums.getTriggerInput("clock")!.gateOn(0);
    drums.getTriggerInput("clock")!.gateOff(0.1);
    drums.getTriggerInput("clock")!.gateOn(1);
    drums.getTriggerInput("clock")!.gateOff(1.1);

    expect(kick.on).toEqual([1]);
  });
});
