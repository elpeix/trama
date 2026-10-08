import { describe, expect, it } from "vitest";
import { defaultParams } from "./registry";
import {
  isPresetsFile,
  parsePatch,
  parsePresetNode,
  parsePresets,
  parseSamples,
  PatchFormatError,
  serializePatch,
  serializePresetNode,
  serializePresets,
} from "./serialization";
import type { Patch } from "./types";

const shape = Array(64).fill("0.5").join(" ");
const harmonics = Array(16).fill("0.25").join(" ");

const patch: Patch = {
  nodes: [
    {
      id: "lfo-1",
      type: "lfo",
      position: { x: 10, y: 20 },
      params: { waveform: "sawtooth", sync: "1/8", rate: 2.04 },
    },
    {
      id: "oscillator-2",
      type: "oscillator",
      position: { x: 300, y: 20 },
      params: { waveform: "sine", mode: "free", frequency: 440, detune: 0, shape, harmonics },
    },
    {
      id: "output-3",
      type: "output",
      position: { x: 600, y: 20 },
      params: { volume: 0.8, limiter: "on" },
    },
  ],
  connections: [
    {
      id: "lfo-1:out->oscillator-2:frequency",
      source: { nodeId: "lfo-1", port: "out" },
      target: { nodeId: "oscillator-2", port: "frequency" },
      amount: -1,
    },
    {
      id: "oscillator-2:audio->output-3:audio",
      source: { nodeId: "oscillator-2", port: "audio" },
      target: { nodeId: "output-3", port: "audio" },
    },
  ],
  tempo: 96,
};

const file = (overrides: Record<string, unknown> = {}) => ({
  ...(serializePatch(patch) as unknown as Record<string, unknown>),
  ...overrides,
});

const withNode = (index: number, changes: Record<string, unknown>) => {
  const nodes = structuredClone(patch.nodes) as unknown as Record<string, unknown>[];
  nodes[index] = { ...nodes[index], ...changes };
  return file({ nodes });
};

const withConnections = (connections: unknown[]) => file({ connections });

describe("serializePatch", () => {
  it("writes a versioned patch with its tempo", () => {
    expect(serializePatch(patch)).toEqual({ version: 1, ...patch });
    expect(serializePatch(patch).tempo).toBe(96);
  });

  it("writes the swing only when the grid is not straight", () => {
    expect(serializePatch(patch)).not.toHaveProperty("swing");
    expect(serializePatch({ ...patch, swing: 50 })).not.toHaveProperty("swing");
    expect(serializePatch({ ...patch, swing: 62 }).swing).toBe(62);
  });

  it("writes what the swing holds back only when it is the eighths", () => {
    expect(serializePatch({ ...patch, swingGrid: "1/16" })).not.toHaveProperty("swingGrid");
    expect(serializePatch({ ...patch, swingGrid: "1/8" }).swingGrid).toBe("1/8");
  });

  it("writes the meter only when it is not four beats", () => {
    expect(serializePatch({ ...patch, meter: [4] })).not.toHaveProperty("meter");
    expect(serializePatch({ ...patch, meter: [3, 2] }).meter).toEqual([3, 2]);
    expect(serializePatch({ ...patch, meter: { eighths: [3, 3] } }).meter).toEqual({ eighths: [3, 3] });
  });

  it("round-trips through JSON", () => {
    expect(parsePatch(JSON.parse(JSON.stringify(serializePatch(patch))))).toEqual(patch);
  });
});

