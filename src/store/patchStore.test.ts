import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { defaultParams } from "../patch/registry";
import type { Patch } from "../patch/types";
import { FakeAudioContext } from "../test/fakeAudioContext";
import { createPatchStore, type PatchEngine } from "./patchStore";

const audio = (nodeId: string) => ({ nodeId, port: "audio" });

let engine: { sync: ReturnType<typeof vi.fn<PatchEngine["sync"]>> };
let clock: number;
let store: ReturnType<typeof createPatchStore>;

const synced = () => engine.sync.mock.lastCall?.[0];

beforeEach(() => {
  engine = { sync: vi.fn<PatchEngine["sync"]>() };
  clock = 0;
  store = createPatchStore(engine, { now: () => clock });
});

describe("addNode", () => {
  it("adds a node with default params at the given position", () => {
    const node = store.getState().addNode("oscillator", { x: 10, y: 20 });

    expect(node).toEqual({
      id: "oscillator-1",
      type: "oscillator",
      position: { x: 10, y: 20 },
      params: defaultParams("oscillator"),
    });
    expect(node.params).toMatchObject({ waveform: "sine", mode: "free", frequency: 440, detune: 0 });
    expect(store.getState().nodes).toEqual([node]);
  });

  it("syncs the engine with the new patch", () => {
    const node = store.getState().addNode("gain", { x: 0, y: 0 });

    expect(synced()).toEqual({ nodes: [node], connections: [], tempo: 120 });
  });

  it("never reuses ids", () => {
    const first = store.getState().addNode("gain", { x: 0, y: 0 });
    store.getState().removeNode(first.id);
    const second = store.getState().addNode("gain", { x: 0, y: 0 });

    expect(second.id).not.toBe(first.id);
  });
});

describe("moveNode", () => {
  it("updates the position", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });

    store.getState().moveNode(id, { x: 5, y: 6 });

    expect(store.getState().nodes[0].position).toEqual({ x: 5, y: 6 });
  });
});

describe("moveNodes", () => {
  it("moves several nodes as one undo step", () => {
    const first = store.getState().addNode("gain", { x: 0, y: 0 });
    const second = store.getState().addNode("gain", { x: 0, y: 0 });

    store.getState().moveNodes({ [first.id]: { x: 1, y: 2 }, [second.id]: { x: 3, y: 4 } });

    expect(store.getState().nodes.map((node) => node.position)).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    store.getState().undo();
    expect(store.getState().nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it("leaves the nodes it is not given where they are, and ignores those not on show", () => {
    const first = store.getState().addNode("gain", { x: 0, y: 0 });
    const second = store.getState().addNode("gain", { x: 9, y: 9 });

    store.getState().moveNodes({ [first.id]: { x: 1, y: 2 }, missing: { x: 5, y: 5 } });

    expect(store.getState().nodes.find((node) => node.id === second.id)!.position).toEqual({ x: 9, y: 9 });
    expect(store.getState().nodes).toHaveLength(2);
  });

  it("leaves no undo step when nothing moves", () => {
    store.getState().addNode("gain", { x: 0, y: 0 });
    const steps = store.getState().past.length;

    store.getState().moveNodes({});

    expect(store.getState().past).toHaveLength(steps);
  });
});

describe("setSwing", () => {
  it("starts straight, with no swing in the patch", () => {
    expect(store.getState().swing).toBe(50);
    expect(store.getState().toPatch()).not.toHaveProperty("swing");
  });

  it("stores and syncs the swing, rounded and within range, and leaves the patch without it once straight", () => {
    store.getState().setSwing(61.6);
    expect(store.getState().swing).toBe(62);
    expect(synced()!.swing).toBe(62);

    clock += 2000;
    store.getState().setSwing(90);
    expect(store.getState().swing).toBe(75);

    clock += 2000;
    store.getState().setSwing(10);
    expect(store.getState().swing).toBe(50);
    expect(synced()).not.toHaveProperty("swing");
  });

  it("merges quick changes into one undo step", () => {
    for (const swing of [55, 58, 60]) {
      clock += 100;
      store.getState().setSwing(swing);
    }

    store.getState().undo();

    expect(store.getState().swing).toBe(50);
  });
});

describe("setSwingGrid", () => {
  it("swings the sixteenths at first, with no grid in the patch", () => {
    expect(store.getState().swingGrid).toBe("1/16");
    expect(store.getState().toPatch()).not.toHaveProperty("swingGrid");
  });

  it("stores and syncs the grid, and leaves the patch without it back on the sixteenths", () => {
    store.getState().setSwingGrid("1/8");
    expect(store.getState().swingGrid).toBe("1/8");
    expect(synced()!.swingGrid).toBe("1/8");

    store.getState().setSwingGrid("1/16");
    expect(store.getState().swingGrid).toBe("1/16");
    expect(synced()).not.toHaveProperty("swingGrid");
  });

  it("is one undo step, and ignores a grid it does not know or the one it has", () => {
    const steps = store.getState().past.length;

    store.getState().setSwingGrid("1/4" as never);
    store.getState().setSwingGrid("1/16");
    expect(store.getState().past).toHaveLength(steps);

    store.getState().setSwingGrid("1/8");
    store.getState().undo();
    expect(store.getState().swingGrid).toBe("1/16");
  });

  it("loads the grid with the patch", () => {
    store.getState().loadPatch({ tempo: 120, swing: 66, swingGrid: "1/8", nodes: [], connections: [] });

    expect(store.getState().swingGrid).toBe("1/8");
  });
});

describe("setMeter", () => {
  it("starts in four, with no meter in the patch", () => {
    expect(store.getState().meter).toEqual([4]);
    expect(store.getState().toPatch()).not.toHaveProperty("meter");
  });

  it("stores and syncs the meter, and leaves the patch without it back in four", () => {
    store.getState().setMeter([3, 2]);
    expect(store.getState().meter).toEqual([3, 2]);
    expect(synced()!.meter).toEqual([3, 2]);

    store.getState().setMeter([4]);
    expect(store.getState().meter).toEqual([4]);
    expect(synced()).not.toHaveProperty("meter");
  });

  it("ignores a meter that is not one, or the one it has, with no undo step", () => {
    const steps = store.getState().past.length;

    store.getState().setMeter([0]);
    store.getState().setMeter([4]);

    expect(store.getState().meter).toEqual([4]);
    expect(store.getState().past).toHaveLength(steps);
  });

  it("lengthens the clips and moves the lanes of the song into its bars, as one undo step", () => {
    const clip = store.getState().addNode("clip", { x: 0, y: 0 }).id;
    store.getState().updateParam(clip, "notes", "C4@0+1 G4@7+1", { merge: false });
    store.getState().setSongLength(4);
    store.getState().recordTake(`${clip}.octave`, [{ beat: 0, value: 0 }, { beat: 4, value: 1 }, { beat: 7.5, value: 2 }], 0, 8);

    store.getState().setMeter([3]);

    expect(store.getState().nodes[0].params).toMatchObject({ bars: 3, notes: "C4@0+1 G4@7+1" });
    expect(store.getState().song?.automation?.[`${clip}.octave`]).toBe("0:0 3:1 5.5:2");

    store.getState().undo();
    expect(store.getState().meter).toEqual([4]);
    expect(store.getState().nodes[0].params.bars).toBe(2);
    expect(store.getState().song?.automation?.[`${clip}.octave`]).toBe("0:0 4:1 7.5:2");
  });

  it("stores and syncs a meter in eighths", () => {
    store.getState().setMeter({ eighths: [3, 3] });

    expect(store.getState().meter).toEqual({ eighths: [3, 3] });
    expect(synced()!.meter).toEqual({ eighths: [3, 3] });
  });

  it("loads the meter with the patch", () => {
    store.getState().loadPatch({ tempo: 120, nodes: [], connections: [], meter: [3] });

    expect(store.getState().meter).toEqual([3]);
  });
});

describe("setTempo", () => {
  it("starts at 120 BPM", () => {
    expect(store.getState().tempo).toBe(120);
  });

  it("stores and syncs the tempo, rounded and within range", () => {
    store.getState().setTempo(97.6);
    expect(store.getState().tempo).toBe(98);
    expect(synced()!.tempo).toBe(98);

    clock += 2000;
    store.getState().setTempo(1000);
    expect(store.getState().tempo).toBe(300);
  });

  it("merges quick changes into one undo step", () => {
    for (const tempo of [121, 122, 123]) {
      clock += 100;
      store.getState().setTempo(tempo);
    }

    store.getState().undo();

    expect(store.getState().tempo).toBe(120);
  });

  it("ignores values that are not numbers", () => {
    store.getState().setTempo(Number.NaN);

    expect(engine.sync).not.toHaveBeenCalled();
  });
});

describe("renameNode", () => {
  it("names a node, trimmed, as one undo step", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });

    store.getState().renameNode(id, "  VCA ");

    expect(store.getState().nodes[0].name).toBe("VCA");
    store.getState().undo();
    expect(store.getState().nodes[0]).not.toHaveProperty("name");
  });

  it("removes the name when it is cleared", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });
    store.getState().renameNode(id, "VCA");

    store.getState().renameNode(id, " ");

    expect(store.getState().nodes[0]).not.toHaveProperty("name");
  });

  it("cuts names that are too long", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });

    store.getState().renameNode(id, "x".repeat(60));

    expect(store.getState().nodes[0].name).toHaveLength(40);
  });

  it("ignores unchanged names and unknown nodes", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });
    store.getState().renameNode(id, "VCA");
    const steps = store.getState().past.length;

    store.getState().renameNode(id, "VCA");
    store.getState().renameNode("nope", "X");

    expect(store.getState().past).toHaveLength(steps);
  });

  it("does not rebuild the audio module", () => {
    const context = new FakeAudioContext();
    const real = createPatchStore(new AudioEngine(context.asAudioContext()));
    const { id } = real.getState().addNode("oscillator", { x: 0, y: 0 });

    real.getState().renameNode(id, "Lead");

    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0].stopped).toBe(false);
  });
});

describe("updateParam", () => {
  it("stores the value and syncs it", () => {
    const { id } = store.getState().addNode("filter", { x: 0, y: 0 });

    store.getState().updateParam(id, "frequency", 1800);

    expect(store.getState().nodes[0].params.frequency).toBe(1800);
    expect(synced()!.nodes[0].params.frequency).toBe(1800);
  });

  it("transposes a sequencer's steps with its root, as one undo step", () => {
    const { id } = store.getState().addNode("sequencer", { x: 0, y: 0 });
    const before = store.getState().nodes[0].params.steps;

    store.getState().updateParam(id, "root", "E");

    expect(store.getState().nodes[0].params.steps).toBe("E4 - G4 - A4 - B4 - D5 - B4 - A4 - G4 -");
    expect(synced()!.nodes[0].params.steps).toBe("E4 - G4 - A4 - B4 - D5 - B4 - A4 - G4 -");
    store.getState().undo();
    expect(store.getState().nodes[0].params).toMatchObject({ root: "C", steps: before });
  });

  it("ignores unknown nodes", () => {
    store.getState().updateParam("nope", "gain", 1);

    expect(engine.sync).not.toHaveBeenCalled();
  });
});

