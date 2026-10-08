import { describe, expect, it } from "vitest";
import { defaultParams } from "./registry";
import {
  faceItems,
  flatPortsOf,
  flattenPatch,
  graphAt,
  nodeAt,
  portsOfNode,
  prunePublished,
  pruneConnections,
  publishableParam,
  withoutVoices,
  publishedParams,
  newSectionName,
  validPath,
  withGraphAt,
  withPublishedMoved,
  withSectionAt,
} from "./subpatch";
import type { NodeType, Patch, PatchConnection, PatchNode, Params } from "./types";

const node = (id: string, type: NodeType, extra: Partial<PatchNode> = {}, params: Params = {}): PatchNode => ({
  id,
  type,
  position: { x: 0, y: 0 },
  params: { ...defaultParams(type), ...params },
  ...extra,
});

const link = (source: [string, string], target: [string, string], extra: Partial<PatchConnection> = {}): PatchConnection => ({
  id: `${source[0]}:${source[1]}->${target[0]}:${target[1]}`,
  source: { nodeId: source[0], port: source[1] },
  target: { nodeId: target[0], port: target[1] },
  ...extra,
});

/** A voice: an audio in through a filter to an audio out, and a control in to the filter. */
const voice = node("subpatch-2", "subpatch", {
  name: "Voice",
  patch: {
    nodes: [
      node("inlet-3", "inlet", { name: "sound", position: { x: 0, y: 0 } }, { signal: "audio" }),
      node("inlet-4", "inlet", { name: "cutoff", position: { x: 0, y: 200 } }, { signal: "control" }),
      node("filter-5", "filter"),
      node("outlet-6", "outlet", {}, { signal: "audio" }),
    ],
    connections: [
      link(["inlet-3", "out"], ["filter-5", "audio"]),
      link(["inlet-4", "out"], ["filter-5", "frequency"]),
      link(["filter-5", "audio"], ["outlet-6", "in"]),
    ],
  },
});

const patch: Patch = {
  tempo: 120,
  nodes: [node("oscillator-1", "oscillator"), voice, node("output-7", "output"), node("lfo-8", "lfo")],
  connections: [
    link(["oscillator-1", "audio"], ["subpatch-2", "inlet-3"]),
    link(["lfo-8", "out"], ["subpatch-2", "inlet-4"], { amount: 0.5 }),
    link(["subpatch-2", "outlet-6"], ["output-7", "audio"]),
  ],
};

describe("portsOfNode", () => {
  it("gives a subpatch a port for each In and Out inside it, named after them, from the top", () => {
    expect(portsOfNode(voice)).toEqual({
      inputs: [
        { id: "inlet-3", type: "audio", label: "sound" },
        { id: "inlet-4", type: "control", label: "cutoff" },
      ],
      outputs: [{ id: "outlet-6", type: "audio", label: "out 1" }],
    });
  });

  it("gives an In an output and an Out an input of the kind of signal they carry", () => {
    expect(portsOfNode(node("inlet-1", "inlet", {}, { signal: "trigger" }))).toEqual({
      inputs: [],
      outputs: [{ id: "out", type: "trigger" }],
    });
    expect(portsOfNode(node("outlet-1", "outlet", {}, { signal: "control" }))).toEqual({
      inputs: [{ id: "in", type: "control" }],
      outputs: [],
    });
  });

  it("gives an In and an Out, once flattened, both the port inside and the one outside", () => {
    const both = { inputs: [{ id: "in", type: "control" }], outputs: [{ id: "out", type: "control" }] };

    expect(flatPortsOf(node("inlet-1", "inlet", {}, { signal: "control" }))).toEqual(both);
    expect(flatPortsOf(node("outlet-1", "outlet", {}, { signal: "control" }))).toEqual(both);
    expect(flatPortsOf(node("filter-1", "filter"))).toEqual(portsOfNode(node("filter-1", "filter")));
  });

  it("gives an In of notes the pitch, the gate, the velocity and the notes of a voice inside, and a port of notes outside", () => {
    const notes = node("inlet-1", "inlet", {}, { signal: "notes" });
    const pitchAndGate = [
      { id: "pitch", type: "control" },
      { id: "gate", type: "trigger" },
      { id: "velocity", type: "control" },
      { id: "notes", type: "notes" },
    ];

    expect(portsOfNode(notes)).toEqual({ inputs: [], outputs: pitchAndGate });
    expect(flatPortsOf(notes)).toEqual({ inputs: [{ id: "in", type: "notes" }], outputs: pitchAndGate });
    expect(portsOfNode(node("subpatch-2", "subpatch", { patch: { nodes: [notes], connections: [] } })).inputs).toEqual([
      { id: "inlet-1", type: "notes", label: "in 1" },
    ]);
  });

  it("gives any other module the ports of its kind", () => {
    expect(portsOfNode(node("filter-1", "filter")).outputs).toEqual([{ id: "audio", type: "audio" }]);
  });
});

