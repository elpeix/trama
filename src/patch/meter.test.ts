import { describe, expect, it } from "vitest";
import {
  beatAccent,
  beatsPerBar,
  clipBarsFor,
  convertLane,
  DEFAULT_METER,
  isMeter,
  maxClipBars,
  groupStarts,
  meterLabel,
  METERS,
  pulseBeats,
  sameMeter,
  stepAccents,
  timeSignature,
  withMeter,
} from "./meter";
import type { Patch } from "./types";

describe("beatsPerBar", () => {
  it("adds up the groups of a meter, four beats without one", () => {
    expect(beatsPerBar([4])).toBe(4);
    expect(beatsPerBar([3])).toBe(3);
    expect(beatsPerBar([3, 2])).toBe(5);
    expect(beatsPerBar([2, 2, 3])).toBe(7);
    expect(beatsPerBar(undefined)).toBe(4);
  });

  it("counts the beats of a meter in eighths as quarters, two eighths to each", () => {
    expect(beatsPerBar({ eighths: [3, 3] })).toBe(3);
    expect(beatsPerBar({ eighths: [3, 3, 3, 3] })).toBe(6);
  });
});

describe("pulseBeats", () => {
  it("beats once a quarter in a meter of quarters, and once a dotted quarter in one of eighths", () => {
    expect(pulseBeats([4])).toBe(1);
    expect(pulseBeats([3, 2])).toBe(1);
    expect(pulseBeats({ eighths: [3, 3] })).toBe(1.5);
    expect(pulseBeats({ eighths: [3, 3, 3, 3] })).toBe(1.5);
  });
});

describe("beatAccent", () => {
  it("lights the first beat of each bar, the first of each group, and the rest as plain beats", () => {
    const accents = (meter: number[], beats: number) =>
      Array.from({ length: beats }, (_, beat) => beatAccent(beat, meter));

    expect(accents([4], 5)).toEqual(["bar", "beat", "beat", "beat", "bar"]);
    expect(accents([3], 4)).toEqual(["bar", "beat", "beat", "bar"]);
    expect(accents([3, 2], 6)).toEqual(["bar", "beat", "beat", "group", "beat", "bar"]);
    expect(accents([2, 2, 3], 8)).toEqual(["bar", "beat", "group", "beat", "group", "beat", "beat", "bar"]);
  });

  it("goes by the beat a moment is on", () => {
    expect(beatAccent(3.4, [3, 2])).toBe("group");
    expect(beatAccent(5.9, [3, 2])).toBe("bar");
  });

  it("lights each dotted quarter of a meter in eighths, the first of each bar as a bar", () => {
    const accents = (at: number[]) => at.map((beat) => beatAccent(beat, { eighths: [3, 3, 3, 3] }));

    expect(accents([0, 1.5, 3, 4.5, 6])).toEqual(["bar", "beat", "beat", "beat", "bar"]);
    expect(accents([1, 1.4, 2.9, 6.5])).toEqual(["bar", "bar", "beat", "bar"]);
    expect(beatAccent(1.5, { eighths: [3, 3] })).toBe("beat");
    expect(beatAccent(3, { eighths: [3, 3] })).toBe("bar");
  });
});

describe("stepAccents", () => {
  it("marks the steps that start a beat, and among them those that start a group or a bar", () => {
    expect(stepAccents(8, 0.25, [4])).toEqual(["bar", undefined, undefined, undefined, "beat", undefined, undefined, undefined]);
    expect(stepAccents(10, 0.5, [3, 2])).toEqual(["bar", undefined, "beat", undefined, "beat", undefined, "group", undefined, "beat", undefined]);
  });

  it("goes on into the next bars", () => {
    expect(stepAccents(7, 1, [3])).toEqual(["bar", "beat", "beat", "bar", "beat", "beat", "bar"]);
    expect(stepAccents(6, 2 / 3, [2])).toEqual(["bar", undefined, undefined, "bar", undefined, undefined]);
  });

  it("marks the steps that start a dotted quarter in a meter of eighths", () => {
    expect(stepAccents(12, 0.5, { eighths: [3, 3] })).toEqual([
      ...["bar", undefined, undefined, "beat", undefined, undefined],
      ...["bar", undefined, undefined, "beat", undefined, undefined],
    ]);
    expect(stepAccents(4, 1, { eighths: [3, 3] })).toEqual(["bar", undefined, undefined, "bar"]);
  });
});

describe("groupStarts", () => {
  it("gives where each group but the first starts in a bar of quarters", () => {
    expect(groupStarts([4])).toEqual([]);
    expect(groupStarts([3, 2])).toEqual([3]);
    expect(groupStarts([2, 2, 3])).toEqual([2, 4]);
  });

  it("gives none in a meter of eighths, whose groups are its beats", () => {
    expect(groupStarts({ eighths: [3, 3] })).toEqual([]);
    expect(groupStarts({ eighths: [3, 3, 3, 3] })).toEqual([]);
  });
});

