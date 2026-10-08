import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Profiler } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { displayEngine } from "../../test/displayEngine";
import { EngineContext, type DisplayEngine } from "../EngineContext";
import { SONG_FOLLOW_KEY, SongPanel } from "./SongPanel";

let store: ReturnType<typeof createPatchStore>;
let engine: DisplayEngine;
let seq: string;

beforeEach(() => {
  Element.prototype.setPointerCapture ??= () => {};
  store = createPatchStore({ sync: vi.fn() });
  seq = store.getState().addNode("sequencer", { x: 0, y: 0 }).id;
  store.getState().openSongPanel(true);
  engine = displayEngine();
});

const memory = (kept: Record<string, string> = {}) => ({
  getItem: (key: string) => kept[key] ?? null,
  setItem: (key: string, value: string) => {
    kept[key] = value;
  },
  kept,
});

const show = (storage = memory()) =>
  render(
    <PatchStoreContext value={store}>
      <EngineContext value={engine}>
        <SongPanel storage={storage} />
      </EngineContext>
    </PatchStoreContext>,
  );

const typeInto = async (name: string, value: string) => {
  await userEvent.dblClick(screen.getByRole("spinbutton", { name }));
  const field = screen.getByRole("textbox", { name });
  await userEvent.clear(field);
  await userEvent.type(field, `${value}{Enter}`);
};

const action = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: "More song actions" }));
  return screen.getByRole("menuitem", { name });
};

const cell = (name: string, bar: number) => screen.getByRole("button", { name: `${name}, bar ${bar}` });
const laneCell = (name: string, bar: number) => screen.getByRole("spinbutton", { name: `${name}, bar ${bar}` });
const lane = (key: string) => store.getState().song?.automation?.[key];