describe("connect", () => {
  beforeEach(() => {
    store.getState().addNode("oscillator", { x: 0, y: 0 });
    store.getState().addNode("filter", { x: 0, y: 0 });
  });

  it("adds a valid connection and syncs it", () => {
    const connection = store.getState().connect(audio("oscillator-1"), audio("filter-2"));

    expect(connection).toEqual({
      id: "oscillator-1:audio->filter-2:audio",
      source: audio("oscillator-1"),
      target: audio("filter-2"),
    });
    expect(store.getState().connections).toEqual([connection]);
    expect(synced()!.connections).toEqual([connection]);
  });

  it("rejects an invalid connection", () => {
    engine.sync.mockClear();

    const connection = store.getState().connect(audio("filter-2"), audio("oscillator-1"));

    expect(connection).toBeNull();
    expect(store.getState().connections).toEqual([]);
    expect(engine.sync).not.toHaveBeenCalled();
  });

  it("tells whether a connection is possible", () => {
    expect(store.getState().canConnect(audio("oscillator-1"), audio("filter-2"))).toBe(true);
    expect(store.getState().canConnect(audio("filter-2"), audio("oscillator-1"))).toBe(false);
  });
});

describe("disconnect", () => {
  it("removes the connection and syncs it", () => {
    store.getState().addNode("oscillator", { x: 0, y: 0 });
    store.getState().addNode("filter", { x: 0, y: 0 });
    const connection = store.getState().connect(audio("oscillator-1"), audio("filter-2"))!;
    store.getState().setConnectionSelected(connection.id, true);

    store.getState().disconnect(connection.id);

    expect(store.getState().connections).toEqual([]);
    expect(store.getState().selectedConnectionIds).toEqual([]);
    expect(synced()!.connections).toEqual([]);
  });

  it("ignores unknown connections", () => {
    store.getState().disconnect("nope");

    expect(engine.sync).not.toHaveBeenCalled();
  });
});

describe("setConnectionAmount", () => {
  beforeEach(() => {
    store.getState().addNode("lfo", { x: 0, y: 0 });
    store.getState().addNode("filter", { x: 0, y: 0 });
  });

  const control = () =>
    store.getState().connect({ nodeId: "lfo-1", port: "out" }, { nodeId: "filter-2", port: "frequency" })!;

  it("stores the amount and syncs it", () => {
    const { id } = control();

    store.getState().setConnectionAmount(id, -0.3);

    expect(store.getState().connections[0].amount).toBe(-0.3);
    expect(synced()!.connections[0].amount).toBe(-0.3);
  });

  it("ignores unknown connections", () => {
    engine.sync.mockClear();

    store.getState().setConnectionAmount("nope", 0.5);

    expect(engine.sync).not.toHaveBeenCalled();
  });

  it("merges quick changes into one undo step, unless asked not to", () => {
    const { id } = control();
    for (const amount of [0.9, 0.8]) {
      clock += 100;
      store.getState().setConnectionAmount(id, amount);
    }
    clock += 100;
    store.getState().setConnectionAmount(id, 0.25, { merge: false });

    store.getState().undo();
    expect(store.getState().connections[0].amount).toBe(0.8);
    store.getState().undo();
    expect(store.getState().connections[0]).not.toHaveProperty("amount");
  });
});

describe("setConnectionSwitch", () => {
  beforeEach(() => {
    store.getState().addNode("oscillator", { x: 0, y: 0 });
    store.getState().addNode("mixer", { x: 0, y: 0 });
  });

  const channel = () => store.getState().connect(audio("oscillator-1"), audio("mixer-2"))!;

  it("mutes and solos a cable, and syncs it", () => {
    const { id } = channel();

    store.getState().setConnectionSwitch(id, "mute", true);
    store.getState().setConnectionSwitch(id, "solo", true);

    expect(store.getState().connections[0]).toMatchObject({ mute: true, solo: true });
    expect(synced()!.connections[0]).toMatchObject({ mute: true, solo: true });
  });

  it("leaves nothing on the cable once switched off", () => {
    const { id } = channel();
    store.getState().setConnectionSwitch(id, "mute", true);

    store.getState().setConnectionSwitch(id, "mute", false);

    expect(store.getState().connections[0]).not.toHaveProperty("mute");
  });

  it("makes each switch its own undo step", () => {
    const { id } = channel();
    store.getState().setConnectionSwitch(id, "mute", true);
    store.getState().setConnectionSwitch(id, "solo", true);

    store.getState().undo();

    expect(store.getState().connections[0]).toMatchObject({ mute: true });
    expect(store.getState().connections[0]).not.toHaveProperty("solo");
  });

  it("ignores unknown connections and switches that do not change", () => {
    const { id } = channel();
    engine.sync.mockClear();

    store.getState().setConnectionSwitch("nope", "mute", true);
    store.getState().setConnectionSwitch(id, "mute", false);

    expect(engine.sync).not.toHaveBeenCalled();
  });
});

describe("remove", () => {
  beforeEach(() => {
    store.getState().addNode("oscillator", { x: 0, y: 0 });
    store.getState().addNode("filter", { x: 0, y: 0 });
    store.getState().addNode("output", { x: 0, y: 0 });
    store.getState().connect(audio("oscillator-1"), audio("filter-2"));
    store.getState().connect(audio("filter-2"), audio("output-3"));
  });

  it("removes a node and every connection touching it", () => {
    store.getState().removeNode("filter-2");

    expect(store.getState().nodes.map((node) => node.id)).toEqual(["oscillator-1", "output-3"]);
    expect(store.getState().connections).toEqual([]);
    expect(synced()).toEqual(store.getState().toPatch());
  });

  it("removes nodes and connections in a single undo step", () => {
    store.getState().remove({ nodes: ["output-3"], connections: ["oscillator-1:audio->filter-2:audio"] });

    expect(store.getState().nodes).toHaveLength(2);
    expect(store.getState().connections).toEqual([]);

    store.getState().undo();

    expect(store.getState().nodes).toHaveLength(3);
    expect(store.getState().connections).toHaveLength(2);
  });

  it("drops the view state of removed nodes", () => {
    store.getState().setNodeView("filter-2", { selected: true });

    store.getState().removeNode("filter-2");

    expect(store.getState().nodeViews["filter-2"]).toBeUndefined();
  });

  it("ignores unknown nodes", () => {
    engine.sync.mockClear();

    store.getState().removeNode("nope");

    expect(engine.sync).not.toHaveBeenCalled();
  });
});

describe("view state", () => {
  it("merges node view changes without touching the engine", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });
    engine.sync.mockClear();

    store.getState().setNodeView(id, { selected: true });
    store.getState().setNodeView(id, { measured: { width: 100, height: 50 } });

    expect(store.getState().nodeViews[id]).toEqual({
      selected: true,
      measured: { width: 100, height: 50 },
    });
    expect(engine.sync).not.toHaveBeenCalled();
  });

  it("tracks selected connections", () => {
    store.getState().setConnectionSelected("c1", true);
    store.getState().setConnectionSelected("c2", true);
    store.getState().setConnectionSelected("c1", false);

    expect(store.getState().selectedConnectionIds).toEqual(["c2"]);
  });
});

describe("toPatch", () => {
  it("returns the serializable patch", () => {
    const osc = store.getState().addNode("oscillator", { x: 1, y: 2 });
    const out = store.getState().addNode("output", { x: 3, y: 4 });
    const connection = store.getState().connect(audio(osc.id), audio(out.id));
    store.getState().setNodeView(osc.id, { selected: true });

    expect(store.getState().toPatch()).toEqual({ nodes: [osc, out], connections: [connection], tempo: 120 });
  });
});

describe("loadPatch and the engine", () => {
  it("starts the engine afresh before it plays a patch loaded, and not on any other change", () => {
    const order: string[] = [];
    const reset = vi.fn(async () => {
      order.push("reset");
    });
    const sync = vi.fn<PatchEngine["sync"]>(() => {
      order.push("sync");
    });
    const loading = createPatchStore({ sync, reset });
    loading.getState().addNode("lfo", { x: 0, y: 0 });
    expect(reset).not.toHaveBeenCalled();

    order.length = 0;
    loading.getState().loadPatch({ tempo: 100, nodes: [], connections: [] });

    expect(order).toEqual(["reset", "sync"]);
  });
});

describe("loadPatch", () => {
  const loaded: Patch = {
    tempo: 100,
    nodes: [
      { id: "lfo-7", type: "lfo", position: { x: 0, y: 0 }, params: { waveform: "sine", rate: 1 } },
      { id: "gain-12", type: "gain", position: { x: 1, y: 1 }, params: { gain: 0 } },
    ],
    connections: [
      {
        id: "lfo-7:out->gain-12:gain",
        source: { nodeId: "lfo-7", port: "out" },
        target: { nodeId: "gain-12", port: "gain" },
        amount: 0.5,
      },
    ],
  };

  beforeEach(() => {
    store.getState().addNode("oscillator", { x: 0, y: 0 });
    store.getState().setNodeView("oscillator-1", { selected: true });
    store.getState().setConnectionSelected("x", true);
  });

  it("replaces the current patch and syncs it", () => {
    store.getState().loadPatch(loaded);

    expect(store.getState().toPatch()).toEqual(loaded);
    expect(synced()).toEqual(loaded);
  });

  it("clears the view state", () => {
    store.getState().loadPatch(loaded);

    expect(store.getState().nodeViews).toEqual({});
    expect(store.getState().selectedConnectionIds).toEqual([]);
  });

  it("continues ids after the highest loaded one", () => {
    store.getState().loadPatch(loaded);

    expect(store.getState().addNode("filter", { x: 0, y: 0 }).id).toBe("filter-13");
  });

  it("can be undone", () => {
    store.getState().loadPatch(loaded);

    store.getState().undo();

    expect(store.getState().nodes.map((node) => node.id)).toEqual(["oscillator-1"]);
  });
});