describe("parsePatch", () => {
  it("fills missing params with their defaults", () => {
    const parsed = parsePatch(withNode(1, { params: { waveform: "square" } }));

    expect(parsed.nodes[1].params).toEqual({
      waveform: "square",
      mode: "free",
      frequency: 440,
      detune: 0,
      shape: defaultParams("oscillator").shape,
      harmonics: defaultParams("oscillator").harmonics,
    });
  });

  it("keeps node names, trimmed", () => {
    const parsed = parsePatch(withNode(0, { name: "  Wobble  " }));

    expect(parsed.nodes[0].name).toBe("Wobble");
  });

  it("drops empty node names", () => {
    const parsed = parsePatch(withNode(0, { name: "   " }));

    expect(parsed.nodes[0]).not.toHaveProperty("name");
  });

  it("reads the swing, and leaves a file without one straight", () => {
    expect(parsePatch(file({ swing: 66 })).swing).toBe(66);
    expect(parsePatch(file({})).swing).toBeUndefined();
  });

  it("reads what the swing holds back, and leaves a file without it, or with the sixteenths, on the sixteenths", () => {
    expect(parsePatch(file({ swingGrid: "1/8" })).swingGrid).toBe("1/8");
    expect(parsePatch(file({}))).not.toHaveProperty("swingGrid");
    expect(parsePatch(file({ swingGrid: "1/16" }))).not.toHaveProperty("swingGrid");
  });

  it("reads the meter, and leaves a file without one, or with four beats, in four", () => {
    expect(parsePatch(file({ meter: [3, 2] })).meter).toEqual([3, 2]);
    expect(parsePatch(file({}))).not.toHaveProperty("meter");
    expect(parsePatch(file({ meter: [4] }))).not.toHaveProperty("meter");
  });

  it("reads a meter in eighths", () => {
    expect(parsePatch(file({ meter: { eighths: [3, 3] } })).meter).toEqual({ eighths: [3, 3] });
    expect(parsePatch(file({ meter: { eighths: [3, 3, 3, 3] } })).meter).toEqual({ eighths: [3, 3, 3, 3] });
  });

  it("uses the default tempo for files without one", () => {
    expect(parsePatch(file({ tempo: undefined })).tempo).toBe(120);
  });

  it("takes the tempo of an old arpeggiator or sequencer as the tempo of the patch", () => {
    const old = file({
      tempo: undefined,
      nodes: [
        ...patch.nodes,
        { id: "sequencer-4", type: "sequencer", position: { x: 0, y: 0 }, params: { tempo: 84 } },
      ],
    });

    const parsed = parsePatch(old);

    expect(parsed.tempo).toBe(84);
    expect(parsed.nodes[3].params).not.toHaveProperty("tempo");
  });

  it("leaves the octave of an old keyboard to the keys, from C", () => {
    const parsed = parsePatch(
      file({
        nodes: [
          { id: "keyboard-1", type: "keyboard", position: { x: 0, y: 0 }, params: { octave: -1 } },
          { id: "arpeggiator-2", type: "arpeggiator", position: { x: 0, y: 0 }, params: { octave: 2 } },
          { id: "sequencer-3", type: "sequencer", position: { x: 0, y: 0 }, params: { octave: -2 } },
        ],
        connections: [],
      }),
    );

    expect(parsed.nodes[0].params).toEqual({ transpose: 0 });
    // An arpeggiator keeps it, for the notes of its own; the keys do not use it.
    expect(parsed.nodes[1].params).toMatchObject({ transpose: 0, octave: 2 });
    // A sequencer keeps its octave: it is not played from the keys.
    expect(parsed.nodes[2].params).toMatchObject({ octave: -2 });
  });

  it("keeps the trace a scope holds still on, and refuses one that is not a cable id", () => {
    const scoped = (trigger: unknown) =>
      file({
        nodes: [...patch.nodes, { id: "scope-4", type: "scope", position: { x: 0, y: 0 }, params: { trigger } }],
      });

    expect(parsePatch(scoped("lfo-1:out->scope-4:control")).nodes[3].params).toMatchObject({
      trigger: "lfo-1:out->scope-4:control",
    });
    expect(parsePatch(file({ nodes: [...patch.nodes, { id: "scope-4", type: "scope", position: { x: 0, y: 0 } }] }))
      .nodes[3].params).toMatchObject({ trigger: "" });
    expect(() => parsePatch(scoped(7))).toThrow(PatchFormatError);
    expect(() => parsePatch(scoped("x".repeat(201)))).toThrow(PatchFormatError);
  });

  it("says when a patch was saved by a newer Trama", () => {
    expect(() => parsePatch(file({ version: 2 }))).toThrow(/saved by a newer version of Trama/);
  });

  it("drops params the module does not know", () => {
    const parsed = parsePatch(withNode(0, { params: { waveform: "sine", rate: 1, depth: 0.5 } }));

    expect(parsed.nodes[0].params).toEqual({ waveform: "sine", sync: "free", rate: 1 });
  });

  it.each([
    ["a non-object", "hello"],
    ["null", null],
    ["a missing version", { nodes: [], connections: [] }],
    ["an unknown version", file({ version: 2 })],
    ["a tempo that is not a number", file({ tempo: "fast" })],
    ["a tempo out of range", file({ tempo: 1000 })],
    ["a swing that is not a number", file({ swing: "lazy" })],
    ["a swing out of range", file({ swing: 90 })],
    ["a swing on an unknown grid", file({ swingGrid: "1/4" })],
    ["a meter that is not a list of groups", file({ meter: "3/4" })],
    ["a meter with a group of no beats", file({ meter: [3, 0] })],
    ["a meter of more than sixteen beats", file({ meter: [9, 9] })],
    ["a meter in eighths not in groups of three", file({ meter: { eighths: [2, 2, 3] } })],
    ["a meter in eighths that do not fill whole quarters", file({ meter: { eighths: [3] } })],
    ["missing nodes", file({ nodes: undefined })],
    ["missing connections", file({ connections: undefined })],
    ["an unknown module type", withNode(0, { type: "theremin" })],
    ["a node without id", withNode(0, { id: undefined })],
    ["a duplicate node id", withNode(1, { id: "lfo-1" })],
    ["a bad position", withNode(0, { position: { x: "1", y: 2 } })],
    ["a name that is not text", withNode(0, { name: 42 })],
    ["a name that is too long", withNode(0, { name: "x".repeat(41) })],
    ["a text in a number param", withNode(0, { params: { waveform: "sine", rate: "fast" } })],
    ["a number out of range", withNode(0, { params: { waveform: "sine", rate: 9999 } })],
    ["an unknown option", withNode(0, { params: { waveform: "noise", rate: 1 } })],
    [
      "a connection to an unknown node",
      withConnections([
        { id: "c", source: { nodeId: "lfo-1", port: "out" }, target: { nodeId: "x", port: "frequency" } },
      ]),
    ],
    [
      "an incompatible connection",
      withConnections([
        {
          id: "c",
          source: { nodeId: "lfo-1", port: "out" },
          target: { nodeId: "output-3", port: "audio" },
        },
      ]),
    ],
    [
      "an amount out of range",
      withConnections([{ ...patch.connections[0], amount: 2 }]),
    ],
    ["a mute that is not true or false", withConnections([{ ...patch.connections[1], mute: "yes" }])],
    ["a solo that is not true or false", withConnections([{ ...patch.connections[1], solo: 1 }])],
    [
      "a duplicate connection id",
      withConnections([patch.connections[1], { ...patch.connections[0], id: patch.connections[1].id }]),
    ],
    ["a malformed connection", withConnections([{ id: "c", source: "lfo-1" }])],
  ])("rejects %s", (_name, input) => {
    expect(() => parsePatch(input)).toThrow(PatchFormatError);
  });

  it("explains what is wrong", () => {
    expect(() => parsePatch(withNode(0, { type: "theremin" }))).toThrow(/theremin/);
  });
});

describe("sequences", () => {
  const withSteps = (steps: unknown) => ({
    version: 1,
    nodes: [{ id: "sequencer-1", type: "sequencer", position: { x: 0, y: 0 }, params: { steps } }],
    connections: [],
  });
  const valid = "C4 - D#4 - F4 - G4 - A#4 - G4 - F4 - C5 -";

  it("loads a valid sequence and fills the other params", () => {
    const parsed = parsePatch(withSteps(valid));

    expect(parsed.nodes[0].params).toMatchObject({ steps: valid, division: "1/16", length: 16 });
  });

  it.each([
    ["too few steps", "C4 - D4"],
    ["a note below the grid", valid.replace("C4", "B3")],
    ["a note above the grid", valid.replace("C5", "C7")],
    ["something that is not a note", valid.replace("D#4", "X")],
    ["a number", 60],
  ])("rejects %s", (_name, steps) => {
    expect(() => parsePatch(withSteps(steps))).toThrow(PatchFormatError);
  });
});

describe("notes of an arpeggiator", () => {
  const withNotes = (notes: unknown) => ({
    version: 1,
    nodes: [{ id: "arpeggiator-1", type: "arpeggiator", position: { x: 0, y: 0 }, params: { source: "notes", notes } }],
    connections: [],
  });

  it("loads its notes, or none", () => {
    expect(parsePatch(withNotes("C4 E4 G4")).nodes[0].params).toMatchObject({ source: "notes", notes: "C4 E4 G4" });
    expect(parsePatch(withNotes("")).nodes[0].params).toMatchObject({ notes: "" });
  });

  it.each([
    ["a note below the piano", "B3 E4"],
    ["a note above the piano", "C4 D5"],
    ["something that is not a note", "C4 X"],
    ["a number", 60],
  ])("rejects %s", (_name, notes) => {
    expect(() => parsePatch(withNotes(notes))).toThrow(PatchFormatError);
  });
});

