import { describe, expect, it } from "vitest";
import {
  cellAt,
  cyclePattern,
  typedCell,
  emptySong,
  formatRow,
  initialSong,
  laneOf,
  nextBar,
  parseRow,
  patternPaths,
  pruneAutomation,
  pruneSong,
  slotAt,
  launchedOn,
  rowCells,
  songBarAt,
  withCell,
  withLane,
  fadeGain,
  songEnd,
  withFade,
  withLength,
  withLoop,
} from "./song";
import { STOP } from "./patterns";
import type { Graph, Song } from "./types";

const song: Song = {
  bars: 6,
  rows: { "seq-1": "A1 A1 B3 - - C8", "sub-2/clip-3": "- B3 - - - -" },
};

describe("parseRow and formatRow", () => {
  it("reads a pattern or a dash for each bar", () => {
    expect(parseRow("A1 - B2 D8", 4)).toEqual(["A1", undefined, "B2", "D8"]);
  });

  it("reads the letters of the rows from before the banks as A1 to A4", () => {
    expect(parseRow("A - B C D", 5)).toEqual(["A1", undefined, "A2", "A3", "A4"]);
  });

  it("fills the bars a row does not reach with dashes, and drops those past the end", () => {
    expect(parseRow("A1 B1", 4)).toEqual(["A1", "B1", undefined, undefined]);
    expect(parseRow("A1 B1 C1 D1", 2)).toEqual(["A1", "B1"]);
  });

  it("writes the cells back separated by spaces", () => {
    expect(formatRow(["A1", undefined, "B2", "C3"])).toBe("A1 - B2 C3");
  });

  it("reads and writes a dot, that stops the node", () => {
    expect(parseRow("A1 . - B2", 4)).toEqual(["A1", STOP, undefined, "B2"]);
    expect(formatRow(["A1", STOP, undefined, "B2"])).toBe("A1 . - B2");
  });
});

describe("cellAt", () => {
  it("gives the letter written on a bar, or undefined on a dash or a node without a row", () => {
    expect(cellAt(song, "seq-1", 2)).toBe("B3");
    expect(cellAt(song, "seq-1", 3)).toBeUndefined();
    expect(cellAt(song, "drums-9", 0)).toBeUndefined();
  });
});

describe("launchedOn", () => {
  it("gives the bar the pattern that sounds on a bar was written on", () => {
    expect(launchedOn(song, "seq-1", 1)).toBe(1);
    expect(launchedOn(song, "seq-1", 4)).toBe(2);
    expect(launchedOn(song, "sub-2/clip-3", 5)).toBe(1);
  });

  it("gives undefined before the first letter of a row", () => {
    expect(launchedOn(song, "sub-2/clip-3", 0)).toBeUndefined();
    expect(launchedOn(song, "drums-9", 3)).toBeUndefined();
  });
});

describe("slotAt", () => {
  it("gives the pattern that sounds on a bar: the last letter at or before it", () => {
    expect(slotAt(song, "seq-1", 4)).toBe("B3");
    expect(slotAt(song, "seq-1", 5)).toBe("C8");
    expect(slotAt(song, "sub-2/clip-3", 5)).toBe("B3");
  });

  it("gives undefined before the first letter of a row", () => {
    expect(slotAt(song, "sub-2/clip-3", 0)).toBeUndefined();
    expect(slotAt(song, "drums-9", 3)).toBeUndefined();
  });

  it("gives the stop after a dot, until the next letter", () => {
    const stopped: Song = { bars: 5, rows: { "seq-1": "A1 . - B2 -" } };

    expect(slotAt(stopped, "seq-1", 1)).toBe(STOP);
    expect(slotAt(stopped, "seq-1", 2)).toBe(STOP);
    expect(slotAt(stopped, "seq-1", 4)).toBe("B2");
  });
});