describe("published params", () => {
  const published = {
    ...voice,
    params: { voices: 1 },
    published: [
      { node: "filter-5", param: "frequency", name: "Cutoff" },
      { node: "filter-5", param: "type" },
    ],
  };

  it("finds each param published on a subpatch, its definition and the name it shows", () => {
    expect(
      publishedParams(published).map(({ key, name, definition, value }) => ({ key, name, id: definition.id, value })),
    ).toEqual([
      { key: "filter-5.frequency", name: "Cutoff", id: "frequency", value: 1200 },
      { key: "filter-5.type", name: "Filter Type", id: "type", value: "lowpass" },
    ]);
  });

  it("gives a subpatch a control input for each published param that can be modulated", () => {
    expect(portsOfNode(published).inputs).toEqual([
      { id: "inlet-3", type: "audio", label: "sound" },
      { id: "inlet-4", type: "control", label: "cutoff" },
      { id: "filter-5.frequency", type: "control", label: "Cutoff" },
    ]);
  });

  it("runs a cable to a published param straight to the param inside, on every voice", () => {
    const flat = flattenPatch({
      tempo: 120,
      nodes: [node("lfo-8", "lfo"), { ...published, params: { voices: 2 } }],
      connections: [link(["lfo-8", "out"], ["subpatch-2", "filter-5.frequency"], { amount: 0.5 })],
    });

    expect(flat.connections.filter(({ source }) => source.nodeId === "lfo-8")).toEqual([
      link(["lfo-8", "out"], ["subpatch-2/filter-5", "frequency"], { id: "lfo-8:out->subpatch-2:filter-5.frequency", amount: 0.5 }),
      link(["lfo-8", "out"], ["subpatch-2#2/filter-5", "frequency"], {
        id: "lfo-8:out->subpatch-2:filter-5.frequency#1-2",
        amount: 0.5,
      }),
    ]);
  });

  it("forgets the params whose node or param is gone, at every level", () => {
    const gone = {
      ...published,
      published: [...published.published, { node: "nope-9", param: "gain" }, { node: "filter-5", param: "nope" }],
    };
    const outer = node("subpatch-9", "subpatch", { patch: { nodes: [gone], connections: [] } });
    const graph = { nodes: [outer], connections: [] };

    const once = prunePublished(graph);
    expect(once.nodes[0].patch!.nodes[0].published).toEqual(published.published);
    expect(prunePublished(once)).toBe(once);
    expect(prunePublished(patch)).toBe(patch);
  });

  it.each([
    ["a knob", "filter", "frequency"],
    ["a select", "filter", "type"],
    ["the sample of a Sampler", "sampler", "sample"],
    ["the notes of a Clip", "clip", "notes"],
    ["a row of the Drums", "drums", "kick"],
    ["the steps of a Seq", "sequencer", "steps"],
    ["the notes of an Arp", "arpeggiator", "notes"],
  ] as const)("can publish %s", (_name, type, param) => {
    expect(publishableParam({ type }, param)?.id).toBe(param);
  });

  it.each([
    ["a curve", "oscillator", "shape"],
    ["the reference cable of a Scope", "scope", "trigger"],
    ["a param the node has not", "filter", "nope"],
  ] as const)("cannot publish %s", (_name, type, param) => {
    expect(publishableParam({ type }, param)).toBeUndefined();
  });

  it("gives each published param the params of its node inside, those of the pattern A1", () => {
    const sequencer = node("sequencer-3", "sequencer", {}, { length: 8 });
    const subpatch = node("subpatch-2", "subpatch", {
      patch: { nodes: [sequencer], connections: [] },
      published: [{ node: "sequencer-3", param: "steps" }],
    });

    expect(publishedParams(subpatch)).toMatchObject([
      { key: "sequencer-3.steps", definition: { kind: "sequence" }, params: sequencer.params },
    ]);
  });

  it("keeps the published screens and rows while their node is inside", () => {
    const drums = node("drums-3", "drums");
    const subpatch = node("subpatch-2", "subpatch", {
      patch: { nodes: [drums], connections: [] },
      published: [
        { node: "drums-3", param: "kick" },
        { node: "drums-3", param: "snare" },
      ],
    });
    const graph = { nodes: [subpatch], connections: [] };

    expect(prunePublished(graph)).toBe(graph);
  });
});