describe("undo and redo", () => {
  it("starts with nothing to undo or redo", () => {
    expect(store.getState().past).toEqual([]);
    expect(store.getState().future).toEqual([]);
  });

  it("undoes and redoes a change, syncing the engine", () => {
    const node = store.getState().addNode("gain", { x: 0, y: 0 });

    store.getState().undo();
    expect(store.getState().nodes).toEqual([]);
    expect(synced()).toEqual({ nodes: [], connections: [], tempo: 120 });

    store.getState().redo();
    expect(store.getState().nodes).toEqual([node]);
    expect(synced()).toEqual({ nodes: [node], connections: [], tempo: 120 });
  });

  it("undoes several steps in order", () => {
    store.getState().addNode("oscillator", { x: 0, y: 0 });
    store.getState().addNode("output", { x: 0, y: 0 });
    store.getState().connect(audio("oscillator-1"), audio("output-2"));

    store.getState().undo();
    expect(store.getState().connections).toEqual([]);
    store.getState().undo();
    expect(store.getState().nodes.map((node) => node.id)).toEqual(["oscillator-1"]);
  });

  it("forgets the redo steps after a new change", () => {
    store.getState().addNode("gain", { x: 0, y: 0 });
    store.getState().undo();

    store.getState().addNode("filter", { x: 0, y: 0 });

    expect(store.getState().future).toEqual([]);
  });

  it("ignores undo and redo with nothing to do", () => {
    store.getState().undo();
    store.getState().redo();

    expect(engine.sync).not.toHaveBeenCalled();
  });

  it("merges quick changes of the same param into one step", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });
    for (const value of [0.6, 0.7, 0.8]) {
      clock += 100;
      store.getState().updateParam(id, "gain", value);
    }

    store.getState().undo();

    expect(store.getState().nodes[0].params.gain).toBe(0.5);
  });

  it("keeps slow changes of the same param as separate steps", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });
    store.getState().updateParam(id, "gain", 0.6);
    clock += 2000;
    store.getState().updateParam(id, "gain", 0.8);

    store.getState().undo();

    expect(store.getState().nodes[0].params.gain).toBe(0.6);
  });

  it("keeps quick changes as separate steps when asked not to merge", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });
    store.getState().updateParam(id, "gain", 0.6, { merge: false });
    store.getState().updateParam(id, "gain", 0.7, { merge: false });

    store.getState().undo();

    expect(store.getState().nodes[0].params.gain).toBe(0.6);
  });

  it("merges the changes of a named gesture, but not what came before it", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });
    store.getState().updateParam(id, "gain", 0.6);
    for (const value of [0.7, 0.8]) {
      store.getState().updateParam(id, "gain", value, { merge: "drag-1" });
    }

    store.getState().undo();

    expect(store.getState().nodes[0].params.gain).toBe(0.6);
  });

  it("does not merge changes of different params", () => {
    const { id } = store.getState().addNode("filter", { x: 0, y: 0 });
    store.getState().updateParam(id, "frequency", 800);
    store.getState().updateParam(id, "Q", 5);

    store.getState().undo();

    expect(store.getState().nodes[0].params).toMatchObject({ frequency: 800, Q: 1 });
  });

  it("merges a node drag into one step", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });
    for (let x = 1; x <= 50; x++) {
      store.getState().moveNode(id, { x, y: 0 });
    }

    store.getState().undo();

    expect(store.getState().nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("keeps at most 100 steps", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });
    for (let step = 0; step < 150; step++) {
      clock += 2000;
      store.getState().updateParam(id, "gain", step / 150);
    }

    expect(store.getState().past).toHaveLength(100);
  });

  it("drops the view state of nodes that an undo removes", () => {
    const { id } = store.getState().addNode("gain", { x: 0, y: 0 });
    store.getState().setNodeView(id, { selected: true });

    store.getState().undo();

    expect(store.getState().nodeViews).toEqual({});
  });
});

describe("when the engine fails", () => {
  it("keeps the previous patch and puts the engine back in sync", () => {
    store.getState().addNode("gain", { x: 0, y: 0 });
    const before = store.getState().toPatch();
    engine.sync.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    expect(() => store.getState().addNode("filter", { x: 0, y: 0 })).toThrow("boom");

    expect(store.getState().toPatch()).toEqual(before);
    expect(synced()).toEqual(before);
    expect(store.getState().past).toHaveLength(1);
  });

  it("keeps the history when an undo fails", () => {
    store.getState().addNode("gain", { x: 0, y: 0 });
    const before = store.getState().toPatch();
    engine.sync.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    expect(() => store.getState().undo()).toThrow("boom");

    expect(store.getState().toPatch()).toEqual(before);
    expect(synced()).toEqual(before);
    expect(store.getState().past).toHaveLength(1);
    expect(store.getState().future).toEqual([]);
  });
});

describe("with the real engine", () => {
  let context: FakeAudioContext;
  let real: ReturnType<typeof createPatchStore>;

  beforeEach(() => {
    context = new FakeAudioContext();
    real = createPatchStore(new AudioEngine(context.asAudioContext()));
  });

  it("builds a playable chain", () => {
    const { addNode, connect, updateParam } = real.getState();
    addNode("oscillator", { x: 0, y: 0 });
    addNode("filter", { x: 0, y: 0 });
    addNode("gain", { x: 0, y: 0 });
    addNode("output", { x: 0, y: 0 });
    connect(audio("oscillator-1"), audio("filter-2"));
    connect(audio("filter-2"), audio("gain-3"));
    connect(audio("gain-3"), audio("output-4"));
    updateParam("filter-2", "frequency", 500);

    const [gain, output, fade] = context.gains;
    expect(context.oscillators[0].outputs.has(context.filters[0])).toBe(true);
    expect(context.filters[0].outputs.has(gain)).toBe(true);
    expect(gain.outputs.has(output)).toBe(true);
    expect(output.outputs.has(context.workletNodes[0])).toBe(true);
    expect(context.workletNodes[0].outputs.has(fade)).toBe(true);
    expect(fade.outputs.has(context.destination)).toBe(true);
    expect(context.filters[0].frequency.value).toBe(500);
  });

  it("restores a removed module and its connections on undo", () => {
    real.getState().addNode("oscillator", { x: 0, y: 0 });
    real.getState().addNode("output", { x: 0, y: 0 });
    real.getState().connect(audio("oscillator-1"), audio("output-2"));

    real.getState().removeNode("oscillator-1");
    expect(context.oscillators[0].stopped).toBe(true);

    real.getState().undo();
    const restored = context.oscillators.at(-1)!;
    expect(context.oscillators).toHaveLength(2);
    expect(restored.outputs.has(context.gains[0])).toBe(true);
  });

  it("rebuilds the audio graph when loading", () => {
    real.getState().addNode("oscillator", { x: 0, y: 0 });

    real.getState().loadPatch({
      tempo: 120,
      nodes: [
        { id: "osc-1", type: "oscillator", position: { x: 0, y: 0 }, params: defaultParams("oscillator") },
        { id: "out-2", type: "output", position: { x: 0, y: 0 }, params: {} },
      ],
      connections: [
        { id: "c", source: { nodeId: "osc-1", port: "audio" }, target: { nodeId: "out-2", port: "audio" } },
      ],
    });

    const [old, loadedOscillator] = context.oscillators;
    expect(old.stopped).toBe(true);
    expect(loadedOscillator.outputs.has(context.gains[0])).toBe(true);
    expect(context.gains[0].outputs.has(context.workletNodes.at(-1)!)).toBe(true);
    expect(context.workletNodes.at(-1)!.outputs.has(context.gains[1])).toBe(true);
    expect(context.gains[1].outputs.has(context.destination)).toBe(true);
  });
});

describe("patterns", () => {
  const rest = "- - - - - - - - - - - - - - -";

  it("gives a new sequencer three patterns that copy the first", () => {
    const node = store.getState().addNode("sequencer", { x: 0, y: 0 });

    expect(node.patterns?.A2).toMatchObject({ steps: node.params.steps, length: 16 });
    expect(store.getState().addNode("lfo", { x: 0, y: 0 })).not.toHaveProperty("patterns");
  });

  it("changes a param of the pattern being edited, as one undo step", () => {
    const { id } = store.getState().addNode("sequencer", { x: 0, y: 0 });
    const before = store.getState().nodes[0];

    store.getState().updateParam(id, "steps", `D4 ${rest}`, { merge: false, pattern: "A2" });

    const node = store.getState().nodes[0];
    expect(node.patterns?.A2?.steps).toBe(`D4 ${rest}`);
    expect(node.params.steps).toBe(before.params.steps);
    expect(synced()?.nodes[0].patterns?.A2?.steps).toBe(`D4 ${rest}`);
    store.getState().undo();
    expect(store.getState().nodes[0]).toEqual(before);
  });

  it("changes several params of a pattern at once, as one undo step", () => {
    const { id } = store.getState().addNode("clip", { x: 0, y: 0 });
    const before = store.getState().nodes[0];

    store.getState().updateParams(id, { bars: 4, notes: "C4@0+1" }, { pattern: "A2" });

    const node = store.getState().nodes[0];
    expect(node.patterns?.A2).toMatchObject({ bars: 4, notes: "C4@0+1" });
    expect(node.params).toEqual(before.params);
    expect(synced()?.nodes[0].patterns?.A2?.bars).toBe(4);
    store.getState().undo();
    expect(store.getState().nodes[0]).toEqual(before);
  });

  it("merges quick changes of the same param only within the same pattern", () => {
    const { id } = store.getState().addNode("sequencer", { x: 0, y: 0 });

    store.getState().updateParam(id, "length", 8, { pattern: "A2" });
    store.getState().updateParam(id, "length", 4, { pattern: "A3" });

    expect(store.getState().past).toHaveLength(3);
  });
});

describe("clip editor", () => {
  it("opens on a clip and closes, without an undo step", () => {
    const { id } = store.getState().addNode("clip", { x: 0, y: 0 });

    store.getState().openClipEditor([id]);
    expect(store.getState().clipEditor).toEqual([id]);
    expect(store.getState().past).toHaveLength(1);

    store.getState().openClipEditor(undefined);
    expect(store.getState().clipEditor).toBeUndefined();
  });

  it("closes when its clip goes away", () => {
    const { id } = store.getState().addNode("clip", { x: 0, y: 0 });
    store.getState().openClipEditor([id]);

    store.getState().removeNode(id);

    expect(store.getState().clipEditor).toBeUndefined();
  });

  it("stays open on a clip inside a subpatch while going up and down, and closes when it goes away", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    const clip = store.getState().addNode("clip", { x: 0, y: 0 });
    store.getState().closeSubpatch(0);

    store.getState().openClipEditor([subpatch.id, clip.id], "A2");
    store.getState().openSubpatch(subpatch.id);
    store.getState().closeSubpatch(0);
    expect(store.getState()).toMatchObject({ clipEditor: [subpatch.id, clip.id], clipPattern: "A2" });

    store.getState().removeNode(subpatch.id);
    expect(store.getState().clipEditor).toBeUndefined();
  });
});

describe("updateParamAt", () => {
  it("sets a param of a node anywhere by its path, in the pattern given, as one undo step", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    const clip = store.getState().addNode("clip", { x: 0, y: 0 });
    store.getState().closeSubpatch(0);
    const inner = () => store.getState().nodes[0].patch!.nodes[0];

    store.getState().updateParamAt([subpatch.id, clip.id], "notes", "C4@0+1", { merge: false, pattern: "A2" });

    expect(inner().patterns?.A2?.notes).toBe("C4@0+1");
    expect(inner().params.notes).toBe(clip.params.notes);
    store.getState().undo();
    expect(inner().patterns?.A2?.notes).toBe(clip.params.notes);
  });

  it("sets several params of a node by its path at once, as one undo step", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    const clip = store.getState().addNode("clip", { x: 0, y: 0 });
    store.getState().closeSubpatch(0);
    const steps = store.getState().past.length;

    store.getState().updateParamsAt([subpatch.id, clip.id], { bars: 4, notes: "" });

    expect(store.getState().nodes[0].patch!.nodes[0].params).toMatchObject({ bars: 4, notes: "" });
    expect(store.getState().past).toHaveLength(steps + 1);
  });

  it("ignores paths to nodes that are not there", () => {
    store.getState().addNode("clip", { x: 0, y: 0 });
    const steps = store.getState().past.length;

    store.getState().updateParamAt(["nope", "clip-1"], "bars", 4);
    store.getState().updateParamAt(["nope"], "bars", 4);
    store.getState().updateParamsAt([], { bars: 4 });

    expect(store.getState().past).toHaveLength(steps);
  });
});