describe("rowCells", () => {
  it("gives each bar of a row its cell and, on a dash, the pattern that goes on sounding, as cellAt and slotAt do", () => {
    const stopped: Song = { bars: 6, rows: { "seq-1": "- A1 - . - B2" } };

    for (const [one, path] of [[song, "seq-1"], [song, "sub-2/clip-3"], [stopped, "seq-1"], [song, "drums-9"]] as const) {
      expect(rowCells(one, path)).toEqual(
        Array.from({ length: one.bars }, (_, bar) => {
          const cell = cellAt(one, path, bar);
          return { cell, sounding: cell === undefined ? slotAt(one, path, bar) : cell };
        }),
      );
    }
  });
});

describe("withCell", () => {
  it("writes a letter on a bar of a node", () => {
    expect(withCell(song, "seq-1", 3, "D4").rows["seq-1"]).toBe("A1 A1 B3 D4 - C8");
  });

  it("adds the row of a node that had none", () => {
    expect(withCell(song, "drums-9", 1, "C2").rows["drums-9"]).toBe("- C2 - - - -");
  });

  it("drops a row left with dashes only", () => {
    expect(withCell(song, "sub-2/clip-3", 1, undefined).rows).toEqual({ "seq-1": "A1 A1 B3 - - C8" });
  });

  it("leaves the song as it was for a bar past its end", () => {
    expect(withCell(song, "seq-1", 6, "A1")).toBe(song);
  });
});

describe("cyclePattern", () => {
  it("goes from a dash to A1, and through the patterns of a bank up to a dash after the eighth", () => {
    expect(cyclePattern(undefined)).toBe("A1");
    expect(cyclePattern("A1")).toBe("A2");
    expect(cyclePattern("C7")).toBe("C8");
    expect(cyclePattern("C8")).toBeUndefined();
  });

  it("goes from a stop to A1", () => {
    expect(cyclePattern(STOP)).toBe("A1");
  });
});

describe("typedCell", () => {
  it("changes the bank with a letter and the number with a digit, keeping the other", () => {
    expect(typedCell("B3", "d")).toBe("D3");
    expect(typedCell("B3", "7")).toBe("B7");
  });

  it("starts from the pattern that sounds on a dash, or from A1", () => {
    expect(typedCell(undefined, "5", "C2")).toBe("C5");
    expect(typedCell(undefined, "B")).toBe("B1");
  });

  it("clears with a dash, Delete or Backspace, and ignores other keys", () => {
    expect(typedCell("B3", "-")).toBeNull();
    expect(typedCell("B3", "Delete")).toBeNull();
    expect(typedCell("B3", "Backspace")).toBeNull();
    expect(typedCell("B3", "9")).toBe("B3");
    expect(typedCell("B3", "x")).toBe("B3");
  });

  it("stops the node with a dot", () => {
    expect(typedCell("B3", ".")).toBe(STOP);
    expect(typedCell(undefined, ".")).toBe(STOP);
  });

  it("starts from A1 on a stop, or on a dash after one", () => {
    expect(typedCell(STOP, "5")).toBe("A5");
    expect(typedCell(undefined, "C", STOP)).toBe("C1");
  });
});

describe("withLength", () => {
  it("cuts the rows of a shorter song, and drops those left empty", () => {
    expect(withLength(song, 1, 4)).toEqual({ bars: 1, rows: { "seq-1": "A1" } });
  });

  it("adds dashes to the rows of a longer one", () => {
    expect(withLength(song, 8, 4).rows["seq-1"]).toBe("A1 A1 B3 - - C8 - -");
  });

  it("keeps the loop inside the song", () => {
    expect(withLength({ ...song, loop: { start: 2, length: 4 } }, 4, 4).loop).toEqual({ start: 2, length: 2 });
    expect(withLength({ ...song, loop: { start: 4, length: 2 } }, 4, 4)).not.toHaveProperty("loop");
  });

  it("keeps between 1 and 999 bars", () => {
    expect(withLength(song, 0, 4).bars).toBe(1);
    expect(withLength(song, 5000, 4).bars).toBe(999);
  });
});

describe("withLoop", () => {
  it("sets a loop inside the song", () => {
    expect(withLoop(song, { start: 1, length: 3 }).loop).toEqual({ start: 1, length: 3 });
    expect(withLoop(song, { start: 4, length: 8 }).loop).toEqual({ start: 4, length: 2 });
  });

  it("takes it away with undefined", () => {
    expect(withLoop({ ...song, loop: { start: 0, length: 2 } }, undefined)).not.toHaveProperty("loop");
  });
});

