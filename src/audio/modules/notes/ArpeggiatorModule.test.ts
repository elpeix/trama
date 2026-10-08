import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STOP } from "../../../patch/patterns";
import { defaultParams } from "../../../patch/registry";
import type { Params } from "../../../patch/types";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { Transport } from "../../Transport";
import { ArpeggiatorModule, arpeggio } from "./ArpeggiatorModule";

describe("arpeggio", () => {
  it("plays the held notes upwards, whatever order they were pressed in", () => {
    expect(arpeggio([67, 60, 64], "up", 1)).toEqual([60, 64, 67]);
  });

  it("plays them downwards", () => {
    expect(arpeggio([60, 64, 67], "down", 1)).toEqual([67, 64, 60]);
  });

  it("goes up and down without repeating the ends", () => {
    expect(arpeggio([60, 64, 67], "up-down", 1)).toEqual([60, 64, 67, 64]);
    expect(arpeggio([60, 64], "up-down", 1)).toEqual([60, 64]);
  });

  it("repeats the notes over several octaves", () => {
    expect(arpeggio([60, 64], "up", 2)).toEqual([60, 64, 72, 76]);
  });

  it.each([
    ["major", [60, 64, 67]],
    ["minor", [60, 63, 67]],
    ["7", [60, 64, 67, 70]],
    ["maj7", [60, 64, 67, 71]],
    ["m7", [60, 63, 67, 70]],
    ["sus4", [60, 65, 67]],
  ])("builds a %s chord on a single key", (chord, notes) => {
    expect(arpeggio([60], "up", 1, chord)).toEqual(notes);
  });

  it("joins the chords of several keys without repeating shared notes", () => {
    // C major and E major share the E; C minor and E minor share the G.
    expect(arpeggio([64, 60], "up", 1, "major")).toEqual([60, 64, 67, 68, 71]);
    expect(arpeggio([60, 64], "up", 1, "minor")).toEqual([60, 63, 64, 67, 71]);
  });

  it("spreads chords over octaves and applies the pattern to the whole set", () => {
    expect(arpeggio([60], "down", 2, "major")).toEqual([79, 76, 72, 67, 64, 60]);
  });
});

let context: FakeAudioContext;
let transport: Transport;
let gates: { on: number[]; off: number[] };

const create = (params: Partial<Params> = {}, random?: () => number) => {
  const arp = new ArpeggiatorModule(
    context.asAudioContext(),
    { ...defaultParams("arpeggiator"), division: "1/8", gate: 0.5, ...params },
    transport,
    random,
  );
  arp.getTriggerOutput("gate")!.connect({
    gateOn: (time) => gates.on.push(time),
    gateOff: (time) => gates.off.push(time),
  });
  return arp;
};

const pitches = () =>
  context.constantSources[0].offset.events.map((event) => ("value" in event ? event.value : undefined));

