import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import App from "./App";
import { AudioEngine } from "./audio/AudioEngine";
import { createPatchStore } from "./store/patchStore";
import { FakeAudioContext } from "./test/fakeAudioContext";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const setup = () => {
  const context = new FakeAudioContext();
  const engine = new AudioEngine(context.asAudioContext());
  const store = createPatchStore(engine);
  render(<App engine={engine} store={store} />);
  return { context, store, engine };
};

describe("App", () => {
  it("opens what Trama is from the logo", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "About Trama" }));

    expect(screen.getByRole("dialog", { name: "About Trama" })).toHaveTextContent("Version 0.1.0");
  });

  it("offers the guide to getting started while the patch is empty", async () => {
    const { store } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Getting started" }));

    expect(screen.getByRole("dialog", { name: "Getting started" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Getting started" })).toBeNull();

    act(() => {
      store.getState().addNode("oscillator", { x: 0, y: 0 });
    });
    expect(screen.queryByRole("button", { name: "Getting started" })).toBeNull();
  });

  it("opens the guide from the About too", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "About Trama" }));

    await userEvent.click(within(screen.getByRole("dialog", { name: "About Trama" })).getByRole("button", { name: "Getting started" }));

    expect(screen.getByRole("dialog", { name: "Getting started" })).toBeInTheDocument();
  });

  it("tells nothing about the browser unless it is not a tested one", () => {
    setup();
    expect(screen.queryByRole("status", { name: "Browser support" })).toBeNull();

    const context = new FakeAudioContext();
    const engine = new AudioEngine(context.asAudioContext());
    render(<App engine={engine} store={createPatchStore(engine)} browser="untested" />);

    expect(screen.getByRole("status", { name: "Browser support" })).toBeInTheDocument();
  });

  it("adds a module from the module menu", async () => {
    const { context, store } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Add module" }));
    await userEvent.click(screen.getByRole("option", { name: "Oscillator" }));

    expect(store.getState().nodes.map((node) => node.type)).toEqual(["oscillator"]);
    expect(context.oscillators).toHaveLength(1);
    expect(await screen.findByText("Oscillator", { selector: ".module-title" })).toBeInTheDocument();
  });

  it("offers every module type in the menu", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Add module" }));

    for (const name of ["Oscillator", "Noise", "Filter", "Gain", "Delay", "LFO", "ADSR", "Keyboard", "Arp", "Seq", "Output", "Scope"]) {
      expect(screen.getByRole("option", { name })).toBeInTheDocument();
    }
  });

  it("shows the name of the app", () => {
    setup();

    expect(screen.getByRole("heading", { level: 1, name: "Trama" })).toBeInTheDocument();
  });

  it("changes the theme from the header, keeping it for the next time", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Theme: system" }));
    await userEvent.click(screen.getByRole("button", { name: "Theme: light" }));

    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("trama:theme")).toBe("dark");
    localStorage.clear();
  });

  it("shows the title and author of the piece, edits them from its card, and names the tab after it", async () => {
    const { store } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Piece: Untitled" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Pluja a la finestra");
    await userEvent.type(screen.getByRole("textbox", { name: "Author" }), "Francesc");

    expect(store.getState().meta).toEqual({ title: "Pluja a la finestra", author: "Francesc" });
    expect(screen.getByRole("button", { name: "Piece: Pluja a la finestra, by Francesc" })).toBeInTheDocument();
    expect(document.title).toBe("Pluja a la finestra — Trama");
  });

  it("has the transport", () => {
    setup();

    expect(screen.getByRole("button", { name: "Start audio" })).toBeInTheDocument();
  });

  it("plays the keyboard module from the computer keyboard", async () => {
    const { context, store } = setup();
    store.getState().addNode("keyboard", { x: 0, y: 0 });

    await userEvent.keyboard("{g>}");

    expect(context.constantSources[0].offset.value).toBe(7 / 12);
  });

  it("has the patch file controls", () => {
    setup();

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
  });

  it("has the history controls", () => {
    setup();

    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo" })).toBeInTheDocument();
  });

  it("undoes from the keyboard", async () => {
    const { store } = setup();
    store.getState().addNode("gain", { x: 0, y: 0 });

    await userEvent.keyboard("{Control>}z{/Control}");

    expect(store.getState().nodes).toEqual([]);
  });

  it("opens and closes the composer from the header", async () => {
    const { store } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Composer" }));
    expect(screen.getByRole("region", { name: "Song panel" })).toBeInTheDocument();
    expect(store.getState().songPanel).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Composer" }));
    expect(screen.queryByRole("region", { name: "Song panel" })).not.toBeInTheDocument();
  });

  it("shows the tab of the composer picked, song or perform", async () => {
    const { store } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Composer" }));

    await userEvent.click(screen.getByRole("tab", { name: "Perform" }));
    expect(screen.getByRole("region", { name: "Perform panel" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Song panel" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Song" }));
    expect(screen.getByRole("region", { name: "Song panel" })).toBeInTheDocument();
    expect(store.getState().panelTab).toBe("song");
  });

  it("shows the panel full screen without the editor, the transport still on top, and back", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Composer" }));

    await userEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(document.querySelector(".react-flow")).toBeNull();
    expect(screen.getByRole("region", { name: "Song panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start audio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add module" })).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: "Perform" }));
    expect(screen.getByRole("region", { name: "Perform panel" })).toBeInTheDocument();
    expect(document.querySelector(".react-flow")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Exit full screen" }));
    expect(document.querySelector(".react-flow")).not.toBeNull();
  });

  it("leaves full screen with Escape, keeping the panel open", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Composer" }));
    await userEvent.click(screen.getByRole("button", { name: "Full screen" }));

    await userEvent.keyboard("{Escape}");

    expect(document.querySelector(".react-flow")).not.toBeNull();
    expect(screen.getByRole("region", { name: "Song panel" })).toBeInTheDocument();
  });

  it("brings the editor back looking where it did", async () => {
    const { store } = setup();
    store.getState().setEditorViewport({ x: 50, y: 30, zoom: 1.5 });
    await userEvent.click(screen.getByRole("button", { name: "Composer" }));
    await userEvent.click(screen.getByRole("button", { name: "Full screen" }));

    await userEvent.click(screen.getByRole("button", { name: "Exit full screen" }));

    expect(document.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform).toBe("translate(50px,30px) scale(1.5)");
  });

  it("leads the transport with the source, a block of joined buttons, then the composer", () => {
    setup();

    const source = screen.getByRole("radiogroup", { name: "Source" });
    const composer = screen.getByRole("button", { name: "Composer" });
    expect(source.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(composer.compareDocumentPosition(screen.getByRole("spinbutton", { name: "Tempo" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(source).toHaveClass("hw-group");
  });

  it("sets the piece in the middle of the header, and the module menu right after redo", () => {
    setup();

    const header = screen.getByRole("banner");
    const [, middle] = Array.from(header.children);
    expect(middle).toHaveAccessibleName(/^Piece:/);
    const redo = screen.getByRole("button", { name: "Redo" });
    const addModule = screen.getByRole("button", { name: "Add module" });
    expect(redo.compareDocumentPosition(addModule) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(addModule.closest(".app-header-side")).toBe(redo.closest(".app-header-side"));
  });

  it("lets the keys sound while stopped from a button right after play", () => {
    setup();

    const play = screen.getByRole("button", { name: "Start audio" });
    const sound = screen.getByRole("button", { name: "Sound without play" });
    expect(play.compareDocumentPosition(sound) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sound.compareDocumentPosition(screen.getByRole("button", { name: /^Theme:/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("picks the source in the header, next to the transport, with the panel closed", async () => {
    const { store } = setup();

    await userEvent.click(screen.getByRole("radio", { name: "Song" }));

    expect(store.getState().songMode).toBe(true);
    expect(screen.queryByRole("region", { name: "Song panel" })).not.toBeInTheDocument();
  });

  it("starts the song from the cursor in song mode", async () => {
    const { store, engine } = setup();
    store.getState().addNode("sequencer", { x: 0, y: 0 });
    const seq = store.getState().nodes[0].id;
    store.getState().setSongCell(seq, 1, "A3");

    await userEvent.click(screen.getByRole("button", { name: "Composer" }));
    await userEvent.click(screen.getByRole("button", { name: "Bar 2" }));
    await userEvent.click(screen.getByRole("radio", { name: "Song" }));
    await engine.start();

    expect(engine.getSongBar()).toBe(1);
    expect(engine.getPattern(seq)).toEqual({ playing: "A1", queued: "A3" });
    await engine.stop();
  });
});