describe("setConnectionPan", () => {
  beforeEach(() => {
    store.getState().addNode("oscillator", { x: 0, y: 0 });
    store.getState().addNode("mixer", { x: 0, y: 0 });
  });

  const channel = () => store.getState().connect(audio("oscillator-1"), audio("mixer-2"))!;

  it("stores the pan and syncs it, and leaves nothing on the cable once centred", () => {
    const { id } = channel();

    store.getState().setConnectionPan(id, 0.4);
    expect(store.getState().connections[0].pan).toBe(0.4);
    expect(synced()!.connections[0].pan).toBe(0.4);

    store.getState().setConnectionPan(id, 0);
    expect(store.getState().connections[0]).not.toHaveProperty("pan");
  });

  it("merges quick changes into one undo step, unless asked not to", () => {
    const { id } = channel();
    for (const pan of [-0.1, -0.2]) {
      clock += 100;
      store.getState().setConnectionPan(id, pan);
    }
    clock += 100;
    store.getState().setConnectionPan(id, 1, { merge: false });

    store.getState().undo();
    expect(store.getState().connections[0].pan).toBe(-0.2);
    store.getState().undo();
    expect(store.getState().connections[0]).not.toHaveProperty("pan");
  });
});

describe("subpatches", () => {
  const enter = () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    return subpatch;
  };

  it("gives a new subpatch an empty graph", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });

    expect(subpatch.patch).toEqual({ nodes: [], connections: [] });
  });

  it("shows the graph inside a subpatch once opened, and edits it there", () => {
    const subpatch = enter();

    const filter = store.getState().addNode("filter", { x: 10, y: 10 });

    expect(store.getState().path).toEqual([subpatch.id]);
    expect(store.getState().nodes.map(({ id }) => id)).toEqual([filter.id]);
    expect(store.getState().toPatch().nodes.map(({ id }) => id)).toEqual([subpatch.id]);
    expect(store.getState().toPatch().nodes[0].patch?.nodes.map(({ id }) => id)).toEqual([filter.id]);
  });

  it("plays the whole patch, flattened, whatever is on show", () => {
    const subpatch = enter();

    store.getState().addNode("filter", { x: 0, y: 0 });

    expect(synced()!.nodes.map(({ id }) => id)).toEqual([`${subpatch.id}/filter-2`]);
  });

  it("goes back up without an undo step, and undoes inside as anywhere else", () => {
    const subpatch = enter();
    store.getState().addNode("filter", { x: 0, y: 0 });
    const steps = store.getState().past.length;

    store.getState().closeSubpatch(0);
    expect(store.getState().path).toEqual([]);
    expect(store.getState().nodes.map(({ id }) => id)).toEqual([subpatch.id]);
    expect(store.getState().past).toHaveLength(steps);

    store.getState().openSubpatch(subpatch.id);
    store.getState().undo();
    expect(store.getState().nodes).toEqual([]);
    expect(store.getState().path).toEqual([subpatch.id]);
  });

  it("goes back to the top when an undo takes away the subpatch on show", () => {
    enter();

    store.getState().undo();

    expect(store.getState().path).toEqual([]);
    expect(store.getState().nodes).toEqual([]);
  });

  it("only opens subpatches of the graph on show", () => {
    const filter = store.getState().addNode("filter", { x: 0, y: 0 });

    store.getState().openSubpatch(filter.id);
    store.getState().openSubpatch("nope");

    expect(store.getState().path).toEqual([]);
  });

  it("drops the cables outside to an In that goes, or that changes its signal", () => {
    const oscillator = store.getState().addNode("oscillator", { x: 0, y: 0 });
    const lfo = store.getState().addNode("lfo", { x: 0, y: 0 });
    const subpatch = enter();
    const sound = store.getState().addNode("inlet", { x: 0, y: 0 });
    const cutoff = store.getState().addNode("inlet", { x: 0, y: 100 });
    store.getState().updateParam(cutoff.id, "signal", "control", { merge: false });
    store.getState().closeSubpatch(0);
    store.getState().connect({ nodeId: oscillator.id, port: "audio" }, { nodeId: subpatch.id, port: sound.id });
    store.getState().connect({ nodeId: lfo.id, port: "out" }, { nodeId: subpatch.id, port: cutoff.id });
    expect(store.getState().connections).toHaveLength(2);

    store.getState().openSubpatch(subpatch.id);
    store.getState().updateParam(cutoff.id, "signal", "trigger", { merge: false });
    store.getState().removeNode(sound.id);

    expect(store.getState().toPatch().connections).toEqual([]);
  });

  it("continues the ids of the nodes inside subpatches after a load", () => {
    const subpatch = enter();
    store.getState().addNode("filter", { x: 0, y: 0 });
    const saved = store.getState().toPatch();

    store.getState().loadPatch({ ...saved });

    expect(store.getState().path).toEqual([]);
    expect(store.getState().addNode("gain", { x: 0, y: 0 }).id).toBe("gain-3");
    expect(subpatch.id).toBe("subpatch-1");
  });

  it("clears the selection when it moves between graphs", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().setNodeView(subpatch.id, { selected: true });

    store.getState().openSubpatch(subpatch.id);

    expect(store.getState().nodeViews).toEqual({});
  });
});

describe("updateInnerParam", () => {
  it("sets a param of a node inside a subpatch of the graph on show, as one undo step", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    const cutoff = store.getState().addNode("inlet", { x: 0, y: 0 });
    store.getState().closeSubpatch(0);
    const inner = () => store.getState().nodes[0].patch!.nodes[0];

    store.getState().updateInnerParam(subpatch.id, cutoff.id, "value", 0.4, { merge: false });

    expect(inner().params.value).toBe(0.4);
    expect(store.getState().path).toEqual([]);
    store.getState().undo();
    expect(inner().params.value).toBe(0);
  });

  it("sets a param of a pattern of a node inside, leaving pattern A1 alone", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    const seq = store.getState().addNode("sequencer", { x: 0, y: 0 });
    store.getState().closeSubpatch(0);

    store.getState().updateInnerParam(subpatch.id, seq.id, "length", 8, { pattern: "B3" });

    const inner = store.getState().nodes[0].patch!.nodes[0];
    expect(inner.patterns?.B3?.length).toBe(8);
    expect(inner.params.length).toBe(16);
  });

  it("ignores subpatches and nodes that are not there", () => {
    const steps = store.getState().past.length;

    store.getState().updateInnerParam("nope", "inlet-1", "value", 1);

    expect(store.getState().past).toHaveLength(steps);
  });
});

describe("published params", () => {
  const build = () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    const envelope = store.getState().addNode("envelope", { x: 0, y: 0 });
    return { subpatch: subpatch.id, envelope: envelope.id };
  };
  const publishedOn = () => store.getState().toPatch().nodes[0].published;

  it("publishes a param of a node inside on its subpatch, and takes it back, each as one undo step", () => {
    const { envelope } = build();

    store.getState().togglePublished(envelope, "decay");
    expect(publishedOn()).toEqual([{ node: envelope, param: "decay" }]);
    expect(store.getState().published).toEqual([{ node: envelope, param: "decay" }]);

    store.getState().togglePublished(envelope, "decay");
    expect(publishedOn()).toBeUndefined();

    store.getState().undo();
    expect(publishedOn()).toEqual([{ node: envelope, param: "decay" }]);
  });

  it("publishes nothing outside a subpatch, nor a param the node has not", () => {
    const { envelope } = build();
    store.getState().togglePublished(envelope, "nope");
    store.getState().closeSubpatch(0);
    const steps = store.getState().past.length;

    store.getState().togglePublished("subpatch-1", "voices");

    expect(store.getState().past).toHaveLength(steps);
    expect(publishedOn()).toBeUndefined();
  });

  it("renames a published param, and goes back to its own name when the name is cleared", () => {
    const { subpatch, envelope } = build();
    store.getState().togglePublished(envelope, "decay");
    store.getState().closeSubpatch(0);

    store.getState().renamePublished(subpatch, `${envelope}.decay`, "  Decay ");
    expect(publishedOn()).toEqual([{ node: envelope, param: "decay", name: "Decay" }]);

    store.getState().renamePublished(subpatch, `${envelope}.decay`, "");
    expect(publishedOn()).toEqual([{ node: envelope, param: "decay" }]);
  });

  it("publishes several params of a node at once, as the rows of a Drums, and takes them all back, each as one undo step", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    const drums = store.getState().addNode("drums", { x: 0, y: 0 }).id;
    store.getState().togglePublished(drums, "snare");
    const steps = store.getState().past.length;

    store.getState().togglePublished(drums, ["kick", "snare", "hat"]);
    expect(publishedOn()).toEqual([
      { node: drums, param: "snare" },
      { node: drums, param: "kick" },
      { node: drums, param: "hat" },
    ]);
    expect(store.getState().past).toHaveLength(steps + 1);

    store.getState().togglePublished(drums, ["kick", "snare", "hat"]);
    expect(publishedOn()).toBeUndefined();
  });

  it("moves a published param on the face, starts a section at it and names it, each as one undo step", () => {
    const { subpatch, envelope } = build();
    store.getState().togglePublished(envelope, ["attack", "decay", "sustain"]);
    store.getState().closeSubpatch(0);
    const steps = store.getState().past.length;
    const order = () => publishedOn()!.map(({ param, section }) => [param, section]);

    store.getState().movePublished(subpatch, `${envelope}.sustain`, `${envelope}.attack`);
    expect(order()).toEqual([["sustain", undefined], ["attack", undefined], ["decay", undefined]]);

    store.getState().startSection(subpatch, `${envelope}.attack`);
    expect(order()).toEqual([["sustain", undefined], ["attack", "Section"], ["decay", "Section"]]);

    store.getState().nameSection(subpatch, `${envelope}.attack`, "Shape");
    expect(order()).toEqual([["sustain", undefined], ["attack", "Shape"], ["decay", "Shape"]]);
    expect(store.getState().past).toHaveLength(steps + 3);

    store.getState().nameSection(subpatch, `${envelope}.attack`, "Shape");
    store.getState().movePublished(subpatch, `${envelope}.attack`, `${envelope}.attack`);
    store.getState().movePublished("nope", `${envelope}.attack`, `${envelope}.decay`);
    expect(store.getState().past).toHaveLength(steps + 3);
  });

  it("publishes again a knob a subpatch inside publishes, and forgets it once that one takes it back", () => {
    const { subpatch: inner, envelope } = build();
    store.getState().togglePublished(envelope, "decay");
    store.getState().closeSubpatch(0);
    const outer = store.getState().groupNodes([inner])!.id;
    store.getState().openSubpatch(outer);

    store.getState().togglePublished(inner, `${envelope}.decay`);
    expect(publishedOn()).toEqual([{ node: inner, param: `${envelope}.decay` }]);

    store.getState().openSubpatch(inner);
    store.getState().togglePublished(envelope, "decay");
    expect(publishedOn()).toBeUndefined();
  });

  it("stops publishing the params of a node removed from inside", () => {
    const { envelope } = build();
    store.getState().togglePublished(envelope, "decay");

    store.getState().removeNode(envelope);

    expect(publishedOn()).toBeUndefined();
    expect(store.getState().published).toEqual([]);
  });
});