describe("nextBar", () => {
  it("goes on to the next bar, and ends after the last one", () => {
    expect(nextBar(song, 0)).toBe(1);
    expect(nextBar(song, 5)).toBeUndefined();
  });

  it("goes back to the start of the loop from its last bar", () => {
    const looped = { ...song, loop: { start: 1, length: 3 } };

    expect(nextBar(looped, 3)).toBe(1);
    expect(nextBar(looped, 0)).toBe(1);
    expect(nextBar(looped, 4)).toBe(5);
  });
});

describe("songBarAt", () => {
  it("counts the bars of the song from the one it started on", () => {
    expect(songBarAt(song, 2, 0)).toBe(2);
    expect(songBarAt(song, 2, 3)).toBe(5);
    expect(songBarAt(song, 2, 4)).toBeUndefined();
  });

  it("goes round the loop", () => {
    const looped = { ...song, loop: { start: 1, length: 2 } };

    expect([0, 1, 2, 3, 4].map((bar) => songBarAt(looped, 0, bar))).toEqual([0, 1, 2, 1, 2]);
  });
});

describe("emptySong and initialSong", () => {
  it("starts with 8 bars and no rows", () => {
    expect(emptySong()).toEqual({ bars: 8, rows: {} });
  });

  it("starts from what each node plays, on the first bar, going on to the end", () => {
    expect(initialSong({ "seq-1": "B2", "sub-2/clip-3": "A1" }, 4)).toEqual({
      bars: 4,
      rows: { "seq-1": "B2 - - -", "sub-2/clip-3": "A1 - - -" },
    });
  });
});

describe("pruneSong", () => {
  it("drops the rows of the nodes that are gone", () => {
    expect(pruneSong(song, new Set(["seq-1"]))).toEqual({ bars: 6, rows: { "seq-1": "A1 A1 B3 - - C8" } });
  });

  it("gives the same song when every node is there", () => {
    expect(pruneSong(song, new Set(["seq-1", "sub-2/clip-3"]))).toBe(song);
  });
});

describe("patternPaths", () => {
  it("gives the path of every node with patterns, those inside subpatches too", () => {
    const graph: Graph = {
      nodes: [
        { id: "sequencer-1", type: "sequencer", position: { x: 0, y: 0 }, params: {} },
        { id: "oscillator-4", type: "oscillator", position: { x: 0, y: 0 }, params: {} },
        {
          id: "subpatch-2",
          type: "subpatch",
          name: "Bass",
          position: { x: 0, y: 0 },
          params: {},
          patch: { nodes: [{ id: "clip-3", type: "clip", name: "Riff", position: { x: 0, y: 0 }, params: {} }], connections: [] },
        },
      ],
      connections: [],
    };

    expect(patternPaths(graph).map(({ path, names }) => ({ path, names }))).toEqual([
      { path: "sequencer-1", names: ["Seq"] },
      { path: "subpatch-2/clip-3", names: ["Bass", "Riff"] },
    ]);
  });
});

describe("laneOf and withLane", () => {
  const automated: Song = { ...song, automation: { "filter-4.cutoff": "0:100 4:200" } };

  it("reads the points of a control, none when it has no lane", () => {
    expect(laneOf(automated, "filter-4.cutoff")).toEqual([
      { beat: 0, value: 100 },
      { beat: 4, value: 200 },
    ]);
    expect(laneOf(song, "filter-4.cutoff")).toEqual([]);
  });

  it("writes the points of a control", () => {
    expect(withLane(song, "osc-1.detune", [{ beat: 2, value: 5 }]).automation).toEqual({ "osc-1.detune": "2:5" });
  });

  it("keeps a lane in its place among the others when its points change, and adds a new one at the end", () => {
    const three: Song = { ...song, automation: { "a-1.x": "0:1", "b-2.y": "0:2", "c-3.z": "0:3" } };

    expect(Object.keys(withLane(three, "a-1.x", [{ beat: 4, value: 9 }]).automation!)).toEqual(["a-1.x", "b-2.y", "c-3.z"]);
    expect(Object.keys(withLane(three, "d-4.w", [{ beat: 0, value: 4 }]).automation!)).toEqual(["a-1.x", "b-2.y", "c-3.z", "d-4.w"]);
  });

  it("drops a lane left without points, and the automation left without lanes", () => {
    expect(withLane(automated, "filter-4.cutoff", [])).not.toHaveProperty("automation");
  });
});

