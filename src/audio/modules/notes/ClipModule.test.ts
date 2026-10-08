import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STOP } from "../../../patch/patterns";
import { defaultParams } from "../../../patch/registry";
import type { Params } from "../../../patch/types";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { Transport } from "../../Transport";
import { ClipModule } from "./ClipModule";

let context: FakeAudioContext;
let transport: Transport;
let gates: { on: number[]; off: number[] };
let modules: ClipModule[];

const create = (params: Partial<Params> = {}) => {
  const all: Params = { ...defaultParams("clip"), bars: 1, notes: "C4@0+1 E4@1+0.5 G4@3+0.25", ...params };
  const clip = new ClipModule(context.asAudioContext(), all, transport);
  clip.getTriggerOutput("gate")!.connect({
    gateOn: (time) => gates.on.push(time),
    gateOff: (time) => gates.off.push(time),
  });
  modules.push(clip);
  return clip;
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

describe("ClipModule", () => {
  it("outputs a started pitch source and a gate", () => {
    const clip = create();

    expect(clip.getAudioOutput("pitch")).toBe(context.constantSources[0]);
    expect(context.constantSources[0].started).toBe(true);
    expect(clip.getTriggerOutput("gate")).toBeDefined();
  });

  it("plays its notes at their beats, each for its length", () => {
    create();

    advance(1.9);

    expect(gates.on).toEqual([0, 0.5, 1.5]);
    expect(gates.off).toEqual([0.5, 0.75, 1.625]);
    expect(pitches()).toEqual([0, 4 / 12, 7 / 12]);
  });

  it("starts over after its bars", () => {
    create();

    advance(2.1);

    expect(gates.on).toEqual([0, 0.5, 1.5, 2]);
  });

  it("starts over after its bars of the meter", () => {
    transport.setMeter([3]);
    create();

    advance(1.6);

    expect(gates.on).toEqual([0, 0.5, 1.5]);
  });

  it("follows a change of meter with the same bars", () => {
    create();
    transport.setMeter([5]);

    advance(2.6);

    expect(gates.on).toEqual([0, 0.5, 1.5, 2.5]);
  });

  it("cuts a note short when the next one starts", () => {
    create({ notes: "C4@0+3 E4@1+1" });

    advance(1);

    expect(gates.off[0]).toBe(0.5);
  });

  it("shifts by its octave", () => {
    create({ octave: -1 });

    advance(0.1);

    expect(pitches()).toEqual([-1]);
  });

  it("tells the beat of the loop it is on while it plays", () => {
    const clip = create({ bars: 2 });
    expect(clip.getPosition()).toBeUndefined();

    advance(2.5);

    expect(clip.getPosition()).toBeCloseTo(5, 1);
  });

  it("picks up new notes and a new length", () => {
    const clip = create();

    clip.setParameter("notes", "D4@0.5+0.5");
    clip.setParameter("bars", 2);
    advance(2);

    expect(gates.on).toEqual([0.25]);
    expect(pitches()).toEqual([2 / 12]);
  });

  describe("swing", () => {
    it("holds back the notes that start on a sixteenth between the eighths, as the Seq does its steps", () => {
      transport.setSwing(75);
      create({ notes: "C4@0+0.25 E4@0.25+0.25 G4@0.5+0.5" });

      advance(0.45);

      // 120 BPM: a sixteenth is 0.125 s, and the one between the eighths comes 0.0625 s later.
      expect(gates.on).toEqual([0, 0.1875, 0.25]);
      expect(gates.off).toEqual([0.1875, 0.25, 0.5]);
    });

    it("leaves where they are the notes that start off the swung steps", () => {
      transport.setSwing(75);
      create({ notes: "C4@0.3+0.1 E4@0.8+0.1" });

      advance(0.45);

      expect(gates.on).toEqual([0.15, 0.4]);
      expect(gates.off).toEqual([0.2, 0.45]);
    });

    it("holds back together the notes of a chord strummed on a swung step", () => {
      transport.setSwing(75);
      const heard: string[] = [];
      create({ notes: "C4@0.25+0.5 E4@0.26+0.49 G4@0.27+0.48" }).getNoteOutput("notes")!.connect({
        noteOn: (note, time) => heard.push(`on ${note} ${time}`),
        noteOff: () => {},
        allNotesOff: () => {},
      });

      advance(0.3);

      expect(heard).toEqual(["on 60 0.1875", "on 64 0.1925", "on 67 0.1975"]);
    });

    it("holds back the notes on the eighths between the beats when the swing is on the eighths", () => {
      transport.setSwing(66);
      transport.setSwingGrid("1/8");
      create({ notes: "C4@0.25+0.25 E4@0.5+0.5 G4@1+0.5" });

      advance(0.7);

      expect(gates.on.map((time) => Math.round(time * 1000) / 1000)).toEqual([0.125, 0.33, 0.5]);
      expect(gates.off.map((time) => Math.round(time * 1000) / 1000)).toEqual([0.33, 0.5, 0.83]);
    });

    it("holds back the notes it sends for the voices of a subpatch too", () => {
      transport.setSwing(75);
      const heard: string[] = [];
      create({ notes: "C4@0+0.25 E4@0.25+0.25" }).getNoteOutput("notes")!.connect({
        noteOn: (note, time) => heard.push(`on ${note} ${time}`),
        noteOff: (note, time) => heard.push(`off ${note} ${time}`),
        allNotesOff: () => {},
      });

      advance(0.45);

      expect(heard).toEqual(["on 60 0", "off 60 0.1875", "on 64 0.1875", "off 64 0.25"]);
    });

    it("plays straight without swing", () => {
      create({ notes: "C4@0+0.25 E4@0.25+0.25" });

      advance(0.45);

      expect(gates.on).toEqual([0, 0.125]);
      expect(gates.off).toEqual([0.125, 0.25]);
    });
  });

  describe("notes", () => {
    const listen = (clip: ClipModule) => {
      const heard: string[] = [];
      clip.getNoteOutput("notes")!.connect({
        noteOn: (note, time) => heard.push(`on ${note} ${time}`),
        noteOff: (note, time) => heard.push(`off ${note} ${time}`),
        allNotesOff: (time) => heard.push(`all ${time}`),
      });
      return heard;
    };

    it("sends every note of a chord for the voices of a subpatch, each for its length", () => {
      const heard = listen(create({ notes: "C4@0+1 E4@0+1 G4@1+1", octave: -1 }));

      advance(1.9);

      expect(heard).toEqual(["on 48 0", "on 52 0", "off 48 0.5", "off 52 0.5", "on 55 0.5", "off 55 1"]);
    });

    it("sends a note off only when its time comes, so no voice is freed early", () => {
      const heard = listen(create({ notes: "C4@0+2" }));

      advance(0.2);

      expect(heard).toEqual(["on 60 0"]);
    });

    it("sends how hard each note is played, and outputs it for the note sounding", () => {
      const clip = create({ notes: "C4@0+1v40 E4@1+1" });
      const velocities: (number | undefined)[] = [];
      clip.getNoteOutput("notes")!.connect({
        noteOn: (_note, _time, velocity) => velocities.push(velocity),
        noteOff: () => {},
        allNotesOff: () => {},
      });

      advance(0.9);

      expect(velocities).toEqual([40, 100]);
      const output = clip.getAudioOutput("velocity") as unknown as (typeof context.constantSources)[number];
      expect(output.offset.events.map((event) => ("value" in event ? event.value : 0))).toEqual([40 / 127, 100 / 127]);
    });

    it("ends a note before the same note starts again", () => {
      const heard = listen(create({ notes: "C4@0+1 C4@1+1" }));

      advance(0.9);

      expect(heard).toEqual(["on 60 0", "off 60 0.5", "on 60 0.5"]);
    });

    it("stops its notes on dispose", () => {
      const clip = create({ notes: "C4@0+2" });
      const heard = listen(clip);
      advance(0.2);

      clip.dispose();

      expect(heard.at(-1)).toMatch(/^all /);
    });
  });

  it("rejects unknown params", () => {
    expect(() => create().setParameter("steps", "C4")).toThrow(/Clip/);
  });

  it("stops the clock and the source on dispose", () => {
    const clip = create();
    advance(0.1);

    clip.dispose();
    advance(2);

    expect(gates.on).toEqual([0]);
    expect(context.constantSources[0].stopped).toBe(true);
  });
});

describe("ClipModule patterns", () => {
  /** A clip of one bar, C4 on its first beat, with pattern B on D4 and as long as `bars`. */
  const createWithPatterns = (params: Partial<Params> = {}, bars = 1) => {
    const all: Params = { ...defaultParams("clip"), bars: 1, notes: "C4@0+1", ...params };
    const clip = new ClipModule(context.asAudioContext(), all, transport, {
      A2: { bars, notes: "D4@0+1 D4@1+1 D4@2+1 D4@3+1" },
      A3: { bars: all.bars, notes: all.notes },
      A4: { bars: all.bars, notes: all.notes },
    });
    modules.push(clip);
    return clip;
  };

  it("plays pattern A, and the one launched from the next bar with bar", () => {
    const clip = createWithPatterns();
    advance(0.3);

    clip.launchPattern("A2");
    expect(clip.getPattern()).toEqual({ playing: "A1", queued: "A2" });
    // Notes go out a tenth of a second ahead: up to 1.8 s, only the bar of A.
    advance(1.5);
    expect(pitches()).toEqual([0]);

    advance(0.4);
    expect(clip.getPattern()).toEqual({ playing: "A2" });
    expect(pitches()).toEqual([0, 2 / 12]);
  });

  it("waits for the loop playing to start over with end", () => {
    const clip = createWithPatterns({ bars: 2, launch: "end" });
    advance(0.3);

    clip.launchPattern("A2");
    advance(2);
    expect(clip.getPattern().playing).toBe("A1");

    advance(2);
    expect(clip.getPattern().playing).toBe("A2");
  });

  it("takes over at once with now, from the same place of the grid", () => {
    const clip = createWithPatterns({ launch: "now" });
    advance(0.3);

    clip.launchPattern("A2");
    advance(0.3);

    // Beat 1 of pattern B, not its first note again.
    expect(pitches()).toEqual([0, 2 / 12]);
    expect(context.constantSources[0].offset.events.at(-1)).toMatchObject({ time: 0.5 });
  });

  it("starts a pattern launched for a place from there, not from where the grid is", () => {
    const clip = createWithPatterns();
    clip.setPatternParameter("A2", "bars", 2);
    clip.setPatternParameter("A2", "notes", "D4@0+1 E4@4+1");
    advance(0.3);

    clip.launchPattern("A2", "bar", 0);
    advance(1.8);

    // Beat 4 of the grid is beat 0 of B: D4, not the E4 of its second bar.
    expect(pitches()).toEqual([0, 2 / 12]);
    expect(context.constantSources[0].offset.events.at(-1)).toMatchObject({ time: 2 });
  });

  it("plays from the beat it is launched for when it starts there, and tells it", () => {
    const clip = createWithPatterns();
    clip.setPatternParameter("A2", "bars", 2);
    clip.setPatternParameter("A2", "notes", "D4@0+1 E4@4+1");

    clip.launchPattern("A2", "now", 4);
    advance(0.5);

    expect(pitches()).toEqual([4 / 12]);
    expect(context.constantSources[0].offset.events.at(-1)).toMatchObject({ time: 0 });
    expect(clip.getPosition()).toBeCloseTo(5);
  });

  it("launches on the next bar of the meter with bar", () => {
    transport.setMeter([3]);
    const clip = createWithPatterns();
    advance(0.3);

    clip.launchPattern("A2");
    advance(1);
    expect(clip.getPattern()).toEqual({ playing: "A1", queued: "A2" });

    advance(0.4);
    expect(clip.getPattern()).toEqual({ playing: "A2" });
    expect(pitches()).toEqual([0, 2 / 12]);
  });

  it("waits for the next bar when launched for it, whatever its own launch", () => {
    const clip = createWithPatterns({ launch: "now" });
    advance(0.3);

    clip.launchPattern("A2", "bar");
    advance(1.5);
    expect(clip.getPattern()).toEqual({ playing: "A1", queued: "A2" });

    advance(0.4);
    expect(clip.getPattern()).toEqual({ playing: "A2" });
    expect(pitches()).toEqual([0, 2 / 12]);
  });

  it("stops on the bar a stop is launched for, and plays again once a pattern is launched", () => {
    const clip = createWithPatterns();
    advance(0.3);

    clip.launchPattern(STOP);
    advance(4);
    expect(clip.getPattern()).toEqual({ playing: "A1", stopped: true });
    expect(pitches()).toEqual([0]);

    clip.launchPattern("A1");
    advance(2);
    expect(clip.getPattern()).toEqual({ playing: "A1" });
    expect(pitches()).toEqual([0, 0]);
    expect(context.constantSources[0].offset.events.at(-1)).toMatchObject({ time: 6 });
  });

  it("changes a pattern that is not playing without touching the one that is", () => {
    const clip = createWithPatterns();

    clip.setPatternParameter("A2", "notes", "G4@0+1");
    advance(1.9);
    expect(pitches()).toEqual([0]);

    clip.setParameter("notes", "E4@0+1");
    advance(0.2);
    expect(pitches()).toEqual([0, 4 / 12]);
  });

  describe("previews", () => {
    it("plays a note out of the pitch, the gate and the notes until it is let go, with the octave", () => {
      const clip = create({ notes: "", octave: 1 });
      const heard: string[] = [];
      clip.getNoteOutput("notes")!.connect({
        noteOn: (note, time) => heard.push(`on ${note} ${time}`),
        noteOff: (note, time) => heard.push(`off ${note} ${time}`),
        allNotesOff: (time) => heard.push(`all ${time}`),
      });

      clip.previewOn(64, 0.5);
      clip.previewOff(0.8);
      clip.previewOff(0.9);

      expect(pitches().at(-1)).toBeCloseTo(16 / 12);
      expect(gates).toEqual({ on: [0.5], off: [0.8] });
      expect(heard).toEqual(["on 76 0.5", "off 76 0.8"]);
    });

    it("lets one note go when another is previewed", () => {
      const clip = create({ notes: "" });

      clip.previewOn(60, 0.5);
      clip.previewOn(62, 0.6);

      expect(gates).toEqual({ on: [0.5, 0.6], off: [0.6] });
      expect(pitches().at(-1)).toBeCloseTo(2 / 12);
    });
  });
});
