import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatternState } from "../../audio/modules/AudioModule";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { displayEngine } from "../../test/displayEngine";
import { EngineContext, type DisplayEngine } from "../EngineContext";
import { PerformPanel } from "./PerformPanel";

let store: ReturnType<typeof createPatchStore>;
let engine: DisplayEngine;
let filter: string;

beforeEach(() => {
  // jsdom has no pointer capture.
  Element.prototype.setPointerCapture ??= () => {};
  store = createPatchStore({ sync: vi.fn() });
  filter = store.getState().addNode("filter", { x: 0, y: 0 }).id;
  store.getState().openSongPanel(true);
  store.getState().setPanelTab("perform");
  engine = displayEngine();
});

const show = () =>
  render(
    <PatchStoreContext value={store}>
      <EngineContext value={engine}>
        <PerformPanel />
      </EngineContext>
    </PatchStoreContext>,
  );

const knobs = () => within(screen.getByRole("list", { name: "Pinned knobs" })).queryAllByRole("slider");
const drag = (knob: HTMLElement, pixels: number) => {
  fireEvent.pointerDown(knob, { clientY: 200, pointerId: 1 });
  fireEvent.pointerMove(knob, { clientY: 200 - pixels, pointerId: 1 });
  fireEvent.pointerUp(knob, { pointerId: 1 });
};

describe("PerformPanel", () => {
  it("tells how to pin knobs while there are none", () => {
    show();

    expect(screen.getByText(/Right-click a knob/)).toBeInTheDocument();
  });

  it("shows each knob by the nodes down to it over its param, or by its own name", () => {
    const sub = store.getState().addNode("subpatch", { x: 0, y: 0 }).id;
    store.getState().renameNode(sub, "Bass");
    store.getState().openSubpatch(sub);
    const osc = store.getState().addNode("oscillator", { x: 0, y: 0 }).id;
    store.getState().closeSubpatch(0);
    store.getState().togglePinned(`${sub}/${osc}.frequency`);
    store.getState().togglePinned(`${filter}.Q`);
    store.getState().renamePinned(`${filter}.Q`, "Res");
    show();

    expect(knobs().map((knob) => knob.getAttribute("aria-label"))).toEqual(["Bass › Oscillator › Freq", "Res"]);
    expect(knobs()[0]).toHaveAttribute("aria-valuetext", "440 Hz");
    const [bass, res] = within(screen.getByRole("list", { name: "Pinned knobs" })).getAllByRole("listitem");
    expect(within(bass).getByText("Bass › Oscillator")).toHaveClass("param-context");
    expect(within(bass).getByText("Freq")).toHaveClass("param-name");
    expect(within(res).queryByText("Filter")).toBeNull();
  });

  it("turns the param of the node, wherever it is, with the knob", () => {
    store.getState().togglePinned(`${filter}.frequency`);
    show();

    drag(knobs()[0], 160);

    expect(store.getState().nodes[0].params.frequency).toBe(20000);
  });

  it("shows a knob set by another param as the node does", () => {
    const lfo = store.getState().addNode("lfo", { x: 0, y: 0 }).id;
    store.getState().updateParam(lfo, "sync", "1/4");
    store.getState().togglePinned(`${lfo}.rate`);
    show();

    expect(knobs()[0]).toHaveAttribute("aria-disabled", "true");
  });

  it("shows how far the modulation takes a knob, read from the engine by its path", () => {
    engine = displayEngine({ getModulation: vi.fn(() => undefined) });
    store.getState().togglePinned(`${filter}.frequency`);
    show();

    expect(document.querySelector(".knob-modulation")).not.toBeNull();
  });

  it("renames a knob with a double-click on its name", () => {
    store.getState().togglePinned(`${filter}.Q`);
    show();

    fireEvent.doubleClick(screen.getByText("Q"));
    const field = screen.getByRole("textbox", { name: "Name of Filter › Q" });
    fireEvent.change(field, { target: { value: "Res" } });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(store.getState().perform).toEqual([{ key: `${filter}.Q`, name: "Res" }]);
  });

  it("unpins a knob", () => {
    store.getState().togglePinned(`${filter}.Q`);
    show();

    fireEvent.click(screen.getByRole("button", { name: "Unpin Filter › Q" }));

    expect(store.getState().perform).toEqual([]);
  });

  it("moves a knob with the arrows on its handle", () => {
    store.getState().togglePinned(`${filter}.frequency`);
    store.getState().togglePinned(`${filter}.Q`);
    show();

    fireEvent.keyDown(screen.getByRole("button", { name: "Move Filter › Q" }), { key: "ArrowLeft" });
    expect(store.getState().perform.map(({ key }) => key)).toEqual([`${filter}.Q`, `${filter}.frequency`]);

    fireEvent.keyDown(screen.getByRole("button", { name: "Move Filter › Q" }), { key: "ArrowRight" });
    expect(store.getState().perform.map(({ key }) => key)).toEqual([`${filter}.frequency`, `${filter}.Q`]);
  });

  it("moves a knob dragged by its handle onto another", () => {
    store.getState().togglePinned(`${filter}.frequency`);
    store.getState().togglePinned(`${filter}.Q`);
    show();
    const items = within(screen.getByRole("list", { name: "Pinned knobs" })).getAllByRole("listitem");

    fireEvent.dragStart(screen.getByRole("button", { name: "Move Filter › Freq" }));
    fireEvent.dragOver(items[1]);
    fireEvent.drop(items[1]);

    expect(store.getState().perform.map(({ key }) => key)).toEqual([`${filter}.Q`, `${filter}.frequency`]);
  });

  it("goes to the song tab, and closes the panel", () => {
    show();

    fireEvent.click(screen.getByRole("tab", { name: "Song" }));
    expect(store.getState().panelTab).toBe("song");

    fireEvent.click(screen.getByRole("button", { name: "Close perform" }));
    expect(store.getState().songPanel).toBe(false);
  });
});