describe("groupNodes", () => {
  const add = (type: Parameters<ReturnType<typeof store.getState>["addNode"]>[0], x: number, y = 0) =>
    store.getState().addNode(type, { x, y }).id;
  const wire = (source: [string, string], target: [string, string]) =>
    store.getState().connect({ nodeId: source[0], port: source[1] }, { nodeId: target[0], port: target[1] })!;

  /** A keyboard and an LFO outside, a filter and a gain inside, a mixer and an output outside. */
  const build = () => {
    const keys = add("keyboard", 0);
    const lfo = add("lfo", 0, 300);
    const oscillator = add("oscillator", 200);
    const filter = add("filter", 400);
    const gain = add("gain", 600);
    const mixer = add("mixer", 800);
    wire([keys, "pitch"], [oscillator, "detune"]);
    wire([oscillator, "audio"], [filter, "audio"]);
    const cutoff = wire([lfo, "out"], [filter, "frequency"]);
    store.getState().setConnectionAmount(cutoff.id, -0.5, { merge: false });
    wire([lfo, "out"], [gain, "gain"]);
    wire([filter, "audio"], [gain, "audio"]);
    const channel = wire([gain, "audio"], [mixer, "audio"]);
    store.getState().setConnectionPan(channel.id, 0.3, { merge: false });
    return { keys, lfo, oscillator, filter, gain, mixer };
  };

  it("puts the nodes in a subpatch, with the cables between them inside", () => {
    const { oscillator, filter, gain } = build();

    const group = store.getState().groupNodes([oscillator, filter, gain])!;

    const inside = store.getState().nodes.find(({ id }) => id === group.id)!.patch!;
    expect(inside.nodes.filter(({ type }) => type !== "inlet" && type !== "outlet").map(({ id }) => id)).toEqual([
      oscillator,
      filter,
      gain,
    ]);
    expect(inside.connections.map(({ id }) => id)).toContain(`${oscillator}:audio->${filter}:audio`);
    expect(inside.connections.map(({ id }) => id)).toContain(`${filter}:audio->${gain}:audio`);
    expect(store.getState().nodes.map(({ id }) => id)).not.toContain(filter);
  });

  it("runs the cables that cross into the group through an In for each source outside, named after its port", () => {
    const { keys, lfo, oscillator, filter, gain } = build();

    const group = store.getState().groupNodes([oscillator, filter, gain])!;

    const inside = store.getState().nodes.find(({ id }) => id === group.id)!.patch!;
    const inlets = inside.nodes.filter(({ type }) => type === "inlet");
    expect(inlets.map((inlet) => [inlet.name, inlet.params.signal])).toEqual([
      ["pitch", "control"],
      ["out", "control"],
    ]);
    const outside = store.getState().connections;
    expect(outside.filter(({ target }) => target.nodeId === group.id).map(({ source }) => source.nodeId)).toEqual([
      keys,
      lfo,
    ]);
    const fromLfo = inside.connections.filter(({ source }) => source.nodeId === inlets[1].id);
    expect(fromLfo.map(({ target }) => target.port).sort()).toEqual(["frequency", "gain"]);
  });

  it("runs the cables that leave the group through an Out, keeping their settings where they end", () => {
    const { oscillator, filter, gain, mixer, lfo } = build();

    const group = store.getState().groupNodes([oscillator, filter, gain])!;

    const inside = store.getState().nodes.find(({ id }) => id === group.id)!.patch!;
    const outlets = inside.nodes.filter(({ type }) => type === "outlet");
    expect(outlets.map((outlet) => [outlet.name, outlet.params.signal])).toEqual([["audio", "audio"]]);
    const channel = store.getState().connections.find(({ target }) => target.nodeId === mixer)!;
    expect(channel).toMatchObject({ source: { nodeId: group.id, port: outlets[0].id }, pan: 0.3 });
    const cutoff = inside.connections.find(({ target }) => target.port === "frequency")!;
    expect(cutoff.amount).toBe(-0.5);
    expect(store.getState().connections.find(({ source }) => source.nodeId === lfo)).not.toHaveProperty("amount");
  });

  it("sounds the same once grouped: every cable, followed through the In and Out, ends where it did", () => {
    const { oscillator, filter, gain } = build();
    const routes = (patch: Patch) => {
      const isPort = (id: string) => /(^|\/)(inlet|outlet)-\d+$/.test(id);
      const base = (id: string) => id.split("/").at(-1);
      const found: string[] = [];
      const follow = (from: string, connection: Patch["connections"][number], amount: number, pan: number) => {
        const nextAmount = amount * (connection.amount ?? 1);
        const nextPan = pan + (connection.pan ?? 0);
        if (isPort(connection.target.nodeId)) {
          for (const next of patch.connections.filter(({ source }) => source.nodeId === connection.target.nodeId)) {
            follow(from, next, nextAmount, nextPan);
          }
          return;
        }
        found.push(`${from} -> ${base(connection.target.nodeId)}:${connection.target.port} ${nextAmount} ${nextPan}`);
      };
      for (const connection of patch.connections.filter(({ source }) => !isPort(source.nodeId))) {
        follow(`${base(connection.source.nodeId)}:${connection.source.port}`, connection, 1, 0);
      }
      return found.sort();
    };
    const before = routes(synced()!);

    store.getState().groupNodes([oscillator, filter, gain]);

    expect(routes(synced()!)).toEqual(before);
    expect(synced()!.nodes.some(({ id }) => id.endsWith(`/${filter}`))).toBe(true);
  });

  it("is one undo step", () => {
    const { oscillator, filter, gain } = build();
    const before = store.getState().toPatch();

    store.getState().groupNodes([oscillator, filter, gain]);
    store.getState().undo();

    expect(store.getState().toPatch()).toEqual(before);
  });

  it("does not group what would make a loop through the patch outside", () => {
    const { oscillator, gain } = build();
    const before = store.getState().toPatch();

    expect(store.getState().groupNodes([oscillator, gain])).toBeUndefined();
    expect(store.getState().toPatch()).toBe(before);
  });

  it("does nothing with no nodes of the graph on show", () => {
    expect(store.getState().groupNodes(["nope"])).toBeUndefined();
    expect(store.getState().past).toEqual([]);
  });
});

describe("copy, paste and duplicate", () => {
  const ids = () => store.getState().nodes.map(({ id }) => id);
  const selected = () =>
    Object.entries(store.getState().nodeViews)
      .filter(([, view]) => view.selected)
      .map(([id]) => id);

  const build = () => {
    const oscillator = store.getState().addNode("oscillator", { x: 0, y: 0 });
    const filter = store.getState().addNode("filter", { x: 200, y: 0 });
    store.getState().connect(audio(oscillator.id), audio(filter.id));
    return { oscillator, filter };
  };

  it("pastes a copy with new ids, a step aside, and its cables, as one undo step", () => {
    const { oscillator, filter } = build();
    const steps = store.getState().past.length;

    store.getState().copyNodes([oscillator.id, filter.id]);
    const pasted = store.getState().pasteNodes();

    expect(pasted.map(({ id }) => id)).toEqual(["oscillator-3", "filter-4"]);
    expect(pasted.map(({ position }) => position)).toEqual([
      { x: 40, y: 40 },
      { x: 240, y: 40 },
    ]);
    expect(store.getState().connections.map(({ id }) => id)).toContain("oscillator-3:audio->filter-4:audio");
    expect(synced()!.nodes).toHaveLength(4);
    expect(store.getState().past).toHaveLength(steps + 1);

    store.getState().undo();
    expect(ids()).toEqual([oscillator.id, filter.id]);
  });

  it("selects what it pastes, and only that", () => {
    const { oscillator, filter } = build();
    store.getState().setNodeView(filter.id, { selected: true });

    store.getState().copyNodes([oscillator.id]);
    store.getState().pasteNodes();

    expect(selected()).toEqual(["oscillator-3"]);
  });

  it("copies the nodes as they were, whatever changes after", () => {
    const { oscillator } = build();
    store.getState().copyNodes([oscillator.id]);

    store.getState().updateParam(oscillator.id, "frequency", 220);
    const [pasted] = store.getState().pasteNodes();

    expect(pasted.params.frequency).toBe(440);
  });

  it("moves each paste of the same copy a step further", () => {
    const { oscillator } = build();
    store.getState().copyNodes([oscillator.id]);

    store.getState().pasteNodes();
    const [second] = store.getState().pasteNodes();

    expect(second.position).toEqual({ x: 80, y: 80 });
  });

  it("pastes nothing before a copy", () => {
    build();
    engine.sync.mockClear();

    expect(store.getState().pasteNodes()).toEqual([]);
    expect(engine.sync).not.toHaveBeenCalled();
  });

  it("pastes inside a subpatch what was copied outside", () => {
    const { oscillator } = build();
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 300 });
    store.getState().copyNodes([oscillator.id]);

    store.getState().openSubpatch(subpatch.id);
    const [pasted] = store.getState().pasteNodes();

    expect(ids()).toEqual([pasted.id]);
    expect(synced()!.nodes.map(({ id }) => id)).toContain(`${subpatch.id}/${pasted.id}`);
  });

  it("leaves the In and the Out inside the subpatches", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    const inlet = store.getState().addNode("inlet", { x: 0, y: 0 });
    const gain = store.getState().addNode("gain", { x: 200, y: 0 });
    store.getState().copyNodes([inlet.id, gain.id]);

    store.getState().closeSubpatch(0);
    const pasted = store.getState().pasteNodes();

    expect(pasted.map(({ type }) => type)).toEqual(["gain"]);
  });

  it("duplicates in one step, leaving the copy as it was", () => {
    const { oscillator, filter } = build();
    store.getState().copyNodes([filter.id]);

    const duplicated = store.getState().duplicateNodes([oscillator.id]);
    const [pasted] = store.getState().pasteNodes();

    expect(duplicated.map(({ type, position }) => ({ type, position }))).toEqual([
      { type: "oscillator", position: { x: 40, y: 40 } },
    ]);
    expect(pasted.type).toBe("filter");
    expect(selected()).toEqual([pasted.id]);
  });
});