describe("published params of a subpatch inside a subpatch", () => {
  const inner = {
    ...voice,
    params: { voices: 2 },
    published: [
      { node: "filter-5", param: "frequency", name: "Cutoff" },
      { node: "filter-5", param: "type" },
    ],
  };
  const outer = node("subpatch-9", "subpatch", {
    name: "Synth",
    patch: { nodes: [inner], connections: [] },
    published: [{ node: "subpatch-2", param: "filter-5.frequency" }],
  });

  it("can publish the knobs and selects published on it, and its own voices", () => {
    expect(publishableParam(inner, "filter-5.frequency")?.id).toBe("frequency");
    expect(publishableParam(inner, "filter-5.type")?.id).toBe("type");
    expect(publishableParam(inner, "voices")?.id).toBe("voices");
  });

  it("cannot publish what it does not publish, nor the screens and rows it does", () => {
    const players = node("subpatch-3", "subpatch", {
      patch: { nodes: [node("sequencer-4", "sequencer"), node("drums-5", "drums")], connections: [] },
      published: [
        { node: "sequencer-4", param: "steps" },
        { node: "drums-5", param: "kick" },
      ],
    });

    expect(publishableParam(inner, "filter-5.Q")).toBeUndefined();
    expect(publishableParam(players, "sequencer-4.steps")).toBeUndefined();
    expect(publishableParam(players, "drums-5.kick")).toBeUndefined();
  });

  it("finds the node and the param it sets, that of a node inside for a param of its own", () => {
    expect(publishedParams(inner)[0].target).toMatchObject({ path: ["filter-5"], param: "frequency", node: { type: "filter" } });
  });

  it("finds the param at the end, through the subpatch down to it, named after the subpatch and the name it has there", () => {
    expect(publishedParams(outer)).toMatchObject([
      {
        key: "subpatch-2.filter-5.frequency",
        node: "subpatch-2",
        param: "filter-5.frequency",
        name: "Voice Cutoff",
        definition: { id: "frequency" },
        value: 1200,
        hidden: false,
        target: { path: ["subpatch-2", "filter-5"], param: "frequency", node: { id: "filter-5" } },
      },
    ]);
  });

  it("reaches as deep as the subpatches go", () => {
    const top = node("subpatch-10", "subpatch", {
      patch: { nodes: [outer], connections: [] },
      published: [{ node: "subpatch-9", param: "subpatch-2.filter-5.frequency" }],
    });

    expect(publishedParams(top)).toMatchObject([
      { name: "Synth Voice Cutoff", target: { path: ["subpatch-9", "subpatch-2", "filter-5"], param: "frequency" } },
    ]);
  });

  it("hides it while the param at the end is hidden", () => {
    const sequencer = node("sequencer-4", "sequencer", {}, { division: "gate" });
    const steps = node("subpatch-3", "subpatch", {
      patch: { nodes: [sequencer], connections: [] },
      published: [{ node: "sequencer-4", param: "gate" }],
    });
    const around = node("subpatch-9", "subpatch", {
      patch: { nodes: [steps], connections: [] },
      published: [{ node: "subpatch-3", param: "sequencer-4.gate" }],
    });

    expect(publishedParams(around)[0].hidden).toBe(true);
  });

  it("gives the subpatch outside an input for it when it can be modulated", () => {
    expect(portsOfNode(outer).inputs).toEqual([{ id: "subpatch-2.filter-5.frequency", type: "control", label: "Voice Cutoff" }]);
  });

  it("runs a cable to it straight to the param at the end, on every voice of every subpatch", () => {
    const flat = flattenPatch({
      tempo: 120,
      nodes: [node("lfo-8", "lfo"), { ...outer, params: { voices: 2 } }],
      connections: [link(["lfo-8", "out"], ["subpatch-9", "subpatch-2.filter-5.frequency"], { amount: 0.5 })],
    });

    expect(
      flat.connections.filter(({ source }) => source.nodeId === "lfo-8").map(({ target, amount }) => [target, amount]),
    ).toEqual([
      [{ nodeId: "subpatch-9/subpatch-2/filter-5", port: "frequency" }, 0.5],
      [{ nodeId: "subpatch-9/subpatch-2#2/filter-5", port: "frequency" }, 0.5],
      [{ nodeId: "subpatch-9#2/subpatch-2/filter-5", port: "frequency" }, 0.5],
      [{ nodeId: "subpatch-9#2/subpatch-2#2/filter-5", port: "frequency" }, 0.5],
    ]);
  });

  it("forgets it once the subpatch inside no longer publishes it", () => {
    const taken = { ...inner, published: [{ node: "filter-5", param: "type" }] };
    const graph = { nodes: [{ ...outer, patch: { nodes: [taken], connections: [] } }], connections: [] };
    const kept = { nodes: [outer], connections: [] };

    expect(prunePublished(graph).nodes[0].published).toBeUndefined();
    expect(prunePublished(kept)).toBe(kept);
  });
});