describe("rhythm of an arpeggiator", () => {
  const withRhythm = (rhythm: unknown) => ({
    version: 1,
    nodes: [{ id: "arpeggiator-1", type: "arpeggiator", position: { x: 0, y: 0 }, params: { rhythm, length: 4 } }],
    connections: [],
  });

  it("loads its rhythm and its length", () => {
    const rhythm = "x - x x x x x x x x x x x x x x";
    expect(parsePatch(withRhythm(rhythm)).nodes[0].params).toMatchObject({ rhythm, length: 4 });
  });

  it("gives an old arpeggiator a rhythm where every step sounds", () => {
    const patch = parsePatch({
      version: 1,
      nodes: [{ id: "arpeggiator-1", type: "arpeggiator", position: { x: 0, y: 0 }, params: {} }],
      connections: [],
    });

    expect(patch.nodes[0].params).toMatchObject({ rhythm: Array(16).fill("x").join(" "), length: 8 });
  });

  it.each([
    ["too few steps", "x - x x"],
    ["something that is not a step", "x - o x x x x x x x x x x x x x"],
    ["a number", 1],
  ])("rejects %s", (_name, rhythm) => {
    expect(() => parsePatch(withRhythm(rhythm))).toThrow(PatchFormatError);
  });
});

describe("mixer channels", () => {
  it("loads the mute and solo of a cable, and leaves them out when off", () => {
    const loaded = parsePatch(
      withConnections([
        { ...patch.connections[0] },
        { ...patch.connections[1], amount: 0.5, mute: true, solo: false },
      ]),
    );

    expect(loaded.connections[1]).toEqual({ ...patch.connections[1], amount: 0.5, mute: true });
    expect(loaded.connections[0]).not.toHaveProperty("mute");
  });

  it("loads the pan of a cable, and leaves it out when centred", () => {
    const loaded = parsePatch(
      withConnections([
        { ...patch.connections[0], pan: 0 },
        { ...patch.connections[1], pan: -0.75 },
      ]),
    );

    expect(loaded.connections[1].pan).toBe(-0.75);
    expect(loaded.connections[0]).not.toHaveProperty("pan");
  });

  it.each([2, -1.5, "left"])("rejects a pan of %s", (pan) => {
    expect(() => parsePatch(withConnections([patch.connections[0], { ...patch.connections[1], pan }]))).toThrow(
      PatchFormatError,
    );
  });
});

describe("drawn wave of an oscillator", () => {
  const withShape = (shape: unknown) => ({
    version: 1,
    nodes: [{ id: "oscillator-1", type: "oscillator", position: { x: 0, y: 0 }, params: { waveform: "drawn", shape } }],
    connections: [],
  });
  const flat = (value: string) => Array(64).fill(value).join(" ");

  it("loads its shape", () => {
    const shape = flat("0.5");
    expect(parsePatch(withShape(shape)).nodes[0].params).toMatchObject({ waveform: "drawn", shape });
  });

  it("gives an old oscillator a shape and harmonics", () => {
    const patch = parsePatch({
      version: 1,
      nodes: [{ id: "oscillator-1", type: "oscillator", position: { x: 0, y: 0 }, params: { waveform: "square" } }],
      connections: [],
    });

    expect(parsePatch(serializePatch(patch)).nodes[0].params.shape).toMatch(/^(-?[\d.]+ ){63}-?[\d.]+$/);
    expect(patch.nodes[0].params.harmonics).toMatch(/^([\d.]+ ){15}[\d.]+$/);
  });

  it.each([
    ["too few points", "0 0.5 1"],
    ["a point out of range", `${flat("0")} `.replace(/^0/, "1.5")],
    ["something that is not a number", flat("0").replace(/^0/, "x")],
    ["a number", 1],
  ])("rejects %s", (_name, shape) => {
    expect(() => parsePatch(withShape(shape))).toThrow(PatchFormatError);
  });
});

describe("curves in a saved patch", () => {
  const oscillator = (params: Record<string, string>) => ({
    nodes: [
      {
        id: "oscillator-1",
        type: "oscillator" as const,
        position: { x: 0, y: 0 },
        params: { ...defaultParams("oscillator"), ...params },
      },
    ],
    connections: [],
    tempo: 120,
  });

  it("leaves out the curves left as they were, and gets them back on load", () => {
    const saved = serializePatch(oscillator({}));

    expect(saved.nodes[0].params).not.toHaveProperty("shape");
    expect(saved.nodes[0].params).not.toHaveProperty("harmonics");
    expect(saved.nodes[0].params).toMatchObject({ waveform: "sine", frequency: 440 });
    expect(parsePatch(saved)).toEqual(oscillator({}));
  });

  it("keeps a curve that was drawn", () => {
    expect(serializePatch(oscillator({ shape })).nodes[0].params).toMatchObject({ shape });
  });
});

describe("patterns of a sequencer", () => {
  const rest = "- - - - - - - - - - - - - - -";
  const withPatterns = (patterns: unknown, params: Record<string, unknown> = {}) => ({
    version: 1,
    nodes: [
      {
        id: "sequencer-1",
        type: "sequencer",
        position: { x: 0, y: 0 },
        params: { steps: `C4 ${rest}`, ...params },
        ...(patterns !== undefined && { patterns }),
      },
    ],
    connections: [],
  });

  it("loads the patterns it has, and copies pattern A1 into the ones it has not", () => {
    const patch = parsePatch(withPatterns({ C5: { steps: `G4 ${rest}`, length: 8 } }));

    expect(Object.keys(patch.nodes[0].patterns ?? {})).toHaveLength(31);
    expect(patch.nodes[0].patterns?.C5).toEqual({ length: 8, root: "C", scale: "pentatonic minor", chord: "off", steps: `G4 ${rest}` });
    expect(patch.nodes[0].patterns?.A2).toEqual({ length: 16, root: "C", scale: "pentatonic minor", chord: "off", steps: `C4 ${rest}` });
  });

  it("loads the patterns B to D of a file from before the banks as A2 to A4", () => {
    const patch = parsePatch(withPatterns({ B: { steps: `D4 ${rest}` }, D: { steps: `G4 ${rest}` } }));

    expect(patch.nodes[0].patterns?.A2?.steps).toBe(`D4 ${rest}`);
    expect(patch.nodes[0].patterns?.A4?.steps).toBe(`G4 ${rest}`);
    expect(Object.keys(serializePatch(patch).nodes[0].patterns ?? {})).toEqual(["A2", "A4"]);
  });

  it("gives an old sequencer copies of what it plays", () => {
    const patch = parsePatch(withPatterns(undefined, { length: 4 }));

    expect(patch.nodes[0].patterns?.D8).toMatchObject({ length: 4, steps: `C4 ${rest}` });
  });

  it("leaves out the patterns that are the same as pattern A1", () => {
    const saved = serializePatch(parsePatch(withPatterns({ C5: { steps: `G4 ${rest}` } })));

    expect(saved.nodes[0].patterns).toEqual({ C5: { length: 16, root: "C", scale: "pentatonic minor", chord: "off", steps: `G4 ${rest}` } });
    expect(serializePatch(parsePatch(withPatterns(undefined))).nodes[0]).not.toHaveProperty("patterns");
  });

  it.each([
    ["a bank that does not exist", { E1: { steps: `G4 ${rest}` } }],
    ["a number past the eighth", { A9: { steps: `G4 ${rest}` } }],
    ["pattern A1, which is in the params", { A1: { steps: `G4 ${rest}` } }],
    ["an invalid value in a pattern", { B: { steps: "G4 -" } }],
    ["a pattern that is not an object", { B: "G4" }],
    ["patterns that are not an object", ["B"]],
  ])("rejects %s", (_name, patterns) => {
    expect(() => parsePatch(withPatterns(patterns))).toThrow(PatchFormatError);
  });

  it("has no patterns on modules that do not play them", () => {
    const patch = parsePatch({
      version: 1,
      nodes: [{ id: "lfo-1", type: "lfo", position: { x: 0, y: 0 }, params: {}, patterns: { B: {} } }],
      connections: [],
    });

    expect(patch.nodes[0]).not.toHaveProperty("patterns");
  });
});