describe("pruneAutomation", () => {
  it("drops the lanes of the nodes and cables that are gone", () => {
    const automated: Song = { ...song, automation: { "filter-4.cutoff": "0:1", "a->b.level": "0:1", "osc-1.detune": "0:1" } };

    expect(pruneAutomation(automated, new Set(["filter-4", "a->b"])).automation).toEqual({
      "filter-4.cutoff": "0:1",
      "a->b.level": "0:1",
    });
    expect(pruneAutomation(automated, new Set(["filter-4", "a->b", "osc-1"]))).toBe(automated);
  });
});

describe("withLength and the automation", () => {
  it("drops the points past the end of a shorter song", () => {
    const automated: Song = { ...song, automation: { "filter-4.cutoff": "0:100 4:200 12:300" } };

    expect(withLength(automated, 2, 4).automation).toEqual({ "filter-4.cutoff": "0:100 4:200" });
  });

  it("counts the end of the song in bars of the meter", () => {
    const automated: Song = { ...song, automation: { "filter-4.cutoff": "0:100 5:200 6:300" } };

    expect(withLength(automated, 2, 3).automation).toEqual({ "filter-4.cutoff": "0:100 5:200" });
  });
});

describe("songEnd", () => {
  it("counts the bars a song plays from a bar until it ends", () => {
    expect(songEnd({ bars: 4, rows: {} }, 0)).toBe(4);
    expect(songEnd({ bars: 4, rows: {} }, 3)).toBe(1);
  });

  it("never ends while a loop goes round", () => {
    expect(songEnd({ bars: 4, rows: {}, loop: { start: 1, length: 2 } }, 0)).toBeUndefined();
  });

  it("ends when it starts past the loop", () => {
    expect(songEnd({ bars: 4, rows: {}, loop: { start: 0, length: 2 } }, 2)).toBe(2);
  });
});

describe("fadeGain", () => {
  const fading: Song = { bars: 4, rows: {}, fade: 2 };

  it("keeps the volume until the fade, and brings it down to nothing at the end", () => {
    expect(fadeGain(fading, 0, 0, 4)).toBe(1);
    expect(fadeGain(fading, 0, 8, 4)).toBe(1);
    expect(fadeGain(fading, 0, 12, 4)).toBeCloseTo(0.25);
    expect(fadeGain(fading, 0, 16, 4)).toBe(0);
  });

  it("counts the fade in bars of the meter", () => {
    expect(fadeGain(fading, 0, 6, 3)).toBe(1);
    expect(fadeGain(fading, 0, 9, 3)).toBeCloseTo(0.25);
    expect(fadeGain(fading, 0, 12, 3)).toBe(0);
  });

  it("counts from the bar the song started on", () => {
    expect(fadeGain(fading, 2, 4, 4)).toBeCloseTo(0.25);
  });

  it("leaves the volume alone without a fade or while a loop goes round", () => {
    expect(fadeGain({ bars: 4, rows: {} }, 0, 15, 4)).toBe(1);
    expect(fadeGain({ ...fading, loop: { start: 0, length: 4 } }, 0, 15, 4)).toBe(1);
  });
});

describe("withFade", () => {
  it("sets the bars of the fade, whole and within the song, and none at 0", () => {
    const song: Song = { bars: 4, rows: {} };

    expect(withFade(song, 2)).toEqual({ ...song, fade: 2 });
    expect(withFade(song, 9).fade).toBe(4);
    expect(withFade(song, 1.6).fade).toBe(2);
    expect(withFade({ ...song, fade: 2 }, 0)).toEqual(song);
  });

  it("shortens the fade with the song", () => {
    expect(withLength({ bars: 8, rows: {}, fade: 6 }, 4, 4).fade).toBe(4);
  });
});