describe("SongPanel", () => {
  it("stays as it is when a knob of the patch changes, so that a long song does not slow the knob down", () => {
    const filter = store.getState().addNode("filter", { x: 0, y: 0 }).id;
    const renders = vi.fn();
    render(
      <PatchStoreContext value={store}>
        <EngineContext value={engine}>
          <Profiler id="song" onRender={renders}>
            <SongPanel />
          </Profiler>
        </EngineContext>
      </PatchStoreContext>,
    );
    renders.mockClear();

    act(() => store.getState().updateParam(filter, "frequency", 300));

    expect(renders).not.toHaveBeenCalled();
  });

  it("shows a row for each node with patterns, those inside subpatches too, and a column for each bar", () => {
    const sub = store.getState().addNode("subpatch", { x: 0, y: 0 }).id;
    store.getState().renameNode(sub, "Bass");
    store.getState().openSubpatch(sub);
    store.getState().addNode("clip", { x: 0, y: 0 });
    store.getState().addNode("oscillator", { x: 0, y: 0 });
    store.getState().closeSubpatch(0);
    show();

    const rows = screen.getAllByRole("rowheader").map((header) => header.textContent);
    expect(rows).toEqual(["Seq", "Bass › Clip"]);
    expect(within(screen.getByRole("table", { name: "Song" })).getAllByRole("columnheader")).toHaveLength(9);
  });

  it("goes from a dash to A1 and through its bank on each click of a cell, and clears it on a right click", () => {
    show();

    fireEvent.click(cell("Seq", 2));
    fireEvent.click(cell("Seq", 2));
    expect(store.getState().song?.rows[seq]).toBe("- A2 - - - - - -");
    expect(cell("Seq", 2)).toHaveTextContent("A2");

    fireEvent.contextMenu(cell("Seq", 2));
    expect(store.getState().song?.rows ?? {}).toEqual({});
  });

  it("changes the bank of a cell with a letter and its number with a digit, and clears it with a dash", () => {
    store.getState().setSongCell(seq, 0, "B3");
    show();

    fireEvent.keyDown(cell("Seq", 2), { key: "5" });
    expect(store.getState().song?.rows[seq]).toBe("B3 B5 - - - - - -");

    fireEvent.keyDown(cell("Seq", 2), { key: "d" });
    expect(store.getState().song?.rows[seq]).toBe("B3 D5 - - - - - -");

    fireEvent.keyDown(cell("Seq", 1), { key: "-" });
    expect(store.getState().song?.rows[seq]).toBe("- D5 - - - - - -");
  });

  it("stops the node with a dot, and leaves the bars after it empty", () => {
    store.getState().setSongCell(seq, 0, "B3");
    show();

    fireEvent.keyDown(cell("Seq", 3), { key: "." });

    expect(store.getState().song?.rows[seq]).toBe("B3 - . - - - - -");
    expect(cell("Seq", 3)).toHaveTextContent(".");
    expect(cell("Seq", 3)).toHaveAttribute("data-stop");
    expect(cell("Seq", 3)).not.toHaveAttribute("data-bank");
    expect(cell("Seq", 5)).toHaveTextContent("");
    expect(cell("Seq", 5)).not.toHaveAttribute("data-held");
    expect(cell("Seq", 5)).not.toHaveAttribute("data-bank");
  });

  it("keeps the keys typed on a cell from playing the computer keys", () => {
    const heard = vi.fn();
    window.addEventListener("keydown", heard);
    show();

    fireEvent.keyDown(cell("Seq", 2), { key: "d" });
    window.removeEventListener("keydown", heard);

    expect(heard).not.toHaveBeenCalled();
  });

  it("moves between the cells with the arrows", () => {
    store.getState().addNode("drums", { x: 0, y: 0 });
    show();
    cell("Seq", 2).focus();

    fireEvent.keyDown(cell("Seq", 2), { key: "ArrowRight" });
    expect(cell("Seq", 3)).toHaveFocus();
    fireEvent.keyDown(cell("Seq", 3), { key: "ArrowDown" });
    expect(cell("Drums", 3)).toHaveFocus();
    fireEvent.keyDown(cell("Drums", 3), { key: "ArrowLeft" });
    fireEvent.keyDown(cell("Drums", 2), { key: "ArrowUp" });
    expect(cell("Seq", 2)).toHaveFocus();
  });

  it("shows faint on each dash the pattern that goes on sounding", () => {
    store.getState().setSongCell(seq, 1, "A3");
    show();

    expect(cell("Seq", 4)).toHaveTextContent("A3");
    expect(cell("Seq", 4)).toHaveAttribute("data-held");
    expect(cell("Seq", 2)).not.toHaveAttribute("data-held");
  });

  it("marks each cell with the bank of its pattern, a dash with the one going on, for its colour", () => {
    store.getState().setSongCell(seq, 1, "C3");
    show();

    expect(cell("Seq", 2)).toHaveAttribute("data-bank", "C");
    expect(cell("Seq", 4)).toHaveAttribute("data-bank", "C");
    expect(cell("Seq", 1)).not.toHaveAttribute("data-bank");
  });

  it("moves the cursor with the bar numbers and the arrows", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Bar 5" }));
    expect(store.getState().songCursor).toBe(4);

    fireEvent.click(screen.getByRole("button", { name: "Next bar" }));
    expect(store.getState().songCursor).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "Previous bar" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous bar" }));
    expect(store.getState().songCursor).toBe(3);
    expect(screen.getByLabelText("Cursor")).toHaveTextContent("4");
  });

  it("shows a dot and Rec on its button, as the Rec of the piano roll", () => {
    show();

    const rec = screen.getByRole("button", { name: "Rec" });
    expect(rec).toHaveTextContent(/^Rec$/);
    expect(rec.querySelector("svg")).toBeInTheDocument();
  });

  it("shows a looping arrow and Loop on its button", () => {
    show();

    const loop = screen.getByRole("button", { name: "Loop" });
    expect(loop).toHaveTextContent(/^Loop$/);
    expect(loop.querySelector("svg")).toBeInTheDocument();
  });

  it("turns Rec on and off", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Rec" }));
    expect(store.getState().songRec).toBe(true);
    expect(screen.getByRole("button", { name: "Rec" })).toHaveAttribute("aria-pressed", "true");
  });

  it("fades the end out over the bars given, and tells there is no end while a loop goes round", async () => {
    show();
    expect(screen.getByRole("spinbutton", { name: "Fade" })).toHaveAttribute("aria-valuenow", "0");

    await typeInto("Fade", "2");
    expect(store.getState().song?.fade).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Loop" }));
    expect(screen.getByRole("spinbutton", { name: "Fade" })).toHaveAttribute("title", expect.stringMatching(/loop/i));
  });

  it("changes the number of bars, typed or with the arrow keys", async () => {
    show();

    await typeInto("Bars", "12");
    expect(store.getState().song?.bars).toBe(12);

    screen.getByRole("spinbutton", { name: "Bars" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(store.getState().song?.bars).toBe(13);
  });

  it("turns a loop on from the cursor, sets where it starts and how long it is, and turns it off", async () => {
    store.getState().setSongCursor(2);
    show();

    fireEvent.click(screen.getByRole("button", { name: "Loop" }));
    expect(store.getState().song?.loop).toEqual({ start: 2, length: 4 });

    await typeInto("Loop start", "2");
    await typeInto("Loop length", "3");
    expect(store.getState().song?.loop).toEqual({ start: 1, length: 3 });

    fireEvent.click(screen.getByRole("button", { name: "Loop" }));
    expect(store.getState().song).not.toHaveProperty("loop");
  });

  it("starts the song again from the pattern each node plays", () => {
    store.getState().setSongCell(seq, 3, "A4");
    engine = displayEngine({ getPattern: vi.fn(() => ({ playing: "A3" as const })) });
    show();

    fireEvent.click(action("From patterns"));

    expect(engine.getPattern).toHaveBeenCalledWith(seq);
    expect(store.getState().song?.rows).toEqual({ [seq]: "A3 - - - - - - -" });
  });

  it("marks the bar that plays", async () => {
    engine = displayEngine({ getSongBar: vi.fn(() => 2) });
    show();

    await waitFor(() => expect(screen.getByRole("button", { name: "Bar 3" })).toHaveAttribute("data-playing"));
    expect(screen.getByRole("button", { name: "Bar 2" })).not.toHaveAttribute("data-playing");
  });

  describe("following the bar that plays", () => {
    const BAR = 28;
    const NAMES = 100;
    let playing: number | undefined;

    const body = () => screen.getByRole("table", { name: "Song" }).parentElement!;

    const layOut = (width: number) => {
      Object.defineProperty(body(), "clientWidth", { value: width, configurable: true });
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const number = /^Bar (\d+)$/.exec(this.getAttribute("aria-label") ?? "")?.[1];
        const scrolled = body().scrollLeft;
        const [left, width] =
          number !== undefined ? [NAMES + (Number(number) - 1) * BAR - scrolled, BAR] : this.classList.contains("song-corner") ? [0, NAMES] : [0, 0];
        return { left, width, x: left, right: left + width, top: 0, bottom: 22, y: 0, height: 22, toJSON: () => ({}) };
      });
    };

    beforeEach(() => {
      playing = undefined;
      engine = displayEngine({ getSongBar: vi.fn(() => playing) });
      act(() => store.getState().setSongLength(32));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("turns the page when the bar that plays goes past the right edge, leaving it just after the names", async () => {
      show();
      layOut(400);

      playing = 9;
      await waitFor(() => expect(screen.getByRole("button", { name: "Bar 10" })).toHaveAttribute("data-playing"));
      expect(body().scrollLeft).toBe(0);

      playing = 10;
      await waitFor(() => expect(body().scrollLeft).toBe(10 * BAR));
    });

    it("goes back to the bar that plays when a loop goes round", async () => {
      show();
      layOut(400);
      body().scrollLeft = 20 * BAR;

      playing = 4;

      await waitFor(() => expect(body().scrollLeft).toBe(4 * BAR));
    });

    it("leaves the grid where it was scrolled while stopped", async () => {
      show();
      layOut(400);
      body().scrollLeft = 20 * BAR;

      await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

      expect(body().scrollLeft).toBe(20 * BAR);
    });

    it("follows unless this browser chose otherwise", () => {
      show();

      expect(screen.getByRole("button", { name: "Follow" })).toHaveAttribute("aria-pressed", "true");
    });

    it("stops following once turned off, and remembers it in this browser", async () => {
      const storage = memory();
      show(storage);
      layOut(400);

      await userEvent.click(screen.getByRole("button", { name: "Follow" }));
      playing = 20;
      await waitFor(() => expect(screen.getByRole("button", { name: "Bar 21" })).toHaveAttribute("data-playing"));

      expect(screen.getByRole("button", { name: "Follow" })).toHaveAttribute("aria-pressed", "false");
      expect(storage.kept[SONG_FOLLOW_KEY]).toBe("off");
      expect(body().scrollLeft).toBe(0);
    });

    it("starts as this browser left it", () => {
      show(memory({ [SONG_FOLLOW_KEY]: "off" }));

      expect(screen.getByRole("button", { name: "Follow" })).toHaveAttribute("aria-pressed", "false");
    });

    describe("its tooltip", () => {
      const follow = () => screen.getByRole("button", { name: "Follow" });

      beforeEach(() => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("tells what it is for once the pointer rests on it a moment", () => {
        show();

        fireEvent.pointerEnter(follow());
        expect(screen.queryByRole("tooltip")).toBeNull();
        act(() => vi.advanceTimersByTime(400));

        expect(screen.getByRole("tooltip")).toHaveTextContent(/bar that plays/);
        expect(screen.getByRole("tooltip")).toHaveTextContent(/On/);
        expect(follow()).toHaveAccessibleDescription(/bar that plays/);
        fireEvent.pointerLeave(follow());
        expect(screen.queryByRole("tooltip")).toBeNull();
      });

      it("tells it is off once turned off", () => {
        show(memory({ [SONG_FOLLOW_KEY]: "off" }));

        act(() => follow().focus());

        expect(screen.getByRole("tooltip")).toHaveTextContent(/Off/);
      });

      it("leaves no title of the browser over it", () => {
        show();

        expect(follow()).not.toHaveAttribute("title");
      });
    });

    it("goes to the bar that plays as soon as it is turned on again", async () => {
      show(memory({ [SONG_FOLLOW_KEY]: "off" }));
      layOut(400);
      playing = 20;
      await waitFor(() => expect(screen.getByRole("button", { name: "Bar 21" })).toHaveAttribute("data-playing"));

      await userEvent.click(screen.getByRole("button", { name: "Follow" }));

      await waitFor(() => expect(body().scrollLeft).toBe(20 * BAR));
    });
  });

  it("says how to start when there is no node with patterns", () => {
    act(() => store.getState().removeNode(seq));
    show();

    expect(screen.getByText(/Add a Seq, an Arp, Drums or a Clip/)).toBeInTheDocument();
  });

  it("goes to the perform tab, and leaves the source to the header", () => {
    show();

    expect(screen.getByRole("tab", { name: "Song" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Perform" }));

    expect(store.getState().panelTab).toBe("perform");
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("names what each group of the bar sets: the song and the loop", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Loop" }));
    expect(within(screen.getByRole("group", { name: "Loop" })).getByText("Length")).toBeInTheDocument();
  });

  it("opens the menu of the other actions, and closes it with Escape or after one", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "More song actions" }));
    expect(screen.getByRole("menu", { name: "Song actions" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(action("From patterns"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Close song" }));

    expect(store.getState().songPanel).toBe(false);
  });

  describe("controls", () => {
    let osc: string;

    beforeEach(() => {
      osc = store.getState().addNode("oscillator", { x: 0, y: 0 }).id;
    });

    it("shows a row for each control the song moves, marking the bars where it moves", () => {
      store.getState().recordTake(`${osc}.detune`, [{ beat: 5, value: 10 }, { beat: 6, value: 20 }], 5, 7);
      show();

      expect(screen.getByRole("rowheader", { name: /Oscillator › Detune/ })).toBeInTheDocument();
      expect(laneCell("Oscillator › Detune", 2)).toHaveAttribute("data-points");
      expect(laneCell("Oscillator › Detune", 1)).not.toHaveAttribute("data-points");
    });

    it("shows the value of each bar: on its first beat, or where it is first set in it, faint where it is held", () => {
      store.getState().setSongLength(4);
      store.getState().recordTake(`${osc}.detune`, [{ beat: 5, value: 10 }, { beat: 6, value: 20 }], 5, 7);
      show();

      expect(laneCell("Oscillator › Detune", 1)).toHaveTextContent(/^$/);
      expect(laneCell("Oscillator › Detune", 2)).toHaveTextContent("10");
      expect(laneCell("Oscillator › Detune", 3)).toHaveTextContent("20");
      expect(laneCell("Oscillator › Detune", 3)).toHaveAttribute("data-held");
      expect(laneCell("Oscillator › Detune", 3)).toHaveAttribute("aria-valuetext", "20 ct");
    });

    it("shows the value of each bar of the meter", () => {
      store.getState().setMeter([3]);
      store.getState().setSongLength(4);
      store.getState().recordTake(`${osc}.detune`, [{ beat: 3, value: 10 }, { beat: 5, value: 20 }, { beat: 6, value: 30 }], 3, 7);
      show();

      expect(laneCell("Oscillator › Detune", 1)).toHaveTextContent(/^$/);
      expect(laneCell("Oscillator › Detune", 2)).toHaveTextContent("10");
      expect(laneCell("Oscillator › Detune", 3)).toHaveTextContent("30");
    });

    it("shows big values short, the whole value in its title", () => {
      const filter = store.getState().addNode("filter", { x: 0, y: 0 }).id;
      store.getState().setControlPoint(`${filter}.frequency`, 0, 1200);
      show();

      expect(laneCell("Filter › Freq", 1)).toHaveTextContent("1.2k");
      expect(laneCell("Filter › Freq", 1)).toHaveAttribute("title", expect.stringMatching(/^1200 Hz/));
    });

    it("fills each cell as far as its value goes along the range of its knob, and leaves empty those with none", () => {
      const filter = store.getState().addNode("filter", { x: 0, y: 0 }).id;
      store.getState().setControlPoint(`${filter}.frequency`, 4, 200);
      show();

      const fill = (bar: number) => laneCell("Filter › Freq", bar).style.getPropertyValue("--fill");
      expect(fill(1)).toBe("");
      expect(Number(fill(2))).toBeCloseTo(1 / 3, 3);
      expect(Number(fill(3))).toBeCloseTo(1 / 3, 3);
    });

    it("sets a value on the first beat of a bar with the arrow keys, held until the next point", () => {
      store.getState().setSongLength(4);
      store.getState().setControlPoint(`${osc}.detune`, 0, 20);
      show();

      fireEvent.keyDown(laneCell("Oscillator › Detune", 3), { key: "ArrowUp" });

      expect(lane(`${osc}.detune`)).toBe("0:20 8:21");
    });

    it("sets a typed value, starting from that of the patch before the first point", async () => {
      store.getState().setControlPoint(`${osc}.detune`, 8, 20);
      show();

      await userEvent.dblClick(laneCell("Oscillator › Detune", 1));
      const field = screen.getByRole("textbox", { name: "Oscillator › Detune, bar 1" });
      expect(field).toHaveValue("0");
      await userEvent.clear(field);
      await userEvent.type(field, "-30{Enter}");

      expect(lane(`${osc}.detune`)).toBe("0:-30 8:20");
    });

    it("clears the points of a bar with a right click or the delete key", () => {
      store.getState().recordTake(`${osc}.detune`, [{ beat: 0, value: 1 }, { beat: 4, value: 2 }, { beat: 9, value: 3 }], 0, 10);
      show();

      fireEvent.contextMenu(laneCell("Oscillator › Detune", 2));
      expect(lane(`${osc}.detune`)).toBe("0:1 9:3");

      fireEvent.keyDown(laneCell("Oscillator › Detune", 3), { key: "Delete" });
      expect(lane(`${osc}.detune`)).toBe("0:1");
    });

    it("moves between the cells of a lane with the left and right keys", () => {
      store.getState().setControlPoint(`${osc}.detune`, 0, 5);
      show();
      laneCell("Oscillator › Detune", 1).focus();

      fireEvent.keyDown(laneCell("Oscillator › Detune", 1), { key: "ArrowRight" });

      expect(laneCell("Oscillator › Detune", 2)).toHaveFocus();
      expect(lane(`${osc}.detune`)).toBe("0:5");
    });

    it("shows a mute or a solo as on or off", () => {
      const mixer = store.getState().addNode("mixer", { x: 0, y: 0 }).id;
      const channel = store.getState().connect({ nodeId: osc, port: "audio" }, { nodeId: mixer, port: "audio" })!.id;
      store.getState().setControlPoint(`${channel}.mute`, 0, 1);
      store.getState().setControlPoint(`${channel}.mute`, 4, 0);
      show();

      expect(laneCell("Mixer › Oscillator 2 mute", 1)).toHaveTextContent("On");
      expect(laneCell("Mixer › Oscillator 2 mute", 2)).toHaveTextContent("Off");
    });

    it("adds a lane for a control, on its value in the patch, from a search of the controls", async () => {
      const filter = store.getState().addNode("filter", { x: 0, y: 0 }).id;
      store.getState().updateParam(filter, "frequency", 800);
      store.getState().setControlPoint(`${osc}.detune`, 0, 5);
      show();

      await userEvent.click(screen.getByRole("button", { name: "Add a control" }));
      const menu = screen.getByRole("dialog", { name: "Add a control" });
      expect(within(menu).queryByRole("button", { name: "Oscillator › Detune" })).not.toBeInTheDocument();
      await userEvent.type(within(menu).getByRole("searchbox", { name: "Search controls" }), "filter freq");
      await userEvent.click(within(menu).getByRole("button", { name: "Filter › Freq" }));

      expect(lane(`${filter}.frequency`)).toBe("0:800");
      expect(screen.queryByRole("dialog", { name: "Add a control" })).not.toBeInTheDocument();
    });

    it("adds the best match with Enter", async () => {
      const filter = store.getState().addNode("filter", { x: 0, y: 0 }).id;
      show();

      await userEvent.click(screen.getByRole("button", { name: "Add a control" }));
      await userEvent.type(screen.getByRole("searchbox", { name: "Search controls" }), "filter › q{Enter}");

      expect(lane(`${filter}.Q`)).toBeDefined();
    });

    it("takes a control out of the song", () => {
      store.getState().setControlPoint(`${osc}.detune`, 0, 5);
      show();

      fireEvent.click(screen.getByRole("button", { name: "Remove Oscillator › Detune" }));

      expect(store.getState().song).not.toHaveProperty("automation");
    });

    it("copies the controls touched over the loop or the whole song", () => {
      store.getState().setSongLoop({ start: 1, length: 1 });
      store.getState().touchControl(`${osc}.detune`, 7);
      show();

      fireEvent.click(action("Copy to loop"));
      expect(store.getState().song?.automation?.[`${osc}.detune`]).toBe("4:7");

      fireEvent.click(action("Copy to song"));
      expect(store.getState().song?.automation?.[`${osc}.detune`]).toBe("0:7");
    });

    it("has nothing to copy until a control is touched, nor a loop to copy over without one", () => {
      show();

      expect(action("Copy to loop")).toBeDisabled();
      expect(screen.getByRole("menuitem", { name: "Copy to song" })).toBeDisabled();

      act(() => store.getState().touchControl(`${osc}.detune`, 7));
      expect(screen.getByRole("menuitem", { name: "Copy to loop" })).toBeDisabled();
      expect(screen.getByRole("menuitem", { name: "Copy to song" })).toBeEnabled();
    });
  });
});
