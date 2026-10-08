import { describe, expect, it } from "vitest";
import { checkPatch } from "./check";

const node = (id: string, type: string, params: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  params,
});

const cable = (source: string, sourcePort: string, target: string, targetPort: string) => ({
  id: `${source}:${sourcePort}->${target}:${targetPort}`,
  source: { nodeId: source, port: sourcePort },
  target: { nodeId: target, port: targetPort },
});

const CHANNEL = "gain-1:audio->mixer-1:audio";
const LFO_CABLE = "lfo-1:out->gain-1:gain";

const piece = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  tempo: 120,
  nodes: [
    node("lfo-1", "lfo"),
    node("sequencer-1", "sequencer"),
    node("gain-1", "gain"),
    node("mixer-1", "mixer"),
    node("output-1", "output"),
    {
      ...node("subpatch-1", "subpatch"),
      patch: { nodes: [node("clip-1", "clip")], connections: [] },
    },
  ],
  connections: [
    { ...cable("lfo-1", "out", "gain-1", "gain"), amount: 0.5 },
    cable("gain-1", "audio", "mixer-1", "audio"),
    cable("mixer-1", "audio", "output-1", "audio"),
  ],
  ...overrides,
});

const song = (fields: Record<string, unknown>) => ({ song: { bars: 4, rows: {}, ...fields } });