describe("rows of a Drums", () => {
  it("loads a Drums saved with four rows, the new ones silent in every pattern", () => {
    const rest = "- - - - - - - - - - - - - - - -";
    const four = { kick: `x ${rest.slice(2)}`, snare: rest, hat: rest, open: rest, accent: rest };
    const patch = parsePatch({
      version: 1,
      nodes: [
        {
          id: "drums-1",
          type: "drums",
          position: { x: 0, y: 0 },
          params: { division: "1/16", gate: 0.05, launch: "bar", length: 16, ...four },
          patterns: { A2: { length: 8, ...four, snare: `x ${rest.slice(2)}` } },
        },
      ],
      connections: [],
    });
    const drums = patch.nodes[0];

    expect(drums.params).toMatchObject({ clap: rest, rim: rest, lowtom: rest, hightom: rest, kick: four.kick });
    expect(drums.patterns?.A2).toMatchObject({ length: 8, clap: rest, hightom: rest, snare: `x ${rest.slice(2)}` });
  });
});

describe("notes of a clip", () => {
  const withNotes = (notes: unknown) => ({
    version: 1,
    nodes: [{ id: "clip-1", type: "clip", position: { x: 0, y: 0 }, params: { notes, bars: 2 } }],
    connections: [],
  });

  it("loads its notes and its bars", () => {
    expect(parsePatch(withNotes("C4@0+1 A5@7.5+0.5")).nodes[0].params).toMatchObject({
      notes: "C4@0+1 A5@7.5+0.5",
      bars: 2,
    });
  });

  it("loads an empty clip", () => {
    expect(parsePatch(withNotes("")).nodes[0].params.notes).toBe("");
  });

  it.each([
    ["a note below the piano roll", "B0@0+1"],
    ["a note above it", "C#7@0+1"],
    ["something that is not a note", "C4@0"],
    ["a number", 60],
  ])("rejects %s", (_name, notes) => {
    expect(() => parsePatch(withNotes(notes))).toThrow(PatchFormatError);
  });
});

describe("samples", () => {
  const id = "0123456789abcdef";
  const withSample = (sample: unknown) => ({
    version: 1,
    nodes: [{ id: "sampler-1", type: "sampler", position: { x: 0, y: 0 }, params: { sample } }],
    connections: [],
  });
  const bytes = (data: ArrayBuffer) => [...new Uint8Array(data)];

  it("loads the sample of a sampler, or none", () => {
    expect(parsePatch(withSample(id)).nodes[0].params.sample).toBe(id);
    expect(parsePatch(withSample("")).nodes[0].params.sample).toBe("");
  });

  it("loads the several samples of a sampler", () => {
    expect(parsePatch(withSample(`${id} fedcba9876543210`)).nodes[0].params.sample).toBe(`${id} fedcba9876543210`);
  });

  it.each([
    ["an id that is not one", "kick.wav"],
    ["a number", 1],
    ["an id that is not one among the samples", `${id} kick.wav`],
    ["more samples than a sampler holds", Array(9).fill(id).join(" ")],
  ])("rejects %s", (_name, sample) => {
    expect(() => parsePatch(withSample(sample))).toThrow(PatchFormatError);
  });

  it("saves the samples it is given with the patch, in base64, and loads them back", () => {
    const data = new Uint8Array([1, 2, 255]).buffer;
    const file = serializePatch(parsePatch(withSample(id)), [{ id, name: "kick.wav", type: "audio/wav", data }]);

    expect(file.samples).toEqual({ [id]: { name: "kick.wav", type: "audio/wav", data: "AQL/" } });
    const [record] = parseSamples(JSON.parse(JSON.stringify(file)));
    expect({ ...record, data: bytes(record.data) }).toEqual({ id, name: "kick.wav", type: "audio/wav", data: [1, 2, 255] });
  });

  it("leaves the samples out when there are none", () => {
    expect(serializePatch(parsePatch(withSample(""))).samples).toBeUndefined();
    expect(parseSamples(withSample(""))).toEqual([]);
  });

  it.each([
    ["not a list by id", []],
    ["an invalid id", { "kick.wav": { name: "kick.wav", type: "", data: "" } }],
    ["a sample without a name", { [id]: { type: "", data: "" } }],
    ["data that is not base64", { [id]: { name: "a", type: "", data: "***" } }],
  ])("rejects samples with %s", (_name, samples) => {
    expect(() => parseSamples({ ...withSample(id), samples })).toThrow(PatchFormatError);
  });
});

