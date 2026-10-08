import { describe, expect, it } from "vitest";
import { moduleRegistry } from "./registry";
import { parsePatch, parseSamples, serializePatch } from "./serialization";
import { sampleIds } from "./samples";
import { allNodes, faceItems, publishedParams } from "./subpatch";
import { isChannelKey } from "./automation";
import { patternPaths } from "./song";
import { EXAMPLES } from "./exampleCatalog";
import { checkPatch } from "./check";
import { parseClip } from "./clip";
import { sameMeter } from "./meter";
import type { Graph, PortRef } from "./types";

const examples = import.meta.glob("../../examples/*.json", { eager: true, import: "default" });

describe("example patches", () => {
  it("exist", () => {
    expect(Object.keys(examples).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(examples))("%s loads", (_path, example) => {
    expect(() => parsePatch(example)).not.toThrow();
  });

  it.each(Object.entries(examples))("%s loses nothing on loading", (_path, example) => {
    expect(checkPatch(example)).toEqual([]);
  });

  it.each(Object.entries(examples))("%s saves as it was loaded, every param and sample included", (_path, example) => {
    expect(JSON.parse(JSON.stringify(serializePatch(parsePatch(example), parseSamples(example))))).toEqual(example);
  });

  it.each(Object.entries(examples))("%s carries the samples it plays, and no other", (_path, example) => {
    expect(parseSamples(example).map(({ id }) => id).sort()).toEqual(sampleIds(parsePatch(example)).sort());
  });

  it.each(EXAMPLES.map((example) => [example.id, example] as const))("%s carries the title and description of the menu", (id, entry) => {
    const example = examples[`../../examples/${id}.json`];

    expect(parsePatch(example).meta).toEqual({ title: entry.title, description: entry.description });
  });

  it.each(Object.entries(examples))("%s reaches an output", (_path, example) => {
    const patch = parsePatch(example);
    const outputs = patch.nodes.filter((node) => node.type === "output").map((node) => node.id);

    expect(patch.connections.some((connection) => outputs.includes(connection.target.nodeId))).toBe(
      true,
    );
  });

  it.each(Object.keys(moduleRegistry))("some example uses the %s", (type) => {
    const nodes = Object.values(examples).flatMap((example) => allNodes(parsePatch(example)));

    expect(nodes.some((node) => node.type === type)).toBe(true);
  });

  const withPatterns = Object.entries(moduleRegistry)
    .filter(([, definition]) => definition.patterns)
    .map(([type]) => type);

  it.each(withPatterns)("some example has patterns of its own on the %s", (type) => {
    const nodes = Object.values(examples).flatMap((example) => allNodes(parsePatch(example)));

    expect(
      nodes.some(
        (node) =>
          node.type === type &&
          Object.values(node.patterns ?? {}).some((pattern) =>
            Object.entries(pattern).some(([id, value]) => node.params[id] !== value),
          ),
      ),
    ).toBe(true);
  });

  it("some example is a song where every node with patterns plays four of them or more, with mutes and knobs that move", () => {
    const songs = Object.values(examples)
      .map((example) => parsePatch(example))
      .filter((patch) => patch.song);

    expect(
      songs.some((patch) => {
        const { rows, automation = {} } = patch.song!;
        const paths = patternPaths(patch).map(({ path }) => path);
        const lanes = Object.keys(automation);
        return (
          paths.length >= 4 &&
          paths.every((path) => new Set(rows[path]?.split(" ").filter((cell) => cell !== "-")).size >= 4) &&
          lanes.some((key) => isChannelKey(key) && key.endsWith(".mute")) &&
          lanes.some((key) => !isChannelKey(key))
        );
      }),
    ).toBe(true);
  });

  it("some example is a waltz in 3/4: a bass on the first beat of each bar and chords on the other two, under a melody", () => {
    const patches = Object.values(examples).map((example) => parsePatch(example));
    const waltz = patches.find((patch) => patch.meter !== undefined && sameMeter(patch.meter, [3]))!;
    expect(waltz).toBeDefined();

    const clips = allNodes(waltz).filter((node) => node.type === "clip");
    const notesOf = (node: (typeof clips)[number]) => parseClip(String(node.params.notes))!;
    const accompaniment = clips.find((node) => notesOf(node).some((note) => note.start % 3 === 0 && notesOf(node).some((other) => other.start === note.start + 1)))!;
    const melody = clips.find((node) => node !== accompaniment)!;

    expect(accompaniment).toBeDefined();
    expect(melody).toBeDefined();
    for (const bar of Array.from({ length: Number(accompaniment.params.bars) }, (_, index) => index * 3)) {
      const starts = notesOf(accompaniment).filter((note) => note.start >= bar && note.start < bar + 3);
      const lowest = Math.min(...starts.map((note) => note.note));
      expect(starts.filter((note) => note.note === lowest).map((note) => note.start)).toEqual([bar]);
      expect(new Set(starts.filter((note) => note.note !== lowest).map((note) => note.start - bar))).toEqual(new Set([1, 2]));
    }
    expect(Number(melody.params.bars) * 3).toBeGreaterThanOrEqual(Math.max(...notesOf(melody).map((note) => note.start + note.length)));
  });

  it("some example plays notes of a clip as hard as each is drawn, with the velocity of the voices of a subpatch", () => {
    const patches = Object.values(examples).map((example) => parsePatch(example));
    const graphs = patches.flatMap((patch) => [patch, ...allNodes(patch).flatMap((node) => node.patch ?? [])]);

    expect(
      patches.some((patch) =>
        allNodes(patch).some((node) => node.type === "clip" && /v\d+/.test(String(node.params.notes))),
      ),
    ).toBe(true);
    expect(graphs.some((graph) => graph.connections.some((connection) => connection.source.port === "velocity"))).toBe(
      true,
    );
  });

  it("some example takes a value out of a subpatch inside a subpatch, through an Out at each level, to the top", () => {
    const patches = Object.values(examples).map((example) => parsePatch(example));
    const outOfSubpatch = (graph: Graph, ref: PortRef) => {
      const subpatch = graph.nodes.find((node) => node.id === ref.nodeId && node.type === "subpatch");
      const outlet = subpatch?.patch?.nodes.find((node) => node.id === ref.port && node.type === "outlet");
      return outlet && subpatch!.patch!.connections.find((connection) => connection.target.nodeId === outlet.id);
    };

    expect(
      patches.some((patch) =>
        patch.connections.some((connection) => {
          const inside = outOfSubpatch(patch, connection.source);
          const subpatch = patch.nodes.find((node) => node.id === connection.source.nodeId);
          return inside !== undefined && outOfSubpatch(subpatch!.patch!, inside.source) !== undefined;
        }),
      ),
    ).toBe(true);
  });

  it("some example accents and ties the steps of a Seq, and plays its accents", () => {
    const patches = Object.values(examples).map((example) => parsePatch(example));

    expect(
      patches.some(
        (patch) =>
          patch.nodes.some((node) => /!/.test(String(node.params.steps)) && / _ /.test(String(node.params.steps))) &&
          patch.connections.some((connection) => connection.source.port === "accent"),
      ),
    ).toBe(true);
  });

  it.each([
    ["the rows of a Drums, like a 808", "rhythm"],
    ["the steps of a Seq, like a 303", "sequence"],
  ])("some example is an instrument played from the face of its subpatch: %s, with patterns, knobs and sections", (_name, kind) => {
    const subpatches = Object.values(examples)
      .flatMap((example) => parsePatch(example).nodes)
      .filter((node) => node.type === "subpatch");

    expect(
      subpatches.some((subpatch) => {
        const items = faceItems(subpatch);
        const grid = items.find((item) => item.controls.some((control) => control.definition.kind === kind));
        const player = subpatch.patch!.nodes.find((node) => node.id === grid?.node);
        return (
          player !== undefined &&
          Object.keys(player.patterns ?? {}).length >= 3 &&
          items.filter((item) => item.kind === "control").length >= 4 &&
          new Set(items.map((item) => item.section).filter((section) => section !== undefined)).size >= 2
        );
      }),
    ).toBe(true);
  });

  it.each(["44-808"])("%s plays a clap, a rim and two toms from the rows of its Drums, in more than one pattern", (id) => {
    const patch = parsePatch(examples[`../../examples/${id}.json`]);
    const graphs = [patch, ...allNodes(patch).flatMap((node) => node.patch ?? [])];
    const drums = allNodes(patch).find((node) => node.type === "drums")!;
    const played = graphs
      .flatMap((graph) => graph.connections)
      .filter((connection) => connection.source.nodeId === drums.id)
      .map((connection) => connection.source.port);
    const sounds = (row: string) =>
      [drums.params, ...Object.values(drums.patterns ?? {})].filter((params) => /x/.test(String(params[row]))).length;

    expect(played).toEqual(expect.arrayContaining(["clap", "rim", "lowtom", "hightom"]));
    expect(["clap", "rim", "lowtom", "hightom"].map(sounds).every((patterns) => patterns >= 2)).toBe(true);
  });

  it.each(["44-808"])("%s gives its clap a short room, after a bright and wide filter its envelope sweeps, driven up to the level of the snare", (id) => {
    const patch = parsePatch(examples[`../../examples/${id}.json`]);
    const nodes = allNodes(patch);
    const connections = [patch, ...nodes.flatMap((node) => node.patch ?? [])].flatMap((graph) => graph.connections);
    const into = (id: string, port: string) =>
      connections.filter((connection) => connection.target.nodeId === id && connection.target.port === port);
    const feeding = (id: string) => nodes.find((node) => into(id, "audio").some(({ source }) => source.nodeId === node.id))!;
    const reverb = nodes.find((node) => node.type === "reverb")!;
    const drive = feeding(feeding(reverb.id).id);
    const filter = feeding(drive.id);

    expect(reverb.params).toEqual({ decay: 0.6, predelay: 0.01, tone: 3600, mix: 0.28 });
    expect(drive).toMatchObject({ type: "distortion", params: { mode: "soft", drive: 3, tone: 9000, mix: 1 } });
    expect(filter.params).toEqual({ type: "bandpass", frequency: 1800, Q: 1.2 });
    expect(into(filter.id, "frequency").map(({ amount }) => amount)).toEqual([0.15]);
    expect(into(filter.id, "Q")).toEqual([]);
  });

  it("the 808 shows the clap, the rim and the toms among the rows on its face, in the order of the Drums", () => {
    const subpatch = parsePatch(examples["../../examples/44-808.json"]).nodes[0];
    const rows = faceItems(subpatch).find((item) => item.kind === "rows")!;

    expect(rows.controls.map((control) => control.param)).toEqual(["kick", "snare", "clap", "rim", "lowtom", "hightom", "hat", "open", "accent"]);
  });

  it("the 808 rings its rim from two tones, a sine at 455 Hz under a triangle at 1667 Hz, driven, cut low and dying fast", () => {
    const patch = parsePatch(examples["../../examples/44-808.json"]);
    const nodes = allNodes(patch);
    const connections = [patch, ...nodes.flatMap((node) => node.patch ?? [])].flatMap((graph) => graph.connections);
    const node = (id: string) => nodes.find((candidate) => candidate.id === id)!;
    const into = (id: string, port: string) =>
      connections.filter((connection) => connection.target.nodeId === id && connection.target.port === port);
    const feeding = (id: string) => into(id, "audio").map(({ source }) => node(source.nodeId));
    const drums = nodes.find((candidate) => candidate.type === "drums")!;
    const inlet = connections.find(({ source }) => source.nodeId === drums.id && source.port === "rim")!.target.port;
    const envelope = node(connections.find(({ source }) => source.nodeId === inlet)!.target.nodeId);
    const vca = node(connections.find(({ source }) => source.nodeId === envelope.id)!.target.nodeId);
    const [filter] = feeding(vca.id);
    const [drive] = feeding(filter.id);
    const [mixer] = feeding(drive.id);
    const tones = into(mixer.id, "audio").map(({ source, amount }) => ({ ...node(source.nodeId).params, amount }));

    expect(envelope.params).toMatchObject({ attack: 0.001, sustain: 1, release: 0.03 });
    expect(vca).toMatchObject({ type: "gain", params: { gain: 0 } });
    expect(filter.params).toEqual({ type: "highpass", frequency: 300, Q: 0.7 });
    expect(drive).toMatchObject({ type: "distortion", params: { mode: "soft", drive: 3, tone: 6000, mix: 1 } });
    expect(tones).toEqual([
      expect.objectContaining({ waveform: "sine", frequency: 455, amount: 0.6 }),
      expect.objectContaining({ waveform: "triangle", frequency: 1667, amount: 1 }),
    ]);
  });

  it("the 808 plays each drum from a subpatch of its own, fed from its row of the Drums and mixed from its Out", () => {
    const inside = parsePatch(examples["../../examples/44-808.json"]).nodes[0].patch!;
    const node = (id: string) => inside.nodes.find((candidate) => candidate.id === id)!;
    const drums = inside.nodes.find((candidate) => candidate.type === "drums")!;
    const mixer = inside.nodes.find((candidate) => candidate.type === "mixer")!;
    const subpatches = inside.nodes.filter((candidate) => candidate.type === "subpatch");
    const rows = inside.connections.filter(({ source, target }) => source.nodeId === drums.id && target.nodeId !== mixer.id);
    const mixed = inside.connections
      .filter(({ target }) => target.nodeId === mixer.id && target.port === "audio")
      .map(({ source }) => `${source.nodeId}:${source.port}`);
    const outs = subpatches.flatMap((subpatch) =>
      subpatch.patch!.nodes.filter((candidate) => candidate.type === "outlet").map((outlet) => `${subpatch.id}:${outlet.id}`),
    );

    expect(new Set(inside.nodes.map((candidate) => candidate.type))).toEqual(new Set(["drums", "subpatch", "mixer", "outlet"]));
    expect(Object.fromEntries(rows.map(({ source, target }) => [source.port, node(target.nodeId).name]))).toEqual({
      kick: "Kick",
      snare: "Snare",
      clap: "Clap",
      rim: "Rim",
      lowtom: "Lo tom",
      hightom: "Hi tom",
      hat: "Hats",
      open: "Hats",
    });
    expect(subpatches.map((subpatch) => subpatch.params.voices)).toEqual(subpatches.map(() => 1));
    expect(mixed.sort()).toEqual(outs.sort());
  });

  it("the 808 sets each knob of a drum on its face inside the subpatch of that drum", () => {
    const subpatch = parsePatch(examples["../../examples/44-808.json"]).nodes[0];
    const knobs = publishedParams(subpatch).filter(({ target }) => target.node.type !== "drums" && target.node.type !== "mixer");

    expect(knobs).toHaveLength(18);
    expect(knobs.every(({ target }) => target.path.length === 2)).toBe(true);
  });

  it("the 808 leaves no envelope driving nothing, nor any played by nothing", () => {
    const patch = parsePatch(examples["../../examples/44-808.json"]);
    const nodes = allNodes(patch);
    const connections = [patch, ...nodes.flatMap((node) => node.patch ?? [])].flatMap((graph) => graph.connections);
    const envelopes = nodes.filter((node) => node.type === "envelope");

    expect(envelopes.filter(({ id }) => !connections.some(({ source }) => source.nodeId === id))).toEqual([]);
    expect(envelopes.filter(({ id }) => !connections.some(({ target }) => target.nodeId === id && target.port === "gate"))).toEqual([]);
  });

  it("the 808 drops the pitch of its kick from one envelope and fades it from another", () => {
    const patch = parsePatch(examples["../../examples/44-808.json"]);
    const kick = patch.nodes[0].patch!.nodes.find((node) => node.name === "Kick")!.patch!;
    const node = (id: string) => kick.nodes.find((candidate) => candidate.id === id)!;
    const from = (type: string) => kick.connections.filter(({ source }) => node(source.nodeId).type === type);
    const [pitch, amp] = from("envelope");

    expect(node(pitch.target.nodeId).type).toBe("oscillator");
    expect(pitch.target.port).toBe("frequency");
    expect(pitch.amount).toBe(0.5);
    expect(node(pitch.source.nodeId).params).toMatchObject({ sustain: 1, release: 0.1 });
    expect(node(amp.target.nodeId).type).toBe("gain");
    expect(node(amp.source.nodeId).params).toMatchObject({ sustain: 1, release: 0.5 });
  });

  it("the 808 sets the tone and the decay of its rim from its face", () => {
    const subpatch = parsePatch(examples["../../examples/44-808.json"]).nodes[0];

    expect(faceItems(subpatch).filter((item) => item.section === "Rim").map((item) => item.controls[0].name)).toEqual(["Tone", "Decay"]);
  });

  it("the 808 sets the room of its clap from its face", () => {
    const subpatch = parsePatch(examples["../../examples/44-808.json"]).nodes[0];

    expect(faceItems(subpatch).filter((item) => item.section === "Clap").map((item) => item.controls[0].name)).toEqual([
      "Tone",
      "Decay",
      "Room",
    ]);
  });

  it("the violin plays one string whose vibrato an envelope brings in, through the body of a violin", () => {
    const patch = parsePatch(examples["../../examples/51-violin.json"]);
    const node = (type: string) => patch.nodes.find((candidate) => candidate.type === type)!;
    const into = (id: string, port: string) =>
      patch.connections.filter((connection) => connection.target.nodeId === id && connection.target.port === port);
    const source = (id: string) => patch.nodes.find((candidate) => candidate.id === id)!;
    const vco = node("vco");
    const math = node("math");
    const vibrato = into(vco.id, "detune").find((connection) => connection.source.nodeId === math.id)!;
    const body = String(node("customFilter").params.response).split(" ").map(Number);

    expect(vco.params).toMatchObject({ waveform: "sawtooth", voices: 1 });
    expect(math.params).toEqual({ operation: "multiply", b: 0 });
    expect(source(into(math.id, "a")[0].source.nodeId).type).toBe("lfo");
    expect(source(into(math.id, "b")[0].source.nodeId).params).toMatchObject({ attack: 0.8, sustain: 1 });
    expect(vibrato.amount! * 1200).toBeLessThanOrEqual(15);
    expect(body.slice(0, 4).every((level) => level < 0)).toBe(true);
    expect(body[10]).toBeGreaterThan(body[9]);
  });

  const curves = Object.entries(moduleRegistry).flatMap(([type, definition]) =>
    definition.params.filter((param) => param.kind === "curve").map((param) => [type, param.id, param.default]),
  );

  it.each(curves)("some example draws the %s %s", (type, id, drawn) => {
    const nodes = Object.values(examples).flatMap((example) => allNodes(parsePatch(example)));

    expect(nodes.some((node) => node.type === type && node.params[id] !== drawn)).toBe(true);
  });
});