describe("graphs inside subpatches", () => {
  it("finds the graph at a path, and the longest path that still exists", () => {
    expect(graphAt(patch, []).nodes).toBe(patch.nodes);
    expect(graphAt(patch, ["subpatch-2"]).nodes.map(({ id }) => id)).toEqual(["inlet-3", "inlet-4", "filter-5", "outlet-6"]);
    expect(validPath(patch, ["subpatch-2", "nope"])).toEqual(["subpatch-2"]);
    expect(validPath(patch, ["oscillator-1"])).toEqual([]);
  });

  it("finds the node at a path, the subpatches down to it first", () => {
    expect(nodeAt(patch, ["subpatch-2", "filter-5"])?.type).toBe("filter");
    expect(nodeAt(patch, ["oscillator-1"])?.type).toBe("oscillator");
    expect(nodeAt(patch, ["nope", "filter-5"])).toBeUndefined();
    expect(nodeAt(patch, ["subpatch-2", "nope"])).toBeUndefined();
    expect(nodeAt(patch, [])).toBeUndefined();
  });

  it("replaces the graph at a path, leaving the rest alone", () => {
    const changed = withGraphAt(patch, ["subpatch-2"], { nodes: [], connections: [] });

    expect(graphAt(changed, ["subpatch-2"]).nodes).toEqual([]);
    expect(changed.nodes[0]).toBe(patch.nodes[0]);
    expect(changed.tempo).toBe(120);
  });
});