describe("presets", () => {
  it("keeps a node like a patch file, without id or place, and reads it back", () => {
    const preset = { type: "oscillator" as const, params: { ...defaultParams("oscillator"), frequency: 220 } };

    const kept = serializePresetNode(preset);

    expect(kept).toEqual({ type: "oscillator", params: { waveform: "sine", mode: "free", frequency: 220, detune: 0 } });
    expect(parsePresetNode(JSON.parse(JSON.stringify(kept)))).toEqual(preset);
  });

  it("reads a subpatch with its inside and what it publishes", () => {
    const inside = { nodes: [{ id: "gain-2", type: "gain", position: { x: 0, y: 0 }, params: { gain: 0.3 } }], connections: [] };
    const read = parsePresetNode({ type: "subpatch", params: { voices: 2 }, patch: inside, published: [{ node: "gain-2", param: "gain" }] });

    expect(read).toMatchObject({ type: "subpatch", params: { voices: 2 }, published: [{ node: "gain-2", param: "gain" }] });
    expect(read.patch?.nodes[0].params.gain).toBe(0.3);
  });

  it.each([
    ["something that is not a node", 3],
    ["an unknown type", { type: "theremin", params: {} }],
    ["a value out of range", { type: "gain", params: { gain: 7 } }],
  ])("rejects %s", (_name, preset) => {
    expect(() => parsePresetNode(preset)).toThrow(PatchFormatError);
  });
});

describe("presets files", () => {
  const dark = { name: "Dark", node: { type: "filter" as const, params: { ...defaultParams("filter"), frequency: 300 } } };
  const kick = { id: "0123456789abcdef", name: "kick.wav", type: "audio/wav", data: new Uint8Array([1, 2]).buffer };

  it("carries the presets and the samples they play, and reads them back", () => {
    const file = JSON.parse(JSON.stringify(serializePresets([dark], [kick])));

    expect(file).toMatchObject({ kind: "trama-presets", version: 1, presets: [{ name: "Dark" }] });
    expect(isPresetsFile(file)).toBe(true);
    const read = parsePresets(file);
    expect(read.presets).toEqual([dark]);
    expect(read.samples.map(({ id, name }) => ({ id, name }))).toEqual([{ id: kick.id, name: "kick.wav" }]);
  });

  it("leaves the samples out when none is played", () => {
    expect(serializePresets([dark]).samples).toBeUndefined();
  });

  it("reads a presets file saved when the app was called audiojac", () => {
    const file = { ...JSON.parse(JSON.stringify(serializePresets([dark]))), kind: "audiojac-presets" };

    expect(isPresetsFile(file)).toBe(true);
    expect(parsePresets(file).presets).toEqual([dark]);
  });

  it("is not taken for a patch, nor a patch for it", () => {
    expect(isPresetsFile(serializePatch({ nodes: [], connections: [], tempo: 120 }))).toBe(false);
    expect(() => parsePresets({ version: 1, nodes: [], connections: [] })).toThrow(PatchFormatError);
  });

  it.each([
    ["another version", { kind: "trama-presets", version: 2, presets: [] }],
    ["no list of presets", { kind: "trama-presets", version: 1 }],
    ["a preset without a name", { kind: "trama-presets", version: 1, presets: [{ node: { type: "gain", params: {} } }] }],
  ])("rejects a file with %s", (_name, file) => {
    expect(() => parsePresets(file)).toThrow(PatchFormatError);
  });

  it("says when presets were saved by a newer Trama", () => {
    expect(() => parsePresets({ kind: "trama-presets", version: 2, presets: [] })).toThrow(
      /These presets were saved by a newer version of Trama/,
    );
  });

  it("names the preset that is wrong", () => {
    const file = { kind: "trama-presets", version: 1, presets: [{ name: "Loud", node: { type: "gain", params: { gain: 9 } } }] };

    expect(() => parsePresets(file)).toThrow(/Preset "Loud": .*gain/);
  });
});

describe("accents and ties of a sequencer", () => {
  it("loads steps with accents and ties", () => {
    const steps = "C4! _ _ - D#4 G4! _ - - - - - - - - -";
    const patch = parsePatch({
      version: 1,
      nodes: [{ id: "sequencer-1", type: "sequencer", position: { x: 0, y: 0 }, params: { steps } }],
      connections: [],
    });

    expect(patch.nodes[0].params.steps).toBe(steps);
  });
});

