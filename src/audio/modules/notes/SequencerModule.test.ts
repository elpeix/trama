import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STOP } from "../../../patch/patterns";
import { defaultParams } from "../../../patch/registry";
import type { Params } from "../../../patch/types";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { Transport } from "../../Transport";
import { SequencerModule } from "./SequencerModule";

let context: FakeAudioContext;
let transport: Transport;
let gates: { on: number[]; off: number[] };
let modules: SequencerModule[];

const STEPS = "C4 - E4 G4 - - - - - - - - - - - -";

const create = (params: Partial<Params> = {}) => {
  const seq = new SequencerModule(context.asAudioContext(), {
    ...defaultParams("sequencer"),
    division: "1/8",
    gate: 0.5,
    steps: STEPS,
    ...params,
  }, transport);
  seq.getTriggerOutput("gate")!.connect({
    gateOn: (time) => gates.on.push(time),
    gateOff: (time) => gates.off.push(time),
  });
  modules.push(seq);
  return seq;
};

const pitches = () => context.constantSources[0].offset.events.map((event) => ("value" in event ? event.value : 0));

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
  gates = { on: [], off: [] };
  modules = [];
});

afterEach(() => {
  modules.forEach((module) => module.dispose());
  vi.useRealTimers();
});

describe("SequencerModule", () => {
  it("outputs a started pitch source and a gate", () => {
    const seq = create();

    expect(seq.getAudioOutput("pitch")).toBe(context.constantSources[0]);
    expect(context.constantSources[0].started).toBe(true);
    expect(seq.getTriggerOutput("gate")).toBeDefined();
  });

  it("plays the notes of its steps and stays quiet on rests", () => {
    create();

    // Steps every 0.25 s: C4 at 0, a rest, E4 at 0.5, G4 at 0.75.
    advance(1);

    expect(gates.on).toEqual([0, 0.5, 0.75]);
    expect(gates.off).toEqual([0.125, 0.625, 0.875]);
    expect(pitches()).toEqual([0, 4 / 12, 7 / 12]);
  });

  it("loops over the first Length steps", () => {
    create({ length: 4 });

    advance(1.1);

    expect(gates.on).toEqual([0, 0.5, 0.75, 1]);
  });

  it("shifts by the octave param", () => {
    create({ octave: -2 });

    advance(0.1);

    expect(pitches()).toEqual([-2]);
  });

  it("tells which step is playing, rests included", () => {
    const seq = create();

    expect(seq.getPosition()).toBeUndefined();
    advance(0.1);
    expect(seq.getPosition()).toBe(0);
    advance(0.2);
    expect(seq.getPosition()).toBe(1);
    advance(0.25);
    expect(seq.getPosition()).toBe(2);
  });

  it("picks up new steps from the next one", () => {
    const seq = create({ length: 2 });
    advance(0.05);

    seq.setParameter("steps", "D4 D4 - - - - - - - - - - - - - -");
    advance(0.6);

    expect(pitches()).toEqual([0, 2 / 12, 2 / 12]);
  });

  it("follows tempo changes of the transport", () => {
    create();
    advance(0.05);

    transport.setTempo(60);
    advance(2);

    // At 0.05 s the transport is at beat 0.1; from there eighths last 0.5 s. Step 1 is a rest.
    expect(gates.on).toEqual([0, expect.closeTo(0.95), expect.closeTo(1.45)]);
  });

  describe("keys", () => {
    it("follows the last key pressed, from C4, and keeps it once the key is let go", () => {
      const seq = create({ keys: "transpose" });

      seq.noteOn(62);
      seq.noteOff();
      advance(0.1);

      expect(pitches()).toEqual([2 / 12]);
      expect(seq.getKeyTranspose()).toBe(2);
    });

    it("counts the octave of the key, and the octave param too", () => {
      const seq = create({ keys: "transpose", octave: -1 });

      seq.noteOn(48 + 7);
      advance(0.1);

      expect(pitches()).toEqual([(7 - 12 - 12) / 12]);
    });

    it("ignores the keys while its keys param is off", () => {
      const seq = create();

      seq.noteOn(62);
      advance(0.1);

      expect(pitches()).toEqual([0]);
      expect(seq.getKeyTranspose()).toBe(0);
    });

    it("keeps the last key while off, and follows it once turned on", () => {
      const seq = create();
      seq.noteOn(64);

      seq.setParameter("keys", "transpose");

      expect(seq.getKeyTranspose()).toBe(4);
    });
  });

  it("rejects unknown params", () => {
    expect(() => create().setParameter("swing", 1)).toThrow(/Seq/);
  });

  it("stops the clock and the source on dispose", () => {
    const seq = create();
    advance(0.1);

    seq.dispose();
    advance(1);

    expect(gates.on).toEqual([0]);
    expect(context.constantSources[0].stopped).toBe(true);
  });
});