describe("flattenPatch", () => {
  const flat = flattenPatch(patch);

  it("puts the nodes inside a subpatch next to the others, their ids prefixed, and leaves out the subpatch", () => {
    expect(flat.nodes.map(({ id }) => id)).toEqual([
      "oscillator-1",
      "subpatch-2/inlet-3",
      "subpatch-2/inlet-4",
      "subpatch-2/filter-5",
      "subpatch-2/outlet-6",
      "output-7",
      "lfo-8",
    ]);
  });

  it("runs the cables into a subpatch through its In, and out of it through its Out", () => {
    expect(flat.connections).toEqual([
      link(["subpatch-2/inlet-3", "out"], ["subpatch-2/filter-5", "audio"], {
        id: "subpatch-2/inlet-3:out->filter-5:audio",
      }),
      link(["subpatch-2/inlet-4", "out"], ["subpatch-2/filter-5", "frequency"], {
        id: "subpatch-2/inlet-4:out->filter-5:frequency",
      }),
      link(["subpatch-2/filter-5", "audio"], ["subpatch-2/outlet-6", "in"], {
        id: "subpatch-2/filter-5:audio->outlet-6:in",
      }),
      link(["oscillator-1", "audio"], ["subpatch-2/inlet-3", "in"], { id: "oscillator-1:audio->subpatch-2:inlet-3" }),
      link(["lfo-8", "out"], ["subpatch-2/inlet-4", "in"], { id: "lfo-8:out->subpatch-2:inlet-4", amount: 0.5 }),
      link(["subpatch-2/outlet-6", "out"], ["output-7", "audio"], { id: "subpatch-2:outlet-6->output-7:audio" }),
    ]);
  });

  describe("with several voices", () => {
    const synth = node(
      "subpatch-2",
      "subpatch",
      {
        patch: {
          nodes: [
            node("inlet-3", "inlet", { position: { x: 0, y: 0 } }, { signal: "notes" }),
            node("inlet-4", "inlet", { position: { x: 0, y: 200 } }, { signal: "control" }),
            node("oscillator-5", "oscillator"),
            node("outlet-6", "outlet", {}, { signal: "audio" }),
          ],
          connections: [
            link(["inlet-3", "pitch"], ["oscillator-5", "frequency"]),
            link(["oscillator-5", "audio"], ["outlet-6", "in"]),
          ],
        },
      },
      { voices: 3 },
    );
    const poly = flattenPatch({
      tempo: 120,
      nodes: [node("keyboard-1", "keyboard"), synth, node("output-7", "output"), node("lfo-8", "lfo")],
      connections: [
        link(["keyboard-1", "notes"], ["subpatch-2", "inlet-3"]),
        link(["lfo-8", "out"], ["subpatch-2", "inlet-4"], { amount: 0.5 }),
        link(["subpatch-2", "outlet-6"], ["output-7", "audio"]),
      ],
    });
    const ids = poly.nodes.map(({ id }) => id);

    it("copies the graph inside once for each voice, the first one with the ids of a single voice", () => {
      expect(ids).toEqual([
        "keyboard-1",
        "subpatch-2/inlet-3",
        "subpatch-2/inlet-4",
        "subpatch-2/oscillator-5",
        "subpatch-2/outlet-6",
        "subpatch-2#2/inlet-3",
        "subpatch-2#2/inlet-4",
        "subpatch-2#2/oscillator-5",
        "subpatch-2#2/outlet-6",
        "subpatch-2#3/inlet-3",
        "subpatch-2#3/inlet-4",
        "subpatch-2#3/oscillator-5",
        "subpatch-2#3/outlet-6",
        "output-7",
        "lfo-8",
      ]);
      expect(poly.connections.map(({ id }) => id)).toContain("subpatch-2#3/inlet-3:pitch->oscillator-5:frequency");
    });

    it("gives every copy of a node or a cable the same path without its voices", () => {
      expect(new Set(ids.filter((id) => id.endsWith("oscillator-5")).map(withoutVoices))).toEqual(new Set(["subpatch-2/oscillator-5"]));
      expect(withoutVoices("a#2/b#3/m#1-2")).toBe("a/b/m#1-2");
    });

    it("tells each In of notes which voice it plays, of how many", () => {
      const notes = poly.nodes.filter(({ id }) => id.endsWith("/inlet-3")).map(({ params }) => params);

      expect(notes).toEqual(
        [1, 2, 3].map((voice) => ({
          ...defaultParams("inlet"),
          signal: "notes",
          voice,
          voices: 3,
          release: 0,
          group: voice === 1 ? "subpatch-2/" : `subpatch-2#${voice}/`,
        })),
      );
    });

    it("marks each Out of sound with the voice it belongs to, as its In of notes", () => {
      const outs = poly.nodes.filter(({ id }) => id.endsWith("/outlet-6")).map(({ params }) => params.group);

      expect(outs).toEqual(["subpatch-2/", "subpatch-2#2/", "subpatch-2#3/"]);
    });

    it("tells an In of notes the longest release of the envelopes of its voice", () => {
      const withEnvelopes = {
        ...synth,
        patch: {
          ...synth.patch!,
          nodes: [
            ...synth.patch!.nodes,
            node("envelope-9", "envelope", {}, { ...defaultParams("envelope"), release: 2.5 }),
            node("envelope-10", "envelope", {}, { ...defaultParams("envelope"), release: 0.4 }),
          ],
        },
      };

      const flat = flattenPatch({ ...patch, nodes: [withEnvelopes], connections: [] });

      expect(flat.nodes.find(({ id }) => id === "subpatch-2#2/inlet-3")!.params.release).toBe(2.5);
    });

    it("runs every cable into the subpatch to each voice, and every voice out of it", () => {
      const crossing = poly.connections.filter(({ id }) => id.includes("subpatch-2:"));

      expect(crossing).toEqual([
        link(["keyboard-1", "notes"], ["subpatch-2/inlet-3", "in"], { id: "keyboard-1:notes->subpatch-2:inlet-3" }),
        link(["keyboard-1", "notes"], ["subpatch-2#2/inlet-3", "in"], { id: "keyboard-1:notes->subpatch-2:inlet-3#1-2" }),
        link(["keyboard-1", "notes"], ["subpatch-2#3/inlet-3", "in"], { id: "keyboard-1:notes->subpatch-2:inlet-3#1-3" }),
        link(["lfo-8", "out"], ["subpatch-2/inlet-4", "in"], { id: "lfo-8:out->subpatch-2:inlet-4", amount: 0.5 }),
        link(["lfo-8", "out"], ["subpatch-2#2/inlet-4", "in"], { id: "lfo-8:out->subpatch-2:inlet-4#1-2", amount: 0.5 }),
        link(["lfo-8", "out"], ["subpatch-2#3/inlet-4", "in"], { id: "lfo-8:out->subpatch-2:inlet-4#1-3", amount: 0.5 }),
        link(["subpatch-2/outlet-6", "out"], ["output-7", "audio"], { id: "subpatch-2:outlet-6->output-7:audio" }),
        link(["subpatch-2#2/outlet-6", "out"], ["output-7", "audio"], { id: "subpatch-2:outlet-6->output-7:audio#2-1" }),
        link(["subpatch-2#3/outlet-6", "out"], ["output-7", "audio"], { id: "subpatch-2:outlet-6->output-7:audio#3-1" }),
      ]);
    });

    it("tells an In of notes in a subpatch of a single voice that it plays alone", () => {
      const single = flattenPatch({ ...patch, nodes: [{ ...synth, params: { voices: 1 } }], connections: [] });

      expect(single.nodes.find(({ id }) => id === "subpatch-2/inlet-3")!.params).toMatchObject({ voice: 1, voices: 1 });
    });
  });

  it("flattens subpatches inside subpatches", () => {
    const outer = node("subpatch-9", "subpatch", { patch: { nodes: [voice], connections: [] } });

    expect(flattenPatch({ ...patch, nodes: [outer], connections: [] }).nodes.map(({ id }) => id)).toContain(
      "subpatch-9/subpatch-2/filter-5",
    );
  });
});