describe("subpatches", () => {
  const voice = {
    id: "subpatch-2",
    type: "subpatch",
    name: "Voice",
    position: { x: 0, y: 0 },
    params: {},
    patch: {
      nodes: [
        { id: "inlet-3", type: "inlet", position: { x: 0, y: 0 }, params: { signal: "audio" } },
        { id: "filter-4", type: "filter", position: { x: 0, y: 0 }, params: {} },
        { id: "outlet-5", type: "outlet", position: { x: 0, y: 0 }, params: { signal: "audio" } },
      ],
      connections: [
        { id: "a", source: { nodeId: "inlet-3", port: "out" }, target: { nodeId: "filter-4", port: "audio" } },
        { id: "b", source: { nodeId: "filter-4", port: "audio" }, target: { nodeId: "outlet-5", port: "in" } },
      ],
    },
  };
  const file = (subpatch: unknown, connections: unknown[] = []) => ({
    version: 1,
    nodes: [
      { id: "oscillator-1", type: "oscillator", position: { x: 0, y: 0 }, params: {} },
      subpatch,
      { id: "output-6", type: "output", position: { x: 0, y: 0 }, params: {} },
    ],
    connections,
  });
  const outer = [
    { id: "in", source: { nodeId: "oscillator-1", port: "audio" }, target: { nodeId: "subpatch-2", port: "inlet-3" } },
    { id: "out", source: { nodeId: "subpatch-2", port: "outlet-5" }, target: { nodeId: "output-6", port: "audio" } },
  ];

  it("loads the graph inside a subpatch, and the cables into and out of it", () => {
    const patch = parsePatch(file(voice, outer));

    expect(patch.nodes[1].patch?.nodes.map(({ id }) => id)).toEqual(["inlet-3", "filter-4", "outlet-5"]);
    expect(patch.nodes[1].patch?.connections).toHaveLength(2);
    expect(patch.connections.map(({ id }) => id)).toEqual(["in", "out"]);
  });

  it("gives a subpatch with nothing inside an empty graph", () => {
    const { patch: _inside, ...empty } = voice;

    expect(parsePatch(file(empty)).nodes[1].patch).toEqual({ nodes: [], connections: [] });
  });

  it("saves and loads a subpatch as it was", () => {
    const patch = parsePatch(file(voice, outer));

    expect(parsePatch(JSON.parse(JSON.stringify(serializePatch(patch))))).toEqual(patch);
    expect(serializePatch(patch).nodes[0]).not.toHaveProperty("patch");
  });

  it("saves and loads the params published on a subpatch, and writes none while there are none", () => {
    const published = [
      { node: "filter-4", param: "frequency", name: "Cutoff", section: "Filter" },
      { node: "filter-4", param: "type" },
    ];
    const patch = parsePatch(file({ ...voice, published }, outer));

    expect(patch.nodes[1].published).toEqual(published);
    expect(serializePatch(patch).nodes[1].published).toEqual(published);
    expect(serializePatch(parsePatch(file(voice, outer))).nodes[1]).not.toHaveProperty("published");
  });

  it("saves and loads the screens and grids published on a subpatch", () => {
    const players = [
      { id: "sampler-7", type: "sampler", position: { x: 0, y: 0 }, params: {} },
      { id: "clip-8", type: "clip", position: { x: 0, y: 0 }, params: {} },
      { id: "drums-9", type: "drums", position: { x: 0, y: 0 }, params: {} },
      { id: "sequencer-10", type: "sequencer", position: { x: 0, y: 0 }, params: {} },
      { id: "arpeggiator-11", type: "arpeggiator", position: { x: 0, y: 0 }, params: {} },
    ];
    const published = [
      { node: "sampler-7", param: "sample" },
      { node: "clip-8", param: "notes" },
      { node: "drums-9", param: "kick" },
      { node: "sequencer-10", param: "steps" },
      { node: "arpeggiator-11", param: "notes" },
    ];
    const patch = parsePatch(file({ ...voice, patch: { ...voice.patch, nodes: [...voice.patch.nodes, ...players] }, published }, outer));

    expect(patch.nodes[1].published).toEqual(published);
    expect(serializePatch(patch).nodes[1].published).toEqual(published);
  });

  it("saves and loads a knob of a subpatch inside a subpatch published again outside, and rejects one it does not publish", () => {
    const inner = { ...voice, published: [{ node: "filter-4", param: "frequency" }] };
    const around = (published: unknown) => ({
      id: "subpatch-7",
      type: "subpatch",
      position: { x: 0, y: 0 },
      params: {},
      patch: { nodes: [inner], connections: [] },
      published,
    });
    const published = [{ node: "subpatch-2", param: "filter-4.frequency", name: "Cutoff" }];
    const patch = parsePatch(file(around(published)));

    expect(patch.nodes[1].published).toEqual(published);
    expect(serializePatch(patch).nodes[1].published).toEqual(published);
    expect(() => parsePatch(file(around([{ node: "subpatch-2", param: "filter-4.Q" }])))).toThrow(PatchFormatError);
  });

  it.each([
    ["a node that is not inside", [{ node: "nope", param: "frequency" }]],
    ["a curve", [{ node: "oscillator-12", param: "shape" }]],
    ["a reference cable", [{ node: "scope-13", param: "trigger" }]],
    ["a param the node has not", [{ node: "filter-4", param: "nope" }]],
    ["a name too long", [{ node: "filter-4", param: "Q", name: "x".repeat(41) }]],
    ["a section too long", [{ node: "filter-4", param: "Q", section: "x".repeat(41) }]],
    ["a section that is not a text", [{ node: "filter-4", param: "Q", section: 3 }]],
    ["something that is not a list", { node: "filter-4", param: "Q" }],
  ])("rejects a published param on %s", (_name, published) => {
    const others = [
      { id: "oscillator-12", type: "oscillator", position: { x: 0, y: 0 }, params: {} },
      { id: "scope-13", type: "scope", position: { x: 0, y: 0 }, params: {} },
    ];
    const inside = { ...voice.patch, nodes: [...voice.patch.nodes, ...others] };
    expect(() => parsePatch(file({ ...voice, patch: inside, published }, outer))).toThrow(PatchFormatError);
  });

  it("loads a subpatch saved before it had voices with a single one", () => {
    expect(parsePatch(file(voice, outer)).nodes[1].params).toEqual({ voices: 1 });
  });

  it("carries notes into a subpatch, but not out of it", () => {
    const notes = { ...voice.patch.nodes[0], params: { signal: "notes" } };
    const inside = { nodes: [notes, ...voice.patch.nodes.slice(1)], connections: [voice.patch.connections[1]] };
    const outlet = { ...voice.patch.nodes[2], params: { signal: "notes" } };

    expect(parsePatch(file({ ...voice, patch: inside })).nodes[1].patch?.nodes[0].params.signal).toBe("notes");
    expect(() => parsePatch(file({ ...voice, patch: { nodes: [outlet], connections: [] } }))).toThrow(PatchFormatError);
  });

  it.each([
    ["a cable to a port the subpatch does not have", [{ ...outer[0], target: { nodeId: "subpatch-2", port: "nope" } }]],
    ["a cable inside to a node that is not there", [], { ...voice.patch.connections[0], target: { nodeId: "x", port: "audio" } }],
    ["a node inside of an unknown type", [], undefined, { id: "x-9", type: "nope", position: { x: 0, y: 0 }, params: {} }],
  ])("rejects %s", (_name, connections, innerConnection?, innerNode?) => {
    const inside = {
      nodes: [...voice.patch.nodes, ...(innerNode ? [innerNode] : [])],
      connections: [...voice.patch.connections, ...(innerConnection ? [innerConnection] : [])],
    };

    expect(() => parsePatch(file({ ...voice, patch: inside }, connections as unknown[]))).toThrow(PatchFormatError);
  });
});