describe("SequencerModule patterns", () => {
  const D4S = Array(16).fill("D4").join(" ");
  const createWithPatterns = (params: Partial<Params> = {}, steps = D4S) => {
    const all: Params = { ...defaultParams("sequencer"), division: "1/8", gate: 0.5, steps: STEPS, ...params };
    const pattern = { length: all.length, root: all.root, scale: all.scale };
    const seq = new SequencerModule(context.asAudioContext(), all, transport, {
      A2: { ...pattern, steps },
      A3: { ...pattern, steps: STEPS },
      A4: { ...pattern, steps: STEPS },
    });
    seq.getTriggerOutput("gate")!.connect({
      gateOn: (time) => gates.on.push(time),
      gateOff: (time) => gates.off.push(time),
    });
    modules.push(seq);
    return seq;
  };

  it("plays the pattern launched from the next step with now, keeping its place on the grid", () => {
    const seq = createWithPatterns({ launch: "now" });
    advance(0.3);

    seq.launchPattern("A2");
    expect(seq.getPattern()).toEqual({ playing: "A1", queued: "A2" });
    advance(0.7);

    expect(gates.on).toEqual([0, 0.5, 0.75, 1]);
    expect(pitches()).toEqual([0, 2 / 12, 2 / 12, 2 / 12]);
    expect(seq.getPattern()).toEqual({ playing: "A2" });
  });

  it("waits for the next bar with bar", () => {
    const seq = createWithPatterns({ launch: "bar" });
    advance(0.3);

    seq.launchPattern("A2");
    advance(1.6);
    expect(seq.getPattern()).toEqual({ playing: "A1", queued: "A2" });
    advance(0.4);

    expect(gates.on).toEqual([0, 0.5, 0.75, 2, 2.25]);
    expect(pitches()).toEqual([0, 4 / 12, 7 / 12, 2 / 12, 2 / 12]);
  });

  it("waits for the next bar of the meter with bar", () => {
    transport.setMeter([3]);
    const seq = createWithPatterns({ launch: "bar" });
    advance(0.3);

    seq.launchPattern("A2");
    advance(1);
    expect(seq.getPattern()).toEqual({ playing: "A1", queued: "A2" });
    advance(0.4);

    expect(seq.getPattern()).toEqual({ playing: "A2" });
    expect(gates.on.filter((time) => time >= 1.5)).toEqual([1.5, 1.75]);
    expect(pitches().slice(-2)).toEqual([2 / 12, 2 / 12]);
  });

  it("starts a pattern launched for a place from there, not from where the grid is", () => {
    const seq = createWithPatterns({ launch: "bar", length: 16 }, "D4 - - - - - - - E4 - - - - - - -");
    advance(0.3);

    seq.launchPattern("A2", "bar", 0);
    advance(1.8);

    // Step 8 of the grid is step 0 of B, two bars long: D4, not E4.
    expect(gates.on).toEqual([0, 0.5, 0.75, 2]);
    expect(pitches().at(-1)).toBe(2 / 12);
  });

  it("waits for the next bar when launched for it, whatever its own launch", () => {
    const seq = createWithPatterns({ launch: "now" });
    advance(0.3);

    seq.launchPattern("A2", "bar");
    advance(1.6);
    expect(seq.getPattern()).toEqual({ playing: "A1", queued: "A2" });
    advance(0.4);

    expect(gates.on).toEqual([0, 0.5, 0.75, 2, 2.25]);
    expect(pitches()).toEqual([0, 4 / 12, 7 / 12, 2 / 12, 2 / 12]);
  });

  it("waits for the pattern playing to start over with end", () => {
    const seq = createWithPatterns({ launch: "end", length: 4 });
    advance(0.3);

    seq.launchPattern("A2");
    advance(0.8);

    expect(gates.on).toEqual([0, 0.5, 0.75, 1]);
    expect(pitches()).toEqual([0, 4 / 12, 7 / 12, 2 / 12]);
  });

  it("stops on the bar a stop is launched for, and plays again once a pattern is launched", () => {
    const seq = createWithPatterns({ launch: "now", steps: D4S });
    advance(0.3);

    seq.launchPattern(STOP, "bar");
    advance(2.2);
    expect(seq.getPattern()).toEqual({ playing: "A1", stopped: true });
    expect(gates.on.filter((time) => time >= 2)).toEqual([]);

    seq.launchPattern("A1");
    advance(0.3);
    expect(seq.getPattern()).toEqual({ playing: "A1" });
    expect(gates.on.filter((time) => time >= 2)).not.toEqual([]);
  });

  it("plays the changes made to a pattern while another one plays", () => {
    const seq = createWithPatterns({ launch: "now" });
    seq.setPatternParameter("A2", "steps", Array(16).fill("F4").join(" "));

    seq.launchPattern("A2");
    advance(0.3);

    expect(pitches()).toEqual([5 / 12, 5 / 12]);
  });
});