/** Moves the audio clock in small steps, waking the scheduler as a browser would. */
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
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ArpeggiatorModule", () => {
  it("outputs a started pitch source and a gate", () => {
    const arp = create();

    expect(arp.getAudioOutput("pitch")).toBe(context.constantSources[0]);
    expect(context.constantSources[0].started).toBe(true);
    expect(arp.getTriggerOutput("gate")).toBeDefined();
  });

  it("starts on the first note and plays one step per division of the tempo", () => {
    const arp = create();

    arp.noteOn(60, 0);
    arp.noteOn(64, 0);
    advance(1);

    // 120 BPM in eighths: a step every 0.25 s, each open for half of it.
    expect(gates.on.slice(0, 4)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(gates.off.slice(0, 2)).toEqual([0.125, 0.375]);
    expect(pitches().slice(0, 4)).toEqual([0, 4 / 12, 0, 4 / 12]);
  });

  it("waits for the next step of the grid before the first note", () => {
    const arp = create();
    advance(0.3);

    arp.noteOn(60, context.currentTime);
    advance(0.5);

    expect(gates.on[0]).toBe(0.5);
  });

  it("plays the first note at the key press, and keeps its beat, when it starts now", () => {
    const arp = create({ start: "now" });
    advance(0.3);

    arp.noteOn(60, context.currentTime);
    advance(0.5);

    expect(gates.on.slice(0, 3)).toEqual([expect.closeTo(0.3), expect.closeTo(0.55), expect.closeTo(0.8)]);
  });

  it("only schedules a little ahead of the audio clock", () => {
    const arp = create();

    arp.noteOn(60, 0);

    expect(gates.on).toEqual([0]);
    advance(0.2);
    expect(gates.on).toEqual([0, 0.25]);
  });

  it("stops when the last note is released", () => {
    const arp = create();
    arp.noteOn(60, 0);
    advance(0.5);
    const played = gates.on.length;

    arp.noteOff(60);
    advance(2);

    expect(gates.on).toHaveLength(played);
  });

  it("keeps going while other notes are held", () => {
    const arp = create();
    arp.noteOn(60, 0);
    arp.noteOn(67, 0);

    arp.noteOff(60);
    advance(0.6);

    expect(pitches().slice(-2)).toEqual([7 / 12, 7 / 12]);
  });

  it("carries on from the last note when notes are added while it plays", () => {
    const arp = create();
    arp.noteOn(64, 0);
    arp.noteOn(60, 0);
    arp.noteOn(67, 0);
    advance(0.8);

    // The 64 sounded alone first; then the pattern goes on from it instead of repeating it.
    expect(pitches().slice(0, 4)).toEqual([4 / 12, 7 / 12, 0, 4 / 12]);
  });

  it("restarts the pattern after a pause", () => {
    const arp = create();
    arp.noteOn(60, 0);
    arp.noteOn(64, 0);
    advance(0.3);
    arp.allNotesOff();

    advance(10);
    arp.noteOn(60, context.currentTime);
    arp.noteOn(64, context.currentTime);
    advance(0.4);

    // Pressed at 10.3 s: it waits for the next eighth of the grid.
    expect(gates.on.slice(-2)).toEqual([expect.closeTo(10.5), expect.closeTo(10.75)]);
    expect(pitches().slice(-2)).toEqual([0, 4 / 12]);
  });

  it("does not catch up on steps missed while the timers were asleep", () => {
    const arp = create();
    arp.noteOn(60, 0);

    context.currentTime = 30;
    vi.advanceTimersByTime(25);

    expect(gates.on.filter((time) => time < 30)).toEqual([0]);
    expect(gates.on.at(-1)).toBeGreaterThanOrEqual(30);
  });

  it("follows tempo and step changes on the next step", () => {
    const arp = create();
    arp.noteOn(60, 0);

    transport.setTempo(60);
    arp.setParameter("division", "1/4");
    advance(3);

    expect(gates.on.slice(1, 4)).toEqual([1, 2, 3]);
  });

  it("spreads the notes over several octaves and transposes them", () => {
    const arp = create({ span: 2, transpose: 2 });

    arp.noteOn(60, 0);
    advance(0.5);

    expect(pitches().slice(0, 3)).toEqual([2 / 12, 14 / 12, 2 / 12]);
  });

  it("never repeats a note in random order", () => {
    let seed = 0;
    const arp = create({ pattern: "random" }, () => ((seed = (seed * 9301 + 49297) % 233280) / 233280));
    for (const note of [60, 64, 67]) {
      arp.noteOn(note, 0);
    }

    advance(5);

    const played = pitches().filter((pitch) => pitch !== undefined);
    expect(new Set(played)).toEqual(new Set([0, 4 / 12, 7 / 12]));
    played.slice(1).forEach((pitch, index) => expect(pitch).not.toBe(played[index]));
  });

  it("tells which notes it cycles through and which one is sounding", () => {
    const arp = create({ span: 2, transpose: 2 });
    expect(arp.getNotes()).toEqual({ notes: [] });

    arp.noteOn(64, 0);
    arp.noteOn(60, 0);

    // Steps every 0.25 s, open for half: 66 (F#4) sounds from 0 to 0.125.
    expect(arp.getNotes()).toEqual({ notes: [62, 66, 74, 78], playing: 66 });
    advance(0.15);
    expect(arp.getNotes()).toEqual({ notes: [62, 66, 74, 78] });
    advance(0.15);
    expect(arp.getNotes().playing).toBe(74);
  });

  it("stops showing notes when the keys are released", () => {
    const arp = create();
    arp.noteOn(60, 0);

    arp.noteOff(60);
    advance(0.5);

    expect(arp.getNotes()).toEqual({ notes: [] });
  });

  it("plays and shows the chord built on the held key", () => {
    const arp = create({ chord: "minor" });

    arp.noteOn(57, 0);
    advance(0.8);

    expect(arp.getNotes().notes).toEqual([57, 60, 64]);
    expect(pitches().slice(0, 4)).toEqual([-3 / 12, 0, 4 / 12, -3 / 12]);
  });

  it("rejects unknown params", () => {
    expect(() => create().setParameter("swing", 0.2)).toThrow(/Arp/);
  });

  it("stops the clock and the source on dispose", () => {
    const arp = create();
    arp.noteOn(60, 0);

    arp.dispose();
    advance(1);

    expect(gates.on).toEqual([0]);
    expect(context.constantSources[0].stopped).toBe(true);
  });

  describe("with notes of its own", () => {
    const own = (params: Partial<Params> = {}) => {
      const arp = create({ source: "notes", notes: "C4 E4 G4", ...params });
      // It starts on its own once the engine has wired it.
      vi.advanceTimersByTime(0);
      return arp;
    };

    it("plays them in a loop without any key", () => {
      own();

      advance(0.9);

      expect(pitches().slice(0, 4)).toEqual([0, 4 / 12, 7 / 12, 0]);
    });

    it("starts over when the sound starts", () => {
      own();
      advance(0.3);

      // Two notes in, it would play G4 next; from the start of the grid again, C4.
      const before = pitches().length;
      transport.restart(context.currentTime + 0.05);
      advance(0.1);

      expect(pitches()[before]).toBe(0);
    });

    it("ignores the keys, and keeps playing when they are all let go", () => {
      const arp = own();

      arp.noteOn(72, 0);
      arp.allNotesOff();
      advance(0.9);

      expect(pitches()).not.toContain(1);
      expect(pitches()).toHaveLength(4);
    });

    it("plays new notes as soon as they change", () => {
      const arp = own();
      advance(0.1);

      arp.setParameter("notes", "D4");
      advance(0.5);

      expect(pitches().at(-1)).toBe(2 / 12);
    });

    it("builds a whole arpeggio from a single note and a chord", () => {
      own({ notes: "C4", chord: "major" });

      advance(0.6);

      expect(pitches().slice(0, 3)).toEqual([0, 4 / 12, 7 / 12]);
    });

    it("plays nothing without notes", () => {
      own({ notes: "" });

      advance(0.6);

      expect(gates.on).toEqual([]);
    });

    it("starts and stops when its source changes", () => {
      const arp = create({ notes: "E4" });
      advance(0.3);
      expect(gates.on).toEqual([]);

      arp.setParameter("source", "notes");
      advance(0.3);
      expect(pitches()).toContain(4 / 12);

      arp.setParameter("source", "keys");
      const played = gates.on.length;
      advance(0.6);
      expect(gates.on).toHaveLength(played);
    });

    it("moves them by its octave, which the keys do not use", () => {
      const arp = own({ notes: "C4", octave: -1 });
      advance(0.1);
      expect(pitches()[0]).toBe(-1);
      expect(arp.getNotes().notes).toEqual([48]);

      arp.setParameter("source", "keys");
      arp.noteOn(60, context.currentTime);
      advance(0.5);
      expect(pitches().at(-1)).toBe(0);
    });

    it("follows the last key pressed with its keys param on, from C4", () => {
      const arp = own({ notes: "C4", keys: "transpose" });

      arp.noteOn(67, 0);
      arp.noteOff(67);
      advance(0.3);

      // From the next step: the first one was scheduled as it started.
      expect(pitches().at(-1)).toBe(7 / 12);
      expect(arp.getKeyTranspose()).toBe(7);
    });

    it("leaves the keys to be played, not to transpose, while its source is the keys", () => {
      const arp = create({ keys: "transpose" });

      arp.noteOn(67, 0);
      advance(0.1);

      expect(arp.getKeyTranspose()).toBe(0);
      expect(pitches()[0]).toBe(7 / 12);
    });

    it("tells which notes it cycles through", () => {
      const arp = own({ span: 2 });

      expect(arp.getNotes().notes).toEqual([60, 64, 67, 72, 76, 79]);
    });
  });

  describe("with a rhythm", () => {
    const RHYTHM = "x - x x x x x x x x x x x x x x";

    it("keeps silent the steps that do not sound, and plays the note on the next one", () => {
      const arp = create({ rhythm: RHYTHM, length: 4 });
      for (const note of [60, 64, 67]) {
        arp.noteOn(note, 0);
      }

      advance(1.6);

      // Eighths every 0.25 s: the second of each four is silent, and E4 waits for the third.
      expect(gates.on.slice(0, 5)).toEqual([0, 0.5, 0.75, 1, 1.5]);
      expect(pitches().slice(0, 5)).toEqual([0, 4 / 12, 7 / 12, 0, 4 / 12]);
    });

    it("loops over its length only", () => {
      const arp = create({ rhythm: "x - - - - - - - - - - - - - - -", length: 2 });
      arp.noteOn(60, 0);

      advance(1.1);

      expect(gates.on.slice(0, 3)).toEqual([0, 0.5, 1]);
    });

    it("plays nothing when no step sounds", () => {
      const arp = create({ rhythm: Array(16).fill("-").join(" ") });
      arp.noteOn(60, 0);

      advance(1);

      expect(gates.on).toEqual([]);
    });

    it("follows a new rhythm from the next step", () => {
      const arp = create({ length: 2 });
      arp.noteOn(60, 0);

      arp.setParameter("rhythm", "- x x x x x x x x x x x x x x x");
      advance(1.1);

      expect(gates.on.slice(0, 3)).toEqual([0, 0.25, 0.75]);
    });

    it("tells the step of the rhythm it is on, silent or not", () => {
      const arp = create({ rhythm: RHYTHM, length: 4 });
      arp.noteOn(60, 0);

      advance(0.3);
      expect(arp.getPosition()).toBe(1);
      advance(0.25);
      expect(arp.getPosition()).toBe(2);
    });

    it("tells no step while it does not play", () => {
      const arp = create();

      advance(0.3);

      expect(arp.getPosition()).toBeUndefined();
    });

    it("walks through its own notes with the steps that sound, whenever it starts", () => {
      create({ source: "notes", notes: "C4 E4 G4", rhythm: RHYTHM, length: 4 });
      vi.advanceTimersByTime(0);

      advance(1.6);

      expect(gates.on.slice(0, 5)).toEqual([0, 0.5, 0.75, 1, 1.5]);
      expect(pitches().slice(0, 5)).toEqual([0, 4 / 12, 7 / 12, 0, 4 / 12]);
    });

    it("picks up its own notes where the grid is when it starts late", () => {
      advance(1.3);
      create({ source: "notes", notes: "C4 E4 G4", rhythm: RHYTHM, length: 4 });
      vi.advanceTimersByTime(0);

      advance(0.3);

      // It joins at the seventh step, 1.5 s: four steps have sounded before it, so it plays E4.
      expect(gates.on[0]).toBe(1.5);
      expect(pitches()[0]).toBe(4 / 12);
    });
  });
});