describe("reconnect", () => {
  const control = (nodeId: string, port: string) => ({ nodeId, port });

  it("moves an end of a cable to another port, in its place among the cables, as one undo step", () => {
    const oscillator = store.getState().addNode("oscillator", { x: 0, y: 0 });
    const filter = store.getState().addNode("filter", { x: 0, y: 0 });
    const gain = store.getState().addNode("gain", { x: 0, y: 0 });
    const noise = store.getState().addNode("noise", { x: 0, y: 0 });
    const moved = store.getState().connect(audio(oscillator.id), audio(filter.id))!;
    store.getState().connect(audio(noise.id), audio(gain.id));
    const steps = store.getState().past.length;

    const connection = store.getState().reconnect(moved.id, audio(oscillator.id), audio(gain.id))!;

    expect(connection.id).toBe("oscillator-1:audio->gain-3:audio");
    expect(store.getState().connections.map(({ id }) => id)).toEqual([connection.id, "noise-4:audio->gain-3:audio"]);
    expect(synced()!.connections.map(({ id }) => id)).toContain(connection.id);
    expect(store.getState().past).toHaveLength(steps + 1);

    store.getState().undo();
    expect(store.getState().connections.map(({ id }) => id)).toContain(moved.id);
  });

  it("keeps the attenuator of a control cable wherever it goes", () => {
    const lfo = store.getState().addNode("lfo", { x: 0, y: 0 });
    const filter = store.getState().addNode("filter", { x: 0, y: 0 });
    const cable = store.getState().connect(control(lfo.id, "out"), control(filter.id, "frequency"))!;
    store.getState().setConnectionAmount(cable.id, -0.4, { merge: false });

    const moved = store.getState().reconnect(cable.id, control(lfo.id, "out"), control(filter.id, "Q"))!;

    expect(moved.amount).toBe(-0.4);
  });

  it("keeps the channel of a mixer while the cable still reaches it, and leaves it behind otherwise", () => {
    const oscillator = store.getState().addNode("oscillator", { x: 0, y: 0 });
    const noise = store.getState().addNode("noise", { x: 0, y: 0 });
    const mixer = store.getState().addNode("mixer", { x: 0, y: 0 });
    const filter = store.getState().addNode("filter", { x: 0, y: 0 });
    const channel = store.getState().connect(audio(oscillator.id), audio(mixer.id))!;
    store.getState().setConnectionAmount(channel.id, 0.5, { merge: false });
    store.getState().setConnectionPan(channel.id, -0.3, { merge: false });

    const fromNoise = store.getState().reconnect(channel.id, audio(noise.id), audio(mixer.id))!;
    expect(fromNoise).toMatchObject({ amount: 0.5, pan: -0.3 });

    const toFilter = store.getState().reconnect(fromNoise.id, audio(noise.id), audio(filter.id))!;
    expect(toFilter.amount).toBeUndefined();
    expect(toFilter.pan).toBeUndefined();
  });

  it("points a scope that held still on the cable to it where it goes", () => {
    const oscillator = store.getState().addNode("oscillator", { x: 0, y: 0 });
    const noise = store.getState().addNode("noise", { x: 0, y: 0 });
    const scope = store.getState().addNode("scope", { x: 0, y: 0 });
    const cable = store.getState().connect(audio(oscillator.id), audio(scope.id))!;
    store.getState().updateParam(scope.id, "trigger", cable.id, { merge: false });

    const moved = store.getState().reconnect(cable.id, audio(noise.id), audio(scope.id))!;

    expect(store.getState().nodes.find(({ id }) => id === scope.id)!.params.trigger).toBe(moved.id);
  });

  it("leaves a cable where it was when it cannot go there, or goes nowhere new", () => {
    const oscillator = store.getState().addNode("oscillator", { x: 0, y: 0 });
    const filter = store.getState().addNode("filter", { x: 0, y: 0 });
    const lfo = store.getState().addNode("lfo", { x: 0, y: 0 });
    const cable = store.getState().connect(audio(oscillator.id), audio(filter.id))!;
    const steps = store.getState().past.length;

    expect(store.getState().reconnect(cable.id, audio(oscillator.id), control(filter.id, "Q"))).toBeNull();
    expect(store.getState().reconnect(cable.id, control(lfo.id, "out"), audio(filter.id))).toBeNull();
    expect(store.getState().reconnect(cable.id, audio(oscillator.id), audio(filter.id))).toBeNull();
    expect(store.getState().reconnect("nope", audio(oscillator.id), audio(filter.id))).toBeNull();
    expect(store.getState().connections.map(({ id }) => id)).toEqual([cable.id]);
    expect(store.getState().past).toHaveLength(steps);
  });

  it("tells whether a cable can move to other ports, leaving itself out", () => {
    const oscillator = store.getState().addNode("oscillator", { x: 0, y: 0 });
    const filter = store.getState().addNode("filter", { x: 0, y: 0 });
    const gain = store.getState().addNode("gain", { x: 0, y: 0 });
    const cable = store.getState().connect(audio(oscillator.id), audio(filter.id))!;
    store.getState().connect(audio(filter.id), audio(gain.id));

    expect(store.getState().canReconnect(cable.id, audio(oscillator.id), audio(gain.id))).toBe(true);
    expect(store.getState().canReconnect(cable.id, audio(gain.id), audio(filter.id))).toBe(false);
    expect(store.getState().canReconnect(cable.id, audio(oscillator.id), audio(filter.id))).toBe(false);
  });
});

describe("presets", () => {
  const inside = (voices = 1): Patch["nodes"][number] => ({
    id: "subpatch-40",
    type: "subpatch",
    position: { x: 0, y: 0 },
    params: { voices },
    patch: {
      nodes: [
        { id: "inlet-41", type: "inlet", position: { x: 0, y: 0 }, params: { signal: "trigger", value: 0 } },
        { id: "gain-42", type: "gain", position: { x: 0, y: 0 }, params: { gain: 0.3 } },
      ],
      connections: [],
    },
    published: [{ node: "gain-42", param: "gain" }],
  });
  const kick = () => {
    const { id: _id, position: _position, ...node } = inside(2);
    return { id: "preset-1", name: "Kick", node };
  };

  it("gives a node the settings of a preset of its type, as one undo step", () => {
    const filter = store.getState().addNode("filter", { x: 5, y: 6 });
    store.getState().renameNode(filter.id, "Dark");

    store.getState().applyPreset(filter.id, { type: "filter", params: { frequency: 300 } });

    expect(store.getState().nodes[0]).toMatchObject({
      id: filter.id,
      name: "Dark",
      position: { x: 5, y: 6 },
      params: { ...defaultParams("filter"), frequency: 300 },
    });
    store.getState().undo();
    expect(store.getState().nodes[0].params.frequency).toBe(1200);
  });

  it("gives a preset only to a node of its type", () => {
    const gain = store.getState().addNode("gain", { x: 0, y: 0 });

    store.getState().applyPreset(gain.id, { type: "filter", params: { frequency: 300 } });

    expect(store.getState().nodes[0].params).toEqual(defaultParams("gain"));
  });

  it("gives a subpatch the inside of the preset, and takes away the cables to ports it no longer has", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    const inlet = store.getState().addNode("inlet", { x: 0, y: 0 });
    store.getState().updateParam(inlet.id, "signal", "control");
    store.getState().closeSubpatch(0);
    const keys = store.getState().addNode("keyboard", { x: 0, y: 0 });
    store.getState().connect({ nodeId: keys.id, port: "pitch" }, { nodeId: subpatch.id, port: "inlet-2" });
    expect(store.getState().connections).toHaveLength(1);

    store.getState().applyPreset(subpatch.id, kick().node);

    const applied = store.getState().nodes.find(({ id }) => id === subpatch.id)!;
    expect(applied.params.voices).toBe(2);
    expect(applied.patch?.nodes.map(({ id }) => id)).toEqual(["inlet-41", "gain-42"]);
    expect(applied.published).toEqual([{ node: "gain-42", param: "gain" }]);
    expect(store.getState().connections).toEqual([]);
  });

  it("adds a subpatch saved as a module of its own, named after it, with ids past those inside it", () => {
    const added = store.getState().addPreset(kick(), { x: 30, y: 40 });

    expect(added).toMatchObject({ id: "subpatch-43", type: "subpatch", name: "Kick", position: { x: 30, y: 40 }, params: { voices: 2 } });
    expect(store.getState().nodes).toEqual([added]);

    store.getState().openSubpatch(added.id);
    expect(store.getState().addNode("gain", { x: 0, y: 0 }).id).toBe("gain-44");
    store.getState().closeSubpatch(0);
    store.getState().undo();
    store.getState().undo();
    expect(store.getState().nodes).toEqual([]);
  });
});

describe("song", () => {
  let seq: string;

  beforeEach(() => {
    seq = store.getState().addNode("sequencer", { x: 0, y: 0 }).id;
  });

  it("has no song to start with, and the panel closed in pattern mode", () => {
    expect(store.getState().song).toBeUndefined();
    expect(store.getState()).toMatchObject({ songPanel: false, songMode: false, songRec: false, songCursor: 0 });
  });

  it("writes a pattern on a bar of a node, starting a song of 8 bars, as an undo step", () => {
    store.getState().setSongCell(seq, 2, "A2");

    expect(store.getState().song).toEqual({ bars: 8, rows: { [seq]: "- - A2 - - - - -" } });
    expect(synced()?.song).toEqual(store.getState().song);

    store.getState().undo();
    expect(store.getState().song).toBeUndefined();
  });

  it("changes the length of the song and its loop", () => {
    store.getState().setSongCell(seq, 0, "A1");

    store.getState().setSongLength(4);
    store.getState().setSongLoop({ start: 1, length: 2 });

    expect(store.getState().song).toEqual({ bars: 4, rows: { [seq]: "A1 - - -" }, loop: { start: 1, length: 2 } });

    store.getState().setSongLoop(undefined);
    expect(store.getState().song).not.toHaveProperty("loop");
  });

  it("starts the song again from what each node plays, keeping its length", () => {
    store.getState().setSongCell(seq, 3, "A3");
    store.getState().setSongLength(4);

    store.getState().initializeSong({ [seq]: "A4" });

    expect(store.getState().song).toEqual({ bars: 4, rows: { [seq]: "A4 - - -" } });
  });

  it("drops the row of a node that goes away", () => {
    store.getState().setSongCell(seq, 0, "A2");

    store.getState().removeNode(seq);

    expect(store.getState().song).toEqual({ bars: 8, rows: {} });
  });

  it("writes the rows of the nodes inside subpatches by their path", () => {
    const sub = store.getState().addNode("subpatch", { x: 0, y: 0 }).id;
    store.getState().openSubpatch(sub);
    const inner = store.getState().addNode("clip", { x: 0, y: 0 }).id;
    store.getState().closeSubpatch(0);

    store.getState().setSongCell(`${sub}/${inner}`, 0, "A3");

    expect(store.getState().song?.rows).toEqual({ [`${sub}/${inner}`]: "A3 - - - - - - -" });
  });

  it("opens and closes the panel, and turns song mode and Rec on and off, out of the history", () => {
    store.getState().openSongPanel(true);
    store.getState().setSongMode(true);
    store.getState().setSongRec(true);

    expect(store.getState()).toMatchObject({ songPanel: true, songMode: true, songRec: true });
    expect(store.getState().past).toHaveLength(1);
  });

  it("keeps the cursor inside the song", () => {
    store.getState().setSongCursor(5);
    expect(store.getState().songCursor).toBe(5);

    store.getState().setSongCursor(20);
    expect(store.getState().songCursor).toBe(7);

    store.getState().setSongCursor(-1);
    expect(store.getState().songCursor).toBe(0);
  });

  it("brings the cursor back inside a shorter song", () => {
    store.getState().setSongCursor(6);

    store.getState().setSongLength(4);

    expect(store.getState().songCursor).toBe(3);
  });

  it("loads the song of a patch, with the cursor on the first bar and Rec off", () => {
    store.getState().setSongCursor(3);
    store.getState().setSongRec(true);
    const song = { bars: 2, rows: {} };

    store.getState().loadPatch({ nodes: [], connections: [], tempo: 120, song });

    expect(store.getState().song).toEqual(song);
    expect(store.getState()).toMatchObject({ songCursor: 0, songRec: false });
  });
});