describe("SequencerModule accents and ties", () => {
  const pitchEvents = () => context.constantSources[0].offset.events;

  it("glides into the note of a tied step, keeping the gate open", () => {
    create({ steps: "C4 _E4 - - - - - - - - - - - - - -", glide: 60 });

    advance(0.4);

    expect(gates.on).toEqual([0]);
    expect(gates.off).toEqual([0.375]);
    expect(pitchEvents()).toEqual([
      { type: "setValue", value: 0, time: 0 },
      { type: "setTarget", value: 4 / 12, time: 0.25 },
    ]);
  });

  it("jumps into the note of a tied step with no glide", () => {
    create({ steps: "C4 _E4 - - - - - - - - - - - - - -", glide: 0 });

    advance(0.4);

    expect(pitchEvents().at(-1)).toEqual({ type: "setValue", value: 4 / 12, time: 0.25 });
  });

  it("plays a tied step with a note after a rest as a note of its own", () => {
    create({ steps: "- _E4 - - - - - - - - - - - - - -" });

    advance(0.4);

    expect(gates.on).toEqual([0.25]);
  });

  const accents = () =>
    context.constantSources[1].offset.events.map((event) => ("value" in event ? [event.time, event.value] : []));

  it("holds a note through the steps tied to it, with no new gate, and applies the gate on the last one", () => {
    create({ steps: "C4 _ _ - E4 - - - - - - - - - - -" });

    advance(1.2);

    expect(gates.on).toEqual([0, 1]);
    expect(gates.off).toEqual([0.625, 1.125]);
    expect(pitches()).toEqual([0, 4 / 12]);
  });

  it("stops holding at the end of its length", () => {
    create({ steps: "C4 _ _ _ - - - - - - - - - - - -", length: 2 });

    advance(0.3);

    expect(gates.off).toEqual([0.375]);
  });

  it("leaves a tie after a rest silent", () => {
    create({ steps: "- _ E4 - - - - - - - - - - - - -" });

    advance(0.6);

    expect(gates.on).toEqual([0.5]);
  });

  it("outputs 1 on its accent out while an accented note plays, and 0 for the others", () => {
    const seq = create({ steps: "C4! - E4 - - - - - - - - - - - - -" });

    advance(0.6);

    expect(seq.getAudioOutput("accent")).toBe(context.constantSources[1]);
    expect(accents()).toEqual([
      [0, 1],
      [0.5, 0],
    ]);
  });
});