describe("isMeter", () => {
  it("takes groups of whole beats, up to sixteen in a bar", () => {
    expect(isMeter([4])).toBe(true);
    expect(isMeter([3, 2])).toBe(true);
    expect(isMeter([4, 4, 4, 4])).toBe(true);
  });

  it("takes groups of three eighths that fill whole quarters", () => {
    expect(isMeter({ eighths: [3, 3] })).toBe(true);
    expect(isMeter({ eighths: [3, 3, 3, 3] })).toBe(true);
  });

  it.each([
    ["no list", "3/4"],
    ["an empty list", []],
    ["a group of no beats", [3, 0]],
    ["a group of part of a beat", [2.5]],
    ["a group that is not a number", ["3"]],
    ["a bar over sixteen beats", [9, 8]],
    ["eighths that are not a list", { eighths: 6 }],
    ["no eighths", { eighths: [] }],
    ["eighths not in groups of three", { eighths: [2, 2, 3] }],
    ["eighths that do not fill whole quarters", { eighths: [3] }],
    ["eighths over sixteen quarters", { eighths: Array(12).fill(3) }],
    ["eighths with something else", { eighths: [3, 3], quarters: [4] }],
  ])("refuses %s", (_name, value) => {
    expect(isMeter(value)).toBe(false);
  });
});

describe("meterLabel", () => {
  it("names a meter by its beats over the quarter, and its groups when there are several", () => {
    expect(meterLabel([4])).toBe("4/4");
    expect(meterLabel([3])).toBe("3/4");
    expect(meterLabel([3, 2])).toBe("3+2/4");
    expect(meterLabel([2, 2, 3])).toBe("2+2+3/4");
  });

  it("names a meter of eighths by all its eighths", () => {
    expect(meterLabel({ eighths: [3, 3] })).toBe("6/8");
    expect(meterLabel({ eighths: [3, 3, 3, 3] })).toBe("12/8");
  });
});

describe("timeSignature", () => {
  it("gives the beats of a bar over the quarter, clicking on each", () => {
    expect(timeSignature([4])).toEqual({ numerator: 4, denominator: 4, clocks: 24 });
    expect(timeSignature([3, 2])).toEqual({ numerator: 5, denominator: 4, clocks: 24 });
  });

  it("gives the eighths of a bar over the eighth, clicking on each dotted quarter", () => {
    expect(timeSignature({ eighths: [3, 3] })).toEqual({ numerator: 6, denominator: 8, clocks: 36 });
    expect(timeSignature({ eighths: [3, 3, 3, 3] })).toEqual({ numerator: 12, denominator: 8, clocks: 36 });
  });
});

describe("METERS", () => {
  it("offers the usual meters, 4/4 among them, all valid and none twice", () => {
    expect(METERS.map(meterLabel)).toEqual([
      ...["2/4", "3/4", "4/4", "3+2/4", "2+3/4", "6/4", "4+3/4", "3+4/4", "2+2+3/4"],
      ...["6/8", "12/8"],
    ]);
    expect(METERS.every(isMeter)).toBe(true);
    expect(METERS.some((meter) => sameMeter(meter, DEFAULT_METER))).toBe(true);
  });
});

describe("sameMeter", () => {
  it("compares the groups, in their order", () => {
    expect(sameMeter([3, 2], [3, 2])).toBe(true);
    expect(sameMeter([3, 2], [2, 3])).toBe(false);
    expect(sameMeter([5], [3, 2])).toBe(false);
    expect(sameMeter(undefined, [4])).toBe(true);
  });

  it("tells a meter of eighths from one of quarters", () => {
    expect(sameMeter({ eighths: [3, 3] }, { eighths: [3, 3] })).toBe(true);
    expect(sameMeter({ eighths: [3, 3] }, { eighths: [3, 3, 3, 3] })).toBe(false);
    expect(sameMeter({ eighths: [3, 3] }, [3])).toBe(false);
    expect(sameMeter([6], { eighths: [3, 3] })).toBe(false);
    expect(sameMeter(undefined, { eighths: [3, 3] })).toBe(false);
  });
});

describe("maxClipBars", () => {
  it("fits as many bars as the longest clip holds, sixteen at most", () => {
    expect(maxClipBars(4)).toBe(16);
    expect(maxClipBars(3)).toBe(16);
    expect(maxClipBars(5)).toBe(12);
    expect(maxClipBars(7)).toBe(9);
  });
});