describe("song controls", () => {
  let osc: string;
  const lane = (key: string) => store.getState().song?.automation?.[key];

  beforeEach(() => {
    osc = store.getState().addNode("oscillator", { x: 0, y: 0 }).id;
  });

  it("writes a take into the lane of a control, as one undo step", () => {
    store.getState().recordTake(`${osc}.detune`, [
      { beat: 1, value: 10 },
      { beat: 1.5, value: 20 },
    ], 1, 2);

    expect(lane(`${osc}.detune`)).toBe("1:10 1.5:20");
    store.getState().undo();
    expect(store.getState().song).toBeUndefined();
  });

  it("puts a point on a beat, the changes of one control there joining into one undo step", () => {
    store.getState().setControlPoint(`${osc}.detune`, 8, 5);
    clock += 100;
    store.getState().setControlPoint(`${osc}.detune`, 8, 7);

    expect(lane(`${osc}.detune`)).toBe("8:7");
    expect(store.getState().past).toHaveLength(2);
  });

  it("holds the values of the controls touched over the loop or the whole song", () => {
    store.getState().setSongLength(4);
    store.getState().recordTake(`${osc}.detune`, [{ beat: 0, value: 3 }], 0, 1);
    store.getState().setSongLoop({ start: 1, length: 2 });

    store.getState().copyControls({ [`${osc}.detune`]: 9 }, "loop");
    expect(lane(`${osc}.detune`)).toBe("0:3 4:9 12:3");

    store.getState().copyControls({ [`${osc}.detune`]: 1 }, "song");
    expect(lane(`${osc}.detune`)).toBe("0:1");
  });

  it("holds the values over the loop in bars of the meter", () => {
    store.getState().setMeter([3]);
    store.getState().setSongLength(4);
    store.getState().recordTake(`${osc}.detune`, [{ beat: 0, value: 3 }], 0, 1);
    store.getState().setSongLoop({ start: 1, length: 2 });

    store.getState().copyControls({ [`${osc}.detune`]: 9 }, "loop");

    expect(lane(`${osc}.detune`)).toBe("0:3 3:9 9:3");
  });

  it("drops the points past the end of a shorter song in bars of the meter", () => {
    store.getState().setMeter([3]);
    store.getState().setSongLength(4);
    store.getState().recordTake(`${osc}.detune`, [{ beat: 0, value: 1 }, { beat: 5, value: 2 }, { beat: 6, value: 3 }], 0, 8);

    store.getState().setSongLength(2);

    expect(lane(`${osc}.detune`)).toBe("0:1 5:2");
  });

  it("clears the points of a stretch of a lane, as one undo step", () => {
    store.getState().recordTake(`${osc}.detune`, [
      { beat: 0, value: 1 },
      { beat: 4, value: 2 },
      { beat: 6, value: 3 },
      { beat: 8, value: 4 },
    ], 0, 8);

    store.getState().clearControlPoints(`${osc}.detune`, 4, 8);

    expect(lane(`${osc}.detune`)).toBe("0:1 8:4");
    store.getState().undo();
    expect(lane(`${osc}.detune`)).toBe("0:1 4:2 6:3 8:4");
  });

  it("takes the lane away with its last point, and leaves the song as it is when there is none to clear", () => {
    store.getState().setControlPoint(`${osc}.detune`, 4, 5);
    const past = store.getState().past.length;

    store.getState().clearControlPoints(`${osc}.detune`, 0, 4);
    expect(store.getState().past).toHaveLength(past);

    store.getState().clearControlPoints(`${osc}.detune`, 4, 8);
    expect(store.getState().song).not.toHaveProperty("automation");
  });

  it("takes a lane away", () => {
    store.getState().setControlPoint(`${osc}.detune`, 0, 5);

    store.getState().removeLane(`${osc}.detune`);

    expect(store.getState().song).not.toHaveProperty("automation");
  });

  it("drops the lane of a node that goes away", () => {
    store.getState().setControlPoint(`${osc}.detune`, 0, 5);

    store.getState().removeNode(osc);

    expect(store.getState().song).not.toHaveProperty("automation");
  });

  it("keeps the last value of each control touched, out of the history, until cleared", () => {
    store.getState().touchControl(`${osc}.detune`, 5);
    store.getState().touchControl(`${osc}.detune`, 6);

    expect(store.getState().songTouched).toEqual({ [`${osc}.detune`]: 6 });
    expect(store.getState().past).toHaveLength(1);

    store.getState().clearTouched();
    expect(store.getState().songTouched).toEqual({});
  });
});

describe("perform", () => {
  let filter: string;
  const pinned = () => store.getState().perform;

  beforeEach(() => {
    filter = store.getState().addNode("filter", { x: 0, y: 0 }).id;
  });

  it("pins a knob and unpins it, each as one undo step, in the patch", () => {
    store.getState().togglePinned(`${filter}.frequency`);
    expect(pinned()).toEqual([{ key: `${filter}.frequency` }]);
    expect(store.getState().toPatch().perform).toEqual([{ key: `${filter}.frequency` }]);

    store.getState().togglePinned(`${filter}.frequency`);
    expect(pinned()).toEqual([]);
    expect(store.getState().toPatch()).not.toHaveProperty("perform");

    store.getState().undo();
    expect(pinned()).toEqual([{ key: `${filter}.frequency` }]);
  });

  it("does not pin what is not a knob of the patch", () => {
    const steps = store.getState().past.length;

    store.getState().togglePinned(`${filter}.type`);
    store.getState().togglePinned("filter-9.frequency");

    expect(pinned()).toEqual([]);
    expect(store.getState().past).toHaveLength(steps);
  });

  it("pins knobs inside subpatches while the whole patch is on show, and from inside", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 }).id;
    store.getState().openSubpatch(subpatch);
    const osc = store.getState().addNode("oscillator", { x: 0, y: 0 }).id;

    store.getState().togglePinned(`${subpatch}/${osc}.frequency`);
    store.getState().closeSubpatch(0);

    expect(pinned()).toEqual([{ key: `${subpatch}/${osc}.frequency` }]);
  });

  it("names a pinned knob and moves it, each as one undo step", () => {
    store.getState().togglePinned(`${filter}.frequency`);
    store.getState().togglePinned(`${filter}.Q`);

    store.getState().renamePinned(`${filter}.Q`, "Res");
    store.getState().movePinned(`${filter}.Q`, 0);

    expect(pinned()).toEqual([{ key: `${filter}.Q`, name: "Res" }, { key: `${filter}.frequency` }]);
    store.getState().undo();
    expect(pinned().map(({ key }) => key)).toEqual([`${filter}.frequency`, `${filter}.Q`]);
  });

  it("drops the knobs of a node that goes away, from inside a subpatch too", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 }).id;
    store.getState().openSubpatch(subpatch);
    const osc = store.getState().addNode("oscillator", { x: 0, y: 0 }).id;
    store.getState().togglePinned(`${subpatch}/${osc}.frequency`);
    store.getState().togglePinned(`${filter}.frequency`);

    store.getState().removeNode(osc);

    expect(pinned()).toEqual([{ key: `${filter}.frequency` }]);
  });

  it("loads the knobs pinned with the patch", () => {
    store.getState().loadPatch({
      tempo: 120,
      nodes: [{ id: "filter-7", type: "filter", position: { x: 0, y: 0 }, params: {} }],
      connections: [],
      perform: [{ key: "filter-7.Q", name: "Res" }],
    });

    expect(pinned()).toEqual([{ key: "filter-7.Q", name: "Res" }]);
  });

  it("sets a knob at any depth, whatever graph is on show, quick changes joining into one undo step", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 }).id;
    store.getState().openSubpatch(subpatch);
    const osc = store.getState().addNode("oscillator", { x: 0, y: 0 }).id;
    store.getState().closeSubpatch(0);
    const steps = store.getState().past.length;
    const inner = () => store.getState().toPatch().nodes[1].patch!.nodes[0].params.frequency;

    store.getState().setKnob(`${subpatch}/${osc}.frequency`, 220);
    clock += 100;
    store.getState().setKnob(`${subpatch}/${osc}.frequency`, 330);

    expect(inner()).toBe(330);
    expect(synced()?.nodes.find((node) => node.id === `${subpatch}/${osc}`)?.params.frequency).toBe(330);
    expect(store.getState().past).toHaveLength(steps + 1);

    store.getState().setKnob(`${subpatch}/${osc}.frequency`, 440, { merge: false });
    expect(store.getState().past).toHaveLength(steps + 2);
  });

  it("changes the node on show when it sets one of its knobs", () => {
    store.getState().setKnob(`${filter}.frequency`, 300);

    expect(store.getState().nodes[0].params.frequency).toBe(300);
  });

  it("ignores knobs that cannot be found", () => {
    const steps = store.getState().past.length;

    store.getState().setKnob("filter-9.frequency", 300);
    store.getState().setKnob(`${filter}.type`, 3);

    expect(store.getState().past).toHaveLength(steps);
  });

  it("shows the song tab of the panel until the perform one is picked, out of the history", () => {
    expect(store.getState().panelTab).toBe("song");

    store.getState().setPanelTab("perform");

    expect(store.getState().panelTab).toBe("perform");
    expect(store.getState().past).toHaveLength(1);
  });
});