describe("SequencerModule notes", () => {
  const listen = (seq: SequencerModule) => {
    const heard: string[] = [];
    seq.getNoteOutput("notes")!.connect({
      noteOn: (note, time) => heard.push(`on ${note} ${time}`),
      noteOff: (note, time) => heard.push(`off ${note} ${time}`),
      allNotesOff: (time) => heard.push(`all ${time}`),
      glide: (from, to, time, seconds) => heard.push(`glide ${from}>${to} ${time} ${seconds}`),
    });
    return heard;
  };

  it("sends the note of each step for the voices of a subpatch, off after its gate", () => {
    const heard = listen(create({ steps: "C4 - E4 - - - - - - - - - - - - -", octave: -1 }));

    advance(0.9);

    expect(heard).toEqual(["on 48 0", "off 48 0.125", "on 52 0.5", "off 52 0.625"]);
  });

  it("plays an accented step as hard as a note goes, and the others as hard as the computer keys", () => {
    const seq = create({ steps: "C4! - E4 - - - - - - - - - - - - -" });
    const velocities: (number | undefined)[] = [];
    seq.getNoteOutput("notes")!.connect({
      noteOn: (_note, _time, velocity) => velocities.push(velocity),
      noteOff: () => {},
      allNotesOff: () => {},
    });

    advance(0.9);

    expect(velocities).toEqual([127, 100]);
  });

  it("sends a note off only once its moment comes, so no voice is freed early", () => {
    const heard = listen(create({ steps: "C4 _ _ _ - - - - - - - - - - - -" }));

    advance(0.3);

    expect(heard).toEqual(["on 60 0"]);
  });

  it("holds a note through the steps tied to it, glides it into a tied note, and ends it after the gate of the last one", () => {
    const heard = listen(create({ steps: "C4 _ _E4 - - - - - - - - - - - - -", glide: 60 }));

    advance(0.9);

    expect(heard).toEqual(["on 60 0", "glide 60>64 0.5 0.06", "off 64 0.625"]);
  });

  it("glides every note of a chord into the same note of the next one", () => {
    const heard = listen(create({ steps: "C4 _D4 - - - - - - - - - - - - - -", chord: "triad", root: "C", scale: "major", glide: 0 }));

    advance(0.5);

    expect(heard).toEqual([
      "on 60 0",
      "on 64 0",
      "on 67 0",
      "glide 60>62 0.25 0",
      "glide 64>65 0.25 0",
      "glide 67>69 0.25 0",
      "off 62 0.375",
      "off 65 0.375",
      "off 69 0.375",
    ]);
  });

  it("plays a tied note after a rest as a note of its own", () => {
    const heard = listen(create({ steps: "- _E4 - - - - - - - - - - - - - -" }));

    advance(0.5);

    expect(heard).toEqual(["on 64 0.25", "off 64 0.375"]);
  });

  it("plays a chord of the scale on each note with Chord", () => {
    const heard = listen(create({ steps: "D4 - - - - - - - - - - - - - - -", chord: "triad", root: "C", scale: "major" }));

    advance(0.2);

    expect(heard).toEqual(["on 62 0", "on 65 0", "on 69 0", "off 62 0.125", "off 65 0.125", "off 69 0.125"]);
  });

  it("keeps the pitch and the gate to the note of the step, chord or not", () => {
    create({ steps: "D4 - - - - - - - - - - - - - - -", chord: "triad", root: "C", scale: "major" });

    advance(0.2);

    expect(pitches()).toEqual([2 / 12]);
  });

  it("transposes the chord with the keys, after building it", () => {
    const seq = create({ steps: "C4 - - - - - - - - - - - - - - -", chord: "triad", root: "C", scale: "major", keys: "transpose" });
    const heard = listen(seq);
    seq.noteOn(62);

    advance(0.1);

    expect(heard.slice(0, 3)).toEqual(["on 62 0", "on 66 0", "on 69 0"]);
  });

  it("stops its notes on dispose", () => {
    const seq = create({ steps: "C4 _ _ _ - - - - - - - - - - - -" });
    const heard = listen(seq);
    advance(0.1);

    seq.dispose();

    expect(heard.at(-1)).toMatch(/^all /);
  });
});