describe("ArpeggiatorModule patterns", () => {
  it("plays the notes of the pattern launched", () => {
    const params: Params = { ...defaultParams("arpeggiator"), source: "notes", launch: "now", division: "1/8", gate: 0.5 };
    const pattern = {
      pattern: params.pattern,
      chord: params.chord,
      length: params.length,
      rhythm: params.rhythm,
      notes: "D4",
    };
    const arp = new ArpeggiatorModule(context.asAudioContext(), params, transport, undefined, {
      A2: pattern,
      A3: pattern,
      A4: pattern,
    });
    vi.advanceTimersByTime(0);
    advance(0.3);

    arp.launchPattern("A2");
    advance(0.7);

    expect(pitches()).toEqual([0, 4 / 12, 2 / 12, 2 / 12, 2 / 12]);
    expect(arp.getPattern()).toEqual({ playing: "A2" });
    arp.dispose();
  });

  it("starts the notes of a pattern launched for a place from there, not from where the grid is", () => {
    const params: Params = { ...defaultParams("arpeggiator"), source: "notes", launch: "now", division: "1/8", gate: 0.5 };
    const pattern = { pattern: params.pattern, chord: params.chord, length: params.length, rhythm: params.rhythm, notes: "D4 F4 A4" };
    const arp = new ArpeggiatorModule(context.asAudioContext(), params, transport, undefined, {
      A2: pattern,
      A3: pattern,
      A4: pattern,
    });
    vi.advanceTimersByTime(0);
    advance(0.3);

    arp.launchPattern("A2", "bar", 0);
    advance(1.8);

    // Step 8 of the grid is the first step of B: its first note, not its third.
    expect(context.constantSources[0].offset.events.at(-1)).toMatchObject({ time: 2, value: 2 / 12 });
    arp.dispose();
  });

  it("stops on the bar a stop is launched for, and plays again once a pattern is launched", () => {
    const params: Params = { ...defaultParams("arpeggiator"), source: "notes", launch: "now", division: "1/8", gate: 0.5 };
    const arp = new ArpeggiatorModule(context.asAudioContext(), params, transport);
    vi.advanceTimersByTime(0);
    advance(0.3);

    arp.launchPattern(STOP, "bar");
    advance(1.9);
    const before = pitches().length;
    advance(1);
    expect(arp.getPattern()).toEqual({ playing: "A1", stopped: true });
    expect(pitches()).toHaveLength(before);

    arp.launchPattern("A1");
    advance(0.5);
    expect(arp.getPattern()).toEqual({ playing: "A1" });
    expect(pitches().length).toBeGreaterThan(before);
    arp.dispose();
  });

  it("waits for the next bar of the meter when launched for it", () => {
    transport.setMeter([3]);
    const params: Params = { ...defaultParams("arpeggiator"), source: "notes", launch: "now", division: "1/8", gate: 0.5 };
    const pattern = { pattern: params.pattern, chord: params.chord, length: params.length, rhythm: params.rhythm, notes: "D4" };
    const arp = new ArpeggiatorModule(context.asAudioContext(), params, transport, undefined, {
      A2: pattern,
      A3: pattern,
      A4: pattern,
    });
    vi.advanceTimersByTime(0);
    advance(0.3);

    arp.launchPattern("A2", "bar");
    advance(1);
    expect(arp.getPattern()).toEqual({ playing: "A1", queued: "A2" });

    advance(0.4);
    expect(arp.getPattern()).toEqual({ playing: "A2" });
    arp.dispose();
  });

  it("waits for the next bar when launched for it, whatever its own launch", () => {
    const params: Params = { ...defaultParams("arpeggiator"), source: "notes", launch: "now", division: "1/8", gate: 0.5 };
    const pattern = { pattern: params.pattern, chord: params.chord, length: params.length, rhythm: params.rhythm, notes: "D4" };
    const arp = new ArpeggiatorModule(context.asAudioContext(), params, transport, undefined, {
      A2: pattern,
      A3: pattern,
      A4: pattern,
    });
    vi.advanceTimersByTime(0);
    advance(0.3);

    arp.launchPattern("A2", "bar");
    advance(1.6);
    expect(arp.getPattern()).toEqual({ playing: "A1", queued: "A2" });

    advance(0.4);
    expect(arp.getPattern()).toEqual({ playing: "A2" });
    arp.dispose();
  });
});