describe("checkPatch", () => {
  it("finds nothing in a piece that loads whole", () => {
    expect(
      checkPatch(
        piece({
          ...song({
            rows: { "sequencer-1": "A1 B1 - -", "subpatch-1/clip-1": "A1 - - -" },
            automation: {
              "gain-1.gain": "0:0 4:1",
              [`${CHANNEL}.level`]: "0:1",
              [`${CHANNEL}.mute`]: "0:0",
              [`${LFO_CABLE}.amount`]: "0:0 8:1",
            },
          }),
          perform: [{ key: "gain-1.gain" }, { key: "mixer-1" }],
          hiddenLaunchers: ["sequencer-1"],
          scenes: [{ patterns: { "sequencer-1": "B1" } }],
          meta: { title: "Prova", link: "https://example.com" },
        }),
      ),
    ).toEqual([]);
  });

  it("knows what the swing of a piece holds back", () => {
    expect(checkPatch(piece({ swing: 66, swingGrid: "1/8" }))).toEqual([]);
  });

  it("knows the meter of a piece", () => {
    expect(checkPatch(piece({ meter: [3, 2] }))).toEqual([]);
  });

  it("reports why a piece does not load at all", () => {
    expect(checkPatch(piece({ tempo: 1000 }))).toEqual(["The piece does not load: Invalid tempo: 1000"]);
  });

  it("reports a field of the piece it does not know", () => {
    expect(checkPatch(piece({ sceness: [] }))).toEqual(['Unknown field "sceness" of the piece']);
  });

  it("reports a param a node has not, inside subpatches too", () => {
    const nodes = piece().nodes.map((each) =>
      each.id === "gain-1"
        ? { ...each, params: { gain: 0.5, volume: 1 } }
        : each.id === "subpatch-1"
          ? { ...each, patch: { nodes: [node("clip-1", "clip", { lenght: 4 })], connections: [] } }
          : each,
    );

    expect(checkPatch(piece({ nodes }))).toEqual([
      'Node "gain-1" has no param "volume"',
      'Node "subpatch-1/clip-1" has no param "lenght"',
    ]);
  });

  it("reports a param in a pattern that the patterns do not keep", () => {
    const nodes = piece().nodes.map((each) =>
      each.id === "sequencer-1" ? { ...each, patterns: { B1: { length: 8, glide: 0 } } } : each,
    );

    expect(checkPatch(piece({ nodes }))).toEqual(['Pattern B1 of node "sequencer-1" does not keep "glide"']);
  });

  it("reports the rows of the song for nodes without patterns or not in the piece", () => {
    expect(checkPatch(piece(song({ rows: { "sequencer-2": "A1", "gain-1": "A1", "subpatch-1/clip-1": "A1" } })))).toEqual([
      'Song row "sequencer-2" is for no node with patterns',
      'Song row "gain-1" is for no node with patterns',
    ]);
  });

  it("reports the lanes of the song for a control the piece has not", () => {
    expect(
      checkPatch(
        piece(
          song({
            automation: {
              "filter-9.frequency": "0:100",
              "gain-1.cutoff": "0:1",
              "lfo-1.waveform": "0:1",
              [`${CHANNEL}.width`]: "0:1",
              [`${LFO_CABLE}.level`]: "0:1",
              [`${CHANNEL}.amount`]: "0:1",
            },
          }),
        ),
      ),
    ).toEqual([
      'Song lane "filter-9.frequency" moves nothing in the piece',
      'Song lane "gain-1.cutoff" moves nothing in the piece',
      'Song lane "lfo-1.waveform" moves nothing in the piece',
      `Song lane "${CHANNEL}.width" moves nothing in the piece`,
      `Song lane "${LFO_CABLE}.level" moves nothing in the piece`,
      `Song lane "${CHANNEL}.amount" moves nothing in the piece`,
    ]);
  });

  it("reports the knobs pinned to perform that the piece has not, or pins twice", () => {
    expect(
      checkPatch(piece({ perform: [{ key: "gain-1.gain" }, { key: "gain-1.cutoff" }, { key: "gain-1.gain" }] })),
    ).toEqual(['Pinned knob "gain-1.cutoff" is not in the piece', 'Pinned knob "gain-1.gain" is pinned twice']);
  });

  it("reports the rows hidden from the launcher for nodes without patterns", () => {
    expect(checkPatch(piece({ hiddenLaunchers: ["sequencer-1", "gain-1"] }))).toEqual([
      'Hidden launcher row "gain-1" is for no node with patterns',
    ]);
  });

  it("reports the patterns of a scene for nodes without patterns", () => {
    expect(
      checkPatch(piece({ scenes: [{ name: "Drop", patterns: { "sequencer-1": "B1", "drums-1": "A2" } }] })),
    ).toEqual(['Scene "Drop" plays a pattern on "drums-1", which has no patterns']);
  });

  it("reports the knobs of a scene for controls the piece has not", () => {
    expect(
      checkPatch(piece({ scenes: [{ name: "Drop", patterns: { "sequencer-1": "B1" }, knobs: { "gain-1.gain": 0.2, "gain-9.gain": 1 } }] })),
    ).toEqual(['Scene "Drop" keeps the knob "gain-9.gain", which is not in the piece']);
  });

  it("names a scene without a name by its number", () => {
    expect(checkPatch(piece({ scenes: [{ patterns: { "sequencer-1": "B1" } }, { patterns: { "drums-1": "A2" } }] }))).toEqual([
      'Scene 2 plays a pattern on "drums-1", which has no patterns',
    ]);
  });

  describe("a Gain modulated below 0", () => {
    const ducked = (gain: number, follower: number, amount: number, extra: object[] = []) =>
      piece({
        nodes: [
          node("follower-1", "envelopeFollower", { gain: follower }),
          node("gain-1", "gain", { gain }),
          node("output-1", "output"),
          ...extra,
        ],
        connections: [
          { ...cable("follower-1", "out", "gain-1", "gain"), amount },
          cable("gain-1", "audio", "output-1", "audio"),
        ],
      });

    it("reports a Gain that its modulation can take below 0, where it inverts the sound", () => {
      expect(checkPatch(ducked(1, 2.5, -0.9))).toEqual([
        'Gain "gain-1" goes down to -1.25 with what modulates it: below 0 it inverts the sound instead of silencing it',
      ]);
    });

    it("finds nothing while it stays at 0 or above", () => {
      expect(checkPatch(ducked(1, 1, -0.6))).toEqual([]);
      expect(checkPatch(ducked(0.5, 1, -0.5))).toEqual([]);
    });

    it("adds up what each cable can take away, an LFO both ways and an envelope only up", () => {
      expect(
        checkPatch(
          piece({
            nodes: [node("lfo-1", "lfo"), node("envelope-1", "envelope"), node("gain-1", "gain", { gain: 0.5 })],
            connections: [
              { ...cable("lfo-1", "out", "gain-1", "gain"), amount: 0.4 },
              { ...cable("envelope-1", "out", "gain-1", "gain"), amount: -0.2 },
            ],
          }),
        ),
      ).toEqual(['Gain "gain-1" goes down to -0.1 with what modulates it: below 0 it inverts the sound instead of silencing it']);
    });

    it("says nothing about a Gain with a source it cannot tell the range of", () => {
      expect(
        checkPatch(
          piece({
            nodes: [node("sequencer-1", "sequencer"), node("gain-1", "gain", { gain: 0 })],
            connections: [{ ...cable("sequencer-1", "pitch", "gain-1", "gain"), amount: -1 }],
          }),
        ),
      ).toEqual([]);
    });

    it("names a Gain inside a subpatch by its path", () => {
      const inner = { nodes: [node("lfo-1", "lfo"), node("gain-1", "gain", { gain: 0.2 })], connections: [cable("lfo-1", "out", "gain-1", "gain")] };

      expect(checkPatch(piece({ nodes: [{ ...node("subpatch-1", "subpatch"), patch: inner }], connections: [] }))).toEqual([
        'Gain "subpatch-1/gain-1" goes down to -0.8 with what modulates it: below 0 it inverts the sound instead of silencing it',
      ]);
    });
  });

  describe("marks a rhythm cannot play", () => {
    const steps = (first: string) => `${first} ${Array(15).fill("-").join(" ")}`;
    const arp = (rhythm: string, patterns?: object) =>
      piece({ nodes: [{ ...node("arpeggiator-1", "arpeggiator", { rhythm }), ...(patterns && { patterns }) }], connections: [] });

    it("reports the retrigs and the chances in the rhythm of the Arp, which plays every step once", () => {
      expect(checkPatch(arp(steps("x3")))).toEqual(['Node "arpeggiator-1" plays "rhythm" without its retrigs: only the Drums play them']);
      expect(checkPatch(arp(steps("x?50")))).toEqual(['Node "arpeggiator-1" plays "rhythm" without its chances: only the Drums play them']);
    });

    it("reports them in a pattern too", () => {
      expect(checkPatch(arp(steps("x"), { B1: { rhythm: steps("x2") } }))).toEqual([
        'Pattern B1 of node "arpeggiator-1" plays "rhythm" without its retrigs: only the Drums play them',
      ]);
    });

    it("finds nothing in the rows of the Drums", () => {
      expect(checkPatch(piece({ nodes: [node("drums-1", "drums", { kick: steps("x3?50") })], connections: [] }))).toEqual([]);
    });
  });

  it("reports a link that is not a web page", () => {
    expect(checkPatch(piece({ meta: { title: "Prova", link: "javascript:alert(1)" } }))).toEqual([
      'The link "javascript:alert(1)" is not a web page',
    ]);
  });
});