describe("SequencerModule steps marked by gates", () => {
  /** Opens a gate into the clock input at `time`, for `length` seconds. */
  const tick = (seq: SequencerModule, time: number, length = 0.1) => {
    const clock = seq.getTriggerInput("clock")!;
    clock.gateOn(time);
    clock.gateOff(time + length);
  };

  it("plays a step on each gate into clock, for as long as that gate, and none on the grid", () => {
    const seq = create({ division: "gate" });
    advance(1);
    expect(gates.on).toEqual([]);

    // C4, a rest, E4.
    tick(seq, 2, 0.3);
    tick(seq, 3);
    tick(seq, 4, 0.05);

    expect(gates.on).toEqual([2, 4]);
    expect(gates.off).toEqual([2.3, 4.05]);
    expect(pitches()).toEqual([0, 4 / 12]);
  });

  it("ignores the gates into clock while it follows the grid", () => {
    const seq = create();

    tick(seq, 0.1);

    expect(seq.getTriggerInput("clock")).toBeDefined();
    expect(gates.on).toEqual([]);
  });

  it("tells which step is playing, until the next gate", () => {
    const seq = create({ division: "gate" });

    tick(seq, 1);
    context.currentTime = 1.5;
    expect(seq.getPosition()).toBe(0);

    tick(seq, 2);
    context.currentTime = 2.5;
    expect(seq.getPosition()).toBe(1);
  });

  it("holds a note through the steps tied to it, gliding into their notes, until the gate of the last one closes", () => {
    const seq = create({ division: "gate", steps: "C4 _E4 _ - - - - - - - - - - - - -", glide: 0 });
    const heard: string[] = [];
    seq.getNoteOutput("notes")!.connect({
      noteOn: (note, time) => heard.push(`on ${note} ${time}`),
      noteOff: (note, time) => heard.push(`off ${note} ${time}`),
      allNotesOff: () => {},
      glide: (from, to, time) => heard.push(`glide ${from}>${to} ${time}`),
    });

    tick(seq, 0);
    tick(seq, 1);
    tick(seq, 2);

    expect(gates.on).toEqual([0]);
    expect(gates.off).toEqual([2.1]);
    expect(pitches()).toEqual([0, 4 / 12]);
    expect(heard).toEqual(["on 60 0", "glide 60>64 1", "off 64 2.1"]);
  });

  it("starts over from the first step when the transport restarts", () => {
    const seq = create({ division: "gate", steps: "C4 D4 E4 - - - - - - - - - - - - -" });

    tick(seq, 0);
    tick(seq, 1);
    transport.restart(2);
    tick(seq, 2);

    expect(pitches()).toEqual([0, 2 / 12, 0]);
  });

  it("launches a pattern for the next bar when the one playing starts over, as there is no bar", () => {
    const all: Params = { ...defaultParams("sequencer"), division: "gate", launch: "bar", length: 2, steps: STEPS };
    const seq = new SequencerModule(context.asAudioContext(), all, transport, {
      A2: { length: 2, root: all.root, scale: all.scale, steps: Array(16).fill("D4").join(" ") },
    });
    modules.push(seq);
    const clock = seq.getTriggerInput("clock")!;

    clock.gateOn(0);
    seq.launchPattern("A2");
    clock.gateOn(1);
    expect(seq.getPattern()).toEqual({ playing: "A1", queued: "A2" });
    clock.gateOn(2);

    expect(seq.getPattern()).toEqual({ playing: "A2" });
  });

  it("shows no step of the grid already scheduled once it follows gates", () => {
    const seq = create();
    advance(0.05);
    expect(seq.getPosition()).toBe(0);

    seq.setParameter("division", "gate");

    expect(seq.getPosition()).toBeUndefined();
  });

  it("ends the note a gate started when it goes back to the grid", () => {
    const seq = create({ division: "gate" });
    context.currentTime = 1;
    seq.getTriggerInput("clock")!.gateOn(1);

    seq.setParameter("division", "1/8");

    expect(gates.off).toEqual([1]);
  });
});