describe("songs", () => {
  const withSong = (song: unknown) => ({
    version: 1,
    tempo: 120,
    nodes: [
      { id: "sequencer-1", type: "sequencer", position: { x: 0, y: 0 }, params: {} },
      {
        id: "subpatch-2",
        type: "subpatch",
        position: { x: 0, y: 0 },
        params: {},
        patch: { nodes: [{ id: "clip-3", type: "clip", position: { x: 0, y: 0 }, params: {} }], connections: [] },
      },
    ],
    connections: [],
    ...(song !== undefined && { song }),
  });
  const song = { bars: 4, rows: { "sequencer-1": "A1 B2 - C3", "subpatch-2/clip-3": "- D8 - -" }, loop: { start: 1, length: 2 } };

  it("writes the song of the patch, and nothing without one", () => {
    const parsed = parsePatch(withSong(song));

    expect(serializePatch(parsed).song).toEqual(song);
    expect(serializePatch(patch)).not.toHaveProperty("song");
  });

  it("reads and writes the fade at the end of a song", () => {
    const parsed = parsePatch(withSong({ bars: 4, rows: {}, fade: 2 }));

    expect(parsed.song?.fade).toBe(2);
    expect(serializePatch(parsed).song?.fade).toBe(2);
  });

  it("reads a song with its rows and its loop", () => {
    expect(parsePatch(withSong(song)).song).toEqual(song);
    expect(parsePatch(withSong(undefined))).not.toHaveProperty("song");
  });

  it("reads and writes the points of a lane reached in a ramp", () => {
    const automation = { "sequencer-1.glide": "0:0 8~200 12:0" };
    const parsed = parsePatch(withSong({ bars: 4, rows: {}, automation }));

    expect(serializePatch(parsed).song?.automation).toEqual(automation);
  });

  it("reads the dots that stop a node", () => {
    expect(parsePatch(withSong({ bars: 4, rows: { "sequencer-1": "A1 . - B2" } })).song?.rows).toEqual({
      "sequencer-1": "A1 . - B2",
    });
  });

  it("fills short rows with dashes", () => {
    expect(parsePatch(withSong({ bars: 4, rows: { "sequencer-1": "A1 B1" } })).song?.rows).toEqual({
      "sequencer-1": "A1 B1 - -",
    });
  });

  it("drops the rows of nodes that are not in the patch or have no patterns", () => {
    const rows = { "sequencer-1": "A1 - - -", "clip-3": "B1 - - -", "subpatch-2": "C1 - - -" };

    expect(parsePatch(withSong({ bars: 4, rows })).song?.rows).toEqual({ "sequencer-1": "A1 - - -" });
  });

  it("reads the rows of a song from before the banks, their letters as A1 to A4", () => {
    expect(parsePatch(withSong({ bars: 4, rows: { "sequencer-1": "A B - D" } })).song?.rows).toEqual({
      "sequencer-1": "A1 A2 - A4",
    });
  });

  it("reads and writes the lanes of the controls", () => {
    const automation = { "sequencer-1.gate": "0:0.5 2.25:0.8", "subpatch-2/clip-3.octave": "4:1" };
    const parsed = parsePatch(withSong({ bars: 4, rows: {}, automation }));

    expect(parsed.song?.automation).toEqual(automation);
    expect(serializePatch(parsed).song?.automation).toEqual(automation);
  });

  it("drops the lanes of nodes and cables that are not in the patch", () => {
    const automation = { "sequencer-1.gate": "0:0.5", "filter-9.cutoff": "0:100" };

    expect(parsePatch(withSong({ bars: 4, rows: {}, automation })).song?.automation).toEqual({ "sequencer-1.gate": "0:0.5" });
  });

  it("reads the points of the lanes up to the end of the song in bars of the meter", () => {
    const lane = (points: string) => ({ bars: 4, rows: {}, automation: { "sequencer-1.gate": points } });

    expect(parsePatch({ ...withSong(lane("11.5:1")), meter: [3] }).song?.automation).toEqual({ "sequencer-1.gate": "11.5:1" });
    expect(() => parsePatch({ ...withSong(lane("12:1")), meter: [3] })).toThrow(PatchFormatError);
    expect(parsePatch({ ...withSong(lane("19:1")), meter: [3, 2] }).song?.automation).toEqual({ "sequencer-1.gate": "19:1" });
    const sixEight = { eighths: [3, 3] };
    expect(parsePatch({ ...withSong(lane("11.5:1")), meter: sixEight }).song?.automation).toEqual({ "sequencer-1.gate": "11.5:1" });
    expect(() => parsePatch({ ...withSong(lane("12:1")), meter: sixEight })).toThrow(PatchFormatError);
  });

  it.each([
    ["a song that is not an object", "ABBA"],
    ["no bars", { rows: {} }],
    ["bars that are not a whole number", { bars: 2.5, rows: {} }],
    ["too many bars", { bars: 1000, rows: {} }],
    ["rows that are not an object", { bars: 4, rows: [] }],
    ["a row that is not text", { bars: 4, rows: { "sequencer-1": 4 } }],
    ["a row with something other than patterns and dashes", { bars: 4, rows: { "sequencer-1": "A1 E1 - -" } }],
    ["a row with a pattern past the eighth", { bars: 4, rows: { "sequencer-1": "A9 - - -" } }],
    ["a row longer than the song", { bars: 2, rows: { "sequencer-1": "A1 B1 C1" } }],
    ["a loop that is not an object", { bars: 4, rows: {}, loop: 2 }],
    ["a loop past the end", { bars: 4, rows: {}, loop: { start: 2, length: 3 } }],
    ["an empty loop", { bars: 4, rows: {}, loop: { start: 0, length: 0 } }],
    ["automation that is not an object", { bars: 4, rows: {}, automation: "loud" }],
    ["a control without a name", { bars: 4, rows: {}, automation: { "sequencer-1": "0:1" } }],
    ["a lane that is not points", { bars: 4, rows: {}, automation: { "sequencer-1.gate": "soft" } }],
    ["a point past the end", { bars: 4, rows: {}, automation: { "sequencer-1.gate": "16:1" } }],
    ["a fade that is not a whole number of bars", { bars: 4, rows: {}, fade: 1.5 }],
    ["a fade longer than the song", { bars: 4, rows: {}, fade: 5 }],
    ["a fade of no bars", { bars: 4, rows: {}, fade: 0 }],
  ])("rejects %s", (_name, input) => {
    expect(() => parsePatch(withSong(input))).toThrow(PatchFormatError);
  });
});

describe("knobs pinned to perform", () => {
  const withPinned = (perform: unknown) => ({
    version: 1,
    tempo: 120,
    nodes: [{ id: "filter-1", type: "filter", position: { x: 0, y: 0 }, params: {} }],
    connections: [],
    ...(perform !== undefined && { perform }),
  });
  const perform = [{ key: "filter-1.frequency", name: "Cutoff" }, { key: "filter-1.Q" }];

  it("reads and writes the knobs pinned, in order", () => {
    const parsed = parsePatch(withPinned(perform));

    expect(parsed.perform).toEqual(perform);
    expect(serializePatch(parsed).perform).toEqual(perform);
  });

  it("writes nothing without knobs pinned", () => {
    expect(parsePatch(withPinned(undefined))).not.toHaveProperty("perform");
    expect(serializePatch(patch)).not.toHaveProperty("perform");
  });

  it("drops the knobs of nodes or params that are not in the patch, and those pinned twice", () => {
    const parsed = parsePatch(
      withPinned([{ key: "filter-1.Q" }, { key: "filter-9.Q" }, { key: "filter-1.type" }, { key: "filter-1.Q" }]),
    );

    expect(parsed.perform).toEqual([{ key: "filter-1.Q" }]);
  });

  it.each([
    ["knobs that are not a list", { "filter-1.Q": true }],
    ["a knob that is not an object", ["filter-1.Q"]],
    ["a knob with an empty key", [{ key: "" }]],
    ["a name that is not text", [{ key: "filter-1.Q", name: 3 }]],
    ["a name too long", [{ key: "filter-1.Q", name: "x".repeat(41) }]],
  ])("rejects %s", (_name, input) => {
    expect(() => parsePatch(withPinned(input))).toThrow(PatchFormatError);
  });
});