describe("launcher", () => {
  let seq: string;
  const hidden = () => store.getState().hiddenLaunchers;

  beforeEach(() => {
    seq = store.getState().addNode("sequencer", { x: 0, y: 0 }).id;
  });

  it("hides the row of a node and shows it again, each as one undo step, in the patch", () => {
    store.getState().toggleLauncher(seq);
    expect(hidden()).toEqual([seq]);
    expect(store.getState().toPatch().hiddenLaunchers).toEqual([seq]);

    store.getState().toggleLauncher(seq);
    expect(hidden()).toEqual([]);
    expect(store.getState().toPatch()).not.toHaveProperty("hiddenLaunchers");

    store.getState().undo();
    expect(hidden()).toEqual([seq]);
  });

  it("hides only nodes with patterns", () => {
    const filter = store.getState().addNode("filter", { x: 0, y: 0 }).id;
    const steps = store.getState().past.length;

    store.getState().toggleLauncher(filter);
    store.getState().toggleLauncher("sequencer-9");

    expect(hidden()).toEqual([]);
    expect(store.getState().past).toHaveLength(steps);
  });

  it("forgets the row of a node that goes away", () => {
    store.getState().toggleLauncher(seq);

    store.getState().removeNode(seq);

    expect(store.getState().toPatch()).not.toHaveProperty("hiddenLaunchers");
  });

  it("loads the rows hidden with the patch", () => {
    store.getState().loadPatch({
      tempo: 120,
      nodes: [{ id: "sequencer-7", type: "sequencer", position: { x: 0, y: 0 }, params: {} }],
      connections: [],
      hiddenLaunchers: ["sequencer-7"],
    });

    expect(hidden()).toEqual(["sequencer-7"]);
  });
});

describe("scenes", () => {
  let seq: string;
  const scenes = () => store.getState().scenes;

  beforeEach(() => {
    seq = store.getState().addNode("sequencer", { x: 0, y: 0 }).id;
  });

  it("saves a scene, names it and removes it, each as one undo step, in the patch", () => {
    store.getState().saveScene({ [seq]: "B2" });
    expect(scenes()).toEqual([{ patterns: { [seq]: "B2" } }]);
    expect(store.getState().toPatch().scenes).toEqual([{ patterns: { [seq]: "B2" } }]);

    store.getState().renameScene(0, "Drop");
    expect(scenes()[0].name).toBe("Drop");

    store.getState().removeScene(0);
    expect(scenes()).toEqual([]);
    expect(store.getState().toPatch()).not.toHaveProperty("scenes");

    store.getState().undo();
    expect(scenes()).toEqual([{ name: "Drop", patterns: { [seq]: "B2" } }]);
  });

  it("saves only the patterns of nodes that have them, and no scene without any", () => {
    const steps = store.getState().past.length;

    store.getState().saveScene({ "filter-9": "A1" });

    expect(scenes()).toEqual([]);
    expect(store.getState().past).toHaveLength(steps);
  });

  it("drops the patterns of a node that goes away, and the scene left empty", () => {
    store.getState().saveScene({ [seq]: "B2" });

    store.getState().removeNode(seq);

    expect(store.getState().toPatch()).not.toHaveProperty("scenes");
  });

  it("keeps with a scene the values of the knobs pinned", () => {
    const filter = store.getState().addNode("filter", { x: 0, y: 0 }).id;
    store.getState().togglePinned(`${filter}.frequency`);

    store.getState().saveScene({ [seq]: "B2" });

    expect(scenes()).toEqual([{ patterns: { [seq]: "B2" }, knobs: { [`${filter}.frequency`]: 1200 } }]);
  });

  it("loads the scenes with the patch", () => {
    store.getState().loadPatch({
      tempo: 120,
      nodes: [{ id: "sequencer-7", type: "sequencer", position: { x: 0, y: 0 }, params: {} }],
      connections: [],
      scenes: [{ name: "Intro", patterns: { "sequencer-7": "C3" } }],
    });

    expect(scenes()).toEqual([{ name: "Intro", patterns: { "sequencer-7": "C3" } }]);
  });
});

describe("crossfader", () => {
  let seq: string;
  let filter: string;
  const crossfader = () => store.getState().crossfader;

  beforeEach(() => {
    seq = store.getState().addNode("sequencer", { x: 0, y: 0 }).id;
    filter = store.getState().addNode("filter", { x: 0, y: 0 }).id;
    store.getState().saveScene({ [seq]: "A1" });
    store.getState().saveScene({ [seq]: "B1" });
    store.getState().saveScene({ [seq]: "C1" });
  });

  it("starts in the middle without scenes, and keeps its scenes and place out of the patch and the history", () => {
    const steps = store.getState().past.length;
    expect(crossfader()).toEqual({ position: 0.5 });

    store.getState().setCrossfader({ a: 0, b: 2 });
    store.getState().setCrossfader({ position: 0.8 });

    expect(crossfader()).toEqual({ a: 0, b: 2, position: 0.8 });
    expect(store.getState().past).toHaveLength(steps);
    expect(store.getState().toPatch()).not.toHaveProperty("crossfader");
  });

  it("takes a side out, and follows its scenes as others are removed", () => {
    store.getState().setCrossfader({ a: 0, b: 2 });

    store.getState().removeScene(1);
    expect(crossfader()).toEqual({ a: 0, b: 1, position: 0.5 });

    store.getState().removeScene(0);
    expect(crossfader()).toEqual({ b: 0, position: 0.5 });

    store.getState().setCrossfader({ b: undefined });
    expect(crossfader()).toEqual({ position: 0.5 });
  });

  it("starts again in the middle without scenes with another patch", () => {
    store.getState().setCrossfader({ a: 0, b: 1, position: 1 });

    store.getState().loadPatch({ tempo: 120, nodes: [], connections: [] });

    expect(crossfader()).toEqual({ position: 0.5 });
  });

  it("writes the values that sound into the patch, as one undo step", () => {
    const mixer = store.getState().addNode("mixer", { x: 0, y: 0 }).id;
    const cable = store.getState().connect({ nodeId: filter, port: "audio" }, { nodeId: mixer, port: "audio" })!;
    const steps = store.getState().past.length;

    store.getState().applyKnobs({ [`${filter}.frequency`]: 300, [`${cable.id}.level`]: 0.4, [`${cable.id}.pan`]: 0.5 });

    expect(store.getState().nodes.find(({ id }) => id === filter)?.params.frequency).toBe(300);
    expect(store.getState().connections[0]).toMatchObject({ amount: 0.4, pan: 0.5 });
    expect(store.getState().past).toHaveLength(steps + 1);
  });
});

describe("mixers pinned", () => {
  let cable: string;
  let sub: string;
  const channel = () => store.getState().toPatch().nodes[0].patch!.connections[0];

  beforeEach(() => {
    sub = store.getState().addNode("subpatch", { x: 0, y: 0 }).id;
    store.getState().openSubpatch(sub);
    const noise = store.getState().addNode("noise", { x: 0, y: 0 }).id;
    const mixer = store.getState().addNode("mixer", { x: 0, y: 0 }).id;
    cable = store.getState().connect({ nodeId: noise, port: "audio" }, { nodeId: mixer, port: "audio" })!.id;
    store.getState().closeSubpatch(0);
  });

  it("pins a mixer by its path, as one undo step, and never a channel on its own", () => {
    const mixer = store.getState().toPatch().nodes[0].patch!.nodes.find((node) => node.type === "mixer")!.id;

    store.getState().togglePinned(`${sub}/${cable}`);
    store.getState().togglePinned(`${sub}/${mixer}`);

    expect(store.getState().perform).toEqual([{ key: `${sub}/${mixer}` }]);
    store.getState().undo();
    expect(store.getState().perform).toEqual([]);
  });

  it("sets a channel at any depth, whatever graph is on show, quick changes of a knob joining into one undo step", () => {
    const steps = store.getState().past.length;

    store.getState().setChannel(`${sub}/${cable}`, "level", 0.5);
    clock += 100;
    store.getState().setChannel(`${sub}/${cable}`, "level", 0.4);
    expect(channel().amount).toBe(0.4);
    expect(store.getState().past).toHaveLength(steps + 1);

    store.getState().setChannel(`${sub}/${cable}`, "mute", 1);
    expect(channel().mute).toBe(true);
    expect(store.getState().past).toHaveLength(steps + 2);
    expect(synced()?.connections.find((connection) => connection.id === `${sub}/${cable}`)?.mute).toBe(true);
  });

  it("ignores channels that cannot be found", () => {
    const steps = store.getState().past.length;

    store.getState().setChannel("x-1:audio->y-2:audio", "level", 0.5);

    expect(store.getState().past).toHaveLength(steps);
  });

  it("drops the mixer pinned when it goes away", () => {
    const mixer = store.getState().toPatch().nodes[0].patch!.nodes.find((node) => node.type === "mixer")!.id;
    store.getState().togglePinned(`${sub}/${mixer}`);
    store.getState().openSubpatch(sub);

    store.getState().removeNode(mixer);

    expect(store.getState().perform).toEqual([]);
  });
});

describe("full screen panel and the view of the editor", () => {
  it("shows the panel full screen until it is closed, out of the history", () => {
    const steps = store.getState().past.length;
    store.getState().openSongPanel(true);

    store.getState().setPanelFullscreen(true);
    expect(store.getState().panelFullscreen).toBe(true);

    store.getState().openSongPanel(false);
    expect(store.getState().panelFullscreen).toBe(false);
    expect(store.getState().past).toHaveLength(steps);
  });

  it("keeps where the editor looks, out of the history", () => {
    expect(store.getState().editorViewport).toEqual({ x: 0, y: 0, zoom: 1 });

    store.getState().setEditorViewport({ x: 10, y: -20, zoom: 1.5 });

    expect(store.getState().editorViewport).toEqual({ x: 10, y: -20, zoom: 1.5 });
    expect(store.getState().past).toHaveLength(0);
  });
});

describe("song fade", () => {
  it("sets the bars of the fade at the end of the song, as one undo step", () => {
    store.getState().setSongLength(4);

    store.getState().setSongFade(2);
    expect(store.getState().song?.fade).toBe(2);

    store.getState().undo();
    expect(store.getState().song).not.toHaveProperty("fade");
  });
});

describe("meta", () => {
  it("sets the meta of the piece, typing into a field joining into one undo step", () => {
    store.getState().setMeta({ title: "P" });
    clock += 100;
    store.getState().setMeta({ title: "Pluja" });
    store.getState().setMeta({ author: "Francesc" });

    expect(store.getState().meta).toEqual({ title: "Pluja", author: "Francesc" });
    expect(store.getState().toPatch().meta).toEqual({ title: "Pluja", author: "Francesc" });
    store.getState().undo();
    expect(store.getState().meta).toEqual({ title: "Pluja" });
    store.getState().undo();
    expect(store.getState().meta).toBeUndefined();
  });

  it("makes no undo step when nothing changes", () => {
    store.getState().setMeta({ title: "Rain" });
    const steps = store.getState().past.length;
    clock += 5000;

    store.getState().setMeta({ title: " Rain " });

    expect(store.getState().past).toHaveLength(steps);
  });

  it("loads the meta with the patch", () => {
    store.getState().loadPatch({ tempo: 120, nodes: [], connections: [], meta: { title: "Rain" } });

    expect(store.getState().meta).toEqual({ title: "Rain" });
  });
});