describe("ArpeggiatorModule steps marked by gates", () => {
  const tick = (arp: ArpeggiatorModule, time: number, length = 0.1) => {
    const clock = arp.getTriggerInput("clock")!;
    clock.gateOn(time);
    clock.gateOff(time + length);
  };

  it("plays its own notes one on each gate into clock, for as long as that gate, and none on the grid", () => {
    const arp = create({ source: "notes", notes: "C4 E4 G4", division: "gate" });
    advance(1);
    expect(gates.on).toEqual([]);

    tick(arp, 2, 0.3);
    tick(arp, 3);
    tick(arp, 4, 0.05);
    tick(arp, 5);

    expect(gates.on).toEqual([2, 3, 4, 5]);
    expect(gates.off).toEqual([2.3, 3.1, 4.05, 5.1]);
    expect(pitches()).toEqual([0, 4 / 12, 7 / 12, 0]);
    arp.dispose();
  });

  it("plays the held keys on the gates, counting from the first key pressed, and nothing without keys", () => {
    const arp = create({ division: "gate" });

    tick(arp, 0);
    arp.noteOn(64, 1);
    arp.noteOn(60, 1);
    tick(arp, 2);
    tick(arp, 3);
    arp.allNotesOff();
    tick(arp, 4);

    expect(gates.on).toEqual([2, 3]);
    expect(pitches()).toEqual([0, 4 / 12]);
    arp.dispose();
  });

  it("keeps silent steps of its rhythm silent, and tells the step it is on", () => {
    const arp = create({ source: "notes", notes: "C4 E4", division: "gate", rhythm: "x - x x x x x x x x x x x x x x", length: 4 });
    advance(0.01);

    tick(arp, 1);
    tick(arp, 2);
    context.currentTime = 2.5;

    expect(gates.on).toEqual([1]);
    expect(arp.getPosition()).toBe(1);
    arp.dispose();
  });
});