describe("rows hidden from the launcher", () => {
  const withHidden = (hiddenLaunchers: unknown) => ({
    version: 1,
    tempo: 120,
    nodes: [
      { id: "sequencer-1", type: "sequencer", position: { x: 0, y: 0 }, params: {} },
      { id: "filter-2", type: "filter", position: { x: 0, y: 0 }, params: {} },
    ],
    connections: [],
    ...(hiddenLaunchers !== undefined && { hiddenLaunchers }),
  });

  it("reads and writes the rows hidden, and nothing without any", () => {
    const parsed = parsePatch(withHidden(["sequencer-1"]));

    expect(parsed.hiddenLaunchers).toEqual(["sequencer-1"]);
    expect(serializePatch(parsed).hiddenLaunchers).toEqual(["sequencer-1"]);
    expect(parsePatch(withHidden(undefined))).not.toHaveProperty("hiddenLaunchers");
    expect(serializePatch(patch)).not.toHaveProperty("hiddenLaunchers");
  });

  it("drops the rows of nodes that are not in the patch or have no patterns", () => {
    expect(parsePatch(withHidden(["sequencer-1", "filter-2", "sequencer-9"])).hiddenLaunchers).toEqual(["sequencer-1"]);
    expect(parsePatch(withHidden(["filter-2"]))).not.toHaveProperty("hiddenLaunchers");
  });

  it.each([
    ["rows that are not a list", "sequencer-1"],
    ["a row that is not text", [1]],
  ])("rejects %s", (_name, input) => {
    expect(() => parsePatch(withHidden(input))).toThrow(PatchFormatError);
  });
});

describe("scenes", () => {
  const withScenes = (scenes: unknown) => ({
    version: 1,
    tempo: 120,
    nodes: [
      { id: "sequencer-1", type: "sequencer", position: { x: 0, y: 0 }, params: {} },
      { id: "arpeggiator-2", type: "arpeggiator", position: { x: 0, y: 0 }, params: {} },
    ],
    connections: [],
    ...(scenes !== undefined && { scenes }),
  });
  const scenes = [{ name: "Intro", patterns: { "sequencer-1": "A1", "arpeggiator-2": "B2" } }, { patterns: { "sequencer-1": "D8" } }];

  it("reads and writes the scenes, and nothing without any", () => {
    const parsed = parsePatch(withScenes(scenes));

    expect(parsed.scenes).toEqual(scenes);
    expect(serializePatch(parsed).scenes).toEqual(scenes);
    expect(parsePatch(withScenes(undefined))).not.toHaveProperty("scenes");
    expect(serializePatch(patch)).not.toHaveProperty("scenes");
  });

  it("drops the patterns of nodes that are not in the patch, and the scenes left empty", () => {
    const parsed = parsePatch(withScenes([{ patterns: { "sequencer-1": "A1", "sequencer-9": "A1" } }, { patterns: { "clip-7": "A1" } }]));

    expect(parsed.scenes).toEqual([{ patterns: { "sequencer-1": "A1" } }]);
  });

  it("reads and writes the knobs of a scene, without those of controls that are not in the patch", () => {
    const parsed = parsePatch(
      withScenes([{ patterns: { "sequencer-1": "A1" }, knobs: { "sequencer-1.glide": 120, "filter-9.frequency": 300 } }]),
    );

    expect(parsed.scenes).toEqual([{ patterns: { "sequencer-1": "A1" }, knobs: { "sequencer-1.glide": 120 } }]);
    expect(serializePatch(parsed).scenes).toEqual(parsed.scenes);
  });

  it.each([
    ["scenes that are not a list", { patterns: {} }],
    ["knobs that are not an object", [{ patterns: { "sequencer-1": "A1" }, knobs: [120] }]],
    ["a knob that is not a number", [{ patterns: { "sequencer-1": "A1" }, knobs: { "sequencer-1.glide": "fast" } }]],
    ["a scene that is not an object", ["A1"]],
    ["a scene without patterns", [{ name: "Intro" }]],
    ["a pattern that is not one", [{ patterns: { "sequencer-1": "E1" } }]],
    ["a name that is not text", [{ name: 1, patterns: { "sequencer-1": "A1" } }]],
    ["a name too long", [{ name: "x".repeat(41), patterns: { "sequencer-1": "A1" } }]],
  ])("rejects %s", (_name, input) => {
    expect(() => parsePatch(withScenes(input))).toThrow(PatchFormatError);
  });
});

describe("mixers pinned to perform", () => {
  const cable = "noise-1:audio->mixer-2:audio";
  const file = (perform: unknown) => ({
    version: 1,
    tempo: 120,
    nodes: [
      { id: "noise-1", type: "noise", position: { x: 0, y: 0 }, params: {} },
      { id: "mixer-2", type: "mixer", position: { x: 0, y: 0 }, params: {} },
    ],
    connections: [{ id: cable, source: { nodeId: "noise-1", port: "audio" }, target: { nodeId: "mixer-2", port: "audio" } }],
    perform,
  });

  it("reads and writes a mixer pinned by its path, with its name", () => {
    const parsed = parsePatch(file([{ key: "mixer-2", name: "Drums" }]));

    expect(parsed.perform).toEqual([{ key: "mixer-2", name: "Drums" }]);
    expect(serializePatch(parsed).perform).toEqual([{ key: "mixer-2", name: "Drums" }]);
  });

  it("drops what is neither a knob nor a mixer: another node, or a channel on its own", () => {
    expect(parsePatch(file([{ key: "noise-1" }, { key: cable }, { key: "mixer-9" }]))).not.toHaveProperty("perform");
  });
});

describe("meta of a piece", () => {
  const file = (meta: unknown) => ({ version: 1, tempo: 120, nodes: [], connections: [], meta });

  it("reads and writes the title, author, description and link", () => {
    const meta = { title: "Pluja a la finestra", author: "Francesc", description: "Lo-fi trist", link: "https://example.com" };
    const parsed = parsePatch(file(meta));

    expect(parsed.meta).toEqual(meta);
    expect(serializePatch(parsed).meta).toEqual(meta);
    expect(serializePatch(patch)).not.toHaveProperty("meta");
  });

  it("drops a link that is not a web link, and empty fields", () => {
    expect(parsePatch(file({ title: "Rain", link: "javascript:alert(1)", author: "" })).meta).toEqual({ title: "Rain" });
    expect(parsePatch(file({}))).not.toHaveProperty("meta");
  });

  it.each([
    ["meta that is not an object", "Rain"],
    ["a title that is not text", { title: 3 }],
    ["a title too long", { title: "x".repeat(81) }],
  ])("rejects %s", (_name, meta) => {
    expect(() => parsePatch(file(meta))).toThrow(PatchFormatError);
  });
});