describe("SequencerModule chances", () => {
  /** A Seq whose dice give these rolls, from 0 to 1, one per note that may not sound. */
  const withRolls = (params: Partial<Params>, rolls: number[]) => {
    const random = vi.fn(() => rolls.shift() ?? 0.99);
    const seq = new SequencerModule(
      context.asAudioContext(),
      { ...defaultParams("sequencer"), division: "1/8", gate: 0.5, ...params },
      transport,
      undefined,
      random,
    );
    seq.getTriggerOutput("gate")!.connect({
      gateOn: (time) => gates.on.push(time),
      gateOff: (time) => gates.off.push(time),
    });
    modules.push(seq);
    return { seq, random };
  };

  const listenNotes = (seq: SequencerModule) => {
    const heard: string[] = [];
    seq.getNoteOutput("notes")!.connect({
      noteOn: (note, time) => heard.push(`on ${note} ${time}`),
      noteOff: (note, time) => heard.push(`off ${note} ${time}`),
      allNotesOff: () => {},
      glide: (from, to, time) => heard.push(`glide ${from}>${to} ${time}`),
    });
    return heard;
  };

  it("plays a note with a chance only when the dice fall under it", () => {
    const { seq } = withRolls({ steps: "C4?50 D4?50 E4?50 - - - - - - - - - - - - -" }, [0.3, 0.7, 0.49]);
    const heard = listenNotes(seq);

    advance(0.9);

    expect(gates.on).toEqual([0, 0.5]);
    expect(pitches()).toEqual([0, 4 / 12]);
    expect(heard).toEqual(["on 60 0", "off 60 0.125", "on 64 0.5", "off 64 0.625"]);
  });

  it("rolls no dice for the notes that always sound", () => {
    const { random } = withRolls({ steps: "C4 - E4 - - - - - - - - - - - - -" }, []);

    advance(0.9);

    expect(random).not.toHaveBeenCalled();
    expect(gates.on).toEqual([0, 0.5]);
  });

  it("leaves silent the steps tied to a note that does not sound, and plays the next one", () => {
    const { seq } = withRolls({ steps: "C4?50 _ _E4 G4 - - - - - - - - - - - -", glide: 0 }, [0.9]);
    const heard = listenNotes(seq);

    advance(0.9);

    expect(gates.on).toEqual([0.75]);
    expect(pitches()).toEqual([7 / 12]);
    expect(heard).toEqual(["on 67 0.75", "off 67 0.875"]);
  });

  it("rolls again each time the loop comes round", () => {
    withRolls({ steps: "C4?50 - - - - - - - - - - - - - - -", length: 1 }, [0.9, 0.1, 0.9]);

    advance(0.7);

    expect(gates.on).toEqual([0.25]);
  });

  it("leaves silent a note with a chance, and its ties, on the gates into clock too", () => {
    const { seq } = withRolls({ division: "gate", steps: "C4?50 _E4 D4 - - - - - - - - - - - - -", glide: 0 }, [0.9]);
    const heard = listenNotes(seq);
    const tick = (time: number) => {
      seq.getTriggerInput("clock")!.gateOn(time);
      seq.getTriggerInput("clock")!.gateOff(time + 0.1);
    };

    tick(0);
    tick(1);
    tick(2);

    expect(gates.on).toEqual([2]);
    expect(heard).toEqual(["on 62 2", "off 62 2.1"]);
  });
});

describe("SequencerModule chances after a rest", () => {
  it("plays a tied note after a rest as a note of its own, once a note before the rest was left silent", () => {
    const random = vi.fn(() => 0.99);
    const seq = new SequencerModule(
      context.asAudioContext(),
      { ...defaultParams("sequencer"), division: "gate", steps: "C4?50 - _E4 - - - - - - - - - - - - -" },
      transport,
      undefined,
      random,
    );
    modules.push(seq);
    seq.getTriggerOutput("gate")!.connect({ gateOn: (time) => gates.on.push(time), gateOff: () => {} });
    const clock = seq.getTriggerInput("clock")!;

    [0, 1, 2].forEach((time) => {
      clock.gateOn(time);
      clock.gateOff(time + 0.1);
    });

    expect(gates.on).toEqual([2]);
  });
});