describe("clipBarsFor", () => {
  it("gives a clip the bars of the new meter that hold all it lasted", () => {
    expect(clipBarsFor(2, 4, 3)).toBe(3);
    expect(clipBarsFor(3, 3, 4)).toBe(3);
    expect(clipBarsFor(2, 4, 2)).toBe(4);
    expect(clipBarsFor(1, 4, 5)).toBe(1);
  });

  it("stops at the most bars the new meter allows", () => {
    expect(clipBarsFor(16, 4, 5)).toBe(12);
  });
});

describe("convertLane", () => {
  it("keeps each point on its bar, as far into it", () => {
    expect(convertLane([{ beat: 0, value: 1 }, { beat: 5.5, value: 2 }, { beat: 10, value: 3 }], 4, 3)).toEqual([
      { beat: 0, value: 1 },
      { beat: 4.5, value: 2 },
      { beat: 8, value: 3 },
    ]);
  });

  it("keeps whether a point is reached in a ramp", () => {
    expect(convertLane([{ beat: 4, value: 1, ramp: true }], 4, 5)).toEqual([{ beat: 5, value: 1, ramp: true }]);
  });

  it("brings the points past the end of a shorter bar to its last eighth, the last of them kept", () => {
    expect(
      convertLane(
        [
          { beat: 1, value: 1 },
          { beat: 3, value: 2 },
          { beat: 3.5, value: 3 },
          { beat: 4, value: 4 },
        ],
        4,
        3,
      ),
    ).toEqual([
      { beat: 1, value: 1 },
      { beat: 2.5, value: 3 },
      { beat: 3, value: 4 },
    ]);
  });
});

describe("convertLane in order", () => {
  it("keeps the points in order when one past the end comes after the last eighth", () => {
    expect(
      convertLane(
        [
          { beat: 2.75, value: 1 },
          { beat: 3.5, value: 2 },
        ],
        4,
        3,
      ),
    ).toEqual([{ beat: 2.75, value: 2 }]);
  });
});

describe("withMeter", () => {
  const clip = (id: string, bars: number) => ({
    id,
    type: "clip" as const,
    position: { x: 0, y: 0 },
    params: { bars, octave: 0, notes: "C4@0+1 G4@7+1", launch: "bar" },
  });

  const piece: Patch = {
    nodes: [
      { ...clip("clip-1", 2), patterns: { A2: { bars: 4, notes: "C4@0+1" } } },
      {
        id: "subpatch-2",
        type: "subpatch",
        position: { x: 0, y: 0 },
        params: {},
        patch: { nodes: [clip("clip-3", 1)], connections: [] },
      },
    ],
    connections: [],
    tempo: 120,
    song: {
      bars: 4,
      rows: { "clip-1": "A1 - A2 -" },
      automation: { "clip-1.octave": "0:0 4:1 7.5:2" },
      loop: { start: 1, length: 2 },
      fade: 1,
    },
  };

  it("sets the meter, and leaves it out of the patch at four beats", () => {
    expect(withMeter(piece, [3]).meter).toEqual([3]);
    expect(withMeter(withMeter(piece, [3]), [4])).not.toHaveProperty("meter");
  });

  it("keeps the bars of the song and its patterns, and moves the points of its lanes into their bars", () => {
    const song = withMeter(piece, [3]).song!;

    expect(song.bars).toBe(4);
    expect(song.rows).toEqual(piece.song!.rows);
    expect(song.loop).toEqual(piece.song!.loop);
    expect(song.fade).toBe(1);
    expect(song.automation).toEqual({ "clip-1.octave": "0:0 3:1 5.5:2" });
  });

  it("lengthens each clip, in every pattern and subpatch, to hold its notes, which stay where they were", () => {
    const changed = withMeter(piece, [3]);
    const inner = changed.nodes[1].patch!.nodes[0];

    expect(changed.nodes[0].params).toMatchObject({ bars: 3, notes: "C4@0+1 G4@7+1" });
    expect(changed.nodes[0].patterns).toEqual({ A2: { bars: 6, notes: "C4@0+1" } });
    expect(inner.params.bars).toBe(2);
  });

  it("goes into a meter of eighths by the quarters of its bar, and back", () => {
    const changed = withMeter(piece, { eighths: [3, 3] });

    expect(changed.meter).toEqual({ eighths: [3, 3] });
    expect(changed.nodes[0].params).toMatchObject({ bars: 3, notes: "C4@0+1 G4@7+1" });
    expect(changed.song!.automation).toEqual({ "clip-1.octave": "0:0 3:1 5.5:2" });
    expect(withMeter(changed, [4])).not.toHaveProperty("meter");
    expect(withMeter(changed, { eighths: [3, 3] })).toBe(changed);
  });

  it("leaves the patch as it is when the meter does not change", () => {
    expect(withMeter(piece, [4])).toBe(piece);
  });
});