describe("pruneConnections", () => {
  it("drops the cables to ports that are gone or have changed their kind of signal, at every level", () => {
    const inner = graphAt(patch, ["subpatch-2"]);
    const changed = withGraphAt(patch, ["subpatch-2"], {
      nodes: inner.nodes
        .filter(({ id }) => id !== "outlet-6")
        .map((candidate) =>
          candidate.id === "inlet-4" ? { ...candidate, params: { ...candidate.params, signal: "trigger" } } : candidate,
        ),
      connections: inner.connections,
    });

    const pruned = pruneConnections(changed);

    expect(pruned.connections.map(({ id }) => id)).toEqual(["oscillator-1:audio->subpatch-2:inlet-3"]);
    expect(graphAt(pruned, ["subpatch-2"]).connections.map(({ id }) => id)).toEqual(["inlet-3:out->filter-5:audio"]);
  });

  it("leaves a patch with nothing to drop as it is", () => {
    expect(pruneConnections(patch)).toBe(patch);
  });
});

describe("the face of a subpatch", () => {
  const face = (published: PatchNode["published"]) =>
    node("subpatch-1", "subpatch", {
      patch: { nodes: [node("filter-2", "filter"), node("drums-3", "drums"), node("clip-4", "clip")], connections: [] },
      published,
    });
  const order = (published: PatchNode["published"]) => published!.map(({ node: id, param, section }) => [`${id}.${param}`, section]);
  const subpatch = face([
    { node: "filter-2", param: "frequency", section: "Filter" },
    { node: "drums-3", param: "kick", section: "Filter" },
    { node: "filter-2", param: "Q" },
    { node: "drums-3", param: "snare", section: "Filter" },
    { node: "clip-4", param: "notes", section: "Clip" },
  ]);

  it("shows the rows of a node together, where the first one is, and each other control on its own", () => {
    expect(faceItems(subpatch).map(({ key, kind, section, controls }) => [key, kind, section, controls.length])).toEqual([
      ["filter-2.frequency", "control", "Filter", 1],
      ["drums-3.kick", "rows", "Filter", 2],
      ["filter-2.Q", "control", undefined, 1],
      ["clip-4.notes", "screen", "Clip", 1],
    ]);
  });

  it("moves a control to the place of another, after it going down and before it going up, into its section", () => {
    expect(order(withPublishedMoved(subpatch, "filter-2.frequency", "filter-2.Q"))).toEqual([
      ["drums-3.kick", "Filter"],
      ["drums-3.snare", "Filter"],
      ["filter-2.Q", undefined],
      ["filter-2.frequency", undefined],
      ["clip-4.notes", "Clip"],
    ]);
    expect(order(withPublishedMoved(subpatch, "clip-4.notes", "drums-3.kick"))).toEqual([
      ["filter-2.frequency", "Filter"],
      ["clip-4.notes", "Filter"],
      ["drums-3.kick", "Filter"],
      ["drums-3.snare", "Filter"],
      ["filter-2.Q", undefined],
    ]);
  });

  it("moves all the rows of a node at once, and leaves the list as it was for a move onto itself", () => {
    expect(order(withPublishedMoved(subpatch, "drums-3.snare", "clip-4.notes")).map(([key]) => key)).toEqual([
      "filter-2.frequency",
      "filter-2.Q",
      "clip-4.notes",
      "drums-3.kick",
      "drums-3.snare",
    ]);
    expect(withPublishedMoved(subpatch, "drums-3.kick", "drums-3.snare")).toBe(subpatch.published);
  });

  it("names the section from a control to the end of the one it was in, keeping the names given", () => {
    const named = face([
      { node: "filter-2", param: "frequency", name: "Cutoff" },
      { node: "filter-2", param: "Q" },
      { node: "clip-4", param: "notes", section: "Clip" },
    ]);

    expect(order(withSectionAt(named, "filter-2.Q", " Reso "))).toEqual([
      ["filter-2.frequency", undefined],
      ["filter-2.Q", "Reso"],
      ["clip-4.notes", "Clip"],
    ]);
    expect(withSectionAt(named, "filter-2.Q", "Reso")[0]).toEqual({ node: "filter-2", param: "frequency", name: "Cutoff" });
  });

  it("joins the section before when the name of one is cleared", () => {
    expect(order(withSectionAt(subpatch, "clip-4.notes", ""))).toEqual([
      ["filter-2.frequency", "Filter"],
      ["drums-3.kick", "Filter"],
      ["drums-3.snare", "Filter"],
      ["filter-2.Q", undefined],
      ["clip-4.notes", undefined],
    ]);
    expect(order(withSectionAt(subpatch, "filter-2.frequency", "")).slice(0, 3)).toEqual([
      ["filter-2.frequency", undefined],
      ["drums-3.kick", undefined],
      ["drums-3.snare", undefined],
    ]);
  });

  it("names a new section after none of those there", () => {
    expect(newSectionName([])).toBe("Section");
    expect(newSectionName([{ node: "a", param: "b", section: "Section" }, { node: "a", param: "c", section: "Section 2" }])).toBe("Section 3");
  });
});