describe("PerformPanel launcher", () => {
  let seq: string;
  let sub: string;
  let clip: string;

  beforeEach(() => {
    seq = store.getState().addNode("sequencer", { x: 0, y: 0 }).id;
    sub = store.getState().addNode("subpatch", { x: 0, y: 0 }).id;
    store.getState().renameNode(sub, "Bass");
    store.getState().openSubpatch(sub);
    clip = store.getState().addNode("clip", { x: 0, y: 0 }).id;
    store.getState().closeSubpatch(0);
  });

  const row = (name: string) => screen.getByRole("group", { name: `Patterns of ${name}` });
  const pad = (name: string, slot: string) => within(row(name)).getByRole("button", { name: `Pattern ${slot}` });

  it("shows a row for each node with patterns, those inside subpatches too", () => {
    show();

    const rows = within(screen.getByRole("list", { name: "Launcher" })).getAllByRole("group", { name: /^Patterns of/ });
    expect(rows.map((group) => group.getAttribute("aria-label"))).toEqual(["Patterns of Seq", "Patterns of Bass › Clip"]);
    expect(within(row("Seq")).getAllByRole("button", { name: /^Pattern / })).toHaveLength(8);
  });

  it("launches a pattern with a click, by the path of its node", () => {
    show();

    fireEvent.click(pad("Seq", "A3"));
    fireEvent.click(pad("Bass › Clip", "A2"));

    expect(engine.launchPattern).toHaveBeenCalledWith(seq, "A3");
    expect(engine.launchPattern).toHaveBeenCalledWith(`${sub}/${clip}`, "A2");
  });

  it("shows the bank of the pattern playing, and another bank picked", async () => {
    engine = displayEngine({ getPattern: vi.fn((path: string): PatternState | undefined => (path === seq ? { playing: "C2", queued: "C5" } : undefined)) });
    show();

    await waitFor(() => expect(pad("Seq", "C2")).toHaveAttribute("data-playing", "true"));
    expect(pad("Seq", "C5")).toHaveAttribute("data-queued", "true");
    expect(within(row("Seq")).getByRole("button", { name: "Bank C" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(row("Seq")).getByRole("button", { name: "Bank D" }));
    expect(within(row("Seq")).getByRole("button", { name: "Bank D" })).toHaveAttribute("data-bank", "D");
    expect(pad("Seq", "D8").parentElement).toHaveAttribute("data-bank", "D");
    fireEvent.click(pad("Seq", "D8"));

    expect(engine.launchPattern).toHaveBeenCalledWith(seq, "D8");
  });

  it("lights no pad of a node a stop of the song silenced, and shows the bank it stopped on", async () => {
    engine = displayEngine({ getPattern: vi.fn((path: string): PatternState | undefined => (path === seq ? { playing: "C2", stopped: true } : undefined)) });
    show();

    await waitFor(() => expect(within(row("Seq")).getByRole("button", { name: "Bank C" })).toHaveAttribute("aria-pressed", "true"));
    expect(pad("Seq", "C2")).not.toHaveAttribute("data-playing");
    expect(within(row("Seq")).getByRole("button", { name: "Bank C" })).not.toHaveAttribute("data-playing");
  });

  it("writes the pattern launched into the song on the cursor with Rec while stopped", () => {
    store.getState().setSongRec(true);
    store.getState().setSongCursor(0);
    show();

    fireEvent.click(within(row("Bass › Clip")).getByRole("button", { name: "Bank B" }));
    fireEvent.click(pad("Bass › Clip", "B4"));

    expect(store.getState().song?.rows[`${sub}/${clip}`]).toMatch(/^B4/);
    expect(engine.launchPattern).toHaveBeenCalledWith(`${sub}/${clip}`, "B4");
  });

  it("hides a row, and shows it again", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Hide Seq" }));
    expect(screen.queryByRole("group", { name: "Patterns of Seq" })).toBeNull();
    expect(store.getState().hiddenLaunchers).toEqual([seq]);

    fireEvent.click(screen.getByRole("button", { name: "Show Seq" }));
    expect(row("Seq")).toBeInTheDocument();
  });
});

describe("PerformPanel scenes", () => {
  let seq: string;
  let sub: string;
  let clip: string;

  beforeEach(() => {
    seq = store.getState().addNode("sequencer", { x: 0, y: 0 }).id;
    sub = store.getState().addNode("subpatch", { x: 0, y: 0 }).id;
    store.getState().openSubpatch(sub);
    clip = store.getState().addNode("clip", { x: 0, y: 0 }).id;
    store.getState().closeSubpatch(0);
  });

  const scenes = () => screen.getByRole("group", { name: "Scenes" });

  it("saves the pattern each node plays now as a scene, the first one while the engine does not say", () => {
    engine = displayEngine({ getPattern: vi.fn((path: string): PatternState | undefined => (path === seq ? { playing: "C2" } : undefined)) });
    show();

    fireEvent.click(within(scenes()).getByRole("button", { name: "Save scene" }));

    expect(store.getState().scenes).toEqual([{ patterns: { [seq]: "C2", [`${sub}/${clip}`]: "A1" } }]);
    expect(within(scenes()).getByRole("button", { name: "Launch Scene 1" })).toBeInTheDocument();
  });

  it("saves the pattern about to play rather than the one it takes over from", () => {
    engine = displayEngine({ getPattern: vi.fn((path: string): PatternState | undefined => (path === seq ? { playing: "C2", queued: "C5" } : undefined)) });
    show();

    fireEvent.click(within(scenes()).getByRole("button", { name: "Save scene" }));

    expect(store.getState().scenes[0].patterns[seq]).toBe("C5");
  });

  it("shows the crossfader under the scenes once there are scenes", () => {
    show();
    expect(screen.queryByRole("group", { name: "Crossfader" })).toBeNull();

    fireEvent.click(within(scenes()).getByRole("button", { name: "Save scene" }));

    expect(screen.getByRole("group", { name: "Crossfader" })).toBeInTheDocument();
  });

  it("launches every pattern of a scene together, on the next bar", () => {
    store.getState().saveScene({ [seq]: "B2", [`${sub}/${clip}`]: "A3" });
    show();

    fireEvent.click(within(scenes()).getByRole("button", { name: "Launch Scene 1" }));

    expect(engine.launchPattern).toHaveBeenCalledWith(seq, "B2", "bar");
    expect(engine.launchPattern).toHaveBeenCalledWith(`${sub}/${clip}`, "A3", "bar");
  });

  it("writes the patterns of a scene into the song on the cursor with Rec while stopped", () => {
    store.getState().saveScene({ [seq]: "B2", [`${sub}/${clip}`]: "A3" });
    store.getState().setSongRec(true);
    show();

    fireEvent.click(within(scenes()).getByRole("button", { name: "Launch Scene 1" }));

    expect(store.getState().song?.rows[seq]).toMatch(/^B2/);
    expect(store.getState().song?.rows[`${sub}/${clip}`]).toMatch(/^A3/);
  });

  it("lights the scene that plays, and blinks the one about to", async () => {
    store.getState().saveScene({ [seq]: "B2" });
    store.getState().saveScene({ [seq]: "B3" });
    engine = displayEngine({ getPattern: vi.fn((): PatternState => ({ playing: "B2", queued: "B3" })) });
    show();

    await waitFor(() => expect(within(scenes()).getByRole("button", { name: "Launch Scene 1" })).toHaveAttribute("data-playing", "true"));
    expect(within(scenes()).getByRole("button", { name: "Launch Scene 2" })).toHaveAttribute("data-queued", "true");
  });

  it("renames a scene with a double-click, and removes it", () => {
    store.getState().saveScene({ [seq]: "B2" });
    show();

    fireEvent.doubleClick(within(scenes()).getByRole("button", { name: "Launch Scene 1" }));
    const field = screen.getByRole("textbox", { name: "Name of Scene 1" });
    fireEvent.change(field, { target: { value: "Drop" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(store.getState().scenes[0].name).toBe("Drop");

    fireEvent.click(within(scenes()).getByRole("button", { name: "Remove Drop" }));
    expect(store.getState().scenes).toEqual([]);
  });
});

describe("PerformPanel mixers", () => {
  let sub: string;
  let mixer: string;
  let noise: string;
  const inside = () => store.getState().toPatch().nodes.find((node) => node.type === "subpatch")!.patch!;

  beforeEach(() => {
    sub = store.getState().addNode("subpatch", { x: 0, y: 0 }).id;
    store.getState().renameNode(sub, "Band");
    store.getState().openSubpatch(sub);
    noise = store.getState().addNode("noise", { x: 0, y: 0 }).id;
    mixer = store.getState().addNode("mixer", { x: 0, y: 0 }).id;
    store.getState().connect({ nodeId: noise, port: "audio" }, { nodeId: mixer, port: "audio" });
    store.getState().closeSubpatch(0);
    store.getState().togglePinned(`${sub}/${mixer}`);
  });

  const block = () => screen.getByRole("group", { name: "Band › Mixer" });
  const column = (name: string) => within(block()).getByRole("group", { name });

  it("shows a column for each channel of the mixer, and one for its main level, each with a meter", () => {
    show();

    expect(within(block()).getByText("Band")).toHaveClass("param-context");
    expect(within(block()).getByText("Mixer")).toHaveClass("param-name");
    const channel = column("Noise 3");
    expect(within(channel).getByRole("slider", { name: "Band › Mixer › Noise 3 level" })).toHaveAttribute("aria-valuetext", "1.00");
    expect(within(channel).getByRole("slider", { name: "Band › Mixer › Noise 3 pan" })).toBeInTheDocument();
    expect(within(channel).getByRole("button", { name: "Mute Band › Mixer › Noise 3" })).toHaveAttribute("aria-pressed", "false");
    expect(within(channel).getByRole("meter", { name: "Band › Mixer › Noise 3 signal" })).toBeInTheDocument();
    const main = column("Main");
    expect(within(main).getByRole("slider", { name: "Band › Mixer › Main" })).toHaveAttribute("aria-valuetext", "1.00");
    expect(within(main).getByRole("meter", { name: "Band › Mixer › Main signal" })).toBeInTheDocument();
  });

  it("reads the meters from the engine by the paths of the mixer and of each cable", async () => {
    engine = displayEngine();
    show();

    await waitFor(() => expect(engine.getAnalyser).toHaveBeenCalledWith(`${sub}/${mixer}`));
    expect(engine.getProbe).toHaveBeenCalledWith(`${sub}/${mixer}`, `${sub}/${noise}:audio->${mixer}:audio`);
  });

  it("gets a column for a channel connected later", () => {
    store.getState().openSubpatch(sub);
    const osc = store.getState().addNode("oscillator", { x: 0, y: 0 }).id;
    store.getState().connect({ nodeId: osc, port: "audio" }, { nodeId: mixer, port: "audio" });
    store.getState().closeSubpatch(0);
    show();

    expect(column("Oscillator 5")).toBeInTheDocument();
  });

  it("sets the channels and the main level inside the subpatch", () => {
    show();

    drag(within(column("Noise 3")).getByRole("slider", { name: /level$/ }), -80);
    fireEvent.click(within(column("Noise 3")).getByRole("button", { name: /^Mute/ }));
    fireEvent.click(within(column("Noise 3")).getByRole("button", { name: /^Solo/ }));
    drag(within(column("Main")).getByRole("slider"), -40);

    expect(inside().connections[0]).toMatchObject({ amount: 0.5, mute: true, solo: true });
    expect(inside().nodes.find((node) => node.id === mixer)?.params.level).toBe(0.75);
  });

  it("renames the mixer, and unpins it", () => {
    show();

    fireEvent.doubleClick(within(block()).getByText("Mixer"));
    const field = screen.getByRole("textbox", { name: "Name of Band › Mixer" });
    fireEvent.change(field, { target: { value: "Drums" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(store.getState().perform).toEqual([{ key: `${sub}/${mixer}`, name: "Drums" }]);

    fireEvent.click(screen.getByRole("button", { name: "Unpin Drums" }));
    expect(store.getState().perform).toEqual([]);
  });

  it("keeps the mixers apart from the knobs, each moving among its own", () => {
    store.getState().togglePinned(`${filter}.frequency`);
    store.getState().togglePinned(`${filter}.Q`);
    show();

    expect(within(screen.getByRole("list", { name: "Mixers" })).getByRole("group", { name: "Band › Mixer" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Pinned knobs" })).queryByRole("group")).toBeNull();

    fireEvent.keyDown(screen.getByRole("button", { name: "Move Filter › Q" }), { key: "ArrowLeft" });

    expect(store.getState().perform.map(({ key }) => key)).toEqual([`${sub}/${mixer}`, `${filter}.Q`, `${filter}.frequency`]);
  });
});
